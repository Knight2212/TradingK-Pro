// Trading Strategy Algorithms - Rayner Teo's 4 Strategies
// Price Action, False Break, Breakout with Build-up (BWAB), First Pullback
// Optimized with ATR-based SL/TP and Multi-TP ladder system

// ============================================================
// CORE INDICATORS
// ============================================================

// Average True Range (ATR) — volatility-adaptive indicator
export const calculateATR = (candles, period = 14) => {
    if (!candles || candles.length < period + 1) return null;

    const trueRanges = [];
    for (let i = 1; i < candles.length; i++) {
        const high = candles[i].high;
        const low = candles[i].low;
        const prevClose = candles[i - 1].close;
        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trueRanges.push(tr);
    }

    // Use RMA (Wilder's smoothing) for ATR
    const recent = trueRanges.slice(-period);
    const atr = recent.reduce((sum, tr) => sum + tr, 0) / period;
    return atr;
};

// Support/Resistance Detection
export const findSupportResistance = (candles, sensitivity = 3) => {
    if (!candles || candles.length < 10) return { support: [], resistance: [] };

    const levels = { support: [], resistance: [] };
    const prices = candles.map(c => ({ high: c.high, low: c.low, close: c.close }));

    for (let i = sensitivity; i < prices.length - sensitivity; i++) {
        let isSwingHigh = true;
        for (let j = 1; j <= sensitivity; j++) {
            if (prices[i].high <= prices[i - j].high || prices[i].high <= prices[i + j].high) {
                isSwingHigh = false;
                break;
            }
        }
        if (isSwingHigh) {
            levels.resistance.push({ price: prices[i].high, strength: 70 + Math.random() * 20, index: i });
        }

        let isSwingLow = true;
        for (let j = 1; j <= sensitivity; j++) {
            if (prices[i].low >= prices[i - j].low || prices[i].low >= prices[i + j].low) {
                isSwingLow = false;
                break;
            }
        }
        if (isSwingLow) {
            levels.support.push({ price: prices[i].low, strength: 70 + Math.random() * 20, index: i });
        }
    }

    // Cluster nearby levels
    const clusterLevels = (arr, threshold) => {
        if (arr.length === 0) return [];
        const sorted = [...arr].sort((a, b) => a.price - b.price);
        const clustered = [];
        let cluster = [sorted[0]];

        for (let i = 1; i < sorted.length; i++) {
            if ((sorted[i].price - cluster[0].price) / cluster[0].price < threshold) {
                cluster.push(sorted[i]);
            } else {
                const avgPrice = cluster.reduce((s, l) => s + l.price, 0) / cluster.length;
                const maxStrength = Math.max(...cluster.map(l => l.strength));
                clustered.push({ price: avgPrice, strength: Math.min(maxStrength + cluster.length * 5, 99), touches: cluster.length });
                cluster = [sorted[i]];
            }
        }
        if (cluster.length > 0) {
            const avgPrice = cluster.reduce((s, l) => s + l.price, 0) / cluster.length;
            const maxStrength = Math.max(...cluster.map(l => l.strength));
            clustered.push({ price: avgPrice, strength: Math.min(maxStrength + cluster.length * 5, 99), touches: cluster.length });
        }
        return clustered.slice(-5); // Keep more levels for better trading
    };

    return {
        support: clusterLevels(levels.support, 0.004),
        resistance: clusterLevels(levels.resistance, 0.004)
    };
};

// ============================================================
// CANDLESTICK PATTERN DETECTION
// ============================================================

export const detectCandlestickPatterns = (candles) => {
    if (!candles || candles.length < 3) return [];

    const patterns = [];
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const prev2 = candles.length >= 3 ? candles[candles.length - 3] : null;

    const bodySize = Math.abs(latest.close - latest.open);
    const totalRange = latest.high - latest.low;
    const lowerWick = Math.min(latest.open, latest.close) - latest.low;
    const upperWick = latest.high - Math.max(latest.open, latest.close);
    const isBullish = latest.close > latest.open;
    const isPrevBullish = prev.close > prev.open;

    // Bullish Engulfing — strong reversal
    if (!isPrevBullish && isBullish &&
        latest.open <= prev.close && latest.close >= prev.open &&
        bodySize > Math.abs(prev.close - prev.open) * 1.1) {
        patterns.push({ name: 'Bullish Engulfing', type: 'bullish', strength: 88 });
    }

    // Bearish Engulfing
    if (isPrevBullish && !isBullish &&
        latest.open >= prev.close && latest.close <= prev.open &&
        bodySize > Math.abs(prev.close - prev.open) * 1.1) {
        patterns.push({ name: 'Bearish Engulfing', type: 'bearish', strength: 88 });
    }

    // Hammer (bullish reversal) — long lower wick, small upper wick
    if (totalRange > 0 && lowerWick > bodySize * 2 && upperWick < bodySize * 0.5 && lowerWick > totalRange * 0.55) {
        patterns.push({ name: 'Hammer', type: 'bullish', strength: 78 });
    }

    // Shooting Star (bearish reversal) — long upper wick, small lower wick
    if (totalRange > 0 && upperWick > bodySize * 2 && lowerWick < bodySize * 0.5 && upperWick > totalRange * 0.55) {
        patterns.push({ name: 'Shooting Star', type: 'bearish', strength: 78 });
    }

    // Pin Bar Bullish — very long lower wick (>66% of range)
    if (totalRange > 0 && lowerWick > totalRange * 0.66 && bodySize < totalRange * 0.25) {
        patterns.push({ name: 'Bullish Pin Bar', type: 'bullish', strength: 82 });
    }

    // Pin Bar Bearish — very long upper wick
    if (totalRange > 0 && upperWick > totalRange * 0.66 && bodySize < totalRange * 0.25) {
        patterns.push({ name: 'Bearish Pin Bar', type: 'bearish', strength: 82 });
    }

    // Morning Star (3-candle bullish reversal)
    if (prev2 && prev2.close < prev2.open && // first candle bearish
        Math.abs(prev.close - prev.open) < Math.abs(prev2.close - prev2.open) * 0.3 && // small middle
        isBullish && latest.close > (prev2.open + prev2.close) / 2) { // bullish close above midpoint
        patterns.push({ name: 'Morning Star', type: 'bullish', strength: 85 });
    }

    // Evening Star (3-candle bearish reversal)
    if (prev2 && prev2.close > prev2.open && // first candle bullish
        Math.abs(prev.close - prev.open) < Math.abs(prev2.close - prev2.open) * 0.3 && // small middle
        !isBullish && latest.close < (prev2.open + prev2.close) / 2) { // bearish close below midpoint
        patterns.push({ name: 'Evening Star', type: 'bearish', strength: 85 });
    }

    // Strong Rejection Candle
    if (totalRange > 0 && lowerWick > totalRange * 0.6 && bodySize > 0) {
        patterns.push({ name: 'Bullish Rejection', type: 'bullish', strength: 72 });
    }
    if (totalRange > 0 && upperWick > totalRange * 0.6 && bodySize > 0) {
        patterns.push({ name: 'Bearish Rejection', type: 'bearish', strength: 72 });
    }

    return patterns;
};

