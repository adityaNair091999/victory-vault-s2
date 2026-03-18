// ============================================================
// Victory Vault Season 2 — Configuration
// ============================================================

const CONFIG = {
    LEAGUE_ID: 1249203,

    // FPL API Base
    API_BASE: 'https://fantasy.premierleague.com/api',

    // Prize configuration (in dollars)
    PRIZES: {
        SEASON: { 1: 150, 2: 90, 3: 50 },
        MONTHLY: 30,
        LMS: 60,           // per half
        FREE_HIT: 30,      // per half
        CUP: 80,
        HIGHEST_GW: 50,
    },

    // Last Man Standing gameweek ranges
    LMS: {
        HALF1: { start: 2, end: 18, prize: 60 },
        HALF2: { start: 20, end: 38, prize: 60 },
    },

    // Season halves for Free Hit tracking
    HALVES: {
        HALF1: { start: 1, end: 19, label: '1st Half' },
        HALF2: { start: 20, end: 38, label: '2nd Half' },
    },

    // Monthly GW mapping (from FPL API phases)
    // phaseId corresponds to the FPL API ?phase= parameter
    MONTHLY_GWS: {
        'August': { gws: [1, 2, 3], prize: 30, phaseId: 2 },
        'September': { gws: [4, 5, 6], prize: 30, phaseId: 3 },
        'October': { gws: [7, 8, 9], prize: 30, phaseId: 4 },
        'November': { gws: [10, 11, 12, 13], prize: 30, phaseId: 5 },
        'December': { gws: [14, 15, 16, 17, 18, 19], prize: 30, phaseId: 6 },
        'January': { gws: [20, 21, 22, 23, 24], prize: 30, phaseId: 7 },
        'February': { gws: [25, 26, 27, 28], prize: 30, phaseId: 8 },
        'March': { gws: [29, 30, 31], prize: 30, phaseId: 9 },
        'April': { gws: [32, 33, 34], prize: 30, phaseId: 10 },
        'May': { gws: [35, 36, 37, 38], prize: 30, phaseId: 11 },
    },

    // Tab definitions
    TABS: [
        { id: 'overview', label: 'Overview', icon: '🏠' },
        { id: 'gameweek', label: 'This GW', icon: '📋' },
        { id: 'standings', label: 'Standings', icon: '🏆' },
        { id: 'progress', label: 'Season Progress', icon: '📈' },
        { id: 'monthly', label: 'Monthly Prize', icon: '📅' },
        { id: 'lms', label: 'Last Man Standing', icon: '💀' },
        { id: 'freehit', label: 'Free Hit', icon: '🎯' },
        { id: 'cup', label: 'FPL Cup', icon: '🏅' },
        { id: 'highestgw', label: 'Highest GW', icon: '⚡' },
        { id: 'transfers', label: 'Transfers', icon: '🔄' },
    ],
};
