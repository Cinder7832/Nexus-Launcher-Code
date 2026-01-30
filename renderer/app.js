// renderer/app.js

// ✅ Boot: avoid a "Store → Start page" highlight flicker.
// The HTML previously marked Store as active by default.
// We clear all active states immediately; `loadPage(start)` will set the correct one.
try {
  document.querySelectorAll(".navBtn.active").forEach((b) => b.classList.remove("active"));
} catch {}
// ----------------------------
// Tiny toast system (renderer)
// ----------------------------
function ensureToastHost() {
  let host = document.querySelector(".toastHost");
  if (!host) {
    host = document.createElement("div");
    host.className = "toastHost";
    document.body.appendChild(host);
  }
  return host;
}

function showToast(message, kind = "info") {
  const host = ensureToastHost();
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.textContent = message;

  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));

  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 200);
  }, 2600);
}

// Listen for main-process toasts
try {
  window.api?.onToast?.((t) => {
    if (!t) return;
    showToast(t.message || "Toast", t.kind || "info");
  });
} catch {}

// ✅ Live online/offline status in sidebar (renderer-only, updates instantly)
(function () {
  const el = () => document.querySelector(".statusText");
  const dot = () => document.querySelector(".dot");

  function setStatus(online) {
    const textEl = el();
    const dotEl = dot();

    if (textEl) textEl.textContent = online ? "Online" : "Offline";
    if (dotEl) {
      dotEl.style.background = online ? "#2ecc71" : "#ff3c5a";
      dotEl.style.boxShadow = online
        ? "0 0 0 4px rgba(46,204,113,.12)"
        : "0 0 0 4px rgba(255,60,90,.12)";
    }
  }

  setStatus(navigator.onLine);
  window.addEventListener("online", () => setStatus(true));
  window.addEventListener("offline", () => setStatus(false));
})();

// ----------------------------
// Sidebar nav active-state helper
// ----------------------------
// Centralizes how sidebar buttons get their "active" state.
// Passing a page that is NOT in the sidebar (e.g. "details") clears all active states.
function setActiveSidebarPage(page) {
  const p = page ? String(page) : "";
  document.querySelectorAll(".navBtn").forEach((b) => {
    const match = p && b.dataset.page === p;
    b.classList.toggle("active", !!match);
  });
}

// Expose for pages that might want to normalize nav state.
window.__setActiveSidebarPage = setActiveSidebarPage;

// ✅ Fix: Details is not a sidebar route.
// Some flows render Details without calling `loadPage("details")`.
// In those cases, the previously active sidebar item (often Downloads) can stay highlighted.
// We hook renderDetails so it always clears the sidebar active state.
(function hookRenderDetailsNavState() {
  let _renderDetails = null;

  try {
    Object.defineProperty(window, "renderDetails", {
      configurable: true,
      get() {
        return _renderDetails;
      },
      set(fn) {
        if (typeof fn !== "function") {
          _renderDetails = fn;
          return;
        }

        _renderDetails = async function (...args) {
          try {
            setActiveSidebarPage(null); // clear all sidebar highlights
            window.__currentPage = "details"; // keep refresh logic consistent
          } catch {}
          return await fn.apply(this, args);
        };
      }
    });
  } catch {
    // If defineProperty fails for any reason, we simply won't hook.
    // (Modern Electron/Chromium should support this.)
  }
})();

