// ============================================================
// Victory Vault Season 2 — FPL API Data Layer
// All requests proxied via Cloudflare Worker to bypass CORS.
// ============================================================

const FPL_API = (() => {
    const cache = {};
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    // Cloudflare Worker CORS proxy — proxies all FPL API requests
    const PROXY_BASE = 'https://fpl-proxy.get-fpl.workers.dev/api';

    function toProxyUrl(url) {
        const base = CONFIG.API_BASE;
        if (!url.startsWith(base)) return url;
        return PROXY_BASE + url.slice(base.length);
    }

    async function fetchJSON(url) {
        const now = Date.now();
        if (cache[url] && (now - cache[url].time < CACHE_TTL)) {
            return cache[url].data;
        }

        const fetchUrl = toProxyUrl(url);
        const resp = await fetch(fetchUrl);
        if (!resp.ok) throw new Error(`Failed to load ${fetchUrl}: ${resp.status}`);
        const data = await resp.json();
        cache[url] = { data, time: now };
        return data;
    }

    function clearCache() {
        Object.keys(cache).forEach(k => delete cache[k]);
    }

    async function getBootstrap() {
        return fetchJSON(`${CONFIG.API_BASE}/bootstrap-static/`);
    }

    async function getLeagueStandings() {
        return fetchJSON(`${CONFIG.API_BASE}/leagues-classic/${CONFIG.LEAGUE_ID}/standings/`);
    }

    async function getLeaguePhaseStandings(phaseId) {
        return fetchJSON(`${CONFIG.API_BASE}/leagues-classic/${CONFIG.LEAGUE_ID}/standings/?phase=${phaseId}`);
    }

    async function getEntryHistory(entryId) {
        return fetchJSON(`${CONFIG.API_BASE}/entry/${entryId}/history/`);
    }

    async function getEntryPicks(entryId, gw) {
        return fetchJSON(`${CONFIG.API_BASE}/entry/${entryId}/event/${gw}/picks/`);
    }

    async function getEntryCup(entryId) {
        try {
            return await fetchJSON(`${CONFIG.API_BASE}/entry/${entryId}/cup/`);
        } catch {
            return null;
        }
    }

    async function getLiveData(gw) {
        return fetchJSON(`${CONFIG.API_BASE}/event/${gw}/live/`);
    }

    async function getEntryTransfers(entryId) {
        try {
            return await fetchJSON(`${CONFIG.API_BASE}/entry/${entryId}/transfers/`);
        } catch {
            return [];
        }
    }

    // Master data loader — fetches everything needed
    async function loadAllData(progressCallback) {
        const result = {
            bootstrap: null,
            league: null,
            players: [],       // { entry, player_name, entry_name, total, rank, history, chips, cupData }
            currentGW: 1,
            lastFinishedGW: 0,
            allTransfers: [],
        };

        // Step 1: Bootstrap
        if (progressCallback) progressCallback('Loading season data...');
        result.bootstrap = await getBootstrap();

        // Determine current and last finished GW
        const events = result.bootstrap.events || [];
        for (const ev of events) {
            if (ev.is_current) result.currentGW = ev.id;
            if (ev.finished && ev.data_checked) result.lastFinishedGW = ev.id;
        }
        if (result.lastFinishedGW === 0) {
            // fallback: find the last finished event
            for (const ev of events) {
                if (ev.finished) result.lastFinishedGW = ev.id;
            }
        }

        // Step 2: League standings
        if (progressCallback) progressCallback('Loading league standings...');
        result.league = await getLeagueStandings();

        const entries = result.league.standings.results;

        // Step 3: Fetch all player histories in parallel
        if (progressCallback) progressCallback(`Loading data for ${entries.length} players...`);

        const historyPromises = entries.map(e => getEntryHistory(e.entry));
        const histories = await Promise.all(historyPromises);

        // Step 4: Fetch cup data for all entries
        if (progressCallback) progressCallback('Loading cup data...');
        const cupPromises = entries.map(e => getEntryCup(e.entry));
        const cupResults = await Promise.all(cupPromises);

        // Step 5: Fetch phase standings for monthly prizes
        if (progressCallback) progressCallback('Loading monthly standings...');
        result.phaseStandings = {};
        const phaseEntries = Object.entries(CONFIG.MONTHLY_GWS);
        const phasePromises = phaseEntries.map(([, cfg]) => getLeaguePhaseStandings(cfg.phaseId));
        const phaseResults = await Promise.all(phasePromises);
        phaseEntries.forEach(([month], i) => {
            result.phaseStandings[month] = phaseResults[i];
        });

        // Step 6: Fetch transfer history for all entries
        if (progressCallback) progressCallback('Loading transfer history...');
        const transferPromises = entries.map(e => getEntryTransfers(e.entry));
        const transferResults = await Promise.all(transferPromises);
        result.allTransfers = transferResults.flat().filter(Boolean);

        // Combine
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const h = histories[i];

            // Extract GW history
            const gwHistory = {};
            if (h && h.current) {
                for (const gw of h.current) {
                    gwHistory[gw.event] = {
                        points: gw.points,
                        totalPoints: gw.total_points,
                        rank: gw.overall_rank,
                        pointsOnBench: gw.points_on_bench,
                        value: gw.value,
                        bank: gw.bank,
                        eventTransfers: gw.event_transfers,
                        eventTransfersCost: gw.event_transfers_cost,
                    };
                }
            }

            // Extract chips used
            const chips = [];
            if (h && h.chips) {
                for (const chip of h.chips) {
                    chips.push({
                        name: chip.name,
                        event: chip.event,
                    });
                }
            }

            result.players.push({
                entry: e.entry,
                playerName: e.player_name,
                entryName: e.entry_name,
                total: e.total,
                rank: e.rank,
                eventTotal: e.event_total,
                gwHistory,
                chips,
                cupData: cupResults[i],
            });
        }

        return result;
    }

    return {
        loadAllData,
        clearCache,
        getBootstrap,
        getLeagueStandings,
        getLeaguePhaseStandings,
        getEntryHistory,
        getEntryPicks,
        getEntryCup,
        getEntryTransfers,
        getLiveData,
    };
})();
