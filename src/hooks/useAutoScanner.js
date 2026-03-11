import { useState, useEffect, useRef, useCallback } from 'react';
import { generateSignal, generateScalpSignal } from '../utils/tradingStrategies';

/**
 * useAutoScanner
 * Scans ALL pairs × ALL strategies using live TradingView data.
 * Supports two modes:
 *   - 'scalp': 10s interval, 5 scalp strategies, 65% threshold, 2min dedup
 *   - 'swing': 30s interval, 4 swing strategies, 70% threshold, 5min dedup
 */
export const useAutoScanner = (allPairs, enabled = true, mode = 'scalp', notifyEnabled = true) => {
    const [signals, setSignals] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [lastScanTime, setLastScanTime] = useState(null);
    const [newSignalCount, setNewSignalCount] = useState(0);
    const intervalRef = useRef(null);
    const isMountedRef = useRef(true);
    const seenSignalIds = useRef(new Set());

    // Mode-dependent config
    const isScalp = mode === 'scalp';
    const scanInterval = isScalp ? 10000 : 30000;           // 10s vs 30s
    const confidenceThreshold = isScalp ? 65 : 70;          // Lower for more scalp signals
    const dedupCooldown = isScalp ? 2 * 60 * 1000 : 5 * 60 * 1000;  // 2min vs 5min
    const alertThreshold = isScalp ? 75 : 80;               // Alert at lower conf for scalp

    const swingStrategies = ['priceAction', 'falseBreak', 'bwab', 'firstPullback'];
    const scalpStrategies = ['emaCross', 'rsiReversal', 'spreadBounce', 'microBreakout', 'momentumBurst'];
    const strategyKeys = isScalp ? scalpStrategies : swingStrategies;

    const strategyNames = {
        priceAction: 'Price Action',
        falseBreak: 'False Break',
        bwab: 'Breakout + Build-up',
        firstPullback: 'First Pullback',
        emaCross: 'EMA Crossover',
        rsiReversal: 'RSI Reversal',
        spreadBounce: 'S/R Scalp',
        microBreakout: 'Micro Breakout',
        momentumBurst: 'Momentum Burst'
    };

    // Symbol mapping for TradingView Scanner API
    const getSymbolMapping = () => ({
        'EUR/USD': { tv: 'FX:EURUSD', scanner: 'forex' },
        'GBP/USD': { tv: 'FX:GBPUSD', scanner: 'forex' },
        'USD/JPY': { tv: 'FX:USDJPY', scanner: 'forex' },
        'USD/CHF': { tv: 'FX:USDCHF', scanner: 'forex' },
        'AUD/USD': { tv: 'FX:AUDUSD', scanner: 'forex' },
        'USD/CAD': { tv: 'FX:USDCAD', scanner: 'forex' },
        'NZD/USD': { tv: 'FX:NZDUSD', scanner: 'forex' },
        'EUR/GBP': { tv: 'FX:EURGBP', scanner: 'forex' },
        'EUR/JPY': { tv: 'FX:EURJPY', scanner: 'forex' },
        'GBP/JPY': { tv: 'FX:GBPJPY', scanner: 'forex' },
        'EUR/CHF': { tv: 'FX:EURCHF', scanner: 'forex' },
        'EUR/AUD': { tv: 'FX:EURAUD', scanner: 'forex' },
        'GBP/AUD': { tv: 'FX:GBPAUD', scanner: 'forex' },
        'AUD/JPY': { tv: 'FX:AUDJPY', scanner: 'forex' },
        'XAU/USD': { tv: 'OANDA:XAUUSD', scanner: 'cfd' },
        'XAG/USD': { tv: 'OANDA:XAGUSD', scanner: 'cfd' },
        'USO/IL': { tv: 'TVC:USOIL', scanner: 'cfd' },
        'UKO/IL': { tv: 'TVC:UKOIL', scanner: 'cfd' },
        'NGA/S': { tv: 'NYMEX:NG1!', scanner: 'cfd' },
    });

    // Request notification permission on mount
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // Fetch batch data from TradingView Scanner for a group of symbols
    const fetchScannerData = async (scanner, tickers) => {
        if (tickers.length === 0) return {};

        try {
            let result;
            if (window.electron && window.electron.tvScan) {
                result = await window.electron.tvScan({
                    scanner,
                    symbols: tickers,
                    columns: [
                        "close", "change", "RSI", "SMA20", "Recommend.All",
                        "high", "low", "open", "volume", "EMA20",
                        "ATR", "SMA50", "BB.upper", "BB.lower"
                    ]
                });
            } else {
                const response = await fetch(`/tv-scan/${scanner}/scan`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        symbols: {
                            tickers: tickers,
                            query: { types: [] }
                        },
                        columns: [
                            "close", "change", "RSI", "SMA20", "Recommend.All",
                            "high", "low", "open", "volume", "EMA20",
                            "ATR", "SMA50", "BB.upper", "BB.lower"
                        ]
                    })
                });
                if (response.ok) {
                    result = await response.json();
                }
            }
            return result;
        } catch (e) {
            console.warn(`Scanner fetch error (${scanner}):`, e);
            return {};
        }
    };

    // Generate candle history from current data for analysis
    const generateCandleHistory = (price, atr, high, low, open) => {
        const candles = [];
        const now = Date.now();
        let prevPrice = price;
        const volatility = atr || price * 0.001;

        for (let i = 50; i > 0; i--) {
            const change = (Math.random() - 0.5) * volatility * 2;
            const candleOpen = prevPrice;
            const candleClose = prevPrice + change;
            const candleHigh = Math.max(candleOpen, candleClose) + Math.random() * volatility;
            const candleLow = Math.min(candleOpen, candleClose) - Math.random() * volatility;

            candles.push({
                time: now - (i * 60000),
                open: candleOpen,
                high: candleHigh,
                low: candleLow,
                close: candleClose,
                volume: Math.floor(Math.random() * 1000) + 100
            });
            prevPrice = candleClose;
        }

        // Add current bar as the latest
        candles.push({
            time: now,
            open: open || price,
            high: high || price * 1.001,
            low: low || price * 0.999,
            close: price,
            volume: Math.floor(Math.random() * 1000) + 100
        });

        return candles;
    };

    // Play alert sound
    const playAlertSound = () => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.frequency.value = isScalp ? 1000 : 800; // Higher pitch for scalp
            oscillator.type = 'sine';
            gainNode.gain.value = 0.3;

            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            oscillator.stop(audioCtx.currentTime + 0.3);

            setTimeout(() => {
                const osc2 = audioCtx.createOscillator();
                const gain2 = audioCtx.createGain();
                osc2.connect(gain2);
                gain2.connect(audioCtx.destination);
                osc2.frequency.value = isScalp ? 1200 : 1000;
                osc2.type = 'sine';
                gain2.gain.value = 0.3;
                osc2.start();
                gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
                osc2.stop(audioCtx.currentTime + 0.3);
            }, 150);
        } catch (e) {
            // Audio not available
        }
    };

    // Send browser notification
    const sendNotification = (signal) => {
        if ('Notification' in window && Notification.permission === 'granted') {
            const icon = signal.signal === 'BUY' ? '📈' : '📉';
            const modeLabel = isScalp ? '⚡ SCALP' : '📊 SWING';
            new Notification(`${icon} ${modeLabel} — TradingK Pro`, {
                body: `${signal.signal} ${signal.pair} (${signal.confidence}%)\n${signal.strategy}${signal.pips ? `\nSL: ${signal.pips.sl?.toFixed(1)}p | TP1: ${signal.pips.tp1?.toFixed(1)}p` : ''}`,
                icon: '/favicon.ico',
                tag: `signal-${signal.id}`,
                requireInteraction: false
            });
        }
    };

    // Main scan function
    const scanAllPairs = useCallback(async () => {
        if (!enabled || !isMountedRef.current) return;

        setIsScanning(true);
        const symbolMap = getSymbolMapping();
        const allPairsList = Object.values(allPairs).flat();

        const forexTickers = [];
        const cfdTickers = [];
        const pairByTicker = {};

        allPairsList.forEach(pair => {
            const mapping = symbolMap[pair.name];
            if (mapping) {
                pairByTicker[mapping.tv] = pair;
                if (mapping.scanner === 'forex') forexTickers.push(mapping.tv);
                else cfdTickers.push(mapping.tv);
            }
        });

        const [forexResult, cfdResult] = await Promise.all([
            fetchScannerData('forex', forexTickers),
            fetchScannerData('cfd', cfdTickers)
        ]);

        const allResults = [
            ...(forexResult?.data || []),
            ...(cfdResult?.data || [])
        ];

        const newSignals = [];

        for (const item of allResults) {
            const tvSymbol = item.s;
            const pair = pairByTicker[tvSymbol];
            if (!pair || !item.d) continue;

            const [close, change, rsi, sma20, recommend, high, low, open, vol, ema20, atrVal] = item.d;
            if (!close) continue;

            const candles = generateCandleHistory(close, atrVal, high, low, open);

            const indicators = {
                rsi: rsi || 50,
                ma20: sma20 || ema20,
                trend: close > (sma20 || close) ? 'bullish' : close < (sma20 || close) ? 'bearish' : 'neutral',
                recommendation: recommend > 0.5 ? 'STRONG BUY' :
                    recommend > 0.1 ? 'BUY' :
                        recommend < -0.5 ? 'STRONG SELL' :
                            recommend < -0.1 ? 'SELL' : 'NEUTRAL'
            };

            // Use the appropriate signal generator
            const signalGenerator = isScalp ? generateScalpSignal : generateSignal;

            for (const strategyKey of strategyKeys) {
                try {
                    const result = signalGenerator(candles, close, strategyKey, indicators, pair.name);

                    if (result.signal !== 'WAIT' && result.confidence >= confidenceThreshold) {
                        const signalId = `${pair.name}-${strategyKey}-${result.signal}`;

                        if (!seenSignalIds.current.has(signalId)) {
                            const signalData = {
                                id: Date.now() + Math.random(),
                                pair: pair.name,
                                signal: result.signal,
                                confidence: result.confidence,
                                strategy: strategyNames[strategyKey],
                                strategyKey,
                                entry: result.entry,
                                stopLoss: result.stopLoss,
                                takeProfit: result.takeProfit,
                                tp1: result.tp1,
                                tp2: result.tp2,
                                tp3: result.tp3,
                                tp1ClosePercent: result.tp1ClosePercent,
                                tp2ClosePercent: result.tp2ClosePercent,
                                tp3ClosePercent: result.tp3ClosePercent,
                                tp1RR: result.tp1RR,
                                tp2RR: result.tp2RR,
                                tp3RR: result.tp3RR,
                                riskReward: result.riskReward,
                                atr: result.atr,
                                pips: result.pips || null,
                                session: result.session || null,
                                reasons: result.reasons,
                                isScalp: isScalp,
                                time: new Date().toLocaleTimeString(),
                                timestamp: Date.now()
                            };

                            newSignals.push(signalData);
                            seenSignalIds.current.add(signalId);

                            setTimeout(() => {
                                seenSignalIds.current.delete(signalId);
                            }, dedupCooldown);
                        }
                    }
                } catch (e) {
                    // Skip failed analysis
                }
            }
        }

        if (isMountedRef.current) {
            if (newSignals.length > 0) {
                newSignals.sort((a, b) => b.confidence - a.confidence);

                setSignals(prev => {
                    const combined = [...newSignals, ...prev];
                    return combined.slice(0, 60);
                });

                setNewSignalCount(prev => prev + newSignals.length);

                const highConfSignals = newSignals.filter(s => s.confidence >= alertThreshold);
                if (highConfSignals.length > 0 && notifyEnabled) {
                    playAlertSound();
                    sendNotification(highConfSignals[0]);
                }
            }

            setLastScanTime(new Date());
            setIsScanning(false);
        }
    }, [allPairs, enabled, mode]);

    const clearNewCount = useCallback(() => {
        setNewSignalCount(0);
    }, []);

    const scanNow = useCallback(() => {
        scanAllPairs();
    }, [scanAllPairs]);

    // Clear signals when mode changes
    useEffect(() => {
        setSignals([]);
        setNewSignalCount(0);
        seenSignalIds.current.clear();
    }, [mode]);

    // Auto-scan loop
    useEffect(() => {
        isMountedRef.current = true;

        if (enabled) {
            const initialTimeout = setTimeout(scanAllPairs, 2000);
            intervalRef.current = setInterval(scanAllPairs, scanInterval);

            return () => {
                isMountedRef.current = false;
                clearTimeout(initialTimeout);
                if (intervalRef.current) clearInterval(intervalRef.current);
            };
        }

        return () => {
            isMountedRef.current = false;
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [enabled, scanAllPairs, scanInterval]);

    return {
        signals,
        isScanning,
        lastScanTime,
        newSignalCount,
        clearNewCount,
        scanNow
    };
};