// ----------------------------
// Page templates (IDs MUST match page JS)
// ----------------------------
const templates = {
  store: `
    <div class="storeTop">
      <div class="simpleTop">
        <h1 class="title">All Games</h1>
        <div class="pills" id="storePills"></div>
      </div>

      <div class="searchWrap">
        <span class="searchIcon">🔎</span>
        <input class="search" id="storeSearch" placeholder="Search games..." />
      </div>
    </div>

    <div class="divider"></div>
    <div class="grid" id="storeGrid"></div>
  `,

  library: `
  <div class="storeTop">
    <div class="simpleTop">
      <h1 class="title">Library</h1>
      </div>

    <div style="display:flex; flex-direction:column; gap:12px; align-items:flex-end;">
      <div class="searchWrap">
        <span class="searchIcon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="M21 21l-4.35-4.35"></path>
          </svg>
        </span>
        <input class="search" id="librarySearch" placeholder="Search installed games..." />
      </div>

      <button class="btnSecondary" id="checkUpdatesBtn" type="button">Check for updates</button>
    </div>
  </div>

  <div class="divider"></div>

  <div id="libraryEmpty" class="emptyState" style="display:none;">
    <div class="emptyTitle" id="libraryEmptyTitle">No games installed</div>
    <div class="muted" id="libraryEmptySub">Install something from the Store first.</div>
  </div>

  <div class="grid" id="libraryGrid"></div>
  `,

  downloads: `
    <div class="simpleTop">
      <h1 class="title">Downloads</h1>
      </div>

    <div class="divider"></div>

    <div id="downloadsEmpty" class="emptyState" style="display:none;">
      <div class="emptyTitle">No active downloads</div>
      <div class="muted">When you install or update a game, it will show here.</div>
    </div>

    <div id="downloadsWrap"></div>
  `,

  analytics: `
    <div class="simpleTop">
      <h1 class="title">Analytics</h1>
    </div>

    <div class="divider"></div>

    <div id="analyticsWrap"></div>
  `,

  settings: `
    <div class="simpleTop">
      <h1 class="title">Settings</h1>
      </div>

    <div class="divider"></div>

    <div class="panel">
      <div class="panelTitle">Install folder</div>

      <div class="panelRow">
        <input class="input" id="installRoot" value="Loading..." readonly />
        <button class="btnSecondary" id="changeInstallRoot" type="button">Choose</button>
      </div>

      <div class="muted" style="margin-top:10px; font-weight:700;">
        Games will install into this folder.
      </div>
    </div>
  `,

  details: `
    <div id="detailsHero" class="detailsHero">
      <button class="backBtn" id="detailsBackBtn" type="button">← Back</button>
    </div>

    <div class="detailsBody">
      <div class="detailsLeft">
        <div class="sectionTitle">About the Game</div>
        <p class="detailsDesc" id="detailsDesc"></p>

        <div style="height:18px;"></div>

        <div class="sectionTitle">Screenshots</div>
        <div class="shots" id="detailsShots"></div>
      </div>

      <div class="detailsRight">
        <button class="ctaBtn" id="detailsCtaBtn" type="button">Install</button>

        <div class="infoCard">
          <div class="infoRow"><span>Version</span><span id="detailsVersion">—</span></div>
          <div class="infoRow"><span>Status</span><span id="detailsStatus">—</span></div>
          <div class="infoRow"><span>Category</span><span id="detailsCategory">—</span></div>
        </div>

        <button class="dangerBtn" id="detailsUninstallBtn" type="button" style="display:none;">Uninstall</button>
      </div>
    </div>
  `
};

// ----------------------------
// Navigation / page loading (opacity-only fade)
// ----------------------------
const pageEl = document.getElementById("page");
let isSwitching = false;

// ✅ queue last requested page so clicks never get “ignored”
let __pendingPage = null;

// ✅ track current page so we can refresh it live
window.__currentPage = null;

// ✅ updates cache (used by Library + Details)
window.__updatesByGameId = window.__updatesByGameId || new Map();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runRenderer(page) {
  if (page === "store") return await window.renderStore?.();
  if (page === "library") return await window.renderLibrary?.();
  if (page === "downloads") return await window.renderDownloads?.();
  if (page === "analytics") return await window.renderAnalytics?.();
  if (page === "settings") return await window.renderSettings?.();
  if (page === "details") return await window.renderDetails?.();
}

// ✅ small debounce so events don't spam renders
let __refreshTimer = null;
function requestRefreshCurrentPage(delay = 120) {
  if (!window.__currentPage) return;

  // ✅ FIX: don't re-render while we're switching pages (prevents "click downloads twice")
  if (isSwitching) return;

  clearTimeout(__refreshTimer);
  __refreshTimer = setTimeout(async () => {
    try {
      // ✅ FIX: if a switch started after scheduling, don't run
      if (isSwitching) return;

      if (window.__currentPage === "downloads") {
        if (typeof window.updateDownloadsUI === "function") {
          await window.updateDownloadsUI();
        } else {
          await runRenderer("downloads");
        }
        return;
      }

      if (["store", "library", "details", "settings", "analytics"].includes(window.__currentPage)) {
        await runRenderer(window.__currentPage);
      }
    } catch (e) {
      console.error(e);
    }
  }, delay);
}

function setUpdatesMapFromPayload(payload) {
  const list = Array.isArray(payload) ? payload : (payload?.updates || []);
  const m = new Map();

  for (const u of list) {
    const gid = String(u.gameId ?? u.id ?? u.game_id ?? "");
    if (!gid) continue;
    m.set(gid, u);
  }

  window.__updatesByGameId = m;
}

// ✅ refresh UI when install finishes
try {
  window.api?.onInstallFinished?.(() => requestRefreshCurrentPage(0));
  // Download progress events can fire many times per second.
  // Individual pages (Downloads/Details/Store) listen for these and update in-place.
  // Avoid re-rendering the whole current page here, which can cause hover/transition jitter.
  window.api?.onDownloadUpdated?.(() => {});
} catch {}

// ✅ live store changes -> refresh current page
try {
  window.api?.onStoreChanged?.(() => requestRefreshCurrentPage(0));
} catch {}

// ✅ update list changes -> refresh library/details so Update buttons appear
try {
  window.api?.onUpdatesChanged?.((u) => {
    setUpdatesMapFromPayload(u);
    requestRefreshCurrentPage(0);
  });
} catch {}

