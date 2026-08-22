// ============================================================
// Victory Vault Season 3 — FPL API Data Layer
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

    async function getCupMatches(cupLeagueId) {
        return getH2HMatches(cupLeagueId);
    }

    // Head-to-head league standings (Champions League / World Cup groups)
    async function getH2HStandings(leagueId) {
        try {
            return await fetchJSON(`${CONFIG.API_BASE}/leagues-h2h/${leagueId}/standings/`);
        } catch {
            return null;
        }
    }

    // Head-to-head match results for a league. The endpoint is paginated
    // (~50 matches/page), so walk pages until has_next is false.
    async function getH2HMatches(leagueId) {
        const all = [];
        try {
            for (let page = 1; page <= 20; page++) {
                const data = await fetchJSON(`${CONFIG.API_BASE}/leagues-h2h-matches/league/${leagueId}/?page=${page}`);
                if (!data || !data.results || data.results.length === 0) break;
                all.push(...data.results);
                if (!data.has_next) break;
            }
        } catch {
            // return whatever pages we managed to fetch
        }
        return all;
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
            players: [],       // { entry, player_name, entry_name, total, rank, history, chips }
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

        // Step 4: Fetch cup match data via h2h-matches endpoint
        if (progressCallback) progressCallback('Loading cup data...');
        const cupLeagueId = result.league && result.league.league && result.league.league.cup_league;
        result.cupMatches = cupLeagueId ? await getCupMatches(cupLeagueId) : [];

        // Step 5: Fetch phase standings for monthly prizes
        if (progressCallback) progressCallback('Loading monthly standings...');
        result.phaseStandings = {};
        const phaseEntries = Object.entries(CONFIG.MONTHLY_PHASES);
        const phasePromises = phaseEntries.map(([, cfg]) => getLeaguePhaseStandings(cfg.phaseId));
        const phaseResults = await Promise.all(phasePromises);
        phaseEntries.forEach(([month], i) => {
            result.phaseStandings[month] = phaseResults[i];
        });

        // Step 5b: Champions League (H2H) standings + matches
        if (progressCallback) progressCallback('Loading Champions League...');
        result.championsH2H = CONFIG.CHAMPIONS_H2H_LEAGUE_ID
            ? await getH2HStandings(CONFIG.CHAMPIONS_H2H_LEAGUE_ID)
            : null;
        result.championsMatches = CONFIG.CHAMPIONS_H2H_LEAGUE_ID
            ? await getH2HMatches(CONFIG.CHAMPIONS_H2H_LEAGUE_ID)
            : [];

        // Step 5c: World Cup group standings + matches (only once groups are drawn)
        result.worldcupGroups = null;
        if (Array.isArray(CONFIG.WORLDCUP_GROUP_LEAGUE_IDS) && CONFIG.WORLDCUP_GROUP_LEAGUE_IDS.length > 0) {
            if (progressCallback) progressCallback('Loading World Cup groups...');
            const groupStandings = await Promise.all(
                CONFIG.WORLDCUP_GROUP_LEAGUE_IDS.map(id => getH2HStandings(id))
            );
            const groupMatches = await Promise.all(
                CONFIG.WORLDCUP_GROUP_LEAGUE_IDS.map(id => getH2HMatches(id))
            );
            result.worldcupGroups = CONFIG.WORLDCUP_GROUP_LEAGUE_IDS.map((id, i) => ({
                leagueId: id,
                standings: groupStandings[i],
                matches: groupMatches[i],
            }));
        }

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
        getCupMatches,
        getH2HStandings,
        getH2HMatches,
        getEntryTransfers,
        getLiveData,
    };
})();
