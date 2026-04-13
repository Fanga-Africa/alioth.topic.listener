# Cahier de Charge — Fanga Station Log Viewer

**Projet :** Fanga Station Log Viewer  
**Version :** 1.0  
**Date :** 13 avril 2026  
**Architecture :** Monolithe (front-end + back-end dans un seul projet Node.js)

---

## 1. Présentation du Projet

### 1.1 Contexte

`fanga-station-listener` est un service Node.js qui se connecte à un broker STOMP/WebSocket (`wss://api.link2digit.com`) et écoute en temps réel les événements publiés sur des topics. Ces événements sont des messages JSON décrivant l'état des **stations de swap** et des **batteries**.

Aujourd'hui, les logs sont uniquement affichés dans la console (`console.log`). Le projet doit évoluer vers :

- Un **serveur web monolithe** (Express.js) qui sert le front-end et expose une API.
- Une **interface web professionnelle** (HTML/Tailwind CSS) affichant les logs en temps réel.
- Un **stockage persistant** dans **Turso** (base SQLite edge).
- Un **système de gestion des topics** : 2 topics seeds + ajout dynamique par l'utilisateur.

### 1.2 Objectifs Fonctionnels

| # | Fonctionnalité |
|---|----------------|
| F1 | Lecture et affichage des logs JSON en temps réel (JSON Reader Pro) |
| F2 | Stockage de chaque log avec horodatage précis dans Turso |
| F3 | Filtrage des logs par date (plage ou date exacte) |
| F4 | Séparation visuelle : onglet **Stations** / onglet **Batteries** |
| F5 | 2 topics pré-configurés en seed (stations + batteries) |
| F6 | L'utilisateur peut ajouter de nouveaux topics depuis l'interface |
| F7 | Les topics ajoutés sont persistés dans Turso |
| F8 | Interface UI professionnelle avec Tailwind CSS |

---

## 2. Architecture Technique

### 2.1 Vue Globale — Monolithe

```
fanga-station-listener/
├── index.js              ← Point d'entrée principal (STOMP listener + serveur Express)
├── server/
│   ├── db.js             ← Client Turso (libsql)
│   ├── routes/
│   │   ├── logs.js       ← API REST : GET /api/logs
│   │   └── topics.js     ← API REST : GET/POST /api/topics
│   └── seed.js           ← Insertion des 2 topics par défaut
├── public/
│   ├── index.html        ← Interface utilisateur (HTML + Tailwind)
│   ├── app.js            ← Logique front-end (WebSocket client, rendu JSON)
│   └── style.css         ← Styles complémentaires (optionnel)
├── package.json
└── .env                  ← Variables d'environnement (Turso URL + Token)
```

> **Règle d'or :** Un seul processus Node.js fait tourner à la fois le listener STOMP (côté back) et le serveur HTTP/WebSocket (côté front). Pas de microservices, pas de process séparés.

---

## 3. Turso — Base de Données

### 3.1 Qu'est-ce que Turso ?

