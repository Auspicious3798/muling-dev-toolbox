const {ipcMain, app, BrowserWindow} = require('electron');
const http = require('http');
const configStore = require('./config.cjs');
const activity = require('./activity.cjs');
const tools = require('./tools.cjs');
const {createServer, SERVER_INFO} = require('./server.cjs');

function maskToken(token) {
    if (!token) return '';
    if (token.length <= 10) return token;
    return token.slice(0, 6) + '…' + token.slice(-4);
}

function registerMcpHandlers(mainWindow, userDataPath) {
    let config = configStore.load(userDataPath);
    activity.init(userDataPath);

    function resolveWindow() {
        if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
        const alive = BrowserWindow.getAllWindows().find((win) => !win.isDestroyed());
        return alive || null;
    }

    function broadcast(entry) {
        const win = resolveWindow();
        if (!win || !win.webContents || win.webContents.isDestroyed()) return;
        try {
            win.webContents.send('mcp-activity', entry);
        } catch (err) {
            // 窗口正在关闭，忽略
        }
    }

    function callRenderer(method, args = [], timeoutMs = 30000) {
        const win = resolveWindow();
        if (!win || !win.webContents || win.webContents.isDestroyed()) {
            return Promise.reject(new Error('主窗口未就绪，稍后重试'));
        }
        const code = `window.electronAPI.${method}(${args.map((item) => JSON.stringify(item)).join(', ')})`;
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                reject(new Error(`操作超时（${Math.round(timeoutMs / 1000)} 秒）`));
            }, timeoutMs);
            win.webContents.executeJavaScript(code, true).then((value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            }).catch((err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    const server = createServer({
        getConfig: () => config,
        getWindow: () => mainWindow,
        activity,
        tools,
        callRenderer,
        onActivity: broadcast,
    });

    function status() {
        const base = server.status();
        return Object.assign({}, base, {
            token: config.token,
            tokenMasked: maskToken(config.token),
            autoStart: config.autoStart,
            allowCommands: config.allowCommands,
            commandTimeout: config.commandTimeout,
            activityFile: configStore.configPath(userDataPath),
            serverInfo: SERVER_INFO,
        });
    }

    ipcMain.handle('mcp-get-status', () => status());

    ipcMain.handle('mcp-get-tools', () => {
        try {
            return tools.list();
        } catch (err) {
            return [];
        }
    });

    ipcMain.handle('mcp-start', async () => {
        try {
            await server.start();
            return {success: true, status: status()};
        } catch (err) {
            return {success: false, message: err.message, status: status()};
        }
    });

    ipcMain.handle('mcp-stop', async () => {
        await server.stop();
        return {success: true, status: status()};
    });

    ipcMain.handle('mcp-update-config', async (event, patch = {}) => {
        const next = Object.assign({}, config);
        let portChanged = false;
        if (patch.port !== undefined) {
            const port = Number(patch.port);
            if (!Number.isInteger(port) || port < 1024 || port > 65535) {
                return {success: false, message: '端口需要是 1024-65535 之间的整数', status: status()};
            }
            if (port !== config.port) {
                next.port = port;
                portChanged = true;
            }
        }
        if (patch.autoStart !== undefined) next.autoStart = Boolean(patch.autoStart);
        if (patch.allowCommands !== undefined) next.allowCommands = Boolean(patch.allowCommands);
        if (patch.commandTimeout !== undefined) {
            const timeout = Number(patch.commandTimeout);
            if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) {
                return {success: false, message: '命令超时需要是 1000-120000 毫秒', status: status()};
            }
            next.commandTimeout = timeout;
        }
        const wasRunning = server.status().running;
        config = next;
        configStore.save(userDataPath, config);
        if (portChanged && wasRunning) {
            await server.stop();
            try {
                await server.start();
            } catch (err) {
                return {success: false, message: `新端口启动失败：${err.message}`, status: status()};
            }
        }
        return {success: true, status: status()};
    });

    ipcMain.handle('mcp-get-token', () => ({token: config.token, masked: maskToken(config.token)}));

    ipcMain.handle('mcp-regenerate-token', () => {
        config.token = configStore.newToken();
        configStore.save(userDataPath, config);
        return {success: true, token: config.token, masked: maskToken(config.token)};
    });

    ipcMain.handle('mcp-get-stats', (event, range = 'today') => {
        const allowed = ['today', '7d', 'all'];
        return activity.stats(allowed.includes(range) ? range : 'today');
    });

    ipcMain.handle('mcp-get-calls', (event, limit = 80) => activity.recent(limit));

    ipcMain.handle('mcp-clear-calls', () => {
        const ok = activity.clear();
        return {success: ok};
    });

    ipcMain.handle('mcp-self-test', () => new Promise((resolve) => {
        const current = server.status();
        if (!current.running) {
            resolve({success: false, message: '服务没有在运行'});
            return;
        }
        const body = JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list', params: {}});
        const req = http.request({
            host: '127.0.0.1',
            port: current.port,
            path: '/mcp',
            method: 'POST',
            timeout: 6000,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                'Authorization': `Bearer ${config.token}`,
            },
        }, (res) => {
            let text = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                text += chunk;
            });
            res.on('end', () => {
                try {
                    const payload = JSON.parse(text);
                    const list = payload && payload.result && payload.result.tools ? payload.result.tools : [];
                    resolve({
                        success: res.statusCode === 200,
                        code: res.statusCode,
                        tools: list.map((tool) => tool.name),
                        message: res.statusCode === 200 ? `握手成功，暴露 ${list.length} 个工具` : `服务返回 ${res.statusCode}`,
                    });
                } catch (err) {
                    resolve({success: false, message: `返回内容不是合法 JSON：${text.slice(0, 120)}`});
                }
            });
        });
        req.on('error', (err) => resolve({success: false, message: err.message}));
        req.on('timeout', () => {
            req.destroy();
            resolve({success: false, message: '自检超时'});
        });
        req.write(body);
        req.end();
    }));

    if (config.autoStart) {
        server.start().catch(() => {
            // 端口占用等情况由状态接口呈现
        });
    }

    app.on('before-quit', () => {
        server.stop().catch(() => {});
    });

    return {server, status};
}

module.exports = registerMcpHandlers;
