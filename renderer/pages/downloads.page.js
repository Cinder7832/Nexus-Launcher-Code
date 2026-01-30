// renderer/pages/downloads.page.js
(function () {
  const HISTORY_KEY = "nx.downloadHistory.v1";
  const HISTORY_MAX = 8;
  const HISTORY_STYLE_ID = "nxDownloadsHistoryStylesV1";

  const state = {
    nodes: new Map(), // id -> { card, fill, statusEl, speedEl, totalEl, etaEl, pctEl, sizeEl, pauseBtn, cancelBtn }
    storeById: new Map(),
    bound: false,
    lastList: [],
    lastStoreAt: 0,

    // ✅ once install finishes for a game, hide its "completed" downloads
    doneGameIds: new Set(),

    // ✅ history
    history: [],
    historyBound: false,
    installedVersions: new Map(), // gameId -> version string snapshot (used to detect install vs update)
    installedSnapshotReady: false
  };

  /* -----------------------------
     Small utils
  ----------------------------- */

  function mbps(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return "0.0 MB/s";
    return (bytesPerSec / (1024 * 1024)).toFixed(1) + " MB/s";
  }

  function eta(sec) {
    if (!sec || sec <= 0) return "—";
    sec = Math.floor(sec);
    if (sec < 60) return `${sec}s remaining`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s remaining`;
  }

  function formatBytes(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    const dp = i <= 1 ? 0 : 1;
    return `${v.toFixed(dp)} ${units[i]}`;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function relTime(ts) {
    const t = Number(ts || 0);
    if (!t) return "—";
    const now = Date.now();
    const diff = Math.max(0, now - t);
    const s = Math.floor(diff / 1000);
    if (s < 10) return "Just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d === 1) return "Yesterday";
    if (d < 14) return `${d}d ago`;

    // fallback date (short)
    const dt = new Date(t);
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function isUrl(v) {
    return /^https?:\/\//i.test(String(v || ""));
  }
  function toImg(v) {
    if (!v) return "";
    return isUrl(v) ? String(v) : `assets/${v}`;
  }

  // ✅ best-effort "downloaded bytes" field picker
  function getDownloadedBytes(d) {
    const keys = [
      "downloaded",
      "downloadedBytes",
      "received",
      "receivedBytes",
      "transferred",
      "transferredBytes",
      "done",
      "doneBytes",
      "current",
      "currentBytes",
      "bytes",
      "bytesDownloaded",
      "written",
      "writtenBytes"
    ];
    for (const k of keys) {
      const n = Number(d?.[k]);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  }

  // ✅ best-effort total bytes (prefer d.total; fallback to store.json downloadSizeBytes)
  function getTotalBytes(d, meta) {
    const n1 = Number(d?.total);
    if (Number.isFinite(n1) && n1 > 0) return n1;

    const n2 = Number(meta?.downloadSizeBytes);
    if (Number.isFinite(n2) && n2 > 0) return n2;

    return 0;
  }

  /* -----------------------------
     Layout + History UI
  ----------------------------- */

  function ensureHistoryStyles() {
    if (document.getElementById(HISTORY_STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = HISTORY_STYLE_ID;
    s.textContent = `
      /* Downloads two-column layout */
      .nxDlGrid{
        display: grid;
        grid-template-columns: minmax(0, 940px) minmax(300px, 1fr);
        gap: 22px;
        align-items: start;
        margin-top: 8px;
      }
      @media (max-width: 980px){
        .nxDlGrid{
          grid-template-columns: 1fr;
        }
      }

      .nxDlLeft{ min-width: 0; }
      .nxDlRight{ min-width: 0; }

      /* Make active download cards fill the left column nicely */
      .nxDlGrid #downloadsWrap{
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .nxDlGrid .dlCard{
        max-width: none !important;
        margin-top: 0 !important; /* we use gap instead */
      }

      /* ✅ Align empty state with the right "Recent" panel */
      .nxDlGrid .emptyState{
        margin-top: 0 !important;
      }

      /* History card */
      .nxHistCard{
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.06);
        border-radius: 22px;
        padding: 18px 18px 16px;
        box-shadow: 0 24px 70px rgba(0,0,0,.25);
        position: sticky;
        top: 10px;
      }

      .nxHistTop{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .nxHistTitle{
        font-size: 16px;
        font-weight: 950;
        letter-spacing: -0.2px;
      }
      .nxHistBtn{
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.06);
        color: rgba(255,255,255,.92);
        border-radius: 14px;
        padding: 8px 10px;
        cursor: pointer;
        font-weight: 900;
        transition: transform .12s ease, background .16s ease;
        white-space: nowrap;
      }
      .nxHistBtn:hover{
        background: rgba(255,255,255,.09);
        transform: translateY(-1px);
      }
      .nxHistBtn:active{ transform: translateY(0) scale(.98); }

      .nxHistList{
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .nxHistItem{
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 10px 10px;
        border-radius: 18px;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.06);
      }
      .nxHistCover{
        width: 44px;
        height: 44px;
        border-radius: 14px;
        background-size: cover;
        background-position: center;
        border: 1px solid rgba(255,255,255,.10);
        box-shadow: 0 14px 30px rgba(0,0,0,.35);
        flex: 0 0 auto;
      }
      .nxHistMain{ min-width: 0; flex: 1; }
      .nxHistRow1{
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .nxHistName{
        font-weight: 950;
        font-size: 13.5px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nxHistBadge{
        font-size: 11px;
        font-weight: 950;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.06);
        color: rgba(255,255,255,.92);
        flex: 0 0 auto;
      }
      .nxHistBadge.install{
        border-color: rgba(46,204,113,.28);
        background: rgba(46,204,113,.12);
      }
      .nxHistBadge.update{
        border-color: rgba(124,92,255,.34);
        background: rgba(124,92,255,.18);
      }
      .nxHistBadge.reinstall{
        border-color: rgba(255,255,255,.16);
        background: rgba(255,255,255,.08);
      }

      .nxHistSub{
        margin-top: 6px;
        color: rgba(255,255,255,.60);
        font-weight: 800;
        font-size: 12px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }

      .nxHistEmpty{
        padding: 14px 12px;
        border-radius: 18px;
        background: rgba(255,255,255,.03);
        border: 1px solid rgba(255,255,255,.05);
        color: rgba(255,255,255,.62);
        font-weight: 800;
        font-size: 13px;
        line-height: 1.35;
      }
    `;
    document.head.appendChild(s);
  }

  function ensureLayout() {
    ensureHistoryStyles();

    const wrap = document.getElementById("downloadsWrap");
    const empty = document.getElementById("downloadsEmpty");
    if (!wrap) return null;

    const page = wrap.parentElement;
    if (!page) return null;

    // already mounted
    const existing = document.getElementById("nxDlGrid");
    if (existing) {
      return {
        grid: existing,
        histList: document.getElementById("nxDlHistoryList"),
        histEmpty: document.getElementById("nxDlHistoryEmpty"),
        clearBtn: document.getElementById("nxDlHistoryClear")
      };
    }

    const grid = document.createElement("div");
    grid.className = "nxDlGrid";
    grid.id = "nxDlGrid";

    const left = document.createElement("div");
    left.className = "nxDlLeft";

    const right = document.createElement("div");
    right.className = "nxDlRight";

    const hist = document.createElement("div");
    hist.className = "nxHistCard";
    hist.innerHTML = `
      <div class="nxHistTop">
        <div class="nxHistTitle">Recent</div>
        <button class="nxHistBtn" id="nxDlHistoryClear" type="button">Clear</button>
      </div>
      <div class="nxHistList" id="nxDlHistoryList"></div>
      <div class="nxHistEmpty" id="nxDlHistoryEmpty" style="display:none;">
        Your recent installs and updates will show up here.
      </div>
    `;

    right.appendChild(hist);

    // Insert grid in place of wrap (keep order stable no matter template)
    // We'll insert grid before whichever of wrap/empty appears first.
    const first = (empty && empty.compareDocumentPosition(wrap) & Node.DOCUMENT_POSITION_FOLLOWING) ? empty : wrap;
    page.insertBefore(grid, first);

    // Move empty + wrap into left column
    if (empty) left.appendChild(empty);
    left.appendChild(wrap);

    grid.appendChild(left);
    grid.appendChild(right);

    // Wire clear button
    const clearBtn = hist.querySelector("#nxDlHistoryClear");
    clearBtn.addEventListener("click", () => {
      state.history = [];
      saveHistory(state.history);
      renderHistory();
    });

    return {
      grid,
      histList: hist.querySelector("#nxDlHistoryList"),
      histEmpty: hist.querySelector("#nxDlHistoryEmpty"),
      clearBtn
    };
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr = JSON.parse(raw || "[]");
      if (!Array.isArray(arr)) return [];
      // sanitize
      return arr
        .map((x) => ({
          gameId: String(x?.gameId || ""),
          name: String(x?.name || ""),
          action: String(x?.action || ""),
          version: String(x?.version || ""),
          at: Number(x?.at || 0)
        }))
        .filter((x) => x.gameId && x.at)
        .slice(0, HISTORY_MAX);
    } catch {
      return [];
    }
  }

  function saveHistory(arr) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify((arr || []).slice(0, HISTORY_MAX)));
    } catch {}
  }

  function getMetaForGame(gameId) {
    const gid = String(gameId || "");
    const meta = state.storeById.get(gid);
    return meta || null;
  }

  function coverForGame(gameId) {
    const meta = getMetaForGame(gameId);
    const cover = meta?.imageUrl || meta?.image || meta?.cover || meta?.coverUrl || meta?.heroUrl || "";
    return toImg(cover);
  }

  function renderHistory() {
    const listEl = document.getElementById("nxDlHistoryList");
    const emptyEl = document.getElementById("nxDlHistoryEmpty");
    if (!listEl || !emptyEl) return;

    const items = state.history || [];
    listEl.innerHTML = "";

    if (items.length === 0) {
      emptyEl.style.display = "block";
      return;
    }
    emptyEl.style.display = "none";

    for (const it of items) {
      const meta = getMetaForGame(it.gameId);
      const name = it.name || meta?.name || "Game";
      const ver = it.version ? `v${it.version}` : "";
      const time = relTime(it.at);

      const badgeClass =
        it.action === "Updated" ? "update" :
        it.action === "Installed" ? "install" :
        "reinstall";

      const cover = coverForGame(it.gameId);

      const row = document.createElement("div");
      row.className = "nxHistItem";
      row.innerHTML = `
        <div class="nxHistCover" style="background-image:url('${cover}')"></div>
        <div class="nxHistMain">
          <div class="nxHistRow1">
            <div class="nxHistName" title="${name}">${name}</div>
            <div class="nxHistBadge ${badgeClass}">${it.action || "Installed"}</div>
          </div>
          <div class="nxHistSub">
            ${ver ? `<span>${ver}</span><span class="dotSep">•</span>` : ""}
            <span>${time}</span>
          </div>
        </div>
      `;

      listEl.appendChild(row);
    }
  }

  async function initInstalledSnapshot() {
    if (state.installedSnapshotReady) return;
    try {
      const installed = await window.api.getInstalled?.();
      const obj = installed || {};
      const ids = Object.keys(obj);
      for (const id of ids) {
        const v = obj[id]?.version;
        if (v !== undefined && v !== null) {
          state.installedVersions.set(String(id), String(v));
        }
      }
    } catch {
      // ignore
    } finally {
      state.installedSnapshotReady = true;
    }
  }

  // Record a new history entry when install finishes
  async function recordHistoryForGame(gameId) {
    const gid = String(gameId || "");
    if (!gid) return;
    if (gid === "__launcher__") return; // just in case

    // Ensure we have store metadata for cover/name
    if (state.storeById.size === 0) {
      await rebuildStoreIndex();
    }

    // Ensure snapshot exists
    if (!state.installedSnapshotReady) {
      await initInstalledSnapshot();
    }

    let installedNow = null;
    try {
      installedNow = await window.api.getInstalled?.();
    } catch {}

    const nowObj = installedNow || {};
    const nowGame = nowObj[gid] || null;

    const nowVer = nowGame?.version !== undefined && nowGame?.version !== null ? String(nowGame.version) : "";
    const nowName = String(nowGame?.name || getMetaForGame(gid)?.name || "");

    const prevVer = state.installedVersions.get(gid) || "";

    let action = "Installed";
    if (prevVer) {
      if (nowVer && nowVer !== prevVer) action = "Updated";
      else action = "Reinstalled";
    } else {
      action = "Installed";
    }

    // Update snapshot to latest
    if (nowVer) state.installedVersions.set(gid, nowVer);

    const entry = {
      gameId: gid,
      name: nowName,
      action,
      version: nowVer,
      at: Date.now()
    };

    // De-dupe: if last entry is same game+action+version within 10s, skip
    const last = state.history?.[0];
    if (
      last &&
      last.gameId === entry.gameId &&
      last.action === entry.action &&
      String(last.version || "") === String(entry.version || "") &&
      Math.abs(Number(last.at) - Number(entry.at)) < 10_000
    ) {
      return;
    }

    state.history = [entry, ...(state.history || [])].slice(0, HISTORY_MAX);
    saveHistory(state.history);

    // Update UI if mounted
    renderHistory();
  }

  /* -----------------------------
     Existing Downloads logic
 ----------------------------- */

  // ✅ SVG icons
  function iconPause() {
    return `
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 6v12"></path>
        <path d="M16 6v12"></path>
      </svg>
    `;
  }
  function iconPlay() {
    return `
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 7l10 5-10 5V7Z"></path>
      </svg>
    `;
  }
  function iconX() {
    return `
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6 6 18"></path>
        <path d="M6 6l12 12"></path>
      </svg>
    `;
  }

  async function rebuildStoreIndex() {
    try {
      const store = await window.api.getStore();
      state.storeById = new Map((store.games || []).map((g) => [String(g.id), g]));
    } catch {
      // ignore
    }
  }

  function ensureCard(wrap, d) {
    let n = state.nodes.get(d.id);

    // If node exists but DOM removed (page switched), re-attach it
    if (n && !n.card.isConnected) {
      wrap.appendChild(n.card);
      return n;
    }
    if (n) return n;

    const meta = state.storeById.get(String(d.gameId));
    const cover = meta?.imageUrl || meta?.image || meta?.cover || meta?.coverUrl || "";
    const img = toImg(cover);

    const card = document.createElement("div");
    card.className = "dlCard";

    // store ids on the card so we can remove reliably on install-finished
    card.dataset.downloadId = String(d.id);
    card.dataset.gameId = String(d.gameId);

    card.innerHTML = `
      <div class="dlTopRow">
        <div class="dlLeft">
          <div class="dlCover" style="background-image:url('${img}')"></div>
          <div class="dlText">
            <div class="dlName">${d.name}</div>
            <div class="dlSub">
              <span class="dlStatus">Downloading...</span>
              <span class="dotSep">•</span>
              <span class="dlSpeed">0.0 MB/s</span>
              <span class="dotSep">•</span>
              <span class="dlTotal">—</span>
              <span class="dotSep">•</span>
              <span class="dlEta">ETA: —</span>
            </div>
          </div>
        </div>

        <div class="dlActions">
          <button class="iconBtn" data-act="pause" type="button" title="Pause">
            ${iconPause()}
          </button>
          <button class="iconBtn danger" data-act="cancel" type="button" title="Cancel">
            ${iconX()}
          </button>
        </div>
      </div>

      <div class="dlProgressTrack">
        <div class="dlProgressFill indeterminate"></div>
      </div>

      <div class="dlBottomRow">
        <div class="dlSize">—</div>
        <div class="dlPercent"></div>
      </div>
    `;

    const fill = card.querySelector(".dlProgressFill");
    const statusEl = card.querySelector(".dlStatus");
    const speedEl = card.querySelector(".dlSpeed");
    const totalEl = card.querySelector(".dlTotal");
    const etaEl = card.querySelector(".dlEta");
    const pctEl = card.querySelector(".dlPercent");
    const sizeEl = card.querySelector(".dlSize");
    const pauseBtn = card.querySelector('[data-act="pause"]');
    const cancelBtn = card.querySelector('[data-act="cancel"]');

    pauseBtn.addEventListener("click", async (e) => {
      e.stopPropagation();

      const current = state.lastList?.find((x) => x.id === d.id);
      if (!current) return;

      // don't pause while completed/installing
      if (current.status === "completed") return;

      const isPaused = current.status === "paused";
      if (isPaused) await window.api.resumeDownload(d.id);
      else await window.api.pauseDownload(d.id);

      await window.updateDownloadsUI();
    });

    cancelBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await window.api.cancelDownload(d.id);
      await window.updateDownloadsUI();
    });

    n = { card, fill, statusEl, speedEl, totalEl, etaEl, pctEl, sizeEl, pauseBtn, cancelBtn };
    state.nodes.set(d.id, n);
    wrap.appendChild(card);
    return n;
  }

  function updateCard(n, d) {
    const meta = state.storeById.get(String(d.gameId));

    const totalBytes = getTotalBytes(d, meta);
    const doneBytes = getDownloadedBytes(d);

    // show correct status
    const st =
      d.status === "paused" ? "Paused" :
      d.status === "completed" ? "Installing..." :
      d.status === "downloading" ? "Downloading..." :
      "Downloading...";

    n.statusEl.textContent = st;

    // size shown in the subline
    n.totalEl.textContent = totalBytes ? formatBytes(totalBytes) : "—";

    // during install phase, speed/eta aren't meaningful
    if (d.status === "completed") {
      n.speedEl.textContent = "—";
      n.etaEl.textContent = "ETA: —";
    } else {
      n.speedEl.textContent = mbps(d.speed);
      n.etaEl.textContent = `ETA: ${eta(d.eta)}`;
    }

    const knownTotal = totalBytes > 0;
    const pct = knownTotal ? Math.min(100, Math.floor(d.percent || 0)) : 0;

    if (d.status === "completed") {
      n.fill.classList.remove("indeterminate");
      n.fill.style.width = "100%";
      n.pctEl.textContent = "100%";
    } else if (knownTotal) {
      n.fill.classList.remove("indeterminate");
      n.fill.style.width = pct + "%";
      n.pctEl.textContent = pct + "%";
    } else {
      n.fill.classList.add("indeterminate");
      n.fill.style.width = "";
      n.pctEl.textContent = "";
    }

    // bottom-left text: downloaded / total (best effort)
    if (d.status === "completed") {
      n.sizeEl.textContent = totalBytes ? `Installing… (${formatBytes(totalBytes)})` : "Installing…";
    } else if (knownTotal && doneBytes > 0) {
      n.sizeEl.textContent = `${formatBytes(doneBytes)} / ${formatBytes(totalBytes)}`;
    } else if (knownTotal) {
      n.sizeEl.textContent = formatBytes(totalBytes);
    } else if (doneBytes > 0) {
      n.sizeEl.textContent = formatBytes(doneBytes);
    } else {
      n.sizeEl.textContent = "—";
    }

    // pause button state + icon
    if (d.status === "paused") {
      n.pauseBtn.disabled = false;
      n.pauseBtn.innerHTML = iconPlay();
      n.pauseBtn.title = "Resume";
    } else if (d.status === "completed") {
      n.pauseBtn.disabled = true;
      n.pauseBtn.innerHTML = iconPause();
      n.pauseBtn.title = "Installing...";
    } else {
      n.pauseBtn.disabled = false;
      n.pauseBtn.innerHTML = iconPause();
      n.pauseBtn.title = "Pause";
    }
  }

  function removeMissing(activeIds) {
    for (const [id, n] of state.nodes.entries()) {
      if (!activeIds.has(id)) {
        n.card.remove();
        state.nodes.delete(id);
      }
    }
  }

  /* -----------------------------
     Public UI update
 ----------------------------- */

  window.updateDownloadsUI = async function () {
    // Ensure our 2-column layout exists if Downloads page is visible
    ensureLayout();

    const wrap = document.getElementById("downloadsWrap");
    const empty = document.getElementById("downloadsEmpty");
    if (!wrap) return;

    if (!window.api?.getDownloads) {
      wrap.innerHTML = `
        <div class="emptyState">
          <div class="emptyTitle">API missing</div>
          <div class="muted">preload.js is not exposing getDownloads()</div>
        </div>
      `;
      if (empty) empty.style.display = "none";
      return;
    }

    // store metadata (covers) - build if missing
    if (state.storeById.size === 0) {
      await rebuildStoreIndex();
    }

    const rawList = await window.api.getDownloads();
    // Hide launcher self-updates from the Downloads page UI
    const list = (rawList || []).filter((d) => String(d?.gameId || "") !== "__launcher__");
    state.lastList = list || [];

    // if a game has a NEW active download, it's no longer "done"
    for (const d of list || []) {
      const gid = String(d.gameId || "");
      if (!gid) continue;
      if (d.status === "downloading" || d.status === "paused") {
        state.doneGameIds.delete(gid);
      }
    }

    // show "completed" only while install hasn't finished for that game
    const active = (list || []).filter((d) => {
      if (d.status === "downloading" || d.status === "paused") return true;
      if (d.status === "completed") {
        return !state.doneGameIds.has(String(d.gameId));
      }
      return false;
    });

    const activeIds = new Set(active.map((d) => d.id));

    if (empty) empty.style.display = active.length === 0 ? "block" : "none";

    for (const d of active) {
      const n = ensureCard(wrap, d);
      updateCard(n, d);
    }

    removeMissing(activeIds);
  };

  /* -----------------------------
     Render + bindings
 ----------------------------- */

  // Bind history listeners once globally (so history records even if you aren't on Downloads page)
  function bindHistoryOnce() {
    if (state.historyBound) return;
    state.historyBound = true;

    // Load existing history
    state.history = loadHistory();

    // Snapshot versions (used for install/update classification)
    initInstalledSnapshot();

    // Record on install-finished
    try {
      window.api?.onInstallFinished?.((p) => {
        const gid = String(p?.gameId ?? "");
        if (!gid) return;

        // record history (async; doesn't block UI)
        recordHistoryForGame(gid);
      });
    } catch {}

    // If store changes, refresh covers shown in history
    try {
      window.api?.onStoreChanged?.(() => {
        state.storeById.clear();
        // try rebuilding lazily and then rerender (covers may change)
        rebuildStoreIndex().finally(() => renderHistory());
      });
    } catch {}
  }

  window.renderDownloads = async function () {
    // Ensure layout exists on page
    ensureLayout();

    // Ensure history bindings
    bindHistoryOnce();

    // ✅ Fix: history covers were blank on first open because we rendered history
    // before building the store index (storeById). Build it first if needed.
    if (state.storeById.size === 0) {
      await rebuildStoreIndex();
    }

    // Render active downloads first (also ensures layout is mounted)
    await window.updateDownloadsUI();

    // Now that storeById exists, render history so covers show immediately.
    renderHistory();

    if (!state.bound) {
      state.bound = true;

      // live download updates (also clears done status when downloads restart)
      window.api.onDownloadUpdated?.((d) => {
        const gid = String(d?.gameId ?? "");
        if (gid === "__launcher__") return;
        if (gid && (d.status === "downloading" || d.status === "paused")) {
          state.doneGameIds.delete(gid);
        }
        window.updateDownloadsUI();
      });

      // when install finishes, hide that game's completed cards permanently
      window.api.onInstallFinished?.((p) => {
        const gid = String(p?.gameId ?? "");
        if (!gid) return;

        state.doneGameIds.add(gid);

        // remove any existing cards for this game immediately
        for (const [id, n] of state.nodes.entries()) {
          if (String(n.card?.dataset?.gameId || "") === gid) {
            n.card.remove();
            state.nodes.delete(id);
          }
        }

        window.updateDownloadsUI();
      });

      // if store changes (covers updated), rebuild store index and refresh UI
      window.api.onStoreChanged?.((payload) => {
        const at = Number(payload?.at || 0);
        if (at && at <= state.lastStoreAt) return;
        state.lastStoreAt = at || Date.now();

        state.storeById.clear();
        window.updateDownloadsUI();
        renderHistory();
      });
    }

    // light polling fallback
    if (!window.__downloadsPoll) {
      window.__downloadsPoll = setInterval(() => {
        if (document.getElementById("downloadsWrap")) window.updateDownloadsUI();
      }, 800);
    }
  };
})();
