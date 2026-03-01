// renderer/pages/store.page.js
(function () {
  const phaseByGameId = new Map();
  let eventsBound = false;

  // In-place Store UI updates (avoid full re-render during download ticks)
  let installedCache = null;
  let gamesById = new Map();
  let btnByGameId = new Map();

  // Collections view mode
  let nxStoreViewMode = "all"; // "all" | "collections"

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

      /* Left column: title + category dropdown in a row */
      .nxStorePage .storeTop > .storeTopLeft{
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 14px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .nxStorePage .storeTop > .storeTopLeft > .title,
      .nxStorePage .storeTop > .storeTopLeft > .nxViewTabs{
        margin: 0;
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
  5: 155
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

  function getGameCategories(game) {
    const c = game?.category ?? game?.categories ?? game?.genre ?? game?.genres ?? game?.tags ?? [];
    const arr = Array.isArray(c) ? c : [c];
    return arr.map((x) => String(x || "").trim()).filter(Boolean);
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function splitSearchTerms(query) {
    return normalizeSearchText(query)
      .split(/\s+/)
      .filter(Boolean);
  }

  function isSubsequence(needle, hay) {
    if (!needle) return true;
    let i = 0;
    for (const ch of hay) {
      if (ch === needle[i]) i += 1;
      if (i >= needle.length) return true;
    }
    return false;
  }

  function levenshtein(a, b) {
    const s = String(a || "");
    const t = String(b || "");
    if (s === t) return 0;
    if (!s) return t.length;
    if (!t) return s.length;

    const rows = s.length + 1;
    const cols = t.length + 1;
    const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));

    for (let i = 0; i < rows; i++) dp[i][0] = i;
    for (let j = 0; j < cols; j++) dp[0][j] = j;

    for (let i = 1; i < rows; i++) {
      for (let j = 1; j < cols; j++) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    return dp[rows - 1][cols - 1];
  }

  function fuzzyMatchTerm(term, target) {
    if (!term) return true;
    const normalized = normalizeSearchText(target);
    if (!normalized) return false;

    const compact = normalized.replace(/\s+/g, "");
    if (compact.includes(term)) return true;
    if (isSubsequence(term, compact)) return true;

    const maxDistance = term.length <= 4 ? 1 : term.length <= 7 ? 2 : 3;
    const tokens = normalized.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (Math.abs(token.length - term.length) > maxDistance) continue;
      if (levenshtein(term, token) <= maxDistance) return true;
    }

    return false;
  }

  function matchesSearch(game, query) {
    const terms = splitSearchTerms(query);
    if (!terms.length) return true;

    const name = String(game?.name || "");
    const devs = getGameDevelopers(game).join(" ");

    for (const term of terms) {
      const hit = fuzzyMatchTerm(term, name) || fuzzyMatchTerm(term, devs);
      if (!hit) return false;
    }

    return true;
  }

  // ---- Category dropdown styles (analytics-inspired) ----
  const NX_STORE_CAT_STYLE_ID = "nxStoreCategoryDropdownStyle";
  function ensureCategoryDropdownStyles() {
    if (document.getElementById(NX_STORE_CAT_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = NX_STORE_CAT_STYLE_ID;
    s.textContent = `
      .nxCatWrap{ position: relative; flex: 0 0 auto; }

      .nxCatBtn{
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.06);
        color: rgba(255,255,255,.92);
        border-radius: 14px;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 900;
        cursor: pointer;
        outline: none;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        transition: background .16s ease, border-color .16s ease, transform .16s ease;
        white-space: nowrap;
      }
      .nxCatBtn:hover{
        background: rgba(255,255,255,.09);
        border-color: rgba(255,255,255,.14);
      }
      .nxCatBtn:active{ transform: translateY(0) scale(.98); }
      .nxCatBtn svg{
        width: 16px; height: 16px;
        stroke: rgba(255,255,255,.82);
        fill: none;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        transition: transform .18s ease;
      }
      .nxCatBtn.open svg{ transform: rotate(180deg); }

      .nxCatPanel{
        position: absolute;
        top: calc(100% + 8px);
        left: 0;
        min-width: 200px;
        max-width: 280px;
        max-height: 340px;
        overflow-y: auto;
        padding: 8px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(20,22,32,.92);
        box-shadow: 0 26px 80px rgba(0,0,0,.55);
        backdrop-filter: blur(14px);
        opacity: 0;
        transform: translateY(-6px) scale(.98);
        pointer-events: none;
        transition: opacity .18s ease, transform .22s cubic-bezier(.2,.9,.2,1);
        z-index: 10000;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,.12) transparent;
      }
      .nxCatPanel::-webkit-scrollbar{ width: 5px; }
      .nxCatPanel::-webkit-scrollbar-track{ background: transparent; }
      .nxCatPanel::-webkit-scrollbar-thumb{ background: rgba(255,255,255,.12); border-radius: 999px; }
      .nxCatPanel.open{
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .nxCatItem{
        width: 100%;
        text-align: left;
        padding: 10px 10px;
        border-radius: 12px;
        border: 1px solid transparent;
        background: transparent;
        color: rgba(255,255,255,.92);
        font-size: 13px;
        font-weight: 900;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        transition: background .14s, color .14s, border-color .14s;
      }
      .nxCatItem:hover{
        background: rgba(255,255,255,.06);
        color: #fff;
        border-color: rgba(255,255,255,.12);
      }
      .nxCatItem.active{
        background: rgba(124,92,255,.18);
        color: rgba(255,255,255,.95);
        border-color: rgba(124,92,255,.26);
        box-shadow: 0 14px 34px rgba(124,92,255,.12);
      }

      .nxCatCheck{
        width: 20px; height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        opacity: 0;
        transition: opacity .14s;
      }
      .nxCatItem.active .nxCatCheck{ opacity: 1; }
      .nxCatCheck svg{
        width: 18px; height: 18px;
        stroke: #fff;
        fill: none;
        stroke-width: 2.5;
        stroke-linecap: round;
        stroke-linejoin: round;
        display: block;
      }
    `;
    document.head.appendChild(s);
  }

  // --------------------------
  // ✅ Collections view helpers
  // --------------------------
  function getGameImages(game) {
    const raw = game?.images ?? game?.screenshots ?? [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((x) => String(x || "").trim()).filter(Boolean);
  }

  function getGameVideos(game) {
    const raw = game?.videos ?? game?.trailers ?? [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((x) => String(x || "").trim()).filter(Boolean);
  }

  function extractYTId(url) {
    const s = String(url || "");
    const m1 = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m1) return m1[1];
    const m2 = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (m2) return m2[1];
    const m3 = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (m3) return m3[1];
    return null;
  }

  function getCollectionCardImage(game) {
    const hero = game?.hero || game?.heroUrl || game?.heroImage || "";
    if (hero) return toImg(hero);
    const imgs = getGameImages(game);
    if (imgs.length) return toImg(imgs[0]);
    const cover = game?.imageUrl || game?.image || game?.cover || game?.coverUrl || "";
    return toImg(cover);
  }

  function formatDateAdded(dateAdded) {
    if (!dateAdded) return "";
    try {
      const d = new Date(dateAdded);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  }

  // --------------------------
  // ✅ Collections styles
  // --------------------------
  const NX_COLLECTIONS_STYLE_ID = "nxCollectionsStyleV1";
  function ensureCollectionsStyles() {
    if (document.getElementById(NX_COLLECTIONS_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = NX_COLLECTIONS_STYLE_ID;
    s.textContent = `
      /* View mode tabs */
      .nxViewTabs{
        display: flex;
        gap: 4px;
        background: rgba(255,255,255,.05);
        border-radius: 16px;
        padding: 4px;
        flex: 0 0 auto;
      }
      .nxViewTab{
        padding: 10px 20px;
        border-radius: 12px;
        border: 1px solid transparent;
        background: transparent;
        color: rgba(255,255,255,.50);
        cursor: pointer;
        font-weight: 900;
        font-size: 14px;
        letter-spacing: .1px;
        transition: background .16s ease, color .16s ease, border-color .16s ease;
        white-space: nowrap;
      }
      .nxViewTab:hover:not(.active){
        color: rgba(255,255,255,.75);
        background: rgba(255,255,255,.04);
      }
      .nxViewTab.active{
        background: rgba(124,92,255,.20);
        color: rgba(255,255,255,.95);
        border-color: rgba(124,92,255,.22);
      }

      /* Collections layout */
      .nxCollections{
        display: flex;
        flex-direction: column;
        gap: 40px;
        padding-top: 16px;
      }
      .nxCollRowHeader{
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 18px;
      }
      .nxCollRowTitle{
        font-size: clamp(18px, 2.4vw, 24px);
        font-weight: 950;
        letter-spacing: -.3px;
        color: rgba(255,255,255,.92);
        margin: 0;
      }
      .nxCollRowNav{
        display: flex;
        gap: 8px;
      }
      .nxCollNavBtn{
        width: 36px;
        height: 36px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.05);
        color: rgba(255,255,255,.7);
        cursor: pointer;
        display: grid;
        place-items: center;
        transition: background .16s, border-color .16s;
      }
      .nxCollNavBtn:hover{
        background: rgba(255,255,255,.10);
        border-color: rgba(255,255,255,.14);
      }
      .nxCollNavBtn:disabled{
        opacity: .25;
        cursor: default;
      }
      .nxCollNavBtn svg{
        width: 16px; height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      /* Horizontal scroller */
      .nxCollScroller{
        display: flex;
        gap: 16px;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-behavior: smooth;
        scroll-snap-type: x mandatory;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 4px;
      }
      .nxCollScroller::-webkit-scrollbar{
        display: none;
      }

      /* Card (portrait style like Epic Games) */
      .nxCollScroller .gameTile{
        flex: 0 0 auto;
        width: clamp(220px, 18vw, 300px);
        height: clamp(320px, 52vh, 420px);
        scroll-snap-align: start;
      }

      /* Developer name inside collection tiles */
      .nxCollTileDev{
        font-size: clamp(11px, 1vw, 13px);
        font-weight: 750;
        color: rgba(255,255,255,.55);
        text-shadow: 0 6px 14px rgba(0,0,0,.45);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Video overlay on hover */
      .nxCollCardVideoWrap{
        position: absolute;
        inset: 0;
        z-index: 2;
      }
      .nxCollCardVideoFrame{
        width: 100%;
        height: 100%;
        border: none;
        object-fit: cover;
        pointer-events: none;
      }

      /* Play badge */
      .nxCollCardPlayBadge{
        position: absolute;
        top: 10px;
        right: 10px;
        width: 30px;
        height: 30px;
        border-radius: 999px;
        background: rgba(0,0,0,.55);
        backdrop-filter: blur(6px);
        display: grid;
        place-items: center;
        z-index: 3;
        opacity: .65;
        transition: opacity .2s;
      }
      .gameTile:hover .nxCollCardPlayBadge{
        opacity: 1;
      }
      .nxCollCardPlayBadge svg{
        width: 13px; height: 13px;
        fill: #fff;
        stroke: none;
      }

      /* Featured hero spotlight at top */
      .nxCollSpotlight{
        position: relative;
        width: 100%;
        border-radius: 22px;
        overflow: hidden;
        cursor: pointer;
        min-height: 280px;
        max-height: 400px;
        aspect-ratio: 21/9;
        background: rgba(255,255,255,.03);
        border: 1px solid rgba(255,255,255,.06);
        box-shadow: 0 24px 60px rgba(0,0,0,.35);
        transition:
          box-shadow .45s cubic-bezier(.2,.9,.2,1),
          filter .45s ease;
      }
      .nxCollSpotlight:hover{
        box-shadow: 0 34px 90px rgba(0,0,0,.55);
        filter: brightness(1.03);
      }
      .nxCollSpotlightImg{
        position: absolute;
        inset: 0;
        background-size: cover;
        background-position: center;
        transition: transform .65s cubic-bezier(.2,.9,.2,1);
      }
      .nxCollSpotlight:hover .nxCollSpotlightImg{
        transform: scale(1.03);
      }
      .nxCollSpotlightOverlay{
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          rgba(0,0,0,.75) 0%,
          rgba(0,0,0,.45) 40%,
          rgba(0,0,0,.10) 100%
        );
      }
      .nxCollSpotlightInfo{
        position: absolute;
        left: 32px;
        bottom: 32px;
        right: 40%;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 2;
      }
      .nxCollSpotlightBadge{
        align-self: flex-start;
        padding: 6px 12px;
        border-radius: 8px;
        background: rgba(255,255,255,.12);
        border: 1px solid rgba(255,255,255,.14);
        font-size: 12px;
        font-weight: 800;
        color: rgba(255,255,255,.85);
      }
      .nxCollSpotlightName{
        font-size: clamp(22px, 3vw, 32px);
        font-weight: 950;
        letter-spacing: -.3px;
        color: #fff;
        text-shadow: 0 8px 20px rgba(0,0,0,.5);
        margin: 0;
      }
      .nxCollSpotlightDev{
        font-size: 14px;
        font-weight: 750;
        color: rgba(255,255,255,.60);
      }
      .nxCollSpotlightDesc{
        font-size: 13px;
        font-weight: 700;
        color: rgba(255,255,255,.50);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .nxCollSpotlightVideoWrap{
        position: absolute;
        inset: 0;
        z-index: 1;
      }
      .nxCollSpotlightVideoWrap iframe{
        width: 100%;
        height: 100%;
        border: none;
        object-fit: cover;
        pointer-events: none;
      }

      /* Spotlight dots navigation */
      .nxCollSpotlightDots{
        position: absolute;
        bottom: 16px;
        right: 24px;
        display: flex;
        gap: 8px;
        z-index: 3;
      }
      .nxCollSpotlightDot{
        width: 10px;
        height: 10px;
        border-radius: 999px;
        border: 1.5px solid rgba(255,255,255,.5);
        background: transparent;
        cursor: pointer;
        padding: 0;
        transition: background .16s, border-color .16s;
      }
      .nxCollSpotlightDot.active{
        background: rgba(255,255,255,.9);
        border-color: rgba(255,255,255,.9);
      }
      .nxCollSpotlightDot:hover:not(.active){
        background: rgba(255,255,255,.35);
      }
    `;
    document.head.appendChild(s);
  }

  // --------------------------
  // ✅ Build collections from remote collections.json + auto "Recently Added"
  // --------------------------
  function buildCollections(games, remoteCollections) {
    const collections = [];
    const gameMap = new Map(games.map((g) => [String(g?.id ?? ""), g]));

    // Remote collections from collections.json (user-configurable)
    const remote = Array.isArray(remoteCollections) ? remoteCollections : [];
    for (const rc of remote) {
      const title = String(rc?.title || "").trim();
      if (!title) continue;
      const ids = Array.isArray(rc?.gameIds) ? rc.gameIds : [];
      const matched = ids
        .map((id) => gameMap.get(String(id)))
        .filter(Boolean);
      if (matched.length > 0) {
        collections.push({ title, games: matched });
      }
    }

    // Auto-generated: "Recently Added"
    const sorted = [...games].sort((a, b) => {
      const da = new Date(a?.dateAdded || 0).getTime() || 0;
      const db = new Date(b?.dateAdded || 0).getTime() || 0;
      if (da && db) return db - da;
      if (da) return -1;
      if (db) return 1;
      return 0;
    });
    const recent = sorted.slice(0, Math.min(12, games.length));
    if (recent.length > 0) {
      collections.push({ title: "Recently Added", games: recent });
    }

    return collections;
  }

  // --------------------------
  // ✅ Collections view: render the full collections mode
  // --------------------------
  async function renderCollectionsView(page, store, installed) {
    const all = store.games || [];

    gamesById = new Map(
      (all || []).map((g) => [String(g?.id ?? ""), g]).filter(([id]) => id)
    );

    // Fetch remote collections.json
    let remoteCollections = [];
    try {
      const data = await window.api.getCollections?.();
      remoteCollections = data?.collections || [];
    } catch {}

    const collections = buildCollections(all, remoteCollections);

    // Pick a spotlight game (first game with a hero image)
    const spotlightGames = all.filter((g) => {
      const hero = g?.hero || g?.heroUrl || g?.heroImage || "";
      return !!hero;
    }).slice(0, 5);

    page.innerHTML = `
      <div class="nxStorePage">
        <div class="storeTop">
          <div class="storeTopLeft">
            <div class="nxViewTabs" id="storeViewTabs">
              <button class="nxViewTab" data-view="all">All Games</button>
              <button class="nxViewTab active" data-view="collections">Collections</button>
            </div>
          </div>
        </div>

        <div class="nxCollections" id="storeCollections">
          ${spotlightGames.length > 0 ? `<div id="storeSpotlight"></div>` : ""}
        </div>

        <div id="storeCollEmpty" class="emptyState" style="display:none;">
          <div class="emptyTitle">No games available</div>
          <div class="muted">Check back later for new additions.</div>
        </div>
      </div>
    `;

    const container = document.getElementById("storeCollections");
    const emptyEl = document.getElementById("storeCollEmpty");

    if (!collections.length || !all.length) {
      if (emptyEl) emptyEl.style.display = "block";
      bindViewTabs();
      return;
    }

    // Render spotlight
    if (spotlightGames.length > 0) {
      const spotMount = document.getElementById("storeSpotlight");
      if (spotMount) renderSpotlight(spotMount, spotlightGames, installed);
    }

    // Render collection rows
    for (const coll of collections) {
      const rowEl = createCollectionRow(coll, installed);
      container.appendChild(rowEl);
    }

    bindViewTabs();
    bindCollectionScrollers();
    bindCollectionVideoHover();
  }

  // Spotlight hero banner (cycles through featured games)
  function renderSpotlight(mount, games, installed) {
    let currentIdx = 0;
    let autoTimer = null;

    function buildSpotlight() {
      const game = games[currentIdx];
      if (!game) return;

      const heroImg = getCollectionCardImage(game);
      const devs = getGameDevelopers(game);
      const devText = devs.length > 0 ? devs.join(", ") : "";
      const desc = game?.description || "";

      const videos = getGameVideos(game);
      const ytId = videos.length > 0 ? extractYTId(videos[0]) : null;

      mount.innerHTML = `
        <div class="nxCollSpotlight" data-game-id="${game.id}" ${ytId ? `data-yt-id="${ytId}"` : ""}>
          <div class="nxCollSpotlightImg" style="background-image:url('${heroImg}')"></div>
          <div class="nxCollSpotlightOverlay"></div>
          <div class="nxCollSpotlightInfo">
            <span class="nxCollSpotlightBadge">v${game.version || "0.0.0"}</span>
            <h2 class="nxCollSpotlightName">${game.name || "Game"}</h2>
            ${devText ? `<div class="nxCollSpotlightDev">${devText}</div>` : ""}
            ${desc ? `<div class="nxCollSpotlightDesc">${desc}</div>` : ""}
          </div>
          ${games.length > 1 ? `
            <div class="nxCollSpotlightDots">
              ${games.map((_, i) => `<button class="nxCollSpotlightDot${i === currentIdx ? " active" : ""}" data-idx="${i}" type="button"></button>`).join("")}
            </div>
          ` : ""}
        </div>
      `;

      const spotEl = mount.querySelector(".nxCollSpotlight");
      if (spotEl) {
        spotEl.addEventListener("click", (e) => {
          if (e.target.closest(".nxCollSpotlightDot")) return;
          window.__rememberPageScroll?.("store");
          window.__restoreScrollForPage = "store";
          window.__selectedGame = game;
          window.__previousPage = "store";
          window.loadPage("details");
        });

        // Dot navigation
        spotEl.querySelectorAll(".nxCollSpotlightDot").forEach((dot) => {
          dot.addEventListener("click", (e) => {
            e.stopPropagation();
            const idx = Number(dot.dataset.idx);
            if (isNaN(idx) || idx === currentIdx) return;
            currentIdx = idx;
            buildSpotlight();
            resetAutoRotate();
          });
        });

        // Video autoplay on hover
        if (ytId) {
          let videoTimer = null;
          let videoWrap = null;

          spotEl.addEventListener("mouseenter", () => {
            videoTimer = setTimeout(() => {
              const iframe = document.createElement("iframe");
              iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&modestbranding=1&showinfo=0&rel=0`;
              iframe.allow = "autoplay; encrypted-media";
              iframe.setAttribute("loading", "lazy");
              videoWrap = document.createElement("div");
              videoWrap.className = "nxCollSpotlightVideoWrap";
              videoWrap.appendChild(iframe);
              spotEl.insertBefore(videoWrap, spotEl.querySelector(".nxCollSpotlightOverlay"));
            }, 1000);
          });

          spotEl.addEventListener("mouseleave", () => {
            clearTimeout(videoTimer);
            if (videoWrap) { videoWrap.remove(); videoWrap = null; }
          });
        }
      }
    }

    function resetAutoRotate() {
      clearInterval(autoTimer);
      if (games.length > 1) {
        autoTimer = setInterval(() => {
          currentIdx = (currentIdx + 1) % games.length;
          buildSpotlight();
        }, 7000);
      }
    }

    buildSpotlight();
    resetAutoRotate();
  }

  function createCollectionRow(coll, installed) {
    const row = document.createElement("div");
    row.className = "nxCollRow";

    const header = document.createElement("div");
    header.className = "nxCollRowHeader";
    header.innerHTML = `
      <h2 class="nxCollRowTitle">${coll.title}</h2>
      <div class="nxCollRowNav">
        <button class="nxCollNavBtn" data-dir="left" aria-label="Scroll left">
          <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>
        </button>
        <button class="nxCollNavBtn" data-dir="right" aria-label="Scroll right">
          <svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
        </button>
      </div>
    `;
    row.appendChild(header);

    const scroller = document.createElement("div");
    scroller.className = "nxCollScroller";

    for (const game of coll.games) {
      const card = createCollectionCard(game, installed);
      scroller.appendChild(card);
    }

    row.appendChild(scroller);
    return row;
  }

  function createCollectionCard(game, installed) {
    const tile = document.createElement("div");
    tile.className = "gameTile";
    tile.dataset.gameId = String(game?.id ?? "");

    const cover = game.imageUrl || game.image || game.cover || game.coverUrl || "";
    const devs = getGameDevelopers(game);
    const devText = devs.length > 0 ? devs.join(", ") : "";

    const videos = getGameVideos(game);
    const ytId = videos.length > 0 ? extractYTId(videos[0]) : null;
    if (ytId) tile.dataset.ytId = ytId;

    const isInstalled = !!installed?.[game.id];
    const upd = window.__updatesByGameId?.get(String(game.id)) || null;

    let btnText = "Install";
    let btnDisabled = false;
    if (isInstalled && upd) { btnText = "Update"; btnDisabled = false; }
    else if (isInstalled) { btnText = "Installed"; btnDisabled = true; }

    tile.innerHTML = `
      <div class="tileImage" style="background-image:url('${toImg(cover)}')"></div>
      <div class="tileOverlay"></div>
      ${ytId ? `<div class="nxCollCardPlayBadge"><svg viewBox="0 0 24 24"><polygon points="6,3 20,12 6,21"/></svg></div>` : ""}
      <div class="tileInfo">
        <div class="tileBadge">v${game.version || "0.0.0"}</div>
        <div class="tileName">${game.name || "Game"}</div>
        ${devText ? `<div class="nxCollTileDev">${devText}</div>` : ""}
        <button class="ctaBtn" ${btnDisabled ? "disabled" : ""}>
          ${btnText}
        </button>
      </div>
    `;

    tile.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      window.__rememberPageScroll?.("store");
      window.__restoreScrollForPage = "store";
      window.__selectedGame = game;
      window.__previousPage = "store";
      window.loadPage("details");
    });

    const btn = tile.querySelector("button");
    if (btn) {
      btn.onclick = async () => {
        const isInst = !!installed?.[game.id];
        const upd2 = window.__updatesByGameId?.get(String(game.id)) || null;
        btn.disabled = true;

        if (isInst && upd2) {
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
    }

    return tile;
  }

  function bindViewTabs() {
    const tabs = document.getElementById("storeViewTabs");
    if (!tabs) return;
    tabs.addEventListener("click", async (e) => {
      const tab = e.target.closest(".nxViewTab");
      if (!tab) return;
      const view = tab.dataset.view;
      if (!view || view === nxStoreViewMode) return;
      nxStoreViewMode = view;
      try { await window.api.setStoreViewMode?.(view); } catch {}
      window.renderStore?.();
    });
  }

  function bindCollectionScrollers() {
    document.querySelectorAll(".nxCollRow").forEach((row) => {
      const scroller = row.querySelector(".nxCollScroller");
      const leftBtn = row.querySelector('[data-dir="left"]');
      const rightBtn = row.querySelector('[data-dir="right"]');
      if (!scroller || !leftBtn || !rightBtn) return;

      const step = () => Math.max(280, Math.floor(scroller.clientWidth * 0.7));

      leftBtn.onclick = () => scroller.scrollBy({ left: -step(), behavior: "smooth" });
      rightBtn.onclick = () => scroller.scrollBy({ left: step(), behavior: "smooth" });

      function updateNav() {
        const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        leftBtn.disabled = scroller.scrollLeft <= 1;
        rightBtn.disabled = scroller.scrollLeft >= max - 1;
      }

      scroller.addEventListener("scroll", () => requestAnimationFrame(updateNav), { passive: true });
      requestAnimationFrame(updateNav);
    });
  }

  function bindCollectionVideoHover() {
    let hoverTimer = null;
    let currentVideoEl = null;

    document.querySelectorAll(".nxCollScroller .gameTile[data-yt-id]").forEach((card) => {
      const ytId = card.dataset.ytId;
      if (!ytId) return;

      card.addEventListener("mouseenter", () => {
        hoverTimer = setTimeout(() => {
          const iframe = document.createElement("iframe");
          iframe.className = "nxCollCardVideoFrame";
          iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${ytId}&modestbranding=1&showinfo=0&rel=0`;
          iframe.allow = "autoplay; encrypted-media";
          iframe.setAttribute("loading", "lazy");

          const wrapper = document.createElement("div");
          wrapper.className = "nxCollCardVideoWrap";
          wrapper.appendChild(iframe);

          card.appendChild(wrapper);
          currentVideoEl = wrapper;
        }, 800);
      });

      card.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimer);
        if (currentVideoEl) {
          currentVideoEl.remove();
          currentVideoEl = null;
        }
      });
    });
  }

  window.renderStore = async function () {
    bindEventsOnce();
    ensureSearchBarStyles();
    ensureStoreSearchWidthFix();
    ensureCategoryDropdownStyles();
    ensureCollectionsStyles();
    await applyGridFromSettings();

    const page = document.getElementById("page");
    if (!page) return;

    const store = await window.api.getStore();
    const installed = await window.api.getInstalled();

    installedCache = installed;

    // Check view mode preference
    try {
      const s = await window.api.getSettings?.();
      nxStoreViewMode = s?.storeViewMode === "collections" ? "collections" : "all";
    } catch {}

    if (nxStoreViewMode === "collections") {
      renderCollectionsView(page, store, installed);
      return;
    }

    // ✅ Wrapper makes Store-only CSS safe
    page.innerHTML = `
      <div class="nxStorePage">
        <div class="storeTop">
          <div class="storeTopLeft">
            <div class="nxViewTabs" id="storeViewTabs">
              <button class="nxViewTab active" data-view="all">All Games</button>
              <button class="nxViewTab" data-view="collections">Collections</button>
            </div>

            <div class="nxCatWrap" id="storeCatWrap">
              <button class="nxCatBtn" id="storeCatBtn" type="button">
                <span id="storeCatLabel">All</span>
                <svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
              </button>
              <div class="nxCatPanel" id="storeCatPanel"></div>
            </div>
          </div>

          <div class="searchWrap">
            <span class="searchIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M21 21l-4.35-4.35"></path>
              </svg>
            </span>
            <input id="storeSearch" class="search" placeholder="Search games or developers..." />
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

    const catList = Array.from(
      new Set(all.flatMap((g) => getGameCategories(g)).map((x) => x.trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    const selectedDevs = new Set();
    let selectedCategory = ""; // "" means All

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

    // ---- Category dropdown logic ----
    const catWrap = document.getElementById("storeCatWrap");
    const catBtn = document.getElementById("storeCatBtn");
    const catPanel = document.getElementById("storeCatPanel");
    const catLabel = document.getElementById("storeCatLabel");

    function renderCategoryDropdown() {
      if (!catPanel) return;
      catPanel.innerHTML = "";

      // "All" item
      const allItem = document.createElement("button");
      allItem.className = "nxCatItem" + (selectedCategory === "" ? " active" : "");
      allItem.innerHTML = `<span>All</span><span class="nxCatCheck"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>`;
      allItem.onclick = () => {
        selectedCategory = "";
        if (catLabel) catLabel.textContent = "All";
        closeCategoryDropdown();
        renderCategoryDropdown();
        applyFilter();
      };
      catPanel.appendChild(allItem);

      for (const cat of catList) {
        const item = document.createElement("button");
        item.className = "nxCatItem" + (selectedCategory === cat ? " active" : "");
        item.innerHTML = `<span>${cat}</span><span class="nxCatCheck"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>`;
        item.onclick = () => {
          selectedCategory = cat;
          if (catLabel) catLabel.textContent = cat;
          closeCategoryDropdown();
          renderCategoryDropdown();
          applyFilter();
        };
        catPanel.appendChild(item);
      }
    }

    function openCategoryDropdown() {
      if (!catPanel || !catBtn) return;
      catPanel.classList.add("open");
      catBtn.classList.add("open");
    }

    function closeCategoryDropdown() {
      if (!catPanel || !catBtn) return;
      catPanel.classList.remove("open");
      catBtn.classList.remove("open");
    }

    if (catBtn) {
      catBtn.onclick = (e) => {
        e.stopPropagation();
        const isOpen = catPanel?.classList.contains("open");
        if (isOpen) closeCategoryDropdown();
        else openCategoryDropdown();
      };
    }

    // Close on outside click
    function onDocClickCat(e) {
      if (catWrap && !catWrap.contains(e.target)) closeCategoryDropdown();
    }
    document.addEventListener("click", onDocClickCat);

    // Hide dropdown if no categories exist
    if (catList.length === 0 && catWrap) {
      catWrap.style.display = "none";
    }

    renderCategoryDropdown();

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
          window.__rememberPageScroll?.("store");
          window.__restoreScrollForPage = "store";
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

    function matchesSelectedCategory(game) {
      if (!selectedCategory) return true;
      const cats = getGameCategories(game).map((x) => x.toLowerCase());
      return cats.includes(selectedCategory.toLowerCase());
    }

    function applyFilter() {
      const q = String(input?.value || "");

      const filtered = all.filter((g) => {
        const nameOk = matchesSearch(g, q);
        const devOk = matchesSelectedDevs(g);
        const catOk = matchesSelectedCategory(g);
        return nameOk && devOk && catOk;
      });

      render(filtered);
    }

    bindDevNav();
    renderDevPills();
    render(all);
    input.addEventListener("input", applyFilter);

    // Bind view mode tabs (All Games / Collections)
    bindViewTabs();
  };
})();