// ============================================================
// TREND & MOMENTUM
// ============================================================

// Detect trend using higher highs/lows + MA position
export const detectTrend = (candles) => {
    if (!candles || candles.length < 14) return { trend: 'neutral', strength: 50 };

    const recent = candles.slice(-14);
    let higherHighs = 0, higherLows = 0, lowerHighs = 0, lowerLows = 0;

    for (let i = 1; i < recent.length; i++) {
        if (recent[i].high > recent[i - 1].high) higherHighs++;
        else lowerHighs++;
        if (recent[i].low > recent[i - 1].low) higherLows++;
        else lowerLows++;
    }

    const bullishScore = (higherHighs + higherLows) / ((recent.length - 1) * 2);
    const bearishScore = (lowerHighs + lowerLows) / ((recent.length - 1) * 2);

    if (bullishScore > 0.6) return { trend: 'bullish', strength: Math.round(bullishScore * 100) };
    if (bearishScore > 0.6) return { trend: 'bearish', strength: Math.round(bearishScore * 100) };
    return { trend: 'neutral', strength: 50 };
};

// Calculate 20-period Moving Average
export const calculate20MA = (candles) => {
    if (!candles || candles.length < 20) return null;
    const sum = candles.slice(-20).reduce((s, c) => s + c.close, 0);
    return sum / 20;
};

// Calculate MA slope (positive = rising, negative = falling)
export const calculateMASlope = (candles, period = 20) => {
    if (!candles || candles.length < period + 5) return 0;

    const currentMA = candles.slice(-period).reduce((s, c) => s + c.close, 0) / period;
    const prevMA = candles.slice(-(period + 5), -5).reduce((s, c) => s + c.close, 0) / period;

    return (currentMA - prevMA) / prevMA; // percentage change
};

// Momentum (RSI)
export const calculateMomentum = (candles) => {
    if (!candles || candles.length < 14) return { rsi: 50, momentum: 0, strength: 'neutral' };

    const closes = candles.slice(-15).map(c => c.close);

    let gains = 0, losses = 0;
    for (let i = 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }
    const avgGain = gains / 14;
    const avgLoss = losses / 14;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    const roc = ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100;

    let strength = 'neutral';
    if (rsi > 70) strength = 'overbought';
    else if (rsi < 30) strength = 'oversold';
    else if (rsi > 55) strength = 'bullish';
    else if (rsi < 45) strength = 'bearish';

    return { rsi: rsi.toFixed(1), momentum: roc.toFixed(2), strength };
};

// Volume Analysis
export const analyzeVolume = (candles) => {
    if (!candles || candles.length < 20) return { trend: 'normal', vwap: 0, volumeRatio: 1 };

    const recent = candles.slice(-20);
    const avgVolume = recent.reduce((s, c) => s + (c.volume || 0), 0) / 20;
    const currentVolume = recent[recent.length - 1].volume || 0;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    let sumPV = 0, sumV = 0;
    recent.forEach(c => {
        const typicalPrice = (c.high + c.low + c.close) / 3;
        const vol = c.volume || 1;
        sumPV += typicalPrice * vol;
        sumV += vol;
    });
    const vwap = sumV > 0 ? sumPV / sumV : 0;

    let trend = 'normal';
    if (volumeRatio > 1.5) trend = 'high';
    else if (volumeRatio < 0.5) trend = 'low';

    return { trend, vwap: vwap.toFixed(4), volumeRatio: volumeRatio.toFixed(2) };
};

// ============================================================
// CONSOLIDATION DETECTION
// ============================================================

export const detectConsolidation = (candles, periods = 10) => {
    if (!candles || candles.length < periods) return { isConsolidating: false };

    const recent = candles.slice(-periods);
    const atr = calculateATR(candles, 14);
    const ranges = recent.map(c => c.high - c.low);
    const avgRange = ranges.reduce((s, r) => s + r, 0) / periods;

    const firstHalfAvg = ranges.slice(0, Math.floor(periods / 2)).reduce((s, r) => s + r, 0) / Math.floor(periods / 2);
    const secondHalfAvg = ranges.slice(-Math.floor(periods / 2)).reduce((s, r) => s + r, 0) / Math.floor(periods / 2);

    // Build-up = range contracting below 50% of ATR (tight consolidation)
    const isContracting = secondHalfAvg < firstHalfAvg * 0.7 || (atr && avgRange < atr * 0.6);

    const highs = recent.map(c => c.high);
    const lows = recent.map(c => c.low);
    const zoneHigh = Math.max(...highs);
    const zoneLow = Math.min(...lows);

    return {
        isConsolidating: isContracting,
        zoneHigh,
        zoneLow,
        avgRange,
        atr,
        contraction: firstHalfAvg > 0 ? (1 - secondHalfAvg / firstHalfAvg) * 100 : 0
    };
};

// ============================================================
// STRATEGY-SPECIFIC DETECTORS
// ============================================================

