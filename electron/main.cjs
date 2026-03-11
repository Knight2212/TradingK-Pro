const { app, BrowserWindow, ipcMain, net } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "TradingK Pro",
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        backgroundColor: '#0f172a', // Slate-900 matching the web app
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        // mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

// IPC handler for TradingView Scanner API proxy
ipcMain.handle('tv-scan', async (event, { scanner, symbols, columns }) => {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({
            symbols: {
                tickers: symbols,
                query: { types: [] }
            },
            columns: columns
        });

        const request = net.request({
            method: 'POST',
            protocol: 'https:',
            hostname: 'scanner.tradingview.com',
            path: `/${scanner}/scan`,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        request.on('response', (response) => {
            let data = '';
            response.on('data', (chunk) => {
                data += chunk;
            });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });

        request.on('error', (error) => {
            reject(error);
        });

        request.write(body);
        request.end();
    });
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});
