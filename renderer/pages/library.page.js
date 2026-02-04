// renderer/pages/library.page.js

// Prevent unnecessary DOM writes (helps stop hover animations from restarting)
function setTextIfChanged(el, txt) {
  if (!el) return;
  const next = String(txt ?? "");
  if (el.textContent !== next) el.textContent = next;
}

function formatPlaytime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds || 0)));

  if (s < 60) return `${s}s`;

  const totalMin = Math.floor(s / 60);
  if (totalMin < 60) return `${totalMin}m`;

  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

function formatLastPlayed(iso) {
  if (!iso) return "Never";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Never";
    return d.toLocaleString();
  } catch {
    return "Never";
  }
}

function isUrl(v) {
  return /^https?:\/\//i.test(String(v || ""));
}
function toImg(v) {
  if (!v) return "";
  return isUrl(v) ? String(v) : `assets/${v}`;
}


// --------------------------
// ✅ Changelog modal (used by Library + Details)
// --------------------------
const CHANGELOG_STYLE_ID = "nxChangelogStyle";
function ensureChangelogStyles() {
  if (document.getElementById(CHANGELOG_STYLE_ID)) return;

  const s = document.createElement("style");
  s.id = CHANGELOG_STYLE_ID;
  s.textContent = `
    .nxChOverlay{
      position: fixed; inset: 0; z-index: 99998;
      display: grid; place-items: center;
      padding: 22px;
      background: rgba(0,0,0,.62);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      opacity: 0;
      animation: nxChFadeIn .18s ease forwards;
    }

    .nxChCard{
      width: min(980px, 94vw);
      height: min(620px, 84vh);
      border-radius: 24px;
      background: rgba(18,20,30,.92);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 40px 120px rgba(0,0,0,.65);
      overflow: hidden;
      display: flex;
      flex-direction: column;

      transform: translateY(12px) scale(.985);
      opacity: 0;
      animation: nxChCardIn .22s cubic-bezier(.2,.9,.2,1) forwards;
      animation-delay: .03s;
    }

    .nxChOverlay.isClosing{
      animation: nxChFadeOut .16s ease forwards;
    }
    .nxChOverlay.isClosing .nxChCard{
      animation: nxChCardOut .18s cubic-bezier(.2,.9,.2,1) forwards;
    }

    .nxChTop{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }

    .nxChTitle{
      font-weight: 950;
      font-size: 14px;
      letter-spacing: .2px;
      color: rgba(255,255,255,.92);
    }

    .nxChClose{
      border:none;
      cursor:pointer;
      border-radius: 14px;
      padding: 10px 12px;
      background: rgba(255,255,255,.08);
      color:#fff;
      font-weight: 900;
      transition: transform .12s ease, background .16s ease, filter .16s ease;
    }
    .nxChClose:hover{ background: rgba(255,255,255,.12); transform: translateY(-1px); }
    .nxChClose:active{ transform: translateY(0) scale(.98); filter: brightness(1.05); }

    .nxChBody{ flex:1; display:flex; min-height: 0; }

    .nxChLeft{
      width: 290px;
      border-right: 1px solid rgba(255,255,255,.06);
      padding: 12px;
      overflow:auto;
    }

    .nxChRight{ flex:1; padding: 16px; overflow:auto; min-width: 0; }

    .nxChItem{
      width: 100%;
      text-align: left;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.04);
      border-radius: 16px;
      padding: 12px 12px;
      cursor: pointer;
      color: rgba(255,255,255,.82);
      font-weight: 850;
      transition: transform .12s ease, background .16s ease, border-color .16s ease;
    }
    .nxChItem + .nxChItem{ margin-top: 10px; }

    .nxChItem:hover{
      background: rgba(255,255,255,.06);
      border-color: rgba(255,255,255,.12);
      transform: translateY(-1px);
    }

    .nxChItem.active{
      background: rgba(124,92,255,.22);
      border-color: rgba(124,92,255,.30);
      box-shadow: 0 14px 34px rgba(124,92,255,.12);
      color: #fff;
    }

    .nxChItemSub{
      margin-top: 5px;
      font-size: 12px;
      font-weight: 800;
      color: rgba(255,255,255,.60);
    }

    .nxChHead{
      font-weight: 950;
      font-size: 16px;
      letter-spacing: .2px;
      color: #fff;
    }

    .nxChMeta{
      margin-top: 6px;
      color: rgba(255,255,255,.62);
      font-weight: 850;
      font-size: 12.5px;
    }

    .nxChText{
      margin-top: 12px;
      white-space: pre-wrap;
      line-height: 1.55;
      font-weight: 700;
      color: rgba(255,255,255,.76);
      font-size: 13.5px;

      opacity: 1;
      transform: translateY(0);
      transition: opacity .18s ease, transform .18s ease;
    }

    .nxChText.isSwap{
      opacity: 0;
      transform: translateY(6px);
    }

    @keyframes nxChFadeIn{ from{opacity:0;} to{opacity:1;} }
    @keyframes nxChCardIn{ from{opacity:0; transform: translateY(12px) scale(.985);} to{opacity:1; transform: translateY(0) scale(1);} }

    @keyframes nxChFadeOut{ from{opacity:1;} to{opacity:0;} }
    @keyframes nxChCardOut{ from{opacity:1; transform: translateY(0) scale(1);} to{opacity:0; transform: translateY(12px) scale(.985);} }
  `;
  document.head.appendChild(s);
}

