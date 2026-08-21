// ============================================================
// Victory Vault Season 3 — Configuration
// ============================================================

const CONFIG = {
    // Classic league (persists across seasons; standings reset each year)
    LEAGUE_ID: 306358,                 // "Victory Vault 26/27"

    // Champions League — head-to-head league (join code c1lxjn)
    CHAMPIONS_H2H_LEAGUE_ID: 1533420,  // "Victory Vault: CL Group"

    // World Cup — 3 head-to-head groups, drawn at GW20 (fill in when created)
    WORLDCUP_GROUP_LEAGUE_IDS: [],     // e.g. [id_A, id_B, id_C]
    WORLDCUP_GROUPS: {},               // { A: [entryId,...], B: [...], C: [...] }

    // FPL API Base
    API_BASE: 'https://fantasy.premierleague.com/api',

    // Prize configuration (in dollars) — total pool $1,500
    PRIZES: {
        SEASON: { 1: 250, 2: 125, 3: 75 },   // Classic League — $450
        MONTHLY: 25,                          // $25 × 10 months — $250
        LMS: { WINNER: 150, RUNNER: 75 },     // Last Man Standing — $225
        CHAMPIONS: { WINNER: 150, RUNNER: 75 },// Champions League — $225
        WORLDCUP: { WINNER: 150, RUNNER: 75 }, // World Cup — $225
        CUP: 75,                              // FA Cup (FPL Cup) — $75
        HIGHEST_GW: 50,                       // Highest single GW — $50
    },

    // Last Man Standing — single run GW1–29
    LMS: { start: 1, end: 29 },

    // Champions League — H2H league phase then top-8 knockout
    CHAMPIONS: {
        H2H: { start: 1, end: 15 },
        ADVANCE: 8,
        KO_ROUNDS: [16, 17, 18],   // QF (GW16), SF (GW17), Final (GW18)
    },

    // World Cup — group stage then 8-team knockout
    WORLDCUP: {
        GROUPS: { start: 21, end: 29 },
        KO_ROUNDS: [30, 31, 32],   // QF (GW30), SF (GW31), Final (GW32)
    },

    // Monthly prize — official FPL "phase" per calendar month.
    // phaseId corresponds to the FPL API ?phase= parameter (2 = August … 11 = May).
    // The GW → month mapping is derived dynamically at compute time from
    // bootstrap.events[].deadline_time (a GW belongs to the month its deadline
    // falls in), so it stays correct across seasons — no hardcoded GW arrays.
    MONTHLY_PHASES: {
        'August':    { prize: 25, phaseId: 2 },
        'September': { prize: 25, phaseId: 3 },
        'October':   { prize: 25, phaseId: 4 },
        'November':  { prize: 25, phaseId: 5 },
        'December':  { prize: 25, phaseId: 6 },
        'January':   { prize: 25, phaseId: 7 },
        'February':  { prize: 25, phaseId: 8 },
        'March':     { prize: 25, phaseId: 9 },
        'April':     { prize: 25, phaseId: 10 },
        'May':       { prize: 25, phaseId: 11 },
    },

    // Tab definitions
    TABS: [
        { id: 'winners', label: 'Season Winners', icon: '🎉' },
        { id: 'overview', label: 'Overview', icon: '🏠' },
        { id: 'gameweek', label: 'This GW', icon: '📋' },
        { id: 'standings', label: 'Standings', icon: '🏆' },
        { id: 'progress', label: 'Season Progress', icon: '📈' },
        { id: 'champions', label: 'Champions League', icon: '🏆' },
        { id: 'worldcup', label: 'World Cup', icon: '🌍' },
        { id: 'monthly', label: 'Monthly Prize', icon: '📅' },
        { id: 'lms', label: 'Last Man Standing', icon: '💀' },
        { id: 'cup', label: 'FA Cup', icon: '🏅' },
        { id: 'highestgw', label: 'Highest GW', icon: '⚡' },
        { id: 'transfers', label: 'Transfers', icon: '🔄' },
    ],
};
