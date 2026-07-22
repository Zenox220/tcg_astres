/*
  Chroniques d'Astréa — Backend Render + PostgreSQL
  -------------------------------------------------
  Les comptes, progressions, sessions, amis, messages et signalements sont
  stockés dans PostgreSQL via la variable d'environnement DATABASE_URL.

  Variables Render recommandées :
  - DATABASE_URL : URL interne de la base Render PostgreSQL
  - CORS_ORIGINS : URL GitHub Pages autorisée, par exemple
                   https://votre-pseudo.github.io
  - DATABASE_SSL : true sur Render, false pour une base locale sans TLS
*/

const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 3000);
const GAME_ROOT = path.join(__dirname, "..");
const LEGACY_DB_PATH = path.join(__dirname, "data", "db.json");
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();

if (!DATABASE_URL) {
  console.error("[ASTREA] DATABASE_URL est absente. Reliez le Web Service à une base Render PostgreSQL.");
  process.exit(1);
}

function getSslConfig() {
  const value = String(process.env.DATABASE_SSL || "").trim().toLowerCase();
  if (value === "false" || value === "0" || value === "off") return false;
  if (value === "true" || value === "1" || value === "on") return { rejectUnauthorized: false };
  return process.env.RENDER ? { rejectUnauthorized: false } : false;
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: getSslConfig(),
  max: Number(process.env.DATABASE_POOL_SIZE || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on("error", error => {
  console.error("[ASTREA] Erreur PostgreSQL inattendue :", error);
});

function normalizeUsername(name) {
  return String(name || "").trim().toLowerCase();
}

function isValidUsername(name) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(name || "");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function normalizeId(id) {
  return String(id);
}

function canonicalPair(a, b) {
  const left = BigInt(String(a));
  const right = BigInt(String(b));
  return left < right ? [String(a), String(b)] : [String(b), String(a)];
}

function toMillis(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(20) NOT NULL,
      username_key VARCHAR(20) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      progress JSONB,
      progress_updated_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64) PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS friend_requests (
      id BIGSERIAL PRIMARY KEY,
      from_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT friend_requests_different_users CHECK (from_user_id <> to_user_id),
      CONSTRAINT friend_requests_unique UNIQUE (from_user_id, to_user_id)
    );
    CREATE INDEX IF NOT EXISTS friend_requests_to_idx ON friend_requests(to_user_id);

    CREATE TABLE IF NOT EXISTS friendships (
      user_low_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_high_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_low_id, user_high_id),
      CONSTRAINT friendships_ordered CHECK (user_low_id < user_high_id)
    );
    CREATE INDEX IF NOT EXISTS friendships_high_idx ON friendships(user_high_id);

    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      from_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text VARCHAR(1000) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS messages_thread_idx
      ON messages(from_user_id, to_user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS reports (
      id BIGSERIAL PRIMARY KEY,
      from_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason VARCHAR(500) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await importLegacyJsonIfNeeded();
}

async function importLegacyJsonIfNeeded() {
  if (!fs.existsSync(LEGACY_DB_PATH)) return;

  let legacy;
  try {
    legacy = JSON.parse(fs.readFileSync(LEGACY_DB_PATH, "utf8"));
  } catch (error) {
    console.warn("[ASTREA] L'ancien db.json est illisible, import ignoré.");
    return;
  }

  const legacyUsers = legacy?.users && typeof legacy.users === "object" ? legacy.users : {};
  if (!Object.keys(legacyUsers).length) return;

  const alreadyImported = await pool.query(
    "SELECT 1 FROM app_meta WHERE key = $1 LIMIT 1",
    ["legacy_json_imported_v1"]
  );
  if (alreadyImported.rowCount) return;

  await withTransaction(async client => {
    const keyToId = new Map();

    for (const [storedKey, user] of Object.entries(legacyUsers)) {
      const username = String(user?.username || storedKey).trim();
      const usernameKey = normalizeUsername(username);
      if (!isValidUsername(username) || !user?.passwordHash) continue;

      const createdAt = Number(user.createdAt || Date.now());
      const progressUpdatedAt = Number(user.progressUpdatedAt || 0);
      await client.query(
        `INSERT INTO users
          (username, username_key, password_hash, created_at, progress, progress_updated_at)
         VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0), $5::jsonb,
                 CASE WHEN $6::double precision > 0 THEN TO_TIMESTAMP($6 / 1000.0) ELSE NULL END)
         ON CONFLICT (username_key) DO NOTHING`,
        [
          username,
          usernameKey,
          user.passwordHash,
          createdAt,
          user.progress ? JSON.stringify(user.progress) : null,
          progressUpdatedAt
        ]
      );

      const inserted = await client.query(
        "SELECT id FROM users WHERE username_key = $1",
        [usernameKey]
      );
      if (inserted.rowCount) keyToId.set(normalizeUsername(storedKey), normalizeId(inserted.rows[0].id));
    }

    for (const request of Array.isArray(legacy.friendRequests) ? legacy.friendRequests : []) {
      const fromId = keyToId.get(normalizeUsername(request?.from));
      const toId = keyToId.get(normalizeUsername(request?.to));
      if (!fromId || !toId || fromId === toId) continue;
      await client.query(
        `INSERT INTO friend_requests (from_user_id, to_user_id, created_at)
         VALUES ($1, $2, TO_TIMESTAMP($3 / 1000.0))
         ON CONFLICT (from_user_id, to_user_id) DO NOTHING`,
        [fromId, toId, Number(request.createdAt || Date.now())]
      );
    }

    for (const pair of Array.isArray(legacy.friendships) ? legacy.friendships : []) {
      const firstId = keyToId.get(normalizeUsername(pair?.[0]));
      const secondId = keyToId.get(normalizeUsername(pair?.[1]));
      if (!firstId || !secondId || firstId === secondId) continue;
      const [lowId, highId] = canonicalPair(firstId, secondId);
      await client.query(
        `INSERT INTO friendships (user_low_id, user_high_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [lowId, highId]
      );
    }

    for (const message of Array.isArray(legacy.messages) ? legacy.messages : []) {
      const fromId = keyToId.get(normalizeUsername(message?.from));
      const toId = keyToId.get(normalizeUsername(message?.to));
      const text = String(message?.text || "").slice(0, 1000).trim();
      if (!fromId || !toId || !text) continue;
      await client.query(
        `INSERT INTO messages (from_user_id, to_user_id, text, created_at)
         VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0))`,
        [fromId, toId, text, Number(message.createdAt || Date.now())]
      );
    }

    for (const report of Array.isArray(legacy.reports) ? legacy.reports : []) {
      const fromId = keyToId.get(normalizeUsername(report?.from));
      const targetId = keyToId.get(normalizeUsername(report?.target));
      if (!fromId || !targetId) continue;
      await client.query(
        `INSERT INTO reports (from_user_id, target_user_id, reason, created_at)
         VALUES ($1, $2, $3, TO_TIMESTAMP($4 / 1000.0))`,
        [fromId, targetId, String(report.reason || "").slice(0, 500), Number(report.createdAt || Date.now())]
      );
    }

    await client.query(
      `INSERT INTO app_meta (key, value)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ["legacy_json_imported_v1", JSON.stringify({ importedAt: Date.now() })]
    );
  });

  console.log("[ASTREA] Ancien db.json importé dans PostgreSQL.");
}

async function createSession(userId, client = pool) {
  const token = crypto.randomBytes(32).toString("hex");
  await client.query(
    "INSERT INTO sessions (token_hash, user_id) VALUES ($1, $2)",
    [hashToken(token), userId]
  );
  return token;
}

async function getUserByKey(usernameKey, client = pool) {
  const result = await client.query(
    "SELECT id, username, username_key, password_hash FROM users WHERE username_key = $1",
    [usernameKey]
  );
  return result.rows[0] || null;
}

async function areFriends(userAId, userBId, client = pool) {
  const [lowId, highId] = canonicalPair(userAId, userBId);
  const result = await client.query(
    "SELECT 1 FROM friendships WHERE user_low_id = $1 AND user_high_id = $2 LIMIT 1",
    [lowId, highId]
  );
  return result.rowCount > 0;
}

const configuredOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (!configuredOrigins.length) return true;
  const cleanOrigin = String(origin).replace(/\/$/, "");
  return configuredOrigins.includes(cleanOrigin);
}

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    if (origin && !isOriginAllowed(origin)) return res.status(403).end();
    return res.status(204).end();
  }
  if (origin && !isOriginAllowed(origin)) return res.status(403).json({ error: "Origine non autorisée." });
  next();
});
app.use(express.json({ limit: "512kb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/server")) return res.status(404).end();
  next();
});

