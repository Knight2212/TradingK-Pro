export default async function handler(req, res) {
    const { scanner } = req.query;

    if (!scanner) {
        return res.status(400).json({ error: 'Scanner type is required' });
    }

    const targetUrl = `https://scanner.tradingview.com/${scanner}/scan`;

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Origin': 'https://www.tradingview.com',
                'Referer': 'https://www.tradingview.com/'
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            throw new Error(`TradingView API error: ${response.statusText}`);
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('Proxy Error:', error);
        return res.status(500).json({ error: 'Failed to fetch data from TradingView', details: error.message });
    }
}
