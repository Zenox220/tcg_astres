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
const { initializeExtensions, installExtensionRoutes, recordAudit, getActiveMute, normalizeRewardBundle } = require("./admin-extensions");

const PORT = Number(process.env.PORT || 3000);
const GAME_ROOT = path.join(__dirname, "..");
const LEGACY_DB_PATH = path.join(__dirname, "data", "db.json");
const DATABASE_URL = String(process.env.DATABASE_URL || "").trim();
const GAME_NAME = String(process.env.GAME_NAME || "Chroniques d’Astréa").trim().slice(0, 100);
const REPORTS_DISCORD_WEBHOOK_URL = String(process.env.REPORTS_DISCORD_WEBHOOK_URL || "").trim();
const BANS_DISCORD_WEBHOOK_URL = String(process.env.BANS_DISCORD_WEBHOOK_URL || "").trim();
const ADMIN_PANEL_URL = String(process.env.ADMIN_PANEL_URL || "").trim();
const ADMIN_USERNAME = String(process.env.ADMIN_USERNAME || "").trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const ADMIN_DISPLAY_NAME = String(process.env.ADMIN_DISPLAY_NAME || ADMIN_USERNAME || "Administrateur").trim().slice(0, 80);

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


function sanitizeText(value, maxLength = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeDiscordText(value, maxLength = 1000) {
  return sanitizeText(value, maxLength).replace(/@/g, "＠");
}

function sanitizeMultilineText(value, maxLength = 5000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function sanitizeHttpUrl(value, { required = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) {
    if (required) throw Object.assign(new Error("Une URL est requise."), { statusCode: 400 });
    return "";
  }
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("protocol");
    return url.toString().slice(0, 2000);
  } catch (_) {
    throw Object.assign(new Error("Une des URL fournies est invalide."), { statusCode: 400 });
  }
}

function normalizePopupImages(value) {
  const source = Array.isArray(value) ? value : [];
  const unique = [];
  for (const entry of source) {
    const url = sanitizeHttpUrl(entry);
    if (url && !unique.includes(url)) unique.push(url);
    if (unique.length >= 8) break;
  }
  return unique;
}

function normalizePopupButtons(value) {
  const source = Array.isArray(value) ? value : [];
  const buttons = [];
  for (const entry of source) {
    const label = sanitizeText(entry?.label, 60);
    const url = sanitizeHttpUrl(entry?.url);
    if (!label || !url) continue;
    const style = ['primary', 'secondary', 'danger'].includes(entry?.style) ? entry.style : 'primary';
    buttons.push({ label, url, style });
    if (buttons.length >= 4) break;
  }
  return buttons;
}


function normalizePopupTargeting(value = {}) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const type = ["all", "new", "rank", "inactive", "admins", "usernames"].includes(raw.type) ? raw.type : "all";
  if (type === "new") {
    return {
      type,
      accountAgeDays: Math.max(1, Math.min(365, Number(raw.accountAgeDays || 7))),
      maxMatches: Math.max(0, Math.min(10000, Number(raw.maxMatches ?? 5)))
    };
  }
  if (type === "rank") return { type, rankTier: Math.max(0, Math.min(15, Number(raw.rankTier || 0))) };
  if (type === "inactive") return { type, inactiveDays: Math.max(1, Math.min(3650, Number(raw.inactiveDays || 30))) };
  if (type === "usernames") {
    const usernames = [...new Set((Array.isArray(raw.usernames) ? raw.usernames : String(raw.usernames || "").split(/[\s,;]+/))
      .map(normalizeUsername).filter(name => isValidUsername(name)))].slice(0, 200);
    return { type, usernames };
  }
  return { type };
}

function popupMatchesUser(targeting, user) {
  const target = normalizePopupTargeting(targeting);
  if (target.type === "all") return true;
  if (!user) return false;
  const progress = normalizeProgress(user.progress);
  if (target.type === "admins") return Boolean(user.is_admin_player);
  if (target.type === "usernames") return target.usernames.includes(user.username_key);
  if (target.type === "rank") {
    const tier = Number(progress?.league?.tier ?? progress?.stats?.bestLeagueTier ?? 0);
    return tier === target.rankTier;
  }
  if (target.type === "inactive") {
    const lastSeen = new Date(user.previous_login_at || user.last_login_at || user.created_at || 0).getTime();
    return Number.isFinite(lastSeen) && lastSeen <= Date.now() - target.inactiveDays * 86400000;
  }
  if (target.type === "new") {
    const createdAt = new Date(user.created_at || 0).getTime();
    const matches = Number(progress?.stats?.totalMatches || 0);
    return Number.isFinite(createdAt) && createdAt >= Date.now() - target.accountAgeDays * 86400000 && matches <= target.maxMatches;
  }
  return false;
}

function parsePopupDate(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw Object.assign(new Error("Date de publication invalide."), { statusCode: 400 });
  }
  return date;
}

function serializePopup(row) {
  if (!row) return null;
  return {
    id: normalizeId(row.id),
    title: row.title,
    description: row.description || "",
    footer: row.footer || "",
    images: Array.isArray(row.images) ? row.images : [],
    buttons: Array.isArray(row.buttons) ? row.buttons : [],
    targeting: normalizePopupTargeting(row.targeting),
    reward: normalizeRewardBundle(row.reward),
    claimed: Boolean(row.claimed),
    enabled: Boolean(row.enabled),
    startsAt: toMillis(row.starts_at),
    expiresAt: toMillis(row.expires_at),
    createdAt: toMillis(row.created_at),
    updatedAt: toMillis(row.updated_at),
    createdBy: row.created_by || null
  };
}

function normalizePopupPayload(body = {}) {
  const title = sanitizeText(body.title, 120);
  const description = sanitizeMultilineText(body.description, 5000);
  const footer = sanitizeText(body.footer, 250);
  const images = normalizePopupImages(body.images);
  const buttons = normalizePopupButtons(body.buttons);
  const targeting = normalizePopupTargeting(body.targeting);
  const reward = normalizeRewardBundle(body.reward, { maxItems: 1 });
  const enabled = body.enabled !== false;
  const startsAt = parsePopupDate(body.startsAt, new Date());
  const expiresAt = parsePopupDate(body.expiresAt);

  if (!title) throw Object.assign(new Error("Le titre de la pop-up est obligatoire."), { statusCode: 400 });
  if (!description && !images.length) {
    throw Object.assign(new Error("Ajoutez au moins une description ou une image."), { statusCode: 400 });
  }
  if (!expiresAt || expiresAt <= startsAt) {
    throw Object.assign(new Error("La date de fin doit être postérieure à la date de début."), { statusCode: 400 });
  }
  const maxDurationMs = 366 * 24 * 60 * 60 * 1000;
  if (expiresAt.getTime() - startsAt.getTime() > maxDurationMs) {
    throw Object.assign(new Error("La durée maximale d’une publication est de 366 jours."), { statusCode: 400 });
  }
  return { title, description, footer, images, buttons, targeting, reward, enabled, startsAt, expiresAt };
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "Date inconnue";
  return date.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" });
}

