"use strict";

const crypto = require("crypto");

let maintenanceCache = {
  enabled: false,
  message: "Le jeu est temporairement en maintenance.",
  estimatedEndAt: null,
  updatedAt: null
};

function cleanText(value, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanMultiline(value, max = 5000) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
}

function positiveInt(value, min = 0, max = 100000000) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return null;
  return number;
}

function safeDate(value, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw Object.assign(new Error("Date obligatoire."), { statusCode: 400 });
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw Object.assign(new Error("Date invalide."), { statusCode: 400 });
  return date;
}

function safeHttpUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
    return parsed.toString().slice(0, 2000);
  } catch (_) {
    throw Object.assign(new Error("URL invalide."), { statusCode: 400 });
  }
}

function normalizeRewardBundle(value, { maxItems = 8 } = {}) {
  const source = Array.isArray(value) ? value : (value && typeof value === "object" ? [value] : []);
  const result = [];
  for (const raw of source) {
    const type = String(raw?.type || "").trim();
    const amount = positiveInt(raw?.amount ?? 1, 1, 10000000);
    if (!amount || !["coins", "pack", "card"].includes(type)) continue;
    if (type === "coins") result.push({ type, amount });
    if (type === "pack") {
      const packId = cleanText(raw?.packId, 100);
      if (/^[a-zA-Z0-9_-]{1,100}$/.test(packId)) result.push({ type, packId, amount });
    }
    if (type === "card") {
      const cardId = cleanText(raw?.cardId, 100);
      if (/^[a-zA-Z0-9_-]{1,100}$/.test(cardId)) result.push({ type, cardId, amount });
    }
    if (result.length >= maxItems) break;
  }
  return result;
}

function applyRewards(progress, rewards) {
  const next = progress && typeof progress === "object" && !Array.isArray(progress) ? progress : {};
  next.coins = Math.max(0, Number(next.coins || 0));
  next.packs = next.packs && typeof next.packs === "object" && !Array.isArray(next.packs) ? next.packs : {};
  next.collection = next.collection && typeof next.collection === "object" && !Array.isArray(next.collection) ? next.collection : {};
  for (const reward of normalizeRewardBundle(rewards, { maxItems: 100 })) {
    if (reward.type === "coins") next.coins += reward.amount;
    if (reward.type === "pack") next.packs[reward.packId] = Math.max(0, Number(next.packs[reward.packId] || 0)) + reward.amount;
    if (reward.type === "card") next.collection[reward.cardId] = Math.max(0, Number(next.collection[reward.cardId] || 0)) + reward.amount;
  }
  return next;
}

function rewardLabel(rewards) {
  return normalizeRewardBundle(rewards).map(reward => {
    if (reward.type === "coins") return `${reward.amount} pièce(s)`;
    if (reward.type === "pack") return `${reward.amount} paquet(s) ${reward.packId}`;
    return `${reward.amount} carte(s) ${reward.cardId}`;
  }).join(" · ");
}

async function mutateProgressInTransaction(client, userId, mutator) {
  const locked = await client.query("SELECT progress, progress_revision FROM users WHERE id = $1 FOR UPDATE", [userId]);
  if (!locked.rowCount) return null;
  const current = locked.rows[0].progress && typeof locked.rows[0].progress === "object" ? JSON.parse(JSON.stringify(locked.rows[0].progress)) : {};
  const next = await mutator(current);
  const serialized = JSON.stringify(next || {});
  if (Buffer.byteLength(serialized, "utf8") > 450 * 1024) {
    throw Object.assign(new Error("La progression dépasse la taille maximale autorisée."), { statusCode: 413 });
  }
  const updated = await client.query(
    `UPDATE users SET progress = $1::jsonb, progress_updated_at = NOW(), progress_revision = progress_revision + 1, last_seen_at = NOW()
     WHERE id = $2 RETURNING progress, progress_revision`,
    [serialized, userId]
  );
  return updated.rows[0];
}

