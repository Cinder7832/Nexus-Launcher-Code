// analytics.page.js
(function () {
  const STYLE_ID = "nxAnalyticsStylesV3";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      /* ✅ HARD FIX: remove bottom horizontal scrollbar (Analytics was causing scrollWidth > clientWidth) */
      html, body { overflow-x: hidden; }
      #page { overflow-x: hidden; }
      #analyticsWrap { overflow-x: hidden; }
      .nxAna { overflow-x: hidden; }

      .nxAna{
        display:flex;
        flex-direction:column;
        gap: 16px;
        min-width: 0;
      }

      .nxCard{
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.06);
        border-radius: 22px;
        padding: 18px;
        box-shadow: 0 24px 70px rgba(0,0,0,.25);
        min-width: 0;
      }

      .nxCardTitle{
        font-size: 16px;
        font-weight: 950;
        letter-spacing: -0.2px;
        display:flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
      }
      .nxCardSub{
        margin-top: 8px;
        color: rgba(255,255,255,.62);
        font-weight: 750;
        font-size: 13px;
        line-height: 1.35;
      }

      .nxPill{
        font-size: 11px;
        font-weight: 950;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.06);
        color: rgba(255,255,255,.92);
        white-space: nowrap;
        display:inline-flex;
        align-items:center;
        justify-content:center;
        line-height: 1;
      }

      .nxRow{
        display:flex;
        gap: 12px;
        align-items:center;
        flex-wrap: wrap;
        min-width: 0;
      }

      .nxInput{
        flex: 1 1 280px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.06);
        color: rgba(255,255,255,.92);
        border-radius: 16px;
        padding: 12px 14px;
        font-weight: 850;
        outline: none;
        min-width: 0;
      }
      .nxInput::placeholder{ color: rgba(255,255,255,.45); }

      /* ---- Modern menu (replaces native selects) ---- */
      .nxMenuWrap{ position: relative; flex: 0 0 auto; }

      .nxMenuBtn{
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.06);
        color: rgba(255,255,255,.92);
        border-radius: 14px;
        padding: 10px 12px;
        font-weight: 900;
        cursor: pointer;
        outline: none;
        display:inline-flex;
        align-items:center;
        gap: 10px;
        transition: background .16s ease, border-color .16s ease, transform .16s ease;
        white-space: nowrap;
      }
      .nxMenuBtn:hover{
        background: rgba(255,255,255,.09);
        border-color: rgba(255,255,255,.14);
      }
      .nxMenuBtn:active{ transform: translateY(0) scale(.98); }
      .nxMenuBtn svg{
        width: 16px;
        height: 16px;
        stroke: rgba(255,255,255,.82);
        fill: none;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        transition: transform .18s ease;
      }
      .nxMenuBtn.open svg{ transform: rotate(180deg); }

      .nxMenuPanel{
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        min-width: 180px;
        max-width: 260px;
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
      }
      .nxMenuPanel.open{
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      .nxMenuItem{
        width: 100%;
        text-align: left;
        padding: 10px 10px;
        border-radius: 12px;
        border: 1px solid transparent;
        background: transparent;
        color: rgba(255,255,255,.92);
        font-weight: 900;
        cursor: pointer;
        display:flex;
        align-items:center;
        justify-content: space-between;
        gap: 10px;
        transition: background .14s, color .14s, border-color .14s;
      }
      .nxMenuItem:hover, .nxMenuItem:active {
        background: rgba(255,255,255,0.06);
        color: #fff;
        border-color: rgba(255,255,255,0.12);
      }

      .nxMenuCheck{
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        opacity: 0;
        background: none;
        border: none;
        box-shadow: none;
        transition: opacity .14s;
      }
      .nxMenuItem.active {
        background: rgba(124,92,255,.18);
        color: rgba(255,255,255,.95);
        border-color: rgba(124,92,255,.26);
        box-shadow: 0 14px 34px rgba(124,92,255,.12);
      }
      .nxMenuItem.active .nxMenuCheck {
        opacity: 1;
      }
      .nxMenuCheck svg{
        width: 18px;
        height: 18px;
        stroke: #fff;
        fill: none;
        stroke-width: 2.5;
        stroke-linecap: round;
        stroke-linejoin: round;
        display: block;
      }

      /* ---- Overview cards ---- */
      .nxOverview{
        display:grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        min-width: 0;
      }
      @media (max-width: 1020px){
        .nxOverview{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 560px){
        .nxOverview{ grid-template-columns: 1fr; }
      }

      .nxMini{
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.06);
        border-radius: 20px;
        padding: 14px 14px 12px;
        min-width: 0;
      }
      .nxMiniLabel{ color: rgba(255,255,255,.62); font-weight: 850; font-size: 12px; }
      .nxMiniValue{
        margin-top: 6px;
        font-size: 22px;
        font-weight: 950;
        letter-spacing: -0.3px;
        overflow:hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nxMiniSub{ margin-top: 6px; color: rgba(255,255,255,.55); font-weight: 800; font-size: 12px; }

      /* ---- Main grid (chart + distribution) ---- */
      .nxMainGrid{
        display:grid;
        grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
        gap: 12px;
        align-items: start;
        min-width: 0;
      }
      @media (max-width: 980px){ .nxMainGrid{ grid-template-columns: 1fr; } }

      /* ---- Top dev chart ---- */
      .nxChart{ margin-top: 14px; display:flex; flex-direction:column; gap: 12px; min-width: 0; }
      .nxBarRow{
        display:grid;
        grid-template-columns: 1fr 260px;
        gap: 14px;
        align-items: center;
        min-width: 0;
      }
      @media (max-width: 760px){ .nxBarRow{ grid-template-columns: 1fr; } }
      .nxDevName{
        font-weight: 950;
        font-size: 13.5px;
        color: rgba(255,255,255,.92);
        overflow:hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nxDevMeta{ margin-top: 6px; color: rgba(255,255,255,.55); font-weight: 850; font-size: 12px; }
      .nxBarTrack{
        height: 14px;
        border-radius: 999px;
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,255,255,.08);
        overflow: hidden;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
        min-width: 0;
      }
      .nxBarFill{
        height: 100%;
        border-radius: 999px;
        background:
          radial-gradient(120% 140% at 20% 0%, rgba(255,255,255,.18), rgba(255,255,255,0) 60%),
          rgba(124,92,255,.88);
        box-shadow: 0 16px 40px rgba(124,92,255,.18);
        transform-origin: left center;
        transform: scaleX(0);
      }
      .nxAnimate .nxBarFill{ transition: transform 560ms cubic-bezier(.2,.9,.2,1); }

      /* ---- Distribution ---- */
      .nxDistGrid{
        margin-top: 14px;
        display:grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 10px;
        align-items: end;
        min-width: 0;
      }
      .nxDistCol{
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.06);
        border-radius: 18px;
        padding: 10px;
        display:flex;
        flex-direction:column;
        justify-content:flex-end;
        gap: 8px;
        min-height: 150px;
        min-width: 0;
      }
      .nxDistBarTrack{
        height: 86px;
        border-radius: 16px;
        background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.07);
        overflow:hidden;
        display:flex;
        align-items:flex-end;
      }
      .nxDistBar{
        width: 100%;
        height: 0%;
        border-radius: 16px;
        background:
          radial-gradient(120% 140% at 20% 0%, rgba(255,255,255,.18), rgba(255,255,255,0) 60%),
          rgba(124,92,255,.78);
        transform-origin: bottom center;
        transform: scaleY(0);
      }
      .nxAnimate .nxDistBar{ transition: transform 560ms cubic-bezier(.2,.9,.2,1); }
      .nxDistLabel{ font-weight: 950; font-size: 12px; color: rgba(255,255,255,.88); white-space: nowrap; }
      .nxDistCount{ color: rgba(255,255,255,.62); font-weight: 850; font-size: 12px; white-space: nowrap; }

      /* ---- Developer list ---- */
      .nxListHead{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 12px;
        margin-bottom: 12px;
        min-width: 0;
      }

      .nxList{
        display:flex;
        flex-direction:column;
        gap: 10px;
        max-height: 520px;
        overflow:auto;
        padding-right: 6px;
        min-width: 0;
      }

      .nxDevWrap{ display:flex; flex-direction:column; gap: 8px; }

      .nxListItem{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 12px;
        padding: 12px 12px;
        border-radius: 18px;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.06);
        cursor:pointer;
        transition: background .16s ease, transform .16s ease, border-color .16s ease;
        user-select: none;
      }
      .nxListItem:hover{
        background: rgba(255,255,255,.06);
        border-color: rgba(255,255,255,.10);
        /* No transform on hover */
      }
      .nxListItem:active{ transform: translateY(0px); }

      .nxListItem.open{
        background: rgba(255,255,255,.06);
        border-color: rgba(255,255,255,.10);
        box-shadow: 0 18px 40px rgba(0,0,0,.22);
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
      }

      .nxListLeft{
        min-width:0;
        display:flex;
        flex-direction:column;
        gap: 6px;
        flex: 1 1 auto;
      }
      .nxListName{
        font-weight: 950;
        font-size: 13.5px;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .nxListSub{ color: rgba(255,255,255,.60); font-weight: 850; font-size: 12px; }

      .nxListRight{ display:flex; align-items:center; gap: 10px; flex: 0 0 auto; }
      .nxBadge{
        height: 34px;
        min-width: 34px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.06);
        display:inline-flex;
        align-items:center;
        justify-content:center;
        font-weight: 950;
        font-size: 12px;
        color: rgba(255,255,255,.92);
      }
      .nxChevron{
        width: 34px;
        height: 34px;
        border-radius: 14px;
        display:grid;
        place-items:center;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(255,255,255,.06);
      }
      .nxChevron svg{
        width: 16px;
        height: 16px;
        stroke: rgba(255,255,255,.82);
        fill: none;
        stroke-width: 2.4;
        stroke-linecap: round;
        stroke-linejoin: round;
        transition: transform .18s ease;
      }
      .nxListItem.open .nxChevron svg{ transform: rotate(90deg); }

      /* ---- Dropdown (inline expand) ---- */
      .nxExpand{
        border-radius: 0 0 18px 18px;
        background: rgba(255,255,255,.03);
        border: 1px solid rgba(255,255,255,.06);
        border-top: none;
        overflow: hidden;
        max-height: 0;
        opacity: 0;
        transform: translateY(-4px);
        transition: max-height .26s cubic-bezier(.2,.9,.2,1), opacity .18s ease, transform .26s cubic-bezier(.2,.9,.2,1);
      }
      .nxExpand.open{
        max-height: 520px; /* big enough for many games */
        opacity: 1;
        transform: translateY(0);
      }
      .nxExpandInner{
        padding: 12px;
        display:flex;
        flex-direction:column;
        gap: 10px;
      }
      .nxExpandTitle{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 12px;
        font-weight: 950;
        color: rgba(255,255,255,.92);
        font-size: 13px;
      }
      .nxExpandHint{
        color: rgba(255,255,255,.55);
        font-weight: 850;
        font-size: 12px;
      }
      .nxGamesList{
        display:flex;
        flex-direction:column;
        gap: 8px;
        max-height: 340px;
        overflow:auto;
        padding-right: 4px;
      }
      .nxGameRow{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 12px;
        padding: 10px 10px;
        border-radius: 14px;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.06);
        transition: transform .14s ease, background .14s ease, border-color .14s ease;
      }
      .nxGameRow:hover{
        background: rgba(255,255,255,.06);
        border-color: rgba(255,255,255,.10);
        /* No transform on hover */
      }
      .nxGameName{
        min-width:0;
        flex: 1 1 auto;
        font-weight: 900;
        font-size: 12.5px;
        color: rgba(255,255,255,.92);
        overflow:hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nxGameVer{
        flex: 0 0 auto;
        font-weight: 950;
        font-size: 12px;
        color: rgba(255,255,255,.62);
        padding-left: 10px;
      }

      .nxEmpty{
        padding: 16px 14px;
        border-radius: 18px;
        background: rgba(255,255,255,.03);
        border: 1px solid rgba(255,255,255,.05);
        color: rgba(255,255,255,.65);
        font-weight: 800;
        line-height: 1.35;
      }

      @media (prefers-reduced-motion: reduce){
        .nxAnimate .nxBarFill{ transition: none !important; }
        .nxAnimate .nxDistBar{ transition: none !important; }
        .nxListItem{ transition: none !important; }
        .nxMenuBtn, .nxMenuPanel, .nxMenuItem{ transition: none !important; }
        .nxExpand{ transition: none !important; }
        .nxChevron svg{ transition: none !important; }
      }
    `;
    document.head.appendChild(s);
  }

  function getDevelopers(game) {
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

  // dev -> { dev, count, games: [{id,name,version}] }
  function buildDevMap(games) {
    const m = new Map();
    for (const g of games || []) {
      const devs = getDevelopers(g);
      if (devs.length === 0) continue;

      for (const dev of devs) {
        if (!m.has(dev)) m.set(dev, { dev, count: 0, games: [] });
        const entry = m.get(dev);
        entry.count += 1;
        entry.games.push({
          id: String(g?.id ?? ""),
          name: String(g?.name ?? "Game"),
          version: String(g?.version ?? "")
        });
      }
    }

    for (const v of m.values()) {
      v.games.sort(
        (a, b) =>
          (b.version || "").localeCompare(a.version || "") ||
          a.name.localeCompare(b.name)
      );
    }

    const list = Array.from(m.values());
    list.sort((a, b) => (b.count - a.count) || a.dev.localeCompare(b.dev));
    return list;
  }

  function computeDistribution(devList) {
    // buckets: 1, 2, 3, 4, 5+
    const buckets = [
      { label: "1", min: 1, max: 1, count: 0 },
      { label: "2", min: 2, max: 2, count: 0 },
      { label: "3", min: 3, max: 3, count: 0 },
      { label: "4", min: 4, max: 4, count: 0 },
      { label: "5+", min: 5, max: Infinity, count: 0 }
    ];

    for (const d of devList) {
      const n = d.count || 0;
      if (n <= 0) continue;
      if (n === 1) buckets[0].count++;
      else if (n === 2) buckets[1].count++;
      else if (n === 3) buckets[2].count++;
      else if (n === 4) buckets[3].count++;
      else buckets[4].count++;
    }

    const max = Math.max(1, ...buckets.map((b) => b.count));
    return { buckets, max };
  }

  function animateCharts() {
    const root = document.getElementById("nxAnaRoot");
    if (!root) return;

    requestAnimationFrame(() => {
      root.classList.add("nxAnimate");

      // top bars
      const fills = Array.from(root.querySelectorAll(".nxBarFill"));
      fills.forEach((f, idx) => {
        const w = Number(f.dataset.w || 0);
        const scale = Math.max(0, Math.min(1, w / 100));
        setTimeout(() => {
          f.style.transform = `scaleX(${scale})`;
        }, idx * 60);
      });

      // dist bars
      const db = Array.from(root.querySelectorAll(".nxDistBar"));
      db.forEach((b, idx) => {
        setTimeout(() => {
          b.style.transform = `scaleY(1)`;
        }, 140 + idx * 60);
      });
    });
  }

  function render(wrap, devList, totalGames) {
    const topDev = devList[0];
    const totalDevs = devList.length;
    const avg = totalDevs ? totalGames / totalDevs : 0;
    const dist = computeDistribution(devList);

    wrap.innerHTML = `
      <div class="nxAna" id="nxAnaRoot">
        <div class="nxOverview">
          <div class="nxMini">
            <div class="nxMiniLabel">Developers</div>
            <div class="nxMiniValue">${totalDevs}</div>
            <div class="nxMiniSub">Total credited devs</div>
          </div>

          <div class="nxMini">
            <div class="nxMiniLabel">Games</div>
            <div class="nxMiniValue">${totalGames}</div>
            <div class="nxMiniSub">Catalogue entries</div>
          </div>

          <div class="nxMini">
            <div class="nxMiniLabel">Avg. games/dev</div>
            <div class="nxMiniValue">${avg.toFixed(1)}</div>
            <div class="nxMiniSub">Credits included</div>
          </div>

          <div class="nxMini">
            <div class="nxMiniLabel">Top developer</div>
            <div class="nxMiniValue" title="${topDev?.dev || "—"}">${topDev?.dev ? topDev.dev : "—"}</div>
            <div class="nxMiniSub">${topDev?.count ? `${topDev.count} game${topDev.count === 1 ? "" : "s"}` : ""}</div>
          </div>
        </div>

        <div class="nxMainGrid">
          <div class="nxCard">
            <div class="nxCardTitle">
              <span>Top developers</span>
              <div class="nxRow">
                <span class="nxPill">${totalGames} games</span>

                <div class="nxMenuWrap" id="nxTopNWrap">
                  <button class="nxMenuBtn" id="nxTopNBtn" type="button" aria-haspopup="menu" aria-expanded="false">
                    <span id="nxTopNLabel">Top 10</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
                  </button>
                  <div class="nxMenuPanel" id="nxTopNMenu" role="menu" aria-label="Top N menu">
                    <button class="nxMenuItem" type="button" data-value="5" role="menuitem">
                      <span>Top 5</span>
                      <span class="nxMenuCheck" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                      </span>
                    </button>
                    <button class="nxMenuItem active" type="button" data-value="10" role="menuitem">
                      <span>Top 10</span>
                      <span class="nxMenuCheck" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                      </span>
                    </button>
                    <button class="nxMenuItem" type="button" data-value="20" role="menuitem">
                      <span>Top 20</span>
                      <span class="nxMenuCheck" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="nxCardSub"></div>
            <div class="nxChart" id="nxTopChart"></div>
          </div>

          <div class="nxCard">
            <div class="nxCardTitle">
              <span>Distribution</span>
              <span class="nxPill">${totalDevs} devs</span>
            </div>
            <div class="nxCardSub">How many developers have 1, 2, 3, 4 or 5+ games.</div>

            <div class="nxDistGrid" id="nxDist">
              ${dist.buckets
                .map((b) => {
                  const pct = (b.count / dist.max) * 100;
                  return `
                    <div class="nxDistCol" title="${b.count} developer(s)">
                      <div class="nxDistBarTrack">
                        <div class="nxDistBar" style="height:${pct.toFixed(2)}%"></div>
                      </div>
                      <div class="nxDistLabel">${b.label} game${b.label === "1" ? "" : "s"}</div>
                      <div class="nxDistCount">${b.count} dev${b.count === 1 ? "" : "s"}</div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        </div>

        <div class="nxCard">
          <div class="nxListHead">
            <div style="min-width:0;">
              <div class="nxCardTitle" style="justify-content:flex-start; gap:10px;">
                <span>Developers</span>
                <span class="nxPill">click to expand</span>
              </div>
              <div class="nxCardSub"></div>
            </div>

            <div class="nxRow" style="justify-content:flex-end; width:min(520px, 100%);">
              <input class="nxInput" id="nxSearch" placeholder="Search developer..." />

              <div class="nxMenuWrap" id="nxSortWrap">
                <button class="nxMenuBtn" id="nxSortBtn" type="button" aria-haspopup="menu" aria-expanded="false">
                  <span id="nxSortLabel">Most games</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>
                </button>
                <div class="nxMenuPanel" id="nxSortMenu" role="menu" aria-label="Sort menu">
                  <button class="nxMenuItem active" type="button" data-value="count" role="menuitem">
                    <span>Most games</span>
                    <span class="nxMenuCheck" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                    </span>
                  </button>
                  <button class="nxMenuItem" type="button" data-value="az" role="menuitem">
                    <span>A–Z</span>
                    <span class="nxMenuCheck" aria-hidden="true">
                      <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
                    </span>
                  </button>
                </div>
              </div>

            </div>
          </div>

          <div class="nxList" id="nxDevList"></div>
        </div>
      </div>
    `;

    const topChartEl = document.getElementById("nxTopChart");

    function drawTopChart(n) {
      const top = devList.slice(0, n);
      const max = Math.max(1, ...top.map((d) => d.count));

      topChartEl.innerHTML = "";
      for (const r of top) {
        const pct = (r.count / max) * 100;
        const row = document.createElement("div");
        row.className = "nxBarRow";
        row.innerHTML = `
          <div style="min-width:0;">
            <div class="nxDevName" title="${r.dev}">${r.dev}</div>
            <div class="nxDevMeta">${r.count} game${r.count === 1 ? "" : "s"}</div>
          </div>
          <div class="nxBarTrack" aria-label="${r.dev}: ${r.count}">
            <div class="nxBarFill" data-w="${pct.toFixed(2)}"></div>
          </div>
        `;
        topChartEl.appendChild(row);
      }

      const root = document.getElementById("nxAnaRoot");
      root?.classList.remove("nxAnimate");
      const fills = Array.from(root.querySelectorAll(".nxBarFill"));
      fills.forEach((f) => (f.style.transform = "scaleX(0)"));
      requestAnimationFrame(() => {
        root?.classList.add("nxAnimate");
        fills.forEach((f, idx) => {
          const w = Number(f.dataset.w || 0);
          const scale = Math.max(0, Math.min(1, w / 100));
          setTimeout(() => (f.style.transform = `scaleX(${scale})`), idx * 60);
        });
      });
    }


    let query = "";
    let sort = "count";
    // Load Top N from localStorage if available
    let topN = 10;
    const topNStorageKey = "nxAnalyticsTopN";
    const storedTopN = localStorage.getItem(topNStorageKey);
    if (storedTopN && !isNaN(Number(storedTopN))) {
      topN = Number(storedTopN);
    }
    let openDevKey = null;

    drawTopChart(topN);

    const listEl = document.getElementById("nxDevList");
    const searchEl = document.getElementById("nxSearch");

    function getList() {
      let arr = devList.slice();

      if (query) {
        const q = query.toLowerCase();
        arr = arr.filter((d) => d.dev.toLowerCase().includes(q));
      }

      if (sort === "az") {
        arr.sort((a, b) => a.dev.localeCompare(b.dev));
      } else {
        arr.sort((a, b) => (b.count - a.count) || a.dev.localeCompare(b.dev));
      }

      return arr;
    }

    function closeAllExpands() {
      listEl.querySelectorAll(".nxListItem.open").forEach((el) => el.classList.remove("open"));
      listEl.querySelectorAll(".nxExpand.open").forEach((el) => el.classList.remove("open"));
      openDevKey = null;
    }

    function fillExpand(expandEl, dev) {
      if (!expandEl) return;

      const games = Array.isArray(dev.games) ? dev.games : [];
      const rows = games.length
        ? games
            .map(
              (g) => `
                <div class="nxGameRow" title="${String(g?.name || "")}">
                  <div class="nxGameName">${String(g?.name || "Game")}</div>
                  ${g?.version ? `<div class="nxGameVer">v${String(g.version)}</div>` : `<div class="nxGameVer" style="opacity:.35;">—</div>`}
                </div>
              `
            )
            .join("")
        : `<div class="nxEmpty">No games found for this developer.</div>`;

      expandEl.innerHTML = `
        <div class="nxExpandInner">
          <div class="nxGamesList">${rows}</div>
        </div>
      `;

      // prevent clicking inside the dropdown from collapsing via bubbling
      expandEl.querySelectorAll(".nxGameRow").forEach((row, idx) => {
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          // Find the game object by index in dev.games
          const game = Array.isArray(dev.games) ? dev.games[idx] : null;
          if (game && game.id) {
            if (typeof window.showDetailsPage === "function") {
              window.showDetailsPage(game.id);
            } else if (typeof window.loadPage === "function") {
              window.__selectedGame = { id: game.id };
              window.loadPage("details");
            }
          }
        });
      });
    }

    function toggleExpand(devKey, wrapEl, itemEl, expandEl, dev) {
      if (!wrapEl || !itemEl || !expandEl) return;

      const isOpen = itemEl.classList.contains("open") && expandEl.classList.contains("open");

      // close current open (if different)
      if (openDevKey && openDevKey !== devKey) {
        closeAllExpands();
      }

      if (isOpen) {
        itemEl.classList.remove("open");
        expandEl.classList.remove("open");
        openDevKey = null;
      } else {
        fillExpand(expandEl, dev);
        itemEl.classList.add("open");
        expandEl.classList.add("open");
        openDevKey = devKey;
      }
    }

    function renderList() {
      const arr = getList();
      listEl.innerHTML = "";
      closeAllExpands();

      if (arr.length === 0) {
        listEl.innerHTML = `<div class="nxEmpty">No developers match your search.</div>`;
        return;
      }

      for (const r of arr) {
        const wrap = document.createElement("div");
        wrap.className = "nxDevWrap";
        const devKey = `dev:${r.dev}`;

        wrap.innerHTML = `
          <div class="nxListItem" role="button" tabindex="0" aria-expanded="false">
            <div class="nxListLeft">
              <div class="nxListName" title="${r.dev}">${r.dev}</div>
              <div class="nxListSub">${r.count} game${r.count === 1 ? "" : "s"}</div>
            </div>
            <div class="nxListRight">
              <span class="nxBadge">${r.count}</span>
              <span class="nxChevron" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M10 7l7 5-7 5"></path></svg>
              </span>
            </div>
          </div>
          <div class="nxExpand" aria-hidden="true"></div>
        `;

        const item = wrap.querySelector(".nxListItem");
        const expand = wrap.querySelector(".nxExpand");

        function onToggle() {
          toggleExpand(devKey, wrap, item, expand, r);
          const expanded = item.classList.contains("open");
          item.setAttribute("aria-expanded", expanded ? "true" : "false");
          expand.setAttribute("aria-hidden", expanded ? "false" : "true");
          // Add/remove .open on the wrap for styling
          if (expanded) {
            wrap.classList.add("open");
          } else {
            wrap.classList.remove("open");
          }
        }

        item.addEventListener("click", onToggle);
        item.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            closeAllExpands();
          }
        });

        listEl.appendChild(wrap);
      }
    }

    renderList();

    searchEl.addEventListener("input", () => {
      query = String(searchEl.value || "").trim();
      renderList();
    });

    function setupMenu({ btn, panel, labelEl, items, getLabelForValue, onSelect, initialValue }) {
      let open = false;
      let value = String(initialValue);

      function setActive(v) {
        value = String(v);
        if (labelEl) labelEl.textContent = getLabelForValue(value);
        items.forEach((it) => it.classList.toggle("active", String(it.dataset.value) === value));
        onSelect(value);
      }

      function openMenu() {
        open = true;
        btn.classList.add("open");
        panel.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }

      function closeMenu() {
        open = false;
        btn.classList.remove("open");
        panel.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
      }

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (open) closeMenu();
        else openMenu();
      });

      items.forEach((it) => {
        it.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const v = it.dataset.value;
          if (v != null) setActive(v);
          closeMenu();
        });
      });

      document.addEventListener("click", (e) => {
        if (!open) return;
        const t = e.target;
        if (btn.contains(t) || panel.contains(t)) return;
        closeMenu();
      });

      window.addEventListener("keydown", (e) => {
        if (!open) return;
        if (e.key === "Escape") closeMenu();
      });

      setActive(value);
      return { setActive, closeMenu };
    }

    const topNBtn = document.getElementById("nxTopNBtn");
    const topNMenu = document.getElementById("nxTopNMenu");
    const topNLabel = document.getElementById("nxTopNLabel");
    const topNItems = Array.from(topNMenu.querySelectorAll(".nxMenuItem"));

    setupMenu({
      btn: topNBtn,
      panel: topNMenu,
      labelEl: topNLabel,
      items: topNItems,
      getLabelForValue: (v) => `Top ${v}`,
      onSelect: (v) => {
        const n = Number(v || 10);
        topN = isFinite(n) ? n : 10;
        // Save to localStorage
        localStorage.setItem(topNStorageKey, String(topN));
        drawTopChart(topN);
      },
      initialValue: String(topN)
    });

    const sortBtn = document.getElementById("nxSortBtn");
    const sortMenu = document.getElementById("nxSortMenu");
    const sortLabel = document.getElementById("nxSortLabel");
    const sortItems = Array.from(sortMenu.querySelectorAll(".nxMenuItem"));

    setupMenu({
      btn: sortBtn,
      panel: sortMenu,
      labelEl: sortLabel,
      items: sortItems,
      getLabelForValue: (v) => (String(v) === "az" ? "A–Z" : "Most games"),
      onSelect: (v) => {
        sort = String(v || "count");
        renderList();
      },
      initialValue: sort
    });

    // Close any open dropdown when pressing ESC anywhere
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllExpands();
    });

    animateCharts();
  }

  window.renderAnalytics = async function () {
    ensureStyles();

    const wrap = document.getElementById("analyticsWrap");
    if (!wrap) return;

    wrap.innerHTML = `<div class="nxEmpty">Loading analytics…</div>`;

    let store = null;
    try {
      store = await window.api.getStore();
    } catch (e) {
      console.error(e);
      wrap.innerHTML = `<div class="nxEmpty">Failed to load store data.</div>`;
      return;
    }

    const games = store?.games || [];
    const devList = buildDevMap(games);

    if (devList.length === 0) {
      wrap.innerHTML = `
        <div class="nxAna">
          <div class="nxCard">
            <div class="nxCardTitle"><span>Analytics</span></div>
            <div class="nxCardSub">No developer data found in store.json.</div>
            <div class="nxEmpty" style="margin-top:14px;">
              Make sure each game has a <strong>developers</strong> array in the store catalogue.
            </div>
          </div>
        </div>
      `;
      return;
    }

    render(wrap, devList, games.length);
  };
})();
