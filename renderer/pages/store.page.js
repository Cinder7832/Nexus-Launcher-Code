// renderer/pages/store.page.js
(function () {
  const phaseByGameId = new Map();
  let eventsBound = false;

  // In-place Store UI updates (avoid full re-render during download ticks)
  let installedCache = null;
  let gamesById = new Map();
  let btnByGameId = new Map();

  function updateStoreButtonUI(gameId) {
    if (window.__currentPage !== "store") return;
    const gid = String(gameId || "");
    if (!gid) return;
    const btn = btnByGameId.get(gid);
    const game = gamesById.get(gid);
    if (!btn || !game) return;

    const isInstalled = !!installedCache?.[gid];
    const upd = window.__updatesByGameId?.get(gid) || null;

    let text = "Install";
    let disabled = false;

    if (isInstalled && upd) {
      text = "Update";
      disabled = false;
    } else if (isInstalled) {
      text = "Installed";
      disabled = true;
    } else {
      const phase = getPhase(gid);
      if (phase === "downloading") { text = "Downloading..."; disabled = true; }
      else if (phase === "installing") { text = "Installing..."; disabled = true; }
    }

    if (btn.textContent !== text) btn.textContent = text;
    if (btn.disabled !== disabled) btn.disabled = disabled;
  }

  function setPhase(gameId, phase) {
    if (!gameId) return;
    if (!phase) phaseByGameId.delete(String(gameId));
    else phaseByGameId.set(String(gameId), phase);
  }

  function getPhase(gameId) {
    return phaseByGameId.get(String(gameId)) || null;
  }

  function isUrl(v) {
    return /^https?:\/\//i.test(String(v || ""));
  }

  function normalizeGithubUrl(url) {
    const u = String(url || "");
    if (u.includes("github.com/") && u.includes("/blob/")) {
      return u
        .replace("https://github.com/", "https://raw.githubusercontent.com/")
        .replace("/blob/", "/");
    }
    return u;
  }

  function toImg(v) {
    if (!v) return "";
    const s = normalizeGithubUrl(v);
    return isUrl(s) ? s : `assets/${s}`;
  }

  // --------------------------
  // ✅ Premium search bar (Store + Library)
  // --------------------------
  const NX_SEARCH_STYLE_ID = "nxSearchBarV3Style";
  function ensureSearchBarStyles() {
    if (document.getElementById(NX_SEARCH_STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = NX_SEARCH_STYLE_ID;
    s.textContent = `
      /* ✅ Premium search bar (Store + Library) — unified */
      .searchWrap{
        box-sizing: border-box;
        width: min(560px, 44vw);
        height: 54px;

        display:flex;
        align-items:center;
        gap: 12px;
        padding: 0 18px;
        border-radius: 22px;

        background: linear-gradient(
          180deg,
          rgba(255,255,255,.055),
          rgba(255,255,255,.035)
        );
        border: 1px solid rgba(255,255,255,.09);
        box-shadow:
          0 18px 60px rgba(0,0,0,.22),
          inset 0 1px 0 rgba(255,255,255,.06);

        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
      }
      .searchWrap:focus-within{
        border-color: rgba(124,92,255,.42);
        box-shadow:
          0 22px 70px rgba(124,92,255,.14),
          inset 0 1px 0 rgba(255,255,255,.07);
      }

      .searchIcon{
        display:flex;
        align-items:center;
        justify-content:center;
        width: 20px;
        height: 20px;
        opacity: .55;
        flex: 0 0 auto;
      }

      .searchIcon svg{
        width: 18px;
        height: 18px;
        stroke: rgba(255,255,255,.62);
        fill: none;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .search{
        flex: 1;
        width: 100%;
        height: 100%;
        border: none;
        outline: none;
        background: transparent;

        color: rgba(255,255,255,.92);
        font-size: 15px;
        font-weight: 750;
        letter-spacing: .1px;
      }
      .search::placeholder{
        color: rgba(255,255,255,.34);
        font-weight: 700;
      }

      @media (max-width: 900px){
        .searchWrap{ width: 100%; }
      }
    `;
    document.head.appendChild(s);
  }

  // --------------------------
  // ✅ Store-only width fix:
  // Make Store search NOT shrink (so it matches Library’s width exactly)
  // --------------------------
  const NX_STORE_SEARCH_FIX_ID = "nxStoreSearchWidthFix";
  function ensureStoreSearchWidthFix() {
    if (document.getElementById(NX_STORE_SEARCH_FIX_ID)) return;

    const s = document.createElement("style");
    s.id = NX_STORE_SEARCH_FIX_ID;
    s.textContent = `
      /* Only applies on Store page because of .nxStorePage wrapper */
      .nxStorePage .storeTop{
        gap: 22px;
      }

      /* Let left column use remaining space */
      .nxStorePage .storeTop > div:first-child{
        flex: 1 1 auto;
        min-width: 0;
      }

      /* Force the search bar to keep its full designed width (match Library) */
      .nxStorePage .storeTop .searchWrap{
        flex: 0 0 min(560px, 44vw);
        width: min(560px, 44vw);
        flex-shrink: 0;
        margin-left: auto;
      }
    `;
    document.head.appendChild(s);
  }

  // ✅ Responsive grid columns (Store)
// Users pick 3/4/5 in Settings. We *try hard* to respect that across Windows DPI scaling.
// Instead of immediately dropping a column, we allow tiles to get a bit tighter first.
//
// Key idea:
// - "preferred" min widths preserve your intended look (125% / 4 columns).
// - "hard" min widths are the smallest we will allow before we drop a column.
//   (This prevents button text like "Pl" and other cramped UI.)
const NX_TILE_PREF = {
  1: { min: 260, max: 520 },
  2: { min: 260, max: 460 },
  3: { min: 260, max: 400 },
  4: { min: 230, max: 360 },
  5: { min: 200, max: 320 }
};

// Absolute minimum per tile (in CSS px) before we clamp down a column.
const NX_TILE_HARD_MIN = {
  1: 240,
  2: 240,
  3: 230,
  4: 190,
  5: 170
};

let nxUserCols = 3;
let nxGridRO = null;
let nxGridResizeHandler = null;
let nxVVResizeHandler = null;
let nxLastGridKey = "";

function setGridVars(cols, minPx, maxPx) {
  const c = Math.max(1, Math.min(5, Number(cols) || 3));
  const pref = NX_TILE_PREF[c] || NX_TILE_PREF[3];

  const min = Math.max(140, Math.floor(Number(minPx || pref.min)));
  const max = Math.max(min, Math.floor(Number(maxPx || pref.max)));

  const key = `${c}|${min}|${max}`;
  if (nxLastGridKey === key) return;
  nxLastGridKey = key;

  document.documentElement.style.setProperty("--nxGridCols", String(c));
  document.documentElement.style.setProperty("--nxTileMin", `${min}px`);
  document.documentElement.style.setProperty("--nxTileMax", `${max}px`);
}

function getGridWidth(gridEl) {
  const rectW = Math.round(gridEl.getBoundingClientRect?.().width || 0);
  return Math.max(gridEl.clientWidth || 0, rectW || 0);
}

function computeGridPlan(gridEl, desiredCols) {
  const desired = Math.max(1, Math.min(5, Number(desiredCols) || 3));
  const desiredPref = NX_TILE_PREF[desired] || NX_TILE_PREF[3];

  if (!gridEl) {
    return { cols: desired, min: desiredPref.min, max: desiredPref.max };
  }

  // NOTE: At some DPI/paint timings the grid can report width=0 for a frame.
  // Treat that as "not laid out yet" and do not clamp based on it.
  const w = getGridWidth(gridEl);
  if (w <= 0) {
    return { cols: desired, min: desiredPref.min, max: desiredPref.max };
  }

  const cs = getComputedStyle(gridEl);
  const gap = parseFloat(cs.columnGap || cs.gap || "0") || 0;

  // Walk down from desired columns until we find something that fits.
  for (let c = desired; c >= 1; c--) {
    const pref = NX_TILE_PREF[c] || NX_TILE_PREF[3];
    const hard = NX_TILE_HARD_MIN[c] ?? pref.min;

    // Available width per tile if we keep 'c' columns.
    const per = Math.floor((w - gap * (c - 1)) / c);

    // If we can keep at least the hard minimum, keep 'c' columns.
    if (per >= hard) {
      // Use preferred min where possible; otherwise shrink to what's available.
      const min = Math.max(hard, Math.min(pref.min, per));
      return { cols: c, min, max: pref.max };
    }
  }

  // Fallback: 1 column.
  const p1 = NX_TILE_PREF[1];
  return { cols: 1, min: p1.min, max: p1.max };
}

function setupResponsiveGrid(gridEl) {
  if (!gridEl) return;

  // Cleanup from previous renders
  try { nxGridRO?.disconnect?.(); } catch {}
  if (nxGridResizeHandler) window.removeEventListener("resize", nxGridResizeHandler);
  if (nxVVResizeHandler && window.visualViewport) {
    window.visualViewport.removeEventListener("resize", nxVVResizeHandler);
  }

  const schedule = () => {
    // Prevent layout thrash during resize/DPI changes
    requestAnimationFrame(() => {
      const plan = computeGridPlan(gridEl, nxUserCols);
      setGridVars(plan.cols, plan.min, plan.max);
    });
  };

  nxGridResizeHandler = schedule;
  window.addEventListener("resize", nxGridResizeHandler);

  if (window.visualViewport) {
    nxVVResizeHandler = schedule;
    window.visualViewport.addEventListener("resize", nxVVResizeHandler);
  } else {
    nxVVResizeHandler = null;
  }

  nxGridRO = new ResizeObserver(schedule);
  nxGridRO.observe(gridEl);

  schedule();
}

async function applyGridFromSettings() {
  try {
    const s = await window.api.getSettings?.();
    const n = Number(s?.gridColumns);
    nxUserCols = n === 4 ? 4 : n === 5 ? 5 : 3;

    const pref = NX_TILE_PREF[nxUserCols] || NX_TILE_PREF[3];
    // Initial paint (will be adjusted once grid width is known)
    setGridVars(nxUserCols, pref.min, pref.max);
  } catch {}
}


  function bindEventsOnce() {
    if (eventsBound) return;
    eventsBound = true;

    try {
      window.api?.onDownloadUpdated?.((d) => {
        if (!d) return;

        const gid = String(d.gameId ?? "");
        if (!gid) return;

        if (d.status === "downloading" || d.status === "paused") {
          setPhase(gid, "downloading");
        } else if (d.status === "completed") {
          setPhase(gid, "installing");
        } else if (d.status === "error" || d.status === "canceled") {
          setPhase(gid, null);
        }

        updateStoreButtonUI(gid);
      });
    } catch {}

    try {
      window.api?.onInstallFinished?.((p) => {
        const gid = String(p?.gameId ?? "");
        if (!gid) return;

        setPhase(gid, null);

        Promise.resolve(window.api?.getInstalled?.())
          .then((inst) => { if (inst) installedCache = inst; })
          .catch(() => {})
          .finally(() => updateStoreButtonUI(gid));
      });
    } catch {}
  }

  function getGameDevelopers(game) {
    const d =
      game?.developers ??
      game?.developer ??
      game?.dev ??
      game?.studio ??
      game?.creator ??
      [];
    const arr = Array.isArray(d) ? d : [d];
    return arr.map((x) => String(x || "").trim()).filter(Boolean);
  }

  window.renderStore = async function () {
    bindEventsOnce();
    ensureSearchBarStyles();
    ensureStoreSearchWidthFix();
    await applyGridFromSettings();

    const page = document.getElementById("page");
    if (!page) return;

    const store = await window.api.getStore();
    const installed = await window.api.getInstalled();

    installedCache = installed;

    // ✅ Wrapper makes Store-only CSS safe
    page.innerHTML = `
      <div class="nxStorePage">
        <div class="storeTop">
          <div>
            <div class="title">All Games</div>
          </div>

          <div class="searchWrap">
            <span class="searchIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
            </span>
            <input id="storeSearch" class="search" placeholder="Search games..." />
          </div>
        </div>

        <!-- ✅ Dev pills row now spans full width (extends almost to the end) -->
        <div id="devPillsRow">
          <button class="nxPillNav" type="button" data-dir="left" aria-label="Scroll developers left">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <div class="pills" id="devPills"></div>

          <button class="nxPillNav" type="button" data-dir="right" aria-label="Scroll developers right">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <div class="divider"></div>

        <div id="storeGrid" class="grid"></div>

        <div id="storeEmpty" class="emptyState" style="display:none;">
          <div class="emptyTitle">No matching games</div>
          <div class="muted">Try a different search.</div>
        </div>
      </div>
    `;

    const styleId = "searchSvgStyle";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `
        /* Store dev pills only (search bar styles are shared) */
        #devPills .pill{
          font-weight: 760;
          letter-spacing: .1px;
          color: rgba(255,255,255,.82);
        }
        #devPills .pill.active{
          font-weight: 800;
          color: rgba(255,255,255,.98);
          background: rgba(124,92,255,.30);
          border-color: rgba(124,92,255,.44);
          box-shadow: 0 14px 34px rgba(124,92,255,.18);
          filter: brightness(1.05);
        }
        #devPills .pill.active:hover{
          background: rgba(124,92,255,.34);
          filter: brightness(1.07);
        }

        /* ✅ Dev pills row spans almost full width */
        #devPillsRow{
          box-sizing: border-box;
          width: 100%;
          display:flex;
          align-items:center;
          gap: 10px;
          min-width: 0;
          max-width: 100%;
          padding-right: 14px; /* "almost to the end" */
          margin-top: 12px;    /* ✅ NEW: move pills down so they don't touch the search row */
        }

        #devPills{
          display:flex;
          flex-wrap: nowrap;
          gap: 10px;
          overflow-x: auto;
          overflow-y: hidden;
          min-width: 0;
          max-width: 100%;
          flex: 1 1 auto;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
          scrollbar-width: none; /* Firefox */
        }
        #devPills::-webkit-scrollbar{ height: 0; width: 0; }

        #devPills .pill{ flex: 0 0 auto; }

        #devPillsRow .nxPillNav{
          width: 36px;
          height: 36px;
          min-width: 36px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.08);
          background: rgba(255,255,255,.05);
          color: rgba(255,255,255,.75);
          cursor: pointer;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
        }
        #devPillsRow .nxPillNav svg{ width: 18px; height: 18px; }
        #devPillsRow .nxPillNav:disabled{
          opacity: .25;
          cursor: default;
        }

        /* Hide arrows when not needed */
        #devPillsRow:not(.hasOverflow) .nxPillNav{
          display:none;
        }
      `;
      document.head.appendChild(s);
    }

    const grid = document.getElementById("storeGrid");
    const input = document.getElementById("storeSearch");
    const empty = document.getElementById("storeEmpty");
    const devPills = document.getElementById("devPills");

    // ✅ Clamp columns to available width (fixes high-DPI button clipping)
    setupResponsiveGrid(grid);

    const devRow = document.getElementById("devPillsRow");
    const navLeft = devRow?.querySelector?.('[data-dir="left"]') || null;
    const navRight = devRow?.querySelector?.('[data-dir="right"]') || null;

    const all = store.games || [];

    gamesById = new Map(
      (all || [])
        .map((g) => [String(g?.id ?? ""), g])
        .filter(([id]) => id)
    );

    const devList = Array.from(
      new Set(all.flatMap((g) => getGameDevelopers(g)).map((x) => x.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    const selectedDevs = new Set();

    function updateDevNav() {
      if (!devPills || !devRow || !navLeft || !navRight) return;
      const max = Math.max(0, devPills.scrollWidth - devPills.clientWidth);
      const hasOverflow = max > 2;
      devRow.classList.toggle("hasOverflow", hasOverflow);

      const x = devPills.scrollLeft;
      navLeft.disabled = !hasOverflow || x <= 1;
      navRight.disabled = !hasOverflow || x >= max - 1;
    }

    function bindDevNav() {
      if (!devPills || !devRow || !navLeft || !navRight) return;

      const step = () => Math.max(180, Math.floor(devPills.clientWidth * 0.65));

      navLeft.onclick = () => devPills.scrollBy({ left: -step(), behavior: "smooth" });
      navRight.onclick = () => devPills.scrollBy({ left: step(), behavior: "smooth" });

      let raf = 0;
      const schedule = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          updateDevNav();
        });
      };

      devPills.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);

      requestAnimationFrame(updateDevNav);
    }

    function buttonState(game) {
      const isInstalled = !!installed?.[game.id];
      const upd = window.__updatesByGameId?.get(String(game.id)) || null;

      if (isInstalled && upd) return { text: `Update`, disabled: false, kind: "update" };
      if (isInstalled) return { text: "Installed", disabled: true, kind: "installed" };

      const phase = getPhase(game.id);
      if (phase === "downloading") return { text: "Downloading...", disabled: true, kind: "phase" };
      if (phase === "installing") return { text: "Installing...", disabled: true, kind: "phase" };

      return { text: "Install", disabled: false, kind: "install" };
    }

    function renderDevPills() {
      if (!devPills) return;

      if (devList.length === 0) {
        if (devRow) devRow.style.display = "none";
        return;
      }

      if (devRow) devRow.style.display = "flex";
      devPills.innerHTML = "";

      const allBtn = document.createElement("button");
      allBtn.className = "pill";
      allBtn.textContent = "All developers";
      allBtn.dataset.dev = "__all__";
      allBtn.classList.toggle("active", selectedDevs.size === 0);
      allBtn.onclick = () => {
        selectedDevs.clear();
        renderDevPills();
        applyFilter();
      };
      devPills.appendChild(allBtn);

      for (const dev of devList) {
        const b = document.createElement("button");
        b.className = "pill";
        b.textContent = dev;
        b.dataset.dev = dev;
        b.classList.toggle("active", selectedDevs.has(dev));

        b.onclick = () => {
          if (selectedDevs.has(dev)) selectedDevs.delete(dev);
          else selectedDevs.add(dev);
          renderDevPills();
          applyFilter();
        };

        devPills.appendChild(b);
      }

      requestAnimationFrame(updateDevNav);
    }

    function render(list) {
      grid.innerHTML = "";
      btnByGameId = new Map();

      if (!list || list.length === 0) {
        if (empty) empty.style.display = "block";
        return;
      }
      if (empty) empty.style.display = "none";

      for (const game of list) {
        const tile = document.createElement("div");
        tile.className = "gameTile";
        tile.dataset.gameId = String(game?.id ?? "");

        const bs = buttonState(game);

        const cover = game.imageUrl || game.image || game.cover || game.coverUrl || "";

        tile.innerHTML = `
          <div class="tileImage" style="background-image:url('${toImg(cover)}')"></div>
          <div class="tileOverlay"></div>
          <div class="tileInfo">
            <div class="tileBadge">v${game.version || "0.0.0"}</div>
            <div class="tileName">${game.name || "Game"}</div>
            <button class="ctaBtn" ${bs.disabled ? "disabled" : ""}>
              ${bs.text}
            </button>
          </div>
        `;

        tile.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          window.__selectedGame = game;
          window.__previousPage = "store";
          window.loadPage("details");
        });

        const btn = tile.querySelector("button");
        if (btn) {
          const gid = String(game?.id ?? "");
          btn.dataset.gameId = gid;
          if (gid) btnByGameId.set(gid, btn);
        }

        btn.onclick = async () => {
          const isInstalled = !!installed?.[game.id];
          const upd = window.__updatesByGameId?.get(String(game.id)) || null;

          btn.disabled = true;

          if (isInstalled && upd) {
            setPhase(game.id, "downloading");
            btn.textContent = "Downloading...";
            await window.api.queueUpdate(game.id);
            window.loadPage("downloads");
            return;
          }

          setPhase(game.id, "downloading");
          btn.textContent = "Downloading...";
          await window.api.queueInstall(game);
        };

        grid.appendChild(tile);
      }
    }

    function matchesSelectedDevs(game) {
      if (selectedDevs.size === 0) return true;

      const gameDevs = getGameDevelopers(game).map((x) => x.toLowerCase());
      for (const dev of selectedDevs) {
        if (!gameDevs.includes(String(dev).toLowerCase())) return false;
      }
      return true;
    }

    function applyFilter() {
      const q = (input?.value || "").trim().toLowerCase();

      const filtered = all.filter((g) => {
        const nameOk = !q || String(g.name || "").toLowerCase().includes(q);
        const devOk = matchesSelectedDevs(g);
        return nameOk && devOk;
      });

      render(filtered);
    }

    bindDevNav();
    renderDevPills();
    render(all);
    input.addEventListener("input", applyFilter);
  };
})();
