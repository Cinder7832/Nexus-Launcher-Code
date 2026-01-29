// main.js
const { app, BrowserWindow, ipcMain, dialog, Menu, net, powerMonitor, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const http = require("http");
const { spawn, execFile } = require("child_process");
const { URL } = require("url");

const installer = require("./backend/installer");
const { DownloadManager } = require("./backend/downloadManager");
const settings = require("./backend/settings");

// ✅ updater uses GitHub RAW store.json
const { fetchRemoteStore, computeUpdates, fetchRemoteChangelog } = require("./backend/updater");

let win;

// Track running games to compute playtime
const running = new Map(); // gameId -> { startTime, proc }

// --------------------
// ✅ LAUNCHER UPDATES (GitHub Releases + installer)
// --------------------
const LAUNCHER_UPDATE = {
  owner: "Cinder7832",
  repo: "unity-games",
  assetExts: [".exe", ".msi"],
  preferNameIncludes: ""
};

let lastLauncherCheck = null;
let launcherInstallerPath = null;
let launcherDownloadId = null;

// ✅ cache remote store (helps auto-update)
let lastRemoteStore = null;

// --------------------
// ✅ ANNOUNCEMENTS (notification bell)
// --------------------
const ANNOUNCEMENTS_SRC = {
  owner: "Cinder7832",
  repo: "unity-games",
  branch: "main",
  path: "announcements.json",
  cacheMs: 5 * 60 * 1000
};

let lastAnnouncements = { announcements: [] };
let lastAnnouncementsAt = 0;
let lastAnnouncementsError = null;

// ✅ auto-update dedupe (avoid re-queueing same update repeatedly)
const autoUpdateQueued = new Map(); // gameId -> toVersion

function safeFileName(name) {
  const s = String(name || "launcher_update.exe");
  return s.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 160);
}

function normalizeVersion(v) {
  return String(v || "").trim().replace(/^v/i, "");
}

function parseSemver(v) {
  const s = normalizeVersion(v);
  const parts = s.split(".").map((x) => {
    const n = parseInt(String(x).replace(/[^\d].*$/, ""), 10);
    return Number.isFinite(n) ? n : 0;
  });
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

function compareSemver(a, b) {
  const A = parseSemver(a);
  const B = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (A[i] > B[i]) return 1;
    if (A[i] < B[i]) return -1;
  }
  return 0;
}