async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Non authentifié." });

    const result = await pool.query(
      `SELECT u.id, u.username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [hashToken(token)]
    );
    if (!result.rowCount) return res.status(401).json({ error: "Session invalide. Reconnectez-vous." });

    req.authTokenHash = hashToken(token);
    req.userId = normalizeId(result.rows[0].id);
    req.username = result.rows[0].username;
    next();
  } catch (error) {
    next(error);
  }
}

const onlineSockets = new Map(); // userId -> ws

function sendTo(userId, payload) {
  const ws = onlineSockets.get(normalizeId(userId));
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

async function broadcastToFriends(userId, payload) {
  const result = await pool.query(
    `SELECT CASE WHEN user_low_id = $1 THEN user_high_id ELSE user_low_id END AS friend_id
     FROM friendships
     WHERE user_low_id = $1 OR user_high_id = $1`,
    [userId]
  );
  result.rows.forEach(row => sendTo(row.friend_id, payload));
}

app.get("/api/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "postgresql" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/register", async (req, res, next) => {
  try {
    const rawUsername = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (!isValidUsername(rawUsername)) {
      return res.status(400).json({ error: "Pseudo invalide (3 à 20 caractères : lettres, chiffres, _)." });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: "Mot de passe trop court (4 caractères minimum)." });
    }

    const usernameKey = normalizeUsername(rawUsername);
    const passwordHash = bcrypt.hashSync(password, 10);

    const result = await withTransaction(async client => {
      const inserted = await client.query(
        `INSERT INTO users (username, username_key, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, username`,
        [rawUsername, usernameKey, passwordHash]
      );
      const user = inserted.rows[0];
      const token = await createSession(user.id, client);
      return { token, username: user.username };
    });

    res.json(result);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Ce pseudo est déjà pris." });
    next(error);
  }
});

app.post("/api/login", async (req, res, next) => {
  try {
    const rawUsername = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    const user = await getUserByKey(normalizeUsername(rawUsername));
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Pseudo ou mot de passe incorrect." });
    }
    const token = await createSession(user.id);
    res.json({ token, username: user.username });
  } catch (error) {
    next(error);
  }
});

app.post("/api/logout", authMiddleware, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM sessions WHERE token_hash = $1", [req.authTokenHash]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ username: req.username });
});

app.get("/api/progress", authMiddleware, async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT progress, progress_updated_at FROM users WHERE id = $1",
      [req.userId]
    );
    const user = result.rows[0];
    res.json({
      progress: user?.progress && typeof user.progress === "object" ? user.progress : null,
      updatedAt: toMillis(user?.progress_updated_at)
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/progress", authMiddleware, async (req, res, next) => {
  try {
    const incoming = req.body?.progress;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      return res.status(400).json({ error: "Progression invalide." });
    }

    let serialized;
    try {
      serialized = JSON.stringify(incoming);
    } catch (_) {
      return res.status(400).json({ error: "Progression impossible à enregistrer." });
    }
    if (Buffer.byteLength(serialized, "utf8") > 450 * 1024) {
      return res.status(413).json({ error: "La sauvegarde de progression est trop volumineuse." });
    }

    const result = await pool.query(
      `UPDATE users
       SET progress = $1::jsonb, progress_updated_at = NOW()
       WHERE id = $2
       RETURNING progress_updated_at`,
      [serialized, req.userId]
    );
    res.json({ ok: true, updatedAt: toMillis(result.rows[0]?.progress_updated_at) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/account", authMiddleware, async (req, res, next) => {
  try {
    const password = String(req.body?.password || "");
    const result = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.userId]
    );
    if (!result.rowCount || !bcrypt.compareSync(password, result.rows[0].password_hash)) {
      return res.status(401).json({ error: "Mot de passe incorrect." });
    }

    await pool.query("DELETE FROM users WHERE id = $1", [req.userId]);
    const ws = onlineSockets.get(req.userId);
    if (ws) ws.close(4000, "account_deleted");
    onlineSockets.delete(req.userId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/users/search", authMiddleware, async (req, res, next) => {
  try {
    const query = normalizeUsername(req.query.q || "");
    if (query.length < 2) return res.json({ results: [] });

    const result = await pool.query(
      `SELECT u.username,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM friendships f
            WHERE (f.user_low_id = LEAST($1::bigint, u.id)
              AND f.user_high_id = GREATEST($1::bigint, u.id))
          ) THEN 'friend'
          WHEN EXISTS (
            SELECT 1 FROM friend_requests r
            WHERE r.from_user_id = $1 AND r.to_user_id = u.id
          ) THEN 'pending_out'
          WHEN EXISTS (
            SELECT 1 FROM friend_requests r
            WHERE r.from_user_id = u.id AND r.to_user_id = $1
          ) THEN 'pending_in'
          ELSE 'none'
        END AS status
       FROM users u
       WHERE u.id <> $1 AND u.username_key LIKE '%' || $2 || '%'
       ORDER BY u.username_key
       LIMIT 15`,
      [req.userId, query]
    );
    res.json({ results: result.rows });
  } catch (error) {
    next(error);
  }
});

app.get("/api/friends", authMiddleware, async (req, res, next) => {
  try {
    const [friendsResult, incomingResult, outgoingResult] = await Promise.all([
      pool.query(
        `SELECT u.id, u.username
         FROM friendships f
         JOIN users u ON u.id = CASE
           WHEN f.user_low_id = $1 THEN f.user_high_id ELSE f.user_low_id END
         WHERE f.user_low_id = $1 OR f.user_high_id = $1
         ORDER BY u.username_key`,
        [req.userId]
      ),
      pool.query(
        `SELECT u.username
         FROM friend_requests r
         JOIN users u ON u.id = r.from_user_id
         WHERE r.to_user_id = $1
         ORDER BY r.created_at DESC`,
        [req.userId]
      ),
      pool.query(
        `SELECT u.username
         FROM friend_requests r
         JOIN users u ON u.id = r.to_user_id
         WHERE r.from_user_id = $1
         ORDER BY r.created_at DESC`,
        [req.userId]
      )
    ]);

    res.json({
      friends: friendsResult.rows.map(row => ({
        username: row.username,
        online: onlineSockets.has(normalizeId(row.id))
      })),
      incoming: incomingResult.rows,
      outgoing: outgoingResult.rows
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/friends/request", authMiddleware, async (req, res, next) => {
  try {
    const target = await getUserByKey(normalizeUsername(req.body?.username));
    if (!target) return res.status(404).json({ error: "Joueur introuvable." });
    const targetId = normalizeId(target.id);
    if (targetId === req.userId) return res.status(400).json({ error: "Impossible de s’ajouter soi-même." });

    const state = await withTransaction(async client => {
      if (await areFriends(req.userId, targetId, client)) return { error: "Déjà ami.", status: 409 };

      const sameDirection = await client.query(
        "SELECT 1 FROM friend_requests WHERE from_user_id = $1 AND to_user_id = $2",
        [req.userId, targetId]
      );
      if (sameDirection.rowCount) return { error: "Demande déjà envoyée.", status: 409 };

      const reverse = await client.query(
        `DELETE FROM friend_requests
         WHERE from_user_id = $1 AND to_user_id = $2
         RETURNING id`,
        [targetId, req.userId]
      );
      if (reverse.rowCount) {
        const [lowId, highId] = canonicalPair(req.userId, targetId);
        await client.query(
          `INSERT INTO friendships (user_low_id, user_high_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [lowId, highId]
        );
        return { autoAccepted: true };
      }

      await client.query(
        `INSERT INTO friend_requests (from_user_id, to_user_id)
         VALUES ($1, $2)`,
        [req.userId, targetId]
      );
      return { autoAccepted: false };
    });

    if (state.error) return res.status(state.status).json({ error: state.error });
    if (state.autoAccepted) {
      sendTo(targetId, { type: "friend_accept", from: req.username });
      return res.json({ ok: true, autoAccepted: true });
    }
    sendTo(targetId, { type: "friend_request", from: req.username });
    res.json({ ok: true });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Demande déjà envoyée." });
    next(error);
  }
});

