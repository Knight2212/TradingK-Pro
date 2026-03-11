import React from 'react';
import { AdvancedRealTimeChart } from 'react-ts-tradingview-widgets';

const TradingViewChart = ({ symbol, interval }) => {
    // Map our interval format to TradingView's format
    const intervalMap = {
        '1': '1',      // 1 minute
        '1m': '1',
        '5': '5',      // 5 minutes
        '5m': '5',
        '15': '15',    // 15 minutes
        '15m': '15',
        '60': '60',    // 1 hour
        '1h': '60',
        '240': '240',  // 4 hours
        '4h': '240',
        'D': 'D',      // 1 day
        '1d': 'D',
        '1D': 'D'
    };

    const tvInterval = intervalMap[interval] || '60';

    return (
        <div className="tradingview-chart-container" style={{ height: '100%', width: '100%' }}>
            <AdvancedRealTimeChart
                symbol={symbol}
                interval={tvInterval}
                theme="dark"
                autosize
                hide_side_toolbar={false}
                allow_symbol_change={false}
                save_image={false}
                container_id="tradingview_chart"
                style="1"
            />
        </div>
    );
};

export default TradingViewChart;
