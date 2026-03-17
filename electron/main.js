const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Force production mode if packaged
if (!isDev) {
    process.env.NODE_ENV = 'production';
}

// CRITICAL: Restore Windows System Variables for Packaged Environment
if (process.platform === 'win32') {
    const sysRoot = process.env.SystemRoot || 'C:\\Windows';
    const sys32 = path.join(sysRoot, 'System32');

    // Bundled Binaries PATH
    const localBin = isDev
        ? path.join(__dirname, '../resources/bin')
        : path.join(process.resourcesPath, 'bin');

    // Ensure ComSpec is set (fixes spawn cmd.exe issues)
    process.env.ComSpec = process.env.ComSpec || path.join(sys32, 'cmd.exe');

    // Hard-fix PATH to include System32 and bundled binaries
    const essentialPaths = [
        sys32,
        sysRoot,
        path.join(sys32, 'Wbem'),
        path.join(sys32, 'WindowsPowerShell\\v1.0\\'),
        localBin // Add our high-velocity binaries!
    ];

    const currentPath = process.env.PATH || '';
    const missingPaths = essentialPaths.filter(p => !currentPath.toLowerCase().includes(p.toLowerCase()));

    if (missingPaths.length > 0) {
        process.env.PATH = `${currentPath}${currentPath.endsWith(';') ? '' : ';'}${missingPaths.join(';')}`;
    }
}

// In production, Next.js needs to find the .next folder
// electron-builder copies everything to the app root
const nextDir = isDev ? path.join(__dirname, '../') : app.getAppPath();

const nextApp = next({ dev: isDev, dir: nextDir });
const handle = nextApp.getRequestHandler();

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 900,
        title: "Velo",
        autoHideMenuBar: true,
        backgroundColor: '#000000',
        icon: path.join(__dirname, '../public/favicon.ico'), // Try to load icon if exists
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Start Next.js server
    nextApp.prepare().then(() => {
        const server = createServer((req, res) => {
            const parsedUrl = parse(req.url, true);
            handle(req, res, parsedUrl);
        });

        // Use a random port or fixed port
        server.listen(3000, '127.0.0.1', (err) => {
            if (err) {
                console.error("Server Start Error:", err);
                return;
            }
            console.log("Next.js Server active on port 3000");
            win.loadURL('http://127.0.0.1:3000');
        });
    }).catch(err => {
        // Log to a file if possible, or show a messagebox
        console.error("Next.js Prepare Error:", err);
        const { dialog } = require('electron');
        dialog.showErrorBox("Startup Error", `Velo failed to start the engine: ${err.message}\n\nPath: ${nextDir}`);
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