function normalizeChangelogEntries(data) {
  const raw = data?.entries ?? data?.versions ?? data?.changelog ?? [];
  const arr = Array.isArray(raw) ? raw : [];

  return arr
    .map((e) => ({
      version: String(e?.version ?? e?.ver ?? "").trim(),
      date: String(e?.date ?? e?.released ?? "").trim(),
      title: String(e?.title ?? "").trim(),
      text: String(e?.text ?? e?.notes ?? e?.body ?? "").trim()
    }))
    .filter((e) => e.version || e.title || e.text || e.date);
}

function openChangelogModal(gameName, entries) {
  ensureChangelogStyles();

  const list = Array.isArray(entries) ? entries : [];
  let idx = 0;
  let closing = false;

  const overlay = document.createElement("div");
  overlay.className = "nxChOverlay";

  const card = document.createElement("div");
  card.className = "nxChCard";

  const top = document.createElement("div");
  top.className = "nxChTop";

  const title = document.createElement("div");
  title.className = "nxChTitle";
  title.textContent = `Changelog — ${gameName}`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "nxChClose";
  closeBtn.type = "button";
  closeBtn.textContent = "Close";

  top.appendChild(title);
  top.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "nxChBody";

  const left = document.createElement("div");
  left.className = "nxChLeft";

  const right = document.createElement("div");
  right.className = "nxChRight";

  const head = document.createElement("div");
  head.className = "nxChHead";

  const meta = document.createElement("div");
  meta.className = "nxChMeta";

  const text = document.createElement("div");
  text.className = "nxChText";

  right.appendChild(head);
  right.appendChild(meta);
  right.appendChild(text);

  body.appendChild(left);
  body.appendChild(right);

  card.appendChild(top);
  card.appendChild(body);
  overlay.appendChild(card);

  function close() {
    if (closing) return;
    closing = true;
    document.removeEventListener("keydown", onKey);
    overlay.classList.add("isClosing");
    setTimeout(() => overlay.remove(), 200);
  }

  function onKey(e) {
    if (e.key === "Escape") close();
  }

  function setActive(i) {
    idx = Math.max(0, Math.min(list.length - 1, i));

    const items = left.querySelectorAll(".nxChItem");
    items.forEach((el, n) => el.classList.toggle("active", n === idx));

    const entry = list[idx] || {};
    const mainTitle = entry.title
      ? `${entry.version ? `v${entry.version} — ` : ""}${entry.title}`
      : entry.version
        ? `v${entry.version}`
        : "Changelog";
    const sub = [entry.date ? `Released: ${entry.date}` : ""].filter(Boolean).join(" • ");

    text.classList.add("isSwap");
    setTimeout(() => {
      head.textContent = mainTitle;
      meta.textContent = sub;
      text.textContent = entry.text || "No notes provided.";
      requestAnimationFrame(() => text.classList.remove("isSwap"));
    }, 140);
  }

  if (!list.length) {
    left.innerHTML = `<div style="color:rgba(255,255,255,.65); font-weight:800; padding:10px;">No changelog entries yet.</div>`;
    head.textContent = "No changelog";
    meta.textContent = "";
    text.textContent = "Add entries to your remote changelog JSON file to show them here.";
  } else {
    left.innerHTML = "";
    list.forEach((e, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nxChItem";
      btn.innerHTML = `
        <div>${e.version ? `v${e.version}` : e.title || "Update"}</div>
        <div class="nxChItemSub">${e.date || (e.title ? e.title : "")}</div>
      `;
      btn.addEventListener("click", () => setActive(i));
      left.appendChild(btn);
    });

    setActive(0);
  }

  overlay.addEventListener("click", (e) => {
    if (!card.contains(e.target)) close();
  });

  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
  closeBtn.focus();
}

/* =========================================================
   ✅ Library reorder (press + hold → drag, smartphone style)
   Persists order via localStorage
   ========================================================= */

const LIB_ORDER_KEY = "nx.libraryOrder.v1";
const LIB_REORDER_STYLE_ID = "nxLibraryReorderStyle";
const LIB_HINT_STYLE_ID = "nxLibraryReorderHintStyle";

// ✅ Responsive grid columns (Library)
// Users pick 3/4/5 in Settings. We try hard to respect that across Windows DPI scaling.
// We allow tiles to tighten a bit before dropping a column.
//
// "preferred" min widths preserve your intended look.
// "hard" min widths are the smallest we will allow before we clamp down.
const NX_LIB_TILE_PREF = {
  1: { min: 260, max: 520 },
  2: { min: 260, max: 460 },
  3: { min: 260, max: 400 },
  4: { min: 230, max: 360 },
  5: { min: 200, max: 320 }
};

const NX_LIB_TILE_HARD_MIN = {
  1: 240,
  2: 240,
  3: 230,
  4: 190,
  5: 155
};

let nxLibUserCols = 3;
let nxLibGridRO = null;
let nxLibGridResizeHandler = null;
let nxLibVVResizeHandler = null;
let nxLibLastGridKey = "";

function nxLibSetGridVars(cols, minPx, maxPx) {
  const c = Math.max(1, Math.min(5, Number(cols) || 3));
  const pref = NX_LIB_TILE_PREF[c] || NX_LIB_TILE_PREF[3];

  const min = Math.max(140, Math.floor(Number(minPx || pref.min)));
  const max = Math.max(min, Math.floor(Number(maxPx || pref.max)));

  const key = `${c}|${min}|${max}`;
  if (nxLibLastGridKey === key) return;
  nxLibLastGridKey = key;

  document.documentElement.style.setProperty("--nxGridCols", String(c));
  document.documentElement.style.setProperty("--nxTileMin", `${min}px`);
  document.documentElement.style.setProperty("--nxTileMax", `${max}px`);
}