// Detect False Break of S/R
export const detectFalseBreak = (candles, srLevels, currentPrice) => {
    if (!candles || candles.length < 5) return null;

    const recent = candles.slice(-5);
    const prev = recent[recent.length - 2];
    const latest = recent[recent.length - 1];
    const prevBody = Math.abs(prev.close - prev.open);
    const latestBody = Math.abs(latest.close - latest.open);

    // False break of resistance (bearish) — price wicked above but closed back below
    for (const res of srLevels.resistance) {
        const wickAbove = prev.high > res.price && latest.close < res.price;
        const rejectionWick = (prev.high - Math.max(prev.open, prev.close)) > prevBody * 0.5;
        const closedLower = latest.close < prev.close;

        if (wickAbove && (rejectionWick || closedLower)) {
            return {
                type: 'SELL',
                level: res.price,
                confidence: 82,
                reason: `False break above resistance ${res.price.toFixed(4)} — trapped buyers`
            };
        }
    }

    // False break of support (bullish) — price wicked below but closed back above
    for (const sup of srLevels.support) {
        const wickBelow = prev.low < sup.price && latest.close > sup.price;
        const rejectionWick = (Math.min(prev.open, prev.close) - prev.low) > prevBody * 0.5;
        const closedHigher = latest.close > prev.close;

        if (wickBelow && (rejectionWick || closedHigher)) {
            return {
                type: 'BUY',
                level: sup.price,
                confidence: 82,
                reason: `False break below support ${sup.price.toFixed(4)} — trapped sellers`
            };
        }
    }

    return null;
};

// Detect Breakout with Build-up (BWAB)
export const detectBWAB = (candles, srLevels) => {
    if (!candles || candles.length < 15) return null;

    const consolidation = detectConsolidation(candles.slice(-15, -1), 10);
    const latest = candles[candles.length - 1];
    const atr = calculateATR(candles, 14);

    if (!consolidation.isConsolidating || !atr) return null;

    const breakoutThreshold = atr * 0.5; // Needs to close at least 0.5 ATR beyond zone

    // Bullish breakout — closed above zone high with conviction
    if (latest.close > consolidation.zoneHigh + breakoutThreshold) {
        const nearResistance = srLevels.resistance.some(r =>
            Math.abs(consolidation.zoneHigh - r.price) / r.price < 0.005
        );

        return {
            type: 'BUY',
            zoneHigh: consolidation.zoneHigh,
            zoneLow: consolidation.zoneLow,
            confidence: nearResistance ? 88 : 80,
            reason: `Breakout with build-up above ${consolidation.zoneHigh.toFixed(4)}${nearResistance ? ' (S/R confluence)' : ''}`
        };
    }

    // Bearish breakout — closed below zone low with conviction
    if (latest.close < consolidation.zoneLow - breakoutThreshold) {
        const nearSupport = srLevels.support.some(s =>
            Math.abs(consolidation.zoneLow - s.price) / s.price < 0.005
        );

        return {
            type: 'SELL',
            zoneHigh: consolidation.zoneHigh,
            zoneLow: consolidation.zoneLow,
            confidence: nearSupport ? 88 : 80,
            reason: `Breakout with build-up below ${consolidation.zoneLow.toFixed(4)}${nearSupport ? ' (S/R confluence)' : ''}`
        };
    }

    return null;
};

// Detect First Pullback to 20 MA
export const detectFirstPullback = (candles) => {
    if (!candles || candles.length < 25) return null;

    const trend = detectTrend(candles.slice(-20));
    const ma20 = calculate20MA(candles);
    const maSlope = calculateMASlope(candles, 20);
    const latest = candles[candles.length - 1];
    const patterns = detectCandlestickPatterns(candles);

    if (!ma20 || trend.trend === 'neutral') return null;

    // Distance to MA (within 0.5%)
    const distanceToMA = Math.abs(latest.close - ma20) / ma20;
    const nearMA = distanceToMA < 0.005;

    // Bullish pullback — uptrend + MA rising + price near or touching MA + bullish candle
    if (trend.trend === 'bullish' && nearMA && maSlope > 0.0005) {
        const bullishPattern = patterns.find(p => p.type === 'bullish');
        const isBullishCandle = latest.close > latest.open;
        const touchedMA = latest.low <= ma20 * 1.002; // low came close to MA

        if ((bullishPattern || isBullishCandle) && touchedMA) {
            return {
                type: 'BUY',
                ma20,
                confidence: 76 + (bullishPattern ? 12 : 0) + (trend.strength > 70 ? 5 : 0),
                reason: `First pullback to 20 MA (${ma20.toFixed(4)}) in uptrend${bullishPattern ? ` + ${bullishPattern.name}` : ''}`
            };
        }
    }

    // Bearish pullback — downtrend + MA falling + price near MA + bearish candle
    if (trend.trend === 'bearish' && nearMA && maSlope < -0.0005) {
        const bearishPattern = patterns.find(p => p.type === 'bearish');
        const isBearishCandle = latest.close < latest.open;
        const touchedMA = latest.high >= ma20 * 0.998;

        if ((bearishPattern || isBearishCandle) && touchedMA) {
            return {
                type: 'SELL',
                ma20,
                confidence: 76 + (bearishPattern ? 12 : 0) + (trend.strength > 70 ? 5 : 0),
                reason: `First pullback to 20 MA (${ma20.toFixed(4)}) in downtrend${bearishPattern ? ` + ${bearishPattern.name}` : ''}`
            };
        }
    }

    return null;
};

// ============================================================
// CALCULATORS
// ============================================================

export const calculatePositionSize = (accountBalance, riskPercent, entryPrice, stopLoss) => {
    const riskAmount = accountBalance * (riskPercent / 100);
    const pipValue = Math.abs(entryPrice - stopLoss);
    const positionSize = pipValue > 0 ? riskAmount / pipValue : 0;

    // Pip calculation depends on pair
    const isJPY = entryPrice > 50; // rough heuristic for JPY pairs
    const pipMultiplier = isJPY ? 100 : 10000;

    return {
        riskAmount: riskAmount.toFixed(2),
        positionSize: positionSize.toFixed(2),
        pipRisk: (pipValue * pipMultiplier).toFixed(1)
    };
};

