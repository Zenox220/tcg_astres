"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const EMPTY_DB = Object.freeze({
  schemaVersion: 1,
  users: {},
  sessions: {},
  friendRequests: [],
  friendships: [],
  messages: [],
  reports: []
});

function makeEmptyDb() {
  return JSON.parse(JSON.stringify(EMPTY_DB));
}

function normalizeDb(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    schemaVersion: Math.max(1, Number(source.schemaVersion || 1)),
    users: source.users && typeof source.users === "object" && !Array.isArray(source.users) ? source.users : {},
    sessions: source.sessions && typeof source.sessions === "object" && !Array.isArray(source.sessions) ? source.sessions : {},
    friendRequests: Array.isArray(source.friendRequests) ? source.friendRequests : [],
    friendships: Array.isArray(source.friendships) ? source.friendships : [],
    messages: Array.isArray(source.messages) ? source.messages : [],
    reports: Array.isArray(source.reports) ? source.reports : []
  };
}

function resolvePersistentDataDir() {
  if (process.env.ASTREA_DATA_DIR) return path.resolve(process.env.ASTREA_DATA_DIR);

  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || process.env.APPDATA || os.homedir();
    return path.join(base, "LB Studio", "Chroniques d'Astrea", "backend-data");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "LB Studio", "Chroniques d'Astrea", "backend-data");
  }

  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(base, "lb-studio", "chroniques-astrea", "backend-data");
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return normalizeDb(JSON.parse(raw));
  } catch (_) {
    return null;
  }
}

function safeCopy(source, destination) {
  try {
    if (fs.existsSync(source)) fs.copyFileSync(source, destination);
  } catch (_) {
    // Une sauvegarde secondaire ne doit jamais empêcher la sauvegarde principale.
  }
}

function atomicWriteJson(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const serialized = JSON.stringify(normalizeDb(value), null, 2);
  let fd = null;

  try {
    fd = fs.openSync(tempPath, "w", 0o600);
    fs.writeFileSync(fd, serialized, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    safeCopy(`${filePath}.backup-2`, `${filePath}.backup-3`);
    safeCopy(`${filePath}.backup-1`, `${filePath}.backup-2`);
    safeCopy(filePath, `${filePath}.backup-1`);

    try {
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      // Sur certaines versions de Windows, rename ne remplace pas toujours le fichier cible.
      if (error && ["EEXIST", "EPERM", "EACCES"].includes(error.code)) {
        try { fs.unlinkSync(filePath); } catch (_) { /* fichier peut ne pas exister */ }
        fs.renameSync(tempPath, filePath);
      } else {
        throw error;
      }
    }
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) { /* ignore */ }
    }
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) { /* ignore */ }
  }
}

function createPersistentStore({ legacyPath } = {}) {
  const dataDir = resolvePersistentDataDir();
  const dbPath = path.join(dataDir, "db.json");
  const candidates = [
    dbPath,
    `${dbPath}.backup-1`,
    `${dbPath}.backup-2`,
    `${dbPath}.backup-3`,
    legacyPath
  ].filter(Boolean);

  function load() {
    for (const candidate of candidates) {
      const loaded = readJson(candidate);
      if (!loaded) continue;

      // Réécrit immédiatement dans l'emplacement durable. Cela migre aussi
      // automatiquement l'ancien server/data/db.json au premier démarrage.
      atomicWriteJson(dbPath, loaded);
      return loaded;
    }

    const empty = makeEmptyDb();
    atomicWriteJson(dbPath, empty);
    return empty;
  }

  function save(database) {
    atomicWriteJson(dbPath, database);
  }

  return {
    load,
    save,
    dataDir,
    dbPath
  };
}

module.exports = { createPersistentStore, normalizeDb, makeEmptyDb };