function nxLibGetGridWidth(gridEl) {
  const rectW = Math.round(gridEl.getBoundingClientRect?.().width || 0);
  return Math.max(gridEl.clientWidth || 0, rectW || 0);
}

function nxLibComputeGridPlan(gridEl, desiredCols) {
  const desired = Math.max(1, Math.min(5, Number(desiredCols) || 3));
  const desiredPref = NX_LIB_TILE_PREF[desired] || NX_LIB_TILE_PREF[3];

  if (!gridEl) {
    return { cols: desired, min: desiredPref.min, max: desiredPref.max };
  }

  // NOTE: At some DPI/paint timings the grid can report width=0 for a frame.
  // Treat that as "not laid out yet" and do not clamp based on it.
  const w = nxLibGetGridWidth(gridEl);
  if (w <= 0) {
    return { cols: desired, min: desiredPref.min, max: desiredPref.max };
  }

  const cs = getComputedStyle(gridEl);
  const gap = parseFloat(cs.columnGap || cs.gap || "0") || 0;

  for (let c = desired; c >= 1; c--) {
    const pref = NX_LIB_TILE_PREF[c] || NX_LIB_TILE_PREF[3];
    const hard = NX_LIB_TILE_HARD_MIN[c] ?? pref.min;

    const per = Math.floor((w - gap * (c - 1)) / c);

    if (per >= hard) {
      const min = Math.max(hard, Math.min(pref.min, per));
      return { cols: c, min, max: pref.max };
    }
  }

  const p1 = NX_LIB_TILE_PREF[1];
  return { cols: 1, min: p1.min, max: p1.max };
}

function nxLibSetupResponsiveGrid(gridEl) {
  if (!gridEl) return;

  try { nxLibGridRO?.disconnect?.(); } catch {}
  if (nxLibGridResizeHandler) window.removeEventListener("resize", nxLibGridResizeHandler);
  if (nxLibVVResizeHandler && window.visualViewport) {
    window.visualViewport.removeEventListener("resize", nxLibVVResizeHandler);
  }

  const schedule = () => {
    requestAnimationFrame(() => {
      const plan = nxLibComputeGridPlan(gridEl, nxLibUserCols);
      nxLibSetGridVars(plan.cols, plan.min, plan.max);
    });
  };

  nxLibGridResizeHandler = schedule;
  window.addEventListener("resize", nxLibGridResizeHandler);

  if (window.visualViewport) {
    nxLibVVResizeHandler = schedule;
    window.visualViewport.addEventListener("resize", nxLibVVResizeHandler);
  } else {
    nxLibVVResizeHandler = null;
  }

  nxLibGridRO = new ResizeObserver(schedule);
  nxLibGridRO.observe(gridEl);

  schedule();
}

async function applyGridFromSettings() {
  try {
    const s = await window.api.getSettings?.();
    const n = Number(s?.gridColumns);
    nxLibUserCols = n === 4 ? 4 : n === 5 ? 5 : 3;

    const pref = NX_LIB_TILE_PREF[nxLibUserCols] || NX_LIB_TILE_PREF[3];
    // Initial paint (will be adjusted once grid width is known)
    nxLibSetGridVars(nxLibUserCols, pref.min, pref.max);
  } catch {}
}