app.post("/api/friends/accept", authMiddleware, async (req, res, next) => {
  try {
    const fromUser = await getUserByKey(normalizeUsername(req.body?.username));
    if (!fromUser) return res.status(404).json({ error: "Demande introuvable." });
    const fromId = normalizeId(fromUser.id);

    const accepted = await withTransaction(async client => {
      const removed = await client.query(
        `DELETE FROM friend_requests
         WHERE from_user_id = $1 AND to_user_id = $2
         RETURNING id`,
        [fromId, req.userId]
      );
      if (!removed.rowCount) return false;
      const [lowId, highId] = canonicalPair(req.userId, fromId);
      await client.query(
        `INSERT INTO friendships (user_low_id, user_high_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [lowId, highId]
      );
      return true;
    });

    if (!accepted) return res.status(404).json({ error: "Demande introuvable." });
    sendTo(fromId, { type: "friend_accept", from: req.username });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/friends/decline", authMiddleware, async (req, res, next) => {
  try {
    const fromUser = await getUserByKey(normalizeUsername(req.body?.username));
    if (fromUser) {
      await pool.query(
        "DELETE FROM friend_requests WHERE from_user_id = $1 AND to_user_id = $2",
        [fromUser.id, req.userId]
      );
      sendTo(fromUser.id, { type: "friend_declined", from: req.username });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/friends/remove", authMiddleware, async (req, res, next) => {
  try {
    const other = await getUserByKey(normalizeUsername(req.body?.username));
    if (other) {
      const [lowId, highId] = canonicalPair(req.userId, other.id);
      await pool.query(
        "DELETE FROM friendships WHERE user_low_id = $1 AND user_high_id = $2",
        [lowId, highId]
      );
      sendTo(other.id, { type: "friend_removed", from: req.username });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/report", authMiddleware, async (req, res, next) => {
  try {
    const target = await getUserByKey(normalizeUsername(req.body?.username));
    if (!target) return res.status(404).json({ error: "Joueur introuvable." });
    const reason = String(req.body?.reason || "").slice(0, 500);
    await pool.query(
      `INSERT INTO reports (from_user_id, target_user_id, reason)
       VALUES ($1, $2, $3)`,
      [req.userId, target.id, reason]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/messages", authMiddleware, async (req, res, next) => {
  try {
    const target = await getUserByKey(normalizeUsername(req.body?.username));
    const text = String(req.body?.text || "").slice(0, 1000).trim();
    if (!target) return res.status(404).json({ error: "Joueur introuvable." });
    if (!text) return res.status(400).json({ error: "Message vide." });
    if (!(await areFriends(req.userId, target.id))) {
      return res.status(403).json({ error: "Vous devez être amis." });
    }

    const inserted = await pool.query(
      `INSERT INTO messages (from_user_id, to_user_id, text)
       VALUES ($1, $2, $3)
       RETURNING created_at`,
      [req.userId, target.id, text]
    );
    sendTo(target.id, { type: "message", from: req.username, text });
    res.json({ ok: true, createdAt: toMillis(inserted.rows[0]?.created_at) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/messages/:username", authMiddleware, async (req, res, next) => {
  try {
    const other = await getUserByKey(normalizeUsername(req.params.username));
    if (!other) return res.json({ messages: [] });

    const result = await pool.query(
      `SELECT sender.username AS from, m.text, m.created_at
       FROM messages m
       JOIN users sender ON sender.id = m.from_user_id
       WHERE (m.from_user_id = $1 AND m.to_user_id = $2)
          OR (m.from_user_id = $2 AND m.to_user_id = $1)
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [req.userId, other.id]
    );
    res.json({
      messages: result.rows.reverse().map(row => ({
        from: row.from,
        text: row.text,
        createdAt: toMillis(row.created_at)
      }))
    });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(GAME_ROOT));

app.use((error, _req, res, _next) => {
  console.error("[ASTREA]", error);
  if (res.headersSent) return;
  res.status(500).json({ error: "Erreur interne du serveur." });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const matchQueue = []; // [{ userId, username, deck, heroId }]
const rooms = new Map(); // roomId -> { host, guest }
const trades = new Map(); // tradeId -> { from, to, fromUsername, toUsername, offerCardId }

wss.on("connection", async (ws, req) => {
  try {
    if (!isOriginAllowed(req.headers.origin)) {
      ws.close(4003, "origin_not_allowed");
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");
    if (!token) {
      ws.close(4001, "unauthenticated");
      return;
    }

    const result = await pool.query(
      `SELECT u.id, u.username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [hashToken(token)]
    );
    if (!result.rowCount) {
      ws.close(4001, "unauthenticated");
      return;
    }

    const userId = normalizeId(result.rows[0].id);
    const username = result.rows[0].username;
    ws.userId = userId;
    ws.username = username;

    const previousSocket = onlineSockets.get(userId);
    if (previousSocket && previousSocket !== ws) previousSocket.close(4002, "replaced_by_new_connection");
    onlineSockets.set(userId, ws);
    await broadcastToFriends(userId, { type: "friend_online", username });

    ws.on("message", raw => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (_) {
        return;
      }
      handleWsMessage(userId, username, ws, msg).catch(error => {
        console.error("[ASTREA] Erreur WebSocket :", error);
      });
    });

    ws.on("close", () => {
      cleanupSocket(userId, username, ws).catch(error => {
        console.error("[ASTREA] Nettoyage WebSocket :", error);
      });
    });
  } catch (error) {
    console.error("[ASTREA] Authentification WebSocket impossible :", error);
    ws.close(1011, "server_error");
  }
});

async function cleanupSocket(userId, username, ws) {
  if (onlineSockets.get(userId) !== ws) return;
  onlineSockets.delete(userId);

  const queueIndex = matchQueue.findIndex(entry => entry.userId === userId);
  if (queueIndex >= 0) matchQueue.splice(queueIndex, 1);

  rooms.forEach((room, roomId) => {
    if (room.host === userId || room.guest === userId) {
      const other = room.host === userId ? room.guest : room.host;
      sendTo(other, { type: "pvp_opponent_left", roomId });
      rooms.delete(roomId);
    }
  });

  trades.forEach((trade, tradeId) => {
    if (trade.from === userId || trade.to === userId) {
      const other = trade.from === userId ? trade.to : trade.from;
      sendTo(other, { type: "trade_cancelled", tradeId });
      trades.delete(tradeId);
    }
  });

  await broadcastToFriends(userId, { type: "friend_offline", username });
}

async function handleWsMessage(userId, username, _ws, msg) {
  if (msg.type === "duel_challenge") {
    const target = await getUserByKey(normalizeUsername(msg.to));
    if (!target || !(await areFriends(userId, target.id))) return;
    const delivered = sendTo(target.id, { type: "duel_challenge", from: username });
    if (!delivered) sendTo(userId, { type: "duel_unavailable", username: target.username });
    return;
  }

  if (msg.type === "duel_decline") {
    const target = await getUserByKey(normalizeUsername(msg.to));
    if (target) sendTo(target.id, { type: "duel_declined", from: username });
    return;
  }

  if (msg.type === "duel_accept") {
    const host = await getUserByKey(normalizeUsername(msg.to));
    if (!host || !onlineSockets.has(normalizeId(host.id))) {
      sendTo(userId, { type: "duel_unavailable", username: msg.to });
      return;
    }
    const hostId = normalizeId(host.id);
    const roomId = crypto.randomUUID();
    rooms.set(roomId, { host: hostId, guest: userId });
    sendTo(hostId, {
      type: "duel_start",
      roomId,
      role: "host",
      opponent: { username, deck: msg.deck || [], heroId: msg.heroId || null }
    });
    sendTo(userId, {
      type: "duel_start",
      roomId,
      role: "guest",
      opponent: { username: host.username }
    });
    return;
  }

  if (msg.type === "queue_join") {
    if (matchQueue.some(entry => entry.userId === userId)) return;
    matchQueue.push({ userId, username, deck: msg.deck || [], heroId: msg.heroId || null });
    if (matchQueue.length >= 2) {
      const hostEntry = matchQueue.shift();
      const guestEntry = matchQueue.shift();
      const roomId = crypto.randomUUID();
      rooms.set(roomId, { host: hostEntry.userId, guest: guestEntry.userId });
      sendTo(hostEntry.userId, {
        type: "match_found",
        roomId,
        role: "host",
        opponent: {
          username: guestEntry.username,
          deck: guestEntry.deck,
          heroId: guestEntry.heroId
        }
      });
      sendTo(guestEntry.userId, {
        type: "match_found",
        roomId,
        role: "guest",
        opponent: { username: hostEntry.username }
      });
    } else {
      sendTo(userId, { type: "queue_waiting" });
    }
    return;
  }

  if (msg.type === "queue_leave") {
    const index = matchQueue.findIndex(entry => entry.userId === userId);
    if (index >= 0) matchQueue.splice(index, 1);
    return;
  }

  if (msg.type === "pvp_action" || msg.type === "pvp_state") {
    const room = rooms.get(msg.roomId);
    if (!room) return;
    const other = room.host === userId ? room.guest : (room.guest === userId ? room.host : null);
    if (other) sendTo(other, msg);
    return;
  }

  if (msg.type === "pvp_leave") {
    const room = rooms.get(msg.roomId);
    if (room) {
      const other = room.host === userId ? room.guest : room.host;
      sendTo(other, { type: "pvp_opponent_left", roomId: msg.roomId });
      rooms.delete(msg.roomId);
    }
    return;
  }

  if (msg.type === "trade_offer") {
    const target = await getUserByKey(normalizeUsername(msg.to));
    if (!target || !msg.cardId || !(await areFriends(userId, target.id))) return;
    const targetId = normalizeId(target.id);
    if (!onlineSockets.has(targetId)) {
      sendTo(userId, { type: "trade_unavailable", username: target.username });
      return;
    }
    const tradeId = crypto.randomUUID();
    trades.set(tradeId, {
      from: userId,
      to: targetId,
      fromUsername: username,
      toUsername: target.username,
      offerCardId: msg.cardId
    });
    sendTo(targetId, { type: "trade_offer", from: username, cardId: msg.cardId, tradeId });
    return;
  }

  if (msg.type === "trade_decline") {
    const trade = trades.get(msg.tradeId);
    if (!trade || (trade.to !== userId && trade.from !== userId)) return;
    const other = trade.from === userId ? trade.to : trade.from;
    sendTo(other, { type: "trade_declined", from: username, tradeId: msg.tradeId });
    trades.delete(msg.tradeId);
    return;
  }

  if (msg.type === "trade_finalize") {
    const trade = trades.get(msg.tradeId);
    if (!trade || trade.to !== userId || !msg.cardId) return;
    sendTo(trade.from, {
      type: "trade_completed",
      tradeId: msg.tradeId,
      cardGiven: trade.offerCardId,
      cardReceived: msg.cardId,
      otherUsername: trade.toUsername
    });
    sendTo(trade.to, {
      type: "trade_completed",
      tradeId: msg.tradeId,
      cardGiven: msg.cardId,
      cardReceived: trade.offerCardId,
      otherUsername: trade.fromUsername
    });
    trades.delete(msg.tradeId);
  }
}

async function shutdown(signal) {
  console.log(`[ASTREA] Arrêt demandé (${signal}).`);
  wss.clients.forEach(client => client.close(1001, "server_shutdown"));
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

initializeDatabase()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`[ASTREA] Backend connecté à PostgreSQL et en écoute sur le port ${PORT}.`);
    });
  })
  .catch(error => {
    console.error("[ASTREA] Initialisation PostgreSQL impossible :", error);
    process.exit(1);
  });
