// ============================================================
// Victory Vault Season 3 — Main Application Controller
// ============================================================

const APP = (() => {
    let appData = null;
    let computed = {};
    let activeTab = 'overview';
    let defaultTabSet = false;

    // --------------------------------------------------------
    // INITIALIZATION
    // --------------------------------------------------------
    async function init() {
        setupTabs();
        await refreshData();
    }

    // Total prize pool across every competition (single source of truth).
    function totalPrizePool() {
        return CONFIG.PRIZES.SEASON[1] + CONFIG.PRIZES.SEASON[2] + CONFIG.PRIZES.SEASON[3] +
            Object.keys(CONFIG.MONTHLY_PHASES).length * CONFIG.PRIZES.MONTHLY +
            CONFIG.PRIZES.LMS.WINNER + CONFIG.PRIZES.LMS.RUNNER +
            CONFIG.PRIZES.CHAMPIONS.WINNER + CONFIG.PRIZES.CHAMPIONS.RUNNER +
            CONFIG.PRIZES.WORLDCUP.WINNER + CONFIG.PRIZES.WORLDCUP.RUNNER +
            CONFIG.PRIZES.CUP + CONFIG.PRIZES.HIGHEST_GW;
    }

    function setupTabs() {
        const nav = document.getElementById('sidebar-nav');
        if (!nav) return;
        nav.innerHTML = '';

        const groups = {};
        for (const tab of CONFIG.TABS) (groups[tab.group] = groups[tab.group] || []).push(tab);
        const order = CONFIG.NAV_GROUPS || Object.keys(groups);

        for (const g of order) {
            if (!groups[g]) continue;
            const section = document.createElement('div');
            section.className = 'nav-group';
            section.innerHTML = `<div class="nav-group-label">${g}</div>`;
            for (const tab of groups[g]) {
                const btn = document.createElement('button');
                btn.className = `nav-item ${tab.id === activeTab ? 'active' : ''}`;
                btn.dataset.tab = tab.id;
                btn.innerHTML = `<span class="nav-ic">${tab.icon}</span><span class="nav-lbl">${tab.label}</span>`;
                btn.addEventListener('click', () => switchTab(tab.id));
                section.appendChild(btn);
            }
            nav.appendChild(section);
        }

        const pool = document.getElementById('pool-value');
        if (pool) pool.textContent = '$' + totalPrizePool().toLocaleString();

        setupNavToggle();
        updateTopbarTitle();
    }

    function updateTopbarTitle() {
        const tab = CONFIG.TABS.find(t => t.id === activeTab);
        const el = document.getElementById('topbar-title');
        if (el && tab) el.textContent = tab.label;
    }

    function closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const scrim = document.getElementById('sidebar-scrim');
        if (sidebar) sidebar.classList.remove('open');
        if (scrim) scrim.classList.remove('show');
    }

    function setupNavToggle() {
        const toggle = document.getElementById('nav-toggle');
        const sidebar = document.getElementById('sidebar');
        const scrim = document.getElementById('sidebar-scrim');
        if (!toggle || !sidebar) return;
        toggle.onclick = () => {
            const open = sidebar.classList.toggle('open');
            if (scrim) scrim.classList.toggle('show', open);
        };
        if (scrim) scrim.onclick = closeSidebar;
    }

    function setupTabScrollArrows() {
        const inner = document.getElementById('tab-nav-inner');
        const btnLeft = document.getElementById('tab-scroll-left');
        const btnRight = document.getElementById('tab-scroll-right');
        if (!inner || !btnLeft || !btnRight) return;

        const SCROLL_AMOUNT = 200;

        function updateArrows() {
            btnLeft.classList.toggle('hidden', inner.scrollLeft <= 0);
            btnRight.classList.toggle('hidden', inner.scrollLeft + inner.clientWidth >= inner.scrollWidth - 1);
        }

        btnLeft.addEventListener('click', () => {
            inner.scrollBy({ left: -SCROLL_AMOUNT, behavior: 'smooth' });
        });
        btnRight.addEventListener('click', () => {
            inner.scrollBy({ left: SCROLL_AMOUNT, behavior: 'smooth' });
        });

        inner.addEventListener('scroll', updateArrows, { passive: true });
        window.addEventListener('resize', updateArrows, { passive: true });

        // Initial state
        updateArrows();
    }

    function switchTab(tabId) {
        activeTab = tabId;
        document.querySelectorAll('.nav-item').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tabId);
        });
        updateTopbarTitle();
        closeSidebar();
        renderActiveTab();
    }

    // --------------------------------------------------------
    // DATA REFRESH
    // --------------------------------------------------------
    async function refreshData() {
        const content = document.getElementById('tab-content');
        const statusEl = document.getElementById('loading-status');
        const overlay = document.getElementById('loading-overlay');

        overlay.classList.add('visible');

        try {
            appData = await FPL_API.loadAllData((msg) => {
                statusEl.textContent = msg;
            });

            // Compute all competitions
            statusEl.textContent = 'Computing competitions...';
            computed.standings = COMPETITIONS.computeSeasonStandings(appData);
            computed.monthly = COMPETITIONS.computeMonthlyPrize(appData);
            computed.lms = await COMPETITIONS.computeLastManStanding(appData, FPL_API.getEntryPicks, FPL_API.getLiveData);
            computed.champions = await COMPETITIONS.computeChampionsLeague(appData, FPL_API.getEntryPicks, FPL_API.getLiveData);
            computed.worldcup = await COMPETITIONS.computeWorldCup(appData, FPL_API.getEntryPicks, FPL_API.getLiveData);
            computed.cup = COMPETITIONS.computeFPLCup(appData);
            computed.highestGW = COMPETITIONS.computeHighestGWScore(appData);

            // Update timestamp
            const now = new Date();
            document.getElementById('last-updated').textContent =
                `Last updated: ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

            document.getElementById('current-gw').textContent = `GW ${appData.currentGW}`;

            const playerCount = appData.players.length;
            document.getElementById('players-pill').textContent = `${playerCount} Players`;
            document.getElementById('footer-brand').textContent = `Victory Vault Season 3 · ${playerCount} Players`;

            // Show LIVE indicator if current GW is in progress
            const currentEvent = (appData.bootstrap.events || []).find(e => e.id === appData.currentGW);
            const gwLiveEl = document.getElementById('gw-live-indicator');
            if (currentEvent && !currentEvent.finished) {
                if (!gwLiveEl) {
                    const liveSpan = document.createElement('span');
                    liveSpan.id = 'gw-live-indicator';
                    liveSpan.className = 'meta-pill live-pill';
                    liveSpan.innerHTML = '<span class="live-dot"></span> LIVE';
                    document.getElementById('current-gw').after(liveSpan);
                }
            } else if (gwLiveEl) {
                gwLiveEl.remove();
            }

            // Land on Overview on first load. Only applies to the initial load —
            // doesn't override a tab the user has already picked.
            if (!defaultTabSet) {
                defaultTabSet = true;
                activeTab = 'overview';
                document.querySelectorAll('.nav-item').forEach(b => {
                    b.classList.toggle('active', b.dataset.tab === activeTab);
                });
                updateTopbarTitle();
            }

            renderActiveTab();
        } catch (err) {
            content.innerHTML = `<div class="error-card"><h3>⚠️ Error Loading Data</h3><p>${err.message}</p><p>The FPL API might be temporarily unavailable. Try refreshing in a moment.</p></div>`;
            console.error(err);
        } finally {
            overlay.classList.remove('visible');
        }
    }

    function forceRefresh() {
        FPL_API.clearCache();
        refreshData();
    }

    // --------------------------------------------------------
    // RENDER DISPATCHER
    // --------------------------------------------------------
    function renderActiveTab() {
        const content = document.getElementById('tab-content');
        content.innerHTML = '';
        content.className = 'tab-content fade-in';
        // Destroy existing charts if switching away
        if (progressChart) { progressChart.destroy(); progressChart = null; }
        if (gwChart) { gwChart.destroy(); gwChart = null; }

        switch (activeTab) {
            case 'overview': renderOverview(content); break;
            case 'gameweek': renderGameweek(content); break;
            case 'standings': renderStandings(content); break;
            case 'progress': renderProgress(content); break;
            case 'monthly': renderMonthly(content); break;
            case 'champions': renderChampions(content); break;
            case 'worldcup': renderWorldCup(content); break;
            case 'lms': renderLMS(content); break;
            case 'cup': renderCup(content); break;
            case 'highestgw': renderHighestGW(content); break;
            case 'transfers': renderTransfers(content); break;
        }
    }

    // --------------------------------------------------------
    // OVERVIEW TAB
    // --------------------------------------------------------
    function renderOverview(container) {
        const s = computed.standings;
        const m = computed.monthly;
        const l = computed.lms;
        const ch = computed.champions;
        const wc = computed.worldcup;
        const h = computed.highestGW;

        const events = appData.bootstrap.events || [];
        const gw = appData.currentGW;
        const totalGWs = events.length || 38;
        const curEvent = events.find(e => e.id === gw);
        const isLiveGW = curEvent && !curEvent.finished;

        // Live GW leader + average from provisional event_total
        const byEvent = [...appData.players].sort((a, b) => (b.eventTotal || 0) - (a.eventTotal || 0));
        const liveLeader = byEvent[0];

        // Next deadline countdown
        const now = Date.now();
        const upcoming = events
            .filter(e => e.deadline_time && new Date(e.deadline_time).getTime() > now)
            .sort((a, b) => new Date(a.deadline_time) - new Date(b.deadline_time))[0];
        let deadlineStr = '—', deadlineSub = 'Season complete';
        if (upcoming) {
            const diff = new Date(upcoming.deadline_time).getTime() - now;
            const dd = Math.floor(diff / 86400000);
            const hh = Math.floor((diff % 86400000) / 3600000);
            deadlineStr = dd > 0 ? `${dd}d ${hh}h` : `${hh}h`;
            deadlineSub = `GW${upcoming.id} · ${new Date(upcoming.deadline_time).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`;
        }

        const totalPool =
            CONFIG.PRIZES.SEASON[1] + CONFIG.PRIZES.SEASON[2] + CONFIG.PRIZES.SEASON[3] +
            Object.keys(CONFIG.MONTHLY_PHASES).length * CONFIG.PRIZES.MONTHLY +
            CONFIG.PRIZES.LMS.WINNER + CONFIG.PRIZES.LMS.RUNNER +
            CONFIG.PRIZES.CHAMPIONS.WINNER + CONFIG.PRIZES.CHAMPIONS.RUNNER +
            CONFIG.PRIZES.WORLDCUP.WINNER + CONFIG.PRIZES.WORLDCUP.RUNNER +
            CONFIG.PRIZES.CUP + CONFIG.PRIZES.HIGHEST_GW;

        const initials = name => (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const monthsDecided = m.filter(mo => mo.isComplete).length;
        const chLeader = ch.table && ch.table[0];
        const chInLeaguePhase = gw <= ch.leaguePhaseEnd;

        // ---- Bento competition cards ----
        const bento = [
            {
                name: 'Classic League', prize: '$450',
                lead: s[0] ? `<b>${s[0].playerName}</b> leads` : 'Awaiting scores',
                sub: '250 / 125 / 75 · GW1–38',
                chip: isLiveGW ? '<span class="cc-chip live">Live</span>' : '',
            },
            {
                name: 'Champions League', prize: '$225',
                lead: ch.leaguePhaseDone ? `<b>Knockouts</b>` : `<b>League phase</b>`,
                sub: `GW${ch.leaguePhaseStart}–${ch.leaguePhaseEnd} · top ${ch.advance} advance`,
                chip: (isLiveGW && chInLeaguePhase) ? '<span class="cc-chip live">Live H2H</span>' : '<span class="cc-chip mute">GW1–15</span>',
            },
            {
                name: 'Last Man Standing', prize: '$225',
                lead: l.winner ? `<b>🏆 ${l.winner.playerName}</b>` : `<b>${l.alive.length} alive</b>`,
                sub: `GW${l.startGW}–${l.endGW} · ${l.eliminations.length} eliminated`,
                chip: `<span class="cc-chip mute">${l.eliminations.length} out</span>`,
            },
            {
                name: 'World Cup', prize: '$225',
                lead: wc.status === 'awaiting_draw' ? `<b>Groups drawn GW20</b>` : (wc.groupsDone ? `<b>Knockouts</b>` : `<b>Group stage</b>`),
                sub: `3 groups · KO GW${CONFIG.WORLDCUP.KO_ROUNDS[0]}–${CONFIG.WORLDCUP.KO_ROUNDS[CONFIG.WORLDCUP.KO_ROUNDS.length - 1]}`,
                chip: '<span class="cc-chip warn">Upcoming</span>',
            },
            {
                name: 'Monthly Prize', prize: '$250',
                lead: `<b>${(m.find(mo => mo.isStarted && !mo.isComplete) || {}).month || 'August'} open</b>`,
                sub: `$${CONFIG.PRIZES.MONTHLY} × ${m.length} months`,
                chip: `<span class="cc-chip mute">${monthsDecided} / ${m.length} paid</span>`,
            },
            {
                name: 'FA Cup', prize: '$75',
                lead: `<b>${computed.cup.hasCup && computed.cup.rounds.length ? computed.cup.rounds.length + ' round(s)' : 'Native FPL cup'}</b>`,
                sub: 'GW34–38 · winner takes all',
                chip: '<span class="cc-chip mute">GW34+</span>',
            },
            {
                name: 'Highest GW', prize: '$50',
                lead: h.bestScore ? `<b>${h.winners[0].playerName}</b>` : `<b>Best single GW</b>`,
                sub: h.bestScore ? `GW${h.winners[0].gw} · ${h.bestScore} pts` : 'Season-wide · one prize',
                chip: `<span class="cc-chip mute">${h.bestScore || 'TBD'}</span>`,
            },
        ];

        // ============ RENDER ============
        let html = `<div class="cc motion">`;

        // Hero
        html += `
        <section class="cc-hero">
            <div class="glow"></div>
            <div class="cc-hero-eyebrow">${isLiveGW ? '<span class="cc-livedot"></span> Live' : 'Season'} · 2026/27 · Gameweek ${gw}</div>
            <h1 class="cc-hero-title">The race for $${totalPool.toLocaleString()} is on.</h1>
            <div class="cc-hero-row">
                <div class="cc-hstat"><span class="cc-k">Overall Leader</span><span class="cc-v">${s[0]?.playerName || '—'} <small>· ${s[0]?.total || 0} pts</small></span></div>
                <div class="cc-hstat"><span class="cc-k">Live GW Leader</span><span class="cc-v num">${liveLeader?.playerName || '—'} <small>· ${liveLeader?.eventTotal || 0}</small></span></div>
                <div class="cc-hstat"><span class="cc-k">Gameweek</span><span class="cc-v num">${gw} <small>/ ${totalGWs}</small></span></div>
                <div class="cc-hstat"><span class="cc-k">Prize Pool</span><span class="cc-v num">$<span data-count="${totalPool}" data-comma="1">${totalPool.toLocaleString()}</span></span></div>
            </div>
        </section>`;

        // Right Now
        html += `
        <section>
            <div class="cc-head"><h2>Right Now</h2><span class="cc-hint">${isLiveGW ? 'Live provisional scores — GW' + gw + ' in progress' : 'Latest standings'}</span></div>
            <div class="cc-now">
                <div class="cc-card cc-lead">
                    <div>
                        <span class="cc-chip live"><span class="cc-livedot on"></span> ${isLiveGW ? 'Live GW Leader' : 'GW Leader'}</span>
                        <div class="cc-lead-name">${liveLeader?.playerName || '—'}</div>
                        <div class="cc-lead-team">${liveLeader?.entryName || ''}</div>
                    </div>
                    <div class="cc-lead-score num"><span data-count="${liveLeader?.eventTotal || 0}">${liveLeader?.eventTotal || 0}</span> <small>pts</small></div>
                </div>
                <div class="cc-card cc-mini">
                    <span class="cc-k">Next Deadline</span>
                    <div class="cc-big num">${deadlineStr}</div>
                    <div class="cc-sub">${deadlineSub}</div>
                    <div style="margin-top:auto"><span class="cc-chip warn">${gw} of ${totalGWs} gameweeks</span></div>
                </div>
            </div>
        </section>`;

        // Overall standings (classic league)
        html += `
        <section>
            <div class="cc-head"><h2>Overall Standings</h2><span class="cc-hint">Classic League · ${isLiveGW ? 'live GW' + gw + ' totals' : 'GW' + gw}</span></div>
            <div class="cc-card cc-tablewrap">
                <table class="cc-tbl num">
                    <thead><tr><th>#</th><th class="cc-team">Manager</th><th class="cc-team">Team</th><th>GW</th><th>Total</th><th>Prize</th></tr></thead>
                    <tbody>
                        ${s.map(p => `
                        <tr class="${p.rank <= 3 ? 'qual' : ''}">
                            <td class="cc-rk">${p.rank}</td>
                            <td class="cc-team">${p.playerName}</td>
                            <td class="cc-team cc-dim">${p.entryName}</td>
                            <td>${p.eventTotal || 0}</td>
                            <td class="cc-ptc">${p.total}</td>
                            <td>${p.prize > 0 ? `<span class="cc-prize">$${p.prize}</span>` : '<span class="cc-dimdash">—</span>'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </section>`;

        // Competitions bento
        html += `
        <section>
            <div class="cc-head"><h2>Competitions</h2><span class="cc-hint">Every manager has a live prize from GW1 to GW38</span></div>
            <div class="cc-bento">
                ${bento.map(c => `
                <div class="cc-comp" data-tab="${compTabId(c.name)}">
                    <div class="cc-comp-top"><span class="cc-comp-name">${c.name}</span><span class="cc-comp-prize">${c.prize}</span></div>
                    <div class="cc-comp-body">
                        <div class="cc-comp-lead">${c.lead}<span>${c.sub}</span></div>
                        ${c.chip}
                    </div>
                </div>`).join('')}
            </div>
        </section>`;

        html += `</div>`;
        container.innerHTML = html;

        // Bento cards navigate to their tab
        container.querySelectorAll('.cc-comp[data-tab]').forEach(el => {
            el.addEventListener('click', () => { const t = el.dataset.tab; if (t) switchTab(t); });
        });

        // Count-up the headline numbers (skips if the user prefers reduced motion)
        ccCountUp(container);
    }

    // Animate [data-count] elements up to their target value. The markup already
    // contains the final value, so we only ever touch it inside requestAnimationFrame —
    // if rAF never runs (hidden tab / reduced motion) the real value stays put.
    function ccCountUp(root) {
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) return;
        root.querySelectorAll('[data-count]').forEach(el => {
            const target = +el.dataset.count || 0;
            if (target === 0) return;
            const comma = el.dataset.comma === '1';
            const fmt = n => { n = Math.round(n); return comma ? n.toLocaleString() : String(n); };
            const dur = 850;
            let start = null;
            function tick(now) {
                if (start === null) start = now;
                const t = Math.min(1, (now - start) / dur);
                el.textContent = fmt(target * (1 - Math.pow(1 - t, 3)));
                if (t < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        });
    }

    // Map a competition display name to its tab id (for bento navigation).
    function compTabId(name) {
        const map = {
            'Classic League': 'standings', 'Champions League': 'champions', 'Last Man Standing': 'lms',
            'World Cup': 'worldcup', 'Monthly Prize': 'monthly', 'FA Cup': 'cup', 'Highest GW': 'highestgw',
        };
        return map[name] || '';
    }

    // --------------------------------------------------------
    // THIS GW TAB
    // --------------------------------------------------------
    function renderGameweek(container) {
        const gw = appData.currentGW;
        const lastFinished = appData.lastFinishedGW;

        // Use current GW if data exists for any player, else show last finished GW
        const hasCurrentData = appData.players.some(p => p.gwHistory[gw]);
        const displayGW = hasCurrentData ? gw : lastFinished;

        const displayEvent = (appData.bootstrap.events || []).find(e => e.id === displayGW);
        const isLive = displayEvent && !displayEvent.finished;

        // While the current GW is in progress, the per-entry history endpoint
        // still reports 0 points — the live provisional score only appears as
        // `event_total` on the league standings. Prefer that for the GW-points
        // column so the tab isn't all zeros mid-round. (Bench/transfer/chip stats
        // only exist in history, so they stay blank until the round finalizes.)
        const isCurrentLiveGW = isLive && displayGW === appData.currentGW;

        const CHIP_NAMES = { wildcard: 'WC', freehit: 'FH', bboost: 'BB', '3xc': 'TC' };

        // Build per-player GW stats
        const players = appData.players.map(p => {
            const hist = p.gwHistory[displayGW] || {};
            const chipThisGW = p.chips.find(c => c.event === displayGW);
            const histPoints = hist.points || 0;
            const gwPoints = isCurrentLiveGW ? (p.eventTotal ?? histPoints) : histPoints;
            return {
                entry: p.entry,
                playerName: p.playerName,
                entryName: p.entryName,
                gwPoints,
                benchPoints: hist.pointsOnBench || 0,
                transfers: hist.eventTransfers || 0,
                hit: hist.eventTransfersCost || 0,
                chip: chipThisGW ? chipThisGW.name : null,
            };
        }).sort((a, b) => b.gwPoints - a.gwPoints);

        const avg = players.length > 0
            ? Math.round(players.reduce((s, p) => s + p.gwPoints, 0) / players.length)
            : 0;
        const benchSorted = [...players].sort((a, b) => b.benchPoints - a.benchPoints);
        const lms = computed.lms;
        const lmsInRange = displayGW >= lms.startGW && displayGW <= lms.endGW;

        let html = `
        <div class="section-header">
            <div class="gw-header-row">
                <h2>Gameweek ${displayGW} Stats</h2>
                ${isLive ? '<span class="live-pill meta-pill"><span class="live-dot"></span> LIVE</span>' : ''}
            </div>
            <p class="section-sub">GW scores, chip usage, bench points and transfer activity for all managers${isCurrentLiveGW ? ' · <em>Live scores — bench &amp; transfer stats finalize after the round</em>' : ''}</p>
        </div>

        <div class="gw-stats-bar">
            <div class="gw-stat-item">
                <span class="gw-stat-label">GW Leader</span>
                <span class="gw-stat-value">${players[0]?.playerName || '—'}</span>
                <span class="gw-stat-sub">${players[0]?.gwPoints || 0} pts</span>
            </div>
            <div class="gw-stat-item">
                <span class="gw-stat-label">League Average</span>
                <span class="gw-stat-value">${avg} pts</span>
                <span class="gw-stat-sub">${players.length} managers</span>
            </div>
            <div class="gw-stat-item">
                <span class="gw-stat-label">Highest Bench</span>
                <span class="gw-stat-value">${benchSorted[0]?.benchPoints || 0} pts</span>
                <span class="gw-stat-sub">${benchSorted[0]?.playerName || '—'}</span>
            </div>
            <div class="gw-stat-item">
                <span class="gw-stat-label">LMS Survivors</span>
                <span class="gw-stat-value">${lmsInRange ? lms.alive.length + ' alive' : '—'}</span>
                <span class="gw-stat-sub">${lmsInRange ? 'GW' + lms.startGW + '–' + lms.endGW : 'Not in LMS range'}</span>
            </div>
        </div>

        <div class="gw-chart-container">
            <canvas id="gw-canvas"></canvas>
        </div>

        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th class="col-rank">#</th>
                        <th>Manager</th>
                        <th>Team</th>
                        <th class="col-gw">GW Pts</th>
                        <th class="col-gw">Bench</th>
                        <th class="col-gw">Transfers</th>
                        <th class="col-gw">Hit</th>
                        <th class="col-gw">Chip</th>
                    </tr>
                </thead>
                <tbody>
                    ${players.map((p, i) => `
                    <tr>
                        <td class="col-rank"><span class="rank-badge ${i === 0 ? 'gold' : ''}">${i + 1}</span></td>
                        <td><strong>${p.playerName}</strong></td>
                        <td>${p.entryName}</td>
                        <td class="col-gw"><strong>${p.gwPoints}</strong></td>
                        <td class="col-gw ${p.benchPoints > 15 ? 'bench-pain' : ''}">${p.benchPoints}</td>
                        <td class="col-gw">${p.transfers}</td>
                        <td class="col-gw ${p.hit > 0 ? 'hit-taken' : ''}">${p.hit > 0 ? '−' + p.hit : '—'}</td>
                        <td class="col-gw">${p.chip ? `<span class="chip-badge chip-${p.chip}">${CHIP_NAMES[p.chip] || p.chip.toUpperCase()}</span>` : '—'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;

        container.innerHTML = html;
        buildGWChart(players);
    }

    function buildGWChart(players) {
        if (typeof Chart === 'undefined') return;
        const ctx = document.getElementById('gw-canvas');
        if (!ctx) return;

        const chartColors = [
            '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6',
            '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
            '#e879f9', '#fb923c', '#22d3ee', '#a3e635', '#f472b6',
            '#38bdf8', '#facc15', '#4ade80',
        ];

        const labels = players.map(p => p.playerName);
        const data = players.map(p => p.gwPoints);
        const colors = players.map((_, i) => chartColors[i % chartColors.length]);

        gwChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'GW Points',
                    data,
                    backgroundColor: colors.map(c => c + 'cc'),
                    borderColor: colors,
                    borderWidth: 1,
                    borderRadius: 4,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        titleFont: { family: 'Outfit', weight: '700' },
                        bodyFont: { family: 'Inter', size: 12 },
                        callbacks: {
                            label: ctx => `${ctx.parsed.x} pts`,
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
                        title: {
                            display: true,
                            text: 'Points',
                            color: '#94a3b8',
                            font: { family: 'Outfit', size: 13, weight: '600' },
                        },
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8', font: { family: 'Inter', size: 12 } },
                    },
                },
            },
        });
    }

    // --------------------------------------------------------
    // STANDINGS TAB
    // --------------------------------------------------------
    function renderStandings(container) {
        const s = computed.standings;
        const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

        let html = `
        <div class="section-header">
            <h2>Season Standings</h2>
            <p class="section-sub">Overall league rankings across all gameweeks</p>
        </div>
        <div class="table-container">
            <table class="data-table standings-table">
                <thead>
                    <tr>
                        <th class="col-rank">#</th>
                        <th class="col-name">Manager</th>
                        <th class="col-team">Team</th>
                        <th class="col-gw">GW${appData.currentGW}</th>
                        <th class="col-total">Total</th>
                        <th class="col-prize">Prize</th>
                    </tr>
                </thead>
                <tbody>`;

        for (const p of s) {
            const medal = medals[p.rank] || '';
            const prizeClass = p.prize > 0 ? 'prize-highlight' : '';
            const rowClass = p.rank <= 3 ? `top-${p.rank}` : '';
            html += `
                    <tr class="${rowClass}">
                        <td class="col-rank"><span class="rank-badge">${medal || p.rank}</span></td>
                        <td class="col-name"><strong>${p.playerName}</strong></td>
                        <td class="col-team">${p.entryName}</td>
                        <td class="col-gw">${p.eventTotal}</td>
                        <td class="col-total"><strong>${p.total}</strong></td>
                        <td class="col-prize ${prizeClass}">${p.prize > 0 ? '$' + p.prize : '—'}</td>
                    </tr>`;
        }

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    }

    // --------------------------------------------------------
    // SEASON PROGRESS TAB
    // --------------------------------------------------------
    let progressChart = null;
    let gwChart = null;

    function renderProgress(container) {
        if (!appData) return;
        const lastGW = appData.lastFinishedGW;
        const gws = [];
        for (let i = 1; i <= lastGW; i++) gws.push(i);

        // Build player data sorted by current total
        const players = appData.players
            .map(p => {
                const gwScores = {};
                const cumulative = {};
                let runningTotal = 0;
                for (const gw of gws) {
                    const score = p.gwHistory[gw] ? p.gwHistory[gw].points : 0;
                    const cost = p.gwHistory[gw] ? (p.gwHistory[gw].eventTransfersCost || 0) : 0;
                    gwScores[gw] = score;
                    runningTotal += score - cost;
                    cumulative[gw] = runningTotal;
                }
                return {
                    entry: p.entry,
                    playerName: p.playerName,
                    entryName: p.entryName,
                    total: p.total,
                    gwScores,
                    cumulative,
                };
            })
            .sort((a, b) => b.total - a.total);

        players.forEach((p, i) => p.rank = i + 1);

        // Color palette for chart lines
        const chartColors = [
            '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6',
            '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
            '#e879f9', '#fb923c', '#22d3ee', '#a3e635', '#f472b6',
            '#38bdf8', '#facc15', '#4ade80',
        ];

        // --- Build highlight lookup sets from computed data ---
        const lmsElimSet = new Set();
        if (computed.lms && computed.lms.eliminations) {
            for (const elim of computed.lms.eliminations) {
                lmsElimSet.add(`${elim.entry}-${elim.gw}`);
            }
        }

        const highestGWSet = new Set();
        if (computed.highestGW && computed.highestGW.winners) {
            for (const w of computed.highestGW.winners) {
                highestGWSet.add(`${w.entry}-${w.gw}`);
            }
        }

        // --- HTML ---
        let html = `
        <div class="section-header">
            <h2>Season Progress</h2>
            <p class="section-sub">Full gameweek-by-gameweek breakdown and cumulative points progression.</p>
        </div>

        <!-- Toggle between table and chart -->
        <div class="progress-toggle">
            <button class="progress-toggle-btn active" data-view="table">📊 GW Table</button>
            <button class="progress-toggle-btn" data-view="chart">📈 Progress Chart</button>
        </div>

        <!-- Color Legend -->
        <div class="progress-legend">
            <span class="progress-legend-item"><span class="legend-swatch lms-elim-swatch"></span> LMS Elimination</span>
            <span class="progress-legend-item"><span class="legend-swatch highest-gw-swatch"></span> Highest GW Score</span>
        </div>

        <!-- GW TABLE VIEW -->
        <div id="progress-table-view" class="progress-view">
            <div class="table-container progress-table-wrap">
                <table class="data-table progress-table">
                    <thead>
                        <tr>
                            <th class="col-rank sticky-col">#</th>
                            <th class="sticky-col sticky-col-name">Manager</th>
                            ${gws.map(g => `<th class="col-gw">GW${g}</th>`).join('')}
                            <th class="col-total">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${players.map(p => {
            const rankClass = p.rank === 1 ? 'top-1' : p.rank === 2 ? 'top-2' : p.rank === 3 ? 'top-3' : '';
            return `<tr class="${rankClass}">
                                <td class="col-rank sticky-col"><span class="rank-badge ${p.rank <= 3 ? 'gold' : ''}">${p.rank}</span></td>
                                <td class="sticky-col sticky-col-name">
                                    <div class="player-cell">
                                        <span class="player-name">${p.playerName}</span>
                                        <span class="team-name">${p.entryName}</span>
                                    </div>
                                </td>
                                ${gws.map(g => {
                const score = p.gwScores[g] || 0;
                const isLmsElim = lmsElimSet.has(`${p.entry}-${g}`);
                const isHighestGW = highestGWSet.has(`${p.entry}-${g}`);
                const cls = isLmsElim ? 'gw-lms-elim' : isHighestGW ? 'gw-highest' : '';
                return `<td class="col-gw ${cls}">${score || '—'}</td>`;
            }).join('')}
                                <td class="col-total"><strong>${p.total}</strong></td>
                            </tr>`;
        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- CHART VIEW -->
        <div id="progress-chart-view" class="progress-view" style="display:none">
            <div class="progress-chart-toolbar">
                <span class="zoom-hint">Scroll to zoom · Drag to select area · Ctrl + Left Mouse Button to pan · Scroll to zoom</span>
                <button class="reset-zoom-btn" id="reset-zoom-btn">Reset Zoom</button>
            </div>
            <div class="progress-chart-container">
                <canvas id="progress-canvas"></canvas>
            </div>
            <div class="chart-legend" id="chart-legend">
                ${players.map((p, i) => `
                    <button class="legend-item active" data-index="${i}" style="--legend-color:${chartColors[i % chartColors.length]}">
                        <span class="legend-dot" style="background:${chartColors[i % chartColors.length]}"></span>
                        <span class="legend-label">${p.playerName}</span>
                    </button>
                `).join('')}
            </div>
        </div>`;

        container.innerHTML = html;

        // --- Toggle logic ---
        const toggleBtns = container.querySelectorAll('.progress-toggle-btn');
        toggleBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                toggleBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const view = btn.dataset.view;
                document.getElementById('progress-table-view').style.display = view === 'table' ? '' : 'none';
                document.getElementById('progress-chart-view').style.display = view === 'chart' ? '' : 'none';
                if (view === 'chart' && !progressChart) {
                    buildChart(gws, players, chartColors);
                }
            });
        });

        // --- Legend toggle ---
        container.querySelectorAll('.legend-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.index);
                item.classList.toggle('active');
                if (progressChart) {
                    const meta = progressChart.getDatasetMeta(idx);
                    meta.hidden = !item.classList.contains('active');
                    progressChart.update();
                }
            });
        });

        // --- Reset Zoom ---
        document.getElementById('reset-zoom-btn').addEventListener('click', () => {
            if (progressChart) progressChart.resetZoom();
        });
    }

    function buildChart(gws, players, chartColors) {
        if (typeof Chart === 'undefined') {
            document.getElementById('progress-canvas').parentElement.innerHTML =
                '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted)">Chart.js is loading… please refresh the page.</div>';
            return;
        }
        const ctx = document.getElementById('progress-canvas').getContext('2d');
        const datasets = players.map((p, i) => ({
            label: p.playerName,
            data: gws.map(g => p.cumulative[g]),
            borderColor: chartColors[i % chartColors.length],
            backgroundColor: chartColors[i % chartColors.length] + '20',
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 6,
            tension: 0.3,
            fill: false,
        }));

        progressChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: gws.map(g => `GW${g}`),
                datasets,
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        padding: 12,
                        titleFont: { family: 'Outfit', weight: '700' },
                        bodyFont: { family: 'Inter', size: 12 },
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y} pts`,
                        },
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'xy',
                            modifierKey: 'ctrl',
                        },
                        zoom: {
                            wheel: {
                                enabled: true,
                            },
                            pinch: { enabled: true },
                            mode: 'xy',
                        },
                    },
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } },
                        title: {
                            display: true,
                            text: 'Cumulative Points',
                            color: '#94a3b8',
                            font: { family: 'Outfit', size: 13, weight: '600' },
                        },
                    },
                },
            },
        });
    }

    // --------------------------------------------------------
    // MONTHLY PRIZE TAB
    // --------------------------------------------------------
    function renderMonthly(container) {
        const months = computed.monthly;

        let html = `
        <div class="section-header">
            <h2>Monthly Prize — $${CONFIG.PRIZES.MONTHLY}/month</h2>
            <p class="section-sub">Top performer each calendar month (a GW belongs to the month its deadline falls in). Click a month to see all players.</p>
        </div>
        <div class="monthly-grid">`;

        for (const m of months) {
            const statusClass = m.isComplete ? 'complete' : (m.isStarted ? 'in-progress' : 'upcoming');
            const statusText = m.isComplete ? '✅ Complete' : (m.isStarted ? '🔄 In Progress' : '⏳ Upcoming');
            const monthId = m.month.toLowerCase().replace(/\s+/g, '-');

            html += `
            <div class="monthly-card ${statusClass}">
                <div class="monthly-header">
                    <h3>${m.month}</h3>
                    <span class="monthly-status">${statusText}</span>
                </div>
                <div class="monthly-gws">
                    GWs: ${m.gws.join(', ')}
                </div>`;

            if (m.isStarted) {
                // Show winner
                if (m.isComplete && m.winners.length > 0) {
                    html += `<div class="monthly-winner">
                        <span class="winner-icon">🏆</span>
                        <span class="winner-name">${m.winners.map(w => w.playerName).join(', ')}</span>
                        <span class="winner-score">${m.winners[0].total} pts · $${m.prizePerWinner.toFixed(0)}</span>
                    </div>`;
                }

                // Top 5 scores table (always visible)
                html += `<div class="monthly-scores">
                <table class="mini-table">
                    <thead><tr><th>#</th><th>Manager</th>`;
                for (const gw of m.gwsPlayed) {
                    html += `<th>GW${gw}</th>`;
                }
                html += `<th>Total</th></tr></thead><tbody>`;

                const top5 = m.playerScores.slice(0, 5);
                top5.forEach((p, i) => {
                    html += `<tr class="${i === 0 && m.isComplete ? 'winner-row' : ''}">
                        <td>${i + 1}</td>
                        <td>${p.playerName}</td>`;
                    for (const gw of m.gwsPlayed) {
                        html += `<td>${p.gwScores[gw] || 0}</td>`;
                    }
                    html += `<td><strong>${p.total}</strong></td></tr>`;
                });

                html += `</tbody></table></div>`;

                // Expand button + full leaderboard (hidden by default)
                if (m.playerScores.length > 5) {
                    html += `
                    <button class="expand-month-btn" onclick="APP.toggleMonthExpand('${monthId}', this)">
                        <span class="expand-icon">▼</span> View All ${m.playerScores.length} Players
                    </button>
                    <div class="monthly-expanded" id="monthly-expand-${monthId}" style="display:none;">
                        <table class="mini-table expanded-table">
                            <thead><tr><th>#</th><th>Manager</th>`;
                    for (const gw of m.gwsPlayed) {
                        html += `<th>GW${gw}</th>`;
                    }
                    html += `<th>Total</th></tr></thead><tbody>`;

                    m.playerScores.forEach((p, i) => {
                        const isWinnerRow = i === 0 && m.isComplete;
                        const isTop5 = i < 5;
                        html += `<tr class="${isWinnerRow ? 'winner-row' : ''} ${isTop5 ? 'top-five-row' : ''}">
                            <td>${i + 1}</td>
                            <td>${p.playerName}</td>`;
                        for (const gw of m.gwsPlayed) {
                            html += `<td>${p.gwScores[gw] || 0}</td>`;
                        }
                        html += `<td><strong>${p.total}</strong></td></tr>`;
                    });

                    html += `</tbody></table></div>`;
                }
            }

            html += `</div>`;
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    // --------------------------------------------------------
    // LAST MAN STANDING TAB
    // --------------------------------------------------------
    const TB_STEP_LABEL = { captain: 'Captain pts', vice_captain: 'Vice-captain pts', season_total: 'Season total' };

    function renderLMS(container) {
        const lms = computed.lms;

        let html = `
        <div class="section-header">
            <h2>Last Man Standing — $${lms.prizeWinner} winner / $${lms.prizeRunner} runner-up</h2>
            <p class="section-sub">GW${lms.startGW}–${lms.endGW}. Lowest net scorer each gameweek is eliminated — last survivor wins.</p>
        </div>
        <div class="lms-container">
            <div class="lms-half">
                <div class="lms-half-header">
                    <h3>GW${lms.startGW}–${lms.endGW}</h3>
                    <span class="lms-status">${lms.winner ? '🏆 Winner: ' + lms.winner.playerName : lms.alive.length + ' players still alive'}</span>
                </div>`;

        if (lms.winner && lms.runnerUp) {
            html += `<div class="lms-podium-note">🥈 Runner-up: <strong>${lms.runnerUp.playerName}</strong> — eliminated GW${lms.runnerUp.gw} · $${lms.prizeRunner}</div>`;
        }

        // Alive players
        if (lms.alive.length > 0 && !lms.winner) {
            html += `<div class="lms-alive">
                <h4>🟢 Surviving Players (${lms.alive.length})</h4>
                <div class="alive-chips">
                    ${lms.alive.map(p => `<span class="alive-chip">${p.playerName}</span>`).join('')}
                </div>
            </div>`;
        }

        // Unresolved ties — needs manual resolution
        if (lms.unresolvedTies && lms.unresolvedTies.length > 0) {
            html += `<div class="lms-unresolved-ties">`;
            for (const tie of lms.unresolvedTies) {
                const playerList = tie.players
                    .map(p => `${p.playerName} (season: ${p.seasonTotal} pts)`)
                    .join(' · ');
                html += `
                <div class="lms-tie-warning">
                    <span class="tie-warning-icon">⚠️</span>
                    <div class="tie-warning-body">
                        <strong>GW${tie.gw} — Manual resolution needed</strong>
                        <span>${playerList} — all scored ${tie.score} pts. All tiebreakers exhausted (GW pts, captain, vice-captain, season total all equal).</span>
                    </div>
                </div>`;
            }
            html += `</div>`;
        }

        // Elimination timeline
        if (lms.eliminations.length > 0) {
            html += `<div class="lms-timeline">
                <h4>💀 Elimination Timeline</h4>
                <div class="timeline">
                    ${lms.eliminations.map((e, i) => {
                        let tbHtml = '';
                        if (e.tiebreaker && e.tiebreaker.steps) {
                            const stepLines = e.tiebreaker.steps.map(step => {
                                const label = TB_STEP_LABEL[step.type] || step.type;
                                if (step.outcome === 'eliminated') {
                                    const survStr = step.survivors.map(s => `${s.playerName} (${s.pts})`).join(', ');
                                    return `<span class="tb-step tb-eliminated">❌ ${label}: ${step.eliminatedPts} pts — eliminated (vs ${survStr})</span>`;
                                } else if (step.outcome === 'tied') {
                                    return `<span class="tb-step tb-tied">✅ ${label}: tied (${step.allPts} pts each — no decision)</span>`;
                                } else {
                                    return `<span class="tb-step tb-unavailable">⚠️ ${label}: data unavailable — skipped</span>`;
                                }
                            }).join('');
                            tbHtml = `<div class="timeline-tiebreaker-chain">${stepLines}</div>`;
                        }
                        return `
                    <div class="timeline-item">
                        <div class="timeline-marker">${i + 1}</div>
                        <div class="timeline-content">
                            <span class="timeline-gw">GW${e.gw}</span>
                            <span class="timeline-name">${e.playerName} <span style="opacity:0.55;font-size:0.85em">(${e.entryName})</span></span>
                            <span class="timeline-score">${e.score} pts</span>
                            ${tbHtml}
                        </div>
                    </div>`;
                    }).join('')}
                </div>
            </div>`;
        }

        html += `</div></div>`;
        container.innerHTML = html;
    }

    // --------------------------------------------------------
    // Shared knockout-bracket renderer (Champions League / World Cup).
    // Consumes rounds from COMPETITIONS.computeKnockout and reuses the
    // cup-* markup/styles so all brackets look identical.
    // --------------------------------------------------------
    function renderKnockoutRounds(rounds, icon) {
        const initials = name => (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        let html = '';
        for (const round of rounds) {
            const decided = round.matches.filter(m => m.winner).length;
            const roundComplete = round.matches.length > 0 && decided === round.matches.length;
            const roundPending = decided === 0;
            html += `
            <div class="cup-round">
                <div class="cup-round-banner">
                    <div class="cup-round-title"><span class="cup-round-icon">${icon}</span><h3>${round.label}</h3></div>
                    <div class="cup-round-badges">
                        <span class="cup-round-gw-badge">GW${round.event}</span>
                        ${roundComplete ? '<span class="cup-stage-badge complete">Complete</span>' : roundPending ? '<span class="cup-stage-badge upcoming">Upcoming</span>' : '<span class="cup-stage-badge live">In Progress</span>'}
                    </div>
                </div>
                <div class="cup-matches">`;
            for (const m of round.matches) {
                const e1Name = m.entry1PlayerName || m.entry1Name;
                const e2Name = m.entry2PlayerName || m.entry2Name;
                if (m.isBye) {
                    html += `<div class="cup-match"><div class="cup-team winner"><div class="cup-team-info"><span class="cup-manager-name">${e1Name || e2Name}</span><span class="cup-team-label">Bye — advances</span></div></div></div>`;
                    continue;
                }
                if (!m.winner) {
                    html += `
                    <div class="cup-match cup-match-pending">
                        <div class="cup-team">
                            <div class="cup-team-avatar">${initials(e1Name)}</div>
                            <div class="cup-team-info"><span class="cup-manager-name">${e1Name}</span><span class="cup-team-label">${m.entry1Name}</span></div>
                        </div>
                        <div class="cup-divider"><span class="cup-gw-upcoming">GW${m.event}</span><span class="cup-vs-label">VS</span></div>
                        <div class="cup-team">
                            <div class="cup-team-avatar">${initials(e2Name)}</div>
                            <div class="cup-team-info"><span class="cup-manager-name">${e2Name}</span><span class="cup-team-label">${m.entry2Name}</span></div>
                        </div>
                    </div>`;
                } else {
                    const e1Win = m.winner === m.entry1;
                    const e2Win = m.winner === m.entry2;
                    const tbNote = m.tiebreak ? '<div class="cup-tiebreak-note">Decided on tie-breaker</div>' : '';
                    html += `
                    <div class="cup-match">
                        <div class="cup-team ${e1Win ? 'winner' : 'loser'}">
                            <div class="cup-team-info"><span class="cup-manager-name">${e1Name}</span><span class="cup-team-label">${m.entry1Name}</span></div>
                            <div class="cup-team-right">${e1Win ? '<span class="cup-win-badge">WIN</span>' : '<span class="cup-loss-badge">OUT</span>'}<span class="cup-score">${m.entry1Points}</span></div>
                        </div>
                        <div class="cup-divider"><span class="cup-vs-label">VS</span></div>
                        <div class="cup-team ${e2Win ? 'winner' : 'loser'}">
                            <div class="cup-team-info"><span class="cup-manager-name">${e2Name}</span><span class="cup-team-label">${m.entry2Name}</span></div>
                            <div class="cup-team-right">${e2Win ? '<span class="cup-win-badge">WIN</span>' : '<span class="cup-loss-badge">OUT</span>'}<span class="cup-score">${m.entry2Points}</span></div>
                        </div>
                        ${tbNote}
                    </div>`;
                }
            }
            html += `</div></div>`;
        }
        return html;
    }

    // Champion banner shown once a bracket has a winner.
    function championBanner(entryId, label) {
        const p = appData.players.find(x => x.entry === entryId);
        if (!p) return '';
        return `<div class="champion-banner"><span class="champion-icon">🏆</span><div class="champion-text"><span class="champion-label">${label}</span><span class="champion-name">${p.playerName}</span><span class="champion-team">${p.entryName}</span></div></div>`;
    }

    // H2H standings table (shared by Champions League + World Cup groups).
    function renderH2HTable(rows, qualifyCount) {
        let html = `<div class="table-container"><table class="data-table h2h-table">
            <thead><tr><th class="col-rank">#</th><th>Manager</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>PF</th><th>Pts</th></tr></thead>
            <tbody>`;
        rows.forEach(r => {
            const qualified = qualifyCount && r.rank <= qualifyCount;
            html += `<tr class="${qualified ? 'qualified-row' : ''}">
                <td class="col-rank"><span class="rank-badge ${qualified ? 'gold' : ''}">${r.rank}</span></td>
                <td><strong>${r.playerName}</strong></td>
                <td style="color:var(--text-muted)">${r.entryName}</td>
                <td>${r.played || 0}</td><td>${r.won || 0}</td><td>${r.drawn || 0}</td><td>${r.lost || 0}</td>
                <td>${r.pointsFor || 0}</td><td><strong>${r.h2hPoints || 0}</strong></td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
        return html;
    }

    // --------------------------------------------------------
    // CHAMPIONS LEAGUE TAB
    // --------------------------------------------------------
    function renderChampions(container) {
        const ch = computed.champions;

        let html = `
        <div class="section-header">
            <h2>Champions League — $${ch.prizeWinner} winner / $${ch.prizeRunner} runner-up</h2>
            <p class="section-sub">Head-to-head league GW${ch.leaguePhaseStart}–${ch.leaguePhaseEnd} · Top ${ch.advance} advance to a single-elimination knockout (GW${CONFIG.CHAMPIONS.KO_ROUNDS[0]}–${CONFIG.CHAMPIONS.KO_ROUNDS[CONFIG.CHAMPIONS.KO_ROUNDS.length - 1]}).</p>
        </div>`;

        if (!ch.hasData) {
            html += `<div class="empty-state-large"><span class="empty-icon-large">🏆</span><h3>Awaiting Champions League data</h3><p>The head-to-head league standings are not available yet.</p></div>`;
            container.innerHTML = html;
            return;
        }

        if (ch.bracket && ch.bracket.champion) {
            html += championBanner(ch.bracket.champion, 'Champions League Winner');
        }

        html += `<div class="winners-section-header">League Phase — GW${ch.leaguePhaseStart}–${ch.leaguePhaseEnd}${ch.leaguePhaseDone ? ' (final)' : ''}</div>`;
        html += `<p class="section-sub" style="margin:-4px 0 8px">Top ${ch.advance} (highlighted) advance. Ties on H2H points broken by overall season points.</p>`;
        html += renderH2HTable(ch.table, ch.advance);

        // Weekly head-to-head fixtures, one gameweek at a time.
        let defaultFixtureGW = null;
        if (ch.leagueFixtures && ch.leagueFixtures.length) {
            const live = ch.leagueFixtures.find(f => f.isLive);
            const lastDone = [...ch.leagueFixtures].reverse().find(f => f.isFinished);
            defaultFixtureGW = (live || lastDone || ch.leagueFixtures[0]).event;

            html += `<div class="winners-section-header">Weekly Fixtures</div>`;
            html += `<div class="gw-selector">${ch.leagueFixtures.map(f =>
                `<button class="gw-selector-btn ${f.event === defaultFixtureGW ? 'active' : ''}" data-gw="${f.event}">GW${f.event}${f.isLive ? ' <span class="live-dot"></span>' : ''}</button>`
            ).join('')}</div>`;
            html += ch.leagueFixtures.map(f =>
                `<div class="gw-fixtures" data-gw-panel="${f.event}" style="display:${f.event === defaultFixtureGW ? 'block' : 'none'}">${championFixtureCards(f)}</div>`
            ).join('');
        }

        html += `<div class="winners-section-header">Knockout Phase</div>`;
        if (ch.bracket) {
            html += `<div class="cup-bracket">${renderKnockoutRounds(ch.bracket.rounds, '🏆')}</div>`;
        } else {
            html += `<div class="empty-state"><span class="empty-icon">⚔️</span><p>The knockout bracket is seeded once the league phase concludes after GW${ch.leaguePhaseEnd}.</p></div>`;
        }
        container.innerHTML = html;

        // Wire the gameweek selector to toggle fixture panels.
        container.querySelectorAll('.gw-selector-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const gw = btn.dataset.gw;
                container.querySelectorAll('.gw-selector-btn').forEach(b => b.classList.toggle('active', b === btn));
                container.querySelectorAll('.gw-fixtures').forEach(panel => {
                    panel.style.display = panel.dataset.gwPanel === gw ? 'block' : 'none';
                });
            });
        });
    }

    // Head-to-head fixture cards for one gameweek (Champions League league phase).
    function championFixtureCards(fixture) {
        let h = `<div class="cup-matches">`;
        for (const m of fixture.matches) {
            if (m.isBye) {
                h += `<div class="cup-match"><div class="cup-team winner"><div class="cup-team-info"><span class="cup-manager-name">${m.entry1Name || m.entry2Name}</span><span class="cup-team-label">Bye</span></div></div></div>`;
                continue;
            }
            if (!fixture.isFinished && !fixture.isLive) {
                // Upcoming gameweek — no scores yet.
                h += `
                <div class="cup-match cup-match-pending">
                    <div class="cup-team"><div class="cup-team-info"><span class="cup-manager-name">${m.entry1Name}</span></div></div>
                    <div class="cup-divider"><span class="cup-gw-upcoming">GW${m.event}</span><span class="cup-vs-label">VS</span></div>
                    <div class="cup-team"><div class="cup-team-info"><span class="cup-manager-name">${m.entry2Name}</span></div></div>
                </div>`;
                continue;
            }
            if (fixture.isLive) {
                // Live gameweek — show provisional scores only, no result badges
                // or winner/loser styling (the matchup isn't decided yet).
                h += `
                <div class="cup-match">
                    <div class="cup-team">
                        <div class="cup-team-info"><span class="cup-manager-name">${m.entry1Name}</span></div>
                        <div class="cup-team-right"><span class="cup-score">${m.entry1Points}</span></div>
                    </div>
                    <div class="cup-divider"><span class="cup-vs-label">LIVE</span></div>
                    <div class="cup-team">
                        <div class="cup-team-info"><span class="cup-manager-name">${m.entry2Name}</span></div>
                        <div class="cup-team-right"><span class="cup-score">${m.entry2Points}</span></div>
                    </div>
                </div>`;
                continue;
            }
            // Finished gameweek — final result with WIN / LOSS / DRAW.
            const isDraw = !m.winner;
            const e1Win = m.winner === m.entry1;
            const e2Win = m.winner === m.entry2;
            const e1Cls = isDraw ? 'draw' : (e1Win ? 'winner' : 'loser');
            const e2Cls = isDraw ? 'draw' : (e2Win ? 'winner' : 'loser');
            const badge = win => isDraw ? '<span class="cup-draw-badge">DRAW</span>' : (win ? '<span class="cup-win-badge">WIN</span>' : '<span class="cup-loss-badge">LOSS</span>');
            h += `
            <div class="cup-match">
                <div class="cup-team ${e1Cls}">
                    <div class="cup-team-info"><span class="cup-manager-name">${m.entry1Name}</span></div>
                    <div class="cup-team-right">${badge(e1Win)}<span class="cup-score">${m.entry1Points}</span></div>
                </div>
                <div class="cup-divider"><span class="cup-vs-label">VS</span></div>
                <div class="cup-team ${e2Cls}">
                    <div class="cup-team-info"><span class="cup-manager-name">${m.entry2Name}</span></div>
                    <div class="cup-team-right">${badge(e2Win)}<span class="cup-score">${m.entry2Points}</span></div>
                </div>
            </div>`;
        }
        h += `</div>`;
        return h;
    }

    // --------------------------------------------------------
    // WORLD CUP TAB
    // --------------------------------------------------------
    function renderWorldCup(container) {
        const wc = computed.worldcup;

        let html = `
        <div class="section-header">
            <h2>World Cup — $${wc.prizeWinner} winner / $${wc.prizeRunner} runner-up</h2>
            <p class="section-sub">3 head-to-head groups of 10 (GW${CONFIG.WORLDCUP.GROUPS.start}–${CONFIG.WORLDCUP.GROUPS.end}) · Top 2 per group + 2 best third-placed advance to an 8-team knockout (GW${CONFIG.WORLDCUP.KO_ROUNDS[0]}–${CONFIG.WORLDCUP.KO_ROUNDS[CONFIG.WORLDCUP.KO_ROUNDS.length - 1]}).</p>
        </div>`;

        if (wc.status === 'awaiting_draw') {
            html += `<div class="empty-state-large">
                <span class="empty-icon-large">🌍</span>
                <h3>Groups drawn at GW20</h3>
                <p>The three randomized head-to-head groups are created and codes shared before GW${CONFIG.WORLDCUP.GROUPS.start}.</p>
                <p>Group stage runs GW${CONFIG.WORLDCUP.GROUPS.start}–${CONFIG.WORLDCUP.GROUPS.end}, knockouts GW${CONFIG.WORLDCUP.KO_ROUNDS[0]}–${CONFIG.WORLDCUP.KO_ROUNDS[CONFIG.WORLDCUP.KO_ROUNDS.length - 1]}.</p>
            </div>`;
            container.innerHTML = html;
            return;
        }

        if (wc.bracket && wc.bracket.champion) {
            html += championBanner(wc.bracket.champion, 'World Cup Winner');
        }

        html += `<div class="wc-groups-grid">`;
        for (const g of wc.groups) {
            html += `<div class="wc-group"><div class="winners-section-header">Group ${g.letter}</div>${renderH2HTable(g.table, 2)}</div>`;
        }
        html += `</div>`;

        html += `<div class="winners-section-header">Knockout Phase</div>`;
        if (wc.bracket) {
            html += `<div class="cup-bracket">${renderKnockoutRounds(wc.bracket.rounds, '🌍')}</div>`;
        } else {
            html += `<div class="empty-state"><span class="empty-icon">⚔️</span><p>The knockout bracket is seeded once the group stage concludes after GW${wc.groupEnd}.</p></div>`;
        }
        container.innerHTML = html;
    }

    // --------------------------------------------------------
    // CUP TAB
    // --------------------------------------------------------
    function renderCup(container) {
        const cup = computed.cup;

        let html = `
        <div class="section-header">
            <h2>FA Cup — $${CONFIG.PRIZES.CUP}</h2>
            <p class="section-sub">The native FPL knockout cup (GW34–38) · Winner takes $${CONFIG.PRIZES.CUP}</p>
        </div>`;

        if (!cup.hasCup || cup.rounds.length === 0) {
            html += `
            <div class="empty-state-large">
                <span class="empty-icon-large">🏅</span>
                <h3>Cup Not Started Yet</h3>
                <p>The FA Cup for this league runs GW34–38.</p>
                <p>The winner receives <strong>$${CONFIG.PRIZES.CUP}</strong></p>
            </div>`;
        } else {
            // Summary bar — current stage, GW, players remaining, prize
            const latestRound = cup.rounds[cup.rounds.length - 1];
            const eliminated = cup.matches.filter(m => !m.isBye && m.winner).length;
            const playersLeft = appData.players.length - eliminated;

            html += `
            <div class="cup-summary-bar">
                <div class="cup-summary-item">
                    <span class="cup-summary-label">Current Stage</span>
                    <span class="cup-summary-value">${latestRound.label}</span>
                </div>
                <div class="cup-summary-item">
                    <span class="cup-summary-label">Gameweek</span>
                    <span class="cup-summary-value">${latestRound.event}</span>
                </div>
                <div class="cup-summary-item">
                    <span class="cup-summary-label">Players Left</span>
                    <span class="cup-summary-value">${playersLeft} / ${appData.players.length}</span>
                </div>
                <div class="cup-summary-item">
                    <span class="cup-summary-label">Prize</span>
                    <span class="cup-summary-value cup-prize-value">$${CONFIG.PRIZES.CUP}</span>
                </div>
            </div>`;

            for (const round of cup.rounds) {
                const hasRealMatches = round.matches.length > 0;
                const byeCount = round.byes.length;
                const roundComplete = round.matches.every(m => m.winner);
                const roundPending = round.matches.every(m => !m.winner);

                html += `
                <div class="cup-round">
                    <div class="cup-round-banner">
                        <div class="cup-round-title">
                            <span class="cup-round-icon">🏅</span>
                            <h3>${round.label}</h3>
                        </div>
                        <div class="cup-round-badges">
                            <span class="cup-round-gw-badge">GW${round.event}</span>
                            ${roundComplete ? '<span class="cup-stage-badge complete">Complete</span>' : roundPending ? '<span class="cup-stage-badge upcoming">Upcoming</span>' : '<span class="cup-stage-badge live">In Progress</span>'}
                        </div>
                    </div>`;

                if (byeCount > 0) {
                    html += `
                    <div class="cup-byes-section">
                        <span class="cup-byes-label">Byes (${byeCount})</span>
                        <div class="cup-bye-chips">
                            ${round.byes.map(b => `<span class="cup-bye-chip">${b.entry1PlayerName || b.entry1Name}</span>`).join('')}
                        </div>
                    </div>`;
                }

                if (hasRealMatches) {
                    html += `<div class="cup-matches">`;
                    for (const m of round.matches) {
                        const e1Win = m.winner === m.entry1;
                        const e2Win = m.winner === m.entry2;
                        const pending = !m.winner;
                        const initials = name => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                        const e1Name = m.entry1PlayerName || m.entry1Name;
                        const e2Name = m.entry2PlayerName || m.entry2Name;

                        if (pending) {
                            html += `
                            <div class="cup-match cup-match-pending">
                                <div class="cup-team">
                                    <div class="cup-team-avatar">${initials(e1Name)}</div>
                                    <div class="cup-team-info">
                                        <span class="cup-manager-name">${e1Name}</span>
                                        <span class="cup-team-label">${m.entry1Name}</span>
                                    </div>
                                </div>
                                <div class="cup-divider">
                                    <span class="cup-gw-upcoming">GW${m.event}</span>
                                    <span class="cup-vs-label">VS</span>
                                </div>
                                <div class="cup-team">
                                    <div class="cup-team-avatar">${initials(e2Name)}</div>
                                    <div class="cup-team-info">
                                        <span class="cup-manager-name">${e2Name}</span>
                                        <span class="cup-team-label">${m.entry2Name}</span>
                                    </div>
                                </div>
                            </div>`;
                        } else {
                            html += `
                            <div class="cup-match">
                                <div class="cup-team ${e1Win ? 'winner' : 'loser'}">
                                    <div class="cup-team-info">
                                        <span class="cup-manager-name">${e1Name}</span>
                                        <span class="cup-team-label">${m.entry1Name}</span>
                                    </div>
                                    <div class="cup-team-right">
                                        ${e1Win ? '<span class="cup-win-badge">WIN</span>' : '<span class="cup-loss-badge">OUT</span>'}
                                        <span class="cup-score">${m.entry1Points}</span>
                                    </div>
                                </div>
                                <div class="cup-divider">
                                    <span class="cup-vs-label">VS</span>
                                </div>
                                <div class="cup-team ${e2Win ? 'winner' : 'loser'}">
                                    <div class="cup-team-info">
                                        <span class="cup-manager-name">${e2Name}</span>
                                        <span class="cup-team-label">${m.entry2Name}</span>
                                    </div>
                                    <div class="cup-team-right">
                                        ${e2Win ? '<span class="cup-win-badge">WIN</span>' : '<span class="cup-loss-badge">OUT</span>'}
                                        <span class="cup-score">${m.entry2Points}</span>
                                    </div>
                                </div>
                            </div>`;
                        }
                    }
                    html += `</div>`;
                }

                html += `</div>`;
            }
        }

        container.innerHTML = html;
    }

    // --------------------------------------------------------
    // HIGHEST GW SCORE TAB
    // --------------------------------------------------------
    function renderHighestGW(container) {
        const h = computed.highestGW;

        let html = `
        <div class="section-header">
            <h2>Highest Single GW Score — $${CONFIG.PRIZES.HIGHEST_GW}</h2>
            <p class="section-sub">Best individual gameweek score across the entire season (Free Hit points eligible)</p>
        </div>`;

        // Winner showcase
        if (h.winners.length > 0) {
            html += `
            <div class="highest-gw-showcase">
                <div class="showcase-medal">🔥</div>
                <div class="showcase-info">
                    <span class="showcase-name">${h.winners[0].playerName}</span>
                    <span class="showcase-detail">${h.winners[0].entryName} · Gameweek ${h.winners[0].gw}</span>
                </div>
                <div class="showcase-score">${h.bestScore}<span class="pts-label">pts</span></div>
            </div>`;
        }

        // Top scores table
        html += `
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th class="col-rank">#</th>
                        <th>Manager</th>
                        <th>Team</th>
                        <th>Gameweek</th>
                        <th>Score</th>
                    </tr>
                </thead>
                <tbody>`;

        h.topScores.forEach((s, i) => {
            const isWinner = i === 0;
            html += `
                <tr class="${isWinner ? 'winner-row' : ''}">
                    <td class="col-rank"><span class="rank-badge ${isWinner ? 'gold' : ''}">${i + 1}</span></td>
                    <td><strong>${s.playerName}</strong></td>
                    <td>${s.entryName}</td>
                    <td>GW${s.gw}</td>
                    <td><strong>${s.score}</strong></td>
                </tr>`;
        });

        html += `</tbody></table></div>`;
        container.innerHTML = html;
    }

    // --------------------------------------------------------
    // TRANSFERS TAB
    // --------------------------------------------------------
    function renderTransfers(container) {
        if (!appData) return;

        const lastGW = appData.lastFinishedGW;
        const allGWs = [];
        for (let i = 1; i <= lastGW; i++) allGWs.push(i);

        // GW transfer distribution using existing gwHistory data
        function getGWDistribution(gw) {
            const counts = { 0: 0, 1: 0, 2: 0, '3+': 0 };
            for (const p of appData.players) {
                const hist = p.gwHistory[gw];
                const t = hist ? (hist.eventTransfers || 0) : 0;
                if (t === 0) counts[0]++;
                else if (t === 1) counts[1]++;
                else if (t === 2) counts[2]++;
                else counts['3+']++;
            }
            return counts;
        }

        // Build lookup maps from bootstrap
        const elementMap = {};
        const elementTeamMap = {};
        for (const el of (appData.bootstrap.elements || [])) {
            elementMap[el.id] = el.web_name;
            elementTeamMap[el.id] = el.team;
        }
        const teamMap = {};
        for (const t of (appData.bootstrap.teams || [])) {
            teamMap[t.id] = t.short_name;
        }

        // Compute per-GW player transfer stats from allTransfers filtered by event
        function getGWPlayerStats(gw) {
            const inCounts = {};
            const outCounts = {};
            for (const t of (appData.allTransfers || [])) {
                if (t.event !== gw) continue;
                if (t.element_in) inCounts[t.element_in] = (inCounts[t.element_in] || 0) + 1;
                if (t.element_out) outCounts[t.element_out] = (outCounts[t.element_out] || 0) + 1;
            }

            function toSortedList(obj) {
                return Object.entries(obj)
                    .map(([id, count]) => ({
                        name: elementMap[+id] || `Player ${id}`,
                        team: teamMap[elementTeamMap[+id]] || '',
                        count,
                    }))
                    .sort((a, b) => b.count - a.count);
            }

            const sortedIn = toSortedList(inCounts);
            const sortedOut = toSortedList(outCounts);
            return {
                top3In:     sortedIn.slice(0, 3),
                bottom3In:  sortedIn.length >= 3 ? sortedIn.slice(-3).reverse() : [...sortedIn].reverse(),
                top3Out:    sortedOut.slice(0, 3),
                bottom3Out: sortedOut.length >= 3 ? sortedOut.slice(-3).reverse() : [...sortedOut].reverse(),
            };
        }

        function playerRows(list) {
            if (list.length === 0) {
                return `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px">No transfers this GW</td></tr>`;
            }
            return list.map((p, i) => `
                <tr>
                    <td class="col-rank"><span class="rank-badge ${i === 0 ? 'gold' : ''}">${i + 1}</span></td>
                    <td><strong>${p.name}</strong></td>
                    <td style="color:var(--text-muted)">${p.team}</td>
                    <td class="col-gw"><strong>${p.count}</strong></td>
                </tr>`).join('');
        }

        const total = appData.players.length;

        let html = `
        <div class="section-header">
            <h2>Transfer Stats</h2>
            <p class="section-sub">Transfer activity and player movement for each gameweek across the mini-league</p>
        </div>

        <div class="transfers-dist-card">
            <div class="transfers-dist-header">
                <h3>How many transfers did managers make?</h3>
                <div class="gw-select-wrap">
                    <label for="transfer-gw-select">Gameweek:</label>
                    <select id="transfer-gw-select" class="gw-select">
                        ${allGWs.map(gw => `<option value="${gw}" ${gw === lastGW ? 'selected' : ''}>GW${gw}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div id="transfer-dist-content">
                ${buildTransferDistHTML(getGWDistribution(lastGW), total)}
            </div>
        </div>

        <div class="transfers-players-grid" id="transfer-players-grid">
        </div>`;

        container.innerHTML = html;

        function renderPlayerGrid(gw) {
            const stats = getGWPlayerStats(gw);
            document.getElementById('transfer-players-grid').innerHTML = `
            <div class="transfer-table-card card-green-accent">
                <h3 class="transfer-table-title">🟢 Most Transferred In</h3>
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th class="col-rank">#</th><th>Player</th><th>Club</th><th class="col-gw">Times In</th></tr></thead>
                        <tbody>${playerRows(stats.top3In)}</tbody>
                    </table>
                </div>
            </div>
            <div class="transfer-table-card card-red-accent">
                <h3 class="transfer-table-title">🔴 Most Transferred Out</h3>
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th class="col-rank">#</th><th>Player</th><th>Club</th><th class="col-gw">Times Out</th></tr></thead>
                        <tbody>${playerRows(stats.top3Out)}</tbody>
                    </table>
                </div>
            </div>
            <div class="transfer-table-card card-blue-accent">
                <h3 class="transfer-table-title">📉 Least Transferred In</h3>
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th class="col-rank">#</th><th>Player</th><th>Club</th><th class="col-gw">Times In</th></tr></thead>
                        <tbody>${playerRows(stats.bottom3In)}</tbody>
                    </table>
                </div>
            </div>
            <div class="transfer-table-card card-amber-accent">
                <h3 class="transfer-table-title">📈 Least Transferred Out</h3>
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th class="col-rank">#</th><th>Player</th><th>Club</th><th class="col-gw">Times Out</th></tr></thead>
                        <tbody>${playerRows(stats.bottom3Out)}</tbody>
                    </table>
                </div>
            </div>`;
        }

        renderPlayerGrid(lastGW);

        document.getElementById('transfer-gw-select').addEventListener('change', function () {
            const gw = parseInt(this.value);
            document.getElementById('transfer-dist-content').innerHTML = buildTransferDistHTML(getGWDistribution(gw), total);
            renderPlayerGrid(gw);
        });
    }

    function buildTransferDistHTML(dist, total) {
        const items = [
            { key: 0,    label: '0 Transfers',  color: '#64748b' },
            { key: 1,    label: '1 Transfer',   color: '#10b981' },
            { key: 2,    label: '2 Transfers',  color: '#f59e0b' },
            { key: '3+', label: '3+ Transfers', color: '#ef4444' },
        ];
        let html = '<div class="transfer-dist">';
        for (const item of items) {
            const count = dist[item.key] || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            html += `
            <div class="dist-row">
                <div class="dist-label">${item.label}</div>
                <div class="dist-bar-track">
                    <div class="dist-bar-fill" style="width:${pct}%;background:${item.color}"></div>
                </div>
                <div class="dist-value">${count}/${total} <span class="dist-pct">(${pct}%)</span></div>
            </div>`;
        }
        html += '</div>';
        return html;
    }

    // --------------------------------------------------------
    // EXPAND MONTHLY VIEW
    // --------------------------------------------------------
    function toggleMonthExpand(monthId, btn) {
        const el = document.getElementById('monthly-expand-' + monthId);
        if (!el) return;
        const isHidden = el.style.display === 'none';
        el.style.display = isHidden ? 'block' : 'none';
        btn.classList.toggle('expanded', isHidden);
        btn.innerHTML = isHidden
            ? '<span class="expand-icon">▲</span> Collapse'
            : `<span class="expand-icon">▼</span> View All Players`;
        if (isHidden) {
            el.classList.add('fade-in');
        }
    }

    return { init, forceRefresh, toggleMonthExpand };
})();

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', () => APP.init());
