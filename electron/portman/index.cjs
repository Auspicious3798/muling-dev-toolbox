const { ipcMain } = require('electron');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const POWERSHELL = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
);

const COMMON_PORTS = [80, 443, 3000, 3306, 5173, 6379, 8000, 8080, 8081, 8888, 9000, 9200, 15801, 15811, 15812, 27017];

function sandboxRoot() {
  const base = process.env.LOCALAPPDATA || path.join(require('os').homedir(), 'AppData', 'Local');
  return path.join(base, 'Muling', 'env');
}

function run(file, args, timeout = 12000) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(String(stdout || ''));
    });
  });
}

async function listListening() {
  let text = '';
  try {
    text = await run('netstat', ['-ano', '-p', 'TCP']);
  } catch (err) {
    text = await run('netstat', ['-ano']);
  }
  const map = new Map();
  const lineRe = /^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/i;
  for (const line of text.split(/\r?\n/)) {
    const match = lineRe.exec(line);
    if (!match) continue;
    const address = match[1];
    const port = Number(match[2]);
    const pid = Number(match[3]);
    if (!port || !pid) continue;
    const existing = map.get(port);
    if (existing) {
      if (!existing.addresses.includes(address)) existing.addresses.push(address);
      continue;
    }
    map.set(port, { port, pid, addresses: [address] });
  }
  return Array.from(map.values());
}

async function processTable(pids) {
  if (!pids.length) return new Map();
  const result = new Map();
  const list = pids.join(',');
  const script = [
    `$ids = @(${list})`,
    'Get-Process -Id $ids -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,Path,WorkingSet64 | ConvertTo-Json -Compress'
  ].join('; ');
  try {
    const out = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script]);
    const trimmed = out.trim();
    if (trimmed) {
      const parsed = JSON.parse(trimmed);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      for (const row of rows) {
        if (!row || row.Id == null) continue;
        result.set(Number(row.Id), {
          name: row.ProcessName || '',
          path: row.Path || '',
          memory: Number(row.WorkingSet64) || 0
        });
      }
    }
  } catch (err) {
  }
  const missing = pids.filter((pid) => !result.has(pid));
  if (missing.length) {
    try {
      const out = await run('tasklist', ['/FO', 'CSV', '/NH', '/FI', `PID eq ${missing[0]}`]);
      for (const line of out.split(/\r?\n/)) {
        const cells = line.match(/"([^"]*)"/g);
        if (!cells || cells.length < 2) continue;
        const pid = Number(cells[1].replace(/"/g, ''));
        if (missing.includes(pid)) {
          result.set(pid, { name: cells[0].replace(/"/g, ''), path: '', memory: 0 });
        }
      }
    } catch (err) {
    }
  }
  return result;
}

function classify(pid, info, root, selfPid, managedPorts, port) {
  if (pid === selfPid) return 'self';
  if (managedPorts.has(port)) return 'sandbox';
  const exe = (info && info.path) || '';
  if (exe && root && exe.toLowerCase().startsWith(root.toLowerCase())) return 'sandbox';
  return 'system';
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
}

function readManagedPorts(userDataPath) {
  const ports = new Set();
  if (!userDataPath) return ports;
  const servicePorts = readJson(path.join(userDataPath, 'service-ports.json')) || {};
  for (const value of Object.values(servicePorts)) {
    const port = Number(value);
    if (Number.isInteger(port) && port > 0) ports.add(port);
  }
  const webdb = readJson(path.join(userDataPath, 'webdb', 'config.json'));
  if (webdb) {
    for (const port of [webdb.mysqlPort, webdb.redisPort]) {
      if (Number.isInteger(Number(port))) ports.add(Number(port));
    }
    const conns = (webdb && webdb.conns) || {};
    for (const conn of Object.values(conns)) {
      const port = Number(conn && conn.port);
      if (Number.isInteger(port) && port > 0) ports.add(port);
    }
  }
  const mcp = readJson(path.join(userDataPath, 'mcp', 'config.json'));
  if (mcp && Number.isInteger(Number(mcp.port))) ports.add(Number(mcp.port));
  return ports;
}

async function scan(options = {}) {
  const userDataPath = options.userDataPath || '';
  const listeners = await listListening();
  const pids = Array.from(new Set(listeners.map((item) => item.pid)));
  const table = await processTable(pids);
  const root = sandboxRoot();
  const selfPid = process.pid;
  const managedPorts = readManagedPorts(userDataPath);
  const ports = listeners
    .map((item) => {
      const info = table.get(item.pid) || { name: '', path: '', memory: 0 };
      return {
        port: item.port,
        pid: item.pid,
        address: item.addresses.join(' / '),
        process: info.name || '未知进程',
        exe: info.path || '',
        memory: info.memory || 0,
        scope: classify(item.pid, info, root, selfPid, managedPorts, item.port),
        common: COMMON_PORTS.includes(item.port)
      };
    })
    .sort((a, b) => a.port - b.port);
  const stats = {
    total: ports.length,
    sandbox: ports.filter((item) => item.scope === 'sandbox').length,
    system: ports.filter((item) => item.scope === 'system').length,
    scannedAt: Date.now()
  };
  return { ports, stats };
}

function killProcess(pid, allowSystem) {
  return new Promise((resolve) => {
    const target = Number(pid);
    if (!Number.isInteger(target) || target <= 0) {
      return resolve({ ok: false, message: 'PID 无效' });
    }
    if (target === process.pid) {
      return resolve({ ok: false, message: '这是环境盒自己，不能结束' });
    }
    if (target <= 4) {
      return resolve({ ok: false, message: '这是系统核心进程，不能结束' });
    }
    if (!allowSystem) {
      return resolve({ ok: false, message: '系统进程需要手动确认后才能结束' });
    }
    execFile('taskkill', ['/PID', String(target), '/T', '/F'], { windowsHide: true, timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || '') .trim() || String(stdout || '').trim() || err.message;
        return resolve({ ok: false, message: detail.replace(/\s+/g, ' ').slice(0, 200) });
      }
      resolve({ ok: true, message: String(stdout || '已结束进程').trim() });
    });
  });
}

function registerPortmanHandlers(mainWindow, userDataPath) {
  ipcMain.handle('portman-list', async () => {
    try {
      const data = await scan({ userDataPath });
      return { ok: true, ...data };
    } catch (err) {
      return { ok: false, message: err.message || String(err), ports: [], stats: { total: 0, sandbox: 0, system: 0, scannedAt: Date.now() } };
    }
  });

  ipcMain.handle('portman-kill', async (event, payload) => {
    const pid = payload && payload.pid;
    const allowSystem = Boolean(payload && payload.allowSystem);
    return killProcess(pid, allowSystem);
  });
}

module.exports = { registerPortmanHandlers, scan, killProcess };
