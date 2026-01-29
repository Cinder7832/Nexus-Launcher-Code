// renderer/pages/settings.page.js
(function () {
  const MODAL_STYLE_ID = "nxMigrateModalStyle";
  const WEBSITE_URL = "https://nexus-launcher.base44.app/";
  const SETTINGS_STYLE_ID = "nxSettingsLaunchModeStyle";
  const LAYOUT_STYLE_ID = "nxSettingsLayoutRevampStyle";

  function ensureModalStyles() {
    if (document.getElementById(MODAL_STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = MODAL_STYLE_ID;
    s.textContent = `
      .nxModalOverlay{
        position:fixed; inset:0; z-index:9999;
        display:grid; place-items:center;
        padding:22px;
        background: rgba(0,0,0,.55);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        animation: nxFadeIn .14s ease both;
      }
      .nxModalCard{
        width:min(560px, 92vw);
        border-radius:22px;
        background: rgba(20,22,30,.92);
        border:1px solid rgba(255,255,255,.10);
        box-shadow: 0 30px 80px rgba(0,0,0,.55);
        overflow:hidden;
      }
      .nxModalTop{
        padding:18px 18px 12px 18px;
        display:flex; gap:12px; align-items:flex-start;
      }
      .nxModalIcon{
        width:42px; height:42px; border-radius:14px;
        display:grid; place-items:center;
        background: rgba(124,92,255,.14);
        border: 1px solid rgba(124,92,255,.22);
        flex:0 0 auto;
      }
      .nxModalIcon svg{
        width:20px; height:20px;
        stroke: rgba(255,255,255,.92);
        fill:none;
        stroke-width:2.2;
        stroke-linecap:round;
        stroke-linejoin:round;
      }
      .nxModalTitle{
        font-size:16px;
        font-weight:900;
        letter-spacing:.2px;
        margin-top:2px;
        color:#fff;
      }
      .nxModalMsg{
        margin-top:6px;
        color: rgba(255,255,255,.72);
        font-weight:650;
        line-height:1.45;
        font-size:13.5px;
      }
      .nxModalPaths{
        margin-top:10px;
        font-size:12.5px;
        color: rgba(255,255,255,.72);
        font-weight:700;
        line-height:1.4;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.08);
        padding:10px 12px;
        border-radius:14px;
        word-break: break-word;
      }
      .nxModalDivider{ height:1px; background: rgba(255,255,255,.06); }
      .nxModalActions{
        padding:14px 16px 16px 16px;
        display:flex;
        justify-content:flex-end;
        gap:10px;
      }
      .nxBtn{
        border:none;
        cursor:pointer;
        border-radius:14px;
        padding:11px 14px;
        font-weight:900;
        color:#fff;
        background: rgba(255,255,255,.08);
        transition: transform .12s ease, background .16s ease, filter .16s ease;
      }
      .nxBtn:hover{ background: rgba(255,255,255,.12); transform: translateY(-1px); }
      .nxBtn:active{ transform: translateY(0) scale(.98); }
      .nxBtn:disabled{ opacity:.6; cursor:default; transform:none; }

      .nxBtnPrimary{
        background: rgba(124,92,255,.28);
        border: 1px solid rgba(124,92,255,.22);
      }
      .nxBtnPrimary:hover{ background: rgba(124,92,255,.34); }

      @keyframes nxFadeIn{
        from{ opacity:0; transform: translateY(8px); }
        to{ opacity:1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(s);
  }

  function ensureLaunchModeStyles() {
    if (document.getElementById(SETTINGS_STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = SETTINGS_STYLE_ID;
    s.textContent = `
      .nxLaunchRow{
        margin-top:14px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:14px;
      }
      .nxLaunchLeft{
        display:flex;
        flex-direction:column;
        gap:6px;
        min-width: 0;
      }
      .nxLaunchTitle{
        font-weight:900;
        color:#fff;
        letter-spacing:.2px;
      }
      .nxLaunchSub{
        color: rgba(255,255,255,.65);
        font-weight:650;
        font-size:13px;
        line-height:1.35;
      }
      .nxSeg{
        display:flex;
        gap:8px;
        padding:6px;
        border-radius:16px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.08);
      }
      .nxSegBtn{
        border:none;
        cursor:pointer;
        padding:10px 12px;
        border-radius:12px;
        font-weight:900;
        color: rgba(255,255,255,.78);
        background: transparent;
        transition: background .16s ease, transform .12s ease, color .16s ease;
        display:flex;
        gap:8px;
        align-items:center;
        white-space:nowrap;
      }
      .nxSegBtn svg{
        width:16px;height:16px;
        stroke: currentColor;
        fill:none;
        stroke-width:2.2;
        stroke-linecap:round;
        stroke-linejoin:round;
        opacity:.9;
      }
      .nxSegBtn:hover{
        background: rgba(255,255,255,.08);
        transform: translateY(-1px);
        color: rgba(255,255,255,.92);
      }
      .nxSegBtn:active{
        transform: translateY(0) scale(.98);
      }
      .nxSegBtn.active{
        background: rgba(124,92,255,.26);
        border: 1px solid rgba(124,92,255,.22);
        color:#fff;
      }
      .nxSegBtn:disabled{
        opacity:.65;
        cursor:default;
        transform:none;
      }

      .nxLaunchSub strong{ color: rgba(255,255,255,.86); }
    `;
    document.head.appendChild(s);
  }

  // ✅ New layout styles (just organization)
  function ensureLayoutStyles() {
    if (document.getElementById(LAYOUT_STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = LAYOUT_STYLE_ID;
    s.textContent = `
      .nxSettingsGrid{
        margin-top: 18px;
        display: grid;
        grid-template-columns: minmax(560px, 1fr) minmax(320px, 420px);
        gap: 18px;
        align-items: start;
      }
      .nxSettingsLeft{
        display: flex;
        flex-direction: column;
        gap: 18px;
        min-width: 0;
      }
      .nxSettingsRight{
        display: flex;
        flex-direction: column;
        gap: 18px;
        min-width: 0;
      }

      /* Use your existing panel style, just ensure full width */
      .nxSettingsLeft .panel,
      .nxSettingsRight .panel{
        width: 100%;
        max-width: none !important;
        margin-top: 0 !important;
      }

      .nxMiniStat{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        padding: 12px 12px;
        border-radius: 16px;
        background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.07);
      }
      .nxMiniKey{
        color: rgba(255,255,255,.72);
        font-weight: 900;
        font-size: 13px;
        letter-spacing: .1px;
      }
      .nxMiniVal{
        color: rgba(255,255,255,.95);
        font-weight: 1000;
        font-size: 13px;
        text-align:right;
        max-width: 65%;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .nxTinyNote{
        margin-top: 10px;
        color: rgba(255,255,255,.58);
        font-weight: 650;
        font-size: 12.5px;
        line-height: 1.35;
      }

      @media (max-width: 980px){
        .nxSettingsGrid{ grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(s);
  }

  function confirmMigrate(oldRoot, newRoot) {
    ensureModalStyles();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "nxModalOverlay";

      overlay.innerHTML = `
        <div class="nxModalCard" role="dialog" aria-modal="true">
          <div class="nxModalTop">
            <div class="nxModalIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M21 12a9 9 0 0 1-15.3 6.36"></path>
                <path d="M3 12a9 9 0 0 1 15.3-6.36"></path>
                <path d="M3 18v-5h5"></path>
                <path d="M21 6v5h-5"></path>
              </svg>
            </div>
            <div style="flex:1;">
              <div class="nxModalTitle">Migrate installed games?</div>
              <div class="nxModalMsg">
                You changed your install folder. Do you want to move all currently installed games into the new folder?
              </div>
              <div class="nxModalPaths">
                <div><strong>From:</strong> ${oldRoot || "Unknown"}</div>
                <div style="margin-top:6px;"><strong>To:</strong> ${newRoot || "Unknown"}</div>
              </div>
            </div>
          </div>

          <div class="nxModalDivider"></div>

          <div class="nxModalActions">
            <button class="nxBtn" data-act="no" type="button">Don't move</button>
            <button class="nxBtn nxBtnPrimary" data-act="yes" type="button">Move games</button>
          </div>
        </div>
      `;

      const card = overlay.querySelector(".nxModalCard");
      const noBtn = overlay.querySelector('[data-act="no"]');
      const yesBtn = overlay.querySelector('[data-act="yes"]');

      function close(val) {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        resolve(val);
      }

      function onKey(e) {
        if (e.key === "Escape") close(false);
      }

      overlay.addEventListener("click", (e) => {
        if (!card.contains(e.target)) close(false);
      });

      noBtn.addEventListener("click", () => close(false));
      yesBtn.addEventListener("click", () => close(true));

      document.addEventListener("keydown", onKey);
      document.body.appendChild(overlay);
      yesBtn.focus();
    });
  }

  function confirmLauncherUpdate(toVersion) {
    ensureModalStyles();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "nxModalOverlay";

      overlay.innerHTML = `
        <div class="nxModalCard" role="dialog" aria-modal="true">
          <div class="nxModalTop">
            <div class="nxModalIcon" aria-hidden="true" style="background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.10);">
              <svg viewBox="0 0 24 24">
                <path d="M12 6v6"></path>
                <path d="M12 16h.01"></path>
                <path d="M4 4h16v16H4z"></path>
              </svg>
            </div>
            <div style="flex:1;">
              <div class="nxModalTitle">Update launcher to v${toVersion}?</div>
              <div class="nxModalMsg">
                The launcher will close and open the installer. Finish the install to update the launcher.
              </div>
            </div>
          </div>

          <div class="nxModalDivider"></div>

          <div class="nxModalActions">
            <button class="nxBtn" data-act="cancel" type="button">Cancel</button>
            <button class="nxBtn nxBtnPrimary" data-act="ok" type="button">Update</button>
          </div>
        </div>
      `;

      const card = overlay.querySelector(".nxModalCard");
      const cancelBtn = overlay.querySelector('[data-act="cancel"]');
      const okBtn = overlay.querySelector('[data-act="ok"]');

      function close(val) {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        resolve(val);
      }

      function onKey(e) {
        if (e.key === "Escape") close(false);
      }

      overlay.addEventListener("click", (e) => {
        if (!card.contains(e.target)) close(false);
      });

      cancelBtn.addEventListener("click", () => close(false));
      okBtn.addEventListener("click", () => close(true));

      document.addEventListener("keydown", onKey);
      document.body.appendChild(overlay);
      okBtn.focus();
    });
  }

  function normalizeLaunchMode(v) {
    const m = String(v || "windowed").toLowerCase();
    if (m === "fullscreen") return "maximized";
    return m === "maximized" ? "maximized" : "windowed";
  }

  function normalizeStartPage(v) {
    const p = String(v || "store").toLowerCase();
    return p === "library" ? "library" : "store";
  }

  function normalizeGridColumns(v) {
    const n = Number(v);
    if (n === 4) return 4;
    if (n === 5) return 5;
    return 3;
  }

  function applyGridColumns(cols) {
    const c = normalizeGridColumns(cols);

    const map = {
      3: { min: 260, max: 360 },
      4: { min: 230, max: 320 },
      5: { min: 200, max: 280 }
    };
    const m = map[c] || map[3];

    document.documentElement.style.setProperty("--nxGridCols", String(c));
    document.documentElement.style.setProperty("--nxTileMin", `${m.min}px`);
    document.documentElement.style.setProperty("--nxTileMax", `${m.max}px`);
  }

  
  function wireWebsiteButton(btn) {
    if (!btn) return;
    if (btn.dataset.nxBound === "1") return;
    btn.dataset.nxBound = "1";

    btn.addEventListener("click", async () => {
      // Prefer IPC-backed safe open if available
      try {
        if (window.api?.openExternal) {
          const res = await window.api.openExternal(WEBSITE_URL);
          if (res?.ok) return;
        }
      } catch {}

      // Fallback: may be blocked by Electron depending on your config
      try { window.open(WEBSITE_URL, "_blank"); } catch {}
    });
  }

// --- UI injections (unchanged) ---

  function injectLaunchModeUI(currentMode, onChange) {
    ensureLaunchModeStyles();

    const input = document.getElementById("installRoot");
    if (!input) return;

    const panel = input.closest(".panel");
    if (!panel) return;

    if (panel.querySelector("[data-nx-launchmode]")) return;

    const row = document.createElement("div");
    row.className = "nxLaunchRow";
    row.setAttribute("data-nx-launchmode", "1");

    row.innerHTML = `
      <div class="nxLaunchLeft">
        <div class="nxLaunchTitle">Launch mode</div>
        <div class="nxLaunchSub">Choose how the launcher opens: normal window or maximized</div>
      </div>

      <div class="nxSeg" role="tablist" aria-label="Launch mode">
        <button class="nxSegBtn" data-mode="windowed" type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true">  <rect x="7" y="7" width="13" height="13" rx="2"></rect>  <rect x="4" y="4" width="13" height="13" rx="2"></rect>  <path d="M4 8h13"></path></svg>
          Windowed
        </button>
        <button class="nxSegBtn" data-mode="maximized" type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true">  <rect x="4" y="5" width="16" height="15" rx="2"></rect>  <path d="M4 9h16"></path>  <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"></circle>  <circle cx="10" cy="7" r="1" fill="currentColor" stroke="none"></circle></svg>
          Maximized
        </button>
      </div>
    `;

    panel.appendChild(row);

    const btns = Array.from(row.querySelectorAll(".nxSegBtn"));
    const setActive = (mode) => {
      const m = normalizeLaunchMode(mode);
      for (const b of btns) b.classList.toggle("active", b.dataset.mode === m);
    };

    setActive(currentMode);

    for (const b of btns) {
      b.addEventListener("click", async () => {
        const m = String(b.dataset.mode || "windowed");
        btns.forEach((x) => (x.disabled = true));
        try {
          await onChange(m);
          setActive(m);
        } finally {
          btns.forEach((x) => (x.disabled = false));
        }
      });
    }
  }

  function injectStartPageUI(currentPage, onChange) {
    ensureLaunchModeStyles();

    const input = document.getElementById("installRoot");
    if (!input) return;

    const panel = input.closest(".panel");
    if (!panel) return;

    if (panel.querySelector("[data-nx-startpage]")) return;

    const row = document.createElement("div");
    row.className = "nxLaunchRow";
    row.setAttribute("data-nx-startpage", "1");

    row.innerHTML = `
      <div class="nxLaunchLeft">
        <div class="nxLaunchTitle">Start page</div>
        <div class="nxLaunchSub">Choose what page opens when the launcher starts</div>
      </div>

      <div class="nxSeg" role="tablist" aria-label="Start page">
        <button class="nxSegBtn" data-page="store" type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true">  <path d="M4 4h16l1 5H3l1-5Z"></path>  <path d="M5 9v11h14V9"></path>  <path d="M10 20v-7h4v7"></path></svg>
          Store
        </button>
        <button class="nxSegBtn" data-page="library" type="button">
          <svg viewBox="0 0 24 24" aria-hidden="true">  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"></path>  <path d="M3 10h18"></path></svg>
          Library
        </button>
      </div>
    `;

    panel.appendChild(row);

    const btns = Array.from(row.querySelectorAll(".nxSegBtn"));

    const setActive = (page) => {
      const p = normalizeStartPage(page);
      for (const b of btns) b.classList.toggle("active", b.dataset.page === p);
    };

    setActive(currentPage);

    for (const b of btns) {
      b.addEventListener("click", async () => {
        const p = normalizeStartPage(b.dataset.page);
        btns.forEach((x) => (x.disabled = true));
        try {
          await onChange(p);
          setActive(p);
        } finally {
          btns.forEach((x) => (x.disabled = false));
        }
      });
    }
  }

  function injectGridColumnsUI(currentCols, onChange) {
    ensureLaunchModeStyles();

    const input = document.getElementById("installRoot");
    if (!input) return;

    const panel = input.closest(".panel");
    if (!panel) return;

    if (panel.querySelector("[data-nx-gridcols]")) return;

    const row = document.createElement("div");
    row.className = "nxLaunchRow";
    row.setAttribute("data-nx-gridcols", "1");

    row.innerHTML = `
      <div class="nxLaunchLeft">
        <div class="nxLaunchTitle">Grid columns</div>
        <div class="nxLaunchSub">Choose how many games show per row in Store and Library</div>
      </div>

      <div class="nxSeg" role="tablist" aria-label="Grid columns">
        <button class="nxSegBtn" data-cols="3" type="button">3</button>
        <button class="nxSegBtn" data-cols="4" type="button">4</button>
        <button class="nxSegBtn" data-cols="5" type="button">5</button>
      </div>
    `;

    panel.appendChild(row);

    const btns = Array.from(row.querySelectorAll(".nxSegBtn"));
    const setActive = (cols) => {
      const c = normalizeGridColumns(cols);
      for (const b of btns) b.classList.toggle("active", Number(b.dataset.cols) === c);
    };

    setActive(currentCols);

    for (const b of btns) {
      b.addEventListener("click", async () => {
        const c = normalizeGridColumns(b.dataset.cols);
        btns.forEach((x) => (x.disabled = true));
        try {
          await onChange(c);
          setActive(c);
          applyGridColumns(c);
        } finally {
          btns.forEach((x) => (x.disabled = false));
        }
      });
    }
  }

  function injectLauncherUpdateUI(opts) {
    ensureLaunchModeStyles();

    const input = document.getElementById("installRoot");
    if (!input) return;

    const panel = input.closest(".panel");
    if (!panel) return;

    // ✅ IMPORTANT: this row is moved into the separate "Updates" panel.
    // If we only check inside the original settings panel, re-renders (like
    // hitting Refresh) can accidentally inject duplicates.
    const all = Array.from(document.querySelectorAll('[data-nx-launcherupd="1"]'));
    if (all.length) {
      // If duplicates already exist (from a previous bug), keep the first and remove the rest.
      for (let i = 1; i < all.length; i++) {
        try { all[i].remove(); } catch {}
      }

      const existing = all[0];
      const sub = existing.querySelector("#nxLauncherUpdSub");
      const checkBtn = existing.querySelector("#nxLauncherCheckBtn");
      const installBtn = existing.querySelector("#nxLauncherInstallBtn");

      // Keep the displayed version fresh on refresh.
      if (sub && opts?.current) {
        sub.innerHTML = `Current version: <strong>${opts.current}</strong>`;
      }

      return { sub, checkBtn, installBtn };
    }

    const row = document.createElement("div");
    row.className = "nxLaunchRow";
    row.setAttribute("data-nx-launcherupd", "1");

    row.innerHTML = `
      <div class="nxLaunchLeft">
        <div class="nxLaunchTitle">Launcher updates</div>
        <div class="nxLaunchSub" id="nxLauncherUpdSub">
          Current version: <strong>${opts?.current || "—"}</strong>
        </div>
      </div>

      <div class="nxSeg" role="group" aria-label="Launcher updates">
        <button class="nxSegBtn" id="nxLauncherCheckBtn" type="button">
          Check
        </button>
        <button class="nxSegBtn active" id="nxLauncherInstallBtn" type="button" disabled>
          Download & Install
        </button>
      </div>
    `;

    panel.appendChild(row);

    return {
      sub: row.querySelector("#nxLauncherUpdSub"),
      checkBtn: row.querySelector("#nxLauncherCheckBtn"),
      installBtn: row.querySelector("#nxLauncherInstallBtn")
    };
  }

  function prettySpeed(bytesPerSec) {
    const b = Number(bytesPerSec || 0);
    if (!b) return "";
    const kb = b / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB/s`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB/s`;
  }

  // ✅ Mount layout + split Updates out of the main panel (no logic changes)
  function mountLayoutAndSplitUpdates() {
    ensureLayoutStyles();

    const page = document.getElementById("page");
    if (!page) return null;

    // already mounted
    if (page.querySelector(".nxSettingsGrid")) {
      return {
        updatesHost: page.querySelector("#nxUpdatesHost"),
        installedVal: page.querySelector("#nxInstalledGamesVal"),
        websiteBtn: page.querySelector("#nxWebsiteBtn")
      };
    }

    const input = document.getElementById("installRoot");
    if (!input) return null;

    const mainPanel = input.closest(".panel");
    if (!mainPanel) return null;

    // Create layout wrappers
    const grid = document.createElement("div");
    grid.className = "nxSettingsGrid";

    const left = document.createElement("div");
    left.className = "nxSettingsLeft";

    const right = document.createElement("div");
    right.className = "nxSettingsRight";

    // Updates panel (we will move the launcher update row into here)
    const updatesPanel = document.createElement("div");
    updatesPanel.className = "panel";
    updatesPanel.innerHTML = `
      <div class="panelTitle">Updates</div>
      <div id="nxUpdatesHost"></div>
      <div class="nxTinyNote">Download progress will appear here while updating the launcher</div>
    `;

    // Library panel (only thing you asked to add)
    const libraryPanel = document.createElement("div");
    libraryPanel.className = "panel";
    libraryPanel.innerHTML = `
      <div class="panelTitle">Library</div>
      <div class="nxMiniStat">
        <div class="nxMiniKey">Installed games</div>
        <div class="nxMiniVal" id="nxInstalledGamesVal">—</div>
      </div>
    `;

    // Website panel (link out)
    const websitePanel = document.createElement("div");
    websitePanel.className = "panel";
    websitePanel.innerHTML = `
      <div class="panelTitle">Website</div>
      <div class="nxTinyNote" style="margin-top:0">Open the Nexus Launcher website</div>
      <div style="margin-top:12px; display:flex; justify-content:flex-start;">
        <div class="nxSeg" role="group" aria-label="Website">
          <button class="nxSegBtn active" id="nxWebsiteBtn" type="button">Visit website</button>
        </div>
      </div>
    `;

    // Insert grid where the main panel was
    const parent = mainPanel.parentElement;
    parent.insertBefore(grid, mainPanel);

    left.appendChild(mainPanel);
    left.appendChild(updatesPanel);

    right.appendChild(libraryPanel);
    right.appendChild(websitePanel);

    grid.appendChild(left);
    grid.appendChild(right);

    return {
      updatesHost: updatesPanel.querySelector("#nxUpdatesHost"),
      installedVal: libraryPanel.querySelector("#nxInstalledGamesVal"),
      websiteBtn: websitePanel.querySelector("#nxWebsiteBtn")
    };
  }

  async function refreshInstalledCount(installedValEl) {
    if (!installedValEl) return;
    try {
      const installed = await window.api.getInstalled?.();
      const count = installed ? Object.keys(installed).length : 0;
      installedValEl.textContent = String(count);
    } catch {
      installedValEl.textContent = "—";
    }
  }

  window.renderSettings = async function () {
    const input = document.getElementById("installRoot");
    const btn = document.getElementById("changeInstallRoot");
    if (!input || !btn) return;

    // Build layout first (doesn't change existing controls)
    const layout = mountLayoutAndSplitUpdates();

    let launchMode = "windowed";
    let startPage = "store";
    let gridColumns = 3;

    // launcher update state
    let launcherCurrent = "—";
    let launcherLatest = null;
    let launcherHasUpdate = false;
    let launcherChecked = false;

// ✅ If app.js already checked for launcher updates on startup, reuse that state here.
try {
  const st = window.__nxLauncherUpdate;
  if (st && typeof st === "object") {
    if (st.current) launcherCurrent = String(st.current);
    if (st.latest) launcherLatest = String(st.latest);
    if (typeof st.hasUpdate === "boolean") launcherHasUpdate = !!st.hasUpdate;
    if (typeof st.checked === "boolean") launcherChecked = !!st.checked;
  }
} catch {}

    // load current settings
    try {
      const s = await window.api.getSettings();
      input.value = s?.installRoot || "";
      launchMode = normalizeLaunchMode(s?.launchMode);
      startPage = normalizeStartPage(s?.startPage);
      gridColumns = normalizeGridColumns(s?.gridColumns);
      applyGridColumns(gridColumns);
    } catch (e) {
      console.error(e);
      input.value = "";
      applyGridColumns(3);
    }

    // update installed games count (the only extra info)
    await refreshInstalledCount(layout?.installedVal);

    // Wire Website button (right-side island)
    try { wireWebsiteButton(layout?.websiteBtn || document.getElementById("nxWebsiteBtn")); } catch {}

    // get current launcher version
    try {
      const v = await window.api.getLauncherVersion?.();
      if (v?.ok && v?.version) launcherCurrent = String(v.version);
    } catch {}

    injectLaunchModeUI(launchMode, async (mode) => {
      if (!window.api?.setLaunchMode) return;
      try {
        const next = await window.api.setLaunchMode(mode);
        launchMode = normalizeLaunchMode(next?.launchMode);
      } catch (e) {
        console.error(e);
      }
    });

    injectStartPageUI(startPage, async (page) => {
      if (!window.api?.setStartPage) return;
      try {
        const next = await window.api.setStartPage(page);
        startPage = normalizeStartPage(next?.startPage);
      } catch (e) {
        console.error(e);
      }
    });

    injectGridColumnsUI(gridColumns, async (cols) => {
      if (!window.api?.setGridColumns) return;
      try {
        const next = await window.api.setGridColumns(cols);
        gridColumns = normalizeGridColumns(next?.gridColumns);
      } catch (e) {
        console.error(e);
      }
    });

    const updUI = injectLauncherUpdateUI({ current: launcherCurrent });

// ✅ Keep a shared copy of the latest launcher update check
try {
  window.__nxLauncherUpdate = {
    checked: !!launcherChecked,
    current: launcherCurrent,
    latest: launcherLatest,
    hasUpdate: !!launcherHasUpdate,
    checkedAt: Date.now()
  };
  if (typeof window.__nxSetSettingsUpdateBadge === "function") {
    window.__nxSetSettingsUpdateBadge(!!launcherHasUpdate);
  }
} catch {}

function applyLauncherDownloadState(d, els) {
  if (!d || String(d.gameId) !== "__launcher__") return;
  const sub = els?.sub || document.getElementById("nxLauncherUpdSub");
  const installBtn = els?.installBtn || document.getElementById("nxLauncherInstallBtn");
  const checkBtn = els?.checkBtn || document.getElementById("nxLauncherCheckBtn");
  if (!sub || !installBtn || !checkBtn) return;

  const pct = Math.max(0, Math.min(100, Number(d.percent || 0)));
  const sp = prettySpeed(d.speed);
  const status = String(d.status || "");
  const hasUpd = !!(window.__nxLauncherUpdate?.hasUpdate);

  if (status === "downloading" || status === "queued" || status === "paused") {
    sub.textContent = `Downloading launcher update… ${pct.toFixed(0)}%${sp ? ` • ${sp}` : ""}`;
    checkBtn.disabled = true;
    installBtn.disabled = true;
    installBtn.textContent = "Downloading…";
    installBtn.dataset.phase = "download";
    return;
  }

  if (status === "completed") {
    sub.textContent = `Downloaded. Click “Install now” to run the installer.`;
    checkBtn.disabled = false;
    installBtn.disabled = false;
    installBtn.textContent = "Install now";
    installBtn.dataset.phase = "install-ready";
    return;
  }

  if (status === "error") {
    sub.textContent = `Download failed. Try again.`;
    checkBtn.disabled = false;
    installBtn.disabled = !hasUpd;
    installBtn.textContent = "Download & Install";
    installBtn.dataset.phase = "download";
    return;
  }

  if (status === "canceled") {
    sub.textContent = `Download canceled.`;
    checkBtn.disabled = false;
    installBtn.disabled = !hasUpd;
    installBtn.textContent = "Download & Install";
    installBtn.dataset.phase = "download";
    return;
  }
}

async function restoreLauncherUpdateProgress() {
  try {
    const d0 = window.__nxLauncherDownloadState;
    if (d0 && String(d0.gameId) === "__launcher__") {
      applyLauncherDownloadState(d0);
      return;
    }

    if (typeof window.api?.getDownloads !== "function") return;
    const list = await window.api.getDownloads();
    const items = Array.isArray(list) ? list : (list?.downloads || []);
    const d = items.find((x) => String(x?.gameId || "") === "__launcher__");
    if (d) {
      // also keep global state for later
      try { window.__nxLauncherDownloadState = d; } catch {}
      applyLauncherDownloadState(d);
    }
  } catch {}
}

// Run once each time Settings renders (fixes: download "cancels" visually when you switch tabs)
restoreLauncherUpdateProgress();

    // ✅ Move the launcher update row into the Updates panel (keeps all listeners working)
    try {
      const panel = input.closest(".panel");
      const updRow = panel?.querySelector?.('[data-nx-launcherupd="1"]');
      const host = layout?.updatesHost;

      if (updRow && host && !host.contains(updRow)) {
        host.appendChild(updRow);
      }
    } catch {}

    // Attach listeners once
    if (!window.__nxLauncherUpdListenerAttached) {
      window.__nxLauncherUpdListenerAttached = true;

      window.api?.onDownloadUpdated?.((d) => {
        if (!d || String(d.gameId) !== "__launcher__") return;

        // keep the latest state globally so the UI can restore after tab switches
        try { window.__nxLauncherDownloadState = d; } catch {}

        const sub = document.getElementById("nxLauncherUpdSub");
        const installBtn = document.getElementById("nxLauncherInstallBtn");
        const checkBtn = document.getElementById("nxLauncherCheckBtn");
        if (!sub || !installBtn || !checkBtn) return;

        const pct = Math.max(0, Math.min(100, Number(d.percent || 0)));
        const sp = prettySpeed(d.speed);
        const status = String(d.status || "");
        const hasUpd = !!(window.__nxLauncherUpdate?.hasUpdate);

        if (status === "downloading") {
          sub.textContent = `Downloading launcher update… ${pct.toFixed(0)}%${sp ? ` • ${sp}` : ""}`;
          checkBtn.disabled = true;
          installBtn.disabled = true;
          installBtn.textContent = "Downloading…";
        }

        if (status === "completed") {
          sub.textContent = `Downloaded. Click “Install now” to run the installer.`;
          checkBtn.disabled = false;
          installBtn.disabled = false;
          installBtn.textContent = "Install now";
          installBtn.dataset.phase = "install-ready";
        }

        if (status === "error") {
          sub.textContent = `Download failed. Try again.`;
          checkBtn.disabled = false;
          installBtn.disabled = !hasUpd;
          installBtn.textContent = "Download & Install";
          installBtn.dataset.phase = "download";
        }

        if (status === "canceled") {
          sub.textContent = `Download canceled.`;
          checkBtn.disabled = false;
          installBtn.disabled = !hasUpd;
          installBtn.textContent = "Download & Install";
          installBtn.dataset.phase = "download";
        }
      });

      window.api?.onLauncherUpdateReady?.(() => {
        const sub = document.getElementById("nxLauncherUpdSub");
        const installBtn = document.getElementById("nxLauncherInstallBtn");
        const checkBtn = document.getElementById("nxLauncherCheckBtn");
        if (!sub || !installBtn || !checkBtn) return;

        sub.textContent = `Downloaded. Click “Install now” to run the installer.`;
        checkBtn.disabled = false;
        installBtn.disabled = false;
        installBtn.textContent = "Install now";
        installBtn.dataset.phase = "install-ready";
      });
    }

    if (updUI?.checkBtn && updUI?.installBtn && updUI?.sub) {
      const { checkBtn, installBtn, sub } = updUI;

      function setIdle() {
        checkBtn.disabled = false;
        installBtn.disabled = !launcherHasUpdate;
        installBtn.textContent = "Download & Install";
        installBtn.dataset.phase = "download";
      }

      checkBtn.onclick = async () => {
        if (!window.api?.checkLauncherUpdate) return;

        checkBtn.disabled = true;
        installBtn.disabled = true;
        installBtn.textContent = "Download & Install";
        installBtn.dataset.phase = "download";
        sub.textContent = "Checking for launcher updates…";

        try {
          const res = await window.api.checkLauncherUpdate();
          launcherChecked = true;

          if (!res?.ok) {
            sub.textContent = `Launcher updates: ${res?.error || "Failed to check."}`;
            launcherHasUpdate = false;
            launcherLatest = null;
            setIdle();
            return;
          }

          launcherCurrent = String(res.current || launcherCurrent);
          launcherLatest = String(res.latest || "");
          launcherHasUpdate = !!res.hasUpdate;

try {
  window.__nxLauncherUpdate = {
    checked: true,
    current: launcherCurrent,
    latest: launcherLatest,
    hasUpdate: !!launcherHasUpdate,
    checkedAt: Date.now()
  };
  if (typeof window.__nxSetSettingsUpdateBadge === "function") {
    window.__nxSetSettingsUpdateBadge(!!launcherHasUpdate);
  }
} catch {}

          if (!launcherHasUpdate) {
            sub.innerHTML = `Up to date. Current version: <strong>${launcherCurrent}</strong>`;
            installBtn.disabled = true;
            checkBtn.disabled = false;
            return;
          }

          sub.innerHTML = `Update available: <strong>${launcherCurrent}</strong> → <strong>${launcherLatest}</strong>`;
          installBtn.disabled = false;
          installBtn.textContent = "Download & Install";
          installBtn.dataset.phase = "download";
          checkBtn.disabled = false;
        } catch (e) {
          console.error(e);
          sub.textContent = "Launcher updates: check failed.";
          launcherHasUpdate = false;
          launcherLatest = null;
          setIdle();
        }
      };

      installBtn.onclick = async () => {
        if (!launcherChecked || !launcherHasUpdate) return;

        const phase = String(installBtn.dataset.phase || "download");

        // Phase 1: download
        if (phase === "download") {
          const ok = await confirmLauncherUpdate(launcherLatest || "?");
          if (!ok) return;

          if (!window.api?.downloadLauncherUpdate) return;

          checkBtn.disabled = true;
          installBtn.disabled = true;
          installBtn.textContent = "Downloading…";
          sub.textContent = "Starting download…";

          try {
            const res = await window.api.downloadLauncherUpdate();
            if (!res?.ok) {
              sub.textContent = `Download failed: ${res?.error || "Unknown error"}`;
              checkBtn.disabled = false;
              installBtn.disabled = false;
              installBtn.textContent = "Download & Install";
              installBtn.dataset.phase = "download";
              return;
            }

            sub.textContent = "Downloading launcher update…";
            try { window.__nxLauncherDownloadState = { ...(window.__nxLauncherDownloadState||{}), gameId: "__launcher__", status: "downloading", percent: 0, speed: 0 }; } catch {}
          } catch (e) {
            console.error(e);
            sub.textContent = "Download failed.";
            checkBtn.disabled = false;
            installBtn.disabled = false;
            installBtn.textContent = "Download & Install";
            installBtn.dataset.phase = "download";
          }
          return;
        }

        // Phase 2: install (already downloaded)
        if (phase === "install-ready") {
          const ok = await confirmLauncherUpdate(launcherLatest || "?");
          if (!ok) return;

          if (!window.api?.installLauncherUpdate) return;

          installBtn.disabled = true;
          checkBtn.disabled = true;
          installBtn.textContent = "Starting installer…";
          sub.textContent = "Opening installer…";

          try {
            await window.api.installLauncherUpdate();
          } catch (e) {
            console.error(e);
            sub.textContent = "Failed to start installer.";
            checkBtn.disabled = false;
            installBtn.disabled = false;
            installBtn.textContent = "Install now";
            installBtn.dataset.phase = "install-ready";
          }
        }
      };

      setIdle();
    }

    btn.onclick = async () => {
      if (!window.api?.pickInstallRoot || !window.api?.setInstallRoot) return;

      const before = String(input.value || "");
      const chosen = await window.api.pickInstallRoot();
      if (!chosen) return;

      const after = String(chosen);

      if (before && after && before === after) {
        const s = await window.api.setInstallRoot(after);
        input.value = s?.installRoot || after;
        return;
      }

      let installed = {};
      try { installed = await window.api.getInstalled(); } catch {}
      const installedCount = installed ? Object.keys(installed).length : 0;

      const s = await window.api.setInstallRoot(after);
      input.value = s?.installRoot || after;

      // update the count after changing root
      await refreshInstalledCount(layout?.installedVal);

    // Wire Website button (right-side island)
    try { wireWebsiteButton(layout?.websiteBtn || document.getElementById("nxWebsiteBtn")); } catch {}

      if (installedCount === 0) return;

      const doMove = await confirmMigrate(before, after);
      if (!doMove) return;

      if (!window.api?.migrateGames) return;

      try {
        const res = await window.api.migrateGames({ fromRoot: before, toRoot: after });
        console.log("Migration result:", res);
      } catch (e) {
        console.error(e);
      }

      // refresh after migration
      await refreshInstalledCount(layout?.installedVal);

    // Wire Website button (right-side island)
    try { wireWebsiteButton(layout?.websiteBtn || document.getElementById("nxWebsiteBtn")); } catch {}
    };
  };
})();
