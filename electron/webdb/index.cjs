'use strict';

const fs = require('fs');
const path = require('path');
const { ipcMain, BrowserWindow, shell } = require('electron');
const { createWebApp, createToken } = require('./common.cjs');
const { MysqlWebBackend } = require('./mysql-web.cjs');
const { RedisWebBackend } = require('./redis-web.cjs');

const KINDS = ['mysql', 'redis'];
const DEFAULTS = { mysqlPort: 15811, redisPort: 15812 };
const servers = new Map();

function configPath(userDataPath) {
  return path.join(userDataPath, 'webdb', 'config.json');
}

function loadConfig(userDataPath) {
  try {
    const raw = fs.readFileSync(configPath(userDataPath), 'utf8');
    const parsed = JSON.parse(raw);
    const conns = parsed && parsed.conns && typeof parsed.conns === 'object' ? parsed.conns : {};
    return {
      mysqlPort: Number(parsed.mysqlPort) || DEFAULTS.mysqlPort,
      redisPort: Number(parsed.redisPort) || DEFAULTS.redisPort,
      conns
    };
  } catch (err) {
    return { ...DEFAULTS, conns: {} };
  }
}

function saveConfig(userDataPath, config) {
  const target = configPath(userDataPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const payload = {
    mysqlPort: config.mysqlPort,
    redisPort: config.redisPort,
    conns: config.conns && typeof config.conns === 'object' ? config.conns : {}
  };
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
}

function normalizedConn(kind, conn) {
  const source = conn && typeof conn === 'object' ? conn : {};
  const port = Number(source.port);
  return {
    kind,
    version: typeof source.version === 'string' ? source.version : '',
    port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0,
    password: typeof source.password === 'string' ? source.password : '',
    user: kind === 'mysql'
      ? (typeof source.user === 'string' && source.user ? source.user : 'root')
      : ''
  };
}

function portOf(config, kind) {
  return kind === 'mysql' ? config.mysqlPort : config.redisPort;
}

function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function snapshot() {
  const config = loadConfig(currentUserDataPath);
  return KINDS.map((kind) => {
    const entry = servers.get(kind);
    return {
      kind,
      running: Boolean(entry),
      port: entry ? entry.port : portOf(config, kind),
      configuredPort: portOf(config, kind),
      url: entry ? entry.url : '',
      startedAt: entry ? entry.startedAt : 0,
      serverVersion: entry ? entry.version : '',
      dbPort: entry ? entry.dbPort : 0
    };
  });
}

let currentUserDataPath = '';

async function stopServer(kind) {
  const entry = servers.get(kind);
  if (!entry) return { ok: true, stopped: false };
  servers.delete(kind);
  try {
    await entry.backend.close();
  } catch (err) {
    // 忽略
  }
  await new Promise((resolve) => entry.server.close(() => resolve()));
  broadcast('webdb-changed', { kind, running: false });
  return { ok: true, stopped: true };
}

async function startServer(kind, conn, portOverride) {
  if (!KINDS.includes(kind)) return { ok: false, message: `未知的数据库类型：${kind}` };
  await stopServer(kind);

  const config = loadConfig(currentUserDataPath);
  const port = Number(portOverride) || portOf(config, kind);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    return { ok: false, message: 'Web 端口必须在 1024-65535 之间' };
  }

  const backend = kind === 'mysql' ? new MysqlWebBackend() : new RedisWebBackend();
  try {
    await backend.connect(conn || {});
  } catch (err) {
    return {
      ok: false,
      message: kind === 'mysql'
        ? `连不上 MySQL：${err.message}`
        : `连不上 Redis：${err.message}`
    };
  }

  const token = createToken();
  const assetsDir = path.join(__dirname, 'assets', kind);
  const server = createWebApp({
    assetsDir,
    token,
    api: (req, res, url) => backend.api(req, res, url)
  });

  const listening = await new Promise((resolve) => {
    const onError = (err) => {
      server.removeListener('listening', onListening);
      resolve({ ok: false, message: err.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，换一个 Web 端口` : err.message });
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve({ ok: true });
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });

  if (!listening.ok) {
    await backend.close();
    return { ok: false, message: listening.message };
  }

  const entry = {
    kind,
    server,
    backend,
    port,
    token,
    url: `http://127.0.0.1:${port}/?t=${token}`,
    startedAt: Date.now(),
    version: backend.meta ? backend.meta.version : '',
    dbPort: backend.meta ? backend.meta.port : port
  };
  servers.set(kind, entry);
  if (conn && typeof conn === 'object') {
    const stored = normalizedConn(kind, conn);
    config.conns[kind] = stored;
    saveConfig(currentUserDataPath, config);
  }
  broadcast('webdb-changed', { kind, running: true, url: entry.url });
  return { ok: true, url: entry.url, port, serverVersion: entry.version };
}

function registerWebdbHandlers(mainWindow, userDataPath) {
  currentUserDataPath = userDataPath;
  loadConfig(userDataPath); // 确保目录与默认配置存在

  ipcMain.handle('webdb-status', () => ({ ok: true, data: snapshot() }));

  ipcMain.handle('webdb-start', async (event, payload) => {
    try {
      const result = await startServer(
        payload && payload.kind,
        payload && payload.conn,
        payload && payload.port
      );
      return result;
    } catch (err) {
      return { ok: false, message: err.message || String(err) };
    }
  });

  ipcMain.handle('webdb-stop', async (event, kind) => {
    try {
      return await stopServer(kind);
    } catch (err) {
      return { ok: false, message: err.message || String(err) };
    }
  });

  ipcMain.handle('webdb-open', async (event, kind) => {
    const entry = servers.get(kind);
    if (!entry) return { ok: false, message: 'Web 服务还没启动' };
    await shell.openExternal(entry.url);
    return { ok: true, url: entry.url };
  });

  ipcMain.handle('webdb-set-port', (event, kind, port) => {
    const value = Number(port);
    if (!KINDS.includes(kind)) return { ok: false, message: '未知的数据库类型' };
    if (!Number.isInteger(value) || value < 1024 || value > 65535) {
      return { ok: false, message: '端口必须在 1024-65535 之间' };
    }
    const config = loadConfig(currentUserDataPath);
    if (kind === 'mysql') config.mysqlPort = value;
    else config.redisPort = value;
    saveConfig(currentUserDataPath, config);
    broadcast('webdb-changed', { kind, running: servers.has(kind), port: value });
    return { ok: true, port: value };
  });

  ipcMain.handle('webdb-get-conn', (event, kind) => {
    if (!KINDS.includes(kind)) return { ok: false, message: '未知的数据库类型' };
    const config = loadConfig(currentUserDataPath);
    return { ok: true, conn: normalizedConn(kind, config.conns[kind] || {}) };
  });

  ipcMain.handle('webdb-set-conn', (event, kind, conn) => {
    if (!KINDS.includes(kind)) return { ok: false, message: '未知的数据库类型' };
    const config = loadConfig(currentUserDataPath);
    config.conns[kind] = normalizedConn(kind, conn);
    saveConfig(currentUserDataPath, config);
    broadcast('webdb-changed', { kind, running: servers.has(kind) });
    return { ok: true, conn: config.conns[kind] };
  });

  const dispose = () => {
    for (const kind of KINDS) {
      stopServer(kind).catch(() => {});
    }
  };
  if (!registerWebdbHandlers._disposed) {
    registerWebdbHandlers._disposed = true;
    require('electron').app.on('before-quit', dispose);
  }
}

module.exports = { registerWebdbHandlers };
