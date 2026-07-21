/*
  Chroniques d'Astréa — Serveur multijoueur (V34)
  -------------------------------------------------
  - Comptes joueurs (inscription / connexion) avec mots de passe hashés.
  - Système d'amis : recherche par pseudo, demandes envoyées/reçues, liste d'amis, présence en ligne.
  - Messagerie directe entre amis avec notification en temps réel.
  - Duels amicaux : défi -> Accepter/Décliner -> partie en direct.
  - Matchmaking multijoueur : file d'attente qui apparie deux joueurs en ligne.
  - Relais des parties en direct (le client "hôte" fait autorité sur la partie, le client "invité"
    envoie ses actions et reçoit l'état de jeu complet après chaque action).

  Démarrage : `npm install` puis `npm start` (ou `node server.js`) depuis ce dossier.
  Le serveur sert aussi le jeu lui-même : ouvrez http://localhost:3000 (ou le port choisi).
*/

const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const GAME_ROOT = path.join(__dirname, "..");

// ---------------------------------------------------------------------------
// Petite base de données JSON persistée sur disque (suffisant pour ce jeu).
// ---------------------------------------------------------------------------
function loadDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      users: parsed.users || {},
      friendRequests: parsed.friendRequests || [],
      friendships: parsed.friendships || [],
      messages: parsed.messages || [],
      reports: parsed.reports || []
    };
  } catch (_) {
    return { users: {}, friendRequests: [], friendships: [], messages: [], reports: [] };
  }
}

let db = loadDb();
let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  }, 150);
}

function normalizeUsername(name) { return String(name || "").trim().toLowerCase(); }
function isValidUsername(name) { return /^[a-zA-Z0-9_]{3,20}$/.test(name || ""); }
function areFriends(a, b) {
  return db.friendships.some(pair => (pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a));
}
function findFriendRequest(from, to) {
  return db.friendRequests.find(r => r.from === from && r.to === to);
}
function publicUser(key) {
  const user = db.users[key];
  return user ? { username: user.username } : null;
}

// ---------------------------------------------------------------------------
// Sessions en mémoire (token -> username). Perdues si le serveur redémarre :
// les joueurs devront simplement se reconnecter.
// ---------------------------------------------------------------------------
const sessions = new Map(); // token -> usernameKey
const onlineSockets = new Map(); // usernameKey -> ws

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const userKey = token && sessions.get(token);
  if (!userKey || !db.users[userKey]) return res.status(401).json({ error: "Non authentifié." });
  req.userKey = userKey;
  req.username = db.users[userKey].username;
  next();
}

function broadcastToFriends(userKey, payload) {
  db.friendships.forEach(pair => {
    if (pair[0] === userKey || pair[1] === userKey) {
      const other = pair[0] === userKey ? pair[1] : pair[0];
      sendTo(other, payload);
    }
  });
}

function sendTo(userKey, payload) {
  const ws = onlineSockets.get(userKey);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Application HTTP
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: "512kb" }));

// Empêche l'exposition du dossier serveur (code source, base de données, mots de passe hashés).
app.use((req, res, next) => {
  if (req.path.startsWith("/server")) return res.status(404).end();
  next();
});

// Sert le jeu (index.html, style.css, game.js, audio, images, etc.)
app.use(express.static(GAME_ROOT));

app.post("/api/register", (req, res) => {
  const rawUsername = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!isValidUsername(rawUsername)) {
    return res.status(400).json({ error: "Pseudo invalide (3 à 20 caractères : lettres, chiffres, _)." });
  }
  if (password.length < 4) return res.status(400).json({ error: "Mot de passe trop court (4 caractères minimum)." });
  const key = normalizeUsername(rawUsername);
  if (db.users[key]) return res.status(409).json({ error: "Ce pseudo est déjà pris." });

  const passwordHash = bcrypt.hashSync(password, 10);
  db.users[key] = { username: rawUsername, passwordHash, createdAt: Date.now(), progress: null, progressUpdatedAt: null };
  saveDb();

  const token = crypto.randomUUID();
  sessions.set(token, key);
  res.json({ token, username: rawUsername });
});

app.post("/api/login", (req, res) => {
  const rawUsername = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const key = normalizeUsername(rawUsername);
  const user = db.users[key];
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: "Pseudo ou mot de passe incorrect." });
  }
  const token = crypto.randomUUID();
  sessions.set(token, key);
  res.json({ token, username: user.username });
});