function getGameDevelopers(meta, inst) {
  const d =
    meta?.developers ??
    meta?.developer ??
    meta?.dev ??
    meta?.studio ??
    meta?.creator ??
    inst?.developers ??
    inst?.developer ??
    inst?.dev ??
    inst?.studio ??
    inst?.creator ??
    [];
  const arr = Array.isArray(d) ? d : [d];
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

function matchesLibrarySearch(game, query) {
  const terms = splitSearchTerms(query);
  if (!terms.length) return true;

  const name = String(game?.name || "");
  const devs = (game?.developers || []).join(" ");

  for (const term of terms) {
    const hit = fuzzyMatchTerm(term, name) || fuzzyMatchTerm(term, devs);
    if (!hit) return false;
  }

  return true;
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

function ensureLibraryHintStyles() {
  if (document.getElementById(LIB_HINT_STYLE_ID)) return;

  const s = document.createElement("style");
  s.id = LIB_HINT_STYLE_ID;
  s.textContent = `
    .nxReorderHint{
      grid-column: 1 / -1;
      padding: 12px 14px;
      border-radius: 18px;
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.06);
      color: rgba(255,255,255,.70);
      font-weight: 800;
      font-size: 13px;
      margin-bottom: 6px;
    }

/* When the hint is shown under the page title, make it read like a subtitle (no pill box) */
.storeTop .nxReorderHint{
  background: transparent;
  border: none;
  padding: 0;
  margin: 10px 0 0 0;
  border-radius: 0;
  color: rgba(255,255,255,.62);
  font-weight: 650;
  font-size: 13px;
  letter-spacing: .1px;
}

/* Hint placed below the header row (between the title row and divider) */
.nxReorderHint.nxReorderHintBelowTop{
  background: transparent;
  border: none;
  padding: 0;
  margin: 14px 0 0 0;
  border-radius: 0;
  color: rgba(255,255,255,.62);
  font-weight: 650;
  font-size: 13px;
  letter-spacing: .1px;
}

/* Header-left layout fix: avoid stretching that creates wasted vertical space */
.storeTop > div:first-child{
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-start;
  min-width: 0;
}

/* Hint placed in the header-left slot (not directly under title, but closer than below the whole header row) */
.nxReorderHint.nxReorderHintHeaderSlot{
  background: transparent;
  border: none;
  padding: 0;
  margin: 18px 0 0 0; /* slightly lower than title */
  border-radius: 0;
  color: rgba(255,255,255,.62);
  font-weight: 650;
  font-size: 13px;
  letter-spacing: .1px;
}
`;
  document.head.appendChild(s);
}

function makeLibraryReorderHintEl() {
  ensureLibraryHintStyles();
  const hint = document.createElement("div");
  hint.className = "nxReorderHint";
  hint.textContent = "Hold and drag a game to rearrange your Library";
  return hint;
}

function loadLibraryOrder() {
  try {
    const raw = localStorage.getItem(LIB_ORDER_KEY);
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

function saveLibraryOrder(order) {
  try {
    localStorage.setItem(LIB_ORDER_KEY, JSON.stringify(order || []));
  } catch {}
}

function sortLibraryGamesByOrder(games) {
  const order = loadLibraryOrder();
  if (!order.length) return games;

  const index = new Map(order.map((id, i) => [String(id), i]));
  return [...games].sort((a, b) => {
    const ai = index.has(String(a.id)) ? index.get(String(a.id)) : 1e9;
    const bi = index.has(String(b.id)) ? index.get(String(b.id)) : 1e9;
    return ai - bi;
  });
}

function ensureLibraryReorderStyles() {
  if (document.getElementById(LIB_REORDER_STYLE_ID)) return;

  const s = document.createElement("style");
  s.id = LIB_REORDER_STYLE_ID;
  s.textContent = `
    /* ✅ stops accidental text highlighting during hold/drag */
    body.nxNoSelect, body.nxNoSelect *{
      user-select:none !important;
      -webkit-user-select:none !important;
      -ms-user-select:none !important;
    }

    .nxReorderMode [data-game-id]{
      user-select:none;
      -webkit-user-select:none;
      touch-action:none;
    }

    .nxReorderMode [data-game-id]:not(.nxDragging){
      animation: nxWiggle 0.65s cubic-bezier(.2,.9,.2,1) infinite;
      transform-origin: 50% 60%;
    }

    @keyframes nxWiggle{
      0%   { transform: rotate(-0.35deg) translateY(0px); }
      50%  { transform: rotate(0.35deg)  translateY(-1px); }
      100% { transform: rotate(-0.35deg) translateY(0px); }
    }

    .nxDragging{
      position: fixed !important;
      z-index: 99999 !important;
      pointer-events: none !important;
      filter: brightness(1.06);
      transform: scale(1.015);
      transition:
        transform .22s cubic-bezier(.2,.9,.2,1),
        filter .22s ease;
    }

    .nxPlaceholder{
      border-radius: 22px;
      background: rgba(255,255,255,.05);
      border: 1px dashed rgba(255,255,255,.14);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,.05);
      transition: transform .22s cubic-bezier(.2,.9,.2,1), opacity .22s ease;
    }
  `;
  document.head.appendChild(s);
}

function ensureLibraryPlayButtonGlowStyles() {
  if (document.getElementById("nxLibraryPlayBtnGlowStyle")) return;

  const s = document.createElement("style");
  s.id = "nxLibraryPlayBtnGlowStyle";
  s.textContent = `
    /* ✅ Library Play button: premium glow (matches Details primary button) */
    .libBtnPrimary[data-act="play"]{
      position: relative;
      overflow: hidden;
      isolation: isolate;

      border: 1px solid rgba(124,92,255,.28);
      background: rgba(124,92,255,.86);
      color: #fff;

      box-shadow:
        0 18px 54px rgba(124,92,255,.22),
        0 0 0 1px rgba(124,92,255,.18) inset;

      transition:
        filter .18s ease,
        box-shadow .20s ease,
        transform .14s ease,
        background .18s ease,
        border-color .18s ease;
      will-change: transform, filter;
    }

    /* keep label above glow layers */
    .libBtnPrimary[data-act="play"] > *{
      position: relative;
      z-index: 1;
    }

    /* soft internal highlight */
    .libBtnPrimary[data-act="play"]::after{
      content:"";
      position:absolute;
      inset: 0;
      background: radial-gradient(120% 140% at 20% 0%,
        rgba(255,255,255,.18),
        rgba(255,255,255,0) 60%);
      opacity: .9;
      pointer-events:none;
      z-index: 0;
    }

    /* outer aura */
    .libBtnPrimary[data-act="play"]::before{
      content:"";
      position:absolute;
      inset: -18px;
      border-radius: 999px;
      background: radial-gradient(60% 60% at 50% 50%,
        rgba(124,92,255,.45),
        rgba(124,92,255,0) 70%);
      filter: blur(14px);
      opacity: .55;
      transform: scale(1);
      pointer-events:none;
      transition: opacity .18s ease, transform .18s ease, filter .18s ease;
      z-index: -1;
    }

    .libBtnPrimary[data-act="play"]:hover{
      filter: brightness(1.05);
      box-shadow:
        0 22px 64px rgba(124,92,255,.26),
        0 0 0 1px rgba(124,92,255,.22) inset;
      transform: scale(1.01);
    }
    .libBtnPrimary[data-act="play"]:hover::before{
      opacity: .72;
      filter: blur(16px);
      transform: scale(1.02);
    }

    .libBtnPrimary[data-act="play"]:active{
      filter: brightness(1.02);
      transform: scale(.992);
    }
    .libBtnPrimary[data-act="play"]:active::before{
      opacity: .62;
      transform: scale(.99);
    }

    .libBtnPrimary[data-act="play"]:disabled{
      opacity: .65;
      cursor: default;
      transform: none;
      filter: none;
      box-shadow: none;
      border-color: rgba(255,255,255,.10);
      background: rgba(255,255,255,.10);
    }
    .libBtnPrimary[data-act="play"]:disabled::before,
    .libBtnPrimary[data-act="play"]:disabled::after{
      opacity: 0;
    }
  `;
  document.head.appendChild(s);
}



/* --------------------------
   ✅ Right-click: move game to position (Library)
   - Opens a small modal asking for a 1-based position
   - Updates the saved localStorage order (same key as drag reorder)
   -------------------------- */
const NX_LIB_MOVE_STYLE_ID = "nxLibMovePosStyle";

function ensureLibMovePosStyles() {
  if (document.getElementById(NX_LIB_MOVE_STYLE_ID)) return;

  const s = document.createElement("style");
  s.id = NX_LIB_MOVE_STYLE_ID;
  s.textContent = `
    .nxMoveOverlay{
      position: fixed; inset: 0; z-index: 99997;
      display: grid; place-items: center;
      padding: 22px;
      background: rgba(0,0,0,.62);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      animation: nxMoveFadeIn .16s ease both;
    }
    .nxMoveCard{
      width: min(520px, 92vw);
      border-radius: 22px;
      background: rgba(18,20,30,.92);
      border: 1px solid rgba(255,255,255,.10);
      box-shadow: 0 34px 110px rgba(0,0,0,.65);
      overflow: hidden;
    }
    .nxMoveTop{
      padding: 16px 16px 12px 16px;
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap: 12px;
    }
    .nxMoveTitle{
      font-weight: 950;
      font-size: 15px;
      letter-spacing: .2px;
      color: #fff;
    }
    .nxMoveSub{
      margin-top: 6px;
      color: rgba(255,255,255,.70);
      font-weight: 750;
      font-size: 13px;
      line-height: 1.35;
    }
    .nxMoveBody{
      padding: 0 16px 14px 16px;
    }
    .nxMoveRow{
      display:flex;
      gap: 12px;
      align-items: center;
      margin-top: 12px;
    }
    .nxMoveInput{
      flex: 1;
      height: 46px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,.10);
      background: rgba(255,255,255,.06);
      color: rgba(255,255,255,.94);
      font-weight: 900;
      font-size: 14px;
      padding: 0 14px;
      outline: none;
      overflow: hidden; /* prevents any inner scrollbar */
      appearance: textfield;
    }
    .nxMoveInput:focus{
      border-color: rgba(124,92,255,.44);
      box-shadow: 0 0 0 4px rgba(124,92,255,.14);
    }

    /* Remove number spinners / arrows */
    .nxMoveInput::-webkit-outer-spin-button,
    .nxMoveInput::-webkit-inner-spin-button{
      -webkit-appearance: none;
      margin: 0;
    }
    .nxMoveInput[type="number"]{
      -moz-appearance: textfield;
    }

    .nxMoveHint{
      margin-top: 10px;
      color: rgba(255,255,255,.55);
      font-weight: 750;
      font-size: 12.5px;
      line-height: 1.35;
    }
    .nxMoveDivider{ height: 1px; background: rgba(255,255,255,.06); }
    .nxMoveActions{
      padding: 12px 16px 16px 16px;
      display:flex;
      justify-content:flex-end;
      gap: 10px;
    }
    .nxMoveBtn{
      border: none;
      cursor: pointer;
      border-radius: 14px;
      padding: 11px 14px;
      font-weight: 950;
      color: #fff;
      background: rgba(255,255,255,.08);
      transition: transform .12s ease, background .16s ease;
    }
    .nxMoveBtn:hover{ background: rgba(255,255,255,.12); transform: translateY(-1px); }
    .nxMoveBtn:active{ transform: translateY(0) scale(.98); }

    .nxMoveBtnPrimary{
      background: rgba(124,92,255,.28);
      border: 1px solid rgba(124,92,255,.22);
    }
    .nxMoveBtnPrimary:hover{ background: rgba(124,92,255,.34); }

    @keyframes nxMoveFadeIn{
      from{ opacity:0; transform: translateY(8px); }
      to{ opacity:1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(s);
}

/**
 * Opens a modal asking for a 1-based position.
 * Resolves with a Number (1..maxPos) or null if cancelled.
 */
function openLibMoveToPositionModal(gameName, currentPos, maxPos) {
  ensureLibMovePosStyles();

  const max = Math.max(1, Number(maxPos || 1));
  const cur = Math.max(1, Math.min(max, Number(currentPos || 1)));

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "nxMoveOverlay";

    const safeName = String(gameName || "this game")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

    overlay.innerHTML = `
      <div class="nxMoveCard" role="dialog" aria-modal="true">
        <div class="nxMoveTop">
          <div style="min-width:0; flex:1;">
            <div class="nxMoveTitle">Move in Library</div>
            <div class="nxMoveSub">
              Set the position for <strong>${safeName}</strong>.
              (Current: ${cur} of ${max})
            </div>
          </div>
        </div>

        <div class="nxMoveBody">
          <div class="nxMoveRow">
            <input class="nxMoveInput" id="nxMovePosInput" type="number" min="1" max="${max}" step="1" value="${cur}" />
          </div>
          <div class="nxMoveHint">Type a number like <strong>1</strong> for first, or <strong>${max}</strong> for last.</div>
        </div>

        <div class="nxMoveDivider"></div>

        <div class="nxMoveActions">
          <button class="nxMoveBtn" id="nxMoveCancelBtn" type="button">Cancel</button>
          <button class="nxMoveBtn nxMoveBtnPrimary" id="nxMoveOkBtn" type="button">Move</button>
        </div>
      </div>
    `;

    const card = overlay.querySelector(".nxMoveCard");
    const input = overlay.querySelector("#nxMovePosInput");
    const cancelBtn = overlay.querySelector("#nxMoveCancelBtn");
    const okBtn = overlay.querySelector("#nxMoveOkBtn");

    let closed = false;

    function close(val) {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey);
      try { document.documentElement.style.overflow = ""; } catch {}
      overlay.remove();
      resolve(val);
    }

    function submit() {
      const raw = Number(input?.value || 0);
      if (!Number.isFinite(raw) || raw < 1 || raw > max) {
        try { input?.focus?.(); input?.select?.(); } catch {}
        if (typeof window.showToast === "function") {
          window.showToast(`Enter a number between 1 and ${max}.`, "error");
        } else if (typeof showToast === "function") {
          showToast(`Enter a number between 1 and ${max}.`, "error");
        }
        return;
      }
      close(Math.floor(raw));
    }

    function onKey(e) {
      if (e.key === "Escape") return close(null);
      if (e.key === "Enter") return submit();
    }

    overlay.addEventListener("click", (e) => {
      if (!card.contains(e.target)) close(null);
    });

    cancelBtn?.addEventListener("click", () => close(null));
    okBtn?.addEventListener("click", submit);

    // Prevent mousewheel from changing the number (and showing weird arrow overlays on some setups)
    try {
      input?.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
        },
        { passive: false }
      );
    } catch {}

    document.addEventListener("keydown", onKey);
    try { document.documentElement.style.overflow = "hidden"; } catch {}
    document.body.appendChild(overlay);

    setTimeout(() => {
      try { input?.focus?.(); input?.select?.(); } catch {}
    }, 0);
  });
}


function attachLibraryReorder(gridEl, canReorder) {
  if (!gridEl || gridEl.__nxReorderAttached) return;
  gridEl.__nxReorderAttached = true;

  ensureLibraryReorderStyles();

  let pressTimer = null;
  let draggingEl = null;
  let placeholder = null;

  let startX = 0, startY = 0;
  let offsetX = 0, offsetY = 0;

  const LONG_PRESS_MS = 260;
  const MOVE_CANCEL_PX = 6;

  function getTiles() {
    return Array.from(gridEl.querySelectorAll("[data-game-id]"));
  }

  function setReorderMode(on) {
    gridEl.classList.toggle("nxReorderMode", !!on);
  }

  function enableNoSelect() {
    document.body.classList.add("nxNoSelect");
  }
  function disableNoSelect() {
    document.body.classList.remove("nxNoSelect");
  }

  function clearPressTimer() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
  }

  function findTileFromTarget(t) {
    return t?.closest?.("[data-game-id]") || null;
  }

  function makePlaceholderLike(el) {
    const r = el.getBoundingClientRect();
    const ph = document.createElement("div");
    ph.className = "nxPlaceholder";
    ph.style.width = `${Math.round(r.width)}px`;
    ph.style.height = `${Math.round(r.height)}px`;
    return ph;
  }

  function startDrag(tile, clientX, clientY) {
    draggingEl = tile;

    const rect = tile.getBoundingClientRect();
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;

    // Placeholder keeps the grid space while we drag
    placeholder = makePlaceholderLike(tile);
    tile.parentNode.insertBefore(placeholder, tile);

    // IMPORTANT:
    // #page has a transform (for page transitions). Any transformed ancestor becomes the
    // containing block for position:fixed, which makes fixed coords "jump".
    // Move the tile to <body> so fixed positioning is relative to the viewport.
    document.body.appendChild(tile);

    tile.classList.add("nxDragging");
    tile.style.width = `${Math.round(rect.width)}px`;
    tile.style.height = `${Math.round(rect.height)}px`;
    tile.style.left = `${Math.round(clientX - offsetX)}px`;
    tile.style.top = `${Math.round(clientY - offsetY)}px`;

    setReorderMode(true);
  }

  function moveDrag(clientX, clientY) {
    if (!draggingEl) return;

    draggingEl.style.left = `${Math.round(clientX - offsetX)}px`;
    draggingEl.style.top = `${Math.round(clientY - offsetY)}px`;

    const tiles = getTiles().filter((t) => t !== draggingEl);
    let best = null;
    let bestDist = Infinity;

    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = cx - clientX;
      const dy = cy - clientY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = t;
      }
    }

    if (!best) return;

    const br = best.getBoundingClientRect();
    const insertAfter =
      clientY > br.top + br.height / 2 || clientX > br.left + br.width / 2;

    if (insertAfter) {
      if (best.nextSibling !== placeholder)
        best.parentNode.insertBefore(placeholder, best.nextSibling);
    } else {
      if (best !== placeholder.nextSibling)
        best.parentNode.insertBefore(placeholder, best);
    }
  }

  function endDrag() {
    if (!draggingEl) return;

    // Move back into the grid at the placeholder position first (prevents a visible "jump")
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(draggingEl, placeholder);
      placeholder.remove();
      placeholder = null;
    } else {
      // Very defensive fallback
      gridEl.appendChild(draggingEl);
      placeholder = null;
    }

    draggingEl.classList.remove("nxDragging");
    draggingEl.style.position = "";
    draggingEl.style.left = "";
    draggingEl.style.top = "";
    draggingEl.style.width = "";
    draggingEl.style.height = "";
    draggingEl.style.zIndex = "";
    draggingEl.style.pointerEvents = "";

    const order = getTiles()
      .map((el) => String(el.dataset.gameId || ""))
      .filter(Boolean);
    saveLibraryOrder(order);

    draggingEl = null;
    gridEl.__nxJustDraggedAt = Date.now();
    setReorderMode(false);
    disableNoSelect();
  }

  gridEl.addEventListener("pointerdown", (e) => {
    if (typeof canReorder === "function" && !canReorder()) return;

    const tile = findTileFromTarget(e.target);
    if (!tile) return;

    if (e.target.closest("button")) return;

    enableNoSelect();
    e.preventDefault();

    startX = e.clientX;
    startY = e.clientY;

    clearPressTimer();
    pressTimer = setTimeout(() => {
      try { tile.setPointerCapture(e.pointerId); } catch {}
      startDrag(tile, e.clientX, e.clientY);
    }, LONG_PRESS_MS);
  });

  gridEl.addEventListener("pointermove", (e) => {
    if (!draggingEl && pressTimer) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
        clearPressTimer();
        disableNoSelect();
      }
      return;
    }
    if (draggingEl) moveDrag(e.clientX, e.clientY);
  });

  gridEl.addEventListener("pointerup", () => {
    clearPressTimer();
    if (draggingEl) endDrag();
    else disableNoSelect();
  });

  gridEl.addEventListener("pointercancel", () => {
    clearPressTimer();
    if (draggingEl) endDrag();
    else disableNoSelect();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clearPressTimer();
      if (draggingEl) endDrag();
      setReorderMode(false);
      disableNoSelect();
    }
  });
}

window.renderLibrary = async function () {
  ensureLibraryPlayButtonGlowStyles();
  ensureSearchBarStyles();
  await applyGridFromSettings();

  const grid = document.getElementById("libraryGrid");
  const empty = document.getElementById("libraryEmpty");
  const emptyTitle = document.getElementById("libraryEmptyTitle");
  const emptySub = document.getElementById("libraryEmptySub");
  const updatesBtn = document.getElementById("checkUpdatesBtn");
  const searchEl = document.getElementById("librarySearch");
  if (!grid) return;

  // ✅ Clamp columns to available width (fixes high-DPI button clipping)
  nxLibSetupResponsiveGrid(grid);

  let canReorderNow = true;
  attachLibraryReorder(grid, () => canReorderNow);

  updatesBtn && (updatesBtn.onclick = async () => {
    try {
      await window.api.checkUpdates?.();
      window.renderLibrary?.();
    } catch (err) {
      console.error(err);
    }
  });

  let store = { games: [] };
  let installed = {};
  try { store = await window.api.getStore(); } catch {}
  try { installed = await window.api.getInstalled(); } catch {}

  const storeById = new Map((store.games || []).map((g) => [String(g.id), g]));
  const installedIds = Object.keys(installed || {});

  let allGames = installedIds.map((id) => {
    const inst = installed[id] || {};
    const meta = storeById.get(String(id)) || {};

    const installedVersion = inst.version || "—";
    const latestVersion = meta.version || installedVersion;
    const upd = window.__updatesByGameId?.get(String(id)) || null;

    return {
      id: String(id),
      name: meta.name || inst.name || "Unknown Game",
      versionInstalled: installedVersion,
      versionLatest: latestVersion,
      category: meta.category || meta.categories || inst.category || [],
      description: meta.description || inst.description || "",
      image: meta.imageUrl || meta.image || meta.heroUrl || meta.hero || inst.image || "",
      playtimeSeconds: inst.playtimeSeconds || 0,
      lastPlayed: inst.lastPlayed || null,
      update: upd,
      developers: getGameDevelopers(meta, inst)
    };
  });

  allGames = sortLibraryGamesByOrder(allGames);

  const savedTerm = window.__librarySearchTerm || "";
  if (searchEl) {
    searchEl.value = savedTerm;
    searchEl.oninput = () => {
      window.__librarySearchTerm = searchEl.value || "";
      applyFilterAndRender();
    };
  }

  
  // --------------------------
  // ✅ Right-click: Move to position in Library
  // --------------------------
  function nxLibGetNormalizedOrder(ids) {
    const liveIds = (ids || []).map((x) => String(x));
    const set = new Set(liveIds);

    // keep only valid ids
    const order = loadLibraryOrder().map(String).filter((id) => set.has(id));

    // append missing ids (new installs) to the end
    for (const id of liveIds) {
      if (!order.includes(id)) order.push(id);
    }
    return order;
  }

  async function nxLibPromptMoveToPosition(game) {
    // Don't allow "move to position" while searching (matches drag-reorder behavior)
    const term = String(window.__librarySearchTerm || "").trim();
    if (term) {
      if (typeof window.showToast === "function") {
        window.showToast("Clear search to reorder your Library.", "info");
      } else if (typeof showToast === "function") {
        showToast("Clear search to reorder your Library.", "info");
      }
      return;
    }

    const order = nxLibGetNormalizedOrder(installedIds);
    const maxPos = Math.max(1, order.length || 1);
    const curPos = Math.max(1, order.indexOf(String(game.id)) + 1);

    const newPos = await openLibMoveToPositionModal(game.name || "Game", curPos, maxPos);
    if (newPos == null) return;

    const target = Math.max(1, Math.min(maxPos, Number(newPos)));
    const id = String(game.id);

    const curIdx = order.indexOf(id);
    if (curIdx >= 0) order.splice(curIdx, 1);
    order.splice(target - 1, 0, id);

    saveLibraryOrder(order);

    // Recompute order and re-render
    allGames = sortLibraryGamesByOrder(allGames);
    applyFilterAndRender();
  }

function renderTiles(list, showHint) {
    // If we repeatedly render the same tile list (common during download progress
    // events), avoid touching the DOM so hover/transition animations don't restart.
    const key =
      `${window.__nxReorderMode ? 1 : 0}|${showHint ? 1 : 0}|` +
      list.map((g) => `${g.id}:${g.update ? 1 : 0}`).join(",");
    if (grid.dataset.nxKey === key) return;
    grid.dataset.nxKey = key;

    grid.innerHTML = "";

// Show the reorder hint in the header-left area, but slightly lower than the title.
// This avoids the wasted space caused by placing it below the entire header row.
const storeTop = document.querySelector(".storeTop");
const headerLeft =
  (storeTop && storeTop.children && storeTop.children[0]) ||
  document.querySelector(".storeTop > div") ||
  document.querySelector(".simpleTop > div");

// remove any old hint (from previous renders / placements)
try { document.querySelectorAll(".nxReorderHint").forEach((el) => el.remove()); } catch {}

if (showHint) {
  const hintEl = makeLibraryReorderHintEl();
  hintEl.classList.add("nxReorderHintHeaderSlot");

  if (headerLeft) {
    headerLeft.appendChild(hintEl);
  } else {
    // Fallback: show at the top of the grid
    grid.appendChild(hintEl);
  }
}


    for (const game of list) {
      const imgUrl = toImg(game.image);
      const hasUpdate = !!game.update;

      const tile = document.createElement("div");
      tile.className = "gameTile";
      tile.dataset.gameId = String(game.id);

      tile.innerHTML = `
        <div class="tileImage" style="background-image:url('${imgUrl}')"></div>
        <div class="tileOverlay"></div>

        <div class="tileInfo">
          <div class="tileName">${game.name}</div>
          <div class="tileBadge">v${game.versionInstalled}</div>

          ${
            hasUpdate
              ? `<div class="libMeta" style="margin-top:6px;">Update available → v${game.update.toVersion}</div>`
              : `<div class="libMeta" style="margin-top:6px;">
                   Playtime: ${formatPlaytime(game.playtimeSeconds)}
                   <span class="dotSep">•</span>
                   Last played: ${formatLastPlayed(game.lastPlayed)}
                 </div>`
          }

          <div class="libActions">
            ${
              hasUpdate
                ? `<button class="libBtnPrimary" data-act="update">Update</button>
                   <button class="libBtnGhost" data-act="play">Play</button>
                   <button class="libBtnGhost" data-act="changelog">Changelog</button>`
                : `<button class="libBtnPrimary" data-act="play">Play</button>
                   <button class="libBtnGhost" data-act="changelog">Changelog</button>`
            }
          </div>
        </div>
      `;

      const goDetails = (e) => {
        e && e.stopPropagation();
        window.__rememberPageScroll?.("library");
        window.__restoreScrollForPage = "library";
        window.__previousPage = "library";
        window.__selectedGame = { id: game.id };
        window.loadPage("details");
      };

      const playBtn = tile.querySelector('[data-act="play"]');
      if (playBtn) {
        playBtn.onclick = async (e) => {
          e.stopPropagation();
          await window.api.launchGame(game.id);
        };
      }

      const changelogBtn = tile.querySelector('[data-act="changelog"]');
      if (changelogBtn) {
        changelogBtn.onclick = async (e) => {
          e.stopPropagation();
          changelogBtn.disabled = true;
          try {
            const res = await window.api.getChangelog(game.id);
            if (!res?.ok) throw new Error(res?.error || "Failed to fetch changelog");
            const entries = normalizeChangelogEntries(res.data);
            openChangelogModal(game.name, entries);
          } catch (err) {
            console.error(err);
            if (typeof window.showToast === "function") {
              window.showToast("Failed to open changelog.", "error");
            }
          } finally {
            changelogBtn.disabled = false;
          }
        };
      }

      const updateBtn = tile.querySelector('[data-act="update"]');
      if (updateBtn) {
        updateBtn.onclick = async (e) => {
          e.stopPropagation();
          updateBtn.disabled = true;
          try {
            await window.api.queueUpdate(game.id);
            window.loadPage("downloads");
          } catch (err) {
            console.error(err);
            updateBtn.disabled = false;
          }
        };
      }

      
      // Right-click: move to a specific position in the Library order
      tile.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Don't hijack right-clicks on buttons (Play/Update/etc.)
        if (e.target && e.target.closest && e.target.closest("button")) return;
        nxLibPromptMoveToPosition(game);
      });

tile.onclick = (e) => {
        const t = grid.__nxJustDraggedAt || 0;
        if (t && Date.now() - t < 350) return;
        goDetails(e);
      };

      grid.appendChild(tile);
    }
  }

  function applyFilterAndRender() {
  const term = String(window.__librarySearchTerm || "");

  // Optional UX: disable reorder while searching
  canReorderNow = !String(term || "").trim();

  let list = allGames;

  if (String(term || "").trim()) {
    list = allGames.filter((g) => matchesLibrarySearch(g, term));
  }

  const hasInstalled = allGames.length > 0;
  const hasVisible = list.length > 0;

  if (!hasInstalled) {
    emptyTitle && (emptyTitle.textContent = "No games installed");
    emptySub && (emptySub.textContent = "Install something from the Store first.");
    empty && (empty.style.display = "");
    grid && (grid.style.display = "none");
    return;
  }

  if (!hasVisible) {
    emptyTitle && (emptyTitle.textContent = "No results");
    emptySub && (emptySub.textContent = "Try a different search.");
    empty && (empty.style.display = "");
    grid && (grid.style.display = "none");
    return;
  }

  empty && (empty.style.display = "none");
  grid && (grid.style.display = "");

  const showHint = !term && list.length >= 2;
  renderTiles(list, showHint);
}


  applyFilterAndRender();
};