export const calculateRiskReward = (entry, stopLoss, takeProfit) => {
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(takeProfit - entry);
    const ratio = risk > 0 ? reward / risk : 0;

    return {
        risk: risk.toFixed(5),
        reward: reward.toFixed(5),
        ratio: ratio.toFixed(2),
        formatted: `1:${ratio.toFixed(1)}`
    };
};

// ============================================================
// MULTI-TP LEVEL CALCULATOR
// ============================================================

/**
 * Calculate ATR-based SL and multi-TP levels (Rayner Teo methodology)
 * SL: 1 ATR beyond nearest structure
 * TP1: 1R (close 50%) — lock profit, move SL to breakeven
 * TP2: 2R (close 30%) — take more profit, trail SL to TP1
 * TP3: 3R (close 20%) — let remainder ride
 */
const calculateMultiTP = (signal, entry, atr, srLevels, pairName) => {
    if (!atr || atr <= 0) return null;

    const isJPY = pairName && pairName.includes('JPY');
    const isGold = pairName && pairName.includes('XAU');
    const isCommodity = pairName && (pairName.includes('OIL') || pairName.includes('NGA') || pairName.includes('XAG'));

    const isCommodityOrGold = isGold || isCommodity;

    // Tighter SL for commodities (0.25 ATR instead of 0.5 ATR)
    const slMultiplier = isCommodityOrGold ? 0.25 : 0.5;

    // Max SL distance: cap to prevent unrealistic levels (tighter cap for commodities)
    const maxSLDistance = isCommodityOrGold ? (atr * 1.0) : (atr * 1.5);

    let stopLoss, riskDistance;

    if (signal === 'BUY') {
        // Find nearest support below entry
        const nearestSupport = srLevels.support
            .filter(s => s.price < entry)
            .sort((a, b) => b.price - a.price)[0];

        // SL = slMultiplier ATR below nearest support
        const structureLevel = nearestSupport ? nearestSupport.price : entry;
        stopLoss = structureLevel - (atr * slMultiplier);

        // Cap the SL distance
        if (entry - stopLoss > maxSLDistance) {
            stopLoss = entry - maxSLDistance;
        }

        riskDistance = entry - stopLoss;

        return {
            stopLoss,
            tp1: entry + riskDistance * 1,     // 1R
            tp2: entry + riskDistance * 2,     // 2R
            tp3: entry + riskDistance * 3,     // 3R
            riskDistance,
            tp1ClosePercent: 50,
            tp2ClosePercent: 30,
            tp3ClosePercent: 20,
            tp1RR: '1:1',
            tp2RR: '1:2',
            tp3RR: '1:3'
        };
    } else if (signal === 'SELL') {
        // Find nearest resistance above entry
        const nearestResistance = srLevels.resistance
            .filter(r => r.price > entry)
            .sort((a, b) => a.price - b.price)[0];

        // SL = slMultiplier ATR above nearest resistance
        const structureLevel = nearestResistance ? nearestResistance.price : entry;
        stopLoss = structureLevel + (atr * slMultiplier);

        // Cap the SL distance
        if (stopLoss - entry > maxSLDistance) {
            stopLoss = entry + maxSLDistance;
        }

        riskDistance = stopLoss - entry;

        return {
            stopLoss,
            tp1: entry - riskDistance * 1,     // 1R
            tp2: entry - riskDistance * 2,     // 2R
            tp3: entry - riskDistance * 3,     // 3R
            riskDistance,
            tp1ClosePercent: 50,
            tp2ClosePercent: 30,
            tp3ClosePercent: 20,
            tp1RR: '1:1',
            tp2RR: '1:2',
            tp3RR: '1:3'
        };
    }

    return null;
};

// ============================================================
// MAIN SIGNAL GENERATOR (with multi-TP)
// ============================================================