async function recordAudit(pool, { category, action, userId = null, adminId = null, details = {}, ip = "" }) {
  const ipHash = ip ? crypto.createHash("sha256").update(String(ip)).digest("hex") : null;
  try {
    await pool.query(
      `INSERT INTO audit_logs (category, action, user_id, admin_id, details, ip_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [cleanText(category, 40) || "system", cleanText(action, 100) || "unknown", userId || null, adminId || null, JSON.stringify(details || {}), ipHash]
    );
  } catch (error) {
    console.warn("[ASTREA] Journalisation impossible :", error.message);
  }
}

async function getActiveMute(pool, userId) {
  const result = await pool.query(
    `SELECT m.id, m.reason, m.starts_at, m.expires_at, a.display_name AS admin_name
     FROM user_mutes m JOIN admins a ON a.id = m.admin_id
     WHERE m.user_id = $1 AND m.revoked_at IS NULL AND m.expires_at > NOW()
     ORDER BY m.starts_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

function serializeMute(row, normalizeId, toMillis) {
  if (!row) return null;
  return {
    id: normalizeId(row.id),
    reason: row.reason,
    startsAt: toMillis(row.starts_at),
    expiresAt: toMillis(row.expires_at),
    adminName: row.admin_name || null
  };
}

async function loadMaintenanceState(pool) {
  const result = await pool.query("SELECT value, updated_at FROM app_meta WHERE key = 'maintenance'");
  const value = result.rows[0]?.value || {};
  maintenanceCache = {
    enabled: value.enabled === true,
    message: cleanMultiline(value.message || "Le jeu est temporairement en maintenance.", 2000),
    estimatedEndAt: value.estimatedEndAt ? new Date(value.estimatedEndAt).getTime() : null,
    updatedAt: result.rows[0]?.updated_at ? new Date(result.rows[0].updated_at).getTime() : Date.now()
  };
  return maintenanceCache;
}

function getMaintenanceState() {
  return { ...maintenanceCache };
}

async function initializeExtensions(pool) {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS previous_login_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

    ALTER TABLE game_popups ADD COLUMN IF NOT EXISTS targeting JSONB NOT NULL DEFAULT '{"type":"all"}'::jsonb;
    ALTER TABLE game_popups ADD COLUMN IF NOT EXISTS reward JSONB;

    CREATE TABLE IF NOT EXISTS popup_claims (
      popup_id BIGINT NOT NULL REFERENCES game_popups(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (popup_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS user_warnings (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
      message VARCHAR(1000) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      acknowledged_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS user_warnings_user_idx ON user_warnings(user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS user_mutes (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE RESTRICT,
      reason VARCHAR(500) NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      revoked_by_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      revoked_reason VARCHAR(500)
    );
    CREATE INDEX IF NOT EXISTS user_mutes_active_idx ON user_mutes(user_id, revoked_at, expires_at);

    CREATE TABLE IF NOT EXISTS card_overrides (
      card_id VARCHAR(100) PRIMARY KEY,
      cost INTEGER,
      damage INTEGER,
      rarity VARCHAR(20),
      description TEXT,
      disabled BOOLEAN NOT NULL DEFAULT FALSE,
      disabled_until TIMESTAMPTZ,
      updated_by_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS game_events (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(140) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      rewards JSONB NOT NULL DEFAULT '[]'::jsonb,
      quests JSONB NOT NULL DEFAULT '[]'::jsonb,
      exclusive_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      created_by_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT game_events_dates CHECK (ends_at > starts_at)
    );
    CREATE INDEX IF NOT EXISTS game_events_active_idx ON game_events(enabled, starts_at, ends_at);

    CREATE TABLE IF NOT EXISTS event_claims (
      event_id BIGINT NOT NULL REFERENCES game_events(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS event_quest_claims (
      event_id BIGINT NOT NULL REFERENCES game_events(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_key VARCHAR(100) NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id, quest_key)
    );

    CREATE TABLE IF NOT EXISTS admin_quests (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(140) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      icon VARCHAR(16) NOT NULL DEFAULT '✦',
      quest_type VARCHAR(20) NOT NULL DEFAULT 'daily',
      event_key VARCHAR(80) NOT NULL,
      goal INTEGER NOT NULL,
      rewards JSONB NOT NULL DEFAULT '[]'::jsonb,
      event_id BIGINT REFERENCES game_events(id) ON DELETE SET NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      created_by_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT admin_quests_dates CHECK (ends_at > starts_at)
    );
    CREATE INDEX IF NOT EXISTS admin_quests_active_idx ON admin_quests(enabled, starts_at, ends_at);

    CREATE TABLE IF NOT EXISTS quest_claims (
      quest_id BIGINT NOT NULL REFERENCES admin_quests(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_key VARCHAR(80) NOT NULL,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (quest_id, user_id, period_key)
    );

    CREATE TABLE IF NOT EXISTS shop_offers (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(140) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      original_price INTEGER,
      rewards JSONB NOT NULL DEFAULT '[]'::jsonb,
      purchase_limit INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      created_by_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT shop_offers_dates CHECK (ends_at > starts_at)
    );
    CREATE INDEX IF NOT EXISTS shop_offers_active_idx ON shop_offers(enabled, starts_at, ends_at);

    CREATE TABLE IF NOT EXISTS shop_purchases (
      offer_id BIGINT NOT NULL REFERENCES shop_offers(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (offer_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS gift_codes (
      id BIGSERIAL PRIMARY KEY,
      code VARCHAR(40) NOT NULL UNIQUE,
      rewards JSONB NOT NULL DEFAULT '[]'::jsonb,
      max_uses INTEGER NOT NULL DEFAULT 0,
      uses_count INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      created_by_admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gift_code_redemptions (
      code_id BIGINT NOT NULL REFERENCES gift_codes(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (code_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      category VARCHAR(40) NOT NULL,
      action VARCHAR(100) NOT NULL,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      admin_id BIGINT REFERENCES admins(id) ON DELETE SET NULL,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_hash CHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_logs_category_idx ON audit_logs(category, created_at DESC);
  `);
  await loadMaintenanceState(pool);
}

function getPeriodKey(type, now = new Date()) {
  const date = new Date(now);
  if (type === "daily") return date.toISOString().slice(0, 10);
  if (type === "weekly") {
    const temp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = temp.getUTCDay() || 7;
    temp.setUTCDate(temp.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
    return `${temp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return "event";
}

function serializeEvent(row, normalizeId, toMillis) {
  return {
    id: normalizeId(row.id),
    title: row.title,
    description: row.description || "",
    imageUrl: row.image_url || "",
    rewards: Array.isArray(row.rewards) ? row.rewards : [],
    quests: Array.isArray(row.quests) ? row.quests : [],
    exclusiveCards: Array.isArray(row.exclusive_cards) ? row.exclusive_cards : [],
    enabled: Boolean(row.enabled),
    startsAt: toMillis(row.starts_at),
    endsAt: toMillis(row.ends_at),
    createdAt: toMillis(row.created_at),
    updatedAt: toMillis(row.updated_at),
    createdBy: row.created_by || null
  };
}

function serializeQuest(row, normalizeId, toMillis) {
  return {
    id: normalizeId(row.id),
    title: row.title,
    description: row.description || "",
    icon: row.icon || "✦",
    questType: row.quest_type,
    eventKey: row.event_key,
    goal: Number(row.goal || 1),
    rewards: Array.isArray(row.rewards) ? row.rewards : [],
    eventId: row.event_id ? normalizeId(row.event_id) : null,
    enabled: Boolean(row.enabled),
    startsAt: toMillis(row.starts_at),
    endsAt: toMillis(row.ends_at),
    periodKey: getPeriodKey(row.quest_type, new Date()),
    createdAt: toMillis(row.created_at),
    updatedAt: toMillis(row.updated_at)
  };
}

function serializeOffer(row, normalizeId, toMillis) {
  return {
    id: normalizeId(row.id),
    title: row.title,
    description: row.description || "",
    imageUrl: row.image_url || "",
    price: Number(row.price || 0),
    originalPrice: row.original_price === null ? null : Number(row.original_price),
    rewards: Array.isArray(row.rewards) ? row.rewards : [],
    purchaseLimit: Number(row.purchase_limit || 0),
    enabled: Boolean(row.enabled),
    startsAt: toMillis(row.starts_at),
    endsAt: toMillis(row.ends_at),
    createdAt: toMillis(row.created_at),
    updatedAt: toMillis(row.updated_at)
  };
}

function serializeCode(row, normalizeId, toMillis) {
  return {
    id: normalizeId(row.id),
    code: row.code,
    rewards: Array.isArray(row.rewards) ? row.rewards : [],
    maxUses: Number(row.max_uses || 0),
    usesCount: Number(row.uses_count || 0),
    enabled: Boolean(row.enabled),
    startsAt: toMillis(row.starts_at),
    expiresAt: toMillis(row.expires_at),
    createdAt: toMillis(row.created_at),
    updatedAt: toMillis(row.updated_at)
  };
}

function installExtensionRoutes(deps) {
  const {
    app, pool, authMiddleware, adminAuthMiddleware, normalizeId, toMillis,
    parsePositiveUserId, notifyAccountUpdated, sendTo, broadcastToAllPlayers, popupMatchesUser
  } = deps;

  async function optionalUser(req) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return null;
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const result = await pool.query(
      `SELECT u.id, u.username, u.username_key, u.created_at, u.last_seen_at, u.progress,
              EXISTS (SELECT 1 FROM admins a WHERE a.username_key = u.username_key AND a.disabled = FALSE) AS is_admin_player
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`,
      [hash]
    );
    if (!result.rowCount) return null;
    return result.rows[0];
  }

  app.get("/api/game/config", async (req, res, next) => {
    try {
      const user = await optionalUser(req);
      const [cards, events, quests, offers] = await Promise.all([
        pool.query(`SELECT card_id, cost, damage, rarity, description, disabled, disabled_until, updated_at FROM card_overrides ORDER BY card_id`),
        pool.query(`SELECT e.*, a.display_name AS created_by FROM game_events e LEFT JOIN admins a ON a.id = e.created_by_admin_id WHERE e.enabled = TRUE AND e.starts_at <= NOW() AND e.ends_at > NOW() ORDER BY e.starts_at, e.id`),
        pool.query(`SELECT * FROM admin_quests WHERE enabled = TRUE AND starts_at <= NOW() AND ends_at > NOW() ORDER BY starts_at, id`),
        pool.query(`SELECT * FROM shop_offers WHERE enabled = TRUE AND starts_at <= NOW() AND ends_at > NOW() ORDER BY starts_at, id`)
      ]);
      res.json({
        serverTime: Date.now(),
        maintenance: getMaintenanceState(),
        isAdminPlayer: Boolean(user?.is_admin_player),
        cardOverrides: cards.rows.map(row => ({
          cardId: row.card_id, cost: row.cost, damage: row.damage, rarity: row.rarity,
          description: row.description, disabled: Boolean(row.disabled), disabledUntil: toMillis(row.disabled_until), updatedAt: toMillis(row.updated_at)
        })),
        events: events.rows.map(row => serializeEvent(row, normalizeId, toMillis)),
        quests: quests.rows.map(row => serializeQuest(row, normalizeId, toMillis)),
        shopOffers: offers.rows.map(row => serializeOffer(row, normalizeId, toMillis))
      });
    } catch (error) { next(error); }
  });

  app.get("/api/account/moderation", authMiddleware, async (req, res, next) => {
    try {
      const [warnings, mute] = await Promise.all([
        pool.query(`SELECT w.id, w.message, w.created_at, w.acknowledged_at, a.display_name AS admin_name FROM user_warnings w JOIN admins a ON a.id = w.admin_id WHERE w.user_id = $1 ORDER BY w.created_at DESC LIMIT 20`, [req.userId]),
        getActiveMute(pool, req.userId)
      ]);
      res.json({
        warnings: warnings.rows.map(row => ({ id: normalizeId(row.id), message: row.message, createdAt: toMillis(row.created_at), acknowledgedAt: toMillis(row.acknowledged_at), adminName: row.admin_name })),
        activeMute: serializeMute(mute, normalizeId, toMillis)
      });
    } catch (error) { next(error); }
  });

  app.post("/api/account/warnings/:id/acknowledge", authMiddleware, async (req, res, next) => {
    try {
      const warningId = parsePositiveUserId(req.params.id);
      if (!warningId) return res.status(400).json({ error: "Avertissement invalide." });
      const result = await pool.query(`UPDATE user_warnings SET acknowledged_at = COALESCE(acknowledged_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id`, [warningId, req.userId]);
      if (!result.rowCount) return res.status(404).json({ error: "Avertissement introuvable." });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.post("/api/popups/:id/claim", authMiddleware, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const popupId = parsePositiveUserId(req.params.id);
      if (!popupId) return res.status(400).json({ error: "Pop-up invalide." });
      await client.query("BEGIN");
      const popup = await client.query(`SELECT id, title, reward, targeting FROM game_popups WHERE id = $1 AND enabled = TRUE AND starts_at <= NOW() AND expires_at > NOW() FOR UPDATE`, [popupId]);
      if (!popup.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Cette récompense n’est plus disponible." }); }
      const targetUserResult = await client.query(
        `SELECT u.id, u.username, u.username_key, u.created_at, u.last_login_at, u.previous_login_at, u.last_seen_at, u.progress,
                EXISTS (SELECT 1 FROM admins a WHERE a.username_key = u.username_key AND a.disabled = FALSE) AS is_admin_player
         FROM users u WHERE u.id = $1`, [req.userId]
      );
      if (!popupMatchesUser || !popupMatchesUser(popup.rows[0].targeting, targetUserResult.rows[0])) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "Cette récompense ne cible pas votre compte." });
      }
      const rewards = normalizeRewardBundle(popup.rows[0].reward);
      if (!rewards.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Cette pop-up ne contient aucune récompense." }); }
      const claim = await client.query(`INSERT INTO popup_claims (popup_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING popup_id`, [popupId, req.userId]);
      if (!claim.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Récompense déjà récupérée.", code: "ALREADY_CLAIMED" }); }
      const updated = await mutateProgressInTransaction(client, req.userId, progress => applyRewards(progress, rewards));
      await client.query("COMMIT");
      await recordAudit(pool, { category: "reward", action: "popup_claimed", userId: req.userId, details: { popupId, title: popup.rows[0].title, rewards } });
      await notifyAccountUpdated(req.userId, `Récompense de la pop-up « ${popup.rows[0].title} » récupérée.`);
      res.json({ ok: true, rewards, rewardLabel: rewardLabel(rewards), progress: updated.progress, revision: Number(updated.progress_revision || 0) });
    } catch (error) { try { await client.query("ROLLBACK"); } catch (_) {} next(error); }
    finally { client.release(); }
  });

  app.post("/api/events/:id/claim", authMiddleware, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const eventId = parsePositiveUserId(req.params.id);
      if (!eventId) return res.status(400).json({ error: "Événement invalide." });
      await client.query("BEGIN");
      const event = await client.query(`SELECT id, title, rewards, exclusive_cards FROM game_events WHERE id = $1 AND enabled = TRUE AND starts_at <= NOW() AND ends_at > NOW() FOR UPDATE`, [eventId]);
      if (!event.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Événement indisponible." }); }
      const exclusiveRewards = (Array.isArray(event.rows[0].exclusive_cards) ? event.rows[0].exclusive_cards : []).map(cardId => ({ type: "card", cardId, amount: 1 }));
      const rewards = normalizeRewardBundle([...(Array.isArray(event.rows[0].rewards) ? event.rows[0].rewards : []), ...exclusiveRewards], { maxItems: 60 });
      if (!rewards.length) { await client.query("ROLLBACK"); return res.status(400).json({ error: "Cet événement ne contient aucune récompense immédiate." }); }
      const claim = await client.query(`INSERT INTO event_claims (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id`, [eventId, req.userId]);
      if (!claim.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Récompense d’événement déjà récupérée.", code: "ALREADY_CLAIMED" }); }
      const updated = await mutateProgressInTransaction(client, req.userId, progress => {
        applyRewards(progress, rewards);
        progress.liveEventClaims = progress.liveEventClaims && typeof progress.liveEventClaims === "object" ? progress.liveEventClaims : {};
        progress.liveEventClaims[String(eventId)] = true;
        return progress;
      });
      await client.query("COMMIT");
      await recordAudit(pool, { category: "reward", action: "event_claimed", userId: req.userId, details: { eventId, title: event.rows[0].title, rewards } });
      await notifyAccountUpdated(req.userId, `Récompense de l’événement « ${event.rows[0].title} » récupérée.`);
      res.json({ ok: true, rewards, progress: updated.progress, revision: Number(updated.progress_revision || 0) });
    } catch (error) { try { await client.query("ROLLBACK"); } catch (_) {} next(error); }
    finally { client.release(); }
  });

  app.post("/api/events/:id/quests/:questKey/claim", authMiddleware, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const eventId = parsePositiveUserId(req.params.id);
      const questKey = cleanText(req.params.questKey, 100);
      if (!eventId || !/^[a-zA-Z0-9_-]{1,100}$/.test(questKey)) return res.status(400).json({ error: "Quête d’événement invalide." });
      await client.query("BEGIN");
      const eventResult = await client.query(`SELECT id, title, quests FROM game_events WHERE id = $1 AND enabled = TRUE AND starts_at <= NOW() AND ends_at > NOW() FOR UPDATE`, [eventId]);
      if (!eventResult.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Événement indisponible." }); }
      const eventRow = eventResult.rows[0];
      const eventQuests = Array.isArray(eventRow.quests) ? eventRow.quests : [];
      const quest = eventQuests.find((entry, index) => String(entry?.id || `event_quest_${index + 1}`) === questKey);
      if (!quest) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Quête d’événement introuvable." }); }
      const goal = positiveInt(quest.goal, 1, 1000000) || 1;
      const userResult = await client.query("SELECT progress FROM users WHERE id = $1 FOR UPDATE", [req.userId]);
      const userProgress = userResult.rows[0]?.progress || {};
      const stateKey = `${eventId}:${questKey}`;
      const liveState = userProgress.liveEventQuests?.[stateKey];
      if (!liveState || Number(liveState.progress || 0) < goal) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Objectif de quête d’événement non terminé." });
      }
      const claim = await client.query(`INSERT INTO event_quest_claims (event_id, user_id, quest_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING event_id`, [eventId, req.userId, questKey]);
      if (!claim.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Récompense déjà récupérée.", code: "ALREADY_CLAIMED" }); }
      const rewards = normalizeRewardBundle(quest.rewards || quest.reward);
      const updated = await mutateProgressInTransaction(client, req.userId, next => {
        applyRewards(next, rewards);
        next.liveEventQuests = next.liveEventQuests && typeof next.liveEventQuests === "object" ? next.liveEventQuests : {};
        next.liveEventQuests[stateKey] = { ...(next.liveEventQuests[stateKey] || {}), progress: goal, claimed: true };
        return next;
      });
      await client.query("COMMIT");
      await recordAudit(pool, { category: "reward", action: "event_quest_claimed", userId: req.userId, details: { eventId, questKey, title: quest.title || questKey, rewards } });
      await notifyAccountUpdated(req.userId, `Récompense de quête d’événement récupérée.`);
      res.json({ ok: true, rewards, progress: updated.progress, revision: Number(updated.progress_revision || 0) });
    } catch (error) { try { await client.query("ROLLBACK"); } catch (_) {} next(error); }
    finally { client.release(); }
  });

  app.post("/api/quests/:id/claim", authMiddleware, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const questId = parsePositiveUserId(req.params.id);
      if (!questId) return res.status(400).json({ error: "Quête invalide." });
      await client.query("BEGIN");
      const quest = await client.query(`SELECT * FROM admin_quests WHERE id = $1 AND enabled = TRUE AND starts_at <= NOW() AND ends_at > NOW() FOR UPDATE`, [questId]);
      if (!quest.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Quête indisponible." }); }
      const row = quest.rows[0];
      const periodKey = getPeriodKey(row.quest_type, new Date());
      const user = await client.query("SELECT progress FROM users WHERE id = $1 FOR UPDATE", [req.userId]);
      const progress = user.rows[0]?.progress || {};
      const live = progress.liveQuests?.[String(questId)];
      if (!live || live.periodKey !== periodKey || Number(live.progress || 0) < Number(row.goal || 1)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Objectif de quête non terminé." });
      }
      const claim = await client.query(`INSERT INTO quest_claims (quest_id, user_id, period_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING quest_id`, [questId, req.userId, periodKey]);
      if (!claim.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Récompense de quête déjà récupérée.", code: "ALREADY_CLAIMED" }); }
      const rewards = normalizeRewardBundle(row.rewards);
      const updated = await mutateProgressInTransaction(client, req.userId, next => {
        applyRewards(next, rewards);
        next.liveQuests = next.liveQuests && typeof next.liveQuests === "object" ? next.liveQuests : {};
        next.liveQuests[String(questId)] = { ...(next.liveQuests[String(questId)] || {}), periodKey, claimed: true, progress: Number(row.goal || 1) };
        return next;
      });
      await client.query("COMMIT");
      await recordAudit(pool, { category: "reward", action: "quest_claimed", userId: req.userId, details: { questId, title: row.title, periodKey, rewards } });
      await notifyAccountUpdated(req.userId, `Récompense de la quête « ${row.title} » récupérée.`);
      res.json({ ok: true, rewards, progress: updated.progress, revision: Number(updated.progress_revision || 0) });
    } catch (error) { try { await client.query("ROLLBACK"); } catch (_) {} next(error); }
    finally { client.release(); }
  });

  app.post("/api/shop/offers/:id/purchase", authMiddleware, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const offerId = parsePositiveUserId(req.params.id);
      if (!offerId) return res.status(400).json({ error: "Offre invalide." });
      await client.query("BEGIN");
      const offer = await client.query(`SELECT * FROM shop_offers WHERE id = $1 AND enabled = TRUE AND starts_at <= NOW() AND ends_at > NOW() FOR UPDATE`, [offerId]);
      if (!offer.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Cette offre n’est plus disponible." }); }
      const row = offer.rows[0];
      const purchase = await client.query(`SELECT quantity FROM shop_purchases WHERE offer_id = $1 AND user_id = $2 FOR UPDATE`, [offerId, req.userId]);
      const currentQuantity = Number(purchase.rows[0]?.quantity || 0);
      if (row.purchase_limit > 0 && currentQuantity >= row.purchase_limit) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Limite d’achat atteinte pour cette offre." });
      }
      const price = Math.max(0, Number(row.price || 0));
      const rewards = normalizeRewardBundle(row.rewards);
      const updated = await mutateProgressInTransaction(client, req.userId, progress => {
        const coins = Math.max(0, Number(progress.coins || 0));
        if (coins < price) throw Object.assign(new Error("Vous n’avez pas assez de pièces."), { statusCode: 409 });
        progress.coins = coins - price;
        return applyRewards(progress, rewards);
      });
      await client.query(
        `INSERT INTO shop_purchases (offer_id, user_id, quantity) VALUES ($1, $2, 1)
         ON CONFLICT (offer_id, user_id) DO UPDATE SET quantity = shop_purchases.quantity + 1, updated_at = NOW()`,
        [offerId, req.userId]
      );
      await client.query("COMMIT");
      await recordAudit(pool, { category: "purchase", action: "remote_offer_purchased", userId: req.userId, details: { offerId, title: row.title, price, rewards } });
      await notifyAccountUpdated(req.userId, `Achat effectué : ${row.title}.`);
      res.json({ ok: true, rewards, price, progress: updated.progress, revision: Number(updated.progress_revision || 0) });
    } catch (error) { try { await client.query("ROLLBACK"); } catch (_) {} next(error); }
    finally { client.release(); }
  });

  app.post("/api/gift-codes/redeem", authMiddleware, async (req, res, next) => {
    const client = await pool.connect();
    try {
      const code = cleanText(req.body?.code, 40).toUpperCase().replace(/\s+/g, "");
      if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return res.status(400).json({ error: "Code cadeau invalide." });
      await client.query("BEGIN");
      const found = await client.query(`SELECT * FROM gift_codes WHERE code = $1 AND enabled = TRUE AND starts_at <= NOW() AND (expires_at IS NULL OR expires_at > NOW()) FOR UPDATE`, [code]);
      if (!found.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Code invalide ou expiré." }); }
      const row = found.rows[0];
      if (row.max_uses > 0 && row.uses_count >= row.max_uses) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Ce code a atteint sa limite d’utilisation." }); }
      const redemption = await client.query(`INSERT INTO gift_code_redemptions (code_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING code_id`, [row.id, req.userId]);
      if (!redemption.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ error: "Vous avez déjà utilisé ce code.", code: "ALREADY_REDEEMED" }); }
      const rewards = normalizeRewardBundle(row.rewards);
      const updated = await mutateProgressInTransaction(client, req.userId, progress => applyRewards(progress, rewards));
      await client.query("UPDATE gift_codes SET uses_count = uses_count + 1, updated_at = NOW() WHERE id = $1", [row.id]);
      await client.query("COMMIT");
      await recordAudit(pool, { category: "reward", action: "gift_code_redeemed", userId: req.userId, details: { code, rewards } });
      await notifyAccountUpdated(req.userId, `Code cadeau ${code} utilisé.`);
      res.json({ ok: true, code, rewards, rewardLabel: rewardLabel(rewards), progress: updated.progress, revision: Number(updated.progress_revision || 0) });
    } catch (error) { try { await client.query("ROLLBACK"); } catch (_) {} next(error); }
    finally { client.release(); }
  });

  app.post("/api/logs/client", authMiddleware, async (req, res, next) => {
    try {
      const event = cleanText(req.body?.event, 80);
      if (!["purchase", "pack_open", "match_finished"].includes(event)) return res.status(400).json({ error: "Événement de journal invalide." });
      const category = event === "purchase" ? "purchase" : event === "pack_open" ? "pack" : "game";
      await recordAudit(pool, { category, action: event, userId: req.userId, details: req.body?.details || {}, ip: req.ip });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  // -------------------- Sanctions avancées --------------------
  app.get("/api/admin/users/:id/moderation", adminAuthMiddleware, async (req, res, next) => {
    try {
      const userId = parsePositiveUserId(req.params.id);
      if (!userId) return res.status(400).json({ error: "Joueur invalide." });
      const [warnings, mute] = await Promise.all([
        pool.query(`SELECT w.id, w.message, w.created_at, w.acknowledged_at, a.display_name AS admin_name FROM user_warnings w JOIN admins a ON a.id = w.admin_id WHERE w.user_id = $1 ORDER BY w.created_at DESC LIMIT 50`, [userId]),
        getActiveMute(pool, userId)
      ]);
      res.json({
        warnings: warnings.rows.map(row => ({ id: normalizeId(row.id), message: row.message, createdAt: toMillis(row.created_at), acknowledgedAt: toMillis(row.acknowledged_at), adminName: row.admin_name })),
        activeMute: serializeMute(mute, normalizeId, toMillis)
      });
    } catch (error) { next(error); }
  });

  app.post("/api/admin/users/:id/warnings", adminAuthMiddleware, async (req, res, next) => {
    try {
      const userId = parsePositiveUserId(req.params.id);
      const message = cleanMultiline(req.body?.message, 1000);
      if (!userId || message.length < 3) return res.status(400).json({ error: "Message d’avertissement invalide." });
      const result = await pool.query(`INSERT INTO user_warnings (user_id, admin_id, message) VALUES ($1, $2, $3) RETURNING id, created_at`, [userId, req.adminId, message]);
      await recordAudit(pool, { category: "sanction", action: "warning_issued", userId, adminId: req.adminId, details: { message } });
      sendTo(userId, { type: "account_warning", warning: { id: normalizeId(result.rows[0].id), message, createdAt: toMillis(result.rows[0].created_at), adminName: req.adminDisplayName } });
      res.status(201).json({ ok: true, warningId: normalizeId(result.rows[0].id) });
    } catch (error) { next(error); }
  });

  app.post("/api/admin/users/:id/mute", adminAuthMiddleware, async (req, res, next) => {
    try {
      const userId = parsePositiveUserId(req.params.id);
      const reason = cleanText(req.body?.reason, 500);
      const durationMinutes = positiveInt(req.body?.durationMinutes, 1, 5256000);
      if (!userId || reason.length < 3 || !durationMinutes) return res.status(400).json({ error: "Raison ou durée de mute invalide." });
      const result = await pool.query(
        `INSERT INTO user_mutes (user_id, admin_id, reason, expires_at)
         VALUES ($1, $2, $3, NOW() + make_interval(mins => $4::integer)) RETURNING id, starts_at, expires_at`,
        [userId, req.adminId, reason, durationMinutes]
      );
      await recordAudit(pool, { category: "sanction", action: "user_muted", userId, adminId: req.adminId, details: { reason, durationMinutes } });
      const mute = { id: normalizeId(result.rows[0].id), reason, startsAt: toMillis(result.rows[0].starts_at), expiresAt: toMillis(result.rows[0].expires_at), adminName: req.adminDisplayName };
      sendTo(userId, { type: "account_muted", mute });
      res.status(201).json({ ok: true, mute });
    } catch (error) { next(error); }
  });

  app.post("/api/admin/users/:id/unmute", adminAuthMiddleware, async (req, res, next) => {
    try {
      const userId = parsePositiveUserId(req.params.id);
      const reason = cleanText(req.body?.reason || "Mute levé par un administrateur", 500);
      if (!userId) return res.status(400).json({ error: "Joueur invalide." });
      const result = await pool.query(`UPDATE user_mutes SET revoked_at = NOW(), revoked_by_admin_id = $1, revoked_reason = $2 WHERE user_id = $3 AND revoked_at IS NULL AND expires_at > NOW() RETURNING id`, [req.adminId, reason, userId]);
      if (!result.rowCount) return res.status(409).json({ error: "Aucun mute actif." });
      await recordAudit(pool, { category: "sanction", action: "user_unmuted", userId, adminId: req.adminId, details: { reason } });
      sendTo(userId, { type: "account_unmuted", message: "Votre mute a été levé." });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  // -------------------- Cartes --------------------
  app.get("/api/admin/cards", adminAuthMiddleware, async (_req, res, next) => {
    try {
      const result = await pool.query(`SELECT card_id, cost, damage, rarity, description, disabled, disabled_until, updated_at FROM card_overrides ORDER BY card_id`);
      res.json({ overrides: result.rows.map(row => ({ cardId: row.card_id, cost: row.cost, damage: row.damage, rarity: row.rarity, description: row.description, disabled: row.disabled, disabledUntil: toMillis(row.disabled_until), updatedAt: toMillis(row.updated_at) })) });
    } catch (error) { next(error); }
  });

  app.put("/api/admin/cards/:cardId", adminAuthMiddleware, async (req, res, next) => {
    try {
      const cardId = cleanText(req.params.cardId, 100);
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(cardId)) return res.status(400).json({ error: "Identifiant de carte invalide." });
      const cost = req.body?.cost === "" || req.body?.cost === null || req.body?.cost === undefined ? null : positiveInt(req.body.cost, 0, 30);
      const damage = req.body?.damage === "" || req.body?.damage === null || req.body?.damage === undefined ? null : positiveInt(req.body.damage, 0, 99);
      const rarity = req.body?.rarity ? cleanText(req.body.rarity, 20) : null;
      const description = req.body?.description === undefined || req.body?.description === null ? null : cleanMultiline(req.body.description, 1500);
      const disabled = req.body?.disabled === true;
      const disabledUntil = safeDate(req.body?.disabledUntil);
      if (rarity && !["common", "rare", "epic", "legendary"].includes(rarity)) return res.status(400).json({ error: "Rareté invalide." });
      await pool.query(
        `INSERT INTO card_overrides (card_id, cost, damage, rarity, description, disabled, disabled_until, updated_by_admin_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (card_id) DO UPDATE SET cost=EXCLUDED.cost, damage=EXCLUDED.damage, rarity=EXCLUDED.rarity,
           description=EXCLUDED.description, disabled=EXCLUDED.disabled, disabled_until=EXCLUDED.disabled_until,
           updated_by_admin_id=EXCLUDED.updated_by_admin_id, updated_at=NOW()`,
        [cardId, cost, damage, rarity, description, disabled, disabledUntil, req.adminId]
      );
      await recordAudit(pool, { category: "admin", action: "card_override_updated", adminId: req.adminId, details: { cardId, cost, damage, rarity, description, disabled, disabledUntil } });
      broadcastToAllPlayers({ type: "game_config_changed", section: "cards" });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  app.delete("/api/admin/cards/:cardId", adminAuthMiddleware, async (req, res, next) => {
    try {
      const cardId = cleanText(req.params.cardId, 100);
      const result = await pool.query("DELETE FROM card_overrides WHERE card_id = $1 RETURNING card_id", [cardId]);
      if (!result.rowCount) return res.status(404).json({ error: "Aucune modification pour cette carte." });
      await recordAudit(pool, { category: "admin", action: "card_override_deleted", adminId: req.adminId, details: { cardId } });
      broadcastToAllPlayers({ type: "game_config_changed", section: "cards" });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });

  // -------------------- Événements --------------------
  app.get("/api/admin/events", adminAuthMiddleware, async (_req, res, next) => {
    try {
      const result = await pool.query(`SELECT e.*, a.display_name AS created_by FROM game_events e LEFT JOIN admins a ON a.id=e.created_by_admin_id ORDER BY e.created_at DESC, e.id DESC`);
      res.json({ events: result.rows.map(row => serializeEvent(row, normalizeId, toMillis)) });
    } catch (error) { next(error); }
  });

  async function saveEvent(req, res, next, eventId = null) {
    try {
      const title = cleanText(req.body?.title, 140);
      const description = cleanMultiline(req.body?.description, 5000);
      const imageUrl = safeHttpUrl(req.body?.imageUrl);
      const rewards = normalizeRewardBundle(req.body?.rewards);
      const quests = Array.isArray(req.body?.quests) ? req.body.quests.slice(0, 20) : [];
      const exclusiveCards = [...new Set((Array.isArray(req.body?.exclusiveCards) ? req.body.exclusiveCards : []).map(item => cleanText(item, 100)).filter(item => /^[a-zA-Z0-9_-]{1,100}$/.test(item)))].slice(0, 50);
      const startsAt = safeDate(req.body?.startsAt, { required: true });
      const endsAt = safeDate(req.body?.endsAt, { required: true });
      const enabled = req.body?.enabled !== false;
      if (!title || endsAt <= startsAt) return res.status(400).json({ error: "Titre ou dates d’événement invalides." });
      let result;
      if (eventId) {
        result = await pool.query(`UPDATE game_events SET title=$1,description=$2,image_url=$3,rewards=$4::jsonb,quests=$5::jsonb,exclusive_cards=$6::jsonb,enabled=$7,starts_at=$8,ends_at=$9,updated_at=NOW() WHERE id=$10 RETURNING *`, [title,description,imageUrl,JSON.stringify(rewards),JSON.stringify(quests),JSON.stringify(exclusiveCards),enabled,startsAt,endsAt,eventId]);
      } else {
        result = await pool.query(`INSERT INTO game_events (title,description,image_url,rewards,quests,exclusive_cards,enabled,starts_at,ends_at,created_by_admin_id) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10) RETURNING *`, [title,description,imageUrl,JSON.stringify(rewards),JSON.stringify(quests),JSON.stringify(exclusiveCards),enabled,startsAt,endsAt,req.adminId]);
      }
      if (!result.rowCount) return res.status(404).json({ error: "Événement introuvable." });
      await recordAudit(pool, { category: "admin", action: eventId ? "event_updated" : "event_created", adminId: req.adminId, details: { eventId: eventId || normalizeId(result.rows[0].id), title } });
      broadcastToAllPlayers({ type: "game_config_changed", section: "events" });
      res.status(eventId ? 200 : 201).json({ event: serializeEvent(result.rows[0], normalizeId, toMillis) });
    } catch (error) { next(error); }
  }
  app.post("/api/admin/events", adminAuthMiddleware, (req,res,next) => saveEvent(req,res,next,null));
  app.put("/api/admin/events/:id", adminAuthMiddleware, (req,res,next) => {
    const id = parsePositiveUserId(req.params.id);
    if (!id) return res.status(400).json({ error: "Événement invalide." });
    return saveEvent(req,res,next,id);
  });
  app.delete("/api/admin/events/:id", adminAuthMiddleware, async (req,res,next) => {
    try {
      const id = parsePositiveUserId(req.params.id);
      if (!id) return res.status(400).json({ error: "Événement invalide." });
      const result = await pool.query("DELETE FROM game_events WHERE id=$1 RETURNING title", [id]);
      if (!result.rowCount) return res.status(404).json({ error: "Événement introuvable." });
      await recordAudit(pool, { category: "admin", action: "event_deleted", adminId: req.adminId, details: { eventId:id,title:result.rows[0].title } });
      broadcastToAllPlayers({ type: "game_config_changed", section: "events" });
      res.json({ ok:true });
    } catch(error){ next(error); }
  });

  // -------------------- Quêtes --------------------
  app.get("/api/admin/quests", adminAuthMiddleware, async (_req,res,next) => {
    try { const result=await pool.query("SELECT * FROM admin_quests ORDER BY created_at DESC,id DESC"); res.json({quests:result.rows.map(row=>serializeQuest(row,normalizeId,toMillis))}); }
    catch(error){ next(error); }
  });
  async function saveQuest(req,res,next,questId=null){
    try {
      const title=cleanText(req.body?.title,140), description=cleanMultiline(req.body?.description,3000), icon=cleanText(req.body?.icon||"✦",16);
      const questType=cleanText(req.body?.questType||"daily",20), eventKey=cleanText(req.body?.eventKey,80), goal=positiveInt(req.body?.goal,1,1000000);
      const rewards=normalizeRewardBundle(req.body?.rewards), eventId=req.body?.eventId?parsePositiveUserId(req.body.eventId):null;
      const startsAt=safeDate(req.body?.startsAt,{required:true}), endsAt=safeDate(req.body?.endsAt,{required:true}), enabled=req.body?.enabled!==false;
      if(!title||!goal||!eventKey||!["daily","weekly","event"].includes(questType)||endsAt<=startsAt) return res.status(400).json({error:"Données de quête invalides."});
      let result;
      if(questId) result=await pool.query(`UPDATE admin_quests SET title=$1,description=$2,icon=$3,quest_type=$4,event_key=$5,goal=$6,rewards=$7::jsonb,event_id=$8,enabled=$9,starts_at=$10,ends_at=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,[title,description,icon,questType,eventKey,goal,JSON.stringify(rewards),eventId,enabled,startsAt,endsAt,questId]);
      else result=await pool.query(`INSERT INTO admin_quests (title,description,icon,quest_type,event_key,goal,rewards,event_id,enabled,starts_at,ends_at,created_by_admin_id) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12) RETURNING *`,[title,description,icon,questType,eventKey,goal,JSON.stringify(rewards),eventId,enabled,startsAt,endsAt,req.adminId]);
      if(!result.rowCount) return res.status(404).json({error:"Quête introuvable."});
      await recordAudit(pool,{category:"admin",action:questId?"quest_updated":"quest_created",adminId:req.adminId,details:{questId:questId||normalizeId(result.rows[0].id),title}});
      broadcastToAllPlayers({type:"game_config_changed",section:"quests"});
      res.status(questId?200:201).json({quest:serializeQuest(result.rows[0],normalizeId,toMillis)});
    } catch(error){next(error);}
  }
  app.post("/api/admin/quests",adminAuthMiddleware,(req,res,next)=>saveQuest(req,res,next,null));
  app.put("/api/admin/quests/:id",adminAuthMiddleware,(req,res,next)=>{const id=parsePositiveUserId(req.params.id);if(!id)return res.status(400).json({error:"Quête invalide."});return saveQuest(req,res,next,id);});
  app.delete("/api/admin/quests/:id",adminAuthMiddleware,async(req,res,next)=>{try{const id=parsePositiveUserId(req.params.id);if(!id)return res.status(400).json({error:"Quête invalide."});const result=await pool.query("DELETE FROM admin_quests WHERE id=$1 RETURNING title",[id]);if(!result.rowCount)return res.status(404).json({error:"Quête introuvable."});await recordAudit(pool,{category:"admin",action:"quest_deleted",adminId:req.adminId,details:{questId:id,title:result.rows[0].title}});broadcastToAllPlayers({type:"game_config_changed",section:"quests"});res.json({ok:true});}catch(error){next(error);}});

  // -------------------- Boutique --------------------
  app.get("/api/admin/shop-offers",adminAuthMiddleware,async(_req,res,next)=>{try{const result=await pool.query("SELECT * FROM shop_offers ORDER BY created_at DESC,id DESC");res.json({offers:result.rows.map(row=>serializeOffer(row,normalizeId,toMillis))});}catch(error){next(error);}});
  async function saveOffer(req,res,next,offerId=null){
    try{
      const title=cleanText(req.body?.title,140),description=cleanMultiline(req.body?.description,3000),imageUrl=safeHttpUrl(req.body?.imageUrl);
      const price=positiveInt(req.body?.price,0,100000000),originalPrice=req.body?.originalPrice===""||req.body?.originalPrice==null?null:positiveInt(req.body.originalPrice,0,100000000);
      const rewards=normalizeRewardBundle(req.body?.rewards),purchaseLimit=positiveInt(req.body?.purchaseLimit??0,0,1000000);
      const startsAt=safeDate(req.body?.startsAt,{required:true}),endsAt=safeDate(req.body?.endsAt,{required:true}),enabled=req.body?.enabled!==false;
      if(!title||price===null||purchaseLimit===null||!rewards.length||endsAt<=startsAt)return res.status(400).json({error:"Données d’offre invalides."});
      let result;
      if(offerId) result=await pool.query(`UPDATE shop_offers SET title=$1,description=$2,image_url=$3,price=$4,original_price=$5,rewards=$6::jsonb,purchase_limit=$7,enabled=$8,starts_at=$9,ends_at=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,[title,description,imageUrl,price,originalPrice,JSON.stringify(rewards),purchaseLimit,enabled,startsAt,endsAt,offerId]);
      else result=await pool.query(`INSERT INTO shop_offers (title,description,image_url,price,original_price,rewards,purchase_limit,enabled,starts_at,ends_at,created_by_admin_id) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING *`,[title,description,imageUrl,price,originalPrice,JSON.stringify(rewards),purchaseLimit,enabled,startsAt,endsAt,req.adminId]);
      if(!result.rowCount)return res.status(404).json({error:"Offre introuvable."});
      await recordAudit(pool,{category:"admin",action:offerId?"shop_offer_updated":"shop_offer_created",adminId:req.adminId,details:{offerId:offerId||normalizeId(result.rows[0].id),title,price}});
      broadcastToAllPlayers({type:"game_config_changed",section:"shop"});
      res.status(offerId?200:201).json({offer:serializeOffer(result.rows[0],normalizeId,toMillis)});
    }catch(error){next(error);}
  }
  app.post("/api/admin/shop-offers",adminAuthMiddleware,(req,res,next)=>saveOffer(req,res,next,null));
  app.put("/api/admin/shop-offers/:id",adminAuthMiddleware,(req,res,next)=>{const id=parsePositiveUserId(req.params.id);if(!id)return res.status(400).json({error:"Offre invalide."});return saveOffer(req,res,next,id);});
  app.delete("/api/admin/shop-offers/:id",adminAuthMiddleware,async(req,res,next)=>{try{const id=parsePositiveUserId(req.params.id);if(!id)return res.status(400).json({error:"Offre invalide."});const result=await pool.query("DELETE FROM shop_offers WHERE id=$1 RETURNING title",[id]);if(!result.rowCount)return res.status(404).json({error:"Offre introuvable."});await recordAudit(pool,{category:"admin",action:"shop_offer_deleted",adminId:req.adminId,details:{offerId:id,title:result.rows[0].title}});broadcastToAllPlayers({type:"game_config_changed",section:"shop"});res.json({ok:true});}catch(error){next(error);}});

  // -------------------- Maintenance --------------------
  app.get("/api/admin/maintenance",adminAuthMiddleware,(_req,res)=>res.json({maintenance:getMaintenanceState()}));
  app.put("/api/admin/maintenance",adminAuthMiddleware,async(req,res,next)=>{
    try{
      const enabled=req.body?.enabled===true,message=cleanMultiline(req.body?.message||"Le jeu est temporairement en maintenance.",2000),estimatedEnd=safeDate(req.body?.estimatedEndAt);
      const value={enabled,message,estimatedEndAt:estimatedEnd?estimatedEnd.toISOString():null};
      await pool.query(`INSERT INTO app_meta (key,value,updated_at) VALUES ('maintenance',$1::jsonb,NOW()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[JSON.stringify(value)]);
      await loadMaintenanceState(pool);
      await recordAudit(pool,{category:"admin",action:enabled?"maintenance_enabled":"maintenance_disabled",adminId:req.adminId,details:value});
      broadcastToAllPlayers({type:"game_config_changed",section:"maintenance"});
      res.json({maintenance:getMaintenanceState()});
    }catch(error){next(error);}
  });

  // -------------------- Codes cadeaux --------------------
  app.get("/api/admin/gift-codes",adminAuthMiddleware,async(_req,res,next)=>{try{const result=await pool.query("SELECT * FROM gift_codes ORDER BY created_at DESC,id DESC");res.json({codes:result.rows.map(row=>serializeCode(row,normalizeId,toMillis))});}catch(error){next(error);}});
  app.post("/api/admin/gift-codes",adminAuthMiddleware,async(req,res,next)=>{
    try{
      const code=cleanText(req.body?.code,40).toUpperCase().replace(/\s+/g,"");const rewards=normalizeRewardBundle(req.body?.rewards),maxUses=positiveInt(req.body?.maxUses??0,0,10000000);
      const startsAt=safeDate(req.body?.startsAt)||new Date(),expiresAt=safeDate(req.body?.expiresAt),enabled=req.body?.enabled!==false;
      if(!/^[A-Z0-9_-]{3,40}$/.test(code)||!rewards.length||maxUses===null||(expiresAt&&expiresAt<=startsAt))return res.status(400).json({error:"Code, récompenses ou dates invalides."});
      const result=await pool.query(`INSERT INTO gift_codes (code,rewards,max_uses,enabled,starts_at,expires_at,created_by_admin_id) VALUES ($1,$2::jsonb,$3,$4,$5,$6,$7) RETURNING *`,[code,JSON.stringify(rewards),maxUses,enabled,startsAt,expiresAt,req.adminId]);
      await recordAudit(pool,{category:"admin",action:"gift_code_created",adminId:req.adminId,details:{code,maxUses,rewards}});
      res.status(201).json({code:serializeCode(result.rows[0],normalizeId,toMillis)});
    }catch(error){if(error.code==="23505")return res.status(409).json({error:"Ce code existe déjà."});next(error);}
  });
  app.put("/api/admin/gift-codes/:id",adminAuthMiddleware,async(req,res,next)=>{
    try{
      const id=parsePositiveUserId(req.params.id);if(!id)return res.status(400).json({error:"Code invalide."});
      const rewards=normalizeRewardBundle(req.body?.rewards),maxUses=positiveInt(req.body?.maxUses??0,0,10000000),startsAt=safeDate(req.body?.startsAt,{required:true}),expiresAt=safeDate(req.body?.expiresAt),enabled=req.body?.enabled!==false;
      if(!rewards.length||maxUses===null||(expiresAt&&expiresAt<=startsAt))return res.status(400).json({error:"Récompenses ou dates invalides."});
      const result=await pool.query(`UPDATE gift_codes SET rewards=$1::jsonb,max_uses=$2,enabled=$3,starts_at=$4,expires_at=$5,updated_at=NOW() WHERE id=$6 RETURNING *`,[JSON.stringify(rewards),maxUses,enabled,startsAt,expiresAt,id]);
      if(!result.rowCount)return res.status(404).json({error:"Code introuvable."});
      await recordAudit(pool,{category:"admin",action:"gift_code_updated",adminId:req.adminId,details:{codeId:id,code:result.rows[0].code}});
      res.json({code:serializeCode(result.rows[0],normalizeId,toMillis)});
    }catch(error){next(error);}
  });
  app.delete("/api/admin/gift-codes/:id",adminAuthMiddleware,async(req,res,next)=>{try{const id=parsePositiveUserId(req.params.id);if(!id)return res.status(400).json({error:"Code invalide."});const result=await pool.query("DELETE FROM gift_codes WHERE id=$1 RETURNING code",[id]);if(!result.rowCount)return res.status(404).json({error:"Code introuvable."});await recordAudit(pool,{category:"admin",action:"gift_code_deleted",adminId:req.adminId,details:{codeId:id,code:result.rows[0].code}});res.json({ok:true});}catch(error){next(error);}});

  // -------------------- Logs --------------------
  app.get("/api/admin/logs",adminAuthMiddleware,async(req,res,next)=>{
    try{
      const category=cleanText(req.query.category||"",40),query=cleanText(req.query.q||"",100),limit=Math.min(500,Math.max(1,Number(req.query.limit||200)));
      const values=[];const conditions=[];
      if(category){values.push(category);conditions.push(`l.category = $${values.length}`);}
      if(query){values.push(`%${query.toLowerCase()}%`);conditions.push(`(LOWER(COALESCE(u.username,'')) LIKE $${values.length} OR LOWER(COALESCE(a.display_name,'')) LIKE $${values.length} OR LOWER(l.action) LIKE $${values.length} OR LOWER(l.details::text) LIKE $${values.length})`);}
      values.push(limit);
      const result=await pool.query(`SELECT l.*,u.username,a.display_name AS admin_name FROM audit_logs l LEFT JOIN users u ON u.id=l.user_id LEFT JOIN admins a ON a.id=l.admin_id ${conditions.length?`WHERE ${conditions.join(" AND ")}`:""} ORDER BY l.created_at DESC LIMIT $${values.length}`,values);
      res.json({logs:result.rows.map(row=>({id:normalizeId(row.id),category:row.category,action:row.action,userId:row.user_id?normalizeId(row.user_id):null,username:row.username||null,adminName:row.admin_name||null,details:row.details||{},createdAt:toMillis(row.created_at)}))});
    }catch(error){next(error);}
  });
}

module.exports = {
  initializeExtensions,
  installExtensionRoutes,
  recordAudit,
  getActiveMute,
  loadMaintenanceState,
  getMaintenanceState,
  normalizeRewardBundle,
  applyRewards
};
