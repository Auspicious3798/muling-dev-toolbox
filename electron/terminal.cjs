const {ipcMain, app} = require('electron');
const os = require('os');
const {execFile} = require('child_process');
const sandbox = require('./utils/sandbox.cjs');

let pty = null;
let ptyError = '';

function loadPty() {
    if (pty) return pty;
    const candidates = ['@homebridge/node-pty-prebuilt-multiarch', 'node-pty'];
    for (const name of candidates) {
        try {
            pty = require(name);
            return pty;
        } catch (err) {
            ptyError = err && err.message ? err.message : String(err);
        }
    }
    return null;
}

const sessions = new Map();
let sequence = 0;

function getWindowSafe(getWindow) {
    const win = typeof getWindow === 'function' ? getWindow() : getWindow;
    if (!win || win.isDestroyed()) return null;
    return win;
}

function send(getWindow, channel, payload) {
    const win = getWindowSafe(getWindow);
    if (win) win.webContents.send(channel, payload);
}

function killTree(proc) {
    if (!proc) return;
    const pid = proc.pid;
    try {
        proc.kill();
    } catch (err) {
    }
    if (pid) {
        execFile('taskkill', ['/PID', String(pid), '/T', '/F'], {windowsHide: true}, () => {
        });
    }
}

function disposeSession(id) {
    const proc = sessions.get(id);
    if (!proc) return false;
    sessions.delete(id);
    killTree(proc);
    return true;
}

function disposeAll() {
    for (const id of Array.from(sessions.keys())) disposeSession(id);
}

module.exports = function registerTerminalHandlers(getWindow) {
    ipcMain.handle('terminal-create', (event, options = {}) => {
        const lib = loadPty();
        if (!lib) {
            return {success: false, error: `终端内核加载失败：${ptyError || '未安装 node-pty'}`};
        }
        try {
            const id = `term-${++sequence}`;
            const shell = process.env.ComSpec || 'cmd.exe';
            const cwd = options.cwd && options.cwd.trim() ? options.cwd : os.homedir();
            const focus = options.tool && options.version
                ? {tool: options.tool, version: options.version}
                : null;
            const env = sandbox.getTerminalEnv(focus || {});
            const proc = lib.spawn(shell, [], {
                name: 'xterm-256color',
                cols: options.cols || 100,
                rows: options.rows || 30,
                cwd,
                env,
                useConpty: true,
            });
            sessions.set(id, proc);
            proc.onData(data => send(getWindow, 'terminal-data', {id, data}));
            proc.onExit(({exitCode}) => {
                sessions.delete(id);
                send(getWindow, 'terminal-exit', {id, exitCode});
            });
            return {
                success: true,
                id,
                shell,
                cwd,
                summary: sandbox.getActiveSummary(focus || {}),
                root: sandbox.getRoot(),
            };
        } catch (err) {
            return {success: false, error: err.message};
        }
    });

    ipcMain.on('terminal-write', (event, payload = {}) => {
        const proc = sessions.get(payload.id);
        if (proc) {
            try {
                proc.write(payload.data);
            } catch (err) {
            }
        }
    });

    ipcMain.on('terminal-resize', (event, payload = {}) => {
        const proc = sessions.get(payload.id);
        const cols = Math.max(2, Math.floor(payload.cols || 0));
        const rows = Math.max(2, Math.floor(payload.rows || 0));
        if (proc && cols && rows) {
            try {
                proc.resize(cols, rows);
            } catch (err) {
            }
        }
    });

    ipcMain.on('terminal-dispose', (event, payload = {}) => {
        disposeSession(payload.id);
    });

    ipcMain.on('terminal-dispose-all', () => disposeAll());

    ipcMain.handle('terminal-summary', () => ({
        summary: sandbox.getActiveSummary(),
        root: sandbox.getRoot(),
        sessions: sessions.size,
    }));

    app.on('before-quit', disposeAll);
};
