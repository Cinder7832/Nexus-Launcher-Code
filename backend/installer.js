// backend/installer.js
const fs = require("fs");
const path = require("path");
const extract = require("extract-zip");
const settings = require("./settings");

function ensureDir(dir) {
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Windows-safe folder name
function safeFolderName(name) {
  const raw = String(name || "Game");

  // Remove invalid Windows characters + control chars
  let s = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, "");

  // Collapse whitespace
  s = s.replace(/\s+/g, " ").trim();

  // Windows: no trailing dots/spaces
  s = s.replace(/[. ]+$/g, "");

  // Prevent empty
  if (!s) s = "Game";

  // Avoid super long names
  if (s.length > 80) s = s.slice(0, 80).trim();

  return s;
}

function installedPath() {
  // store installed.json in userData so it works in packaged EXE
  const userData = settings.getUserDataDir();
  ensureDir(userData);
  return path.join(userData, "installed.json");
}

// Optional: migrate old installed file if you had one in /data
function migrateInstalledIfNeeded() {
  const newPath = installedPath();
  if (fs.existsSync(newPath)) return;

  const oldPath = path.join(__dirname, "../data/installed.json");
  if (fs.existsSync(oldPath)) {
    try {
      fs.copyFileSync(oldPath, newPath);
      return;
    } catch {}
  }

  try {
    fs.writeFileSync(newPath, JSON.stringify({}, null, 2));
  } catch {}
}

function readInstalled() {
  migrateInstalledIfNeeded();
  const p = installedPath();
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) || {};
  } catch {
    return {};
  }
}

function saveInstalled(data) {
  const p = installedPath();
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}

function getInstallRoot() {
  const s = settings.readSettings();
  ensureDir(s.installRoot);
  return s.installRoot;
}

// ✅ Use sanitized folder name, and include id if provided (prevents collisions)
function getDefaultInstallPath(gameName, gameId) {
  const root = getInstallRoot();
  const safe = safeFolderName(gameName);

  if (gameId !== undefined && gameId !== null && String(gameId).trim() !== "") {
    return path.join(root, `${safe} [${String(gameId)}]`);
  }
  return path.join(root, safe);
}

function getExePath(installedGame) {
  // assumes EXE matches installedGame.name (your rule)
  return path.join(installedGame.installPath, `${installedGame.name}.exe`);
}

async function finalizeInstall({ game, zipPath, installPath }) {
  ensureDir(installPath);

  // extract zip contents into install path
  await extract(zipPath, { dir: installPath });

  const installed = readInstalled();
  installed[game.id] = {
    ...game,
    installPath,
    installedAt: new Date().toISOString(),
    playtimeSeconds: installed[game.id]?.playtimeSeconds || 0,
    lastPlayed: installed[game.id]?.lastPlayed || null
  };

  saveInstalled(installed);
  return installed[game.id];
}

function uninstallGame(gameId) {
  try {
    const installed = readInstalled();
    const game = installed[gameId];
    if (!game) return { ok: false, error: "Not installed" };

    if (game.installPath && fs.existsSync(game.installPath)) {
      fs.rmSync(game.installPath, { recursive: true, force: true });
    }

    delete installed[gameId];
    saveInstalled(installed);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

module.exports = {
  readInstalled,
  saveInstalled,
  finalizeInstall,
  uninstallGame,
  getDefaultInstallPath,
  getExePath,
  getInstallRoot
};