app.post("/api/logout", authMiddleware, (req, res) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ username: req.username });
});

// Sauvegarde complète de la progression liée au compte.
// Le client conserve aussi une copie locale par pseudo pour pouvoir charger rapidement,
// mais cette copie serveur permet de reprendre la partie sur un autre ordinateur.
app.get("/api/progress", authMiddleware, (req, res) => {
  const user = db.users[req.userKey];
  res.json({
    progress: user.progress && typeof user.progress === "object" ? user.progress : null,
    updatedAt: Number(user.progressUpdatedAt || 0) || null
  });
});

app.put("/api/progress", authMiddleware, (req, res) => {
  const incoming = req.body?.progress;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return res.status(400).json({ error: "Progression invalide." });
  }

  let serialized;
  try { serialized = JSON.stringify(incoming); } catch (_) {
    return res.status(400).json({ error: "Progression impossible à enregistrer." });
  }
  if (Buffer.byteLength(serialized, "utf8") > 450 * 1024) {
    return res.status(413).json({ error: "La sauvegarde de progression est trop volumineuse." });
  }

  const user = db.users[req.userKey];
  user.progress = JSON.parse(serialized);
  user.progressUpdatedAt = Date.now();
  saveDb();
  res.json({ ok: true, updatedAt: user.progressUpdatedAt });
});

app.get("/api/users/search", authMiddleware, (req, res) => {
  const q = normalizeUsername(req.query.q || "");
  if (q.length < 2) return res.json({ results: [] });
  const results = Object.keys(db.users)
    .filter(key => key !== req.userKey && key.includes(q))
    .slice(0, 15)
    .map(key => {
      let status = "none";
      if (areFriends(req.userKey, key)) status = "friend";
      else if (findFriendRequest(req.userKey, key)) status = "pending_out";
      else if (findFriendRequest(key, req.userKey)) status = "pending_in";
      return { username: db.users[key].username, status };
    });
  res.json({ results });
});

app.get("/api/friends", authMiddleware, (req, res) => {
  const friends = db.friendships
    .filter(pair => pair[0] === req.userKey || pair[1] === req.userKey)
    .map(pair => (pair[0] === req.userKey ? pair[1] : pair[0]))
    .map(key => ({ username: db.users[key]?.username || key, online: onlineSockets.has(key) }));
  const incoming = db.friendRequests.filter(r => r.to === req.userKey).map(r => ({ username: db.users[r.from]?.username || r.from }));
  const outgoing = db.friendRequests.filter(r => r.from === req.userKey).map(r => ({ username: db.users[r.to]?.username || r.to }));
  res.json({ friends, incoming, outgoing });
});

app.post("/api/friends/request", authMiddleware, (req, res) => {
  const targetKey = normalizeUsername(req.body?.username);
  if (!targetKey || !db.users[targetKey]) return res.status(404).json({ error: "Joueur introuvable." });
  if (targetKey === req.userKey) return res.status(400).json({ error: "Impossible de s’ajouter soi-même." });
  if (areFriends(req.userKey, targetKey)) return res.status(409).json({ error: "Déjà ami." });
  if (findFriendRequest(req.userKey, targetKey)) return res.status(409).json({ error: "Demande déjà envoyée." });

  if (findFriendRequest(targetKey, req.userKey)) {
    // L'autre joueur avait déjà envoyé une demande : on l'accepte directement.
    db.friendRequests = db.friendRequests.filter(r => !(r.from === targetKey && r.to === req.userKey));
    db.friendships.push([req.userKey, targetKey]);
    saveDb();
    sendTo(targetKey, { type: "friend_accept", from: req.username });
    return res.json({ ok: true, autoAccepted: true });
  }

  db.friendRequests.push({ from: req.userKey, to: targetKey, createdAt: Date.now() });
  saveDb();
  sendTo(targetKey, { type: "friend_request", from: req.username });
  res.json({ ok: true });
});

app.post("/api/friends/accept", authMiddleware, (req, res) => {
  const fromKey = normalizeUsername(req.body?.username);
  if (!findFriendRequest(fromKey, req.userKey)) return res.status(404).json({ error: "Demande introuvable." });
  db.friendRequests = db.friendRequests.filter(r => !(r.from === fromKey && r.to === req.userKey));
  db.friendships.push([req.userKey, fromKey]);
  saveDb();
  sendTo(fromKey, { type: "friend_accept", from: req.username });
  res.json({ ok: true });
});

