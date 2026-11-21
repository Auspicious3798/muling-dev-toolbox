const fs = require('fs');
const path = require('path');

const RING_LIMIT = 400;
const FILE_LIMIT = 6000;

let logPath = '';
let ring = [];

function init(userData) {
    logPath = path.join(userData, 'mcp', 'calls.jsonl');
    ring = [];
    try {
        const text = fs.readFileSync(logPath, 'utf8');
        const lines = text.split('\n').filter(Boolean);
        const tail = lines.slice(-RING_LIMIT);
        for (const line of tail) {
            try {
                ring.push(JSON.parse(line));
            } catch (err) {
                // 坏行直接跳过
            }
        }
    } catch (err) {
        ring = [];
    }
}

function ensureDir() {
    if (!logPath) return false;
    try {
        fs.mkdirSync(path.dirname(logPath), {recursive: true});
        return true;
    } catch (err) {
        return false;
    }
}

function persist(entry) {
    if (!ensureDir()) return;
    try {
        fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
        // 记录失败不影响调用本身
    }
}

function record(entry) {
    const item = {
        ts: entry.ts || Date.now(),
        tool: String(entry.tool || 'unknown'),
        ok: entry.ok !== false,
        ms: Math.max(0, Math.round(entry.ms || 0)),
        client: String(entry.client || '').slice(0, 64),
        summary: String(entry.summary || '').slice(0, 240),
        error: entry.error ? String(entry.error).slice(0, 400) : '',
    };
    ring.push(item);
    if (ring.length > RING_LIMIT) ring.splice(0, ring.length - RING_LIMIT);
    persist(item);
    return item;
}

function recent(limit = 80) {
    const count = Math.min(Math.max(1, Number(limit) || 80), RING_LIMIT);
    return ring.slice(-count).reverse();
}

function readAll() {
    if (!logPath) return ring.slice();
    try {
        const text = fs.readFileSync(logPath, 'utf8');
        const out = [];
        for (const line of text.split('\n')) {
            if (!line) continue;
            try {
                out.push(JSON.parse(line));
            } catch (err) {
                // ignore
            }
        }
        return out;
    } catch (err) {
        return ring.slice();
    }
}

function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function dayKey(ts) {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}-${day}`;
}

function emptyStats() {
    return {
        calls: 0,
        ok: 0,
        fail: 0,
        avgMs: 0,
        successRate: 0,
        commands: 0,
        serviceOps: 0,
        clients: 0,
        byTool: [],
        series: [],
    };
}

function summarize(list) {
    const stats = emptyStats();
    const byTool = new Map();
    const clients = new Set();
    let totalMs = 0;
    for (const item of list) {
        stats.calls += 1;
        if (item.ok) stats.ok += 1;
        else stats.fail += 1;
        totalMs += item.ms || 0;
        if (item.tool === 'toolbox_run_command') stats.commands += 1;
        if (item.tool === 'toolbox_service') stats.serviceOps += 1;
        if (item.client) clients.add(item.client);
        byTool.set(item.tool, (byTool.get(item.tool) || 0) + 1);
    }
    stats.avgMs = stats.calls ? Math.round(totalMs / stats.calls) : 0;
    stats.successRate = stats.calls ? Math.round((stats.ok / stats.calls) * 100) : 0;
    stats.clients = clients.size;
    stats.byTool = Array.from(byTool.entries())
        .map(([tool, count]) => ({tool, count}))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);
    return stats;
}

// range: 'today' | '7d' | 'all'
function stats(range = 'today') {
    const all = readAll();
    const now = Date.now();
    let list = all;
    if (range === 'today') {
        const start = startOfDay(now);
        list = all.filter((item) => item.ts >= start);
    } else if (range === '7d') {
        const start = startOfDay(now) - 6 * 86400000;
        list = all.filter((item) => item.ts >= start);
    }
    const result = summarize(list);
    if (range === '7d') {
        const buckets = new Map();
        for (let i = 6; i >= 0; i -= 1) {
            const day = startOfDay(now) - i * 86400000;
            buckets.set(dayKey(day), {day: dayKey(day), calls: 0, fail: 0});
        }
        for (const item of list) {
            const key = dayKey(item.ts);
            const bucket = buckets.get(key);
            if (!bucket) continue;
            bucket.calls += 1;
            if (!item.ok) bucket.fail += 1;
        }
        result.series = Array.from(buckets.values());
    }
    return result;
}

function clear() {
    ring = [];
    if (!logPath) return true;
    try {
        fs.mkdirSync(path.dirname(logPath), {recursive: true});
        fs.writeFileSync(logPath, '', 'utf8');
        return true;
    } catch (err) {
        return false;
    }
}

function pruneIfNeeded() {
    if (!logPath) return;
    try {
        const size = fs.statSync(logPath).size;
        if (size < 2 * 1024 * 1024) return;
        const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
        fs.writeFileSync(logPath, lines.slice(-FILE_LIMIT).join('\n') + '\n', 'utf8');
    } catch (err) {
        // ignore
    }
}

module.exports = {init, record, recent, readAll, stats, clear, pruneIfNeeded};