// ✅ NEW: live installed stats watcher (playtime / lastPlayed)
// Fixes: playtime only updating after switching pages
(function installInstalledStatsWatcher() {
  if (window.__installedStatsWatcher) return;
  window.__installedStatsWatcher = true;

  let lastSig = "";

  function signature(installed) {
    const obj = installed || {};
    const ids = Object.keys(obj).sort();
    const slim = ids.map((id) => ({
      id,
      playtimeSeconds: obj[id]?.playtimeSeconds || 0,
      lastPlayed: obj[id]?.lastPlayed || null
    }));
    return JSON.stringify(slim);
  }

  setInterval(async () => {
    // only refresh where playtime is visible
    if (!["library", "details"].includes(window.__currentPage)) return;
    if (!window.api?.getInstalled) return;

    try {
      const installed = await window.api.getInstalled();
      const sig = signature(installed);

      if (sig !== lastSig) {
        lastSig = sig;
        requestRefreshCurrentPage(0);
      }
    } catch {
      // ignore
    }
  }, 1200);
})();

// ✅ IMPORTANT: wire Refresh button
(function bindRefreshButtonOnce() {
  const btn = document.getElementById("refreshBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    if (!window.api?.refreshStore) {
      showToast("Refresh is not available (preload not updated).", "error");
      return;
    }

    btn.disabled = true;

    try {
      await window.api.refreshStore();
      requestRefreshCurrentPage(0);
      showToast("Refreshed", "success");
    } catch (e) {
      console.error(e);
      showToast("Refresh failed (check console).", "error");
    } finally {
      btn.disabled = false;
    }
  });
})();

window.loadPage = async function (page) {
  if (!pageEl) return;

  // ✅ if switching, queue this request instead of ignoring it
  if (isSwitching) {
    __pendingPage = page;
    return;
  }

  // ✅ FIX: cancel any queued refresh from download events before switching pages
  clearTimeout(__refreshTimer);

  isSwitching = true;

  pageEl.classList.add("isFading");
  await sleep(180);

  pageEl.innerHTML = templates[page] || `<h1 class="title">Missing page</h1>`;

  // ✅ Update sidebar highlight (non-sidebar pages like "details" clear all)
  try {
    setActiveSidebarPage(page);
  } catch {
    // fallback (shouldn't happen)
    document.querySelectorAll(".navBtn").forEach((b) => {
      b.classList.toggle("active", b.dataset.page === page);
    });
  }

  // ✅ set current page BEFORE render
  window.__currentPage = page;

  try {
    await runRenderer(page);
  } catch (e) {
    console.error(e);
    showToast("Page failed to render (check console).", "error");
  }

    // Premium enter animation (keeps page hidden while swapping content)
  pageEl.classList.remove("isFading");
  pageEl.classList.add("isEntering");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => pageEl.classList.remove("isEntering"));
  });
  isSwitching = false;

  // ✅ immediately go to the most recent queued page (if any)
  if (__pendingPage && __pendingPage !== page) {
    const next = __pendingPage;
    __pendingPage = null;
    window.loadPage(next);
  } else {
    __pendingPage = null;
  }
};

// Hook up sidebar buttons
document.querySelectorAll(".navBtn").forEach((btn) => {
  btn.addEventListener("click", () => window.loadPage(btn.dataset.page));
});

/* ----------------------------
   ✅ Launcher update popup (startup)
   - Silent check on launch
   - Shows a modal if an update exists
   - Does NOT dismiss permanently (will show again next launch if still out of date)
   - Does NOT close when clicking outside
---------------------------- */
const NX_LU_POPUP_STYLE_ID = "nxLauncherUpdatePopupStyle";
const NX_LU_POPUP_OVERLAY_ID = "nxLauncherUpdateOverlay";

