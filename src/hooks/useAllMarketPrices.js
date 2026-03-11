import { useState, useEffect, useRef } from 'react';

/**
 * useAllMarketPrices
 * Batch-fetches live prices for ALL pairs from TradingView Scanner API.
 * Returns a map of symbol -> { price, change, changePercent }
 */
export const useAllMarketPrices = (allPairs) => {
    const [prices, setPrices] = useState({});
    const pollRef = useRef(null);
    const isMountedRef = useRef(true);

    // Map pair display names to TradingView scanner symbols
    const getSymbolMapping = () => {
        const map = {
            'EUR/USD': 'FX:EURUSD',
            'GBP/USD': 'FX:GBPUSD',
            'USD/JPY': 'FX:USDJPY',
            'USD/CHF': 'FX:USDCHF',
            'AUD/USD': 'FX:AUDUSD',
            'USD/CAD': 'FX:USDCAD',
            'NZD/USD': 'FX:NZDUSD',
            'EUR/GBP': 'FX:EURGBP',
            'EUR/JPY': 'FX:EURJPY',
            'GBP/JPY': 'FX:GBPJPY',
            'EUR/CHF': 'FX:EURCHF',
            'EUR/AUD': 'FX:EURAUD',
            'GBP/AUD': 'FX:GBPAUD',
            'AUD/JPY': 'FX:AUDJPY',
            'XAU/USD': 'OANDA:XAUUSD',
            'XAG/USD': 'OANDA:XAGUSD',
            'USO/IL': 'TVC:USOIL',
            'UKO/IL': 'TVC:UKOIL',
            'NGA/S': 'NYMEX:NG1!',
        };
        return map;
    };

    const fetchAllPrices = async () => {
        const symbolMap = getSymbolMapping();

        // Get all pairs from all categories
        const allPairsList = Object.values(allPairs).flat();
        const tickers = allPairsList
            .map(p => symbolMap[p.name])
            .filter(Boolean);

        if (tickers.length === 0) return;

        // Split into forex and commodity groups (different scanners)
        const forexTickers = tickers.filter(t => t.startsWith('FX:'));
        const commodityTickers = tickers.filter(t => !t.startsWith('FX:'));

        const fetchGroup = async (scanner, groupTickers) => {
            if (groupTickers.length === 0) return {};

            try {
                let result;
                if (window.electron && window.electron.tvScan) {
                    result = await window.electron.tvScan({
                        scanner,
                        symbols: groupTickers,
                        columns: ["close", "change", "change_abs", "open"]
                    });
                } else {
                    const response = await fetch(`/tv-scan/${scanner}/scan`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            symbols: {
                                tickers: groupTickers,
                                query: { types: [] }
                            },
                            columns: ["close", "change", "change_abs", "open"]
                        })
                    });
                    if (response.ok) {
                        result = await response.json();
                    }
                }

                if (result?.data) {
                    const priceMap = {};
                    result.data.forEach(item => {
                        const tvSymbol = item.s;
                        const close = item.d[0];
                        const changePct = item.d[1];
                        const changeAbs = item.d[2];

                        // Reverse-map TradingView symbol back to display name
                        const displayName = Object.entries(symbolMap)
                            .find(([, v]) => v === tvSymbol)?.[0];

                        if (displayName && close) {
                            priceMap[displayName] = {
                                price: close,
                                change: changeAbs || 0,
                                changePercent: changePct || 0
                            };
                        }
                    });
                    return priceMap;
                }
            } catch (e) {
                console.warn(`Price fetch error (${scanner}):`, e);
            }
            return {};
        };

        const [forexPrices, commodityPrices] = await Promise.all([
            fetchGroup('forex', forexTickers),
            fetchGroup('cfd', commodityTickers)
        ]);

        if (isMountedRef.current) {
            setPrices(prev => ({ ...prev, ...forexPrices, ...commodityPrices }));
        }
    };

    useEffect(() => {
        isMountedRef.current = true;
        fetchAllPrices();

        // Poll every 3 seconds
        pollRef.current = setInterval(fetchAllPrices, 3000);

        return () => {
            isMountedRef.current = false;
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    return prices;
};
