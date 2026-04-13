const { Client } = require('@stomp/stompjs');
const WebSocket = require('ws');

const client = new Client({
  webSocketFactory: () =>
    new WebSocket('wss://api.link2digit.com/link2digit/websocket/connect'),
  reconnectDelay: 5000,
  debug: (str) => {
    console.log('[STOMP]', str);
  },
});

client.onConnect = () => {
  console.log('Connected to WebSocket');

  const destinations = [
    '/topics/events/swap-stations/0167c645-03d9-479c-945c-f7c8ea542576',
    '/topics/events/batteries/52f1e989-3439-46c7-bfeb-035ae9aa0dc7',
  ];

  destinations.forEach((dest) => {
    client.subscribe(dest, (message) => {
      console.log(`--- Event on [${dest}] ---`);
      console.log('Headers:', message.headers);
      console.log('Body:', message.body);
    });
    console.log('Subscribed to:', dest);
  });
};

client.onStompError = (frame) => {
  console.error('Broker error:', frame.headers['message']);
  console.error('Details:', frame.body);
};

client.activate();