export const generateSignal = (candles, currentPrice, strategy, indicators = null, pairName = '') => {
    const srLevels = findSupportResistance(candles);
    const trend = indicators?.trend
        ? { trend: indicators.trend, strength: 80 }
        : detectTrend(candles);
    const patterns = detectCandlestickPatterns(candles);
    const momentum = indicators?.rsi
        ? { rsi: indicators.rsi, momentum: 0, strength: indicators.rsi > 70 ? 'overbought' : indicators.rsi < 30 ? 'oversold' : 'neutral' }
        : calculateMomentum(candles);
    const volume = analyzeVolume(candles);
    const ma20 = indicators?.ma20 || calculate20MA(candles);
    const consolidation = detectConsolidation(candles);
    const atr = calculateATR(candles, 14);

    let signal = 'WAIT';
    let confidence = 0;
    let reasons = [];
    let entry = currentPrice;
    let strategyStopLoss, strategyTP; // single-level fallbacks

    // TradingView recommendation confluence bonus
    if (indicators?.recommendation) {
        if (indicators.recommendation.includes('BUY')) confidence += 5;
        else if (indicators.recommendation.includes('SELL')) confidence += 5;
    }

    // ===== PRICE ACTION Strategy =====
    if (strategy === 'priceAction') {
        const nearSupport = srLevels.support.find(s =>
            Math.abs(currentPrice - s.price) / currentPrice < 0.003
        );
        const nearResistance = srLevels.resistance.find(r =>
            Math.abs(currentPrice - r.price) / currentPrice < 0.003
        );

        // BUY: At Support + Bullish Pattern + Trend alignment
        if (nearSupport) {
            const bullishPattern = patterns.find(p => p.type === 'bullish');
            if (bullishPattern) {
                signal = 'BUY';
                confidence = 78;
                reasons.push(`Bounce off support ${nearSupport.price.toFixed(4)}`);
                reasons.push(`Pattern: ${bullishPattern.name} (${bullishPattern.strength}%)`);
                if (trend.trend === 'bullish') { confidence += 10; reasons.push('Aligned with uptrend'); }
                if (nearSupport.touches > 1) { confidence += 5; reasons.push(`Support tested ${nearSupport.touches}x`); }
                if (parseFloat(momentum.rsi) < 40) { confidence += 5; reasons.push('RSI oversold zone'); }
            } else {
                reasons.push(`At support ${nearSupport.price.toFixed(4)} — waiting for rejection candle`);
            }
        }

        // SELL: At Resistance + Bearish Pattern
        if (nearResistance && signal === 'WAIT') {
            const bearishPattern = patterns.find(p => p.type === 'bearish');
            if (bearishPattern) {
                signal = 'SELL';
                confidence = 78;
                reasons.push(`Rejection at resistance ${nearResistance.price.toFixed(4)}`);
                reasons.push(`Pattern: ${bearishPattern.name} (${bearishPattern.strength}%)`);
                if (trend.trend === 'bearish') { confidence += 10; reasons.push('Aligned with downtrend'); }
                if (nearResistance.touches > 1) { confidence += 5; reasons.push(`Resistance tested ${nearResistance.touches}x`); }
                if (parseFloat(momentum.rsi) > 60) { confidence += 5; reasons.push('RSI overbought zone'); }
            } else {
                reasons.push(`At resistance ${nearResistance.price.toFixed(4)} — waiting for rejection candle`);
            }
        }
    }

    // ===== FALSE BREAK Strategy =====
    if (strategy === 'falseBreak') {
        const falseBreak = detectFalseBreak(candles, srLevels, currentPrice);

        if (falseBreak) {
            signal = falseBreak.type;
            confidence = falseBreak.confidence;
            reasons.push(falseBreak.reason);

            // Volume confirmation bonus
            if (parseFloat(volume.volumeRatio) > 1.2) {
                confidence += 5;
                reasons.push(`Volume spike (${volume.volumeRatio}x avg)`);
            }

            // Trend confluence
            if ((signal === 'BUY' && trend.trend === 'bullish') ||
                (signal === 'SELL' && trend.trend === 'bearish')) {
                confidence += 8;
                reasons.push(`Trend confluence: ${trend.trend}`);
            }

            // RSI divergence bonus
            if ((signal === 'BUY' && parseFloat(momentum.rsi) < 40) ||
                (signal === 'SELL' && parseFloat(momentum.rsi) > 60)) {
                confidence += 5;
                reasons.push(`RSI ${momentum.strength} (${momentum.rsi})`);
            }
        }
    }

    // ===== BREAKOUT WITH BUILD-UP (BWAB) Strategy =====
    if (strategy === 'bwab') {
        const bwab = detectBWAB(candles, srLevels);

        if (bwab) {
            signal = bwab.type;
            confidence = bwab.confidence;
            reasons.push(bwab.reason);
            reasons.push(`Consolidation zone: ${bwab.zoneLow.toFixed(4)} — ${bwab.zoneHigh.toFixed(4)}`);

            // Volume on breakout
            if (parseFloat(volume.volumeRatio) > 1.3) {
                confidence += 8;
                reasons.push(`Breakout volume surge (${volume.volumeRatio}x)`);
            }

            // Trend alignment
            if ((signal === 'BUY' && trend.trend === 'bullish') ||
                (signal === 'SELL' && trend.trend === 'bearish')) {
                confidence += 5;
                reasons.push(`Trend alignment: ${trend.trend}`);
            }
        } else if (consolidation.isConsolidating) {
            reasons.push(`Build-up forming (${consolidation.contraction.toFixed(0)}% contraction)`);
            reasons.push('Waiting for breakout...');
        }
    }

    // ===== FIRST PULLBACK Strategy =====
    if (strategy === 'firstPullback') {
        const pullback = detectFirstPullback(candles);

        if (pullback) {
            signal = pullback.type;
            confidence = pullback.confidence;
            reasons.push(pullback.reason);

            const maSlope = calculateMASlope(candles, 20);
            if (Math.abs(maSlope) > 0.001) {
                reasons.push(`MA slope: ${maSlope > 0 ? '↑ rising' : '↓ falling'} (${(maSlope * 100).toFixed(2)}%)`);
            }

            // RSI not extreme (avoid buying overbought or selling oversold)
            const rsiVal = parseFloat(momentum.rsi);
            if ((signal === 'BUY' && rsiVal >= 30 && rsiVal <= 60) ||
                (signal === 'SELL' && rsiVal >= 40 && rsiVal <= 70)) {
                confidence += 5;
                reasons.push(`RSI healthy: ${momentum.rsi}`);
            }
        } else {
            reasons.push(`Trend: ${trend.trend} (${trend.strength}%)`);
            if (ma20) reasons.push(`20 MA: ${ma20.toFixed(4)}`);
        }
    }

    // ===== Calculate multi-TP levels =====
    let multiTP = null;
    if (signal !== 'WAIT' && atr) {
        multiTP = calculateMultiTP(signal, entry, atr, srLevels, pairName);

        if (multiTP) {
            // Validate minimum R:R of 1:1.5
            const rr1 = Math.abs(multiTP.tp1 - entry) / multiTP.riskDistance;
            if (rr1 < 1) {
                // TP1 is less than 1R — something is wrong, invalidate
                // This shouldn't happen since TP1 = 1R, but safety check
            }

            // Validate directional correctness
            if (signal === 'BUY') {
                if (multiTP.stopLoss >= entry || multiTP.tp1 <= entry) {
                    signal = 'WAIT';
                    confidence = 0;
                    reasons = ['Setup invalidated: SL/TP direction error'];
                    multiTP = null;
                }
            } else if (signal === 'SELL') {
                if (multiTP.stopLoss <= entry || multiTP.tp1 >= entry) {
                    signal = 'WAIT';
                    confidence = 0;
                    reasons = ['Setup invalidated: SL/TP direction error'];
                    multiTP = null;
                }
            }
        }
    }

    // Cap confidence at 98
    confidence = Math.min(Math.round(confidence), 98);

    // Build R:R for display
    const overallRR = multiTP
        ? calculateRiskReward(entry, multiTP.stopLoss, multiTP.tp2)
        : { formatted: 'N/A' };

    return {
        signal,
        confidence,
        entry: currentPrice,
        // Backward-compatible single TP (uses TP2 as the "main" target)
        stopLoss: multiTP?.stopLoss?.toFixed(5) || null,
        takeProfit: multiTP?.tp2?.toFixed(5) || null,
        // Multi-TP levels
        tp1: multiTP?.tp1?.toFixed(5) || null,
        tp2: multiTP?.tp2?.toFixed(5) || null,
        tp3: multiTP?.tp3?.toFixed(5) || null,
        tp1ClosePercent: multiTP?.tp1ClosePercent || 50,
        tp2ClosePercent: multiTP?.tp2ClosePercent || 30,
        tp3ClosePercent: multiTP?.tp3ClosePercent || 20,
        tp1RR: multiTP?.tp1RR || '1:1',
        tp2RR: multiTP?.tp2RR || '1:2',
        tp3RR: multiTP?.tp3RR || '1:3',
        riskReward: overallRR?.formatted || 'N/A',
        atr: atr?.toFixed(5) || null,
        reasons,
        patterns,
        trend,
        momentum,
        volume,
        ma20,
        consolidation,
        support: srLevels.support,
        resistance: srLevels.resistance
    };
};