function getSafeSourceUrl(req, rawSourceUrl) {
  try {
    const url = new URL(String(rawSourceUrl || ""));
    if (!isOriginAllowed(url.origin)) return null;
    return url.toString();
  } catch (_) {
    const origin = String(req.headers.origin || "").replace(/\/$/, "");
    return origin && isOriginAllowed(origin) ? `${origin}/` : null;
  }
}

function buildAdminPanelUrl(req, params = {}, sourceUrl = null) {
  let base = ADMIN_PANEL_URL;
  if (!base) {
    const safeSource = getSafeSourceUrl(req, sourceUrl);
    if (safeSource) {
      try { base = new URL("admin.html", safeSource).toString(); } catch (_) { base = ""; }
    }
  }
  if (!base) return "";
  try {
    const url = new URL(base);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    return url.toString();
  } catch (_) {
    return "";
  }
}

async function sendDiscordWebhook(webhookUrl, payload) {
  if (!webhookUrl) return { delivered: false, error: "Webhook non configuré." };
  try {
    const targetUrl = new URL(webhookUrl);
    targetUrl.searchParams.set("wait", "true");
    if (Array.isArray(payload?.components) && payload.components.length) {
      targetUrl.searchParams.set("with_components", "true");
    }
    const response = await fetch(targetUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, allowed_mentions: { parse: [] } })
    });
    if (!response.ok) {
      const details = sanitizeText(await response.text().catch(() => ""), 300);
      return { delivered: false, error: `Discord HTTP ${response.status}${details ? ` : ${details}` : ""}` };
    }
    return { delivered: true, error: null };
  } catch (error) {
    return { delivered: false, error: sanitizeText(error?.message || error, 300) };
  }
}

function normalizeProgress(progress) {
  return progress && typeof progress === "object" && !Array.isArray(progress) ? progress : {};
}

function countOwnedCards(progress) {
  const collection = normalizeProgress(progress).collection;
  if (!collection || typeof collection !== "object" || Array.isArray(collection)) return 0;
  return Object.values(collection).reduce((total, value) => total + Math.max(0, Number(value) || 0), 0);
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

    ALTER TABLE users ADD COLUMN IF NOT EXISTS progress_revision BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS category VARCHAR(80) NOT NULL DEFAULT 'Autre';
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'open';
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS source_url TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS webhook_delivered BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS webhook_error TEXT;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ;
    ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolution_note TEXT;

    CREATE TABLE IF NOT EXISTS admins (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(40) NOT NULL,
      username_key VARCHAR(40) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name VARCHAR(80) NOT NULL,
      disabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash CHAR(64) PRIMARY KEY,
      admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions(admin_id);
    CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS bans (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
      reason VARCHAR(500) NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      revoked_by_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      revoked_reason VARCHAR(500)
    );
    CREATE INDEX IF NOT EXISTS bans_user_active_idx ON bans(user_id, revoked_at, expires_at);

    CREATE TABLE IF NOT EXISTS moderation_actions (
      id BIGSERIAL PRIMARY KEY,
      admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
      target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      report_id BIGINT REFERENCES reports(id) ON DELETE SET NULL,
      action_type VARCHAR(80) NOT NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS moderation_actions_target_idx ON moderation_actions(target_user_id, created_at DESC);

    ALTER TABLE reports ADD COLUMN IF NOT EXISTS handled_by_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL;

    CREATE TABLE IF NOT EXISTS game_popups (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(120) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      footer VARCHAR(250) NOT NULL DEFAULT '',
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      buttons JSONB NOT NULL DEFAULT '[]'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      created_by_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT game_popups_valid_dates CHECK (expires_at > starts_at)
    );
    CREATE INDEX IF NOT EXISTS game_popups_active_idx ON game_popups(enabled, starts_at, expires_at);

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await initializeExtensions(pool);
  await importLegacyJsonIfNeeded();
  await bootstrapAdministrator();
  await pool.query("DELETE FROM admin_sessions WHERE expires_at <= NOW()");
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

async function bootstrapAdministrator() {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.warn("[ASTREA] Aucun administrateur initial configuré. Définissez ADMIN_USERNAME et ADMIN_PASSWORD sur Render.");
    return;
  }
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(ADMIN_USERNAME) || ADMIN_PASSWORD.length < 10) {
    console.warn("[ASTREA] ADMIN_USERNAME ou ADMIN_PASSWORD invalide (mot de passe : 10 caractères minimum).");
    return;
  }
  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  await pool.query(
    `INSERT INTO admins (username, username_key, password_hash, display_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username_key) DO UPDATE SET
       username = EXCLUDED.username,
       password_hash = EXCLUDED.password_hash,
       display_name = EXCLUDED.display_name,
       disabled = FALSE`,
    [ADMIN_USERNAME, normalizeUsername(ADMIN_USERNAME), passwordHash, ADMIN_DISPLAY_NAME || ADMIN_USERNAME]
  );
  console.log(`[ASTREA] Administrateur initial prêt : ${ADMIN_USERNAME}`);
}

async function createAdminSession(adminId, client = pool) {
  const token = crypto.randomBytes(32).toString("hex");
  await client.query(
    `INSERT INTO admin_sessions (token_hash, admin_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '12 hours')`,
    [hashToken(token), adminId]
  );
  return token;
}

async function getActiveBan(userId, client = pool) {
  const result = await client.query(
    `SELECT b.id, b.reason, b.starts_at, b.expires_at,
            a.display_name AS admin_name
     FROM bans b
     JOIN admins a ON a.id = b.admin_id
     WHERE b.user_id = $1
       AND b.revoked_at IS NULL
       AND (b.expires_at IS NULL OR b.expires_at > NOW())
     ORDER BY b.starts_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

function serializeBan(ban) {
  if (!ban) return null;
  return {
    id: normalizeId(ban.id),
    reason: ban.reason,
    startsAt: toMillis(ban.starts_at),
    expiresAt: toMillis(ban.expires_at),
    permanent: !ban.expires_at,
    adminName: ban.admin_name || null
  };
}

function sendBannedResponse(res, ban) {
  return res.status(403).json({
    error: ban?.expires_at
      ? `Compte banni jusqu’au ${formatDateTime(ban.expires_at)}.`
      : "Compte banni définitivement.",
    code: "ACCOUNT_BANNED",
    ban: serializeBan(ban)
  });
}

async function recordModerationAction(adminId, targetUserId, actionType, details = {}, reportId = null, client = pool) {
  await client.query(
    `INSERT INTO moderation_actions (admin_id, target_user_id, report_id, action_type, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [adminId, targetUserId || null, reportId || null, actionType, JSON.stringify(details || {})]
  );
  await recordAudit(pool, { category: "sanction", action: actionType, userId: targetUserId || null, adminId, details: { ...(details || {}), reportId: reportId || null } });
}

async function notifyAccountUpdated(userId, message = "Votre compte a été modifié par un administrateur.") {
  const result = await pool.query(
    "SELECT progress, progress_revision FROM users WHERE id = $1",
    [userId]
  );
  if (!result.rowCount) return;
  sendTo(userId, {
    type: "account_updated",
    message,
    progress: result.rows[0].progress || null,
    revision: Number(result.rows[0].progress_revision || 0)
  });
}

function parsePositiveUserId(raw) {
  const value = String(raw || "");
  return /^\d+$/.test(value) && BigInt(value) > 0n ? value : null;
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

    const activeBan = await getActiveBan(result.rows[0].id);
    if (activeBan) return sendBannedResponse(res, activeBan);

    req.authTokenHash = hashToken(token);
    req.userId = normalizeId(result.rows[0].id);
    req.username = result.rows[0].username;
    pool.query("UPDATE users SET last_seen_at = NOW() WHERE id = $1", [req.userId]).catch(() => {});
    next();
  } catch (error) {
    next(error);
  }
}

async function adminAuthMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Authentification administrateur requise.", code: "ADMIN_AUTH_REQUIRED" });

    const result = await pool.query(
      `SELECT a.id, a.username, a.display_name
       FROM admin_sessions s
       JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND a.disabled = FALSE`,
      [hashToken(token)]
    );
    if (!result.rowCount) return res.status(401).json({ error: "Session administrateur expirée.", code: "ADMIN_SESSION_EXPIRED" });

    req.adminTokenHash = hashToken(token);
    req.adminId = normalizeId(result.rows[0].id);
    req.adminUsername = result.rows[0].username;
    req.adminDisplayName = result.rows[0].display_name;
    next();
  } catch (error) {
    next(error);
  }
}