function ensureLauncherUpdatePopupStyles() {
  if (document.getElementById(NX_LU_POPUP_STYLE_ID)) return;

  const s = document.createElement("style");
  s.id = NX_LU_POPUP_STYLE_ID;
  s.textContent = `
    .nxLuOverlay{
      position: fixed; inset: 0; z-index: 99996;
      display: grid; place-items: center;
      padding: 22px;
      background: rgba(0,0,0,.62);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      animation: nxLuFadeIn .16s ease both;
    }
    .nxLuCard{
      width: min(560px, 92vw);
      border-radius: 22px;
      background: rgba(18,20,30,.92);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 40px 120px rgba(0,0,0,.65);
      overflow: hidden;
      outline: none;
    }
    .nxLuTop{
      padding: 16px 16px 12px 16px;
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap: 12px;
    }
    .nxLuTitle{
      font-weight: 950;
      font-size: 15px;
      letter-spacing: .2px;
      color: #fff;
    }
    .nxLuSub{
      margin-top: 6px;
      color: rgba(255,255,255,.70);
      font-weight: 750;
      font-size: 13px;
      line-height: 1.35;
    }
    .nxLuBody{ padding: 0 16px 14px 16px; }
    .nxLuMeta{
      margin-top: 10px;
      padding: 10px 12px;
      border-radius: 16px;
      background: rgba(255,255,255,.05);
      border: 1px solid rgba(255,255,255,.08);
      color: rgba(255,255,255,.76);
      font-weight: 800;
      font-size: 12.5px;
      line-height: 1.35;
    }
    .nxLuDivider{ height: 1px; background: rgba(255,255,255,.06); }
    .nxLuActions{
      padding: 12px 16px 16px 16px;
      display:flex;
      justify-content:flex-end;
      gap: 10px;
    }
    .nxLuBtn{
      border: none;
      cursor: pointer;
      border-radius: 14px;
      padding: 11px 14px;
      font-weight: 950;
      color: #fff;
      background: rgba(255,255,255,.08);
      transition: transform .12s ease, background .16s ease;
    }
    .nxLuBtn:hover{ background: rgba(255,255,255,.12); transform: translateY(-1px); }
    .nxLuBtn:active{ transform: translateY(0) scale(.98); }
    .nxLuBtnPrimary{
      background: rgba(124,92,255,.28);
      border: 1px solid rgba(124,92,255,.22);
    }
    .nxLuBtnPrimary:hover{ background: rgba(124,92,255,.34); }

    @keyframes nxLuFadeIn{
      from{ opacity:0; transform: translateY(8px); }
      to{ opacity:1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(s);
}

function openLauncherUpdatePopup(info) {
  try {
    if (window.__nxLauncherUpdatePopupShown) return;
    window.__nxLauncherUpdatePopupShown = true;
  } catch {}

  ensureLauncherUpdatePopupStyles();

  if (document.getElementById(NX_LU_POPUP_OVERLAY_ID)) return;

  const overlay = document.createElement("div");
  overlay.id = NX_LU_POPUP_OVERLAY_ID;
  overlay.className = "nxLuOverlay";

  const current = String(info?.current || "—");
  const latest = String(info?.latest || "—");

  overlay.innerHTML = `
    <div class="nxLuCard" tabindex="-1" role="dialog" aria-modal="true">
      <div class="nxLuTop">
        <div style="min-width:0; flex:1;">
          <div class="nxLuTitle">Launcher update available</div>
          <div class="nxLuSub">A newer version of Nexus Launcher is ready to install.</div>
        </div>
      </div>

      <div class="nxLuBody">
        <div class="nxLuMeta">
          Current: <strong>${current}</strong><br/>
          Latest: <strong>${latest}</strong>
        </div>
      </div>

      <div class="nxLuDivider"></div>

      <div class="nxLuActions">
        <button class="nxLuBtn" id="nxLuLaterBtn" type="button">Later</button>
        <button class="nxLuBtn nxLuBtnPrimary" id="nxLuOpenSettingsBtn" type="button">Open Settings</button>
      </div>
    </div>
  `;

  const card = overlay.querySelector(".nxLuCard");
  const laterBtn = overlay.querySelector("#nxLuLaterBtn");
  const openBtn = overlay.querySelector("#nxLuOpenSettingsBtn");

  let closing = false;
  const prevOverflow = document.documentElement.style.overflow;

  function close() {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    try { document.documentElement.style.overflow = prevOverflow || ""; } catch {}
    overlay.remove();
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  // IMPORTANT: do NOT close on overlay clicks.
  // Swallow clicks in the *bubbling* phase so buttons still receive their click events.
  overlay.addEventListener("click", (e) => { e.stopPropagation(); }, false);
  card?.addEventListener("click", (e) => { e.stopPropagation(); }, false);

  laterBtn?.addEventListener("click", close);

  openBtn?.addEventListener("click", () => {
    close();
    try { window.loadPage("settings"); } catch {}
  });

  document.addEventListener("keydown", onKey);
  try { document.documentElement.style.overflow = "hidden"; } catch {}
  document.body.appendChild(overlay);

  // Avoid leaving a button focused (looks like the nav button is "selected")
  try { card?.focus?.(); } catch {}
}


// ----------------------------
// ✅ Launcher update startup popup
// - Runs a silent launcher update check on startup
// - Shows a modal if an update is available
// - "Later" just closes; it will show again next launch if still available
// - Clicking outside does NOT close
// ----------------------------
(function initLauncherUpdateStartupPopup() {
  const STYLE_ID = "nxLuStartupPopupStyle";
  const OVERLAY_ID = "nxLuStartupPopupOverlay";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      .nxLuOverlay{
        position:fixed; inset:0; z-index:99997;
        display:grid; place-items:center;
        padding:22px;
        background: rgba(0,0,0,.62);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        animation: nxLuFadeIn .16s ease both;
      }
      .nxLuCard{
        width:min(560px, 92vw);
        border-radius:22px;
        background: rgba(18,20,30,.92);
        border:1px solid rgba(255,255,255,.10);
        box-shadow: 0 34px 110px rgba(0,0,0,.65);
        overflow:hidden;
      }
      .nxLuTop{
        padding:16px 16px 12px 16px;
        display:flex; gap:12px; align-items:flex-start;
      }
      .nxLuIcon{
        width:42px; height:42px; border-radius:14px;
        display:grid; place-items:center;
        background: rgba(124,92,255,.14);
        border: 1px solid rgba(124,92,255,.22);
        flex:0 0 auto;
      }
      .nxLuIcon svg{
        width:20px; height:20px;
        stroke: rgba(255,255,255,.92);
        fill:none;
        stroke-width:2.2;
        stroke-linecap:round;
        stroke-linejoin:round;
      }
      .nxLuTitle{
        font-size:16px;
        font-weight:950;
        letter-spacing:.2px;
        margin-top:2px;
        color:#fff;
      }
      .nxLuMsg{
        margin-top:6px;
        color: rgba(255,255,255,.72);
        font-weight:650;
        line-height:1.45;
        font-size:13.5px;
      }
      .nxLuMeta{
        margin-top:10px;
        font-size:12.5px;
        color: rgba(255,255,255,.72);
        font-weight:800;
        line-height:1.4;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.08);
        padding:10px 12px;
        border-radius:14px;
      }
      .nxLuDivider{ height:1px; background: rgba(255,255,255,.06); }
      .nxLuActions{
        padding:14px 16px 16px 16px;
        display:flex;
        justify-content:flex-end;
        gap:10px;
      }
      .nxLuBtn{
        border:none;
        cursor:pointer;
        border-radius:14px;
        padding:11px 14px;
        font-weight:900;
        color:#fff;
        background: rgba(255,255,255,.08);
        transition: transform .12s ease, background .16s ease, filter .16s ease;
      }
      .nxLuBtn:hover{ background: rgba(255,255,255,.12); transform: translateY(-1px); }
      .nxLuBtn:active{ transform: translateY(0) scale(.98); }

      .nxLuBtnPrimary{
        background: rgba(124,92,255,.28);
        border: 1px solid rgba(124,92,255,.22);
      }
      .nxLuBtnPrimary:hover{ background: rgba(124,92,255,.34); }

      @keyframes nxLuFadeIn{
        from{ opacity:0; transform: translateY(8px); }
        to{ opacity:1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(s);
  }

  function closeExisting() {
    try { document.getElementById(OVERLAY_ID)?.remove(); } catch {}
  }

  function openPopup(info) {
    ensureStyles();
    closeExisting();

    const current = info?.current ? String(info.current) : "—";
    const latest = info?.latest ? String(info.latest) : "";

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.className = "nxLuOverlay";

    overlay.innerHTML = `
      <div class="nxLuCard" role="dialog" aria-modal="true">
        <div class="nxLuTop">
          <div class="nxLuIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M21 12a9 9 0 0 1-15.3 6.36"></path>
              <path d="M3 12a9 9 0 0 1 15.3-6.36"></path>
              <path d="M3 18v-5h5"></path>
              <path d="M21 6v5h-5"></path>
            </svg>
          </div>
          <div style="flex:1; min-width:0;">
            <div class="nxLuTitle">Launcher update available</div>
            <div class="nxLuMsg">Update Nexus Launcher to get the latest fixes and features.</div>
            <div class="nxLuMeta">
              Current: <strong>${current}</strong>${latest ? ` • Latest: <strong>${latest}</strong>` : ``}
            </div>
          </div>
        </div>

        <div class="nxLuDivider"></div>

        <div class="nxLuActions">
          <button class="nxLuBtn" data-act="later" type="button">Later</button>
          <button class="nxLuBtn nxLuBtnPrimary" data-act="open-settings" type="button">Open Settings</button>
        </div>
      </div>
    `;

    const card = overlay.querySelector(".nxLuCard");
    const laterBtn = overlay.querySelector('[data-act="later"]');
    const openBtn = overlay.querySelector('[data-act="open-settings"]');

    function close() {
      document.removeEventListener("keydown", onKey);
      try { overlay.remove(); } catch {}
    }

    function onKey(e) {
      if (e.key === "Escape") close();
    }

    // ❌ Do NOT close on outside click.
    // ✅ Still stop clicks from bubbling to any global handlers.
    overlay.addEventListener("click", (e) => { e.stopPropagation(); }, false);
    card?.addEventListener("click", (e) => { e.stopPropagation(); }, false);

    laterBtn?.addEventListener("click", () => close());
    openBtn?.addEventListener("click", () => {
      close();
      try { window.loadPage?.("settings"); } catch {}
    });

    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);

    // Avoid focusing "Open Settings" (it looked selected)
    setTimeout(() => {
      try { laterBtn?.focus?.(); } catch {}
    }, 0);
  }

  async function runStartupCheck() {
    if (window.__nxStartupLauncherUpdateCheckDone) return;
    window.__nxStartupLauncherUpdateCheckDone = true;

    if (!navigator.onLine) return;
    if (typeof window.api?.checkLauncherUpdate !== "function") return;

    try {
      const res = await window.api.checkLauncherUpdate();

      // Keep a shared copy for Settings (and any badge you might add later)
      try {
        if (res && typeof res === "object") {
          window.__nxLauncherUpdate = {
            checked: !!res.ok,
            current: String(res.current || ""),
            latest: String(res.latest || ""),
            hasUpdate: !!res.hasUpdate,
            publishedAt: res.publishedAt || null,
            checkedAt: Date.now()
          };
          if (typeof window.__nxSetSettingsUpdateBadge === "function") {
            window.__nxSetSettingsUpdateBadge(!!res.hasUpdate);
          }
        }
      } catch {}

      if (res?.ok && res.hasUpdate) {
        openPopup(res);
      }
    } catch {
      // ignore
    }
  }

  // Called by the boot flow after the first page mounts.
  window.__nxScheduleLauncherUpdateStartupCheck = function () {
    setTimeout(runStartupCheck, 850);
  };
})();


// ✅ Default page (NOW READS SETTINGS startPage)
(async () => {
  let start = "store";
  try {
    const s = await window.api?.getSettings?.();
    const p = String(s?.startPage || "store").toLowerCase();
    if (p === "library") start = "library";
  } catch {}

  window.loadPage(start);

  // ✅ Auto-check for game updates on launcher open (silent unless updates exist)
  // Uses main-process "check-updates" but passes { silent: true } so it won't toast when none exist.
  try {
    if (!window.__nxStartupUpdateCheckDone) {
      window.__nxStartupUpdateCheckDone = true;

      if (navigator.onLine && typeof window.api?.checkUpdates === "function") {
        // Don't block first render; run shortly after the start page mounts.
        setTimeout(() => {
          try {
            window.api.checkUpdates({ silent: true });
          } catch {}
        }, 650);
      }
    }
  } catch {}


// ✅ Silent launcher update check on open
try {
  if (!window.__nxStartupLauncherUpdateCheckDone) {
    window.__nxStartupLauncherUpdateCheckDone = true;

    if (navigator.onLine && typeof window.api?.checkLauncherUpdate === "function") {
      setTimeout(async () => {
        try {
          const res = await window.api.checkLauncherUpdate({ silent: true });
          if (!res?.ok) return;

          // Keep shared state (Settings page reuses this)
          try {
            window.__nxLauncherUpdate = {
              checked: true,
              current: String(res.current || ""),
              latest: String(res.latest || ""),
              hasUpdate: !!res.hasUpdate,
              checkedAt: Date.now()
            };
          } catch {}

          if (res.hasUpdate) {
            openLauncherUpdatePopup(res);
          }
        } catch {}
      }, 900);
    }
  }
} catch {}
})();


// ----------------------------
// ✅ Announcements bell + drawer (not a new nav tab)
// ----------------------------
(function initAnnouncementsBell() {
  const bellBtn = document.getElementById("announcementsBtn");
  const dotEl = document.getElementById("announcementsDot");
  if (!bellBtn) return;

  const STYLE_ID = "nxAnnouncementsStyle";

  function ensureUI() {
    if (!document.getElementById(STYLE_ID)) {
      const s = document.createElement("style");
      s.id = STYLE_ID;
      s.textContent = `
        .nxAnnOverlay{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,.45);
          opacity: 0;
          pointer-events: none;
          transition: opacity .18s ease;
          z-index: 9998;
        }
        .nxAnnDrawer{
          position: fixed;
          top: 0;
          right: 0;
          height: 100vh;
          width: min(460px, 92vw);
          /* More translucent (closer to the changelog modal feel) */
          background: rgba(18,20,30,.78);
          -webkit-backdrop-filter: blur(16px);
          backdrop-filter: blur(16px);
          border-left: 1px solid rgba(255,255,255,.08);
          box-shadow: -30px 0 90px rgba(0,0,0,.55);
          transform: translateX(110%);
          opacity: 0;
          pointer-events: none;
          transition: transform .22s cubic-bezier(.2,.9,.2,1), opacity .18s ease;
          z-index: 9999;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .nxAnnOverlay.open{ opacity: 1; pointer-events: auto; }
        .nxAnnDrawer.open{ transform: translateX(0); opacity: 1; pointer-events: auto; }

        .nxAnnHeader{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .nxAnnTitle{ font-size: 18px; font-weight: 950; letter-spacing: -.2px; }
        .nxAnnSub{ margin-top: 6px; color: rgba(255,255,255,.62); font-weight: 850; font-size: 12px; }
        .nxAnnHeaderBtns{ display:flex; gap:10px; }

        .nxAnnIconBtn{
          width: 40px;
          height: 40px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.06);
          cursor: pointer;
          display:grid;
          place-items:center;
          transition: transform .12s ease, background .16s ease, border-color .16s ease, box-shadow .22s ease;
        }
        .nxAnnIconBtn:hover{
          background: rgba(255,255,255,.09);
          border-color: rgba(255,255,255,.14);
          box-shadow: 0 18px 46px rgba(0,0,0,.22);
          transform: translateY(-1px);
        }
        .nxAnnIconBtn:active{ transform: translateY(0) scale(.98); }
        .nxAnnIconBtn svg{ width: 18px; height: 18px; stroke: rgba(255,255,255,.90); fill: none; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }

        .nxAnnContent{
          margin-top: 4px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.04);
          padding: 12px;
          overflow: auto;
          flex: 1 1 auto;
        }

        .nxAnnItem{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.06);
          background: rgba(255,255,255,.04);
          overflow: hidden;
          margin-bottom: 10px;
        }
        .nxAnnItem:last-child{ margin-bottom: 0; }

        .nxAnnItemHead{
          width: 100%;
          padding: 12px 12px;
          background: transparent;
          border: 0;
          color: rgba(255,255,255,.95);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .nxAnnItemHead:hover{ background: rgba(255,255,255,.04); }
        .nxAnnItemLeft{ min-width: 0; display:flex; flex-direction:column; gap:6px; }
        .nxAnnItemTitle{ font-weight: 950; font-size: 13.5px; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }
        .nxAnnItemMeta{ display:flex; align-items:center; gap: 8px; flex-wrap: wrap; }
        .nxAnnTag{
          font-size: 11px;
          font-weight: 950;
          padding: 5px 9px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.06);
          color: rgba(255,255,255,.88);
        }
        .nxAnnDate{ color: rgba(255,255,255,.60); font-weight: 850; font-size: 12px; }

        .nxAnnChevron{ width: 20px; height: 20px; stroke: rgba(255,255,255,.78); transition: transform .18s ease; flex: 0 0 auto; }
        .nxAnnItem.open .nxAnnChevron{ transform: rotate(180deg); }

        .nxAnnBody{
          max-height: 0;
          opacity: 0;
          transform: translateY(-4px);
          transition: max-height .22s cubic-bezier(.2,.9,.2,1), opacity .18s ease, transform .22s cubic-bezier(.2,.9,.2,1);
          padding: 0 12px;
        }
        .nxAnnItem.open .nxAnnBody{
          max-height: 420px;
          opacity: 1;
          transform: translateY(0);
          padding-bottom: 12px;
        }
        .nxAnnBody p{
          margin: 10px 0 0 0;
          color: rgba(255,255,255,.82);
          font-weight: 750;
          font-size: 13px;
          line-height: 1.45;
        }
        .nxAnnBody p:first-child{ margin-top: 0; }

        .nxAnnEmpty{
          padding: 14px;
          border-radius: 16px;
          background: rgba(255,255,255,.03);
          border: 1px solid rgba(255,255,255,.05);
          color: rgba(255,255,255,.65);
          font-weight: 800;
          line-height: 1.35;
        }
        .nxAnnLoadingRow{
          height: 56px;
          border-radius: 16px;
          background: rgba(255,255,255,.04);
          border: 1px solid rgba(255,255,255,.06);
          margin-bottom: 10px;
          position: relative;
          overflow: hidden;
        }
        .nxAnnLoadingRow:after{
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.10), rgba(255,255,255,0));
          transform: translateX(-120%);
          animation: nxAnnShimmer 1.1s linear infinite;
        }
        @keyframes nxAnnShimmer{ to{ transform: translateX(120%); } }

        @media (prefers-reduced-motion: reduce){
          .nxAnnOverlay, .nxAnnDrawer, .nxAnnChevron, .nxAnnBody, .nxAnnIconBtn{ transition: none !important; }
          .nxAnnLoadingRow:after{ animation: none !important; }
        }
      `;
      document.head.appendChild(s);
    }

    if (!document.getElementById("nxAnnOverlay")) {
      const overlay = document.createElement("div");
      overlay.id = "nxAnnOverlay";
      overlay.className = "nxAnnOverlay";
      document.body.appendChild(overlay);
    }

    if (!document.getElementById("nxAnnDrawer")) {
      const drawer = document.createElement("aside");
      drawer.id = "nxAnnDrawer";
      drawer.className = "nxAnnDrawer";
      drawer.setAttribute("role", "dialog");
      drawer.setAttribute("aria-modal", "true");
      drawer.innerHTML = `
        <div class="nxAnnHeader">
          <div style="min-width:0;">
            <div class="nxAnnTitle">Announcements</div>
            <div class="nxAnnSub" id="nxAnnSub">Latest updates from the team</div>
          </div>
          <div class="nxAnnHeaderBtns">
            <button class="nxAnnIconBtn" id="nxAnnRefreshBtn" type="button" title="Refresh">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21 12a9 9 0 0 0-15-6.36"></path>
                <path d="M3 12a9 9 0 0 0 15 6.36"></path>
                <path d="M21 4v6h-6"></path>
                <path d="M3 20v-6h6"></path>
              </svg>
            </button>
            <button class="nxAnnIconBtn" id="nxAnnCloseBtn" type="button" title="Close">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18"></path>
                <path d="M6 6 18 18"></path>
              </svg>
            </button>
          </div>
        </div>
        <div class="nxAnnContent" id="nxAnnContent"></div>
      `;
      document.body.appendChild(drawer);
    }
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function openDrawer() {
    ensureUI();
    document.getElementById("nxAnnOverlay")?.classList.add("open");
    document.getElementById("nxAnnDrawer")?.classList.add("open");
    // prevent background scroll
    document.documentElement.style.overflow = "hidden";
  }

  function closeDrawer() {
    document.getElementById("nxAnnOverlay")?.classList.remove("open");
    document.getElementById("nxAnnDrawer")?.classList.remove("open");
    document.documentElement.style.overflow = "";
  }

  async function updateDot() {
    if (!window.api?.getAnnouncements || !window.api?.getAnnouncementsSeen) {
      if (dotEl) dotEl.style.display = "none";
      return;
    }

    try {
      const [annRes, seen] = await Promise.all([
        window.api.getAnnouncements({ force: false }),
        window.api.getAnnouncementsSeen()
      ]);

      const list = Array.isArray(annRes?.announcements) ? annRes.announcements : [];
      const latestId = list[0]?.id ? String(list[0].id) : "";
      const lastSeenId = seen?.lastSeenId ? String(seen.lastSeenId) : "";

      const unread = !!latestId && latestId !== lastSeenId;
      if (dotEl) dotEl.style.display = unread ? "block" : "none";
    } catch {
      if (dotEl) dotEl.style.display = "none";
    }
  }

  function renderLoading() {
    const content = document.getElementById("nxAnnContent");
    if (!content) return;
    content.innerHTML = `
      <div class="nxAnnLoadingRow"></div>
      <div class="nxAnnLoadingRow"></div>
      <div class="nxAnnLoadingRow"></div>
    `;
  }

  function renderAnnouncements(list) {
    const content = document.getElementById("nxAnnContent");
    if (!content) return;

    if (!list.length) {
      content.innerHTML = `<div class="nxAnnEmpty">No announcements yet.</div>`;
      return;
    }

    content.innerHTML = list
      .map((a, idx) => {
        const tag = a.tag ? `<span class="nxAnnTag">${esc(a.tag)}</span>` : "";
        const date = a.date ? `<span class="nxAnnDate">${esc(a.date)}</span>` : "";
        const paras = Array.isArray(a.body) ? a.body : [];
        const bodyHtml = paras.map((p) => `<p>${esc(p)}</p>`).join("");
        const open = idx === 0 ? "open" : "";
        return `
          <div class="nxAnnItem ${open}" data-id="${esc(a.id)}">
            <button class="nxAnnItemHead" type="button">
              <div class="nxAnnItemLeft">
                <div class="nxAnnItemTitle">${esc(a.title)}</div>
                <div class="nxAnnItemMeta">${tag}${date}</div>
              </div>
              <svg class="nxAnnChevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
            </button>
            <div class="nxAnnBody">${bodyHtml || `<p>(No details)</p>`}</div>
          </div>
        `;
      })
      .join("");

    // accordion behavior
    content.querySelectorAll(".nxAnnItem").forEach((item) => {
      const head = item.querySelector(".nxAnnItemHead");
      head?.addEventListener("click", () => {
        item.classList.toggle("open");
      });
    });
  }

  async function loadAnnouncements(force = false) {
    renderLoading();

    const sub = document.getElementById("nxAnnSub");
    if (sub) sub.textContent = "Loading announcements…";

    let annRes = null;
    try {
      annRes = await window.api.getAnnouncements({ force });
    } catch (e) {
      annRes = { ok: false, announcements: [], error: e?.message || String(e) };
    }

    const list = Array.isArray(annRes?.announcements) ? annRes.announcements : [];
    if (sub) {
      if (annRes?.ok) {
        sub.textContent = annRes.cached ? "Find the latest news" : "Up to date";
      } else {
        sub.textContent = "Offline / failed to fetch announcements";
      }
    }

    renderAnnouncements(list);

    // mark as seen (latest only) when opened
    try {
      const latestId = list[0]?.id ? String(list[0].id) : "";
      if (latestId && window.api?.setAnnouncementsSeen) {
        await window.api.setAnnouncementsSeen({ lastSeenId: latestId, lastSeenAt: Date.now() });
      }
    } catch {}

    // update dot after marking seen
    updateDot();
  }

  // Open on click
  bellBtn.addEventListener("click", async () => {
    openDrawer();
    await loadAnnouncements(false);
  });

  // Bind close + overlay click once
  ensureUI();
  document.getElementById("nxAnnOverlay")?.addEventListener("click", closeDrawer);
  document.getElementById("nxAnnCloseBtn")?.addEventListener("click", closeDrawer);
  document.getElementById("nxAnnRefreshBtn")?.addEventListener("click", async () => {
    await loadAnnouncements(true);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
  });

  // Initial dot check
  updateDot();
})();