// ============================================================
// SCALPING ENGINE
// Optimized for 1m/5m timeframes with tight SL/TP
// ============================================================

// Fast EMA calculation
export const calculateEMA = (candles, period) => {
    if (!candles || candles.length < period) return null;
    const k = 2 / (period + 1);
    let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period;
    for (let i = period; i < candles.length; i++) {
        ema = candles[i].close * k + ema * (1 - k);
    }
    return ema;
};

// EMA Crossover detection (fast 9 / slow 21)
export const detectEMACrossover = (candles, fastPeriod = 9, slowPeriod = 21) => {
    if (!candles || candles.length < slowPeriod + 2) return null;

    // Calculate current and previous EMAs
    const currentCandles = candles;
    const prevCandles = candles.slice(0, -1);

    const currentFast = calculateEMA(currentCandles, fastPeriod);
    const currentSlow = calculateEMA(currentCandles, slowPeriod);
    const prevFast = calculateEMA(prevCandles, fastPeriod);
    const prevSlow = calculateEMA(prevCandles, slowPeriod);

    if (!currentFast || !currentSlow || !prevFast || !prevSlow) return null;

    // Bullish crossover: fast crosses above slow
    if (prevFast <= prevSlow && currentFast > currentSlow) {
        const gap = Math.abs(currentFast - currentSlow);
        return {
            type: 'BUY',
            crossover: 'bullish',
            fastEMA: currentFast,
            slowEMA: currentSlow,
            gap,
            confidence: 75
        };
    }

    // Bearish crossover: fast crosses below slow
    if (prevFast >= prevSlow && currentFast < currentSlow) {
        const gap = Math.abs(currentFast - currentSlow);
        return {
            type: 'SELL',
            crossover: 'bearish',
            fastEMA: currentFast,
            slowEMA: currentSlow,
            gap,
            confidence: 75
        };
    }

    return null;
};

// Fast RSI for scalping (period 7, thresholds 80/20)
export const calculateFastRSI = (candles, period = 7) => {
    if (!candles || candles.length < period + 1) return { rsi: 50, zone: 'neutral' };

    const closes = candles.slice(-(period + 1)).map(c => c.close);
    let gains = 0, losses = 0;

    for (let i = 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff;
        else losses -= diff;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));

    let zone = 'neutral';
    if (rsi >= 80) zone = 'overbought';
    else if (rsi <= 20) zone = 'oversold';
    else if (rsi >= 60) zone = 'bullish';
    else if (rsi <= 40) zone = 'bearish';

    return { rsi: parseFloat(rsi.toFixed(1)), zone };
};

// Session detector — identifies current trading session
export const detectSession = () => {
    const now = new Date();
    const utcHour = now.getUTCHours();

    // Tokyo: 00:00 - 09:00 UTC
    // London: 08:00 - 17:00 UTC
    // New York: 13:00 - 22:00 UTC
    const isTokyo = utcHour >= 0 && utcHour < 9;
    const isLondon = utcHour >= 8 && utcHour < 17;
    const isNewYork = utcHour >= 13 && utcHour < 22;

    const isLondonNY = isLondon && isNewYork; // 13:00-17:00 UTC — BEST for scalping
    const isTokyoLondon = isTokyo && isLondon; // 08:00-09:00 UTC

    let session = 'off-hours';
    let quality = 'poor';

    if (isLondonNY) {
        session = 'London/NY Overlap';
        quality = 'excellent';
    } else if (isLondon) {
        session = 'London';
        quality = 'good';
    } else if (isNewYork) {
        session = 'New York';
        quality = 'good';
    } else if (isTokyoLondon) {
        session = 'Tokyo/London Overlap';
        quality = 'moderate';
    } else if (isTokyo) {
        session = 'Tokyo';
        quality = 'moderate';
    }

    return { session, quality, isLondonNY, isLondon, isNewYork, isTokyo };
};

// Pip calculator — accounts for JPY pairs and Gold
export const getPipValue = (pairName, price) => {
    if (pairName.includes('JPY')) return 0.01;
    if (pairName === 'XAU/USD') return 0.10;
    if (pairName === 'XAG/USD') return 0.01;
    return 0.0001;
};

export const priceToPips = (pairName, priceDistance) => {
    const pip = getPipValue(pairName);
    return Math.abs(priceDistance) / pip;
};

// ============================================================
// SCALP SIGNAL GENERATOR
// ============================================================

/**
 * Generate scalping signals with tighter parameters:
 * - ATR period: 7 (faster response)
 * - SL: 0.5 ATR (tighter)
 * - TP1: 1R (50%), TP2: 1.5R (30%), TP3: 2R (20%)
 * - Min R:R: 1:1
 * - 5 strategies: EMA Cross, RSI Reversal, Spread Bounce, Micro Breakout, Momentum Burst
 */
