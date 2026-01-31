// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Data
  getStore: () => ipcRenderer.invoke("get-store"),
  getInstalled: () => ipcRenderer.invoke("get-installed"),
  getDownloads: () => ipcRenderer.invoke("get-downloads"),

  // Open external links (safe allowlist in main)
  openExternal: (url) => ipcRenderer.invoke("open-external", url),

  // Refresh
  refreshStore: () => ipcRenderer.invoke("refresh-store"),

  // Install / downloads
  queueInstall: (game) => ipcRenderer.invoke("queue-install", game),
  pauseDownload: (id) => ipcRenderer.invoke("pause-download", id),
  resumeDownload: (id) => ipcRenderer.invoke("resume-download", id),
  cancelDownload: (id) => ipcRenderer.invoke("cancel-download", id),

  // Updates
  checkUpdates: (opts) => ipcRenderer.invoke("check-updates", opts),
  queueUpdate: (gameId) => ipcRenderer.invoke("queue-update", gameId),

  // Play + uninstall
  launchGame: (gameId) => ipcRenderer.invoke("launch-game", gameId),
  uninstallGame: (gameId) => ipcRenderer.invoke("uninstall-game", gameId),

  // reset playtime
  resetPlaytime: (gameId) => ipcRenderer.invoke("reset-playtime", gameId),

  // changelog
  getChangelog: (gameId) => ipcRenderer.invoke("get-changelog", gameId),

  // ✅ Auto-update per game
  getAutoUpdateMap: () => ipcRenderer.invoke("get-auto-update-map"),
  setAutoUpdateForGame: (gameId, enabled) =>
    ipcRenderer.invoke("set-auto-update-for-game", gameId, enabled),

  // ✅ Launcher updates
  getLauncherVersion: () => ipcRenderer.invoke("get-launcher-version"),
  getLauncherUpdateState: () => ipcRenderer.invoke("get-launcher-update-state"),
  checkLauncherUpdate: (opts) => ipcRenderer.invoke("check-launcher-update", opts),
  downloadLauncherUpdate: () => ipcRenderer.invoke("download-launcher-update"),
  installLauncherUpdate: () => ipcRenderer.invoke("install-launcher-update"),

  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  pickInstallRoot: () => ipcRenderer.invoke("pick-install-root"),
  setInstallRoot: (dir) => ipcRenderer.invoke("set-install-root", dir),
  setStartPage: (page) => ipcRenderer.invoke("set-start-page", page),

  // ✅ NEW: System & Notification Settings
  setSystemSettings: (s) => ipcRenderer.invoke("set-system-settings", s),
  setNotificationSettings: (s) => ipcRenderer.invoke("set-notification-settings", s),

  // Grid
  setGridColumns: (cols) => ipcRenderer.invoke("set-grid-columns", cols),

  // launch mode
  setLaunchMode: (mode) => ipcRenderer.invoke("set-launch-mode", mode),

  // Migrate
  migrateGames: (payload) => ipcRenderer.invoke("migrate-games", payload),

  // ✅ Disk + remote size
  getDiskFreeBytes: (installPath) => ipcRenderer.invoke("nx:get-disk-free-bytes", installPath),
  getRemoteFileSize: (url) => ipcRenderer.invoke("nx:get-remote-file-size", url),

  // ✅ Lazy backfill extracted install size for older installs
  ensureInstalledSize: (gameId) => ipcRenderer.invoke("nx:ensure-installed-size", gameId),

  // ✅ Helps the renderer check the correct drive (installRoot)
  getInstallPath: () => ipcRenderer.invoke("get-install-path"),
  getInstallDir: () => ipcRenderer.invoke("get-install-path"),

  // Events
  onDownloadUpdated: (cb) => ipcRenderer.on("download-updated", (_, d) => cb(d)),
  onInstallFinished: (cb) => ipcRenderer.on("install-finished", (_, p) => cb(p)),
  onToast: (cb) => ipcRenderer.on("toast", (_, t) => cb(t)),
  onUpdatesChanged: (cb) => ipcRenderer.on("updates-changed", (_, u) => cb(u)),
  onStoreChanged: (cb) => ipcRenderer.on("store-changed", (_, p) => cb(p)),
  onNetStatus: (cb) => ipcRenderer.on("net-status", (_, p) => cb(p)),

  // launcher update ready
  onLauncherUpdateReady: (cb) => ipcRenderer.on("launcher-update-ready", (_, p) => cb(p)),

  // ✅ Announcements (notification bell)
  getAnnouncements: (opts) => ipcRenderer.invoke("get-announcements", opts),
  getAnnouncementsSeen: () => ipcRenderer.invoke("get-announcements-seen"),
  setAnnouncementsSeen: (seen) => ipcRenderer.invoke("set-announcements-seen", seen)
});