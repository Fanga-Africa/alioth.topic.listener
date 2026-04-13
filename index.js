const { db, initDB } = require('./server/db');
const { seedTopics } = require('./server/seed');
const { WebSocketServer } = require('ws');

const logsRoute = require('./server/routes/logs');
const topicsRoute = require('./server/routes/topics');

// ===== 1. IMPORTS =====
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Client } = require('@stomp/stompjs');
// ======= WebSocket pour STOMP ======
const WebSocket = require('ws');

// ===== 2. EXPRESS SERVER =====
const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  console.log("🔌 Client connecté");

  clients.add(ws);

  ws.on('close', () => {
    console.log("Client déconnecté");
    clients.delete(ws);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);

  clients.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(message);
    }
  });
}

app.use(express.json());
app.use(express.static('public'));

app.use('/api/logs', logsRoute);
app.use('/api/topics', topicsRoute);
// Route test
app.get('/api/test', (req, res) => {
  res.json({ message: "API OK " });
});

// ===== 3. STOMP LISTENER =====
function startStomp() {
  const client = new Client({
    webSocketFactory: () =>
      new WebSocket('wss://api.link2digit.com/link2digit/websocket/connect'),
    reconnectDelay: 5000,
    debug: (str) => console.log('[STOMP]', str),
  });

  client.onConnect = () => {
    console.log(' Connected to STOMP Broker');

    const destinations = [
      '/topics/events/swap-stations/0167c645-03d9-479c-945c-f7c8ea542576',
      '/topics/events/batteries/52f1e989-3439-46c7-bfeb-035ae9aa0dc7',
    ];

    destinations.forEach((dest) => {
      client.subscribe(dest, async (message) => {
          const now = new Date().toISOString();
          const category = dest.includes('swap-stations')
            ? 'station'
            : dest.includes('batteries')
              ? 'battery'
              : 'custom';

          try {
            await db.execute({
              sql: `
                INSERT INTO logs (topic_id, category, destination, headers, body, received_at)
                VALUES (?, ?, ?, ?, ?, ?)
              `,
              args: [
                null,
                category,
                dest,
                JSON.stringify(message.headers),
                message.body,
                now,
              ],
            });

            broadcast({
                type: "log",
                data: {
                  category,
                  destination: dest,
                  body: message.body,
                  received_at: now
                }
              });

            console.log(" Log sauvegardé !");
          } catch (err) {
            console.error(" Erreur DB:", err.message);
          }

          // affichage console (tu gardes)
          console.log(` Event on: ${dest}`);
  });

      console.log(' Subscribed to:', dest);
    });
  };

  client.onStompError = (frame) => {
    console.error(' Broker error:', frame.headers['message']);
    console.error('Details:', frame.body);
  };

  client.activate();
}

// ===== 4. START SERVER =====
const PORT = process.env.PORT || 3000;

async function start() {
  await initDB();
  await seedTopics();

  server.listen(PORT, () => {
    console.log(` Server running on http://localhost:${PORT}`);

    startStomp();
  });
}

start();
