// ============================================================
// Victory Vault Season 2 — Competition Logic
// ============================================================

const COMPETITIONS = (() => {

    // Helper: get net GW score (points minus transfer hit cost)
    function getNetScore(gwData) {
        if (!gwData) return 0;
        return gwData.points - (gwData.eventTransfersCost || 0);
    }

    // --------------------------------------------------------
    // 1. SEASON STANDINGS
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
        const months = [];

        for (const [month, cfg] of Object.entries(CONFIG.MONTHLY_GWS)) {
            const gwsPlayed = cfg.gws.filter(gw => gw <= lastFinished);
            const gwsAll = cfg.gws;
            const isComplete = gwsPlayed.length === gwsAll.length && gwsAll.length > 0;
            const isStarted = gwsPlayed.length > 0;

            // Build a lookup of official FPL phase totals
            const phaseData = data.phaseStandings && data.phaseStandings[month];
            const phaseTotals = {};
            if (phaseData && phaseData.standings && phaseData.standings.results) {
                for (const r of phaseData.standings.results) {
                    phaseTotals[r.entry] = r.total;
                }
            }

            const playerScores = data.players.map(p => {
                const gwScores = {};
                for (const gw of gwsPlayed) {
                    // Use raw points for per-GW display (matches FPL website GW column)
                    gwScores[gw] = p.gwHistory[gw] ? p.gwHistory[gw].points : 0;
                }
                // Use official FPL phase total if available, else fall back to sum
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

            // Determine winner(s)
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
    // 3. LAST MAN STANDING
    // --------------------------------------------------------
    // getEntryPicksFn and getLiveDataFn are injected so this module stays
    // decoupled from the API layer but can still fetch captain data on demand.
    async function computeLastManStanding(data, getEntryPicksFn, getLiveDataFn) {
        const lastFinished = data.lastFinishedGW;
        const halves = [];

        // Cache live element-points maps by GW to avoid duplicate fetches.
        const liveCache = {};

        // Returns the points scored by entryId's captain in the given GW,
        // or null if the data cannot be determined.
        async function getCaptainPoints(entryId, gw) {
            try {
                const picks = await getEntryPicksFn(entryId, gw);
                if (!picks || !picks.picks) { console.log(`[captain debug] entry ${entryId} GW${gw}: no picks`); return null; }
                const captainPick = picks.picks.find(p => p.is_captain);
                if (!captainPick) { console.log(`[captain debug] entry ${entryId} GW${gw}: no captain pick found`); return null; }

                if (!liveCache[gw]) {
                    const live = await getLiveDataFn(gw);
                    const elemMap = {};
                    if (live && live.elements) {
                        for (const el of live.elements) {
                            elemMap[el.id] = el.stats.total_points;
                        }
                    }
                    liveCache[gw] = elemMap;
                }

                const pts = liveCache[gw][captainPick.element];
                console.log(`[captain debug] entry ${entryId} GW${gw}: captain element ${captainPick.element}, pts=${pts}`);
                return pts !== undefined ? pts : null;
            } catch (err) {
                console.log(`[captain debug] entry ${entryId} GW${gw}: caught error — ${err.message}`);
                return null;
            }
        }

        for (const [key, cfg] of Object.entries(CONFIG.LMS)) {
            const eliminations = [];
            const unresolvedTies = [];
            const alivePlayers = new Set(data.players.map(p => p.entry));
            const playerMap = {};
            data.players.forEach(p => { playerMap[p.entry] = p; });

            for (let gw = cfg.start; gw <= Math.min(cfg.end, lastFinished); gw++) {
                if (alivePlayers.size <= 1) break;

                // Find lowest scorer(s) among alive players.
                let lowest = Infinity;
                let lowestPlayers = [];

                for (const entryId of alivePlayers) {
                    const score = getNetScore(playerMap[entryId].gwHistory[gw]);
                    if (score < lowest) {
                        lowest = score;
                        lowestPlayers = [entryId];
                    } else if (score === lowest) {
                        lowestPlayers.push(entryId);
                    }
                }

                if (lowestPlayers.length === 1) {
                    // No tie — straightforward elimination.
                    const id = lowestPlayers[0];
                    eliminations.push({
                        gw,
                        entry: id,
                        playerName: playerMap[id].playerName,
                        entryName: playerMap[id].entryName,
                        score: lowest,
                        tiebreaker: null,
                    });
                    alivePlayers.delete(id);
                } else {
                    // ── Tiebreaker chain ───────────────────────────────────────
                    // stillTied: the group we haven't resolved yet (starts as all
                    // players tied at lowest GW score, shrinks if a step only
                    // partially resolves — e.g. 5-way tie → 2 eliminated by
                    // captain pts, 3 survive without needing further resolution).
                    // Each step looks only at the minimum within stillTied.
                    // ──────────────────────────────────────────────────────────

                    // Each evaluated tiebreaker step is recorded here so the UI
                    // can show the full chain, not just the deciding step.
                    const tiebreakerSteps = [];

                    // Step 1: captain points (lower captain pts → eliminated).
                    const captainPtsMap = {};
                    for (const id of lowestPlayers) {
                        captainPtsMap[id] = await getCaptainPoints(id, gw);
                    }

                    const captainAvailable = lowestPlayers.every(id => captainPtsMap[id] !== null);
                    let resolved = false;

                    if (captainAvailable) {
                        const minCaptain = Math.min(...lowestPlayers.map(id => captainPtsMap[id]));
                        const captainElim = lowestPlayers.filter(id => captainPtsMap[id] === minCaptain);
                        const captainSurv = lowestPlayers.filter(id => captainPtsMap[id] > minCaptain);

                        if (captainSurv.length > 0) {
                            // Captain pts resolved it — record the decisive step and stop.
                            for (const id of captainElim) {
                                eliminations.push({
                                    gw,
                                    entry: id,
                                    playerName: playerMap[id].playerName,
                                    entryName: playerMap[id].entryName,
                                    score: lowest,
                                    tiebreaker: {
                                        steps: [{
                                            type: 'captain',
                                            outcome: 'eliminated',
                                            eliminatedPts: captainPtsMap[id],
                                            survivors: captainSurv.map(s => ({
                                                playerName: playerMap[s].playerName,
                                                pts: captainPtsMap[s],
                                            })),
                                        }],
                                    },
                                });
                                alivePlayers.delete(id);
                            }
                            resolved = true;
                        } else {
                            // All tied on captain pts — record as inconclusive and fall through.
                            tiebreakerSteps.push({
                                type: 'captain',
                                outcome: 'tied',
                                allPts: minCaptain,
                            });
                        }
                    } else {
                        // Captain data missing — record and fall through to step 2.
                        tiebreakerSteps.push({
                            type: 'captain',
                            outcome: 'unavailable',
                        });
                    }

                    if (!resolved) {
                        // Step 2: season total (lower season total → eliminated).
                        const minSeason = Math.min(...lowestPlayers.map(id => playerMap[id].total));
                        const seasonElim = lowestPlayers.filter(id => playerMap[id].total === minSeason);
                        const seasonSurv = lowestPlayers.filter(id => playerMap[id].total > minSeason);

                        if (seasonSurv.length > 0) {
                            for (const id of seasonElim) {
                                eliminations.push({
                                    gw,
                                    entry: id,
                                    playerName: playerMap[id].playerName,
                                    entryName: playerMap[id].entryName,
                                    score: lowest,
                                    tiebreaker: {
                                        // Prepend the inconclusive captain step so the full
                                        // chain is visible in the UI.
                                        steps: [
                                            ...tiebreakerSteps,
                                            {
                                                type: 'season_total',
                                                outcome: 'eliminated',
                                                eliminatedPts: playerMap[id].total,
                                                survivors: seasonSurv.map(s => ({
                                                    playerName: playerMap[s].playerName,
                                                    pts: playerMap[s].total,
                                                })),
                                            },
                                        ],
                                    },
                                });
                                alivePlayers.delete(id);
                            }
                            resolved = true;
                        }
                    }

                    if (!resolved) {
                        // Step 3: unresolved — surface for manual review.
                        unresolvedTies.push({
                            gw,
                            score: lowest,
                            captainDataAvailable: captainAvailable,
                            players: lowestPlayers.map(id => ({
                                entry: id,
                                playerName: playerMap[id].playerName,
                                entryName: playerMap[id].entryName,
                                captainPts: captainPtsMap[id] ?? null,
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

            halves.push({
                label: key === 'HALF1' ? '1st Half (GW2–GW18)' : '2nd Half (GW20–GW38)',
                key,
                startGW: cfg.start,
                endGW: cfg.end,
                eliminations,
                unresolvedTies,
                alive,
                isComplete,
                winner: isComplete && alive.length === 1 ? alive[0] : null,
                prize: cfg.prize,
            });
        }

        return halves;
    }

    // --------------------------------------------------------
    // 4. FREE HIT CHIP
    // --------------------------------------------------------
    function computeFreeHitChip(data) {
        const freeHitUsages = [];

        for (const p of data.players) {
            for (const chip of p.chips) {
                if (chip.name === 'freehit') {
                    const gw = chip.event;
                    const score = getNetScore(p.gwHistory[gw]);
                    const half = gw <= 19 ? 'HALF1' : 'HALF2';
                    freeHitUsages.push({
                        entry: p.entry,
                        playerName: p.playerName,
                        entryName: p.entryName,
                        gw,
                        score,
                        half,
                    });
                }
            }
        }

        // Best per half
        const halves = {};
        for (const halfKey of ['HALF1', 'HALF2']) {
            const usages = freeHitUsages.filter(u => u.half === halfKey);
            usages.sort((a, b) => b.score - a.score);
            const bestScore = usages.length > 0 ? usages[0].score : null;
            const winners = usages.filter(u => u.score === bestScore);
            const halfLabel = halfKey === 'HALF1' ? '1st Half' : '2nd Half';

            // Determine if this half is complete
            const halfEnd = halfKey === 'HALF1' ? 19 : 38;
            const isComplete = data.lastFinishedGW >= halfEnd;

            halves[halfKey] = {
                label: halfLabel,
                usages,
                winners: bestScore !== null ? winners : [],
                bestScore,
                isComplete,
                prize: CONFIG.PRIZES.FREE_HIT,
                prizePerWinner: winners.length > 0 ? CONFIG.PRIZES.FREE_HIT / winners.length : CONFIG.PRIZES.FREE_HIT,
            };
        }

        return { usages: freeHitUsages, halves };
    }

    // --------------------------------------------------------
    // 5. FPL CUP
    // --------------------------------------------------------
    function computeFPLCup(data) {
        // The cup data comes from each entry's cup endpoint
        // We'll collect all cup matches
        const allMatches = [];
        const playerMap = {};
        data.players.forEach(p => { playerMap[p.entry] = p; });

        for (const p of data.players) {
            if (p.cupData && p.cupData.cup_matches) {
                for (const match of p.cupData.cup_matches) {
                    allMatches.push({
                        event: match.event,
                        entry1: match.entry_1_entry,
                        entry1Name: match.entry_1_name,
                        entry1PlayerName: match.entry_1_player_name,
                        entry1Points: match.entry_1_points,
                        entry2: match.entry_2_entry,
                        entry2Name: match.entry_2_name,
                        entry2PlayerName: match.entry_2_player_name,
                        entry2Points: match.entry_2_points,
                        winner: match.winner,
                        isKnockout: match.is_knockout,
                        isActive: !match.winner,
                    });
                }
            }
        }

        // Deduplicate matches (same match seen from both sides)
        const uniqueMatches = [];
        const seen = new Set();
        for (const m of allMatches) {
            const key = `${m.event}-${Math.min(m.entry1, m.entry2)}-${Math.max(m.entry1, m.entry2)}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueMatches.push(m);
            }
        }

        // Group by round (event)
        const rounds = {};
        for (const m of uniqueMatches) {
            if (!rounds[m.event]) rounds[m.event] = [];
            rounds[m.event].push(m);
        }

        // Check if league has cup
        const hasCup = data.league && data.league.league && data.league.league.has_cup;

        return {
            hasCup,
            matches: uniqueMatches,
            rounds,
            prize: CONFIG.PRIZES.CUP,
        };
    }

    // --------------------------------------------------------
    // 6. HIGHEST SINGLE GW SCORE
    // --------------------------------------------------------
    function computeHighestGWScore(data) {
        const lastFinished = data.lastFinishedGW;
        const allScores = [];

        // Build set of free hit GWs per player
        const freeHitGWs = {};
        for (const p of data.players) {
            freeHitGWs[p.entry] = new Set();
            for (const chip of p.chips) {
                if (chip.name === 'freehit') {
                    freeHitGWs[p.entry].add(chip.event);
                }
            }
        }

        for (const p of data.players) {
            for (let gw = 1; gw <= lastFinished; gw++) {
                // Exclude free hit GWs
                if (freeHitGWs[p.entry] && freeHitGWs[p.entry].has(gw)) continue;

                const score = getNetScore(p.gwHistory[gw]);
                allScores.push({
                    entry: p.entry,
                    playerName: p.playerName,
                    entryName: p.entryName,
                    gw,
                    score,
                });
            }
        }

        allScores.sort((a, b) => b.score - a.score);

        const bestScore = allScores.length > 0 ? allScores[0].score : 0;
        const winners = allScores.filter(s => s.score === bestScore);

        return {
            topScores: allScores.slice(0, 30), // top 30 for display
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
        computeFreeHitChip,
        computeFPLCup,
        computeHighestGWScore,
    };
})();