const adminLoginAttempts = new Map();
function canAttemptAdminLogin(key) {
  const now = Date.now();
  const record = adminLoginAttempts.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (record.resetAt <= now) {
    adminLoginAttempts.set(key, { count: 0, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  return record.count < 10;
}
function registerAdminLoginFailure(key) {
  const now = Date.now();
  const record = adminLoginAttempts.get(key) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  record.count += 1;
  adminLoginAttempts.set(key, record);
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

function broadcastToAllPlayers(payload) {
  const serialized = JSON.stringify(payload);
  onlineSockets.forEach(ws => {
    if (ws && ws.readyState === 1) ws.send(serialized);
  });
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

app.get("/api/popups/active", async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    let user = null;
    if (token) {
      const userResult = await pool.query(
        `SELECT u.id, u.username, u.username_key, u.created_at, u.last_login_at, u.previous_login_at, u.last_seen_at, u.progress,
                EXISTS (SELECT 1 FROM admins a WHERE a.username_key = u.username_key AND a.disabled = FALSE) AS is_admin_player
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`,
        [hashToken(token)]
      );
      user = userResult.rows[0] || null;
    }
    const result = await pool.query(
      `SELECT p.*, a.display_name AS created_by
       FROM game_popups p
       LEFT JOIN admins a ON a.id = p.created_by_admin_id
       WHERE p.enabled = TRUE AND p.starts_at <= NOW() AND p.expires_at > NOW()
       ORDER BY p.starts_at ASC, p.id ASC`
    );
    const visible = result.rows.filter(row => popupMatchesUser(row.targeting, user));
    let claimedIds = new Set();
    if (user && visible.some(row => normalizeRewardBundle(row.reward).length)) {
      const claims = await pool.query("SELECT popup_id FROM popup_claims WHERE user_id = $1 AND popup_id = ANY($2::bigint[])", [user.id, visible.map(row => String(row.id))]);
      claimedIds = new Set(claims.rows.map(row => String(row.popup_id)));
    }
    res.json({ popups: visible.map(row => serializePopup({ ...row, claimed: claimedIds.has(String(row.id)) })), serverTime: Date.now() });
  } catch (error) { next(error); }
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

    const createdUser = await getUserByKey(normalizeUsername(result.username));
    if (createdUser) {
      await pool.query("UPDATE users SET previous_login_at = last_login_at, last_login_at = NOW(), last_seen_at = NOW() WHERE id = $1", [createdUser.id]);
      await recordAudit(pool, { category: "connection", action: "account_registered", userId: createdUser.id, details: { username: result.username }, ip: req.ip });
    }
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
    const activeBan = await getActiveBan(user.id);
    if (activeBan) return sendBannedResponse(res, activeBan);
    const token = await createSession(user.id);
    await pool.query("UPDATE users SET previous_login_at = COALESCE(last_login_at, created_at), last_login_at = NOW(), last_seen_at = NOW() WHERE id = $1", [user.id]);
    await recordAudit(pool, { category: "connection", action: "login", userId: user.id, details: { username: user.username }, ip: req.ip });
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
      "SELECT progress, progress_updated_at, progress_revision FROM users WHERE id = $1",
      [req.userId]
    );
    const user = result.rows[0];
    const revision = Number(user?.progress_revision || 0);
    res.json({
      progress: user?.progress && typeof user.progress === "object" ? user.progress : null,
      updatedAt: toMillis(user?.progress_updated_at),
      revision,
      authoritative: revision > 0
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

    const expectedRevision = Number.isInteger(Number(req.body?.revision)) ? Number(req.body.revision) : null;
    const result = expectedRevision === null
      ? await pool.query(
          `UPDATE users
           SET progress = $1::jsonb, progress_updated_at = NOW(), progress_revision = progress_revision + 1
           WHERE id = $2
           RETURNING progress_updated_at, progress_revision`,
          [serialized, req.userId]
        )
      : await pool.query(
          `UPDATE users
           SET progress = $1::jsonb, progress_updated_at = NOW(), progress_revision = progress_revision + 1
           WHERE id = $2 AND progress_revision = $3
           RETURNING progress_updated_at, progress_revision`,
          [serialized, req.userId, expectedRevision]
        );

    if (!result.rowCount) {
      const current = await pool.query(
        "SELECT progress, progress_updated_at, progress_revision FROM users WHERE id = $1",
        [req.userId]
      );
      return res.status(409).json({
        error: "Votre compte a été modifié depuis une autre session ou par un administrateur.",
        code: "PROGRESS_OUTDATED",
        progress: current.rows[0]?.progress || null,
        updatedAt: toMillis(current.rows[0]?.progress_updated_at),
        revision: Number(current.rows[0]?.progress_revision || 0)
      });
    }

    res.json({
      ok: true,
      updatedAt: toMillis(result.rows[0]?.progress_updated_at),
      revision: Number(result.rows[0]?.progress_revision || 0)
    });
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
    if (normalizeId(target.id) === req.userId) return res.status(400).json({ error: "Vous ne pouvez pas vous signaler vous-même." });
    if (!(await areFriends(req.userId, target.id))) {
      return res.status(403).json({ error: "Ce joueur ne fait plus partie de vos amis." });
    }

    const category = sanitizeText(req.body?.category || "Autre", 80) || "Autre";
    const reason = sanitizeText(req.body?.reason, 500);
    if (reason.length < 10) {
      return res.status(400).json({ error: "Décrivez le problème en au moins 10 caractères." });
    }

    const recentDuplicate = await pool.query(
      `SELECT 1 FROM reports
       WHERE from_user_id = $1 AND target_user_id = $2
         AND created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [req.userId, target.id]
    );
    if (recentDuplicate.rowCount) {
      return res.status(429).json({ error: "Un signalement concernant ce joueur vient déjà d’être envoyé." });
    }

    const sourceUrl = getSafeSourceUrl(req, req.body?.sourceUrl);
    const inserted = await pool.query(
      `INSERT INTO reports (from_user_id, target_user_id, category, reason, source_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [req.userId, target.id, category, reason, sourceUrl]
    );
    const report = inserted.rows[0];

    const infoResult = await pool.query(
      `SELECT u.id, u.username, u.created_at, u.progress, u.progress_updated_at, u.progress_revision,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS session_count,
              (SELECT COUNT(*) FROM reports r WHERE r.target_user_id = u.id) AS report_count,
              (SELECT COUNT(*) FROM friendships f WHERE f.user_low_id = u.id OR f.user_high_id = u.id) AS friend_count
       FROM users u WHERE u.id = $1`,
      [target.id]
    );
    const targetInfo = infoResult.rows[0] || {};
    const progressInfo = normalizeProgress(targetInfo.progress);
    const manageUrl = buildAdminPanelUrl(req, { report: report.id, user: target.id }, sourceUrl);
    const accountInfo = [
      `ID : ${target.id}`,
      `Créé le : ${formatDateTime(targetInfo.created_at)}`,
      `Statut : ${onlineSockets.has(normalizeId(target.id)) ? "En ligne" : "Hors ligne"}`,
      `Pièces : ${Math.max(0, Number(progressInfo.coins || 0))}`,
      `Cartes possédées : ${countOwnedCards(progressInfo)}`,
      `Amis : ${Number(targetInfo.friend_count || 0)}`,
      `Signalements reçus : ${Number(targetInfo.report_count || 0)}`,
      `Sessions actives : ${Number(targetInfo.session_count || 0)}`
    ].join("\n");

    const components = manageUrl ? [{
      type: 1,
      components: [{ type: 2, style: 5, label: "Gérer le signalement", url: manageUrl }]
    }] : [];

    const webhookResult = await sendDiscordWebhook(REPORTS_DISCORD_WEBHOOK_URL, {
      username: sanitizeDiscordText(`${GAME_NAME} • Modération`, 80),
      embeds: [{
        title: `🚨 Signalement reçu sur : ${sanitizeDiscordText(GAME_NAME, 180)}`,
        color: 15158332,
        fields: [
          { name: "Par", value: sanitizeDiscordText(req.username, 100), inline: true },
          { name: "Catégorie", value: sanitizeDiscordText(category, 100), inline: true },
          { name: "Raison", value: sanitizeDiscordText(reason, 1000), inline: false },
          { name: "Personne signalée", value: `${sanitizeDiscordText(target.username, 100)} (ID ${target.id})`, inline: false },
          { name: "Informations complètes du compte", value: sanitizeDiscordText(accountInfo, 1000), inline: false }
        ],
        footer: { text: `Signalement #${report.id} • ${formatDateTime(report.created_at)}` },
        timestamp: new Date(report.created_at).toISOString()
      }],
      components
    });

    await pool.query(
      `UPDATE reports SET webhook_delivered = $1, webhook_error = $2 WHERE id = $3`,
      [webhookResult.delivered, webhookResult.error, report.id]
    );

    res.json({
      ok: true,
      reportId: normalizeId(report.id),
      discordDelivered: webhookResult.delivered,
      warning: webhookResult.delivered ? null : "Le signalement est enregistré, mais le webhook Discord n’a pas pu être envoyé."
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/messages", authMiddleware, async (req, res, next) => {
  try {
    const activeMute = await getActiveMute(pool, req.userId);
    if (activeMute) {
      return res.status(403).json({
        error: `Vous êtes muet jusqu’au ${formatDateTime(activeMute.expires_at)}.`,
        code: "ACCOUNT_MUTED",
        mute: { id: normalizeId(activeMute.id), reason: activeMute.reason, expiresAt: toMillis(activeMute.expires_at) }
      });
    }
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


async function mutateUserProgress(userId, mutator) {
  return withTransaction(async client => {
    const locked = await client.query(
      "SELECT progress, progress_revision FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    if (!locked.rowCount) return null;
    const current = normalizeProgress(locked.rows[0].progress);
    const next = await mutator(JSON.parse(JSON.stringify(current)), client);
    const serialized = JSON.stringify(next ?? {});
    if (Buffer.byteLength(serialized, "utf8") > 450 * 1024) {
      const error = new Error("La progression modifiée dépasse 450 Ko.");
      error.statusCode = 413;
      throw error;
    }
    const updated = await client.query(
      `UPDATE users
       SET progress = $1::jsonb, progress_updated_at = NOW(), progress_revision = progress_revision + 1
       WHERE id = $2
       RETURNING progress, progress_updated_at, progress_revision`,
      [serialized, userId]
    );
    return updated.rows[0];
  });
}

function parseAdminMutationMode(value) {
  return value === "set" ? "set" : "adjust";
}

function parseAdminAmount(value, { min = -100000000, max = 100000000 } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < min || amount > max) return null;
  return amount;
}

app.post("/api/admin/login", async (req, res, next) => {
  try {
    const attemptKey = `${req.ip || req.socket.remoteAddress || "unknown"}:${normalizeUsername(req.body?.username)}`;
    if (!canAttemptAdminLogin(attemptKey)) {
      return res.status(429).json({ error: "Trop de tentatives. Réessayez dans quelques minutes." });
    }
    const usernameKey = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    const result = await pool.query(
      "SELECT id, username, display_name, password_hash, disabled FROM admins WHERE username_key = $1",
      [usernameKey]
    );
    const admin = result.rows[0];
    if (!admin || admin.disabled || !bcrypt.compareSync(password, admin.password_hash)) {
      registerAdminLoginFailure(attemptKey);
      return res.status(401).json({ error: "Identifiants administrateur incorrects." });
    }
    adminLoginAttempts.delete(attemptKey);
    const token = await withTransaction(async client => {
      await client.query("DELETE FROM admin_sessions WHERE admin_id = $1 OR expires_at <= NOW()", [admin.id]);
      const sessionToken = await createAdminSession(admin.id, client);
      await client.query("UPDATE admins SET last_login_at = NOW() WHERE id = $1", [admin.id]);
      return sessionToken;
    });
    res.json({ token, username: admin.username, displayName: admin.display_name, expiresInHours: 12 });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/logout", adminAuthMiddleware, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM admin_sessions WHERE token_hash = $1", [req.adminTokenHash]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/admin/me", adminAuthMiddleware, (req, res) => {
  res.json({ username: req.adminUsername, displayName: req.adminDisplayName });
});

app.get("/api/admin/popups", adminAuthMiddleware, async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.*, a.display_name AS created_by
       FROM game_popups p
       LEFT JOIN admins a ON a.id = p.created_by_admin_id
       ORDER BY p.created_at DESC, p.id DESC`
    );
    res.json({ popups: result.rows.map(serializePopup) });
  } catch (error) { next(error); }
});

app.post("/api/admin/popups", adminAuthMiddleware, async (req, res, next) => {
  try {
    const popup = normalizePopupPayload(req.body || {});
    const result = await pool.query(
      `INSERT INTO game_popups
        (title, description, footer, images, buttons, targeting, reward, enabled, starts_at, expires_at, created_by_admin_id)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11)
       RETURNING *`,
      [popup.title, popup.description, popup.footer, JSON.stringify(popup.images), JSON.stringify(popup.buttons), JSON.stringify(popup.targeting), JSON.stringify(popup.reward), popup.enabled, popup.startsAt, popup.expiresAt, req.adminId]
    );
    const serialized = serializePopup({ ...result.rows[0], created_by: req.adminDisplayName });
    await recordAudit(pool, { category: "admin", action: "popup_created", adminId: req.adminId, details: { popupId: serialized.id, title: serialized.title, targeting: serialized.targeting, reward: serialized.reward } });
    broadcastToAllPlayers({ type: "game_popup_refresh" });
    res.status(201).json({ popup: serialized });
  } catch (error) { next(error); }
});

app.put("/api/admin/popups/:id", adminAuthMiddleware, async (req, res, next) => {
  try {
    const popupId = parsePositiveUserId(req.params.id);
    if (!popupId) return res.status(400).json({ error: "Identifiant de pop-up invalide." });
    const popup = normalizePopupPayload(req.body || {});
    const result = await pool.query(
      `UPDATE game_popups
       SET title = $1, description = $2, footer = $3, images = $4::jsonb,
           buttons = $5::jsonb, targeting = $6::jsonb, reward = $7::jsonb,
           enabled = $8, starts_at = $9, expires_at = $10, updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [popup.title, popup.description, popup.footer, JSON.stringify(popup.images), JSON.stringify(popup.buttons), JSON.stringify(popup.targeting), JSON.stringify(popup.reward), popup.enabled, popup.startsAt, popup.expiresAt, popupId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Pop-up introuvable." });
    const serialized = serializePopup({ ...result.rows[0], created_by: req.adminDisplayName });
    await recordAudit(pool, { category: "admin", action: "popup_updated", adminId: req.adminId, details: { popupId: serialized.id, title: serialized.title, targeting: serialized.targeting, reward: serialized.reward } });
    broadcastToAllPlayers({ type: "game_popup_refresh" });
    res.json({ popup: serialized });
  } catch (error) { next(error); }
});

app.delete("/api/admin/popups/:id", adminAuthMiddleware, async (req, res, next) => {
  try {
    const popupId = parsePositiveUserId(req.params.id);
    if (!popupId) return res.status(400).json({ error: "Identifiant de pop-up invalide." });
    const result = await pool.query("DELETE FROM game_popups WHERE id = $1 RETURNING id", [popupId]);
    if (!result.rowCount) return res.status(404).json({ error: "Pop-up introuvable." });
    await recordAudit(pool, { category: "admin", action: "popup_deleted", adminId: req.adminId, details: { popupId } });
    broadcastToAllPlayers({ type: "game_popup_refresh" });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/admin/reports", adminAuthMiddleware, async (req, res, next) => {
  try {
    const status = sanitizeText(req.query.status || "", 24);
    const values = [];
    let where = "";
    if (["open", "reviewing", "resolved", "dismissed"].includes(status)) {
      values.push(status);
      where = "WHERE r.status = $1";
    }
    const result = await pool.query(
      `SELECT r.id, r.category, r.reason, r.status, r.created_at, r.webhook_delivered,
              reporter.username AS reporter_username,
              target.id AS target_user_id, target.username AS target_username,
              admin.display_name AS handled_by
       FROM reports r
       JOIN users reporter ON reporter.id = r.from_user_id
       JOIN users target ON target.id = r.target_user_id
       LEFT JOIN admins admin ON admin.id = r.handled_by_admin_id
       ${where}
       ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.created_at DESC
       LIMIT 200`,
      values
    );
    res.json({ reports: result.rows.map(row => ({
      id: normalizeId(row.id), category: row.category, reason: row.reason, status: row.status,
      createdAt: toMillis(row.created_at), discordDelivered: row.webhook_delivered,
      reporterUsername: row.reporter_username, targetUserId: normalizeId(row.target_user_id),
      targetUsername: row.target_username, handledBy: row.handled_by || null
    })) });
  } catch (error) { next(error); }
});

app.get("/api/admin/reports/:id", adminAuthMiddleware, async (req, res, next) => {
  try {
    const reportId = parsePositiveUserId(req.params.id);
    if (!reportId) return res.status(400).json({ error: "Identifiant de signalement invalide." });
    const result = await pool.query(
      `SELECT r.*, reporter.username AS reporter_username, reporter.created_at AS reporter_created_at,
              target.username AS target_username, target.created_at AS target_created_at,
              admin.display_name AS handled_by
       FROM reports r
       JOIN users reporter ON reporter.id = r.from_user_id
       JOIN users target ON target.id = r.target_user_id
       LEFT JOIN admins admin ON admin.id = r.handled_by_admin_id
       WHERE r.id = $1`,
      [reportId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Signalement introuvable." });
    const row = result.rows[0];
    res.json({ report: {
      id: normalizeId(row.id), category: row.category, reason: row.reason, status: row.status,
      createdAt: toMillis(row.created_at), reporterUserId: normalizeId(row.from_user_id),
      reporterUsername: row.reporter_username, targetUserId: normalizeId(row.target_user_id),
      targetUsername: row.target_username, webhookDelivered: row.webhook_delivered,
      webhookError: row.webhook_error || null, handledAt: toMillis(row.handled_at),
      handledBy: row.handled_by || null, resolutionNote: row.resolution_note || "", sourceUrl: row.source_url || null
    } });
  } catch (error) { next(error); }
});

app.put("/api/admin/reports/:id/status", adminAuthMiddleware, async (req, res, next) => {
  try {
    const reportId = parsePositiveUserId(req.params.id);
    const status = sanitizeText(req.body?.status, 24);
    const note = sanitizeText(req.body?.note, 500);
    if (!reportId || !["open", "reviewing", "resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ error: "Statut de signalement invalide." });
    }
    const result = await pool.query(
      `UPDATE reports
       SET status = $1, resolution_note = $2,
           handled_by_admin_id = CASE WHEN $1 IN ('resolved','dismissed') THEN $3 ELSE handled_by_admin_id END,
           handled_at = CASE WHEN $1 IN ('resolved','dismissed') THEN NOW() ELSE handled_at END
       WHERE id = $4
       RETURNING target_user_id`,
      [status, note || null, req.adminId, reportId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Signalement introuvable." });
    await recordModerationAction(req.adminId, result.rows[0].target_user_id, "report_status_changed", { status, note }, reportId);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.get("/api/admin/users/search", adminAuthMiddleware, async (req, res, next) => {
  try {
    const query = normalizeUsername(req.query.q || "");
    if (query.length < 1) return res.json({ users: [] });
    const result = await pool.query(
      `SELECT u.id, u.username, u.created_at, u.progress,
              EXISTS (
                SELECT 1 FROM bans b WHERE b.user_id = u.id AND b.revoked_at IS NULL
                  AND (b.expires_at IS NULL OR b.expires_at > NOW())
              ) AS banned,
              (SELECT COUNT(*) FROM reports r WHERE r.target_user_id = u.id) AS report_count
       FROM users u
       WHERE u.username_key LIKE '%' || $1 || '%' OR CAST(u.id AS TEXT) = $1
       ORDER BY u.username_key LIMIT 50`,
      [query]
    );
    res.json({ users: result.rows.map(row => ({
      id: normalizeId(row.id), username: row.username, createdAt: toMillis(row.created_at),
      online: onlineSockets.has(normalizeId(row.id)), banned: row.banned,
      coins: Math.max(0, Number(normalizeProgress(row.progress).coins || 0)),
      reportCount: Number(row.report_count || 0)
    })) });
  } catch (error) { next(error); }
});

app.get("/api/admin/users/:id", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    if (!userId) return res.status(400).json({ error: "Identifiant joueur invalide." });
    const result = await pool.query(
      `SELECT u.id, u.username, u.username_key, u.created_at, u.progress, u.progress_updated_at, u.progress_revision,
              (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id) AS session_count,
              (SELECT COUNT(*) FROM friendships f WHERE f.user_low_id = u.id OR f.user_high_id = u.id) AS friend_count,
              (SELECT COUNT(*) FROM messages m WHERE m.from_user_id = u.id OR m.to_user_id = u.id) AS message_count,
              (SELECT COUNT(*) FROM reports r WHERE r.target_user_id = u.id) AS reports_received,
              (SELECT COUNT(*) FROM reports r WHERE r.from_user_id = u.id) AS reports_sent
       FROM users u WHERE u.id = $1`,
      [userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Joueur introuvable." });
    const row = result.rows[0];
    const [activeBan, actions, reports] = await Promise.all([
      getActiveBan(userId),
      pool.query(
        `SELECT ma.action_type, ma.details, ma.created_at, a.display_name AS admin_name
         FROM moderation_actions ma JOIN admins a ON a.id = ma.admin_id
         WHERE ma.target_user_id = $1 ORDER BY ma.created_at DESC LIMIT 30`,
        [userId]
      ),
      pool.query(
        `SELECT r.id, r.category, r.reason, r.status, r.created_at, reporter.username AS reporter_username
         FROM reports r JOIN users reporter ON reporter.id = r.from_user_id
         WHERE r.target_user_id = $1 ORDER BY r.created_at DESC LIMIT 30`,
        [userId]
      )
    ]);
    res.json({ user: {
      id: normalizeId(row.id), username: row.username, createdAt: toMillis(row.created_at),
      online: onlineSockets.has(userId), progress: row.progress || null,
      progressUpdatedAt: toMillis(row.progress_updated_at), progressRevision: Number(row.progress_revision || 0),
      activeBan: serializeBan(activeBan), sessionCount: Number(row.session_count || 0),
      friendCount: Number(row.friend_count || 0), messageCount: Number(row.message_count || 0),
      reportsReceived: Number(row.reports_received || 0), reportsSent: Number(row.reports_sent || 0),
      actions: actions.rows.map(action => ({ type: action.action_type, details: action.details || {}, createdAt: toMillis(action.created_at), adminName: action.admin_name })),
      reports: reports.rows.map(report => ({ id: normalizeId(report.id), category: report.category, reason: report.reason, status: report.status, createdAt: toMillis(report.created_at), reporterUsername: report.reporter_username }))
    } });
  } catch (error) { next(error); }
});

app.put("/api/admin/users/:id/identity", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    if (!userId) return res.status(400).json({ error: "Identifiant joueur invalide." });
    const username = req.body?.username === undefined ? null : sanitizeText(req.body.username, 20);
    const newPassword = req.body?.newPassword === undefined ? null : String(req.body.newPassword || "");
    if (username !== null && !isValidUsername(username)) return res.status(400).json({ error: "Pseudo invalide." });
    if (newPassword !== null && newPassword.length < 8) return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 8 caractères." });
    if (username === null && newPassword === null) return res.status(400).json({ error: "Aucune modification demandée." });

    await withTransaction(async client => {
      if (username !== null) {
        await client.query("UPDATE users SET username = $1, username_key = $2 WHERE id = $3", [username, normalizeUsername(username), userId]);
      }
      if (newPassword !== null) {
        await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [bcrypt.hashSync(newPassword, 10), userId]);
        await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
      }
      await recordModerationAction(req.adminId, userId, "identity_updated", { usernameChanged: username !== null, passwordChanged: newPassword !== null }, null, client);
    });
    const ws = onlineSockets.get(userId);
    if (ws && newPassword !== null) {
      sendTo(userId, { type: "account_session_revoked", message: "Votre mot de passe a été réinitialisé par un administrateur. Reconnectez-vous." });
      setTimeout(() => ws.close(4005, "admin_session_revoked"), 300);
    }
    res.json({ ok: true });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Ce pseudo est déjà utilisé." });
    next(error);
  }
});

app.put("/api/admin/users/:id/progress", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    const incoming = req.body?.progress;
    if (!userId || !incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      return res.status(400).json({ error: "Progression invalide." });
    }
    const result = await mutateUserProgress(userId, async () => incoming);
    if (!result) return res.status(404).json({ error: "Joueur introuvable." });
    await recordModerationAction(req.adminId, userId, "progress_replaced", { revision: Number(result.progress_revision || 0) });
    await notifyAccountUpdated(userId, "Votre progression a été mise à jour par un administrateur.");
    res.json({ ok: true, revision: Number(result.progress_revision || 0), progress: result.progress });
  } catch (error) { next(error); }
});

app.post("/api/admin/users/:id/coins", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    const mode = parseAdminMutationMode(req.body?.mode);
    const amount = parseAdminAmount(req.body?.amount, { min: -100000000, max: 100000000 });
    if (!userId || amount === null) return res.status(400).json({ error: "Montant de pièces invalide." });
    const result = await mutateUserProgress(userId, async progress => {
      const current = Math.max(0, Number(progress.coins || 0));
      progress.coins = Math.max(0, mode === "set" ? amount : current + amount);
      return progress;
    });
    if (!result) return res.status(404).json({ error: "Joueur introuvable." });
    await recordModerationAction(req.adminId, userId, "coins_updated", { mode, amount, finalValue: Number(result.progress?.coins || 0) });
    await notifyAccountUpdated(userId, "Votre solde de pièces a été modifié par un administrateur.");
    res.json({ ok: true, coins: Number(result.progress?.coins || 0), revision: Number(result.progress_revision || 0) });
  } catch (error) { next(error); }
});

app.post("/api/admin/users/:id/cards", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    const cardId = sanitizeText(req.body?.cardId, 100);
    const mode = parseAdminMutationMode(req.body?.mode);
    const amount = parseAdminAmount(req.body?.amount, { min: -10000, max: 10000 });
    if (!userId || !/^[a-zA-Z0-9_-]{1,100}$/.test(cardId) || amount === null) {
      return res.status(400).json({ error: "Carte ou quantité invalide." });
    }
    const result = await mutateUserProgress(userId, async progress => {
      progress.collection = progress.collection && typeof progress.collection === "object" && !Array.isArray(progress.collection) ? progress.collection : {};
      const current = Math.max(0, Number(progress.collection[cardId] || 0));
      progress.collection[cardId] = Math.max(0, mode === "set" ? amount : current + amount);
      return progress;
    });
    if (!result) return res.status(404).json({ error: "Joueur introuvable." });
    const finalValue = Number(result.progress?.collection?.[cardId] || 0);
    await recordModerationAction(req.adminId, userId, "cards_updated", { cardId, mode, amount, finalValue });
    await notifyAccountUpdated(userId, "Votre collection de cartes a été modifiée par un administrateur.");
    res.json({ ok: true, cardId, count: finalValue, revision: Number(result.progress_revision || 0) });
  } catch (error) { next(error); }
});

app.post("/api/admin/users/:id/packs", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    const packId = sanitizeText(req.body?.packId, 100);
    const mode = parseAdminMutationMode(req.body?.mode);
    const amount = parseAdminAmount(req.body?.amount, { min: -10000, max: 10000 });
    if (!userId || !/^[a-zA-Z0-9_-]{1,100}$/.test(packId) || amount === null) {
      return res.status(400).json({ error: "Paquet ou quantité invalide." });
    }
    const result = await mutateUserProgress(userId, async progress => {
      progress.packs = progress.packs && typeof progress.packs === "object" && !Array.isArray(progress.packs) ? progress.packs : {};
      const current = Math.max(0, Number(progress.packs[packId] || 0));
      progress.packs[packId] = Math.max(0, mode === "set" ? amount : current + amount);
      return progress;
    });
    if (!result) return res.status(404).json({ error: "Joueur introuvable." });
    const finalValue = Number(result.progress?.packs?.[packId] || 0);
    await recordModerationAction(req.adminId, userId, "packs_updated", { packId, mode, amount, finalValue });
    await notifyAccountUpdated(userId, "Votre inventaire de paquets a été modifié par un administrateur.");
    res.json({ ok: true, packId, count: finalValue, revision: Number(result.progress_revision || 0) });
  } catch (error) { next(error); }
});

app.post("/api/admin/users/:id/reset-progress", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    if (!userId || String(req.body?.confirmation || "") !== "RESET") {
      return res.status(400).json({ error: "Confirmation RESET requise." });
    }
    const result = await pool.query(
      `UPDATE users SET progress = NULL, progress_updated_at = NOW(), progress_revision = progress_revision + 1
       WHERE id = $1 RETURNING progress_revision`,
      [userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Joueur introuvable." });
    await recordModerationAction(req.adminId, userId, "progress_reset", {});
    await notifyAccountUpdated(userId, "Votre progression a été réinitialisée par un administrateur.");
    res.json({ ok: true, revision: Number(result.rows[0].progress_revision || 0) });
  } catch (error) { next(error); }
});

app.post("/api/admin/users/:id/invalidate-sessions", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    if (!userId) return res.status(400).json({ error: "Identifiant joueur invalide." });
    const result = await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    await recordModerationAction(req.adminId, userId, "sessions_invalidated", { count: result.rowCount });
    const ws = onlineSockets.get(userId);
    if (ws) {
      sendTo(userId, { type: "account_session_revoked", message: "Vos sessions ont été fermées par un administrateur." });
      setTimeout(() => ws.close(4005, "admin_session_revoked"), 300);
    }
    res.json({ ok: true, invalidatedSessions: result.rowCount });
  } catch (error) { next(error); }
});

app.post("/api/admin/users/:id/ban", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    const reason = sanitizeText(req.body?.reason, 500);
    const durationMinutesRaw = req.body?.durationMinutes;
    const permanent = durationMinutesRaw === null || durationMinutesRaw === undefined || durationMinutesRaw === "";
    const durationMinutes = permanent ? null : parseAdminAmount(durationMinutesRaw, { min: 1, max: 5256000 });
    const reportId = req.body?.reportId ? parsePositiveUserId(req.body.reportId) : null;
    if (!userId || reason.length < 5 || (!permanent && durationMinutes === null)) {
      return res.status(400).json({ error: "Raison ou durée de bannissement invalide." });
    }

    const outcome = await withTransaction(async client => {
      const userResult = await client.query("SELECT id, username FROM users WHERE id = $1 FOR UPDATE", [userId]);
      if (!userResult.rowCount) return null;
      await client.query(
        `UPDATE bans SET revoked_at = NOW(), revoked_by_admin_id = $1, revoked_reason = 'Remplacé par un nouveau bannissement'
         WHERE user_id = $2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
        [req.adminId, userId]
      );
      const inserted = await client.query(
        `INSERT INTO bans (user_id, admin_id, reason, expires_at)
         VALUES ($1, $2, $3, CASE WHEN $4::integer IS NULL THEN NULL ELSE NOW() + make_interval(mins => $4::integer) END)
         RETURNING id, starts_at, expires_at`,
        [userId, req.adminId, reason, durationMinutes]
      );
      await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
      if (reportId) {
        await client.query(
          `UPDATE reports SET status = 'resolved', handled_by_admin_id = $1, handled_at = NOW(), resolution_note = $2
           WHERE id = $3 AND target_user_id = $4`,
          [req.adminId, `Bannissement : ${reason}`, reportId, userId]
        );
      }
      await recordModerationAction(req.adminId, userId, "user_banned", { reason, durationMinutes, permanent }, reportId, client);
      return { user: userResult.rows[0], ban: inserted.rows[0] };
    });
    if (!outcome) return res.status(404).json({ error: "Joueur introuvable." });

    const banPayload = {
      id: normalizeId(outcome.ban.id), reason, startsAt: toMillis(outcome.ban.starts_at),
      expiresAt: toMillis(outcome.ban.expires_at), permanent, adminName: req.adminDisplayName
    };
    const ws = onlineSockets.get(userId);
    if (ws) {
      sendTo(userId, { type: "account_banned", ban: banPayload });
      setTimeout(() => ws.close(4004, "account_banned"), 700);
    }

    const reportSource = reportId ? await pool.query("SELECT source_url FROM reports WHERE id = $1", [reportId]) : null;
    const manageUrl = buildAdminPanelUrl(req, { user: userId, action: "unban" }, reportSource?.rows?.[0]?.source_url || req.body?.sourceUrl || null);
    const durationLabel = permanent ? "Permanent" : `Jusqu’au ${formatDateTime(outcome.ban.expires_at)}`;
    const webhookResult = await sendDiscordWebhook(BANS_DISCORD_WEBHOOK_URL, {
      username: sanitizeDiscordText(`${GAME_NAME} • Sanctions`, 80),
      embeds: [{
        title: "🔨 Joueur banni",
        color: 10038562,
        fields: [
          { name: "Joueur", value: `${sanitizeDiscordText(outcome.user.username, 100)} (ID ${userId})`, inline: true },
          { name: "Administrateur", value: sanitizeDiscordText(req.adminDisplayName, 100), inline: true },
          { name: "Durée", value: sanitizeDiscordText(durationLabel, 200), inline: false },
          { name: "Raison", value: sanitizeDiscordText(reason, 1000), inline: false }
        ],
        timestamp: new Date().toISOString()
      }],
      components: manageUrl ? [{ type: 1, components: [{ type: 2, style: 5, label: "Débannir le joueur", url: manageUrl }] }] : []
    });
    res.json({ ok: true, ban: banPayload, discordDelivered: webhookResult.delivered, warning: webhookResult.delivered ? null : webhookResult.error });
  } catch (error) { next(error); }
});

app.post("/api/admin/users/:id/unban", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    const reason = sanitizeText(req.body?.reason || "Débannissement manuel", 500);
    if (!userId) return res.status(400).json({ error: "Identifiant joueur invalide." });
    const result = await pool.query(
      `UPDATE bans SET revoked_at = NOW(), revoked_by_admin_id = $1, revoked_reason = $2
       WHERE user_id = $3 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING id`,
      [req.adminId, reason, userId]
    );
    if (!result.rowCount) return res.status(409).json({ error: "Ce joueur n’a aucun bannissement actif." });
    await recordModerationAction(req.adminId, userId, "user_unbanned", { reason, banIds: result.rows.map(row => normalizeId(row.id)) });
    res.json({ ok: true, revokedBans: result.rowCount });
  } catch (error) { next(error); }
});

app.delete("/api/admin/users/:id", adminAuthMiddleware, async (req, res, next) => {
  try {
    const userId = parsePositiveUserId(req.params.id);
    if (!userId || String(req.body?.confirmation || "") !== "DELETE") {
      return res.status(400).json({ error: "Confirmation DELETE requise." });
    }
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING username", [userId]);
    if (!result.rowCount) return res.status(404).json({ error: "Joueur introuvable." });
    const ws = onlineSockets.get(userId);
    if (ws) ws.close(4000, "account_deleted_by_admin");
    res.json({ ok: true, deletedUsername: result.rows[0].username });
  } catch (error) { next(error); }
});

installExtensionRoutes({
  app, pool, authMiddleware, adminAuthMiddleware, normalizeId, toMillis,
  parsePositiveUserId, notifyAccountUpdated, sendTo, broadcastToAllPlayers,
  popupMatchesUser, onlineSockets
});

app.use(express.static(GAME_ROOT));

app.use((error, _req, res, _next) => {
  console.error("[ASTREA]", error);
  if (res.headersSent) return;
  const status = Number(error?.statusCode || 500);
  res.status(status).json({ error: status >= 500 ? "Erreur interne du serveur." : sanitizeText(error?.message || "Requête invalide.", 300) });
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

    const activeBan = await getActiveBan(result.rows[0].id);
    if (activeBan) {
      ws.send(JSON.stringify({ type: "account_banned", ban: serializeBan(activeBan) }));
      setTimeout(() => ws.close(4004, "account_banned"), 300);
      return;
    }

    const userId = normalizeId(result.rows[0].id);
    const username = result.rows[0].username;
    ws.userId = userId;
    ws.username = username;
    await pool.query("UPDATE users SET last_seen_at = NOW() WHERE id = $1", [userId]);
    await recordAudit(pool, { category: "connection", action: "websocket_connected", userId, details: { username }, ip: req.socket?.remoteAddress || "" });

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
