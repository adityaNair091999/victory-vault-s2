exports.handler = async function (event) {
    const targetUrl = event.queryStringParameters && event.queryStringParameters.url;

    if (!targetUrl) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing url parameter' }) };
    }

    // Only allow requests to the FPL API
    if (!targetUrl.startsWith('https://fantasy.premierleague.com/api/')) {
        return { statusCode: 403, body: JSON.stringify({ error: 'URL not allowed' }) };
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-GB,en;q=0.9',
                'Referer': 'https://fantasy.premierleague.com/',
                'Origin': 'https://fantasy.premierleague.com',
            },
        });

        const body = await response.text();

        return {
            statusCode: response.status,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body,
        };
    } catch (err) {
        return {
            statusCode: 502,
            body: JSON.stringify({ error: 'Proxy fetch failed', detail: err.message }),
        };
    }
};
