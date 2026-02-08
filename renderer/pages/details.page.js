// renderer/pages/details.page.js
(function () {
  function attachAutoGrowTextarea(el, minHeightPx) {
    if (!el || el.__nxAutoGrowBound) return;
    el.__nxAutoGrowBound = true;

    // prevent internal scrollbar; let the page scroll instead
    el.style.overflowY = "hidden";
    el.style.resize = "none";

    const minH = Number(minHeightPx || 0);

    const grow = () => {
      try {
        el.style.height = "auto";
        const next = Math.max(minH || 0, el.scrollHeight || 0);
        el.style.height = next + "px";
      } catch {}
    };

    el.addEventListener("input", grow);
    // also grow when text is set programmatically (focus/edit)
    requestAnimationFrame(grow);
    setTimeout(grow, 0);
  }

  function bindDetailsEscOnce() {
    if (window.__nxDetailsEscBound) return;
    window.__nxDetailsEscBound = true;

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (window.__currentPage !== "details") return;

      const prev = window.__previousPage || "library";
      window.loadPage(prev);
    });
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

  function safeArray(x) {
    if (!x) return [];
    return Array.isArray(x) ? x : [x];
  }

  function formatBytes(bytes) {
    const b = Number(bytes || 0);
    if (!Number.isFinite(b) || b <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let n = b;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    const dp = i <= 1 ? 0 : 1;
    return `${n.toFixed(dp)} ${units[i]}`;
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
    return isUrl(s) ? String(s) : `assets/${s}`;
  }

  function normalizeZipUrl(url) {
    // fixes size fetch if someone used github blob links by mistake
    return normalizeGithubUrl(url);
  }

  function getDevelopers(meta, inst) {
    const raw =
      meta?.developers ??
      meta?.developer ??
      inst?.developers ??
      inst?.developer ??
      [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.map((x) => String(x || "").trim()).filter(Boolean);
  }

  function getImages(meta) {
    const raw = meta?.images ?? meta?.screenshots ?? [];
    return safeArray(raw)
      .map((x) => String(x || "").trim())
      .filter(Boolean);
  }

  function getInputSupport(meta, inst) {
    const fromMeta =
      meta?.inputSupport ??
      meta?.inputs ??
      meta?.input ??
      meta?.controls ??
      meta?.support ??
      null;

    const fromInst =
      inst?.inputSupport ??
      inst?.inputs ??
      inst?.input ??
      inst?.controls ??
      inst?.support ??
      null;

    const raw = fromMeta ?? fromInst;

    const out = {
      keyboardMouse: false,
      controller: false,
      touch: false,
      specified: false
    };

    if (raw == null) return out;
    out.specified = true;

    if (Array.isArray(raw)) {
      const items = raw.map((x) => String(x || "").toLowerCase().trim());
      const has = (k) => items.includes(k);

      if (
        has("keyboardmouse") ||
        has("keyboard_mouse") ||
        has("keyboard-mouse") ||
        has("keyboard") ||
        has("mouse") ||
        has("kbm")
      ) out.keyboardMouse = true;

      if (has("controller") || has("gamepad") || has("pad") || has("joystick")) out.controller = true;
      if (has("touch") || has("touchscreen")) out.touch = true;

      return out;
    }

    if (typeof raw === "object") {
      const obj = raw || {};
      const pick = (...keys) => {
        for (const k of keys) {
          if (k in obj) return !!obj[k];
        }
        return false;
      };

      out.keyboardMouse = pick("keyboardMouse", "keyboard_mouse", "kbm", "keyboard", "mouse");
      out.controller = pick("controller", "gamepad", "pad");
      out.touch = pick("touch", "touchscreen");
      return out;
    }

    const s = String(raw || "").toLowerCase();
    if (s.includes("kbm") || s.includes("keyboard") || s.includes("mouse")) out.keyboardMouse = true;
    if (s.includes("controller") || s.includes("gamepad")) out.controller = true;
    if (s.includes("touch")) out.touch = true;

    return out;
  }

  // ✅ NEW: read download size from store meta (if provided)
  function getDownloadSizeFromMeta(meta) {
    const candidates = [
      meta?.fileSizeBytes,
      meta?.downloadSizeBytes,
      meta?.sizeBytes,
      meta?.zipSizeBytes,
      meta?.fileSize,
      meta?.downloadSize,
      meta?.size
    ];

    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function toast(msg, kind = "info") {
    try {
      window.showToast?.(msg, kind);
    } catch {
      // ignore
    }
  }

  function timeAgo(iso) {
    const t = new Date(iso || 0).getTime();
    if (!t || Number.isNaN(t)) return "";
    const now = Date.now();
    const sec = Math.max(1, Math.floor((now - t) / 1000));
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    const mo = Math.floor(day / 30);
    if (mo < 12) return `${mo}mo ago`;
    const yr = Math.floor(mo / 12);
    return `${yr}y ago`;
  }


  // -------------------------------------------------
  // ✅ Install/download phase tracking (shared behavior with Store page)
  // -------------------------------------------------
  // We store phases on window so Store + Details can share the same state.
  // phase can be: "downloading" | "installing" | ""
  function getPhaseStore() {
    if (!window.__nxPhaseByGameId) window.__nxPhaseByGameId = new Map();
    return window.__nxPhaseByGameId;
  }

  function setPhaseForGame(gameId, phase) {
    const gid = String(gameId || "");
    if (!gid) return;
    const store = getPhaseStore();
    if (!phase) store.delete(gid);
    else store.set(gid, String(phase));
  }

  function getPhaseForGame(gameId) {
    const gid = String(gameId || "");
    if (!gid) return "";
    const store = getPhaseStore();
    return String(store.get(gid) || "");
  }

  function updateDetailsPhaseUI(gameId) {
    const root = document.getElementById("page");
    if (!root) return;

    const cur = String(root.dataset?.nxDetailsGameId || "");
    if (!cur) return;

    const gid = String(gameId || cur);
    if (gid !== cur) return;

    const phase = getPhaseForGame(cur);

    const primaryBtn = document.getElementById("detailsPrimaryBtn");
    if (primaryBtn) {
      const statusText = String(document.getElementById("detailsInfoStatusValue")?.textContent || "")
        .trim()
        .toLowerCase();
      const isInstalled = statusText === "installed";

      if (!primaryBtn.dataset.nxDefaultText) {
        const t = String(primaryBtn.textContent || "").trim();
        if (t !== "Downloading…" && t !== "Installing…") primaryBtn.dataset.nxDefaultText = t || (isInstalled ? "Play Now" : "Install");
      }
      const defaultText = String(primaryBtn.dataset.nxDefaultText || (isInstalled ? "Play Now" : "Install"));

      if (!isInstalled && (phase === "downloading" || phase === "installing")) {
        primaryBtn.disabled = true;
        primaryBtn.textContent = phase === "installing" ? "Installing…" : "Downloading…";
      } else {
        primaryBtn.disabled = false;
        if (primaryBtn.textContent !== defaultText) primaryBtn.textContent = defaultText;
      }
    }

    const updateBtn = document.getElementById("detailsUpdateBtn");
    if (updateBtn) {
      if (!updateBtn.dataset.nxDefaultText) {
        const t = String(updateBtn.textContent || "").trim();
        if (t !== "Downloading…" && t !== "Installing…") updateBtn.dataset.nxDefaultText = t || "Update";
      }
      const defaultText = String(updateBtn.dataset.nxDefaultText || "Update");

      if (phase === "downloading" || phase === "installing") {
        updateBtn.disabled = true;
        updateBtn.textContent = phase === "installing" ? "Installing…" : "Downloading…";
      } else {
        updateBtn.disabled = false;
        if (updateBtn.textContent !== defaultText) updateBtn.textContent = defaultText;
      }
    }
  }

  function bindDetailsPhaseEventsOnce() {
    if (window.__nxDetailsPhaseEventsBound) return;
    window.__nxDetailsPhaseEventsBound = true;

    try {
      if (typeof window.api?.onDownloadUpdated === "function") {
        window.api.onDownloadUpdated((d) => {
          const gid = String(d?.gameId || "");
          if (!gid) return;

          const st = String(d?.status || "").toLowerCase();

          if (st === "downloading") setPhaseForGame(gid, "downloading");
          else if (st === "completed") setPhaseForGame(gid, "installing");
          else if (st === "error" || st === "canceled") setPhaseForGame(gid, "");

          updateDetailsPhaseUI(gid);
        });
      }

      if (typeof window.api?.onInstallFinished === "function") {
        window.api.onInstallFinished((d) => {
          const gid = String(d?.gameId || "");
          if (!gid) return;

          setPhaseForGame(gid, "");
          updateDetailsPhaseUI(gid);

          // Refresh installed status/version without rebuilding the whole UI unnecessarily
          try {
            const root = document.getElementById("page");
            const cur = String(root?.dataset?.nxDetailsGameId || "");
            if (cur && cur === gid) window.renderDetails?.();
          } catch {}
        });
      }
    } catch (e) {
      console.warn("[Details] Phase event bind failed:", e);
    }
  }

  
  // -------------------------------------------------
  // ✅ Per-game "Check for updates" state + UI
  // -------------------------------------------------
  // We keep an in-flight flag per game so the button can stay stable even if
  // the page re-renders due to store/updates events.
  function getCheckUpdatesStore() {
    if (!window.__nxCheckUpdatesInFlightByGameId) window.__nxCheckUpdatesInFlightByGameId = new Map();
    return window.__nxCheckUpdatesInFlightByGameId;
  }

  function setCheckUpdatesInFlight(gameId, inFlight) {
    const gid = String(gameId || "");
    if (!gid) return;
    const m = getCheckUpdatesStore();
    if (inFlight) m.set(gid, Date.now());
    else m.delete(gid);
  }

  function isCheckUpdatesInFlight(gameId) {
    const gid = String(gameId || "");
    if (!gid) return false;
    const m = getCheckUpdatesStore();
    return m.has(gid);
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

  function updateDetailsCheckUpdatesUI(gameId) {
    const root = document.getElementById("page");
    if (!root) return;

    const cur = String(root.dataset?.nxDetailsGameId || "");
    if (!cur) return;

    const gid = String(gameId || cur);
    if (gid !== cur) return;

    const btn = document.getElementById("detailsCheckUpdatesBtn");
    if (!btn) return;

    const checking = isCheckUpdatesInFlight(cur);

    if (!btn.dataset.nxDefaultText) btn.dataset.nxDefaultText = "Check for updates";
    const def = String(btn.dataset.nxDefaultText || "Check for updates");

    btn.disabled = checking;
    setTextIfChanged(btn, checking ? "Checking…" : def);
  }

  async function checkUpdatesForGame(game) {
    const gid = String(game?.id || "");
    if (!gid) return;

    if (!navigator.onLine) {
      toast("You're offline. Can't check for updates.", "error");
      return;
    }

    if (isCheckUpdatesInFlight(gid)) return;

    if (typeof window.api?.refreshStore !== "function" || typeof window.api?.getInstalled !== "function") {
      toast("Update check isn't available in this build.", "error");
      return;
    }

    setCheckUpdatesInFlight(gid, true);
    updateDetailsCheckUpdatesUI(gid);

    try {
      // Refresh remote store + recompute updates in main (without the global "No updates" toast)
      const store = await window.api.refreshStore();
      const installed = await window.api.getInstalled();

      const inst = installed?.[gid] || null;
      const meta = (store?.games || []).find((g) => String(g?.id) === gid) || null;

      if (!inst) {
        toast("Install this game first to check for updates.", "info");
        return;
      }

      const fromV = String(inst?.version || "");
      const toV = String(meta?.version || fromV);

      const cmp = compareSemver(toV, fromV);

      if (cmp > 0) {
        toast(`Update available: ${game?.name || "Game"} (${fromV} → ${toV})`, "success");
      } else {
        toast(`✓ ${game?.name || "Game"} is up to date. (${fromV || toV || "—"})`, "success");
      }
    } catch (e) {
      console.error(e);
      toast("Failed to check for updates.", "error");
    } finally {
      setCheckUpdatesInFlight(gid, false);
      updateDetailsCheckUpdatesUI(gid);

      // Ensure Update button appears/disappears if needed
      try { window.renderDetails?.(); } catch {}
    }
  }

// -------------------------------------------------
  // ✅ FIX: Details right-column spacing
  // -------------------------------------------------
  const DETAILS_SPACING_STYLE_ID = "nxDetailsSpacingStyle";
  function ensureDetailsSpacingStyles() {
    if (document.getElementById(DETAILS_SPACING_STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = DETAILS_SPACING_STYLE_ID;
    s.textContent = `
      .detailsRight{
        display:flex;
        flex-direction:column;
        gap: 12px;
      }
      .detailsRight > button{
        width:100%;
        margin:0 !important;
      }
      .detailsRight > .infoCard{
        margin:0 !important;
      }
    `;
    document.head.appendChild(s);
  }

  // -------------------------------------------------
  // ✅ Remote download size cache (prevents flashing on frequent re-renders)
  // -------------------------------------------------
  function getRemoteSizeCacheStore() {
    if (!window.__nxRemoteSizeCache) {
      window.__nxRemoteSizeCache = {
        bytesByUrl: Object.create(null),
        inflightByUrl: Object.create(null)
      };
    }
    return window.__nxRemoteSizeCache;
  }

  async function getRemoteFileSizeCached(zipUrl) {
    const url = normalizeZipUrl(zipUrl);
    if (!url) return 0;

    const store = getRemoteSizeCacheStore();

    const cached = Number(store.bytesByUrl[url] || 0);
    if (cached > 0) return cached;

    if (store.inflightByUrl[url]) {
      try {
        const v = await store.inflightByUrl[url];
        return Number(v || 0);
      } catch {
        return 0;
      }
    }

    if (typeof window.api?.getRemoteFileSize !== "function") return 0;

    store.inflightByUrl[url] = (async () => {
      try {
        const bytes = Number(await window.api.getRemoteFileSize(url)) || 0;
        if (bytes > 0) store.bytesByUrl[url] = bytes;
        return bytes;
      } finally {
        delete store.inflightByUrl[url];
      }
    })();

    try {
      const b = await store.inflightByUrl[url];
      return Number(b || 0);
    } catch {
      return 0;
    }
  }

  function setTextIfChanged(el, txt) {
    if (!el) return;
    const next = String(txt ?? "");
    if (el.textContent !== next) el.textContent = next;
  }

  // -------------------------------------------------
  // ✅ Auto-update toggle card
  // -------------------------------------------------
  const AUTO_STYLE_ID = "nxAutoUpdateStyle";
  function ensureAutoUpdateStyles() {
    if (document.getElementById(AUTO_STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = AUTO_STYLE_ID;
    s.textContent = `
      .nxAutoCard{ padding: 14px 16px; }
      .nxAutoRow{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .nxAutoTitle{
        font-weight: 950;
        letter-spacing:.2px;
        color: rgba(255,255,255,.92);
        font-size: 13.5px;
      }
      .nxAutoSub{
        margin-top: 4px;
        color: rgba(255,255,255,.60);
        font-weight: 750;
        font-size: 12.5px;
        line-height: 1.35;
      }
      .nxSwitch{ position: relative; width: 48px; height: 28px; flex: 0 0 auto; }
      .nxSwitch input{ opacity:0; width:0; height:0; }
      .nxSlider{
        position:absolute; inset:0;
        border-radius: 999px;
        background: rgba(255,255,255,.10);
        border: 1px solid rgba(255,255,255,.12);
        transition: background .16s ease, border-color .16s ease, box-shadow .16s ease;
        cursor:pointer;
      }
      .nxSlider:before{
        content:"";
        position:absolute;
        left: 3px; top: 3px;
        width: 22px; height: 22px;
        border-radius: 999px;
        background: rgba(255,255,255,.80);
        transition: transform .16s ease, background .16s ease;
      }
      .nxSwitch input:checked + .nxSlider{
        background: rgba(124,92,255,.28);
        border-color: rgba(124,92,255,.34);
        box-shadow: 0 14px 34px rgba(124,92,255,.10);
      }
      .nxSwitch input:checked + .nxSlider:before{
        transform: translateX(20px);
        background: rgba(255,255,255,.92);
      }
      .nxSwitch input:disabled + .nxSlider{
        opacity: .55;
        cursor: default;
        box-shadow:none;
      }
    `;
    document.head.appendChild(s);
  }

  function renderAutoUpdateCard(gameId, enabled, installed) {
    ensureAutoUpdateStyles();
    const hint = installed
      ? "Always keep this game updated"
      : "Enable now — it will apply after you install";

    return `
      <div class="infoCard nxAutoCard">
        <div class="nxAutoRow">
          <div>
            <div class="nxAutoTitle">Auto-update</div>
            <div class="nxAutoSub">${hint}</div>
          </div>

          <label class="nxSwitch" title="Always keep updated">
            <input id="detailsAutoUpdateToggle" type="checkbox" ${enabled ? "checked" : ""}>
            <span class="nxSlider"></span>
          </label>
        </div>
      </div>
    `;
  }

  // -------------------------------------------------
  // ✅ Input support chips UI
  // -------------------------------------------------
  const INPUT_STYLE_ID = "nxInputSupportStyle";
  function ensureInputSupportStyles() {
    if (document.getElementById(INPUT_STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = INPUT_STYLE_ID;
    s.textContent = `
      .nxInputCard{ padding: 16px; }
      .nxInputTop{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .nxInputTitle{
        font-weight: 950;
        letter-spacing: .2px;
        color: rgba(255,255,255,.92);
        font-size: 13.5px;
      }
      .nxInputHint{
        color: rgba(255,255,255,.55);
        font-weight: 800;
        font-size: 12px;
      }
      .nxChips{ display:flex; flex-wrap: wrap; gap: 10px; }
      .nxChip{
        display:inline-flex;
        align-items:center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.05);
        color: rgba(255,255,255,.78);
        font-weight: 900;
        font-size: 12.5px;
        letter-spacing: .1px;
        user-select:none;
      }
      .nxChip svg{
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
        opacity: .95;
      }
      .nxChip.on{
        background: rgba(124,92,255,.18);
        border-color: rgba(124,92,255,.26);
        color: rgba(255,255,255,.92);
        box-shadow: 0 14px 34px rgba(124,92,255,.10);
      }
      .nxChip.off{
        background: rgba(255,255,255,.04);
        border-color: rgba(255,255,255,.08);
        color: rgba(255,255,255,.45);
        filter: grayscale(.2);
      }
      .nxChip.unknown{
        background: rgba(255,255,255,.04);
        border-color: rgba(255,255,255,.10);
        color: rgba(255,255,255,.60);
      }
    `;
    document.head.appendChild(s);
  }

  function iconKeyboard() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"></path>
        <path d="M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01"></path>
        <path d="M7 15h10"></path>
      </svg>
    `;
  }

  function iconController() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 12h10"></path>
        <path d="M9 10v4"></path>
        <path d="M15.5 11.5h.01"></path>
        <path d="M17.5 12.5h.01"></path>
        <path d="M7.5 7.5h9A5.5 5.5 0 0 1 22 13v1.2a3 3 0 0 1-5.2 2.1L15 14.5h-6l-1.8 1.8A3 3 0 0 1 2 14.2V13a5.5 5.5 0 0 1 5.5-5.5Z"></path>
      </svg>
    `;
  }

  function iconTouch() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 11v-1a2 2 0 0 1 4 0v1"></path>
        <path d="M11 11V8a2 2 0 0 1 4 0v3"></path>
        <path d="M15 12V9a2 2 0 1 1 4 0v6"></path>
        <path d="M7 11v7a4 4 0 0 0 4 4h2a6 6 0 0 0 6-6v-1"></path>
      </svg>
    `;
  }

  function renderInputSupportCard(sup) {
    ensureInputSupportStyles();

    const items = [
      { key: "keyboardMouse", label: "Keyboard & Mouse", icon: iconKeyboard() },
      { key: "controller", label: "Controller", icon: iconController() },
      { key: "touch", label: "Touch", icon: iconTouch() }
    ];

    if (!sup || !sup.specified) {
      return `
        <div class="infoCard nxInputCard">
          <div class="nxInputTop">
            <div class="nxInputTitle">Input support</div>
            <div class="nxInputHint">Not specified</div>
          </div>
          <div class="nxChips">
            ${items
              .map(
                (it) => `
              <div class="nxChip unknown" title="Not specified">
                ${it.icon}
                <span>${it.label}</span>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    }

    return `
      <div class="infoCard nxInputCard">
        <div class="nxInputTop">
          <div class="nxInputTitle">Input support</div>
          <div class="nxInputHint">Supported</div>
        </div>

        <div class="nxChips">
          ${items
            .map((it) => {
              const on = !!sup[it.key];
              return `
              <div class="nxChip ${on ? "on" : "off"}" title="${on ? "Supported" : "Not supported"}">
                ${it.icon}
                <span>${it.label}</span>
              </div>
            `;
            })
            .join("")}
        </div>
      </div>
    `;
  }

  // --------------------------
  // ✅ Modals (uninstall / reset / disk warning)
  // --------------------------
  const MODAL_STYLE_ID = "nxUninstallModalStyle";
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
        background: rgba(255,60,90,.14);
        border: 1px solid rgba(255,60,90,.22);
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
        color: rgba(255,255,255,.70);
        font-weight:650;
        line-height:1.45;
        font-size:13.5px;
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

      .nxBtnDanger{
        background: rgba(255,60,90,.22);
        border: 1px solid rgba(255,60,90,.22);
      }
      .nxBtnDanger:hover{ background: rgba(255,60,90,.28); }
      .nxBtnDanger:active{ filter: brightness(.98); }

      .nxBtnPrimary{
        background: rgba(124,92,255,.85);
        border: 1px solid rgba(124,92,255,.22);
      }
      .nxBtnPrimary:hover{ background: rgba(124,92,255,.95); }

      @keyframes nxFadeIn{
        from{ opacity:0; transform: translateY(8px); }
        to{ opacity:1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(s);
  }

  function confirmUninstall(gameName) {
    ensureModalStyles();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "nxModalOverlay";

      overlay.innerHTML = `
        <div class="nxModalCard" role="dialog" aria-modal="true">
          <div class="nxModalTop">
            <div class="nxModalIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 9v5"></path>
                <path d="M12 17h.01"></path>
                <path d="M10.3 3.6 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"></path>
              </svg>
            </div>
            <div style="flex:1;">
              <div class="nxModalTitle">Uninstall ${gameName}?</div>
              <div class="nxModalMsg">
                This will remove the game from your computer. You can install it again later.
              </div>
            </div>
          </div>

          <div class="nxModalDivider"></div>

          <div class="nxModalActions">
            <button class="nxBtn" data-act="cancel" type="button">Cancel</button>
            <button class="nxBtn nxBtnDanger" data-act="ok" type="button">Uninstall</button>
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

  function confirmResetPlaytime(gameName) {
    ensureModalStyles();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "nxModalOverlay";

      overlay.innerHTML = `
        <div class="nxModalCard" role="dialog" aria-modal="true">
          <div class="nxModalTop">
            <div class="nxModalIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 8v4"></path>
                <path d="M12 16h.01"></path>
                <path d="M3 12a9 9 0 1 0 3-6.7"></path>
                <path d="M3 4v5h5"></path>
              </svg>
            </div>
            <div style="flex:1;">
              <div class="nxModalTitle">Reset playtime for ${gameName}?</div>
              <div class="nxModalMsg">
                This will set playtime back to 0. You can’t undo this.
              </div>
            </div>
          </div>

          <div class="nxModalDivider"></div>

          <div class="nxModalActions">
            <button class="nxBtn" data-act="cancel" type="button">Cancel</button>
            <button class="nxBtn nxBtnDanger" data-act="ok" type="button">Reset</button>
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

  function confirmLowDiskSpace({ gameName, requiredBytes, freeBytes, downloadBytes, installPath }) {
    ensureModalStyles();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "nxModalOverlay";

      const req = formatBytes(requiredBytes);
      const free = formatBytes(freeBytes);
      const dl = formatBytes(downloadBytes);

      overlay.innerHTML = `
        <div class="nxModalCard" role="dialog" aria-modal="true">
          <div class="nxModalTop">
            <div class="nxModalIcon" aria-hidden="true" style="background: rgba(255,184,0,.14); border-color: rgba(255,184,0,.22);">
              <svg viewBox="0 0 24 24">
                <path d="M12 9v5"></path>
                <path d="M12 17h.01"></path>
                <path d="M10.3 3.6 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z"></path>
              </svg>
            </div>
            <div style="flex:1;">
              <div class="nxModalTitle">Not enough disk space</div>
              <div class="nxModalMsg">
                <b>${gameName}</b> may not have enough free space to install safely.
                <div style="margin-top:10px; font-weight:800; color: rgba(255,255,255,.78);">
                  Required (estimate): <span style="color:#fff;">${req}</span><br/>
                  Free space: <span style="color:#fff;">${free}</span><br/>
                  Download size: <span style="color:#fff;">${dl}</span>
                  ${installPath ? `<br/>Install drive: <span style="color:#fff;">${String(installPath)}</span>` : ``}
                </div>
                <div style="margin-top:10px; color: rgba(255,255,255,.65); font-weight:700;">
                  Tip: free up some space, then try again.
                </div>
              </div>
            </div>
          </div>

          <div class="nxModalDivider"></div>

          <div class="nxModalActions">
            <button class="nxBtn" data-act="cancel" type="button">Cancel</button>
            <button class="nxBtn nxBtnPrimary" data-act="ok" type="button">Install anyway</button>
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

  // -------------------------------------------------
  // ✅ Disk space preflight
  // -------------------------------------------------
  async function preflightDiskSpace(storeGame) {
    const canCheckFree = typeof window.api?.getDiskFreeBytes === "function";
    const canGetRemote = typeof window.api?.getRemoteFileSize === "function";
    if (!canCheckFree) return true;

    try {
      const rawZip =
        storeGame?.zipUrl ??
        storeGame?.url ??
        storeGame?.downloadUrl ??
        null;

      if (!rawZip) return true;

      const zipUrl = normalizeZipUrl(rawZip);

      let downloadBytes =
        Number(storeGame?.fileSizeBytes) ||
        Number(storeGame?.downloadSizeBytes) ||
        Number(storeGame?.sizeBytes) ||
        Number(storeGame?.fileSize) ||
        0;

      if ((!downloadBytes || downloadBytes <= 0) && canGetRemote) {
        downloadBytes = Number(await getRemoteFileSizeCached(zipUrl)) || 0;
      }

      if (!downloadBytes || downloadBytes <= 0) return true;

      const installPath =
        (typeof window.api?.getInstallPath === "function" ? await window.api.getInstallPath() : null) ||
        (typeof window.api?.getInstallDir === "function" ? await window.api.getInstallDir() : null) ||
        "";

      const freeBytes = Number(await window.api.getDiskFreeBytes(installPath)) || 0;
      if (!freeBytes || freeBytes <= 0) return true;

      const SAFETY = 200 * 1024 * 1024;
      const requiredBytes = Math.ceil(downloadBytes * 1.75 + SAFETY);

      if (freeBytes >= requiredBytes) return true;

      const ok = await confirmLowDiskSpace({
        gameName: storeGame?.name || "This game",
        requiredBytes,
        freeBytes,
        downloadBytes,
        installPath
      });

      return !!ok;
    } catch (e) {
      console.error("Disk preflight failed:", e);
      return true;
    }
  }

  // -------------------------------------------------
  // ✅ Lightbox styles + logic (unchanged)
  // -------------------------------------------------
  const LIGHTBOX_STYLE_ID = "nxLightboxStyle";
  function ensureLightboxStyles() {
    if (document.getElementById(LIGHTBOX_STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = LIGHTBOX_STYLE_ID;
    s.textContent = `
      .shot{
        position: relative;
        overflow: hidden;
        transform: translateZ(0);
        border-radius: 22px;

        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
        background-color: rgba(0,0,0,.22);

        cursor: pointer;
        transition: transform .16s ease, filter .16s ease, box-shadow .16s ease;
        will-change: transform;
        outline: none;
      }
      .shot:hover{
        transform: translateY(-2px) scale(1.02);
        filter: brightness(1.06);
        box-shadow: 0 16px 40px rgba(0,0,0,.35);
      }
      .shot:active{ transform: translateY(0) scale(.99); }
      .shot:focus-visible{
        box-shadow: 0 0 0 3px rgba(124,92,255,.28), 0 16px 40px rgba(0,0,0,.25);
      }

      .nxLbOverlay{
        position:fixed; inset:0; z-index:99999;
        background: rgba(0,0,0,.68);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        display:grid;
        place-items:center;
        padding: 22px;

        opacity: 0;
        animation: nxLbOverlayIn .18s ease forwards;
      }

      .nxLbCard{
        width: min(1100px, 94vw);
        height: min(680px, 84vh);
        border-radius: 22px;
        background: rgba(18,20,30,.92);
        border: 1px solid rgba(255,255,255,.10);
        box-shadow: 0 40px 120px rgba(0,0,0,.65);
        overflow: hidden;
        position: relative;
        display:flex;
        flex-direction:column;

        transform: translateY(10px) scale(.985);
        opacity: 0;
        animation: nxLbCardIn .22s cubic-bezier(.2,.9,.2,1) forwards;
        animation-delay: .03s;
      }

      .nxLbOverlay.isClosing{
        animation: nxLbOverlayOut .16s ease forwards;
      }
      .nxLbOverlay.isClosing .nxLbCard{
        animation: nxLbCardOut .18s cubic-bezier(.2,.9,.2,1) forwards;
      }

      .nxLbTop{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 12px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255,255,255,.06);
      }

      .nxLbCount{
        color: rgba(255,255,255,.72);
        font-weight: 850;
        font-size: 13px;
        letter-spacing: .2px;
      }

      .nxLbClose{
        border:none;
        cursor:pointer;
        border-radius: 14px;
        padding: 10px 12px;
        background: rgba(255,255,255,.08);
        color:#fff;
        font-weight: 900;
        transition: transform .12s ease, background .16s ease, filter .16s ease;
      }
      .nxLbClose:hover{ background: rgba(255,255,255,.12); transform: translateY(-1px); }
      .nxLbClose:active{ transform: translateY(0) scale(.98); filter: brightness(1.05); }

      .nxLbStage{
        position: relative;
        flex:1;
        display:grid;
        place-items:center;
        background: rgba(0,0,0,.14);
      }

      .nxLbImg{
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        user-select:none;
        -webkit-user-drag:none;

        opacity: 0;
        transform: scale(.988);
        transition: opacity .20s ease, transform .20s ease;
        will-change: opacity, transform;
      }
      .nxLbImg.isReady{
        opacity: 1;
        transform: scale(1);
      }

      .nxLbNav{
        position:absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 44px;
        height: 44px;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.08);
        display:grid;
        place-items:center;
        cursor:pointer;
        transition: transform .12s ease, background .16s ease, filter .16s ease;
      }
      .nxLbNav:hover{
        background: rgba(255,255,255,.12);
        transform: translateY(-50%) scale(1.03);
      }
      .nxLbNav:active{
        transform: translateY(-50%) scale(.98);
        filter: brightness(1.05);
      }
      .nxLbNav:disabled{
        opacity:.5;
        cursor:default;
        transform: translateY(-50%);
      }

      .nxLbPrev{ left: 14px; }
      .nxLbNext{ right: 14px; }

      .nxLbNav svg{
        width: 18px; height: 18px;
        stroke: rgba(255,255,255,.92);
        fill: none;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events:none;
      }

      @keyframes nxLbOverlayIn{ from{ opacity: 0; } to{ opacity: 1; } }
      @keyframes nxLbCardIn{ from{ opacity:0; transform: translateY(12px) scale(.985); } to{ opacity:1; transform: translateY(0) scale(1); } }

      @keyframes nxLbOverlayOut{ from{ opacity: 1; } to{ opacity: 0; } }
      @keyframes nxLbCardOut{ from{ opacity:1; transform: translateY(0) scale(1); } to{ opacity:0; transform: translateY(10px) scale(.985); } }
    `;
    document.head.appendChild(s);
  }

  function openLightbox(urls, startIndex) {
    ensureLightboxStyles();

    const list = (urls || []).map(toImg).filter(Boolean);
    if (!list.length) return;

    let idx = Math.max(0, Math.min(list.length - 1, Number(startIndex || 0)));
    let closing = false;
    let loadToken = 0;

    const overlay = document.createElement("div");
    overlay.className = "nxLbOverlay";

    const card = document.createElement("div");
    card.className = "nxLbCard";

    const top = document.createElement("div");
    top.className = "nxLbTop";

    const count = document.createElement("div");
    count.className = "nxLbCount";

    const closeBtn = document.createElement("button");
    closeBtn.className = "nxLbClose";
    closeBtn.type = "button";
    closeBtn.textContent = "Close";

    top.appendChild(count);
    top.appendChild(closeBtn);

    const stage = document.createElement("div");
    stage.className = "nxLbStage";

    const img = document.createElement("img");
    img.className = "nxLbImg";
    img.alt = "Image";

    const prev = document.createElement("button");
    prev.className = "nxLbNav nxLbPrev";
    prev.type = "button";
    prev.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 18l-6-6 6-6"></path>
      </svg>
    `;

    const next = document.createElement("button");
    next.className = "nxLbNav nxLbNext";
    next.type = "button";
    next.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6l6 6-6 6"></path>
      </svg>
    `;

    stage.appendChild(img);
    stage.appendChild(prev);
    stage.appendChild(next);

    card.appendChild(top);
    card.appendChild(stage);
    overlay.appendChild(card);

    function render() {
      count.textContent = `Image ${idx + 1} of ${list.length}`;
      prev.disabled = list.length <= 1 || idx === 0;
      next.disabled = list.length <= 1 || idx === list.length - 1;

      loadToken++;
      const myToken = loadToken;

      img.classList.remove("isReady");
      void img.offsetWidth;

      img.onload = () => {
        if (myToken !== loadToken) return;
        requestAnimationFrame(() => img.classList.add("isReady"));
      };

      setTimeout(() => {
        if (myToken !== loadToken) return;
        img.src = list[idx];
      }, 10);
    }

    function close() {
      if (closing) return;
      closing = true;

      document.removeEventListener("keydown", onKey);

      overlay.classList.add("isClosing");
      setTimeout(() => overlay.remove(), 200);
    }

    function onKey(e) {
      if (e.key === "Escape") return close();

      if (e.key === "ArrowLeft") {
        if (idx > 0) {
          idx--;
          render();
        }
      }
      if (e.key === "ArrowRight") {
        if (idx < list.length - 1) {
          idx++;
          render();
        }
      }
    }

    overlay.addEventListener("click", (e) => {
      if (!card.contains(e.target)) close();
    });

    closeBtn.addEventListener("click", close);

    prev.addEventListener("click", (e) => {
      e.stopPropagation();
      if (idx > 0) {
        idx--;
        render();
      }
    });

    next.addEventListener("click", (e) => {
      e.stopPropagation();
      if (idx < list.length - 1) {
        idx++;
        render();
      }
    });

    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);

    render();
    closeBtn.focus();
  }

  // --------------------------
  // ✅ Changelog modal (unchanged)
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

// Helper: convert bullet points to HTML lists (copied from Library)
function changelogTextToHtml(raw) {
  const lines = String(raw || "").split(/\r?\n/);
  let html = "";
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${trimmed.slice(2)}</li>`;
    } else {
      if (inList) { html += "</ul>"; inList = false; }
      if (trimmed) html += `<p>${trimmed}</p>`;
    }
  }
  if (inList) html += "</ul>";
  return html || "<p>No notes provided.</p>";
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
        text.innerHTML = changelogTextToHtml(entry.text);
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

  // -------------------------------------------------
  // ✅ Comments (Supabase) — extended with Likes + Top sorting
  // -------------------------------------------------
  const COMMENTS_TABLE = "game_comments";
  const COMMENTS_VIEW = "game_comments_with_likes";
  const LIKES_TABLE = "comment_likes";

  const COMMENTS_STYLE_ID = "nxCommentsStyle";
  function ensureCommentsStyles() {
    if (document.getElementById(COMMENTS_STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = COMMENTS_STYLE_ID;
    s.textContent = `
      .nxCommentsWrap{ margin-top: 20px; }
      .nxCommentsCard{
        border-radius: 22px;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.08);
        box-shadow: 0 18px 50px rgba(0,0,0,.18);
        overflow: hidden;
      }
      .nxCommentsTop{
        padding: 14px 16px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
        border-bottom: 1px solid rgba(255,255,255,.06);
      }
      .nxCommentsYou{
        font-weight: 900;
        color: rgba(255,255,255,.86);
        font-size: 13px;
        letter-spacing: .15px;
        display:flex;
        align-items:center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .nxCommentsYou b{ color:#fff; }
      .nxMiniBtn{
        border:none;
        cursor:pointer;
        border-radius: 12px;
        padding: 8px 10px;
        background: rgba(255,255,255,.08);
        color:#fff;
        font-weight: 900;
        font-size: 12.5px;
        transition: transform .12s ease, background .16s ease, filter .16s ease;
      }
      .nxMiniBtn:hover{ background: rgba(255,255,255,.12); transform: translateY(-1px); }
      .nxMiniBtn:active{ transform: translateY(0) scale(.98); }
      .nxMiniBtn:disabled{ opacity:.6; cursor:default; transform:none; }
      .nxMiniBtn.danger{
        background: rgba(255,60,90,.18);
        border: 1px solid rgba(255,60,90,.22);
      }
      .nxMiniBtn.danger:hover{ background: rgba(255,60,90,.24); }
      .nxMiniBtn.liked{
        background: rgba(124,92,255,.22);
        border: 1px solid rgba(124,92,255,.26);
        box-shadow: 0 14px 34px rgba(124,92,255,.10);
      }
      /* ❤️ Heart like button (modern + animated) */
      .nxHeartBtn{
        position: relative;
        display:inline-flex;
        align-items:center;
        gap: 8px;
        padding: 8px 12px;
        background: rgba(255,255,255,.08);
      
        /* keep size stable when liked border appears */
        border: 1px solid rgba(255,255,255,.10);
        box-sizing: border-box;
      }
      .nxHeartBtn:hover{ background: rgba(255,255,255,.12); transform: translateY(-1px); }
      .nxHeartBtn:active{ transform: translateY(0) scale(.98); }

      .nxHeartIcon{
        width: 18px;
        height: 18px;
        display:grid;
        place-items:center;
      }
      .nxHeartSvg{
        width: 18px;
        height: 18px;
        stroke: rgba(255,255,255,.88);
        fill: rgba(255,255,255,0);
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
        transition: transform .14s ease, fill .16s ease, stroke .16s ease, filter .16s ease;
        pointer-events:none;
      }

      .nxHeartCount{
        font-weight: 950;
        font-size: 12.5px;
        letter-spacing: .15px;
        color: rgba(255,255,255,.90);
        user-select:none;
      }

      /* liked state */
      .nxHeartBtn.liked{
        background: rgba(255,60,90,.16);
        border-color: rgba(255,60,90,.22);
box-shadow: 0 14px 34px rgba(255,60,90,.10);
      }
      .nxHeartBtn.liked .nxHeartSvg{
        stroke: rgba(255,255,255,.95);
        fill: rgba(255,60,90,.85);
        filter: drop-shadow(0 10px 18px rgba(255,60,90,.18));
        transform: scale(1.02);
      }

      /* click animation */
      .nxHeartBtn.nxHeartPop .nxHeartSvg{
        animation: nxHeartPop .42s cubic-bezier(.2,.9,.2,1);
      }
      .nxHeartBtn.nxHeartPop::after{
        content:"";
        position:absolute;
        left: 50%;
        top: 50%;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        transform: translate(-50%,-50%);
        box-shadow:
          0 -18px 0 rgba(255,60,90,.55),
          14px -10px 0 rgba(124,92,255,.45),
          18px 0 0 rgba(255,255,255,.28),
          14px 10px 0 rgba(124,92,255,.45),
          0 18px 0 rgba(255,60,90,.55),
          -14px 10px 0 rgba(124,92,255,.45),
          -18px 0 0 rgba(255,255,255,.28),
          -14px -10px 0 rgba(124,92,255,.45);
        opacity: 0;
        animation: nxHeartBurst .50s ease-out;
        pointer-events:none;
      }

      @keyframes nxHeartPop{
        0%{ transform: scale(1); }
        30%{ transform: scale(1.28); }
        55%{ transform: scale(.96); }
        100%{ transform: scale(1.05); }
      }
      @keyframes nxHeartBurst{
        0%{ opacity: 0; transform: translate(-50%,-50%) scale(.6); filter: blur(0px); }
        20%{ opacity: 1; }
        100%{ opacity: 0; transform: translate(-50%,-50%) scale(1.25); filter: blur(.2px); }
      }


      .nxCommentsCount{
        color: rgba(255,255,255,.60);
        font-weight: 900;
        font-size: 12.5px;
      }

      /* ✅ Modern dropdown (custom select) */
      .nxSelect{
        position: relative;
        display:inline-block;
      }
      .nxSelectBtn{
        border: 1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.08);
        color: rgba(255,255,255,.92);
        border-radius: 12px;
        padding: 8px 10px;
        font-weight: 950;
        font-size: 12.5px;
        letter-spacing: .15px;
        cursor:pointer;
        display:flex;
        align-items:center;
        gap: 8px;
        transition: transform .12s ease, background .16s ease, border-color .16s ease, box-shadow .16s ease;
        user-select:none;
      }
      .nxSelectBtn:hover{
        background: rgba(255,255,255,.12);
        transform: translateY(-1px);
      }
      .nxSelectBtn:active{ transform: translateY(0) scale(.99); }
      .nxSelectBtn:focus-visible{
        outline: none;
        border-color: rgba(124,92,255,.34);
        box-shadow: 0 0 0 3px rgba(124,92,255,.18);
      }
      .nxSelectBtn:disabled{
        opacity:.6;
        cursor:default;
        transform:none;
      }
      .nxSelectBtn svg{
        width: 16px;
        height: 16px;
        stroke: rgba(255,255,255,.85);
        fill:none;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        opacity: .95;
      }
      .nxSelectMenu{
        position:absolute;
        right: 0;
        top: calc(100% + 8px);
        min-width: 170px;
        border-radius: 16px;
        background: rgba(18,20,30,.96);
        border: 1px solid rgba(255,255,255,.10);
        box-shadow: 0 22px 70px rgba(0,0,0,.55);
        overflow:hidden;
        padding: 6px;
        z-index: 9999;
        transform: translateY(6px);
        opacity: 0;
        pointer-events: none;
        transition: opacity .14s ease, transform .14s ease;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }
      .nxSelect.open .nxSelectMenu{
        transform: translateY(0);
        opacity: 1;
        pointer-events: auto;
      }
      .nxSelectItem{
        width:100%;
        text-align:left;
        border:none;
        background: transparent;
        color: rgba(255,255,255,.86);
        font-weight: 900;
        font-size: 12.8px;
        padding: 10px 10px;
        border-radius: 12px;
        cursor:pointer;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
        transition: background .14s ease, transform .12s ease;
      }

      /* ✅ FIX: do NOT raise "New" / "Top" on hover */
      .nxSelectItem:hover{
        background: rgba(255,255,255,.06);
        transform: none;
      }

      .nxSelectItem:active{ transform: scale(.99); }
      .nxSelectItem[aria-selected="true"]{
        background: rgba(124,92,255,.18);
        color: rgba(255,255,255,.95);
      }
      .nxSelectCheck{
        width: 16px; height: 16px;
        opacity: 0;
        transition: opacity .12s ease;
      }
      .nxSelectItem[aria-selected="true"] .nxSelectCheck{ opacity: 1; }
      .nxSelectCheck svg{
        width: 16px; height: 16px;
        stroke: rgba(255,255,255,.92);
        fill:none;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      .nxComposer{
        padding: 14px 16px;
        display:flex;
        flex-direction:column;
        gap: 10px;
        border-bottom: 1px solid rgba(255,255,255,.06);
      }
      .nxComposer textarea{
        width:100%;
        min-height: 92px;
        resize: none;
        overflow-y: hidden;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(0,0,0,.16);
        color:#fff;
        padding: 12px 12px;
        font-family: inherit;
        font-size: 13.5px;
        line-height: 1.45;
        outline: none;
      }
      .nxComposer textarea:focus{
        border-color: rgba(124,92,255,.32);
        box-shadow: 0 0 0 3px rgba(124,92,255,.18);
      }
      .nxComposerBottom{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
      }
      .nxComposerHint{
        color: rgba(255,255,255,.55);
        font-weight: 800;
        font-size: 12.5px;
      }

      .nxCommentsList{ padding: 14px 16px; display:flex; flex-direction:column; gap: 12px; }
      .nxComment{
        border-radius: 18px;
        border: 1px solid rgba(255,255,255,.08);
        background: rgba(255,255,255,.03);
        padding: 12px 12px;
      }
      .nxCommentHead{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
        margin-bottom: 8px;
      }
      .nxCommentAuthor{
        font-weight: 950;
        color: rgba(255,255,255,.92);
        font-size: 13px;
        letter-spacing: .15px;
      }
      .nxCommentTime{
        color: rgba(255,255,255,.55);
        font-weight: 850;
        font-size: 12px;
      }
      .nxCommentBody{
        white-space: pre-wrap;
        line-height: 1.55;
        font-weight: 700;
        color: rgba(255,255,255,.78);
        font-size: 13.5px;
      }
      .nxCommentActions{
        margin-top: 10px;
        display:flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .nxInlineEdit textarea{
        width:100%;
        min-height: 84px;
        resize: none;
        overflow-y: hidden;
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(0,0,0,.16);
        color:#fff;
        padding: 12px 12px;
        font-family: inherit;
        font-size: 13.5px;
        line-height: 1.45;
        outline: none;
      }
      .nxInlineEdit textarea:focus{
        border-color: rgba(124,92,255,.32);
        box-shadow: 0 0 0 3px rgba(124,92,255,.18);
      }
      .nxInlineEditRow{
        margin-top: 10px;
        display:flex;
        justify-content:flex-end;
        gap: 8px;
      }

      .nxCommentsEmpty{
        color: rgba(255,255,255,.60);
        font-weight: 800;
        font-size: 13px;
        padding: 4px 2px;
      }

      .nxCommentsNotice{
        padding: 14px 16px;
        color: rgba(255,255,255,.68);
        font-weight: 800;
        font-size: 13px;
      }
      .nxCommentsNotice b{ color:#fff; }
      .nxCommentsNotice code{
        background: rgba(255,255,255,.08);
        padding: 2px 6px;
        border-radius: 10px;
      }
    `;
    document.head.appendChild(s);
  }

  function getSupabaseConfig() {
    const url =
      localStorage.getItem("nx.supa.url") ||
      window.__SUPABASE_URL ||
      "";

    const key =
      localStorage.getItem("nx.supa.key") ||
      window.__SUPABASE_ANON_KEY ||
      "";

    return { url: String(url || "").trim(), key: String(key || "").trim() };
  }

  function getSupabaseClient() {
    // Prefer the client created in index.html (window.sb) if present
    if (window.sb && typeof window.sb.from === "function") return window.sb;

    // Supabase UMD exposes global `supabase`
    const lib = window.supabase;
    if (!lib || typeof lib.createClient !== "function") return null;

    const { url, key } = getSupabaseConfig();
    if (!url || !key) return null;

    if (!window.__nxSupabaseClient) {
      window.__nxSupabaseClient = lib.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
    }
    return window.__nxSupabaseClient;
  }

  function makePseudo() {
    const adj = ["Neon", "Cozy", "Swift", "Quiet", "Nova", "Pixel", "Frost", "Sunny", "Velvet", "Cosmic", "Golden"];
    const animal = ["Fox", "Otter", "Panda", "Lynx", "Hawk", "Koala", "Tiger", "Raven", "Dolphin", "Wolf", "Bunny"];
    const a = adj[Math.floor(Math.random() * adj.length)];
    const b = animal[Math.floor(Math.random() * animal.length)];
    const n = String(Math.floor(1000 + Math.random() * 9000));
    return `${a}${b}-${n}`;
  }

  function promptDisplayName(currentName) {
    ensureModalStyles();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "nxModalOverlay";

      overlay.innerHTML = `
        <div class="nxModalCard" role="dialog" aria-modal="true">
          <div class="nxModalTop">
            <div class="nxModalIcon" aria-hidden="true" style="background: rgba(124,92,255,.16); border-color: rgba(124,92,255,.22);">
              <svg viewBox="0 0 24 24">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"></path>
              </svg>
            </div>
            <div style="flex:1;">
              <div class="nxModalTitle">Your display name</div>
              <div class="nxModalMsg">
                This name will be shown next to your comments.
              </div>

              <div style="margin-top:12px;">
                <input id="nxNameInput" type="text"
                  value="${escapeHtml(currentName || "")}"
                  placeholder="e.g. NeonFox-1234"
                  style="
                    width:100%;
                    box-sizing:border-box;
                    border-radius: 14px;
                    border: 1px solid rgba(255,255,255,.12);
                    background: rgba(0,0,0,.16);
                    color:#fff;
                    padding: 11px 12px;
                    font-weight: 800;
                    outline: none;
                  "
                />
                <div style="margin-top:8px; color: rgba(255,255,255,.55); font-weight: 800; font-size: 12.5px;">
                  Tip: keep it short (3–24 chars). Letters/numbers/space/_/- allowed.
                </div>
              </div>
            </div>
          </div>

          <div class="nxModalDivider"></div>

          <div class="nxModalActions">
            <button class="nxBtn" data-act="cancel" type="button">Cancel</button>
            <button class="nxBtn nxBtnPrimary" data-act="ok" type="button">Save</button>
          </div>
        </div>
      `;

      const card = overlay.querySelector(".nxModalCard");
      const cancelBtn = overlay.querySelector('[data-act="cancel"]');
      const okBtn = overlay.querySelector('[data-act="ok"]');
      const input = overlay.querySelector("#nxNameInput");

      function close(val) {
        document.removeEventListener("keydown", onKey);
        overlay.remove();
        resolve(val);
      }

      function onKey(e) {
        if (e.key === "Escape") close(null);
        if (e.key === "Enter") {
          if (document.activeElement === input) okBtn.click();
        }
      }

      overlay.addEventListener("click", (e) => {
        if (!card.contains(e.target)) close(null);
      });

      cancelBtn.addEventListener("click", () => close(null));
      okBtn.addEventListener("click", () => close(String(input.value || "")));

      document.addEventListener("keydown", onKey);
      document.body.appendChild(overlay);

      setTimeout(() => input?.focus?.(), 0);
      input?.select?.();
    });
  }

  function normalizeDisplayName(name) {
    const raw = String(name || "").trim();
    if (!raw) return "";
    // allow letters, numbers, spaces, underscore, hyphen
    const cleaned = raw.replace(/[^\w \-]/g, "").replace(/\s+/g, " ").trim();
    if (cleaned.length < 3) return "";
    return cleaned.slice(0, 24);
  }

  async function ensureSignedIn(sb) {
    const { data: sessData } = await sb.auth.getSession();
    if (sessData?.session?.user) return sessData.session.user;

    const { data, error } = await sb.auth.signInAnonymously();
    if (error) throw error;
    return data?.user || null;
  }

  // ✅ Local display name (no profiles table)
  function nameStorageKey(userId) {
    return `nx.comments.display_name.${String(userId || "unknown")}`;
  }

  function getLocalDisplayName(userId) {
    try {
      const v = localStorage.getItem(nameStorageKey(userId));
      return String(v || "").trim();
    } catch {
      return "";
    }
  }

  function setLocalDisplayName(userId, name) {
    try {
      localStorage.setItem(nameStorageKey(userId), String(name || "").trim());
      return true;
    } catch {
      return false;
    }
  }

  function ensureLocalDisplayNameForUser(user) {
    const uid = String(user?.id || "");
    if (!uid) return "Anonymous";

    let cur = getLocalDisplayName(uid);
    cur = normalizeDisplayName(cur);
    if (cur) return cur;

    const fresh = makePseudo();
    setLocalDisplayName(uid, fresh);
    return fresh;
  }

  // ✅ Optional: update all your old comments to match new name
  async function updateMyDisplayNameEverywhere(sb, user, displayName) {
    const uid = String(user?.id || "");
    if (!uid) return;

    const { error } = await sb
      .from(COMMENTS_TABLE)
      .update({ display_name: String(displayName) })
      .eq("user_id", uid);

    if (error) {
      // Not fatal — name will still work for new comments
      console.warn("[Comments] Could not update old comments display_name:", error);
    }
  }

  function teardownCommentsRealtime(sb) {
    try {
      const ch = window.__nxCommentsChannel;
      if (ch && sb) {
        sb.removeChannel?.(ch);
      }
    } catch {}
    window.__nxCommentsChannel = null;
    window.__nxCommentsGameId = null;
  }

  function bindCommentsRealtime(sb, gameId, onChange) {
    teardownCommentsRealtime(sb);

    try {
      const ch = sb
        .channel(`nx-comments:${String(gameId)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: COMMENTS_TABLE, filter: `game_id=eq.${String(gameId)}` },
          () => onChange?.()
        )
        .subscribe();

      window.__nxCommentsChannel = ch;
      window.__nxCommentsGameId = String(gameId);
    } catch (e) {
      console.error("Realtime subscribe failed:", e);
    }
  }

  function teardownLikesRealtime(sb) {
    try {
      const ch = window.__nxLikesChannel;
      if (ch && sb) sb.removeChannel?.(ch);
    } catch {}
    window.__nxLikesChannel = null;
    window.__nxLikesGameId = null;
  }

  function bindLikesRealtime(sb, gameId, getLoadedCommentIdSet, onChange) {
    teardownLikesRealtime(sb);

    try {
      const ch = sb
        .channel(`nx-comment-likes:${String(gameId)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: LIKES_TABLE },
          (payload) => {
            const cid = String(payload?.new?.comment_id || payload?.old?.comment_id || "");
            if (!cid) return;

            const set = getLoadedCommentIdSet?.();
            if (set && set.has(cid)) onChange?.();
          }
        )
        .subscribe();

      window.__nxLikesChannel = ch;
      window.__nxLikesGameId = String(gameId);
    } catch (e) {
      console.error("Likes realtime subscribe failed:", e);
    }
  }

  // --- Likes helpers
  async function likeComment(sb, commentId) {
    const { error } = await sb.from(LIKES_TABLE).insert({ comment_id: String(commentId) });
    // if already liked, primary key prevents duplicates; ignore that
    if (error) {
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) return;
      throw error;
    }
  }

  async function unlikeComment(sb, myId, commentId) {
    // extra safety filter with myId (RLS already enforces)
    const { error } = await sb
      .from(LIKES_TABLE)
      .delete()
      .eq("comment_id", String(commentId))
      .eq("user_id", String(myId || ""));

    if (error) throw error;
  }

  async function fetchComments(sb, gameId, sortMode, myUserId) {
    const sort = sortMode === "top" ? "top" : "new";

    // Prefer the VIEW so we can sort by likes_count
    let rows = null;
    try {
      const base = sb
        .from(COMMENTS_VIEW)
        .select("id, game_id, user_id, display_name, body, created_at, updated_at, likes_count")
        .eq("game_id", String(gameId))
        .limit(80);

      const q =
        sort === "top"
          ? base.order("likes_count", { ascending: false }).order("created_at", { ascending: false })
          : base.order("created_at", { ascending: false });

      const { data, error } = await q;
      if (error) throw error;
      rows = Array.isArray(data) ? data : [];
    } catch (e) {
      // Fallback: view missing => load plain comments (no likes count / no top)
      console.warn("[Comments] View missing or failed, falling back to table:", e?.message || e);
      const { data, error } = await sb
        .from(COMMENTS_TABLE)
        .select("id, game_id, user_id, display_name, body, created_at, updated_at")
        .eq("game_id", String(gameId))
        .order("created_at", { ascending: false })
        .limit(80);

      if (error) throw error;
      const list = Array.isArray(data) ? data : [];
      rows = list.map((c) => ({ ...c, likes_count: 0 }));
    }

    // Build likedByMe set
    const ids = rows.map((c) => String(c.id)).filter(Boolean);
    let likedSet = new Set();

    if (myUserId && ids.length) {
      const { data: likesRows, error: likesErr } = await sb
        .from(LIKES_TABLE)
        .select("comment_id")
        .eq("user_id", String(myUserId))
        .in("comment_id", ids);

      if (!likesErr && Array.isArray(likesRows)) {
        likedSet = new Set(likesRows.map((r) => String(r.comment_id)));
      }
    }

    return rows.map((c) => ({
      id: c.id,
      gameId: c.game_id,
      userId: c.user_id,
      body: c.body || "",
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      displayName: c.display_name || "Anonymous",
      likesCount: Number(c.likes_count || 0),
      likedByMe: likedSet.has(String(c.id))
    }));
  }

  async function postComment(sb, user, gameId, displayName, text) {
    const body = String(text || "").trim();
    if (!body) return;

    const uid = String(user?.id || "");
    if (!uid) throw new Error("Not signed in");

    const { error } = await sb.from(COMMENTS_TABLE).insert({
      game_id: String(gameId),
      user_id: uid,
      display_name: String(displayName || "Anonymous"),
      body
    });

    if (error) throw error;
  }

  async function updateComment(sb, id, body) {
    const text = String(body || "").trim();
    if (!text) return;

    // updated_at is handled by your trigger, no need to set it manually
    const { error } = await sb
      .from(COMMENTS_TABLE)
      .update({ body: text })
      .eq("id", id);

    if (error) throw error;
  }

  async function deleteComment(sb, id) {
    const { error } = await sb.from(COMMENTS_TABLE).delete().eq("id", id);
    if (error) throw error;
  }

  const COMMENTS_CONFIRM_STYLE_ID = "nxCommentsConfirmStyle";
  function ensureCommentsConfirmStyles() {
    if (document.getElementById(COMMENTS_CONFIRM_STYLE_ID)) return;
    const s = document.createElement("style");
    s.id = COMMENTS_CONFIRM_STYLE_ID;
    s.textContent = `/* modal base styles already injected */`;
    document.head.appendChild(s);
  }

  function confirmDeleteComment() {
    ensureModalStyles();
    ensureCommentsConfirmStyles();

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "nxModalOverlay";

      overlay.innerHTML = `
        <div class="nxModalCard" role="dialog" aria-modal="true">
          <div class="nxModalTop">
            <div class="nxModalIcon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M3 6h18"></path>
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
              </svg>
            </div>
            <div style="flex:1;">
              <div class="nxModalTitle">Delete this comment?</div>
              <div class="nxModalMsg">
                This can’t be undone.
              </div>
            </div>
          </div>

          <div class="nxModalDivider"></div>

          <div class="nxModalActions">
            <button class="nxBtn" data-act="cancel" type="button">Cancel</button>
            <button class="nxBtn nxBtnDanger" data-act="ok" type="button">Delete</button>
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

  function iconChevronDown() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9l6 6 6-6"></path>
      </svg>
    `;
  }

  function iconCheck() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 6L9 17l-5-5"></path>
      </svg>
    `;
  }

  async function initCommentsFeature(gameId) {
    ensureCommentsStyles();

    const wrap = document.getElementById("nxCommentsMount");
    if (!wrap) return;

    // ✅ If we already initialized comments for this game AND mount still has UI, do nothing.
    // This prevents flashing if renderDetails is called frequently while downloading.
    if (
      String(window.__nxCommentsUIForGameId || "") === String(gameId) &&
      wrap.querySelector(".nxCommentsWrap")
    ) {
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      wrap.innerHTML = `
        <div class="nxCommentsWrap">
          <div class="sectionTitle">Comments</div>
          <div class="nxCommentsCard">
            <div class="nxCommentsNotice">
              <b>Comments are not configured.</b><br/>
              Add your Supabase URL + anon key in <code>index.html</code> (or set localStorage keys <code>nx.supa.url</code> and <code>nx.supa.key</code>).
            </div>
          </div>
        </div>
      `;
      window.__nxCommentsUIForGameId = String(gameId);
      return;
    }

    if (!navigator.onLine) {
      wrap.innerHTML = `
        <div class="nxCommentsWrap">
          <div class="sectionTitle">Comments</div>
          <div class="nxCommentsCard">
            <div class="nxCommentsNotice">
              You’re currently <b>offline</b>. Comments will be available when you’re back online.
            </div>
          </div>
        </div>
      `;
      window.__nxCommentsUIForGameId = String(gameId);
      return;
    }

    // Ensure auth + local display name
    let user = null;
    let displayName = "Anonymous";

    try {
      user = await ensureSignedIn(sb);
      displayName = ensureLocalDisplayNameForUser(user);
    } catch (e) {
      console.error(e);
      wrap.innerHTML = `
        <div class="nxCommentsWrap">
          <div class="sectionTitle">Comments</div>
          <div class="nxCommentsCard">
            <div class="nxCommentsNotice">
              Could not initialize comments (auth error). Check console.
            </div>
          </div>
        </div>
      `;
      window.__nxCommentsUIForGameId = String(gameId);
      return;
    }

    wrap.innerHTML = `
      <div class="nxCommentsWrap">
        <div class="sectionTitle">Comments</div>

        <div class="nxCommentsCard">
          <div class="nxCommentsTop">
            <div class="nxCommentsYou">
              You are <b id="nxCommentsName">${escapeHtml(displayName || "Anonymous")}</b>
              <button class="nxMiniBtn" id="nxCommentsChangeNameBtn" type="button">Change</button>
            </div>

            <div style="display:flex; align-items:center; gap:10px;">
              <div class="nxSelect" id="nxCommentsSortWrap">
                <button class="nxSelectBtn" id="nxCommentsSortBtn" type="button"
                  aria-haspopup="listbox"
                  aria-expanded="false"
                  title="Sort comments"
                >
                  <span id="nxCommentsSortLabel">New</span>
                  ${iconChevronDown()}
                </button>

                <div class="nxSelectMenu" id="nxCommentsSortMenu" role="listbox" tabindex="-1" aria-label="Sort comments">
                  <button class="nxSelectItem" type="button" role="option" data-val="new" aria-selected="true">
                    <span>New</span>
                    <span class="nxSelectCheck">${iconCheck()}</span>
                  </button>
                  <button class="nxSelectItem" type="button" role="option" data-val="top" aria-selected="false">
                    <span>Top</span>
                    <span class="nxSelectCheck">${iconCheck()}</span>
                  </button>
                </div>
              </div>

              <div class="nxCommentsCount" id="nxCommentsCount">Loading…</div>
            </div>
          </div>

          <div class="nxComposer">
            <textarea id="nxCommentsInput" maxlength="500" placeholder="Write a comment…"></textarea>
            <div class="nxComposerBottom">
              <div class="nxComposerHint" id="nxCommentsHint">0 / 500</div>
              <button class="btnSecondary" id="nxCommentsPostBtn" type="button">Post</button>
            </div>
          </div>

          <div class="nxCommentsList" id="nxCommentsList">
            <div class="nxCommentsEmpty">Loading…</div>
          </div>
        </div>
      </div>
    `;

    window.__nxCommentsUIForGameId = String(gameId);

    const nameEl = document.getElementById("nxCommentsName");
    const changeBtn = document.getElementById("nxCommentsChangeNameBtn");
    const input = document.getElementById("nxCommentsInput");
    attachAutoGrowTextarea(input, 92);
    const postBtn = document.getElementById("nxCommentsPostBtn");
    const hint = document.getElementById("nxCommentsHint");
    const listEl = document.getElementById("nxCommentsList");
    const countEl = document.getElementById("nxCommentsCount");

    // custom select nodes
    const sortWrap = document.getElementById("nxCommentsSortWrap");
    const sortBtn = document.getElementById("nxCommentsSortBtn");
    const sortLabel = document.getElementById("nxCommentsSortLabel");
    const sortMenu = document.getElementById("nxCommentsSortMenu");

    let busy = false;
    let cached = [];
    let sortMode = "new";
    const myId = String(user?.id || "");
    let loadedCommentIdSet = new Set();

    function setBusy(on) {
      busy = !!on;
      if (postBtn) postBtn.disabled = busy;
      if (changeBtn) changeBtn.disabled = busy;
      if (sortBtn) sortBtn.disabled = busy;
      if (sortWrap) sortWrap.style.pointerEvents = busy ? "none" : "";
    }

    function updateHint() {
      const n = (input?.value || "").length;
      if (hint) hint.textContent = `${n} / 500`;
    }

    input?.addEventListener("input", updateHint);
    updateHint();

    // ✅ Modern dropdown behavior
    function setSortMode(next) {
      sortMode = next === "top" ? "top" : "new";
      if (sortLabel) sortLabel.textContent = sortMode === "top" ? "Top" : "New";

      if (sortMenu) {
        const items = sortMenu.querySelectorAll("[data-val]");
        items.forEach((it) => {
          const val = String(it.getAttribute("data-val") || "");
          it.setAttribute("aria-selected", val === sortMode ? "true" : "false");
        });
      }
    }

    function openSortMenu() {
      if (!sortWrap || !sortBtn) return;
      sortWrap.classList.add("open");
      sortBtn.setAttribute("aria-expanded", "true");
      // focus selected item for keyboard
      const sel = sortMenu?.querySelector(`[data-val="${sortMode}"]`);
      (sel || sortMenu)?.focus?.();
    }

    function closeSortMenu() {
      if (!sortWrap || !sortBtn) return;
      sortWrap.classList.remove("open");
      sortBtn.setAttribute("aria-expanded", "false");
    }

    function toggleSortMenu() {
      if (!sortWrap) return;
      if (sortWrap.classList.contains("open")) closeSortMenu();
      else openSortMenu();
    }

    sortBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      if (busy) return;
      toggleSortMenu();
    });

    sortMenu?.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-val]");
      if (!btn) return;
      const val = String(btn.getAttribute("data-val") || "new");
      closeSortMenu();
      if (val === sortMode) return;
      setSortMode(val);
      await reload();
    });

    // click outside / escape
    function onDocDown(e) {
      if (!sortWrap || !sortWrap.classList.contains("open")) return;
      if (sortWrap.contains(e.target)) return;
      closeSortMenu();
    }
    function onDocKey(e) {
      if (e.key === "Escape") {
        if (sortWrap?.classList.contains("open")) {
          e.preventDefault();
          closeSortMenu();
          sortBtn?.focus?.();
        }
      }
      // basic keyboard nav when menu open
      if (sortWrap?.classList.contains("open") && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const items = Array.from(sortMenu?.querySelectorAll("[data-val]") || []);
        if (!items.length) return;
        const cur = document.activeElement;
        let idx = Math.max(0, items.findIndex((x) => x === cur));
        if (idx < 0) idx = items.findIndex((x) => String(x.getAttribute("data-val")) === sortMode);
        if (idx < 0) idx = 0;
        idx = e.key === "ArrowDown" ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
        items[idx]?.focus?.();
      }
      if (sortWrap?.classList.contains("open") && e.key === "Enter") {
        const cur = document.activeElement;
        const btn = cur?.closest?.("[data-val]");
        if (!btn) return;
        btn.click();
      }
    }

    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onDocKey);

    // initialize UI
    setSortMode("new");

    async function reload() {
      if (!navigator.onLine) return;
      try {
        const rows = await fetchComments(sb, gameId, sortMode, myId);
        cached = rows;
        loadedCommentIdSet = new Set(rows.map((c) => String(c.id)));
        renderList();
      } catch (e) {
        console.error(e);
        if (listEl) {
          listEl.innerHTML = `<div class="nxCommentsEmpty">Failed to load comments.</div>`;
        }
        if (countEl) countEl.textContent = "—";
      }
    }

    function renderList() {
      if (!listEl) return;

      if (!cached.length) {
        listEl.innerHTML = `<div class="nxCommentsEmpty">No comments yet. Be the first.</div>`;
        if (countEl) countEl.textContent = "0";
        return;
      }

      if (countEl) countEl.textContent = String(cached.length);

      listEl.innerHTML = cached
        .map((c) => {
          const mine = myId && String(c.userId) === myId;
          const author = escapeHtml(c.displayName || "Anonymous");
          const body = escapeHtml(c.body || "");
          const when = timeAgo(c.createdAt);
          const edited = c.updatedAt && c.updatedAt !== c.createdAt ? " • edited" : "";

          const likeLabel = c.likedByMe ? "Unlike" : "Like";
          const likeCount = Number(c.likesCount || 0);

          return `
          <div class="nxComment" data-cid="${escapeHtml(c.id)}">
            <div class="nxCommentHead">
              <div class="nxCommentAuthor">${author}</div>
              <div class="nxCommentTime">${escapeHtml(when)}${edited}</div>
            </div>

            <div class="nxCommentBody" data-role="body">${body}</div>

            <div class="nxCommentActions">
              <button class="nxMiniBtn nxHeartBtn ${c.likedByMe ? "liked" : ""}" data-act="like" type="button"
                aria-label="${c.likedByMe ? "Unlike" : "Like"}">
                <span class="nxHeartIcon"><svg viewBox="0 0 24 24" aria-hidden="true" class="nxHeartSvg">
  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"></path>
</svg></span>
                <span class="nxHeartCount">${likeCount}</span>
              </button>

              ${
                mine
                  ? `
                    <button class="nxMiniBtn" data-act="edit" type="button">Edit</button>
                    <button class="nxMiniBtn danger" data-act="delete" type="button">Delete</button>
                  `
                  : ``
              }
            </div>
          </div>
        `;
        })
        .join("");
    }

    async function handlePost() {
      if (busy) return;
      if (!navigator.onLine) return toast("Offline", "error");

      const text = String(input?.value || "").trim();
      if (!text) return;

      setBusy(true);
      try {
        await postComment(sb, user, gameId, displayName, text);
        input.value = "";
        updateHint();
        toast("Posted", "success");
        await reload();
      } catch (e) {
        console.error(e);
        toast("Failed to post", "error");
      } finally {
        setBusy(false);
      }
    }

    postBtn?.addEventListener("click", handlePost);
    input?.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handlePost();
      }
    });

    changeBtn?.addEventListener("click", async () => {
      if (busy) return;
      const nextRaw = await promptDisplayName(displayName || "");
      if (nextRaw == null) return;

      const next = normalizeDisplayName(nextRaw);
      if (!next) return toast("Name must be 3–24 chars", "error");

      setBusy(true);
      try {
        displayName = next;
        setLocalDisplayName(myId, next);
        if (nameEl) nameEl.textContent = next;

        // update existing comments to show new name everywhere
        await updateMyDisplayNameEverywhere(sb, user, next);

        toast("Updated name", "success");
        await reload();
      } catch (e) {
        console.error(e);
        toast("Failed to update name", "error");
      } finally {
        setBusy(false);
      }
    });

    listEl?.addEventListener("click", async (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      const card = e.target.closest("[data-cid]");
      if (!card) return;

      const cid = String(card.dataset.cid || "");
      if (!cid) return;

      const act = btn.dataset.act;

      const found = cached.find((x) => String(x.id) === cid);
      if (!found) return;

      if (busy) return;

      // ✅ Like/unlike works for everyone (not just your own comments)
      if (act === "like") {
        try {
          btn.classList.add("nxHeartPop");
          setTimeout(() => btn.classList.remove("nxHeartPop"), 520);
        } catch {}

        busy = true;
        if (postBtn) postBtn.disabled = true;
        try {
          if (found.likedByMe) await unlikeComment(sb, myId, cid);
          else await likeComment(sb, cid);

          await reload();
        } catch (err) {
          console.error(err);
          toast("Failed to like", "error");
        } finally {
          busy = false;
          if (postBtn) postBtn.disabled = false;
        }
        return;
      }

      const mine = myId && String(found.userId) === myId;
      if (!mine) return;

      if (act === "delete") {
        const ok = await confirmDeleteComment();
        if (!ok) return;

        setBusy(true);
        try {
          await deleteComment(sb, cid);
          toast("Deleted", "success");
          await reload();
        } catch (err) {
          console.error(err);
          toast("Failed to delete", "error");
        } finally {
          setBusy(false);
        }
        return;
      }

      if (act === "edit") {
        const bodyEl = card.querySelector('[data-role="body"]');
        if (!bodyEl) return;

        const old = found.body || "";
        // keep actions row (includes like), but prevent confusion: remove edit/delete buttons only
        const actions = card.querySelector(".nxCommentActions");
        if (actions) {
          const editBtn = actions.querySelector('[data-act="edit"]');
          const delBtn = actions.querySelector('[data-act="delete"]');
          editBtn?.remove();
          delBtn?.remove();
        }

        bodyEl.outerHTML = `
          <div class="nxInlineEdit" data-role="edit">
            <textarea maxlength="500">${escapeHtml(old)}</textarea>
            <div class="nxInlineEditRow">
              <button class="nxMiniBtn" data-act="cancelEdit" type="button">Cancel</button>
              <button class="nxMiniBtn" data-act="saveEdit" type="button">Save</button>
            </div>
          </div>
        `;

        const editWrap = card.querySelector('[data-role="edit"]');
        const ta = editWrap?.querySelector("textarea");
        attachAutoGrowTextarea(ta, 84);
        ta?.focus?.();
        return;
      }

      if (act === "cancelEdit") {
        await reload();
        return;
      }

      if (act === "saveEdit") {
        const editWrap = card.querySelector('[data-role="edit"]');
        const ta = editWrap?.querySelector("textarea");
        const next = String(ta?.value || "").trim();
        if (!next) return toast("Comment can’t be empty", "error");

        setBusy(true);
        try {
          await updateComment(sb, cid, next);
          toast("Saved", "success");
          await reload();
        } catch (err) {
          console.error(err);
          toast("Failed to save", "error");
        } finally {
          setBusy(false);
        }
        return;
      }
    });

    await reload();

    bindCommentsRealtime(sb, gameId, async () => {
      if (busy) return;
      await reload();
    });

    bindLikesRealtime(
      sb,
      gameId,
      () => loadedCommentIdSet,
      async () => {
        if (busy) return;
        await reload();
      }
    );

    const onOff = () => {
      if (!navigator.onLine) toast("Offline — comments paused", "info");
      else toast("Online — comments live", "success");
    };
    window.addEventListener("offline", onOff);
    window.addEventListener("online", onOff);

    window.__nxCommentsTeardown = () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onDocKey);

      window.removeEventListener("offline", onOff);
      window.removeEventListener("online", onOff);
      teardownCommentsRealtime(sb);
      teardownLikesRealtime(sb);
      closeSortMenu();
      window.__nxCommentsUIForGameId = null;
    };
  }

  // --------------------------
  // ✅ Render Details
  // --------------------------
  async function buildGameModel(selectedId, store, installed, autoMap) {
    const meta = (store.games || []).find((g) => String(g.id) === String(selectedId)) || {};
    const inst = installed?.[selectedId] || null;

    const update = window.__updatesByGameId?.get(String(selectedId)) || null;

    const installedVersion = inst?.version || "—";
    const latestVersion = meta?.version || installedVersion;

    const developers = getDevelopers(meta, inst);
    const images = getImages(meta);
    const inputSupport = getInputSupport(meta, inst);

    const gid = String(selectedId);
    const autoEnabled = !!autoMap[gid];

    let downloadBytes = getDownloadSizeFromMeta(meta);

    // ✅ if we already cached remote size, use it immediately so text never flips to Loading…
    const canFetchRemoteSize = (typeof window.api?.getRemoteFileSize === "function") && !!(meta?.zipUrl || null);
    const zipUrl = meta?.zipUrl || null;
    if ((!downloadBytes || downloadBytes <= 0) && zipUrl) {
      const cached = Number(getRemoteSizeCacheStore().bytesByUrl[normalizeZipUrl(zipUrl)] || 0);
      if (cached > 0) downloadBytes = cached;
    }

    const game = {
      id: gid,
      phase: getPhaseForGame(gid),
      name: meta.name || inst?.name || "Unknown Game",
      description: meta.description || inst?.description || "",
      hero: meta.heroUrl || meta.hero || meta.imageUrl || meta.image || inst?.image || "",
      images,
      category: meta.category || meta.categories || inst?.category || [],
      developers,
      installed: !!inst,
      playtimeSeconds: inst?.playtimeSeconds || 0,
      lastPlayed: inst?.lastPlayed || null,
      versionInstalled: installedVersion,
      versionLatest: latestVersion,
      update,
      changelogUrl: meta?.changelogUrl || null,
      inputSupport,
      zipUrl,
      autoUpdateEnabled: autoEnabled,
      downloadBytes,
      installedSizeBytes: Number(inst?.installedSizeBytes || inst?.extractedSizeBytes || inst?.installedBytes || 0) || 0,
      canFetchRemoteSize
    };

    return { game, meta, inst };
  }

  function needFullRebuild(root, game) {
    const cur = String(root?.dataset?.nxDetailsGameId || "");
    if (!cur) return true;
    if (cur !== String(game.id)) return true;

    // If the "shape" of the right column changes, do a full rebuild (rare; avoids broken layouts)
    const hasUpdateBtn = !!document.getElementById("detailsUpdateBtn");
    const shouldHaveUpdateBtn = !!(game.installed && game.update);

    const hasChangelogBtn = !!document.getElementById("detailsChangelogBtn");
    const shouldHaveChangelogBtn = !!game.changelogUrl;

    const hasUninstallBtn = !!document.getElementById("detailsUninstallBtn");
    const shouldHaveUninstallBtn = !!game.installed;

    if (hasUpdateBtn !== shouldHaveUpdateBtn) return true;
    if (hasChangelogBtn !== shouldHaveChangelogBtn) return true;
    if (hasUninstallBtn !== shouldHaveUninstallBtn) return true;

    const hasCheckUpdatesBtn = !!document.getElementById("detailsCheckUpdatesBtn");
    const shouldHaveCheckUpdatesBtn = !!game.installed;
    if (hasCheckUpdatesBtn !== shouldHaveCheckUpdatesBtn) return true;

    return false;
  }

  async function updateDownloadSizeUI(game) {
    const el = document.getElementById("detailsDownloadSizeValue");
    if (!el) return;

    // show best-known immediately (no flashing)
    if (Number(game.downloadBytes || 0) > 0) {
      setTextIfChanged(el, formatBytes(game.downloadBytes));
      return;
    }

    if (!game.canFetchRemoteSize || !game.zipUrl) {
      setTextIfChanged(el, "—");
      return;
    }

    // If we don't know yet, keep current text unless empty
    if (!el.textContent || el.textContent.trim() === "") {
      setTextIfChanged(el, "Loading…");
    }

    const bytes = Number(await getRemoteFileSizeCached(game.zipUrl)) || 0;
    if (bytes > 0) {
      game.downloadBytes = bytes;
      setTextIfChanged(el, formatBytes(bytes));
    } else {
      setTextIfChanged(el, "—");
    }
  }


// ✅ Installed (extracted) size UI (lazy backfill for older installs)
const __nxInstalledSizeCache = new Map();
const __nxInstalledSizeInflight = new Map();

async function ensureInstalledSizeBytes(game) {
  const gid = String(game?.id || "");
  if (!gid) return 0;

  const cached = Number(__nxInstalledSizeCache.get(gid) || 0);
  if (cached > 0) return cached;

  if (__nxInstalledSizeInflight.has(gid)) return Number(await __nxInstalledSizeInflight.get(gid)) || 0;

  const p = (async () => {
    try {
      if (typeof window.api?.ensureInstalledSize !== "function") return 0;
      const r = await window.api.ensureInstalledSize(gid);
      const b = Number(r?.bytes || 0) || 0;
      if (b > 0) __nxInstalledSizeCache.set(gid, b);
      return b;
    } catch {
      return 0;
    } finally {
      __nxInstalledSizeInflight.delete(gid);
    }
  })();

  __nxInstalledSizeInflight.set(gid, p);
  return Number(await p) || 0;
}

// -------------------------------------------------
// ✅ Danger action button polish (Uninstall)
// -------------------------------------------------
const DANGER_BTN_STYLE_ID = "nxDangerActionBtnStyle";
function ensureDangerActionButtonStyles() {
  if (document.getElementById(DANGER_BTN_STYLE_ID)) return;

  const s = document.createElement("style");
  s.id = DANGER_BTN_STYLE_ID;
  s.textContent = `
    /* Uninstall button — modern "danger" glow + smooth press (matches primary polish) */
    #detailsUninstallBtn{
      position: relative;
      overflow: hidden;
      border-radius: 18px;

      border: 1px solid rgba(255,60,90,.22);
      background: rgba(255,60,90,.14);
      color: rgba(255,255,255,.92);

      box-shadow:
        0 18px 54px rgba(255,60,90,.14),
        0 0 0 1px rgba(255,60,90,.12) inset;

      transition:
        filter .18s ease,
        box-shadow .20s ease,
        transform .14s ease,
        background .18s ease,
        border-color .18s ease;
      will-change: transform, filter;
    }

    #detailsUninstallBtn::after{
      content:"";
      position:absolute;
      inset: 0;
      background: radial-gradient(120% 140% at 20% 0%,
        rgba(255,255,255,.14),
        rgba(255,255,255,0) 60%);
      opacity: .75;
      pointer-events:none;
    }

    #detailsUninstallBtn::before{
      content:"";
      position:absolute;
      inset: -18px;
      border-radius: 999px;
      background: radial-gradient(60% 60% at 50% 50%,
        rgba(255,60,90,.42),
        rgba(255,60,90,0) 70%);
      filter: blur(14px);
      opacity: .45;
      transform: scale(1);
      pointer-events:none;
      transition: opacity .18s ease, transform .18s ease, filter .18s ease;
      z-index: -1;
    }

    #detailsUninstallBtn:hover{
      background: rgba(255,60,90,.18);
      border-color: rgba(255,60,90,.28);
      filter: brightness(1.04);
      box-shadow:
        0 22px 64px rgba(255,60,90,.18),
        0 0 0 1px rgba(255,60,90,.16) inset;
      transform: scale(1.01);
    }
    #detailsUninstallBtn:hover::before{
      opacity: .62;
      filter: blur(16px);
      transform: scale(1.02);
    }

    #detailsUninstallBtn:active{
      filter: brightness(1.01);
      transform: scale(.992);
    }
    #detailsUninstallBtn:active::before{
      opacity: .54;
      transform: scale(.99);
    }

    #detailsUninstallBtn:disabled{
      opacity: .65;
      cursor: default;
      transform: none;
      filter: none;
      box-shadow: none;
      border-color: rgba(255,255,255,.10);
      background: rgba(255,255,255,.08);
    }
    #detailsUninstallBtn:disabled::before,
    #detailsUninstallBtn:disabled::after{
      opacity: 0;
    }
  `;
  document.head.appendChild(s);
}


// -------------------------------------------------
// ✅ Primary action button polish (Play / Install)
// -------------------------------------------------
const PRIMARY_BTN_STYLE_ID = "nxPrimaryActionBtnStyle";
function ensurePrimaryActionButtonStyles() {
  if (document.getElementById(PRIMARY_BTN_STYLE_ID)) return;

  const s = document.createElement("style");
  s.id = PRIMARY_BTN_STYLE_ID;
  s.textContent = `
    /* Details primary action (Play Now / Install) — modern glow + smooth press */
    #detailsPrimaryBtn{
      position: relative;
      overflow: hidden;
      border-radius: 18px;
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

    /* soft internal highlight */
    #detailsPrimaryBtn::after{
      content:"";
      position:absolute;
      inset: 0;
      background: radial-gradient(120% 140% at 20% 0%,
        rgba(255,255,255,.18),
        rgba(255,255,255,0) 60%);
      opacity: .9;
      pointer-events:none;
    }

    /* outer glow aura */
    #detailsPrimaryBtn::before{
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

    #detailsPrimaryBtn:hover{
      filter: brightness(1.05);
      box-shadow:
        0 22px 64px rgba(124,92,255,.26),
        0 0 0 1px rgba(124,92,255,.22) inset;
      transform: scale(1.01);
    }
    #detailsPrimaryBtn:hover::before{
      opacity: .72;
      filter: blur(16px);
      transform: scale(1.02);
    }

    #detailsPrimaryBtn:active{
      filter: brightness(1.02);
      transform: scale(.992);
    }
    #detailsPrimaryBtn:active::before{
      opacity: .62;
      transform: scale(.99);
    }

    #detailsPrimaryBtn:disabled{
      opacity: .65;
      cursor: default;
      transform: none;
      filter: none;
      box-shadow: none;
      border-color: rgba(255,255,255,.10);
      background: rgba(255,255,255,.10);
    }
    #detailsPrimaryBtn:disabled::before,
    #detailsPrimaryBtn:disabled::after{
      opacity: 0;
    }

    /* Keep Update button consistent (subtle) */
    #detailsUpdateBtn{
      border-radius: 18px;
      transition: filter .18s ease, box-shadow .20s ease, transform .14s ease, background .18s ease;
    }
    #detailsUpdateBtn:hover{
      filter: brightness(1.04);
      box-shadow: 0 16px 44px rgba(0,0,0,.18);
    }
    #detailsUpdateBtn:active{
      transform: scale(.992);
    }
  `;
  document.head.appendChild(s);
}


async function updateInstalledSizeUI(game) {
  const el = document.getElementById("detailsInstalledSizeValue");
  if (!el) return;

  if (!game?.installed) {
    setTextIfChanged(el, "—");
    return;
  }

  const known = Number(game.installedSizeBytes || 0);
  if (known > 0) {
    setTextIfChanged(el, formatBytes(known));
    return;
  }

  // show feedback once; avoid flicker
  if (!el.textContent || el.textContent.trim() === "—") setTextIfChanged(el, "Calculating…");

  const bytes = await ensureInstalledSizeBytes(game);
  if (bytes > 0) setTextIfChanged(el, formatBytes(bytes));
  else setTextIfChanged(el, "—");
}

  window.renderDetails = async function () {
    ensureDangerActionButtonStyles();
    ensurePrimaryActionButtonStyles();
    const root = document.getElementById("page");
    bindDetailsPhaseEventsOnce();
    bindDetailsEscOnce();
    if (!root) return;

    const selectedId = window.__selectedGame?.id;
    if (!selectedId) {
      root.innerHTML = `
        <div class="emptyState">
          <div class="emptyTitle">No game selected</div>
          <div class="muted">Go back to Library and select a game.</div>
        </div>
      `;
      return;
    }

    let store = { games: [] };
    let installed = {};
    let autoMap = {};

    try { store = await window.api.getStore(); } catch {}
    try { installed = await window.api.getInstalled(); } catch {}
    try { autoMap = (await window.api.getAutoUpdateMap?.()) || {}; } catch {}

    let downloads = [];
    try { downloads = (await window.api.getDownloads?.()) || []; } catch {}

    // If a download is already in progress, reflect it immediately (no need to wait for the next event)
    try {
      const gid = String(selectedId);
      const d = (downloads || []).find((x) => String(x?.gameId) === gid);
      if (d) {
        const st = String(d?.status || "").toLowerCase();
        if (st === "downloading") setPhaseForGame(gid, "downloading");
        else if (st === "completed") setPhaseForGame(gid, "installing");
        else if (st === "error" || st === "canceled") setPhaseForGame(gid, "");
      }
    } catch {}

    const { game } = await buildGameModel(String(selectedId), store, installed, autoMap);

    // ✅ FIX: prevent continuous flashing when renderDetails is called frequently (e.g. during downloads)
    // If we're already showing the same game and the UI shape didn't change, update only the dynamic bits.
    const samePageStable = !needFullRebuild(root, game);

    if (samePageStable) {
      // Keep DOM intact: comments don't reset; download size doesn't flip "Loading…"
      // Update key dynamic text only
      const titleEl = document.getElementById("detailsTitleText");
      if (titleEl) setTextIfChanged(titleEl, game.name);

      const metaEl = document.getElementById("detailsMetaText");
      if (metaEl) {
        const metaStr = `
          ${game.installed ? `v${game.versionInstalled}` : `v${game.versionLatest}`}
          •
          ${game.installed ? "Installed" : "Not installed"}
          ${
            game.installed
              ? ` • Playtime: ${formatPlaytime(game.playtimeSeconds)} • Last played: ${formatLastPlayed(game.lastPlayed)}`
              : ""
          }
          ${
            game.installed && game.update
              ? ` • Update → v${game.update.toVersion}`
              : ""
          }
        `.replace(/\s+/g, " ").trim();
        setTextIfChanged(metaEl, metaStr);
      }

      // Right-side info rows
      const verEl = document.getElementById("detailsInfoVersionValue");
      if (verEl) setTextIfChanged(verEl, game.installed ? `v${game.versionInstalled}` : `v${game.versionLatest}`);

      const statusEl = document.getElementById("detailsInfoStatusValue");
      if (statusEl) setTextIfChanged(statusEl, game.installed ? "Installed" : "Not installed");

      
      // Primary button label + action
      const primaryBtn = document.getElementById("detailsPrimaryBtn");
      if (primaryBtn) {
        const phase = String(game.phase || getPhaseForGame(game.id) || "");
        const defaultLabel = game.installed ? "Play Now" : "Install";
        primaryBtn.dataset.nxDefaultText = defaultLabel;

        if (!game.installed && (phase === "downloading" || phase === "installing")) {
          primaryBtn.disabled = true;
          setTextIfChanged(primaryBtn, phase === "installing" ? "Installing…" : "Downloading…");
        } else {
          primaryBtn.disabled = false;
          setTextIfChanged(primaryBtn, defaultLabel);
        }

        primaryBtn.onclick = async () => {
          if (primaryBtn.disabled) return;

          if (game.installed) {
            await window.api.launchGame(game.id);
            return;
          }

          const storeGame = (store.games || []).find((g) => String(g.id) === String(game.id));
          if (!storeGame) return;

          // Preflight first (so we don't show "Downloading…" if the user cancels)
          primaryBtn.disabled = true;
          setTextIfChanged(primaryBtn, "Checking…");

          try {
            const ok = await preflightDiskSpace(storeGame);
            if (!ok) {
              primaryBtn.disabled = false;
              setTextIfChanged(primaryBtn, "Install");
              return;
            }

            setPhaseForGame(game.id, "downloading");
            updateDetailsPhaseUI(game.id);

            await window.api.queueInstall(storeGame);
            // Keep disabled — download/install events will drive the label.
          } catch (e) {
            console.error(e);
            setPhaseForGame(game.id, "");
            updateDetailsPhaseUI(game.id);
            primaryBtn.disabled = false;
            setTextIfChanged(primaryBtn, "Install");
            toast("Failed to start install", "error");
          }
        };
      }


      // Update button label/state (if present) — show downloading/installing when an update is in progress
      const updateBtn = document.getElementById("detailsUpdateBtn");
      if (updateBtn) {
        if (!updateBtn.dataset.nxDefaultText) updateBtn.dataset.nxDefaultText = String(updateBtn.textContent || "").trim();
        const phase = String(game.phase || getPhaseForGame(game.id) || "");

        if (phase === "downloading" || phase === "installing") {
          updateBtn.disabled = true;
          setTextIfChanged(updateBtn, phase === "installing" ? "Installing…" : "Downloading…");
        } else {
          updateBtn.disabled = false;
          setTextIfChanged(updateBtn, updateBtn.dataset.nxDefaultText);
        }
      }


      // Check-for-updates button state (per-game, no global toast)
      const checkBtn = document.getElementById("detailsCheckUpdatesBtn");
      if (checkBtn) {
        updateDetailsCheckUpdatesUI(game.id);
        // handler is bound on full build; keep it if present
      }

      // Auto-update toggle: keep state in sync
      const au = document.getElementById("detailsAutoUpdateToggle");
      if (au) {
        // only set if different to avoid a visible toggle jump
        if (!!au.checked !== !!game.autoUpdateEnabled) au.checked = !!game.autoUpdateEnabled;
      }

      await updateDownloadSizeUI(game);
      await updateInstalledSizeUI(game);
      return;
    }

    // Full rebuild path (first render, game switch, or UI shape changes)
    try {
      window.__nxCommentsTeardown?.();
    } catch {}

    const heroUrl = toImg(game.hero);

    const phase = String(game.phase || getPhaseForGame(game.id) || "");

    const primaryLabel = game.installed
      ? "Play Now"
      : (phase === "installing" ? "Installing…" : (phase === "downloading" ? "Downloading…" : "Install"));

    const primaryDisabled = !game.installed && (phase === "downloading" || phase === "installing");

    const updateLabel = phase === "installing"
      ? "Installing…"
      : (phase === "downloading" ? "Downloading…" : null);


    const downloadSizeInitialText =
      game.downloadBytes > 0 ? formatBytes(game.downloadBytes) : (game.canFetchRemoteSize ? "Loading…" : "—");

    root.dataset.nxDetailsGameId = String(game.id);

    root.innerHTML = `
      <div class="detailsHero" style="background-image:url('${heroUrl}')">
        <button class="backBtn" id="detailsBackBtn" type="button">← Back</button>

        <div class="detailsHeroText">
          <h1 class="detailsTitle" id="detailsTitleText">${escapeHtml(game.name)}</h1>
          <div class="detailsMeta" id="detailsMetaText">
            ${game.installed ? `v${game.versionInstalled}` : `v${game.versionLatest}`}
            <span class="dotSep">•</span>
            ${game.installed ? "Installed" : "Not installed"}
            ${
              game.installed
                ? ` <span class="dotSep">•</span> Playtime: ${formatPlaytime(game.playtimeSeconds)}
                    <span class="dotSep">•</span> Last played: ${formatLastPlayed(game.lastPlayed)}`
                : ""
            }
            ${
              game.installed && game.update
                ? ` <span class="dotSep">•</span> Update → v${game.update.toVersion}`
                : ""
            }
          </div>
        </div>
      </div>

      <div class="detailsBody">
        <div class="detailsLeft">
          <div class="sectionTitle">About the Game</div>
          <p class="detailsDesc">${escapeHtml(game.description || "No description provided.")}</p>

          <div style="height:18px;"></div>

          <div class="sectionTitle">Images</div>
          ${
            game.images.length
              ? `<div class="shots" id="detailsImages">
                   ${game.images
                     .map((s, i) => {
                       const u = toImg(s);
                       return `<div class="shot" role="button" tabindex="0" data-img-idx="${i}" style="background-image:url('${u}')"></div>`;
                     })
                     .join("")}
                 </div>`
              : `<div class="muted">No images added yet.</div>`
          }

          <div id="nxCommentsMount"></div>
        </div>

        <div class="detailsRight">
          <button class="ctaBtn" id="detailsPrimaryBtn" type="button" ${primaryDisabled ? "disabled" : ""}>
            ${escapeHtml(primaryLabel)}
          </button>

          ${
            game.installed && game.update
              ? `<button class="btnSecondary" id="detailsUpdateBtn" type="button" ${updateLabel ? "disabled" : ""}>
                   ${updateLabel ? escapeHtml(updateLabel) : `Update to v${escapeHtml(game.update.toVersion)}`}
                 </button>`
              : ``
          }
          ${
            game.installed
              ? `<button class="btnSecondary" id="detailsCheckUpdatesBtn" type="button" ${isCheckUpdatesInFlight(game.id) ? "disabled" : ""}>
                   ${isCheckUpdatesInFlight(game.id) ? "Checking…" : "Check for updates"}
                 </button>`
              : ``
          }


          ${
            game.changelogUrl
              ? `<button class="btnSecondary" id="detailsChangelogBtn" type="button">
                   Changelog
                 </button>`
              : ``
          }

          <div class="infoCard">
            <div class="infoRow"><span>Version</span><span id="detailsInfoVersionValue">${
              game.installed ? `v${escapeHtml(game.versionInstalled)}` : `v${escapeHtml(game.versionLatest)}`
            }</span></div>

            <div class="infoRow"><span>Status</span><span id="detailsInfoStatusValue">${game.installed ? "Installed" : "Not installed"}</span></div>

            <div class="infoRow"><span>Download size</span><span id="detailsDownloadSizeValue">${downloadSizeInitialText}</span></div>

            <div class="infoRow"><span>Installed size</span><span id="detailsInstalledSizeValue">${game.installed ? (game.installedSizeBytes > 0 ? formatBytes(game.installedSizeBytes) : "—") : "—"}</span></div>

            <div class="infoRow"><span>Category</span><span>${
              Array.isArray(game.category) ? escapeHtml(game.category.join(", ")) : escapeHtml(game.category || "—")
            }</span></div>

            <div class="infoRow"><span>Developer</span><span>${
              game.developers.length ? escapeHtml(game.developers.join(", ")) : "—"
            }</span></div>
          </div>

          ${renderAutoUpdateCard(game.id, game.autoUpdateEnabled, game.installed)}

          ${renderInputSupportCard(game.inputSupport)}

          ${
            game.installed
              ? `
                <button class="btnSecondary" id="detailsResetPlaytimeBtn" type="button">
                  Reset playtime
                </button>

                <button class="dangerBtn" id="detailsUninstallBtn" type="button">Uninstall</button>
              `
              : ``
          }
        </div>
      </div>
    `;

    ensureDetailsSpacingStyles();
    ensureLightboxStyles();

    // ✅ Update download size without flicker (cached + text-only update)
    await updateDownloadSizeUI(game);
    await updateInstalledSizeUI(game);

    const imgWrap = document.getElementById("detailsImages");
    if (imgWrap) {
      imgWrap.addEventListener("click", (e) => {
        const el = e.target.closest("[data-img-idx]");
        if (!el) return;
        const idx = Number(el.dataset.imgIdx || 0);
        openLightbox(game.images, idx);
      });

      imgWrap.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        const el = e.target.closest("[data-img-idx]");
        if (!el) return;
        e.preventDefault();
        const idx = Number(el.dataset.imgIdx || 0);
        openLightbox(game.images, idx);
      });
    }

    const backBtn = document.getElementById("detailsBackBtn");
    backBtn.onclick = () => {
      const prev = window.__previousPage || "library";
      window.loadPage(prev);
    };


    const primaryBtn = document.getElementById("detailsPrimaryBtn");
    if (primaryBtn) {
      const defaultLabel = game.installed ? "Play Now" : "Install";
      primaryBtn.dataset.nxDefaultText = defaultLabel;

      // Ensure label reflects any in-progress download/install
      updateDetailsPhaseUI(game.id);

      primaryBtn.onclick = async () => {
        if (primaryBtn.disabled) return;

        if (game.installed) {
          await window.api.launchGame(game.id);
          return;
        }

        const storeGame = (store.games || []).find((g) => String(g.id) === String(game.id));
        if (!storeGame) return;

        primaryBtn.disabled = true;
        setTextIfChanged(primaryBtn, "Checking…");

        try {
          const ok = await preflightDiskSpace(storeGame);
          if (!ok) {
            primaryBtn.disabled = false;
            setTextIfChanged(primaryBtn, "Install");
            return;
          }

          setPhaseForGame(game.id, "downloading");
          updateDetailsPhaseUI(game.id);

          await window.api.queueInstall(storeGame);
          // Keep disabled — download/install events will drive the label.
        } catch (e) {
          console.error(e);
          setPhaseForGame(game.id, "");
          updateDetailsPhaseUI(game.id);
          primaryBtn.disabled = false;
          setTextIfChanged(primaryBtn, "Install");
          toast("Failed to start install", "error");
        }
      };
    }





    
    const checkUpdatesBtn = document.getElementById("detailsCheckUpdatesBtn");
    if (checkUpdatesBtn) {
      // reflect current in-flight state (if any)
      updateDetailsCheckUpdatesUI(game.id);

      checkUpdatesBtn.onclick = async () => {
        if (checkUpdatesBtn.disabled) return;

        await checkUpdatesForGame(game);
      };
    }

const updateBtn = document.getElementById("detailsUpdateBtn");
    if (updateBtn) {
      if (!updateBtn.dataset.nxDefaultText) updateBtn.dataset.nxDefaultText = String(updateBtn.textContent || "").trim();

      // Ensure label reflects any in-progress update install/download
      updateDetailsPhaseUI(game.id);

      updateBtn.onclick = async () => {
        if (updateBtn.disabled) return;

        updateBtn.disabled = true;
        setTextIfChanged(updateBtn, "Checking…");

        try {
          const storeGame = (store.games || []).find((g) => String(g.id) === String(game.id));
          if (storeGame) {
            const ok = await preflightDiskSpace(storeGame);
            if (!ok) {
              updateBtn.disabled = false;
              setTextIfChanged(updateBtn, updateBtn.dataset.nxDefaultText);
              return;
            }
          }

          setPhaseForGame(game.id, "downloading");
          updateDetailsPhaseUI(game.id);

          await window.api.queueUpdate(game.id);
          window.loadPage("downloads");
        } catch (e) {
          console.error(e);
          setPhaseForGame(game.id, "");
          updateDetailsPhaseUI(game.id);
          updateBtn.disabled = false;
          setTextIfChanged(updateBtn, updateBtn.dataset.nxDefaultText);
          toast("Failed to start update", "error");
        }
      };
    }



    const au = document.getElementById("detailsAutoUpdateToggle");
    if (au) {
      au.addEventListener("change", async () => {
        const nextVal = !!au.checked;
        au.disabled = true;
        try {
          const res = await window.api.setAutoUpdateForGame(game.id, nextVal);
          if (!res?.ok) throw new Error(res?.error || "Failed");
        } catch (e) {
          console.error(e);
          au.checked = !nextVal;
        } finally {
          au.disabled = false;
        }
      });
    }

    const changelogBtn = document.getElementById("detailsChangelogBtn");
    if (changelogBtn) {
      changelogBtn.onclick = async () => {
        changelogBtn.disabled = true;
        try {
          const res = await window.api.getChangelog(game.id);
          if (!res?.ok) throw new Error(res?.error || "Failed to fetch changelog");
          const entries = normalizeChangelogEntries(res.data);
          openChangelogModal(game.name, entries);
        } catch (e) {
          console.error(e);
        } finally {
          changelogBtn.disabled = false;
        }
      };
    }

    const resetBtn = document.getElementById("detailsResetPlaytimeBtn");
    if (resetBtn) {
      resetBtn.onclick = async () => {
        const ok = await confirmResetPlaytime(game.name);
        if (!ok) return;

        resetBtn.disabled = true;
        const oldText = resetBtn.textContent;
        resetBtn.textContent = "Resetting...";

        try {
          const res = await window.api.resetPlaytime(game.id);
          if (!res?.ok) throw new Error(res?.error || "Reset failed");
          await window.renderDetails();
        } catch (e) {
          console.error(e);
          resetBtn.disabled = false;
          resetBtn.textContent = oldText;
        }
      };
    }

    const uninstallBtn = document.getElementById("detailsUninstallBtn");
    if (uninstallBtn) {
      uninstallBtn.onclick = async () => {
        const ok = await confirmUninstall(game.name);
        if (!ok) return;

        uninstallBtn.disabled = true;
        const oldText = uninstallBtn.textContent;
        uninstallBtn.textContent = "Uninstalling...";

        try {
          await window.api.uninstallGame(game.id);
          window.loadPage("library");
        } catch {
          uninstallBtn.disabled = false;
          uninstallBtn.textContent = oldText;
        }
      };
    }

    try {
      await initCommentsFeature(game.id);
    } catch (e) {
      console.error("Comments init failed:", e);
    }
  };
})();