app.post("/api/friends/decline", authMiddleware, (req, res) => {
  const fromKey = normalizeUsername(req.body?.username);
  db.friendRequests = db.friendRequests.filter(r => !(r.from === fromKey && r.to === req.userKey));
  saveDb();
  sendTo(fromKey, { type: "friend_declined", from: req.username });
  res.json({ ok: true });
});

app.post("/api/friends/remove", authMiddleware, (req, res) => {
  const otherKey = normalizeUsername(req.body?.username);
  db.friendships = db.friendships.filter(pair => !((pair[0] === req.userKey && pair[1] === otherKey) || (pair[0] === otherKey && pair[1] === req.userKey)));
  saveDb();
  sendTo(otherKey, { type: "friend_removed", from: req.username });
  res.json({ ok: true });
});

app.post("/api/report", authMiddleware, (req, res) => {
  const targetKey = normalizeUsername(req.body?.username);
  const reason = String(req.body?.reason || "").slice(0, 500);
  db.reports.push({ from: req.userKey, target: targetKey, reason, createdAt: Date.now() });
  saveDb();
  res.json({ ok: true });
});

app.post("/api/messages", authMiddleware, (req, res) => {
  const targetKey = normalizeUsername(req.body?.username);
  const text = String(req.body?.text || "").slice(0, 1000).trim();
  if (!text) return res.status(400).json({ error: "Message vide." });
  if (!areFriends(req.userKey, targetKey)) return res.status(403).json({ error: "Vous devez être amis." });
  const entry = { from: req.userKey, to: targetKey, text, createdAt: Date.now() };
  db.messages.push(entry);
  saveDb();
  sendTo(targetKey, { type: "message", from: req.username, text });
  res.json({ ok: true });
});

app.get("/api/messages/:username", authMiddleware, (req, res) => {
  const otherKey = normalizeUsername(req.params.username);
  const thread = db.messages
    .filter(m => (m.from === req.userKey && m.to === otherKey) || (m.from === otherKey && m.to === req.userKey))
    .slice(-100)
    .map(m => ({ from: db.users[m.from]?.username || m.from, text: m.text, createdAt: m.createdAt }));
  res.json({ messages: thread });
});

const server = http.createServer(app);

// ---------------------------------------------------------------------------
// WebSocket : présence en ligne, duels, matchmaking, relais de partie.
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server, path: "/ws" });
const matchQueue = []; // [{ userKey, ws, deck, heroId }]
const rooms = new Map(); // roomId -> { host: userKey, guest: userKey }
const trades = new Map(); // tradeId -> { from: userKey, to: userKey, offerCardId }

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const token = url.searchParams.get("token");
  const userKey = token && sessions.get(token);
  if (!userKey || !db.users[userKey]) { ws.close(4001, "unauthenticated"); return; }

  ws.userKey = userKey;
  onlineSockets.set(userKey, ws);
  broadcastToFriends(userKey, { type: "friend_online", username: db.users[userKey].username });

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    handleWsMessage(userKey, ws, msg);
  });

  ws.on("close", () => {
    if (onlineSockets.get(userKey) === ws) onlineSockets.delete(userKey);
    const queueIndex = matchQueue.findIndex(entry => entry.userKey === userKey);
    if (queueIndex >= 0) matchQueue.splice(queueIndex, 1);
    // Prévient l'adversaire d'une partie en cours que le joueur est parti.
    rooms.forEach((room, roomId) => {
      if (room.host === userKey || room.guest === userKey) {
        const other = room.host === userKey ? room.guest : room.host;
        sendTo(other, { type: "pvp_opponent_left", roomId });
        rooms.delete(roomId);
      }
    });
    trades.forEach((trade, tradeId) => {
      if (trade.from === userKey || trade.to === userKey) {
        const other = trade.from === userKey ? trade.to : trade.from;
        sendTo(other, { type: "trade_cancelled", tradeId });
        trades.delete(tradeId);
      }
    });
    broadcastToFriends(userKey, { type: "friend_offline", username: db.users[userKey]?.username });
  });
});