[Turso](https://turso.tech) est une base de données **SQLite distribuée** hébergée en edge, conçue pour les applications modernes. Elle repose sur **libSQL**, un fork open-source de SQLite avec des extensions réseau.

**Pourquoi Turso ici ?**

| Critère | Avantage |
|---------|----------|
| Légèreté | SQLite = zéro configuration, zéro serveur de BDD à maintenir |
| Edge-ready | Latence ultra-faible, réplication mondiale optionnelle |
| SDK Node.js | `@libsql/client` — une seule dépendance, API async/await simple |
| Gratuit | Tier gratuit généreux (500 DB, 9 Go de stockage) |
| Sécurité | Connexion via token JWT, HTTPS obligatoire |

### 3.2 Configuration Turso

1. Créer un compte sur [https://turso.tech](https://turso.tech)
2. Installer le CLI : `npm install -g @turso/cli`
3. Créer une base de données :
   ```bash
   turso db create fanga-logs
   turso db show fanga-logs          # récupère l'URL
   turso db tokens create fanga-logs # génère le token d'auth
   ```
4. Renseigner le fichier `.env` :
   ```env
   TURSO_URL=libsql://fanga-logs-<username>.turso.io
   TURSO_AUTH_TOKEN=<token_jwt>
   PORT=3000
   ```

### 3.3 Schéma de la Base de Données

#### Table `topics`

Stocke les topics STOMP à écouter.

```sql
CREATE TABLE IF NOT EXISTS topics (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,           -- Nom lisible ex: "Stations de Swap"
  category  TEXT    NOT NULL,           -- "station" | "battery" | "custom"
  destination TEXT  NOT NULL UNIQUE,   -- Le chemin STOMP ex: /topics/events/...
  is_seed   INTEGER NOT NULL DEFAULT 0, -- 1 si topic par défaut
  created_at TEXT   NOT NULL            -- ISO 8601 ex: 2026-04-13T10:00:00.000Z
);
```

#### Table `logs`

Stocke chaque message reçu sur les topics.

```sql
CREATE TABLE IF NOT EXISTS logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id    INTEGER NOT NULL REFERENCES topics(id),
  category    TEXT    NOT NULL,   -- "station" | "battery" | "custom"
  destination TEXT    NOT NULL,   -- Topic destination source
  headers     TEXT    NOT NULL,   -- JSON.stringify(message.headers)
  body        TEXT    NOT NULL,   -- JSON brut du message
  received_at TEXT    NOT NULL    -- ISO 8601 précis : 2026-04-13T10:23:45.123Z
);
```

> `received_at` est généré côté serveur au moment exact de la réception du message STOMP, avec `new Date().toISOString()`. Jamais côté client.

---

## 4. WebSocket & STOMP — Architecture Détaillée

### 4.1 Principe Général

Le projet utilise **deux couches WebSocket distinctes** qui ne doivent pas être confondues :

```
[Broker STOMP distant]              [Serveur Node.js]              [Navigateur]
wss://api.link2digit.com  ←STOMP→  index.js (listener)  ←WS→  public/app.js
```

### 4.2 Couche 1 — STOMP vers le Broker distant (existant)

C'est le code actuel de `index.js`. Le client `@stomp/stompjs` :

1. Ouvre une connexion WebSocket vers `wss://api.link2digit.com/link2digit/websocket/connect`
2. Envoie un **CONNECT** conforme au protocole STOMP 1.2
3. Souscrit aux topics configurés (chargés depuis Turso au démarrage)
4. Reçoit des **frames MESSAGE** contenant un `body` JSON et des `headers`
5. À chaque message reçu :
   - Insère le log dans Turso (table `logs`)
   - Diffuse le log à tous les clients web connectés via le WebSocket interne

**Flux STOMP détaillé :**

```
Client → CONNECT (host, login, passcode optionnels)
Broker → CONNECTED (session, server)
Client → SUBSCRIBE (id, destination, ack:auto)
Broker → MESSAGE (destination, message-id, subscription, body)
Client → UNSUBSCRIBE (id) [si suppression de topic]
Client → DISCONNECT
```

**Chargement dynamique des topics depuis Turso :**

Au démarrage du serveur, avant d'activer le client STOMP :
```javascript
// server/db.js expose: getAllTopics()
const topics = await getAllTopics(); // SELECT * FROM topics
topics.forEach(topic => {
  client.subscribe(topic.destination, (message) => {
    handleMessage(topic, message);
  });
});
```

Quand un utilisateur ajoute un nouveau topic via l'interface, le back-end :
1. Insère le topic dans Turso
2. Souscrit **immédiatement** au nouveau topic sans redémarrer le serveur
3. Diffuse la mise à jour à tous les clients web

### 4.3 Couche 2 — WebSocket interne (Serveur → Navigateur)

Un serveur WebSocket (`ws`) est monté sur le même port qu'Express pour pousser en temps réel les logs vers le navigateur.

**Pourquoi un WebSocket interne et pas SSE ou polling ?**

| Technique | Avantage | Inconvénient |
|-----------|----------|--------------|
| HTTP Polling | Simple | Latence, charge serveur |
| SSE | Simple, natif | Unidirectionnel seulement |
| **WebSocket** | Bidirectionnel, temps réel, bas latence | Légèrement plus complexe |

> On choisit WebSocket car l'interface doit aussi **envoyer** des actions au serveur (ajout de topic, demande de souscription dynamique).

**Protocole de messages (JSON) entre serveur et navigateur :**

```jsonc
// Serveur → Navigateur : nouveau log
{
  "type": "log",
  "data": {
    "id": 42,
    "topic_id": 1,
    "category": "station",
    "destination": "/topics/events/swap-stations/0167c645-...",
    "headers": { "message-id": "...", "subscription": "..." },
    "body": { /* JSON parsé */ },
    "received_at": "2026-04-13T10:23:45.123Z"
  }
}

// Serveur → Navigateur : nouveau topic ajouté
{
  "type": "topic_added",
  "data": { "id": 3, "name": "...", "destination": "...", "category": "custom" }
}

// Navigateur → Serveur : demande d'ajout de topic
{
  "type": "add_topic",
  "data": { "name": "Mon Topic", "destination": "/topics/events/...", "category": "custom" }
}
```

**Gestion de la connexion côté serveur :**

```javascript
// Montage du WS sur le même serveur HTTP qu'Express
const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ server: httpServer });

const clients = new Set(); // pool de connexions actives

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('message', (raw) => handleClientMessage(JSON.parse(raw)));
});

// Broadcast à tous les clients connectés
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  clients.forEach(ws => {
    if (ws.readyState === ws.OPEN) ws.send(msg);
  });
}
```

---

## 5. Seed — Topics par Défaut

Les deux topics existants dans `index.js` sont les seeds. Ils sont insérés une seule fois au démarrage (INSERT OR IGNORE).

```javascript
// server/seed.js
const SEED_TOPICS = [
  {
    name: 'Stations de Swap',
    category: 'station',
    destination: '/topics/events/swap-stations/0167c645-03d9-479c-945c-f7c8ea542576',
    is_seed: 1,
  },
  {
    name: 'Batteries',
    category: 'battery',
    destination: '/topics/events/batteries/52f1e989-3439-46c7-bfeb-035ae9aa0dc7',
    is_seed: 1,
  },
];
```

Commande SQL utilisée :
```sql
INSERT OR IGNORE INTO topics (name, category, destination, is_seed, created_at)
VALUES (?, ?, ?, ?, ?);
```

---

## 6. API REST

### `GET /api/logs`

Récupère les logs avec filtres optionnels.

**Query params :**

| Param | Type | Description |
|-------|------|-------------|
| `category` | `station` \| `battery` \| `custom` | Filtrer par catégorie |
| `topic_id` | integer | Filtrer par topic |
| `date_from` | ISO 8601 | Début de plage (ex: `2026-04-13T00:00:00.000Z`) |
| `date_to` | ISO 8601 | Fin de plage (ex: `2026-04-13T23:59:59.999Z`) |
| `limit` | integer | Nombre max de résultats (défaut: 100) |
| `offset` | integer | Pagination (défaut: 0) |

**Exemple de requête :**
```
GET /api/logs?category=station&date_from=2026-04-13T00:00:00Z&limit=50
```

**Réponse :**
```json
{
  "total": 312,
  "logs": [
    {
      "id": 42,
      "category": "station",
      "destination": "/topics/events/swap-stations/...",
      "headers": { "message-id": "abc-123" },
      "body": { "stationId": "...", "status": "ONLINE" },
      "received_at": "2026-04-13T10:23:45.123Z"
    }
  ]
}
```

### `GET /api/topics`

Retourne tous les topics enregistrés.

```json
[
  { "id": 1, "name": "Stations de Swap", "category": "station", "destination": "...", "is_seed": 1 },
  { "id": 2, "name": "Batteries", "category": "battery", "destination": "...", "is_seed": 1 }
]
```

### `POST /api/topics`

Ajoute un nouveau topic et souscrit immédiatement.

**Body JSON :**
```json
{
  "name": "Nouveau Topic",
  "destination": "/topics/events/custom/xxxx-yyyy",
  "category": "custom"
}
```

**Validation côté serveur :**
- `name` : non vide, max 100 chars
- `destination` : commence par `/topics/`, non vide, max 255 chars
- `category` : valeur parmi `station`, `battery`, `custom`
- Unicité de `destination` vérifiée avant insertion

**Réponse 201 :**
```json
{ "id": 3, "name": "Nouveau Topic", "destination": "...", "category": "custom", "is_seed": 0 }
```

---

## 7. Interface Utilisateur — JSON Reader Pro

### 7.1 Principes de Design

- **Framework CSS :** Tailwind CSS (via CDN pour simplicité monolithe)
- **Style :** Dark theme professionnel (inspiré de JSON viewers modernes)
- **Typographie :** Police monospace pour les payloads JSON (`font-mono`)
- **Responsive :** Desktop-first (dashboard de monitoring)

### 7.2 Layout Principal

```
┌─────────────────────────────────────────────────────────────────┐
│  FANGA LOG VIEWER          [● CONNECTED]        [13 avr. 2026]  │  ← Header
├────────────────────┬────────────────────────────────────────────┤
│                    │  [ Stations ] [ Batteries ] [ Custom ]     │  ← Onglets
│  TOPICS            ├────────────────────────────────────────────┤
│  ───────           │  FILTRES                                    │
│  ✓ Stations (seed) │  [Date début ────────] [Date fin ────────] │  ← Filtres
│  ✓ Batteries(seed) │  [Topic ▼] [Appliquer]  [Réinitialiser]    │
│  + custom...       ├────────────────────────────────────────────┤
│                    │  LOG #42   station   10:23:45.123          │
│  ───────           │  ▼ /topics/events/swap-stations/...        │
│  [+ Ajouter Topic] │  {                                          │
│                    │    "stationId": "abc",                      │
│                    │    "status": "ONLINE",                      │
│                    │    "battery": 87                            │
│                    │  }                                          │
│                    │  ────────────────────────────────────────── │
│                    │  LOG #41   battery   10:23:40.001          │
│                    │  ▶ /topics/events/batteries/...  [collapsed]│
└────────────────────┴────────────────────────────────────────────┘
```

### 7.3 Composants Clés

#### a) Indicateur de connexion

- Point vert animé `● CONNECTED` si le WebSocket interne est connecté
- Point rouge `● DISCONNECTED` avec tentative de reconnexion automatique

#### b) Onglets de catégories

```html
<div class="tabs">
  <button data-tab="station">Stations <span class="badge">12</span></button>
  <button data-tab="battery">Batteries <span class="badge">8</span></button>
  <button data-tab="custom">Custom <span class="badge">0</span></button>
  <button data-tab="all">Tous</button>
</div>
```
Le badge affiche le nombre de logs reçus depuis l'ouverture de la session.

#### c) JSON Reader Pro — Affichage des logs

Chaque log est une carte collapsible. Le body JSON est affiché avec coloration syntaxique :

- **Clés** : couleur bleue (`text-blue-400`)
- **Strings** : couleur verte (`text-green-400`)
- **Nombres** : couleur orange (`text-orange-400`)
- **Booléens/null** : couleur violette (`text-purple-400`)

Le rendu JSON est fait en JavaScript pur (pas de lib externe) via une fonction `prettyJSON(obj)` qui génère du HTML balisé.

```javascript
// public/app.js
function prettyJSON(obj, indent = 0) {
  // Rendu récursif avec spans colorés
  // Gère : objects, arrays, strings, numbers, booleans, null
}
```

#### d) Filtres par date

```html
<input type="datetime-local" id="dateFrom" />
<input type="datetime-local" id="dateTo" />
<button onclick="applyFilters()">Appliquer</button>
```

Quand l'utilisateur applique un filtre :
1. Appel `GET /api/logs?date_from=...&date_to=...&category=...`
2. Remplacement du contenu de la liste par les résultats filtrés
3. Les nouveaux logs temps réel continuent d'arriver via WebSocket

#### e) Modal — Ajout de Topic

```
┌──────────────────────────────────────┐
│  Ajouter un nouveau topic            │
│                                      │
│  Nom         [________________]      │
│  Destination [/topics/events/______] │
│  Catégorie   [ station ▼ ]           │
│                                      │
│  [Annuler]            [Enregistrer]  │
└──────────────────────────────────────┘
```

Flux :
1. L'utilisateur remplit le formulaire
2. `POST /api/topics` est appelé
3. Le serveur insère dans Turso + souscrit au topic STOMP
4. Le serveur broadcast `{ type: "topic_added", data: {...} }` à tous les clients WS
5. La sidebar se met à jour en temps réel

---

## 8. Dépendances du Projet

```json
{
  "dependencies": {
    "@stomp/stompjs": "^7.3.0",
    "ws": "^8.20.0",
    "express": "^4.18.0",
    "@libsql/client": "^0.14.0",
    "dotenv": "^16.4.0"
  }
}
```

> **Aucune dépendance front-end.** Tailwind CSS est chargé via CDN dans le HTML. Le JSON viewer est du JS pur.

---

## 9. Démarrage et Initialisation du Serveur

L'`index.js` remanié suit cet ordre de démarrage :

```
1. Charger les variables d'env (.env)
2. Initialiser le client Turso (server/db.js)
3. Créer les tables SQL si elles n'existent pas (CREATE TABLE IF NOT EXISTS)
4. Insérer les seeds (INSERT OR IGNORE)
5. Charger tous les topics depuis Turso
6. Créer le serveur Express + serveur HTTP
7. Démarrer le serveur WebSocket interne (wss)
8. Activer le client STOMP → souscrire aux topics chargés
9. Écouter sur le PORT configuré
```

---

## 10. Sécurité

| Risque | Mesure |
|--------|--------|
| Injection SQL | Utilisation exclusive des requêtes paramétrées `db.execute({ sql, args })` |
| XSS | Le JSON est affiché via `textContent` ou HTML échappé, jamais `innerHTML` brut |
| Validation des inputs | Validation côté serveur avant toute insertion en base |
| Token Turso | Stocké dans `.env`, jamais exposé au client front-end |
| STOMP destination | Validation du format `/topics/` avant souscription |

---

## 11. Récapitulatif des Fichiers à Créer

| Fichier | Rôle |
|---------|------|
| `index.js` | Point d'entrée : Express + WS + STOMP listener |
| `server/db.js` | Initialisation Turso, CREATE TABLE, fonctions CRUD |
| `server/seed.js` | Insertion des 2 topics par défaut |
| `server/routes/logs.js` | Route `GET /api/logs` |
| `server/routes/topics.js` | Routes `GET/POST /api/topics` |
| `public/index.html` | Interface HTML avec Tailwind CSS |
| `public/app.js` | Logique front : WS client, JSON renderer, filtres |
| `.env` | `TURSO_URL`, `TURSO_AUTH_TOKEN`, `PORT` |
| `package.json` | Dépendances mises à jour |
