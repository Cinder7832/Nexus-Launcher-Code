// backend/settings.js
const fs = require("fs");
const path = require("path");
const os = require("os");

function getUserDataDir() {
  try {
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") return app.getPath("userData");
  } catch {}
  return path.join(os.homedir(), ".unity-launcher");
}

function ensureDir(dir) {
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function settingsPath() {
  const dir = getUserDataDir();
  ensureDir(dir);
  return path.join(dir, "settings.json");
}

// ✅ Option B: default install folder = per-user LocalAppData
function defaultInstallRoot() {
  try {
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
      const userData = app.getPath("userData");         // ...\AppData\Roaming\<AppName>
      const roamingDir = path.dirname(userData);        // ...\AppData\Roaming
      const appDataRoot = path.dirname(roamingDir);     // ...\AppData
      const localDir = path.join(appDataRoot, "Local"); // ...\AppData\Local
      return path.join(localDir, "NexusLauncherGames");
    }
  } catch {}

  const localAppData =
    process.env.LOCALAPPDATA ||
    (process.env.APPDATA ? path.join(path.dirname(process.env.APPDATA), "Local") : null);

  if (localAppData) return path.join(localAppData, "NexusLauncherGames");
  return path.join(os.homedir(), "NexusLauncherGames");
}

// ✅ DEFAULT = maximized (also handles missing/invalid values safely)
function normalizeLaunchMode(v) {
  const m = String(v || "maximized").toLowerCase(); // ✅ fallback default
  if (m === "fullscreen") return "maximized";       // legacy safety
  return m === "maximized" ? "maximized" : "windowed";
}

function normalizeStartPage(v) {
  const p = String(v || "store").toLowerCase();
  return p === "library" ? "library" : "store";
}

// ✅ DEFAULT = 4 (also handles missing/invalid values safely)
function normalizeGridColumns(v) {
  const n = Number(v);
  if (n === 3) return 3;
  if (n === 4) return 4;
  if (n === 5) return 5;
  return 4; // ✅ default fallback = 4
}

function defaultSettings() {
  return {
    installRoot: defaultInstallRoot(),
    launchMode: "maximized", // ✅ default = maximized
    startPage: "store",      // store | library
    gridColumns: 4           // ✅ default = 4
  };
}

function readRawSettingsFile() {
  const p = settingsPath();
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function readSettings() {
  const p = settingsPath();

  if (!fs.existsSync(p)) {
    const s = defaultSettings();
    writeSettings(s);
    return s;
  }

  try {
    const s = JSON.parse(fs.readFileSync(p, "utf-8"));
    const merged = { ...defaultSettings(), ...(s || {}) };

    merged.launchMode = normalizeLaunchMode(merged.launchMode);
    merged.startPage = normalizeStartPage(merged.startPage);
    merged.gridColumns = normalizeGridColumns(merged.gridColumns);

    ensureDir(merged.installRoot);
    return merged;
  } catch {
    const s = defaultSettings();
    writeSettings(s);
    return s;
  }
}

function writeSettings(next) {
  const p = settingsPath();

  // ✅ merge defaults + existing-on-disk + next (prevents wiping)
  const existing = readRawSettingsFile() || {};
  const merged = { ...defaultSettings(), ...(existing || {}), ...(next || {}) };

  merged.launchMode = normalizeLaunchMode(merged.launchMode);
  merged.startPage = normalizeStartPage(merged.startPage);
  merged.gridColumns = normalizeGridColumns(merged.gridColumns);

  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(merged, null, 2), "utf-8");
  ensureDir(merged.installRoot);

  return merged;
}

function setInstallRoot(dir) {
  if (!dir) return readSettings();
  const s = readSettings();
  s.installRoot = dir;
  return writeSettings(s);
}

function setLaunchMode(mode) {
  const s = readSettings();
  s.launchMode = normalizeLaunchMode(mode);
  return writeSettings(s);
}

function setStartPage(page) {
  const s = readSettings();
  s.startPage = normalizeStartPage(page);
  return writeSettings(s);
}

// ✅ NEW
function setGridColumns(cols) {
  const s = readSettings();
  s.gridColumns = normalizeGridColumns(cols);
  return writeSettings(s);
}

module.exports = {
  readSettings,
  writeSettings,
  setInstallRoot,
  setLaunchMode,
  setStartPage,
  setGridColumns, // ✅ export
  getUserDataDir
};