function handleWsMessage(userKey, ws, msg) {
  const username = db.users[userKey].username;

  if (msg.type === "duel_challenge") {
    const targetKey = normalizeUsername(msg.to);
    if (!areFriends(userKey, targetKey)) return;
    const delivered = sendTo(targetKey, { type: "duel_challenge", from: username });
    if (!delivered) sendTo(userKey, { type: "duel_unavailable", username: db.users[targetKey]?.username || msg.to });
    return;
  }

  if (msg.type === "duel_decline") {
    const targetKey = normalizeUsername(msg.to);
    sendTo(targetKey, { type: "duel_declined", from: username });
    return;
  }

  if (msg.type === "duel_accept") {
    // msg.to = pseudo du joueur qui a lancé le défi (il devient l'hôte de la partie).
    const hostKey = normalizeUsername(msg.to);
    if (!onlineSockets.has(hostKey)) { sendTo(userKey, { type: "duel_unavailable", username: msg.to }); return; }
    const roomId = crypto.randomUUID();
    rooms.set(roomId, { host: hostKey, guest: userKey });
    sendTo(hostKey, {
      type: "duel_start", roomId, role: "host",
      opponent: { username, deck: msg.deck || [], heroId: msg.heroId || null }
    });
    sendTo(userKey, { type: "duel_start", roomId, role: "guest", opponent: { username: db.users[hostKey].username } });
    return;
  }

  if (msg.type === "queue_join") {
    if (matchQueue.some(entry => entry.userKey === userKey)) return;
    matchQueue.push({ userKey, deck: msg.deck || [], heroId: msg.heroId || null });
    if (matchQueue.length >= 2) {
      const hostEntry = matchQueue.shift();
      const guestEntry = matchQueue.shift();
      const roomId = crypto.randomUUID();
      rooms.set(roomId, { host: hostEntry.userKey, guest: guestEntry.userKey });
      sendTo(hostEntry.userKey, {
        type: "match_found", roomId, role: "host",
        opponent: { username: db.users[guestEntry.userKey].username, deck: guestEntry.deck, heroId: guestEntry.heroId }
      });
      sendTo(guestEntry.userKey, {
        type: "match_found", roomId, role: "guest",
        opponent: { username: db.users[hostEntry.userKey].username }
      });
    } else {
      sendTo(userKey, { type: "queue_waiting" });
    }
    return;
  }

  if (msg.type === "queue_leave") {
    const index = matchQueue.findIndex(entry => entry.userKey === userKey);
    if (index >= 0) matchQueue.splice(index, 1);
    return;
  }

  if (msg.type === "pvp_action" || msg.type === "pvp_state") {
    const room = rooms.get(msg.roomId);
    if (!room) return;
    const other = room.host === userKey ? room.guest : (room.guest === userKey ? room.host : null);
    if (other) sendTo(other, msg);
    return;
  }

  if (msg.type === "pvp_leave") {
    const room = rooms.get(msg.roomId);
    if (room) {
      const other = room.host === userKey ? room.guest : room.host;
      sendTo(other, { type: "pvp_opponent_left", roomId: msg.roomId });
      rooms.delete(msg.roomId);
    }
    return;
  }

  if (msg.type === "trade_offer") {
    const targetKey = normalizeUsername(msg.to);
    if (!areFriends(userKey, targetKey) || !msg.cardId) return;
    if (!onlineSockets.has(targetKey)) { sendTo(userKey, { type: "trade_unavailable", username: db.users[targetKey]?.username || msg.to }); return; }
    const tradeId = crypto.randomUUID();
    trades.set(tradeId, { from: userKey, to: targetKey, offerCardId: msg.cardId });
    sendTo(targetKey, { type: "trade_offer", from: username, cardId: msg.cardId, tradeId });
    return;
  }

  if (msg.type === "trade_decline") {
    const trade = trades.get(msg.tradeId);
    if (!trade || (trade.to !== userKey && trade.from !== userKey)) return;
    const other = trade.from === userKey ? trade.to : trade.from;
    sendTo(other, { type: "trade_declined", from: username, tradeId: msg.tradeId });
    trades.delete(msg.tradeId);
    return;
  }

  if (msg.type === "trade_finalize") {
    const trade = trades.get(msg.tradeId);
    if (!trade || trade.to !== userKey || !msg.cardId) return;
    sendTo(trade.from, {
      type: "trade_completed", tradeId: msg.tradeId,
      cardGiven: trade.offerCardId, cardReceived: msg.cardId, otherUsername: username
    });
    sendTo(trade.to, {
      type: "trade_completed", tradeId: msg.tradeId,
      cardGiven: msg.cardId, cardReceived: trade.offerCardId, otherUsername: db.users[trade.from].username
    });
    trades.delete(msg.tradeId);
    return;
  }
}

server.listen(PORT, () => {
  console.log(`Chroniques d'Astréa — serveur multijoueur en écoute sur http://localhost:${PORT}`);
});
