const FPL_BASE = 'https://fantasy.premierleague.com/api';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    // Strip the leading /api prefix if present, forward rest to FPL
    const path = url.pathname.replace(/^\/api/, '');
    const fplUrl = `${FPL_BASE}${path}${url.search}`;

    const fplResponse = await fetch(fplUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://fantasy.premierleague.com/',
      },
    });

    const body = await fplResponse.arrayBuffer();

    return new Response(body, {
      status: fplResponse.status,
      headers: {
        ...Object.fromEntries(fplResponse.headers),
        ...CORS_HEADERS,
        'Content-Type': fplResponse.headers.get('Content-Type') || 'application/json',
      },
    });
  },
};
