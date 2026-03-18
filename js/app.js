// ============================================================
// Victory Vault Season 2 — Main Application Controller
// ============================================================

const APP = (() => {
    let appData = null;
    let computed = {};
    let activeTab = 'overview';

    // --------------------------------------------------------
    // INITIALIZATION
    // --------------------------------------------------------
    async function init() {
        setupTabs();
        await refreshData();
    }

    function setupTabs() {
        const tabBar = document.getElementById('tab-bar');
        tabBar.innerHTML = '';
        for (const tab of CONFIG.TABS) {
            const btn = document.createElement('button');
            btn.className = `tab-btn ${tab.id === activeTab ? 'active' : ''}`;
            btn.dataset.tab = tab.id;
            btn.innerHTML = `<span class="tab-icon">${tab.icon}</span><span class="tab-label">${tab.label}</span>`;
            btn.addEventListener('click', () => switchTab(tab.id));
            tabBar.appendChild(btn);
        }
    }

    function switchTab(tabId) {
        activeTab = tabId;
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tabId);
        });
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
            computed.freeHit = COMPETITIONS.computeFreeHitChip(appData);
            computed.cup = COMPETITIONS.computeFPLCup(appData);
            computed.highestGW = COMPETITIONS.computeHighestGWScore(appData);

            // Update timestamp
            const now = new Date();
            document.getElementById('last-updated').textContent =
                `Last updated: ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

            document.getElementById('current-gw').textContent = `GW ${appData.currentGW}`;

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
            case 'lms': renderLMS(content); break;
            case 'freehit': renderFreeHit(content); break;
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
        const f = computed.freeHit;
        const h = computed.highestGW;

        let html = `<div class="overview-grid">`;

        // Season leader card
        html += `
        <div class="overview-card card-gold">
            <div class="card-header">
                <span class="card-icon">🏆</span>
                <h3>Season Standings</h3>
            </div>
            <div class="card-body">
                <div class="leader-showcase">
                    <span class="trophy-emoji">🥇</span>
                    <div class="leader-info">
                        <span class="leader-name">${s[0]?.playerName || '—'}</span>
                        <span class="leader-detail">${s[0]?.entryName || ''} · ${s[0]?.total || 0} pts</span>
                    </div>
                    <span class="leader-prize">$${CONFIG.PRIZES.SEASON[1]}</span>
                </div>
                <div class="runner-ups">
                    <div class="runner-up"><span class="trophy-emoji small">🥈</span> ${s[1]?.playerName || '—'} <span class="pts">${s[1]?.total || 0} pts</span></div>
                    <div class="runner-up"><span class="trophy-emoji small">🥉</span> ${s[2]?.playerName || '—'} <span class="pts">${s[2]?.total || 0} pts</span></div>
                </div>
            </div>
        </div>`;

        // Monthly prize card
        const currentMonth = m.find(mo => mo.isStarted && !mo.isComplete);
        const lastCompletedMonth = [...m].reverse().find(mo => mo.isComplete);
        html += `
        <div class="overview-card card-green">
            <div class="card-header">
                <span class="card-icon">📅</span>
                <h3>Monthly Prize</h3>
            </div>
            <div class="card-body">
                ${lastCompletedMonth ? `
                <div class="mini-stat">
                    <span class="mini-label">Latest Winner (${lastCompletedMonth.month})</span>
                    <span class="mini-value">${lastCompletedMonth.winners.map(w => w.playerName).join(', ') || '—'}</span>
                    <span class="mini-detail">${lastCompletedMonth.winners[0]?.total || 0} pts · $${lastCompletedMonth.prizePerWinner}</span>
                </div>` : ''}
                ${currentMonth ? `
                <div class="mini-stat">
                    <span class="mini-label">In Progress: ${currentMonth.month}</span>
                    <span class="mini-value">${currentMonth.playerScores[0]?.playerName || '—'}</span>
                    <span class="mini-detail">Leading with ${currentMonth.playerScores[0]?.total || 0} pts</span>
                </div>` : ''}
                <div class="mini-stat muted"><span class="mini-label">$30/month · ${m.filter(mo => mo.isComplete).length}/${m.length} months decided</span></div>
            </div>
        </div>`;

        // LMS card
        html += `
        <div class="overview-card card-red">
            <div class="card-header">
                <span class="card-icon">💀</span>
                <h3>Last Man Standing</h3>
            </div>
            <div class="card-body">
                ${l.map(half => `
                <div class="mini-stat">
                    <span class="mini-label">${half.label}</span>
                    <span class="mini-value">${half.winner ? '🏆 ' + half.winner.playerName : half.alive.length + ' players alive'}</span>
                    <span class="mini-detail">${half.eliminations.length} eliminated · $${half.prize} prize</span>
                </div>`).join('')}
            </div>
        </div>`;

        // Free Hit card
        html += `
        <div class="overview-card card-blue">
            <div class="card-header">
                <span class="card-icon">🎯</span>
                <h3>Free Hit Chip</h3>
            </div>
            <div class="card-body">
                ${Object.values(f.halves).map(half => `
                <div class="mini-stat">
                    <span class="mini-label">${half.label} ${half.isComplete ? '✅' : '🔄'}</span>
                    <span class="mini-value">${half.winners.length > 0 ? half.winners.map(w => w.playerName).join(', ') : 'No usage yet'}</span>
                    <span class="mini-detail">${half.bestScore !== null ? half.bestScore + ' pts' : '—'} · $${half.prize}</span>
                </div>`).join('')}
                <div class="mini-stat muted"><span class="mini-label">${f.usages.length} total Free Hit uses</span></div>
            </div>
        </div>`;

        // Cup card
        html += `
        <div class="overview-card card-purple">
            <div class="card-header">
                <span class="card-icon">🏅</span>
                <h3>FPL Cup</h3>
            </div>
            <div class="card-body">
                <div class="mini-stat">
                    <span class="mini-value">${computed.cup.hasCup ? (Object.keys(computed.cup.rounds).length > 0 ? Object.keys(computed.cup.rounds).length + ' rounds played' : 'Starting soon (~GW34-35)') : 'Cup not yet created'}</span>
                    <span class="mini-detail">$${CONFIG.PRIZES.CUP} for the winner</span>
                </div>
            </div>
        </div>`;

        // Highest GW Score card
        html += `
        <div class="overview-card card-amber">
            <div class="card-header">
                <span class="card-icon">⚡</span>
                <h3>Highest GW Score</h3>
            </div>
            <div class="card-body">
                <div class="leader-showcase">
                    <span class="trophy-emoji">🔥</span>
                    <div class="leader-info">
                        <span class="leader-name">${h.winners[0]?.playerName || '—'}</span>
                        <span class="leader-detail">GW${h.winners[0]?.gw || '?'} · ${h.bestScore} pts (excl. Free Hit)</span>
                    </div>
                    <span class="leader-prize">$${CONFIG.PRIZES.HIGHEST_GW}</span>
                </div>
                <div class="runner-ups">
                    ${h.topScores.slice(1, 4).map((s, i) => `
                    <div class="runner-up">#${i + 2} ${s.playerName} <span class="pts">GW${s.gw} · ${s.score} pts</span></div>`).join('')}
                </div>
            </div>
        </div>`;

        html += `</div>`;




        container.innerHTML = html;
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

        const CHIP_NAMES = { wildcard: 'WC', freehit: 'FH', bboost: 'BB', '3xc': 'TC' };

        // Build per-player GW stats
        const players = appData.players.map(p => {
            const hist = p.gwHistory[displayGW] || {};
            const chipThisGW = p.chips.find(c => c.event === displayGW);
            return {
                entry: p.entry,
                playerName: p.playerName,
                entryName: p.entryName,
                gwPoints: hist.points || 0,
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
        const lmsHalf = computed.lms.find(h => displayGW >= h.startGW && displayGW <= h.endGW);

        let html = `
        <div class="section-header">
            <div class="gw-header-row">
                <h2>Gameweek ${displayGW} Stats</h2>
                ${isLive ? '<span class="live-pill meta-pill"><span class="live-dot"></span> LIVE</span>' : ''}
            </div>
            <p class="section-sub">GW scores, chip usage, bench points and transfer activity for all managers</p>
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
                <span class="gw-stat-value">${lmsHalf ? lmsHalf.alive.length + ' alive' : '—'}</span>
                <span class="gw-stat-sub">${lmsHalf ? lmsHalf.label : 'Not in LMS range'}</span>
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
        if (computed.lms) {
            for (const half of computed.lms) {
                for (const elim of half.eliminations) {
                    lmsElimSet.add(`${elim.entry}-${elim.gw}`);
                }
            }
        }

        const freeHitBestSet = new Set();
        if (computed.freeHit && computed.freeHit.halves) {
            for (const halfKey of ['HALF1', 'HALF2']) {
                const half = computed.freeHit.halves[halfKey];
                if (half && half.winners) {
                    for (const w of half.winners) {
                        freeHitBestSet.add(`${w.entry}-${w.gw}`);
                    }
                }
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
            <span class="progress-legend-item"><span class="legend-swatch freehit-best-swatch"></span> Highest Free Hit</span>
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
                const isFreeHitBest = freeHitBestSet.has(`${p.entry}-${g}`);
                const isHighestGW = highestGWSet.has(`${p.entry}-${g}`);
                const cls = isLmsElim ? 'gw-lms-elim' : isFreeHitBest ? 'gw-freehit-best' : isHighestGW ? 'gw-highest' : '';
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
            <h2>Monthly Prize — $30/month</h2>
            <p class="section-sub">Highest combined score across designated gameweeks each month. Click a month to see all players.</p>
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
    function renderLMS(container) {
        const halves = computed.lms;

        let html = `
        <div class="section-header">
            <h2>Last Man Standing — $60 per half</h2>
            <p class="section-sub">Lowest scorer each gameweek is eliminated. Last survivor wins.</p>
        </div>
        <div class="lms-container">`;

        for (const half of halves) {
            html += `
            <div class="lms-half">
                <div class="lms-half-header">
                    <h3>${half.label}</h3>
                    <span class="lms-status">${half.winner ? '🏆 Winner: ' + half.winner.playerName : half.alive.length + ' players still alive'}</span>
                </div>`;

            // Alive players
            if (half.alive.length > 0 && !half.winner) {
                html += `<div class="lms-alive">
                    <h4>🟢 Surviving Players (${half.alive.length})</h4>
                    <div class="alive-chips">
                        ${half.alive.map(p => `<span class="alive-chip">${p.playerName}</span>`).join('')}
                    </div>
                </div>`;
            }

            // Unresolved ties — needs manual resolution
            if (half.unresolvedTies && half.unresolvedTies.length > 0) {
                html += `<div class="lms-unresolved-ties">`;
                for (const tie of half.unresolvedTies) {
                    const playerList = tie.players.map(p => {
                        const parts = [p.playerName];
                        if (tie.captainDataAvailable) parts.push(`captain: ${p.captainPts} pts`);
                        parts.push(`season: ${p.seasonTotal} pts`);
                        return `${parts[0]} (${parts.slice(1).join(', ')})`;
                    }).join(' · ');
                    const reason = !tie.captainDataAvailable
                        ? 'Captain data unavailable — all tiebreakers exhausted.'
                        : 'All tiebreakers exhausted (GW pts, captain pts, season total all equal).';
                    html += `
                    <div class="lms-tie-warning">
                        <span class="tie-warning-icon">⚠️</span>
                        <div class="tie-warning-body">
                            <strong>GW${tie.gw} — Manual resolution needed</strong>
                            <span>${playerList} — all scored ${tie.score} pts. ${reason}</span>
                        </div>
                    </div>`;
                }
                html += `</div>`;
            }

            // Elimination timeline
            if (half.eliminations.length > 0) {
                html += `<div class="lms-timeline">
                    <h4>💀 Elimination Timeline</h4>
                    <div class="timeline">
                        ${half.eliminations.map((e, i) => {
                            let tbHtml = '';
                            if (e.tiebreaker) {
                                const survStr = e.tiebreaker.survivors.map(s => `${s.playerName} (${s.pts})`).join(', ');
                                const label = e.tiebreaker.type === 'captain'
                                    ? `Captain tiebreaker: ${e.tiebreaker.eliminatedPts} pts vs ${survStr}`
                                    : `Season total tiebreaker: ${e.tiebreaker.eliminatedPts} pts vs ${survStr}`;
                                tbHtml = `<span class="timeline-tiebreaker">⚖️ ${label}</span>`;
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

            html += `</div>`;
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    // --------------------------------------------------------
    // FREE HIT TAB
    // --------------------------------------------------------
    function renderFreeHit(container) {
        const fh = computed.freeHit;

        let html = `
        <div class="section-header">
            <h2>Free Hit Chip — $30 per half</h2>
            <p class="section-sub">Best use of the Free Hit chip in each half of the season</p>
        </div>
        <div class="freehit-container">`;

        for (const [key, half] of Object.entries(fh.halves)) {
            html += `
            <div class="freehit-half">
                <div class="freehit-half-header">
                    <h3>${half.label} ${half.isComplete ? '✅' : '🔄'}</h3>
                    <span class="freehit-prize">$${half.prize}</span>
                </div>`;

            if (half.usages.length > 0) {
                if (half.winners.length > 0) {
                    html += `<div class="freehit-winner">
                        <span class="winner-icon">🏆</span>
                        <span>${half.winners.map(w => w.playerName).join(', ')}</span>
                        <span class="winner-score">${half.bestScore} pts</span>
                    </div>`;
                }

                html += `
                <table class="data-table freehit-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Manager</th>
                            <th>Team</th>
                            <th>GW</th>
                            <th>Score</th>
                        </tr>
                    </thead>
                    <tbody>`;

                half.usages.forEach((u, i) => {
                    const isWinner = half.winners.some(w => w.entry === u.entry);
                    html += `
                        <tr class="${isWinner ? 'winner-row' : ''}">
                            <td>${i + 1}</td>
                            <td><strong>${u.playerName}</strong></td>
                            <td>${u.entryName}</td>
                            <td>GW${u.gw}</td>
                            <td><strong>${u.score}</strong></td>
                        </tr>`;
                });

                html += `</tbody></table>`;
            } else {
                html += `<div class="empty-state">
                    <span class="empty-icon">🎯</span>
                    <p>No Free Hit chips used yet in this half</p>
                </div>`;
            }

            html += `</div>`;
        }

        html += `</div>`;
        container.innerHTML = html;
    }

    // --------------------------------------------------------
    // CUP TAB
    // --------------------------------------------------------
    function renderCup(container) {
        const cup = computed.cup;

        let html = `
        <div class="section-header">
            <h2>FPL Cup — $${CONFIG.PRIZES.CUP}</h2>
            <p class="section-sub">Straight knockout competition, typically starts around GW34-35</p>
        </div>`;

        if (!cup.hasCup || Object.keys(cup.rounds).length === 0) {
            html += `
            <div class="empty-state-large">
                <span class="empty-icon-large">🏅</span>
                <h3>Cup Not Started Yet</h3>
                <p>The FPL Cup for this league typically begins around Gameweek 34-35.</p>
                <p>The winner receives <strong>$${CONFIG.PRIZES.CUP}</strong></p>
            </div>`;
        } else {
            const sortedRounds = Object.keys(cup.rounds).sort((a, b) => a - b);
            for (const gw of sortedRounds) {
                const matches = cup.rounds[gw];
                html += `
                <div class="cup-round">
                    <h3 class="round-header">Gameweek ${gw}</h3>
                    <div class="cup-matches">`;

                for (const m of matches) {
                    const e1Win = m.winner === m.entry1;
                    const e2Win = m.winner === m.entry2;
                    html += `
                    <div class="cup-match">
                        <div class="cup-team ${e1Win ? 'winner' : (e2Win ? 'loser' : '')}">
                            <span class="cup-team-name">${m.entry1PlayerName || m.entry1Name}</span>
                            <span class="cup-team-score">${m.entry1Points}</span>
                        </div>
                        <div class="cup-vs">VS</div>
                        <div class="cup-team ${e2Win ? 'winner' : (e1Win ? 'loser' : '')}">
                            <span class="cup-team-name">${m.entry2PlayerName || m.entry2Name}</span>
                            <span class="cup-team-score">${m.entry2Points}</span>
                        </div>
                    </div>`;
                }

                html += `</div></div>`;
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
            <p class="section-sub">Best individual gameweek score across the entire season (excluding Free Hit)</p>
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