function isPureSemverTag(tag) {
  const t = String(tag || "").trim();
  return /^v?\d+\.\d+\.\d+$/.test(t);
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const headers = {
      "User-Agent": "NexusLauncherUpdater",
      "Accept": "application/vnd.github+json"
    };

    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    https
      .get(url, { headers }, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function fetchJsonRaw(urlStr, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(urlStr);
      const lib = u.protocol === "https:" ? https : http;
      const req = lib.request(
        {
          method: "GET",
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          headers: {
            "User-Agent": "NexusLauncher",
            "Accept": "application/json,text/plain,*/*"
          }
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            const next = new URL(res.headers.location, u).toString();
            res.resume();
            return resolve(fetchJsonRaw(next, redirectsLeft - 1));
          }

          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            }
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on("error", reject);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function normalizeAnnouncementsPayload(payload) {
  let items = [];

  if (Array.isArray(payload)) items = payload;
  else if (Array.isArray(payload?.announcements)) items = payload.announcements;
  else items = [];

  const norm = items
    .map((a) => {
      const title = String(a?.title || a?.name || "Announcement").trim();
      const date = String(a?.date || a?.when || "").trim();
      const tag = String(a?.tag || a?.type || "").trim();
      let body = a?.body;

      if (Array.isArray(body)) body = body.map((x) => String(x ?? "").trim()).filter(Boolean);
      else if (typeof body === "string") {
        // split on blank lines for nicer paragraph rendering
        body = body
          .split(/\n\s*\n/g)
          .map((x) => String(x).trim())
          .filter(Boolean);
      } else body = [];

      const idRaw = String(a?.id || "").trim();
      const id = idRaw || `${title}-${date}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

      return {
        id,
        title,
        date,
        tag,
        body
      };
    })
    .filter((x) => x.id && x.title);

  // newest first (best-effort: date desc; fallback: keep order)
  norm.sort((a, b) => {
    const ad = Date.parse(a.date);
    const bd = Date.parse(b.date);
    if (Number.isFinite(ad) && Number.isFinite(bd) && ad !== bd) return bd - ad;
    return a.title.localeCompare(b.title);
  });

  return { announcements: norm };
}

async function fetchRemoteAnnouncements({ force = false } = {}) {
  const now = Date.now();
  if (!force && lastAnnouncementsAt && now - lastAnnouncementsAt < ANNOUNCEMENTS_SRC.cacheMs) {
    return { ok: true, ...lastAnnouncements, cached: true, fetchedAt: lastAnnouncementsAt };
  }

  const rawUrl = `https://raw.githubusercontent.com/${ANNOUNCEMENTS_SRC.owner}/${ANNOUNCEMENTS_SRC.repo}/${ANNOUNCEMENTS_SRC.branch}/${ANNOUNCEMENTS_SRC.path}`;

  try {
    const data = await fetchJsonRaw(rawUrl);
    const normalized = normalizeAnnouncementsPayload(data);
    lastAnnouncements = normalized;
    lastAnnouncementsAt = Date.now();
    lastAnnouncementsError = null;
    return { ok: true, ...normalized, cached: false, fetchedAt: lastAnnouncementsAt };
  } catch (e) {
    lastAnnouncementsError = e?.message || String(e);
    // fall back to last cached data if we have it
    if (lastAnnouncementsAt && lastAnnouncements?.announcements?.length) {
      return { ok: true, ...lastAnnouncements, cached: true, fetchedAt: lastAnnouncementsAt, error: lastAnnouncementsError };
    }
    return { ok: false, announcements: [], cached: false, fetchedAt: 0, error: lastAnnouncementsError };
  }
}

function pickReleaseAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  if (!assets.length) return null;

  const exts = (LAUNCHER_UPDATE.assetExts || [".exe", ".msi"]).map((x) => String(x).toLowerCase());

  let candidates = assets.filter((a) => {
    const name = String(a?.name || "").toLowerCase();
    return exts.some((ext) => name.endsWith(ext));
  });

  if (!candidates.length) return null;

  const prefer = String(LAUNCHER_UPDATE.preferNameIncludes || "").trim().toLowerCase();
  if (prefer) {
    const preferred = candidates.filter((a) => String(a?.name || "").toLowerCase().includes(prefer));
    if (preferred.length) candidates = preferred;
  }

  candidates.sort((a, b) => (Number(b?.size || 0) - Number(a?.size || 0)));
  const best = candidates[0];

  return {
    name: String(best?.name || ""),
    url: String(best?.browser_download_url || ""),
    size: Number(best?.size || 0)
  };
}

async function fetchLatestLauncherRelease(owner, repo) {
  try {
    const latestUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    const rel = await fetchJson(latestUrl);

    const tag = String(rel?.tag_name || rel?.name || "");
    if (isPureSemverTag(tag)) {
      const asset = pickReleaseAsset(rel);
      if (asset?.url) return rel;
    }
  } catch {
    // ignore; fallback below
  }

  const listUrl = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=50`;
  const list = await fetchJson(listUrl);
  const releases = Array.isArray(list) ? list : [];

  const candidates = [];

  for (const rel of releases) {
    if (rel?.draft) continue;
    if (rel?.prerelease) continue;

    const tag = String(rel?.tag_name || rel?.name || "");
    if (!isPureSemverTag(tag)) continue;

    const asset = pickReleaseAsset(rel);
    if (!asset?.url) continue;

    candidates.push({ rel, tag });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const A = normalizeVersion(a.tag);
    const B = normalizeVersion(b.tag);
    return compareSemver(B, A);
  });

  return candidates[0].rel;
}

// --------------------
// ✅ Disk helpers
// --------------------
function execFileAsync(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve({ stdout: String(stdout || ""), stderr: String(stderr || "") });
    });
  });
}

function getWindowsDriveRoot(p) {
  const s = String(p || "");
  const m = s.match(/^([a-zA-Z]:)[\\/]/);
  if (m) return `${m[1]}\\`;
  return "C:\\";
}

async function getDiskFreeBytes(targetPath) {
  if (process.platform === "win32") {
    const root = getWindowsDriveRoot(targetPath);
    const drive = root.slice(0, 2);
    const { stdout } = await execFileAsync("wmic", [
      "logicaldisk",
      "where",
      `DeviceID='${drive}'`,
      "get",
      "FreeSpace",
      "/value"
    ]);

    const m = stdout.match(/FreeSpace\s*=\s*(\d+)/i);
    return m ? Number(m[1]) : 0;
  }

  const p = String(targetPath || "/");
  const { stdout } = await execFileAsync("df", ["-Pk", p]);
  const lines = stdout.trim().split("\n");
  if (lines.length < 2) return 0;
  const cols = lines[1].trim().split(/\s+/);
  const availableKb = Number(cols[3] || 0);
  return availableKb > 0 ? availableKb * 1024 : 0;
}

function requestSizeHead(urlStr, redirectsLeft = 5) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const lib = u.protocol === "https:" ? https : http;

      const req = lib.request(
        {
          method: "HEAD",
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          headers: { "User-Agent": "NexusLauncher/1.0", "Accept": "*/*" }
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
            const next = new URL(res.headers.location, u).toString();
            res.resume();
            return resolve(requestSizeHead(next, redirectsLeft - 1));
          }

          const len = Number(res.headers["content-length"] || 0);
          res.resume();
          resolve(len > 0 ? len : 0);
        }
      );

      req.on("error", () => resolve(0));
      req.end();
    } catch {
      resolve(0);
    }
  });
}

function requestSizeRange(urlStr, redirectsLeft = 5) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const lib = u.protocol === "https:" ? https : http;

      const req = lib.request(
        {
          method: "GET",
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          headers: {
            Range: "bytes=0-0",
            "User-Agent": "NexusLauncher/1.0",
            "Accept": "*/*"
          }
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
            const next = new URL(res.headers.location, u).toString();
            res.resume();
            return resolve(requestSizeRange(next, redirectsLeft - 1));
          }

          const cr = String(res.headers["content-range"] || "");
          const m = cr.match(/\/(\d+)\s*$/);
          res.resume();
          resolve(m ? Number(m[1]) : 0);
        }
      );

      req.on("error", () => resolve(0));
      req.end();
    } catch {
      resolve(0);
    }
  });
}

async function getRemoteFileSize(urlStr) {
  const head = await requestSizeHead(urlStr);
  if (head > 0) return head;
  return await requestSizeRange(urlStr);
}


// --------------------
// ✅ Install folder size helper (Option A: store extracted size in installed.json)
// --------------------
async function getDirSizeBytes(rootDir) {
  const start = String(rootDir || "");
  if (!start) return 0;

  let total = 0;

  async function walk(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile()) {
        try {
          const st = await fs.promises.stat(full);
          total += Number(st.size || 0);
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  try {
    await walk(start);
  } catch {
    return 0;
  }
  return total;
}

// --------------------
// Window
// --------------------
function createWindow() {
  const s = settings.readSettings();
  const raw = String(s.launchMode || "windowed").toLowerCase();
  const startMode = raw === "fullscreen" ? "maximized" : raw;

  win = new BrowserWindow({
    width: 1400,
    height: 820,
    show: false,
    backgroundColor: "#0b0d12",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "renderer/index.html"));

  win.once("ready-to-show", () => {
    try {
      if (startMode === "maximized") win.maximize();
      else win.unmaximize?.();
    } catch {}
    win.show();
  });
}

function sendToRenderer(channel, payload) {
  if (win && win.webContents) win.webContents.send(channel, payload);
}

// --------------------
// Helpers
// --------------------
function readLocalStore() {
  const storePath = path.join(app.getAppPath(), "data/store.json");
  return JSON.parse(fs.readFileSync(storePath, "utf-8"));
}

async function readBestStore() {
  try {
    return await fetchRemoteStore();
  } catch {
    return readLocalStore();
  }
}

function isUrl(v) {
  return /^https?:\/\//i.test(String(v || ""));
}

function normalizeGithubUrl(url) {
  const u = String(url || "");
  if (u.includes("github.com/") && u.includes("/blob/")) {
    return u.replace("https://github.com/", "https://raw.githubusercontent.com/").replace("/blob/", "/");
  }
  return u;
}

// ✅ Normalize download shape so renderer always understands it
// ✅ FIX: include compatibility aliases so "download size" shows again
function normalizeDownload(d) {
  if (!d) return null;

  const id = d.id ?? d.downloadId ?? d._id ?? d.key;
  const gameId = d.gameId ?? d.game_id ?? d.game?.id ?? d.meta?.gameId;
  const name = d.name ?? d.gameName ?? d.title ?? d.meta?.name ?? "Download";
  const status = d.status ?? d.state ?? d.phase ?? "downloading";

  const percent = d.percent ?? d.progress ?? d.pct ?? 0;
  const speed = d.speed ?? d.bytesPerSecond ?? d.bps ?? 0;
  const eta = d.eta ?? d.etaSeconds ?? d.remaining ?? 0;

  // ✅ more robust field pickup
  const total =
    d.total ??
    d.totalBytes ??
    d.total_size ??
    d.totalSize ??
    d.bytesTotal ??
    d.contentLength ??
    d.size ??
    0;

  const transferred =
    d.transferred ??
    d.downloaded ??
    d.downloadedBytes ??
    d.downloaded_bytes ??
    d.bytesDownloaded ??
    d.receivedBytes ??
    0;

  const out = {
    id: String(id),
    gameId: String(gameId),
    name,
    status,
    percent: Number(percent) || 0,
    speed: Number(speed) || 0,
    eta: Number(eta) || 0,
    total: Number(total) || 0,
    transferred: Number(transferred) || 0,
    destPath: d.destPath,
    url: d.url,
    error: d.error || null
  };

  // ✅ Backwards compatible aliases (many UIs use these)
  out.totalBytes = out.total;
  out.downloadedBytes = out.transferred;
  out.bytesTotal = out.total;
  out.bytesDownloaded = out.transferred;
  out.progress = out.percent;

  return out;
}

function handleLauncherDownloadUpdate(n) {
  if (!n || String(n.gameId) !== "__launcher__") return;

  if (n.status === "completed") {
    launcherInstallerPath = n.destPath || launcherInstallerPath;
    launcherDownloadId = null;

    sendToRenderer("launcher-update-ready", {
      latest: lastLauncherCheck?.latest || null
    });

    sendToRenderer("toast", {
      message: "Launcher update downloaded. Ready to install.",
      kind: "success"
    });
  }

  if (n.status === "error" || n.status === "canceled") {
    launcherDownloadId = null;
  }
}

const downloads = new DownloadManager({
  onUpdate: (d) => {
    const n = normalizeDownload(d);
    if (n) {
      sendToRenderer("download-updated", n);
      handleLauncherDownloadUpdate(n);
    }
  }
});

// --------------------
// ✅ Auto-update per game (NEW)
// --------------------
function readAutoUpdateMap() {
  const s = settings.readSettings();
  const raw = s.autoUpdateByGameId ?? s.autoUpdateGames ?? s.autoUpdates ?? {};
  if (!raw || typeof raw !== "object") return {};
  return raw;
}

function writeAutoUpdateMap(nextMap) {
  const cur = settings.readSettings();
  const cleaned = nextMap && typeof nextMap === "object" ? nextMap : {};
  return settings.writeSettings({ ...cur, autoUpdateByGameId: cleaned });
}

function isGameAutoUpdateEnabled(gameId) {
  const gid = String(gameId || "");
  const map = readAutoUpdateMap();
  return !!map[gid];
}

function hasActiveDownloadForGame(gameId) {
  const gid = String(gameId || "");
  const list = downloads.list ? downloads.list() : [];
  for (const d of list) {
    const n = normalizeDownload(d);
    if (!n) continue;
    if (String(n.gameId) !== gid) continue;

    // consider these as "active"
    if (n.status === "downloading" || n.status === "paused" || n.status === "queued") return true;
  }
  return false;
}

async function performUpdateFromMeta(meta, inst) {
  if (!meta?.zipUrl) return { ok: false, error: "Missing zipUrl" };
  if (!inst?.installPath) return { ok: false, error: "Missing installPath" };

  const gid = String(meta.id);

  if (running.has(gid)) return { ok: false, error: "Game running" };
  if (hasActiveDownloadForGame(gid)) return { ok: false, error: "Already downloading" };

  const tmpZip = path.join(os.tmpdir(), `nexus_update_${meta.id}.zip`);
  const installPath = inst.installPath;

  const downloadId = downloads.start({
    gameId: meta.id,
    name: `${meta.name} (Update)`,
    url: meta.zipUrl,
    destPath: tmpZip
  });

  sendToRenderer("toast", { message: `Updating ${meta.name}...`, kind: "info" });

  const interval = setInterval(async () => {
    const d = downloads.get(downloadId);
    if (!d) return;

    const dn = normalizeDownload(d);
    if (dn) sendToRenderer("download-updated", dn);

    if (dn.status === "completed") {
      clearInterval(interval);

      sendToRenderer("toast", { message: `Installing update for ${meta.name}...`, kind: "info" });

      try {
        await installer.finalizeInstall({ game: meta, zipPath: tmpZip, installPath });

        // ✅ Store extracted folder size (bytes) for Details page
        const installedSizeBytes = await getDirSizeBytes(installPath);

        const installedNow = installer.readInstalled();
        if (installedNow[meta.id]) {
          installedNow[meta.id].version = meta.version || "0.0.0";
          installedNow[meta.id].installedSizeBytes = Number(installedSizeBytes) || 0;
          installer.saveInstalled(installedNow);
        }

        sendToRenderer("toast", { message: `${meta.name} updated to ${meta.version}`, kind: "success" });
        sendToRenderer("install-finished", { gameId: meta.id });

        refreshUpdates();
      } catch (err) {
        sendToRenderer("toast", { message: `Update failed: ${err.message}`, kind: "error" });
      }
    }

    if (dn.status === "error") {
      clearInterval(interval);
      sendToRenderer("toast", { message: `Update download failed: ${dn.error}`, kind: "error" });
    }

    if (dn.status === "canceled") {
      clearInterval(interval);
      sendToRenderer("toast", { message: `Canceled update for ${meta.name}`, kind: "info" });
    }
  }, 250);

  return { ok: true, downloadId: String(downloadId) };
}

async function maybeAutoQueueUpdates(updates) {
  try {
    const list = Array.isArray(updates) ? updates : [];
    if (!list.length) return;

    const store = lastRemoteStore || (await readBestStore());
    const installed = installer.readInstalled();

    for (const u of list) {
      const gid = String(u?.gameId ?? u?.id ?? "");
      if (!gid) continue;

      const inst = installed?.[gid];
      if (!inst) continue;

      if (!isGameAutoUpdateEnabled(gid)) continue;
      if (running.has(gid)) continue;
      if (hasActiveDownloadForGame(gid)) continue;

      const toV = String(u?.toVersion ?? u?.to ?? u?.latest ?? u?.version ?? "");
      if (toV && autoUpdateQueued.get(gid) === toV) continue;

      const meta = (store?.games || []).find((g) => String(g.id) === gid);
      if (!meta?.zipUrl) continue;

      autoUpdateQueued.set(gid, toV || String(meta.version || ""));

      await performUpdateFromMeta(meta, inst);
    }
  } catch {
    // ignore
  }
}

// --------------------
// Updates state (cached)
// --------------------
let lastUpdates = [];

function broadcastUpdates() {
  sendToRenderer("updates-changed", {
    count: lastUpdates.length,
    updates: lastUpdates
  });
}

async function refreshUpdates() {
  try {
    const remoteStore = await fetchRemoteStore();
    lastRemoteStore = remoteStore;

    const installed = installer.readInstalled();
    lastUpdates = computeUpdates(remoteStore, installed);
  } catch {
    lastUpdates = [];
  }

  broadcastUpdates();

  // ✅ NEW: auto queue if enabled
  maybeAutoQueueUpdates(lastUpdates);

  return lastUpdates;
}

// --------------------
// ✅ Live Store Change Detection
// --------------------
let lastStoreString = null;

async function pushStoreIfChanged() {
  try {
    const store = await readBestStore();
    const s = JSON.stringify(store);

    if (lastStoreString === null || s !== lastStoreString) {
      lastStoreString = s;

      // ✅ cache store for auto-update
      lastRemoteStore = store;

      sendToRenderer("store-changed", { store, at: Date.now() });
      await refreshUpdates();
    }
  } catch {
    // ignore
  }
}

// --------------------
// ✅ Disk / size IPC
// --------------------
ipcMain.handle("nx:get-disk-free-bytes", async (_evt, installPath) => {
  try {
    return await getDiskFreeBytes(String(installPath || ""));
  } catch {
    return 0;
  }
});

ipcMain.handle("nx:get-remote-file-size", async (_evt, url) => {
  try {
    return await getRemoteFileSize(String(url || ""));
  } catch {
    return 0;
  }
});


// ✅ Lazy backfill extracted install size for previously installed games (computed once + stored)
ipcMain.handle("nx:ensure-installed-size", async (_evt, gameId) => {
  try {
    const gid = String(gameId || "");
    if (!gid) return { ok: false, bytes: 0, error: "Missing gameId" };

    const installed = installer.readInstalled();
    const inst = installed?.[gid];
    if (!inst?.installPath) return { ok: false, bytes: 0, error: "Not installed" };

    const existing = Number(inst.installedSizeBytes || inst.extractedSizeBytes || inst.installedBytes || 0);
    if (Number.isFinite(existing) && existing > 0) return { ok: true, bytes: existing };

    const bytes = await getDirSizeBytes(inst.installPath);
    inst.installedSizeBytes = Number(bytes) || 0;
    installed[gid] = inst;
    installer.saveInstalled(installed);

    return { ok: true, bytes: inst.installedSizeBytes };
  } catch (e) {
    return { ok: false, bytes: 0, error: String(e?.message || e) };
  }
});

ipcMain.handle("get-install-path", () => {
  try {
    const s = settings.readSettings();
    return String(s.installRoot || "");
  } catch {
    return "";
  }
});

// --------------------
// ✅ Open external links (website button, etc.)
// --------------------
// Keep this *tight* to avoid exposing dangerous protocols from renderer-controlled data.
ipcMain.handle("open-external", async (_evt, url) => {
  try {
    const u = new URL(String(url || ""));
    const allowedHost = "nexus-launcher.base44.app";
    if (u.hostname !== allowedHost) {
      return { ok: false, error: "Blocked host" };
    }
    if (u.protocol !== "https:") {
      return { ok: false, error: "Blocked protocol" };
    }
    await shell.openExternal(u.toString());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});


// --------------------
// IPC: STORE + LIBRARY
// --------------------
ipcMain.handle("get-store", async () => {
  const store = await readBestStore();
  lastRemoteStore = store;
  return store;
});
ipcMain.handle("get-installed", () => installer.readInstalled());

// ✅ Manual refresh button support
ipcMain.handle("refresh-store", async () => {
  try {
    const store = await readBestStore();
    lastStoreString = JSON.stringify(store);
    lastRemoteStore = store;

    sendToRenderer("store-changed", { store, at: Date.now() });
    await refreshUpdates();

    return store;
  } catch (e) {
    const fallback = readLocalStore();
    lastStoreString = JSON.stringify(fallback);
    lastRemoteStore = fallback;

    sendToRenderer("store-changed", { store: fallback, at: Date.now() });
    await refreshUpdates();
    return fallback;
  }
});

// --------------------
// ✅ ANNOUNCEMENTS IPC (notification bell)
// --------------------
function readAnnouncementsSeen() {
  try {
    const s = settings.readSettings();
    const seen = s?.announcementsSeen;
    if (!seen || typeof seen !== "object") return { lastSeenId: null, lastSeenAt: 0 };
    const lastSeenId = seen.lastSeenId ? String(seen.lastSeenId) : null;
    const lastSeenAt = Number(seen.lastSeenAt || 0);
    return { lastSeenId, lastSeenAt: Number.isFinite(lastSeenAt) ? lastSeenAt : 0 };
  } catch {
    return { lastSeenId: null, lastSeenAt: 0 };
  }
}

function writeAnnouncementsSeen(nextSeen) {
  const cur = settings.readSettings();
  const payload = {
    lastSeenId: nextSeen?.lastSeenId ? String(nextSeen.lastSeenId) : null,
    lastSeenAt: Number.isFinite(Number(nextSeen?.lastSeenAt)) ? Number(nextSeen.lastSeenAt) : Date.now()
  };
  settings.writeSettings({ ...cur, announcementsSeen: payload });
  return payload;
}

ipcMain.handle("get-announcements", async (_evt, opts) => {
  const force = !!(opts && typeof opts === "object" && opts.force);
  return await fetchRemoteAnnouncements({ force });
});

ipcMain.handle("get-announcements-seen", () => {
  return readAnnouncementsSeen();
});

ipcMain.handle("set-announcements-seen", async (_evt, seen) => {
  try {
    return { ok: true, seen: writeAnnouncementsSeen(seen) };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// --------------------
// ✅ CHANGELOG IPC (online)
// --------------------
const changelogCache = new Map();
const CHANGELOG_TTL_MS = 2 * 60 * 1000;

ipcMain.handle("get-changelog", async (_, gameId) => {
  try {
    const gid = String(gameId ?? "");
    if (!gid) return { ok: false, error: "Missing gameId" };

    const store = await readBestStore();
    lastRemoteStore = store;

    const meta = (store.games || []).find((g) => String(g.id) === gid) || null;

    const rawUrl = String(meta?.changelogUrl || meta?.changelog || "").trim();
    if (!rawUrl) return { ok: false, error: "No changelogUrl for this game" };

    const url = normalizeGithubUrl(rawUrl);
    if (!isUrl(url)) return { ok: false, error: "Invalid changelogUrl" };

    const cached = changelogCache.get(url);
    if (cached && Date.now() - cached.at < CHANGELOG_TTL_MS) {
      return { ok: true, cached: true, url, data: cached.data };
    }

    const data = await fetchRemoteChangelog(url);
    changelogCache.set(url, { at: Date.now(), data });

    return { ok: true, cached: false, url, data };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// --------------------
// ✅ LAUNCHER UPDATE IPC
// --------------------
ipcMain.handle("get-launcher-version", () => {
  try {
    return { ok: true, version: String(app.getVersion() || "0.0.0") };
  } catch {
    return { ok: true, version: "0.0.0" };
  }
});

ipcMain.handle("check-launcher-update", async () => {
  try {
    const owner = String(LAUNCHER_UPDATE.owner || "").trim();
    const repo = String(LAUNCHER_UPDATE.repo || "").trim();

    if (!owner || !repo || owner === "YOUR_GITHUB_OWNER" || repo === "YOUR_GITHUB_REPO") {
      return { ok: false, error: "Set LAUNCHER_UPDATE.owner + repo in main.js first." };
    }

    const current = normalizeVersion(app.getVersion());
    const release = await fetchLatestLauncherRelease(owner, repo);

    if (!release) {
      return {
        ok: false,
        error: "No launcher release found. Make sure you have a release tagged like v1.0.0 with a .exe/.msi asset."
      };
    }

    const latestTag = String(release?.tag_name || release?.name || "");
    const latest = normalizeVersion(latestTag);

    if (!latest || !isPureSemverTag(latestTag)) {
      return { ok: false, error: "Launcher release tag must be like v1.0.0" };
    }

    const asset = pickReleaseAsset(release);
    if (!asset?.url) return { ok: false, error: "No .exe/.msi asset found in launcher release." };

    const hasUpdate = compareSemver(latest, current) > 0;

    lastLauncherCheck = {
      current,
      latest,
      hasUpdate,
      assetUrl: asset.url,
      assetName: asset.name,
      publishedAt: String(release?.published_at || ""),
      releaseNotes: String(release?.body || "")
    };

    launcherInstallerPath = null;
    launcherDownloadId = null;

    return {
      ok: true,
      current,
      latest,
      hasUpdate,
      asset,
      publishedAt: lastLauncherCheck.publishedAt
    };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("download-launcher-update", async () => {
  try {
    if (!lastLauncherCheck?.assetUrl || !lastLauncherCheck?.latest) {
      return { ok: false, error: "Run check for updates first." };
    }

    if (launcherDownloadId) {
      return { ok: true, alreadyDownloading: true, downloadId: String(launcherDownloadId) };
    }

    const url = String(lastLauncherCheck.assetUrl || "");
    if (!isUrl(url)) return { ok: false, error: "Bad download URL." };

    const fileName = safeFileName(lastLauncherCheck.assetName || `launcher_update_${lastLauncherCheck.latest}.exe`);
    const destPath = path.join(os.tmpdir(), fileName);

    const downloadId = downloads.start({
      gameId: "__launcher__",
      name: `Launcher Update v${lastLauncherCheck.latest}`,
      url,
      destPath
    });

    launcherDownloadId = String(downloadId);
    launcherInstallerPath = null;

    sendToRenderer("toast", { message: "Downloading launcher update...", kind: "info" });

    const first = normalizeDownload(downloads.get(downloadId));
    if (first) sendToRenderer("download-updated", first);

    return { ok: true, downloadId: String(downloadId) };
  } catch (e) {
    launcherDownloadId = null;
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("install-launcher-update", async () => {
  try {
    if (process.platform !== "win32") {
      return { ok: false, error: "Installer update is currently implemented for Windows only." };
    }

    if (!launcherInstallerPath || !fs.existsSync(launcherInstallerPath)) {
      return { ok: false, error: "No downloaded installer found. Download the update first." };
    }

    try {
      const proc = spawn(launcherInstallerPath, [], {
        detached: true,
        stdio: "ignore",
        windowsHide: false
      });
      proc.unref();
    } catch (e) {
      return { ok: false, error: `Failed to start installer: ${e?.message || e}` };
    }

    setTimeout(() => {
      try { app.quit(); } catch {}
    }, 250);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// --------------------
// IPC: SETTINGS
// --------------------
ipcMain.handle("get-settings", () => settings.readSettings());

// ✅ NEW: per-game auto update APIs
ipcMain.handle("get-auto-update-map", () => {
  try {
    return readAutoUpdateMap();
  } catch {
    return {};
  }
});

ipcMain.handle("set-auto-update-for-game", async (_evt, gameId, enabled) => {
  try {
    const gid = String(gameId ?? "");
    if (!gid) return { ok: false, error: "Missing gameId" };

    const on = !!enabled;
    const curMap = readAutoUpdateMap();
    const next = { ...curMap };

    if (on) next[gid] = true;
    else delete next[gid];

    writeAutoUpdateMap(next);

    sendToRenderer("toast", {
      message: on ? "Auto-update enabled for this game." : "Auto-update disabled for this game.",
      kind: "success"
    });

    // If enabling and we already have update info, try immediately
    if (on && Array.isArray(lastUpdates) && lastUpdates.length) {
      maybeAutoQueueUpdates(lastUpdates);
    }

    return { ok: true, gameId: gid, enabled: on };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// ✅ Launch mode
ipcMain.handle("set-launch-mode", async (_, mode) => {
  const m = String(mode || "windowed").toLowerCase();
  const safe = m === "maximized" ? "maximized" : "windowed";

  const cur = settings.readSettings();
  const next = settings.writeSettings({ ...cur, launchMode: safe });

  if (win && !win.isDestroyed()) {
    try {
      if (safe === "maximized") win.maximize();
      else win.unmaximize();
    } catch {}
  }

  sendToRenderer("toast", { message: "Launch mode saved.", kind: "success" });
  return next;
});

// pick install root
ipcMain.handle("pick-install-root", async () => {
  const parent = BrowserWindow.getFocusedWindow() || win || null;

  const res = await dialog.showOpenDialog(parent, {
    title: "Choose install folder",
    properties: ["openDirectory", "createDirectory"]
  });

  if (res.canceled || !res.filePaths?.[0]) return null;
  return res.filePaths[0];
});

// set install root
ipcMain.handle("set-install-root", async (_, dir) => {
  if (!dir) return settings.readSettings();

  const cur = settings.readSettings();
  const s = settings.writeSettings({ ...cur, installRoot: dir });

  sendToRenderer("toast", { message: `Install folder set to: ${s.installRoot}`, kind: "success" });
  return s;
});

// set start page
ipcMain.handle("set-start-page", async (_, page) => {
  const p = String(page || "").toLowerCase();
  const normalized = p === "library" ? "library" : "store";

  const cur = settings.readSettings();
  const s = settings.writeSettings({ ...cur, startPage: normalized });

  sendToRenderer("toast", { message: `Start page set to: ${normalized}`, kind: "success" });
  return s;
});

ipcMain.handle("set-grid-columns", async (_, cols) => {
  const n = Number(cols);
  const safe = n === 4 ? 4 : n === 5 ? 5 : 3;

  const cur = settings.readSettings();
  const s = settings.writeSettings({ ...cur, gridColumns: safe });

  sendToRenderer("toast", { message: `Grid set to ${safe} columns.`, kind: "success" });
  return s;
});

// --------------------
// ✅ MIGRATE GAMES TO NEW FOLDER
// --------------------
function ensureDir(dir) {
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveLower(p) {
  try {
    return path.resolve(String(p || "")).toLowerCase();
  } catch {
    return String(p || "").toLowerCase();
  }
}

function uniquePath(basePath) {
  if (!fs.existsSync(basePath)) return basePath;

  const dir = path.dirname(basePath);
  const name = path.basename(basePath);
  for (let i = 1; i < 5000; i++) {
    const candidate = path.join(dir, `${name} (${i})`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${name} (${Date.now()})`);
}

function moveDirSafe(oldPath, newPath) {
  try {
    fs.renameSync(oldPath, newPath);
    return { ok: true };
  } catch (err) {
    const code = err?.code || "";
    if (code !== "EXDEV") return { ok: false, error: err?.message || String(err) };

    try {
      fs.cpSync(oldPath, newPath, { recursive: true, force: false, errorOnExist: false });
      fs.rmSync(oldPath, { recursive: true, force: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  }
}

ipcMain.handle("migrate-games", async (_, payload) => {
  const fromRoot = String(payload?.fromRoot || "");
  const toRoot = String(payload?.toRoot || "");

  if (!fromRoot || !toRoot) {
    sendToRenderer("toast", { message: "Migration failed: missing paths.", kind: "error" });
    return { ok: false, error: "Missing paths" };
  }

  if (resolveLower(fromRoot) === resolveLower(toRoot)) {
    sendToRenderer("toast", { message: "Nothing to migrate (same folder).", kind: "info" });
    return { ok: true, moved: 0, skipped: 0 };
  }

  if (running.size > 0) {
    sendToRenderer("toast", { message: "Close all running games before migrating.", kind: "info" });
    return { ok: false, error: "Game running" };
  }

  const installed = installer.readInstalled();
  const keys = Object.keys(installed || {});
  if (keys.length === 0) {
    sendToRenderer("toast", { message: "No installed games to migrate.", kind: "info" });
    return { ok: true, moved: 0, skipped: 0 };
  }

  ensureDir(toRoot);

  const fromRootNorm = resolveLower(fromRoot);
  let moved = 0;
  let skipped = 0;
  const errors = [];

  for (const gameId of keys) {
    const g = installed[gameId];
    const oldPath = String(g?.installPath || "");
    if (!oldPath) { skipped++; continue; }

    const oldNorm = resolveLower(oldPath);

    if (!oldNorm.startsWith(fromRootNorm)) { skipped++; continue; }
    if (!fs.existsSync(oldPath)) { skipped++; continue; }

    const folderName = path.basename(oldPath);
    let target = uniquePath(path.join(toRoot, folderName));

    const res = moveDirSafe(oldPath, target);
    if (!res.ok) {
      errors.push({ gameId, name: g?.name, error: res.error });
      skipped++;
      continue;
    }

    g.installPath = target;
    installed[gameId] = g;
    moved++;
  }

  installer.saveInstalled(installed);

  sendToRenderer("install-finished", { gameId: "__migration__" });
  await refreshUpdates();

  if (errors.length > 0) {
    sendToRenderer("toast", { message: `Migrated ${moved} game(s). ${errors.length} failed.`, kind: "info" });
    return { ok: true, moved, skipped, errors };
  }

  sendToRenderer("toast", { message: `Migrated ${moved} game(s).`, kind: "success" });
  return { ok: true, moved, skipped, errors: [] };
});

// --------------------
// IPC: UPDATES
// --------------------
ipcMain.handle("check-updates", async (_evt, opts) => {
  const updates = await refreshUpdates();

  const o = (opts && typeof opts === "object") ? opts : null;
  const silent = !!o?.silent;
  // If silent: only toast when updates exist (unless explicitly asked to toast when none)
  const toastWhenNone = !!o?.toastWhenNone;

  const shouldToast = (!silent) || (updates.length > 0) || toastWhenNone;

  if (shouldToast) {
    if (updates.length === 0) {
      sendToRenderer("toast", { message: "No updates available", kind: "info" });
    } else if (updates.length === 1) {
      const u = updates[0];
      sendToRenderer("toast", {
        message: `Update available: ${u.name} (${u.fromVersion} → ${u.toVersion})`,
        kind: "success"
      });
    } else {
      sendToRenderer("toast", { message: `${updates.length} updates available.`, kind: "success" });
    }
  }

  return updates;
});

// --------------------
// IPC: DOWNLOADS
// --------------------
ipcMain.handle("get-downloads", () => {
  const list = downloads.list ? downloads.list() : [];
  return list.map(normalizeDownload).filter(Boolean);
});

// Install (fresh install)
ipcMain.handle("queue-install", async (_, game) => {
  const tmpZip = path.join(os.tmpdir(), `nexus_${game.id}.zip`);
  const installPath = installer.getDefaultInstallPath(game.name);

  const downloadId = downloads.start({
    gameId: game.id,
    name: game.name,
    url: game.zipUrl,
    destPath: tmpZip
  });

  const first = normalizeDownload(downloads.get(downloadId));
  if (first) sendToRenderer("download-updated", first);

  sendToRenderer("toast", { message: `Downloading ${game.name}...`, kind: "info" });

  const interval = setInterval(async () => {
    const d = downloads.get(downloadId);
    if (!d) return;

    const dn = normalizeDownload(d);
    if (dn) sendToRenderer("download-updated", dn);

    if (dn.status === "completed") {
      clearInterval(interval);

      sendToRenderer("toast", { message: `Installing ${game.name}...`, kind: "info" });

      try {
        await installer.finalizeInstall({ game, zipPath: tmpZip, installPath });

        // ✅ Store extracted folder size (bytes) for Details page
        const installedSizeBytes = await getDirSizeBytes(installPath);

        const installed = installer.readInstalled();
        if (installed[game.id]) {
          installed[game.id].version = game.version || installed[game.id].version || "0.0.0";
          installed[game.id].installedSizeBytes = Number(installedSizeBytes) || 0;
          installer.saveInstalled(installed);
        }

        sendToRenderer("toast", { message: `${game.name} installed!`, kind: "success" });
        sendToRenderer("install-finished", { gameId: game.id });

        refreshUpdates();
      } catch (err) {
        sendToRenderer("toast", { message: `Install failed: ${err.message}`, kind: "error" });
      }
    }

    if (dn.status === "error") {
      clearInterval(interval);
      sendToRenderer("toast", { message: `Download failed: ${dn.error}`, kind: "error" });
    }

    if (dn.status === "canceled") {
      clearInterval(interval);
      sendToRenderer("toast", { message: `Canceled ${game.name}`, kind: "info" });
    }
  }, 250);

  return String(downloadId);
});

// Update install (re-install over same folder)
ipcMain.handle("queue-update", async (_, gameId) => {
  const installed = installer.readInstalled();
  const inst = installed?.[gameId];

  if (!inst) {
    sendToRenderer("toast", { message: "Update failed: game not installed.", kind: "error" });
    return { ok: false, error: "Not installed" };
  }

  if (running.has(String(gameId))) {
    sendToRenderer("toast", { message: "Close the game before updating.", kind: "info" });
    return { ok: false, error: "Game running" };
  }

  let remoteStore;
  try {
    remoteStore = await fetchRemoteStore();
    lastRemoteStore = remoteStore;
  } catch {
    sendToRenderer("toast", { message: "Update failed: can't reach update server.", kind: "error" });
    return { ok: false, error: "Network error" };
  }

  const meta = (remoteStore.games || []).find((g) => String(g.id) === String(gameId));
  if (!meta?.zipUrl) {
    sendToRenderer("toast", { message: "Update failed: missing zipUrl in store.", kind: "error" });
    return { ok: false, error: "Missing zipUrl" };
  }

  return await performUpdateFromMeta(meta, inst);
});

ipcMain.handle("pause-download", async (_, downloadId) => {
  downloads.pause(downloadId);
  const d = downloads.get(downloadId);
  if (d) sendToRenderer("download-updated", normalizeDownload(d));
  return true;
});

ipcMain.handle("resume-download", async (_, downloadId) => {
  await downloads.resume(downloadId);
  const d = downloads.get(downloadId);
  if (d) sendToRenderer("download-updated", normalizeDownload(d));
  return true;
});

ipcMain.handle("cancel-download", async (_, downloadId) => {
  downloads.cancel(downloadId);
  const d = downloads.get(downloadId);
  if (d) sendToRenderer("download-updated", normalizeDownload(d));
  return true;
});

// --------------------
// IPC: PLAY
// --------------------
ipcMain.handle("launch-game", async (_, gameId) => {
  const installed = installer.readInstalled();
  const game = installed[gameId];
  if (!game) {
    sendToRenderer("toast", { message: "Game is not installed.", kind: "error" });
    return { ok: false, error: "Not installed" };
  }

  const exePath = installer.getExePath(game);
  if (!fs.existsSync(exePath)) {
    sendToRenderer("toast", { message: `EXE not found: ${path.basename(exePath)}`, kind: "error" });
    return { ok: false, error: "EXE not found" };
  }

  if (running.has(String(gameId))) {
    sendToRenderer("toast", { message: `${game.name} is already running.`, kind: "info" });
    return { ok: true, alreadyRunning: true };
  }

  try {
    const proc = spawn(exePath, [], { cwd: game.installPath, windowsHide: false });
    running.set(String(gameId), { startTime: Date.now(), proc });

    game.lastPlayed = new Date().toISOString();
    installed[gameId] = game;
    installer.saveInstalled(installed);

    proc.on("exit", () => {
      const entry = running.get(String(gameId));
      running.delete(String(gameId));

      const installedNow = installer.readInstalled();
      const g = installedNow[gameId];
      if (!g || !entry) return;

      const playedSeconds = Math.max(0, Math.floor((Date.now() - entry.startTime) / 1000));
      g.playtimeSeconds = (g.playtimeSeconds || 0) + playedSeconds;
      installedNow[gameId] = g;
      installer.saveInstalled(installedNow);
    });

    proc.on("error", (err) => {
      running.delete(String(gameId));
      sendToRenderer("toast", { message: `Launch failed: ${err.message}`, kind: "error" });
    });

    return { ok: true };
  } catch (err) {
    sendToRenderer("toast", { message: `Launch failed: ${err.message}`, kind: "error" });
    return { ok: false, error: err.message };
  }
});

// --------------------
// ✅ RESET PLAYTIME
// --------------------
ipcMain.handle("reset-playtime", async (_, gameId) => {
  const gid = String(gameId ?? "");
  if (!gid) return { ok: false, error: "Missing gameId" };

  if (running.has(gid)) {
    sendToRenderer("toast", { message: "Close the game before resetting playtime.", kind: "info" });
    return { ok: false, error: "Game running" };
  }

  const installed = installer.readInstalled();
  const g = installed?.[gid];
  if (!g) {
    sendToRenderer("toast", { message: "Reset failed: game not installed.", kind: "error" });
    return { ok: false, error: "Not installed" };
  }

  g.playtimeSeconds = 0;
  installed[gid] = g;
  installer.saveInstalled(installed);

  sendToRenderer("toast", { message: `Playtime reset for ${g.name || "game"}.`, kind: "success" });
  return { ok: true, gameId: gid, playtimeSeconds: 0 };
});

// --------------------
// IPC: UNINSTALL
// --------------------
ipcMain.handle("uninstall-game", async (_, gameId) => {
  const result = installer.uninstallGame(gameId);
  if (result.ok) {
    sendToRenderer("toast", { message: "Uninstalled successfully.", kind: "success" });
    refreshUpdates();
    return { ok: true };
  } else {
    sendToRenderer("toast", { message: `Uninstall failed: ${result.error}`, kind: "error" });
    return { ok: false, error: result.error };
  }
});

// --------------------
// Network status -> renderer
// --------------------
function pushNetStatus() {
  const online = (typeof net?.isOnline === "function") ? net.isOnline() : true;
  sendToRenderer("net-status", { online });
}

// --------------------
// App lifecycle
// --------------------
app.whenReady().then(() => {
  createWindow();

  setTimeout(pushNetStatus, 300);
  try {
    powerMonitor?.on?.("online", pushNetStatus);
    powerMonitor?.on?.("offline", pushNetStatus);
  } catch {}

  setTimeout(() => refreshUpdates(), 600);
  setInterval(() => refreshUpdates(), 5 * 60 * 1000);

  setTimeout(pushStoreIfChanged, 400);
  setInterval(() => pushStoreIfChanged(), 30 * 1000);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
