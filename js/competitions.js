// ============================================================
// Victory Vault Season 3 — Competition Logic
// ============================================================

const COMPETITIONS = (() => {

    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    // Helper: get net GW score (points minus transfer hit cost)
    function getNetScore(gwData) {
        if (!gwData) return 0;
        return gwData.points - (gwData.eventTransfersCost || 0);
    }

    // Build a { month -> [gw ids] } map from bootstrap event deadlines.
    // A gameweek belongs to the month in which its deadline falls (S3 rule).
    function buildMonthlyGWMap(bootstrap) {
        const map = {};
        const events = (bootstrap && bootstrap.events) || [];
        for (const ev of events) {
            if (!ev.deadline_time) continue;
            const monthName = MONTH_NAMES[new Date(ev.deadline_time).getUTCMonth()];
            if (!map[monthName]) map[monthName] = [];
            map[monthName].push(ev.id);
        }
        return map;
    }

    // --------------------------------------------------------
    // Pick resolver — lazily fetches captain / vice-captain points
    // for tie-breakers, sharing a per-GW live-points cache.
    // getEntryPicksFn and getLiveDataFn are injected so this module
    // stays decoupled from the API layer.
    // --------------------------------------------------------
    function makePickResolver(getEntryPicksFn, getLiveDataFn) {
        const liveCache = {};

        async function liveMap(gw) {
            if (!liveCache[gw]) {
                const live = await getLiveDataFn(gw);
                const elemMap = {};
                if (live && live.elements) {
                    for (const el of live.elements) elemMap[el.id] = el.stats.total_points;
                }
                liveCache[gw] = elemMap;
            }
            return liveCache[gw];
        }

        // Points scored by the pick matching `predicate` (captain / vice), or null.
        async function pickPoints(entryId, gw, predicate) {
            try {
                const picks = await getEntryPicksFn(entryId, gw);
                if (!picks || !picks.picks) return null;
                const pick = picks.picks.find(predicate);
                if (!pick) return null;
                const map = await liveMap(gw);
                const pts = map[pick.element];
                return pts !== undefined ? pts : null;
            } catch {
                return null;
            }
        }

        return {
            getCaptainPoints: (id, gw) => pickPoints(id, gw, p => p.is_captain),
            getVicePoints: (id, gw) => pickPoints(id, gw, p => p.is_vice_captain),
        };
    }

    // Resolve a tie among `tiedIds` using an ordered list of resolvers.
    // Each resolver: { type, get: async(id, gw) => number|null }. Lower value
    // is eliminated. Returns { eliminated: [ids]|null, steps: [...] } where the
    // full chain (including inconclusive steps) is recorded for the UI.
    async function resolveTie(tiedIds, gw, playerMap, resolvers) {
        const steps = [];
        for (const r of resolvers) {
            const vals = {};
            let allAvailable = true;
            for (const id of tiedIds) {
                const v = await r.get(id, gw);
                vals[id] = v;
                if (v === null || v === undefined) allAvailable = false;
            }
            if (!allAvailable) {
                steps.push({ type: r.type, outcome: 'unavailable' });
                continue;
            }
            const min = Math.min(...tiedIds.map(id => vals[id]));
            const elim = tiedIds.filter(id => vals[id] === min);
            const surv = tiedIds.filter(id => vals[id] > min);
            if (surv.length > 0) {
                return {
                    eliminated: elim,
                    valsByEntry: vals,
                    steps: [...steps, {
                        type: r.type,
                        outcome: 'eliminated',
                        eliminatedPts: min,
                        survivors: surv.map(s => ({ playerName: playerMap[s].playerName, pts: vals[s] })),
                    }],
                };
            }
            steps.push({ type: r.type, outcome: 'tied', allPts: min });
        }
        return { eliminated: null, steps };
    }

    // --------------------------------------------------------
    // 1. SEASON STANDINGS (Classic League)
    // --------------------------------------------------------
    function computeSeasonStandings(data) {
        const players = data.players
            .map(p => ({
                playerName: p.playerName,
                entryName: p.entryName,
                entry: p.entry,
                total: p.total,
                eventTotal: p.eventTotal,
            }))
            .sort((a, b) => b.total - a.total);

        players.forEach((p, i) => {
            p.rank = i + 1;
            p.prize = CONFIG.PRIZES.SEASON[p.rank] || 0;
        });
        return players;
    }

    // --------------------------------------------------------
    // 2. MONTHLY PRIZE
    // --------------------------------------------------------
    function computeMonthlyPrize(data) {
        const lastFinished = data.lastFinishedGW;
        const gwMap = buildMonthlyGWMap(data.bootstrap);
        const months = [];

        for (const [month, cfg] of Object.entries(CONFIG.MONTHLY_PHASES)) {
            const gwsAll = gwMap[month] || [];
            const gwsPlayed = gwsAll.filter(gw => gw <= lastFinished);
            const isComplete = gwsPlayed.length === gwsAll.length && gwsAll.length > 0;
            const isStarted = gwsPlayed.length > 0;

            // Official FPL phase totals (authoritative for the month)
            const phaseData = data.phaseStandings && data.phaseStandings[month];
            const phaseTotals = {};
            if (phaseData && phaseData.standings && phaseData.standings.results) {
                for (const r of phaseData.standings.results) phaseTotals[r.entry] = r.total;
            }

            const playerScores = data.players.map(p => {
                const gwScores = {};
                for (const gw of gwsPlayed) {
                    gwScores[gw] = p.gwHistory[gw] ? p.gwHistory[gw].points : 0;
                }
                const total = (phaseTotals[p.entry] !== undefined)
                    ? phaseTotals[p.entry]
                    : Object.values(gwScores).reduce((a, b) => a + b, 0);
                return {
                    playerName: p.playerName,
                    entryName: p.entryName,
                    entry: p.entry,
                    total,
                    gwScores,
                };
            }).sort((a, b) => b.total - a.total);

            let winners = [];
            if (isComplete && playerScores.length > 0) {
                const best = playerScores[0].total;
                winners = playerScores.filter(p => p.total === best);
            }

            months.push({
                month,
                gws: gwsAll,
                gwsPlayed,
                isComplete,
                isStarted,
                playerScores,
                winners,
                prize: cfg.prize,
                prizePerWinner: winners.length > 0 ? cfg.prize / winners.length : cfg.prize,
            });
        }
        return months;
    }

    // --------------------------------------------------------
    // 3. LAST MAN STANDING — single run GW1–29
    // --------------------------------------------------------
    async function computeLastManStanding(data, getEntryPicksFn, getLiveDataFn) {
        const cfg = CONFIG.LMS;
        const lastFinished = data.lastFinishedGW;
        const resolver = makePickResolver(getEntryPicksFn, getLiveDataFn);

        const playerMap = {};
        data.players.forEach(p => { playerMap[p.entry] = p; });

        const tieResolvers = [
            { type: 'captain', get: resolver.getCaptainPoints },
            { type: 'vice_captain', get: resolver.getVicePoints },
            { type: 'season_total', get: async (id) => playerMap[id].total },
        ];

        const eliminations = [];
        const unresolvedTies = [];
        const alivePlayers = new Set(data.players.map(p => p.entry));

        for (let gw = cfg.start; gw <= Math.min(cfg.end, lastFinished); gw++) {
            if (alivePlayers.size <= 1) break;

            // Lowest net scorer(s) among alive players
            let lowest = Infinity;
            let lowestPlayers = [];
            for (const entryId of alivePlayers) {
                const score = getNetScore(playerMap[entryId].gwHistory[gw]);
                if (score < lowest) { lowest = score; lowestPlayers = [entryId]; }
                else if (score === lowest) { lowestPlayers.push(entryId); }
            }

            if (lowestPlayers.length === 1) {
                const id = lowestPlayers[0];
                eliminations.push({
                    gw, entry: id,
                    playerName: playerMap[id].playerName,
                    entryName: playerMap[id].entryName,
                    score: lowest, tiebreaker: null,
                });
                alivePlayers.delete(id);
            } else {
                const res = await resolveTie(lowestPlayers, gw, playerMap, tieResolvers);
                if (res.eliminated) {
                    for (const id of res.eliminated) {
                        eliminations.push({
                            gw, entry: id,
                            playerName: playerMap[id].playerName,
                            entryName: playerMap[id].entryName,
                            score: lowest,
                            tiebreaker: { steps: res.steps },
                        });
                        alivePlayers.delete(id);
                    }
                } else {
                    unresolvedTies.push({
                        gw, score: lowest,
                        players: lowestPlayers.map(id => ({
                            entry: id,
                            playerName: playerMap[id].playerName,
                            entryName: playerMap[id].entryName,
                            seasonTotal: playerMap[id].total,
                        })),
                    });
                }
            }
        }

        const alive = [...alivePlayers].map(id => ({
            entry: id,
            playerName: playerMap[id].playerName,
            entryName: playerMap[id].entryName,
        }));

        const isComplete = alivePlayers.size === 1 && lastFinished >= cfg.end;
        // Runner-up = the manager eliminated last (field reduced from 2 → 1).
        const lastElim = eliminations.length > 0 ? eliminations[eliminations.length - 1] : null;

        return {
            startGW: cfg.start,
            endGW: cfg.end,
            eliminations,
            unresolvedTies,
            alive,
            isComplete,
            winner: alive.length === 1 ? alive[0] : null,
            runnerUp: isComplete && lastElim ? lastElim : null,
            prizeWinner: CONFIG.PRIZES.LMS.WINNER,
            prizeRunner: CONFIG.PRIZES.LMS.RUNNER,
        };
    }

    // --------------------------------------------------------
    // Shared single-elimination knockout engine.
    //   pairings   : [[entryIdA, entryIdB], ...] first-round matches (bracket order)
    //   roundGWs   : [gwR1, gwR2, ...] gameweek each round is decided on
    //   roundNames : optional ['Quarter-Final', 'Semi-Final', 'Final']
    //   playerMap  : { entry -> player }
    //   lastFinished, resolver (from makePickResolver)
    // Returns { rounds:[{label,event,matches:[...]}], champion, runnerUp }.
    // --------------------------------------------------------
    async function computeKnockout({ pairings, roundGWs, roundNames, playerMap, lastFinished }, resolver) {
        const names = roundNames || defaultRoundNames(pairings.length);
        const rounds = [];
        let current = pairings.map(pr => pr.slice());
        let champion = null, runnerUp = null;

        for (let r = 0; r < roundGWs.length && current.length > 0; r++) {
            const gw = roundGWs[r];
            const roundMatches = [];
            const winners = [];

            for (const [a, b] of current) {
                const match = await resolveMatch(a, b, gw, playerMap, lastFinished, resolver);
                roundMatches.push(match);
                winners.push(match.winner);   // may be null if not yet decided
            }

            rounds.push({ label: names[r] || `Round ${r + 1}`, event: gw, matches: roundMatches });

            // Only advance if every match in the round is decided.
            if (winners.some(w => !w)) break;

            if (winners.length === 1) {
                champion = winners[0];
                const finalMatch = roundMatches[0];
                runnerUp = finalMatch.winner === finalMatch.entry1 ? finalMatch.entry2 : finalMatch.entry1;
                break;
            }
            // Pair winners for the next round (2i vs 2i+1)
            const next = [];
            for (let i = 0; i < winners.length; i += 2) next.push([winners[i], winners[i + 1]]);
            current = next;
        }

        return { rounds, champion, runnerUp };
    }

    function defaultRoundNames(firstRoundPairs) {
        if (firstRoundPairs === 4) return ['Quarter-Final', 'Semi-Final', 'Final'];
        if (firstRoundPairs === 2) return ['Semi-Final', 'Final'];
        if (firstRoundPairs === 1) return ['Final'];
        return [];
    }

    // Resolve one knockout match on gameweek `gw`.
    async function resolveMatch(a, b, gw, playerMap, lastFinished, resolver) {
        const pa = playerMap[a], pb = playerMap[b];
        const base = {
            entry1: a, entry2: b,
            entry1Name: pa ? pa.entryName : '—', entry2Name: pb ? pb.entryName : '—',
            entry1PlayerName: pa ? pa.playerName : 'TBD', entry2PlayerName: pb ? pb.playerName : 'TBD',
            event: gw, winner: null, tiebreak: null,
        };

        // Bye — one side missing → auto-advance.
        if (!a || !b) {
            base.isBye = true;
            base.winner = a || b;
            return base;
        }

        base.entry1Points = getNetScore(pa.gwHistory[gw]);
        base.entry2Points = getNetScore(pb.gwHistory[gw]);

        if (gw > lastFinished) return base; // not played yet

        if (base.entry1Points > base.entry2Points) base.winner = a;
        else if (base.entry2Points > base.entry1Points) base.winner = b;
        else {
            // Tie → captain → vice → season total (lower is eliminated).
            const tieResolvers = [
                { type: 'captain', get: resolver.getCaptainPoints },
                { type: 'vice_captain', get: resolver.getVicePoints },
                { type: 'season_total', get: async (id) => playerMap[id].total },
            ];
            const res = await resolveTie([a, b], gw, playerMap, tieResolvers);
            if (res.eliminated && res.eliminated.length === 1) {
                base.winner = res.eliminated[0] === a ? b : a;
                base.tiebreak = res.steps;
            }
        }
        return base;
    }

    // Standard 8-seed bracket order so seeds 1 & 2 can only meet in the final.
    function bracketPairsFromSeeds(seeds) {
        const order8 = [[0, 7], [3, 4], [2, 5], [1, 6]]; // 1v8, 4v5, 3v6, 2v7
        if (seeds.length >= 8) return order8.map(([i, j]) => [seeds[i], seeds[j]]);
        // Fallback for smaller fields: pair outermost seeds inward.
        const pairs = [];
        for (let i = 0; i < Math.floor(seeds.length / 2); i++) pairs.push([seeds[i], seeds[seeds.length - 1 - i]]);
        return pairs;
    }

    // Rank an H2H standings payload; tie-break by overall season points.
    function rankH2H(h2h, seasonPtsByEntry) {
        const results = (h2h && h2h.standings && h2h.standings.results) || [];
        return results.map(r => ({
            entry: r.entry,
            entryName: r.entry_name,
            playerName: r.player_name,
            played: r.matches_played,
            won: r.matches_won,
            drawn: r.matches_drawn,
            lost: r.matches_lost,
            pointsFor: r.points_for,
            h2hPoints: r.total,
            seasonPoints: seasonPtsByEntry[r.entry] || 0,
        })).sort((x, y) => (y.h2hPoints - x.h2hPoints) || (y.seasonPoints - x.seasonPoints));
    }

    // --------------------------------------------------------
    // 4. CHAMPIONS LEAGUE — H2H (GW1–15) → top-8 knockout (GW15–18)
    // --------------------------------------------------------
    async function computeChampionsLeague(data, getEntryPicksFn, getLiveDataFn) {
        const cfg = CONFIG.CHAMPIONS;
        const lastFinished = data.lastFinishedGW;
        const seasonPtsByEntry = {};
        const playerMap = {};
        data.players.forEach(p => { seasonPtsByEntry[p.entry] = p.total; playerMap[p.entry] = p; });

        const table = rankH2H(data.championsH2H, seasonPtsByEntry);
        table.forEach((t, i) => { t.rank = i + 1; });

        const leaguePhaseDone = lastFinished >= cfg.H2H.end;
        let bracket = null;

        if (leaguePhaseDone && table.length >= cfg.ADVANCE) {
            const seeds = table.slice(0, cfg.ADVANCE).map(t => t.entry);
            const pairings = bracketPairsFromSeeds(seeds);
            const resolver = makePickResolver(getEntryPicksFn, getLiveDataFn);
            bracket = await computeKnockout(
                { pairings, roundGWs: cfg.KO_ROUNDS, playerMap, lastFinished }, resolver);
        }

        return {
            hasData: !!(data.championsH2H && data.championsH2H.standings),
            table,
            leaguePhaseStart: cfg.H2H.start,
            leaguePhaseEnd: cfg.H2H.end,
            leaguePhaseDone,
            advance: cfg.ADVANCE,
            bracket,
            prizeWinner: CONFIG.PRIZES.CHAMPIONS.WINNER,
            prizeRunner: CONFIG.PRIZES.CHAMPIONS.RUNNER,
        };
    }

    // --------------------------------------------------------
    // 5. WORLD CUP — 3 groups (GW21–29) → 8-team knockout (GW30–32)
    // --------------------------------------------------------
    async function computeWorldCup(data, getEntryPicksFn, getLiveDataFn) {
        const cfg = CONFIG.WORLDCUP;
        if (!data.worldcupGroups) {
            return { status: 'awaiting_draw',
                prizeWinner: CONFIG.PRIZES.WORLDCUP.WINNER,
                prizeRunner: CONFIG.PRIZES.WORLDCUP.RUNNER };
        }

        const lastFinished = data.lastFinishedGW;
        const playerMap = {};
        const seasonPtsFromGroupStart = {};
        data.players.forEach(p => {
            playerMap[p.entry] = p;
            // "overall season FPL points accumulated from GW21 onward"
            let s = 0;
            for (let gw = cfg.GROUPS.start; gw <= lastFinished; gw++) s += getNetScore(p.gwHistory[gw]);
            seasonPtsFromGroupStart[p.entry] = s;
        });

        const groupLetters = ['A', 'B', 'C'];
        const groups = data.worldcupGroups.map((g, i) => ({
            letter: groupLetters[i] || String.fromCharCode(65 + i),
            table: rankH2H(g.standings, seasonPtsFromGroupStart)
                .map((t, idx) => ({ ...t, rank: idx + 1 })),
        }));

        const groupsDone = lastFinished >= cfg.GROUPS.end && groups.every(g => g.table.length >= 3);
        let bracket = null;

        if (groupsDone) {
            const G = {};
            groups.forEach(g => { G[g.letter] = g.table; });
            // Best two 3rd-placed across groups (by accumulated group-stage H2H points)
            const thirds = groups
                .map(g => g.table[2])
                .filter(Boolean)
                .sort((a, b) => (b.h2hPoints - a.h2hPoints) || (b.seasonPoints - a.seasonPoints));
            const bestThird = thirds[0], secondThird = thirds[1];

            // Seeding per S3 rules (cross-group draw)
            const pairings = [
                [G.A[0].entry, secondThird.entry],  // QF1: A1 vs 2nd-best 3rd
                [G.B[0].entry, bestThird.entry],     // QF2: B1 vs best 3rd
                [G.C[0].entry, G.B[1].entry],        // QF3: C1 vs B2
                [G.A[1].entry, G.C[1].entry],        // QF4: A2 vs C2
            ];
            const resolver = makePickResolver(getEntryPicksFn, getLiveDataFn);
            bracket = await computeKnockout(
                { pairings, roundGWs: cfg.KO_ROUNDS, playerMap, lastFinished }, resolver);
        }

        return {
            status: 'active',
            groups,
            groupStart: cfg.GROUPS.start,
            groupEnd: cfg.GROUPS.end,
            groupsDone,
            bracket,
            prizeWinner: CONFIG.PRIZES.WORLDCUP.WINNER,
            prizeRunner: CONFIG.PRIZES.WORLDCUP.RUNNER,
        };
    }

    // --------------------------------------------------------
    // 6. FA CUP (FPL CUP)
    // --------------------------------------------------------
    function computeFPLCup(data) {
        const hasCup = data.league && data.league.league && data.league.league.has_cup;
        const rawMatches = data.cupMatches || [];

        const allMatches = rawMatches.map(m => ({
            event: m.event,
            entry1: m.entry_1_entry,
            entry1Name: m.entry_1_name,
            entry1PlayerName: m.entry_1_player_name,
            entry1Points: m.entry_1_points,
            entry2: m.entry_2_entry,
            entry2Name: m.entry_2_name,
            entry2PlayerName: m.entry_2_player_name,
            entry2Points: m.entry_2_points,
            winner: m.winner,
            isBye: m.is_bye,
            isActive: !m.winner,
            knockoutName: m.knockout_name,
        }));

        const roundMap = {};
        for (const m of allMatches) {
            const key = m.knockoutName;
            if (!roundMap[key]) roundMap[key] = { event: m.event, label: m.knockoutName, matches: [], byes: [] };
            if (m.isBye) roundMap[key].byes.push(m);
            else roundMap[key].matches.push(m);
        }
        const rounds = Object.values(roundMap).sort((a, b) => a.event - b.event);

        return { hasCup, matches: allMatches, rounds, prize: CONFIG.PRIZES.CUP };
    }

    // --------------------------------------------------------
    // 7. HIGHEST SINGLE GW SCORE (Free Hit points fully eligible)
    // --------------------------------------------------------
    function computeHighestGWScore(data) {
        const lastFinished = data.lastFinishedGW;
        const allScores = [];

        for (const p of data.players) {
            for (let gw = 1; gw <= lastFinished; gw++) {
                allScores.push({
                    entry: p.entry,
                    playerName: p.playerName,
                    entryName: p.entryName,
                    gw,
                    score: getNetScore(p.gwHistory[gw]),
                });
            }
        }

        allScores.sort((a, b) => b.score - a.score);
        const bestScore = allScores.length > 0 ? allScores[0].score : 0;
        const winners = allScores.filter(s => s.score === bestScore);

        return {
            topScores: allScores.slice(0, 30),
            bestScore,
            winners,
            prize: CONFIG.PRIZES.HIGHEST_GW,
            prizePerWinner: winners.length > 0 ? CONFIG.PRIZES.HIGHEST_GW / winners.length : CONFIG.PRIZES.HIGHEST_GW,
        };
    }

    return {
        computeSeasonStandings,
        computeMonthlyPrize,
        computeLastManStanding,
        computeChampionsLeague,
        computeWorldCup,
        computeFPLCup,
        computeHighestGWScore,
    };
})();