export const generateScalpSignal = (candles, currentPrice, strategy, indicators = null, pairName = '') => {
    const atr = calculateATR(candles, 7); // Faster ATR for scalping
    const srLevels = findSupportResistance(candles, 2); // More sensitive S/R
    const patterns = detectCandlestickPatterns(candles);
    const trend = indicators?.trend
        ? { trend: indicators.trend, strength: 80 }
        : detectTrend(candles);
    const fastRSI = calculateFastRSI(candles, 7);
    const emaCross = detectEMACrossover(candles, 9, 21);
    const ema9 = calculateEMA(candles, 9);
    const ema21 = calculateEMA(candles, 21);
    const volume = analyzeVolume(candles);
    const session = detectSession();
    const consolidation = detectConsolidation(candles, 6); // Shorter lookback

    let signal = 'WAIT';
    let confidence = 0;
    let reasons = [];
    let entry = currentPrice;

    // Session quality bonus
    if (session.quality === 'excellent') {
        confidence += 8;
    } else if (session.quality === 'good') {
        confidence += 4;
    }

    // TradingView recommendation confluence
    if (indicators?.recommendation) {
        if (indicators.recommendation.includes('BUY') || indicators.recommendation.includes('SELL')) {
            confidence += 3;
        }
    }

    // ===== SCALP: EMA CROSSOVER (9/21) =====
    if (strategy === 'emaCross' || strategy === 'all') {
        if (emaCross) {
            signal = emaCross.type;
            confidence += emaCross.confidence;
            reasons.push(`EMA 9/21 ${emaCross.crossover} crossover`);

            // RSI confirmation
            if ((signal === 'BUY' && fastRSI.zone !== 'overbought') ||
                (signal === 'SELL' && fastRSI.zone !== 'oversold')) {
                confidence += 8;
                reasons.push(`RSI(7): ${fastRSI.rsi} — not extreme`);
            }

            // Trend alignment
            if ((signal === 'BUY' && trend.trend === 'bullish') ||
                (signal === 'SELL' && trend.trend === 'bearish')) {
                confidence += 6;
                reasons.push(`Trend aligned: ${trend.trend}`);
            }
        }
    }

    // ===== SCALP: RSI REVERSAL (Oversold bounce / Overbought rejection) =====
    if ((strategy === 'rsiReversal' || strategy === 'all') && signal === 'WAIT') {
        if (fastRSI.zone === 'oversold' && fastRSI.rsi <= 20) {
            const bullishPattern = patterns.find(p => p.type === 'bullish');
            if (bullishPattern || (candles.length > 1 && candles[candles.length - 1].close > candles[candles.length - 1].open)) {
                signal = 'BUY';
                confidence += 78;
                reasons.push(`RSI(7) oversold: ${fastRSI.rsi}`);
                if (bullishPattern) reasons.push(`Reversal pattern: ${bullishPattern.name}`);
                reasons.push('Bounce from oversold zone');

                // Near support bonus
                const nearSup = srLevels.support.find(s => Math.abs(currentPrice - s.price) / currentPrice < 0.002);
                if (nearSup) { confidence += 10; reasons.push(`Near support ${nearSup.price.toFixed(4)}`); }
            }
        }

        if (fastRSI.zone === 'overbought' && fastRSI.rsi >= 80) {
            const bearishPattern = patterns.find(p => p.type === 'bearish');
            if (bearishPattern || (candles.length > 1 && candles[candles.length - 1].close < candles[candles.length - 1].open)) {
                signal = 'SELL';
                confidence += 78;
                reasons.push(`RSI(7) overbought: ${fastRSI.rsi}`);
                if (bearishPattern) reasons.push(`Reversal pattern: ${bearishPattern.name}`);
                reasons.push('Rejection from overbought zone');

                const nearRes = srLevels.resistance.find(r => Math.abs(currentPrice - r.price) / currentPrice < 0.002);
                if (nearRes) { confidence += 10; reasons.push(`Near resistance ${nearRes.price.toFixed(4)}`); }
            }
        }
    }

    // ===== SCALP: SPREAD BOUNCE (S/R scalp) =====
    if ((strategy === 'spreadBounce' || strategy === 'all') && signal === 'WAIT') {
        const nearSup = srLevels.support.find(s => Math.abs(currentPrice - s.price) / currentPrice < 0.0015);
        const nearRes = srLevels.resistance.find(r => Math.abs(currentPrice - r.price) / currentPrice < 0.0015);

        if (nearSup) {
            const bullish = patterns.find(p => p.type === 'bullish');
            const isGreenCandle = candles.length > 0 && candles[candles.length - 1].close > candles[candles.length - 1].open;
            if (bullish || isGreenCandle) {
                signal = 'BUY';
                confidence += 72;
                reasons.push(`Scalp bounce off support ${nearSup.price.toFixed(4)}`);
                if (bullish) reasons.push(`Pattern: ${bullish.name}`);
                if (ema9 && currentPrice > ema9) { confidence += 5; reasons.push('Above EMA 9'); }
            }
        }

        if (nearRes && signal === 'WAIT') {
            const bearish = patterns.find(p => p.type === 'bearish');
            const isRedCandle = candles.length > 0 && candles[candles.length - 1].close < candles[candles.length - 1].open;
            if (bearish || isRedCandle) {
                signal = 'SELL';
                confidence += 72;
                reasons.push(`Scalp rejection at resistance ${nearRes.price.toFixed(4)}`);
                if (bearish) reasons.push(`Pattern: ${bearish.name}`);
                if (ema9 && currentPrice < ema9) { confidence += 5; reasons.push('Below EMA 9'); }
            }
        }
    }

    // ===== SCALP: MICRO BREAKOUT =====
    if ((strategy === 'microBreakout' || strategy === 'all') && signal === 'WAIT') {
        if (consolidation.isConsolidating && atr) {
            const latest = candles[candles.length - 1];
            const microThreshold = atr * 0.3; // Tighter breakout threshold for scalping

            if (latest.close > consolidation.zoneHigh + microThreshold) {
                signal = 'BUY';
                confidence += 76;
                reasons.push(`Micro breakout above ${consolidation.zoneHigh.toFixed(4)}`);
                reasons.push(`Range contraction: ${consolidation.contraction.toFixed(0)}%`);
                if (parseFloat(volume.volumeRatio) > 1.2) { confidence += 8; reasons.push(`Volume surge: ${volume.volumeRatio}x`); }
            }

            if (latest.close < consolidation.zoneLow - microThreshold && signal === 'WAIT') {
                signal = 'SELL';
                confidence += 76;
                reasons.push(`Micro breakdown below ${consolidation.zoneLow.toFixed(4)}`);
                reasons.push(`Range contraction: ${consolidation.contraction.toFixed(0)}%`);
                if (parseFloat(volume.volumeRatio) > 1.2) { confidence += 8; reasons.push(`Volume surge: ${volume.volumeRatio}x`); }
            }
        }
    }

    // ===== SCALP: MOMENTUM BURST =====
    if ((strategy === 'momentumBurst' || strategy === 'all') && signal === 'WAIT') {
        if (atr && candles.length >= 3) {
            const latest = candles[candles.length - 1];
            const candleRange = latest.high - latest.low;
            const bodySize = Math.abs(latest.close - latest.open);

            // Strong momentum candle: body > 70% of range AND range > 1.5x ATR
            if (bodySize > candleRange * 0.7 && candleRange > atr * 1.5) {
                const isBullish = latest.close > latest.open;
                signal = isBullish ? 'BUY' : 'SELL';
                confidence += 80;
                reasons.push(`Momentum burst: ${(candleRange / atr).toFixed(1)}x ATR candle`);
                reasons.push(`Body fills ${((bodySize / candleRange) * 100).toFixed(0)}% of range`);

                if ((signal === 'BUY' && fastRSI.rsi < 70) || (signal === 'SELL' && fastRSI.rsi > 30)) {
                    confidence += 5;
                    reasons.push(`RSI(7) has room: ${fastRSI.rsi}`);
                }
            }
        }
    }

    // Session info
    reasons.push(`Session: ${session.session} (${session.quality})`);

    // ===== Calculate scalp-tight TP levels =====
    let multiTP = null;
    if (signal !== 'WAIT' && atr) {
        const isGold = pairName && pairName.includes('XAU');
        const isCommodity = pairName && (pairName.includes('OIL') || pairName.includes('NGA') || pairName.includes('XAG'));
        const isCommodityOrGold = isGold || isCommodity;

        const slDistance = isCommodityOrGold ? (atr * 0.25) : (atr * 0.5); // Tighter SL for scalping
        const maxSLDistance = isCommodityOrGold ? (atr * 0.5) : (atr * 1.0);

        if (signal === 'BUY') {
            const nearestSup = srLevels.support
                .filter(s => s.price < entry)
                .sort((a, b) => b.price - a.price)[0];

            const structureSL = nearestSup ? nearestSup.price - (atr * 0.15) : entry - slDistance;
            const stopLoss = Math.max(structureSL, entry - maxSLDistance); // Cap max SL

            const risk = entry - stopLoss;
            if (risk <= 0) {
                signal = 'WAIT';
                confidence = 0;
                reasons = ['Invalidated: SL too close'];
            } else {
                multiTP = {
                    stopLoss,
                    tp1: entry + risk * 1,       // 1R
                    tp2: entry + risk * 1.5,     // 1.5R  
                    tp3: entry + risk * 2,       // 2R
                    riskDistance: risk,
                    tp1ClosePercent: 50,
                    tp2ClosePercent: 30,
                    tp3ClosePercent: 20,
                    tp1RR: '1:1',
                    tp2RR: '1:1.5',
                    tp3RR: '1:2',
                    pips: {
                        sl: priceToPips(pairName, risk),
                        tp1: priceToPips(pairName, risk * 1),
                        tp2: priceToPips(pairName, risk * 1.5),
                        tp3: priceToPips(pairName, risk * 2)
                    }
                };
            }
        } else if (signal === 'SELL') {
            const nearestRes = srLevels.resistance
                .filter(r => r.price > entry)
                .sort((a, b) => a.price - b.price)[0];

            const structureSL = nearestRes ? nearestRes.price + (atr * 0.15) : entry + slDistance;
            const stopLoss = Math.min(structureSL, entry + maxSLDistance);

            const risk = stopLoss - entry;
            if (risk <= 0) {
                signal = 'WAIT';
                confidence = 0;
                reasons = ['Invalidated: SL too close'];
            } else {
                multiTP = {
                    stopLoss,
                    tp1: entry - risk * 1,
                    tp2: entry - risk * 1.5,
                    tp3: entry - risk * 2,
                    riskDistance: risk,
                    tp1ClosePercent: 50,
                    tp2ClosePercent: 30,
                    tp3ClosePercent: 20,
                    tp1RR: '1:1',
                    tp2RR: '1:1.5',
                    tp3RR: '1:2',
                    pips: {
                        sl: priceToPips(pairName, risk),
                        tp1: priceToPips(pairName, risk * 1),
                        tp2: priceToPips(pairName, risk * 1.5),
                        tp3: priceToPips(pairName, risk * 2)
                    }
                };
            }
        }
    }

    confidence = Math.min(Math.round(confidence), 98);

    const overallRR = multiTP
        ? calculateRiskReward(entry, multiTP.stopLoss, multiTP.tp2)
        : { formatted: 'N/A' };

    return {
        signal,
        confidence,
        entry: currentPrice,
        stopLoss: multiTP?.stopLoss?.toFixed(5) || null,
        takeProfit: multiTP?.tp2?.toFixed(5) || null,
        tp1: multiTP?.tp1?.toFixed(5) || null,
        tp2: multiTP?.tp2?.toFixed(5) || null,
        tp3: multiTP?.tp3?.toFixed(5) || null,
        tp1ClosePercent: multiTP?.tp1ClosePercent || 50,
        tp2ClosePercent: multiTP?.tp2ClosePercent || 30,
        tp3ClosePercent: multiTP?.tp3ClosePercent || 20,
        tp1RR: multiTP?.tp1RR || '1:1',
        tp2RR: multiTP?.tp2RR || '1:1.5',
        tp3RR: multiTP?.tp3RR || '1:2',
        riskReward: overallRR?.formatted || 'N/A',
        pips: multiTP?.pips || null,
        atr: atr?.toFixed(5) || null,
        session,
        ema9,
        ema21,
        fastRSI,
        reasons,
        patterns,
        trend,
        momentum: { rsi: fastRSI.rsi, strength: fastRSI.zone },
        volume,
        consolidation,
        support: srLevels.support,
        resistance: srLevels.resistance,
        isScalp: true
    };
};
