#!/usr/bin/env node
// Fetches all FPL data for the league and saves it as static JSON files.
// Runs via GitHub Actions on a schedule so GitHub Pages always has fresh data.

const fs = require('fs');
const path = require('path');

const LEAGUE_ID = 1249203;
const API_BASE = 'https://fantasy.premierleague.com/api';
const DATA_DIR = path.join(__dirname, '..', 'data');
const PHASE_IDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-GB,en;q=0.9',
    'Referer': 'https://fantasy.premierleague.com/',
    'Origin': 'https://fantasy.premierleague.com',
};

async function fetchJson(url) {
    console.log(`  GET ${url}`);
    const resp = await fetch(url, { headers: HEADERS });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    return resp.json();
}

function save(filename, data) {
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(data));
}

// Run tasks with a concurrency cap to avoid rate-limiting.
async function runBatched(tasks, concurrency = 4) {
    const results = [];
    for (let i = 0; i < tasks.length; i += concurrency) {
        const batch = tasks.slice(i, i + concurrency).map(fn => fn());
        results.push(...await Promise.all(batch));
    }
    return results;
}

async function main() {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    // 1. Bootstrap
    console.log('\n[1/6] Bootstrap');
    const bootstrap = await fetchJson(`${API_BASE}/bootstrap-static/`);
    save('bootstrap.json', bootstrap);

    const finishedGWs = bootstrap.events.filter(e => e.finished).map(e => e.id);
    console.log(`      Finished GWs: ${finishedGWs.length > 0 ? finishedGWs.join(', ') : 'none yet'}`);

    // 2. League standings
    console.log('\n[2/6] League standings');
    const league = await fetchJson(`${API_BASE}/leagues-classic/${LEAGUE_ID}/standings/`);
    save('league-standings.json', league);

    const entries = league.standings.results.map(e => e.entry);
    console.log(`      Entries: ${entries.join(', ')}`);

    // 3. Phase standings (monthly prizes)
    console.log('\n[3/6] Phase standings');
    await runBatched(PHASE_IDS.map(phaseId => async () => {
        const data = await fetchJson(`${API_BASE}/leagues-classic/${LEAGUE_ID}/standings/?phase=${phaseId}`);
        save(`league-phase-${phaseId}.json`, data);
    }));

    // 4. Entry histories
    console.log('\n[4/6] Entry histories');
    await runBatched(entries.map(id => async () => {
        const data = await fetchJson(`${API_BASE}/entry/${id}/history/`);
        save(`entry-${id}-history.json`, data);
    }));

    // 5. Cup + transfers
    console.log('\n[5/6] Cup & transfers');
    await runBatched(entries.map(id => async () => {
        // Cup
        try {
            const cup = await fetchJson(`${API_BASE}/entry/${id}/cup/`);
            save(`entry-${id}-cup.json`, cup);
        } catch {
            save(`entry-${id}-cup.json`, null);
        }
        // Transfers
        try {
            const transfers = await fetchJson(`${API_BASE}/entry/${id}/transfers/`);
            save(`entry-${id}-transfers.json`, transfers);
        } catch {
            save(`entry-${id}-transfers.json`, []);
        }
    }), 3);

    // 6. GW picks for all finished gameweeks
    if (finishedGWs.length > 0) {
        console.log(`\n[6/7] GW picks (${entries.length} entries × ${finishedGWs.length} GWs)`);
        const picksTasks = [];
        for (const id of entries) {
            for (const gw of finishedGWs) {
                picksTasks.push(async () => {
                    try {
                        const data = await fetchJson(`${API_BASE}/entry/${id}/event/${gw}/picks/`);
                        save(`entry-${id}-gw-${gw}-picks.json`, data);
                    } catch (err) {
                        console.warn(`    WARN: picks missing for entry ${id} GW ${gw} — ${err.message}`);
                    }
                });
            }
        }
        await runBatched(picksTasks, 3);
    } else {
        console.log('\n[6/7] GW picks — skipped (no finished GWs yet)');
    }

    // 7. Live event data for all finished GWs (needed for captain-points tiebreaker in LMS)
    if (finishedGWs.length > 0) {
        console.log(`\n[7/7] Live event data (${finishedGWs.length} GWs)`);
        await runBatched(finishedGWs.map(gw => async () => {
            try {
                const data = await fetchJson(`${API_BASE}/event/${gw}/live/`);
                save(`event-${gw}-live.json`, data);
            } catch (err) {
                console.warn(`    WARN: live data missing for GW ${gw} — ${err.message}`);
            }
        }), 3);
    } else {
        console.log('\n[7/7] Live event data — skipped (no finished GWs yet)');
    }

    console.log('\nAll data saved to data/\n');
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
