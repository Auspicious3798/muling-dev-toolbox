'use strict';

const crypto = require('crypto');
const { RespClient, replyToText } = require('./resp.cjs');
const { readBody, sendJson, fail, sendFile } = require('./common.cjs');

const PAGE_DEFAULT = 200;
const PAGE_MAX = 1000;
const EXPORT_KEYS = 500;
const EXPORT_ELEMENTS = 10000;

function bulk(reply) {
  if (!reply || reply.type !== 'bulk' || reply.value === null) return null;
  const text = reply.value.toString('utf8');
  return text.includes('\uFFFD') ? `<binary ${reply.value.length} bytes>` : text;
}

function integer(reply) {
  if (!reply) return 0;
  if (reply.type === 'integer') return reply.value;
  if (reply.type === 'bulk') return Number(bulk(reply)) || 0;
  return 0;
}

function array(reply) {
  if (!reply || reply.type !== 'array' || !reply.value) return [];
  return reply.value;
}

function bulkArray(reply) {
  return array(reply).map((item) => bulk(item));
}

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isInteger(num)) return fallback;
  return Math.min(Math.max(num, min), max);
}

function flattenPairs(flat) {
  const items = [];
  for (let i = 0; i < flat.length; i += 2) items.push({ field: flat[i], value: flat[i + 1] });
  return items;
}

function stampNow() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
    time: `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  };
}

function quoteArg(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (text !== '' && /^[A-Za-z0-9_:.\/@+-]+$/.test(text)) return text;
  return '"' + text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t') + '"';
}

function splitCommandLine(line) {
  const args = [];
  let current = '';
  let quote = '';
  let has = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === '\\' && i + 1 < line.length) {
        const next = line[i + 1];
        current += next === 'n' ? '\n' : next === 'r' ? '\r' : next === 't' ? '\t' : next;
        i += 1;
        has = true;
        continue;
      }
      if (ch === quote) {
        quote = '';
        continue;
      }
      current += ch;
      has = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (has) {
        args.push(current);
        current = '';
        has = false;
      }
      continue;
    }
    current += ch;
    has = true;
  }
  if (has) args.push(current);
  return args;
}

class RedisWebBackend {
  constructor() {
    this.client = null;
    this.meta = null;
    this.imports = new Map();
    this.sweepTimer = setInterval(() => this.sweepImports(), 60 * 1000);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  async connect(conn) {
    await this.close();
    const client = new RespClient({
      host: conn.host || '127.0.0.1',
      port: Number(conn.port) || 6379,
      password: conn.password || '',
      db: Number(conn.db) || 0
    });
    await client.connect();
    this.client = client;
    const versionReply = await client.command(['INFO', 'server']);
    const versionLine = replyToText(versionReply)
      .split('\n')
      .find((line) => line.startsWith('redis_version:'));
    this.meta = {
      host: conn.host || '127.0.0.1',
      port: Number(conn.port) || 6379,
      version: versionLine ? versionLine.split(':')[1].trim() : '',
      db: Number(conn.db) || 0
    };
    return this.meta;
  }

  async close() {
    this.sweepImports(true);
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    if (this.client) {
      const client = this.client;
      this.client = null;
      client.close();
    }
  }

  sweepImports(all) {
    const now = Date.now();
    for (const [id, session] of this.imports) {
      if (all || now - session.touchedAt > 10 * 60 * 1000) this.imports.delete(id);
    }
  }

  async exec(args) {
    if (!this.client) throw new Error('Redis 连接未建立');
    return this.client.command(args);
  }

  async memoryOf(name) {
    try {
      return integer(await this.exec(['MEMORY', 'USAGE', name]));
    } catch (err) {
      return 0;
    }
  }

  async encodingOf(name) {
    try {
      return replyToText(await this.exec(['OBJECT', 'ENCODING', name])) || '';
    } catch (err) {
      return '';
    }
  }

  async readKey(name, options) {
    const opts = options || {};
    const type = replyToText(await this.exec(['TYPE', name]));
    const ttl = integer(await this.exec(['TTL', name]));
    if (type === 'none') return { name, type: 'none', ttl: -2, value: null };
    const memory = await this.memoryOf(name);
    const encoding = await this.encodingOf(name);
    const base = { name, type, ttl, memory, encoding };
    const count = clampInt(opts.count, 10, PAGE_MAX, PAGE_DEFAULT);

    if (type === 'string') {
      const value = bulk(await this.exec(['GET', name]));
      return { ...base, length: integer(await this.exec(['STRLEN', name])), value: { type: 'string', value } };
    }
    if (type === 'hash') {
      const cursor = String(opts.cursor || '0');
      const parts = array(await this.exec(['HSCAN', name, cursor, 'COUNT', String(count)]));
      const nextCursor = parts[0] ? bulk(parts[0]) : '0';
      return {
        ...base,
        length: integer(await this.exec(['HLEN', name])),
        cursor: nextCursor,
        value: { type: 'hash', value: flattenPairs(bulkArray(parts[1] || { type: 'array', value: [] })) }
      };
    }
    if (type === 'list') {
      const offset = clampInt(opts.offset, 0, 100000000, 0);
      const values = bulkArray(await this.exec(['LRANGE', name, String(offset), String(offset + count - 1)]));
      return {
        ...base,
        length: integer(await this.exec(['LLEN', name])),
        offset,
        count,
        value: { type: 'list', value: values.map((value, index) => ({ index: offset + index, value })) }
      };
    }
    if (type === 'set') {
      const cursor = String(opts.cursor || '0');
      const parts = array(await this.exec(['SSCAN', name, cursor, 'COUNT', String(count)]));
      const nextCursor = parts[0] ? bulk(parts[0]) : '0';
      return {
        ...base,
        length: integer(await this.exec(['SCARD', name])),
        cursor: nextCursor,
        value: { type: 'set', value: bulkArray(parts[1] || { type: 'array', value: [] }).map((value) => ({ value })) }
      };
    }
    if (type === 'zset') {
      const cursor = String(opts.cursor || '0');
      const parts = array(await this.exec(['ZSCAN', name, cursor, 'COUNT', String(count)]));
      const nextCursor = parts[0] ? bulk(parts[0]) : '0';
      const flat = bulkArray(parts[1] || { type: 'array', value: [] });
      const items = [];
      for (let i = 0; i < flat.length; i += 2) items.push({ value: flat[i], score: Number(flat[i + 1]) });
      return {
        ...base,
        length: integer(await this.exec(['ZCARD', name])),
        cursor: nextCursor,
        value: { type: 'zset', value: items }
      };
    }
    if (type === 'stream') {
      const rows = array(await this.exec(['XRANGE', name, '-', '+', 'COUNT', String(count)]));
      const items = rows.map((row) => {
        const pair = array(row);
        const id = pair[0] ? bulk(pair[0]) : '';
        const fields = bulkArray(pair[1] || { type: 'array', value: [] });
        const entries = [];
        for (let i = 0; i < fields.length; i += 2) entries.push({ field: fields[i], value: fields[i + 1] });
        return { id, fields: entries };
      });
      return { ...base, length: integer(await this.exec(['XLEN', name])), value: { type: 'stream', value: items } };
    }
    return { ...base, length: 0, value: { type, value: null } };
  }

  async withTtlKept(name, run) {
    const ttl = integer(await this.exec(['TTL', name]));
    const result = await run();
    if (ttl > 0) await this.exec(['EXPIRE', name, String(ttl)]);
    return result;
  }

  /* ---------------- 导出 / 导入 ---------------- */

  async exportKeyCommands(name) {
    const type = replyToText(await this.exec(['TYPE', name]));
    const ttl = integer(await this.exec(['TTL', name]));
    const lines = [];
    let truncated = false;
    if (type === 'string') {
      lines.push(['SET', name, bulk(await this.exec(['GET', name])) || '']);
    } else if (type === 'hash') {
      const flat = bulkArray(await this.exec(['HGETALL', name]));
      const pairs = flattenPairs(flat);
      for (let i = 0; i < pairs.length; i += 100) {
        const slice = pairs.slice(i, i + 100);
        if (!slice.length) continue;
        const args = ['HSET', name];
        for (const item of slice) args.push(item.field, item.value);
        lines.push(args);
      }
      if (pairs.length > EXPORT_ELEMENTS) truncated = true;
    } else if (type === 'list') {
      const values = bulkArray(await this.exec(['LRANGE', name, '0', String(EXPORT_ELEMENTS - 1)]));
      const total = integer(await this.exec(['LLEN', name]));
      for (let i = 0; i < values.length; i += 100) lines.push(['RPUSH', name, ...values.slice(i, i + 100)]);
      truncated = total > EXPORT_ELEMENTS;
    } else if (type === 'set') {
      const values = bulkArray(await this.exec(['SMEMBERS', name]));
      const total = integer(await this.exec(['SCARD', name]));
      const slice = values.slice(0, EXPORT_ELEMENTS);
      for (let i = 0; i < slice.length; i += 100) lines.push(['SADD', name, ...slice.slice(i, i + 100)]);
      truncated = total > EXPORT_ELEMENTS;
    } else if (type === 'zset') {
      const flat = bulkArray(await this.exec(['ZRANGE', name, '0', String(EXPORT_ELEMENTS - 1), 'WITHSCORES']));
      const total = integer(await this.exec(['ZCARD', name]));
      const items = [];
      for (let i = 0; i < flat.length; i += 2) items.push([flat[i], flat[i + 1]]);
      for (let i = 0; i < items.length; i += 50) {
        const args = ['ZADD', name];
        for (const [member, score] of items.slice(i, i + 50)) args.push(score, member);
        lines.push(args);
      }
      truncated = total > EXPORT_ELEMENTS;
    } else if (type === 'stream') {
      truncated = true;
    }
    const text = lines.map((args) => args.map(quoteArg).join(' ')).join('\n');
    return { type, ttl, text, lines: lines.length, truncated };
  }

  async exportData(params) {
    const format = params.format === 'json' ? 'json' : 'cmd';
    const scope = params.scope === 'pattern' ? 'pattern' : 'key';
    const stamp = stampNow();
    const keys = [];
    let truncated = false;

    if (scope === 'key') {
      const name = String(params.name || '');
      if (!name) throw new Error('缺少 key');
      const type = replyToText(await this.exec(['TYPE', name]));
      if (type === 'none') throw new Error('key 不存在');
      const commands = await this.exportKeyCommands(name);
      truncated = commands.truncated;
      keys.push({ name, type: commands.type, ttl: commands.ttl, text: commands.text });
    } else {
      const pattern = String(params.pattern || '*');
      let cursor = '0';
      do {
        const parts = array(await this.exec(['SCAN', cursor, 'MATCH', pattern, 'COUNT', '200']));
        cursor = parts[0] ? bulk(parts[0]) : '0';
        for (const name of bulkArray(parts[1] || { type: 'array', value: [] })) {
          if (keys.length >= EXPORT_KEYS) {
            truncated = true;
            break;
          }
          const commands = await this.exportKeyCommands(name);
          if (commands.truncated) truncated = true;
          keys.push({ name, type: commands.type, ttl: commands.ttl, text: commands.text });
        }
      } while (cursor !== '0' && keys.length < EXPORT_KEYS);
    }

    const filename = scope === 'key'
      ? `${sanitizeFileName(params.name)}-${stamp.date}-${stamp.time}.${format === 'json' ? 'json' : 'redis.txt'}`
      : `redis-pattern-${stamp.date}-${stamp.time}.${format === 'json' ? 'json' : 'redis.txt'}`;

    if (format === 'json') {
      const payload = {
        exportedAt: new Date().toISOString(),
        db: this.client ? this.client.db : 0,
        scope,
        pattern: scope === 'pattern' ? String(params.pattern || '*') : undefined,
        truncated,
        keys: keys.map((item) => ({
          name: item.name,
          type: item.type,
          ttl: item.ttl,
          json: parseKeyCommands(item.name, item.text)
        }))
      };
      return { body: JSON.stringify(payload, null, 2), filename, headers: { 'x-webdb-export-keys': String(keys.length), 'x-webdb-export-truncated': truncated ? '1' : '0' } };
    }

    const header = [
      `# Redis dump exported by 沐柠环境盒 at ${new Date().toISOString()}`,
      `# db=${this.client ? this.client.db : 0} keys=${keys.length}${truncated ? ' (truncated)' : ''}`,
      '# 用「导入命令脚本」或 redis-cli --pipe 回放',
      ''
    ].join('\n');
    const body = header + keys.map((item) => item.text).filter(Boolean).join('\n') + '\n';
    return { body, filename, headers: { 'x-webdb-export-keys': String(keys.length), 'x-webdb-export-truncated': truncated ? '1' : '0' } };
  }

  async runImportChunk(session, text) {
    const lines = text.split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      session.executed += 1;
      const index = session.executed;
      const args = splitCommandLine(line);
      if (!args.length) continue;
      try {
        await this.exec(args);
        session.ok += 1;
      } catch (err) {
        session.failed += 1;
        if (session.failedList.length < 50) {
          session.failedList.push({ index, line: line.slice(0, 160), message: err.message || String(err) });
        }
      }
    }
  }

  /* ---------------- 路由 ---------------- */

  async handleField(body) {
    const name = String(body.name || '');
    const type = String(body.type || '');
    const action = String(body.action || '');
    if (!name) throw new Error('缺少 key');
    if (type === 'hash') {
      if (action === 'set') {
        await this.exec(['HSET', name, String(body.field || ''), String(body.value == null ? '' : body.value)]);
      } else if (action === 'del') {
        await this.exec(['HDEL', name, String(body.field || '')]);
      } else {
        throw new Error('不支持的 hash 操作');
      }
      return { changed: 1 };
    }
    if (type === 'list') {
      if (action === 'set') {
        await this.exec(['LSET', name, String(body.index), String(body.value == null ? '' : body.value)]);
        return { changed: 1 };
      }
      if (action === 'push') {
        const cmd = body.side === 'left' ? 'LPUSH' : 'RPUSH';
        await this.exec([cmd, name, String(body.value == null ? '' : body.value)]);
        return { changed: 1 };
      }
      if (action === 'remove') {
        const removed = integer(await this.exec(['LREM', name, '1', String(body.value == null ? '' : body.value)]));
        return { changed: removed };
      }
      throw new Error('不支持的 list 操作');
    }
    if (type === 'set') {
      if (action === 'add') {
        await this.exec(['SADD', name, String(body.value == null ? '' : body.value)]);
        return { changed: 1 };
      }
      if (action === 'remove') {
        const removed = integer(await this.exec(['SREM', name, String(body.value == null ? '' : body.value)]));
        return { changed: removed };
      }
      throw new Error('不支持的 set 操作');
    }
    if (type === 'zset') {
      if (action === 'add') {
        await this.exec(['ZADD', name, String(Number(body.score) || 0), String(body.value == null ? '' : body.value)]);
        return { changed: 1 };
      }
      if (action === 'remove') {
        const removed = integer(await this.exec(['ZREM', name, String(body.value == null ? '' : body.value)]));
        return { changed: removed };
      }
      throw new Error('不支持的 zset 操作');
    }
    throw new Error(`不支持的 key 类型：${type}`);
  }

  async api(req, res, url) {
    const route = url.pathname.replace(/^\/api\//, '');
    try {
      if (route === 'ping') {
        await this.exec(['PING']);
        sendJson(res, 200, { ok: true, data: { pong: Date.now() } });
        return;
      }
      if (route === 'meta') {
        const dbsize = integer(await this.exec(['DBSIZE']));
        let dbs = 16;
        try {
          const parts = array(await this.exec(['CONFIG', 'GET', 'databases']));
          if (parts[1]) dbs = Number(bulk(parts[1])) || 16;
        } catch (err) {
          dbs = 16;
        }
        sendJson(res, 200, { ok: true, data: { ...this.meta, db: this.client ? this.client.db : 0, dbsize, databases: dbs } });
        return;
      }
      if (route === 'select' && req.method === 'POST') {
        const body = await readBody(req);
        const db = Math.max(0, Math.min(Number(body.db) || 0, 1023));
        await this.exec(['SELECT', String(db)]);
        this.client.db = db;
        sendJson(res, 200, { ok: true, data: { db } });
        return;
      }
      if (route === 'keys') {
        const pattern = url.searchParams.get('pattern') || '*';
        const cursor = url.searchParams.get('cursor') || '0';
        const count = Math.min(Math.max(Number(url.searchParams.get('count')) || 200, 10), 500);
        const reply = await this.exec(['SCAN', cursor, 'MATCH', pattern, 'COUNT', String(count)]);
        const parts = array(reply);
        const nextCursor = parts[0] ? bulk(parts[0]) : '0';
        const names = bulkArray(parts[1] || { type: 'array', value: [] });
        const keys = [];
        for (const name of names.slice(0, count)) {
          const type = replyToText(await this.exec(['TYPE', name]));
          const ttl = integer(await this.exec(['TTL', name]));
          keys.push({ name, type, ttl });
        }
        sendJson(res, 200, { ok: true, data: { cursor: nextCursor, keys } });
        return;
      }
      if (route === 'key' && req.method === 'GET') {
        const name = url.searchParams.get('name') || '';
        if (!name) {
          fail(res, 400, '缺少 key');
          return;
        }
        const data = await this.readKey(name, {
          cursor: url.searchParams.get('cursor') || '0',
          offset: url.searchParams.get('offset') || '0',
          count: url.searchParams.get('count') || PAGE_DEFAULT
        });
        sendJson(res, 200, { ok: true, data });
        return;
      }
      if (route === 'key/string' && req.method === 'POST') {
        const body = await readBody(req);
        const name = String(body.name || '');
        if (!name) {
          fail(res, 400, '缺少 key');
          return;
        }
        await this.withTtlKept(name, () => this.exec(['SET', name, String(body.value == null ? '' : body.value)]));
        sendJson(res, 200, { ok: true, data: await this.readKey(name) });
        return;
      }
      if (route === 'key/field' && req.method === 'POST') {
        const body = await readBody(req);
        sendJson(res, 200, { ok: true, data: await this.handleField(body) });
        return;
      }
      if (route === 'key/set' && req.method === 'POST') {
        // 仅用于「新建键」，已存在的键请走 key/string 或 key/field
        const body = await readBody(req);
        const name = String(body.name || '').trim();
        const type = String(body.type || 'string');
        const ttl = Number(body.ttl) || -1;
        if (!name) {
          fail(res, 400, 'key 不能为空');
          return;
        }
        const exists = integer(await this.exec(['EXISTS', name]));
        if (exists) {
          fail(res, 409, 'key 已存在，请用详情页的字段编辑');
          return;
        }
        await this.exec(['DEL', name]);
        const value = body.value;

        if (type === 'string') {
          await this.exec(['SET', name, String(value == null ? '' : value)]);
        } else if (type === 'hash') {
          const pairs = Array.isArray(value) ? value : Object.entries(value || {}).map(([field, v]) => ({ field, value: v }));
          const args = ['HSET', name];
          for (const item of pairs) args.push(String(item.field), String(item.value == null ? '' : item.value));
          if (pairs.length) await this.exec(args);
        } else if (type === 'list') {
          const items = Array.isArray(value) ? value : [];
          if (items.length) await this.exec(['RPUSH', name, ...items.map((v) => String(v == null ? '' : v))]);
        } else if (type === 'set') {
          const items = Array.isArray(value) ? value : [];
          if (items.length) await this.exec(['SADD', name, ...items.map((v) => String(v == null ? '' : v))]);
        } else if (type === 'zset') {
          const items = Array.isArray(value) ? value : [];
          const args = ['ZADD', name];
          for (const item of items) args.push(String(Number(item.score) || 0), String(item.value == null ? '' : item.value));
          if (items.length) await this.exec(args);
        } else {
          fail(res, 400, `不支持的 key 类型：${type}`);
          return;
        }

        if (ttl > 0) await this.exec(['EXPIRE', name, String(ttl)]);
        sendJson(res, 200, { ok: true, data: await this.readKey(name) });
        return;
      }
      if (route === 'key/delete' && req.method === 'POST') {
        const body = await readBody(req);
        const names = (Array.isArray(body.names) ? body.names : [body.name]).filter(Boolean).map(String);
        if (!names.length) {
          fail(res, 400, '缺少 key');
          return;
        }
        const removed = integer(await this.exec(['DEL', ...names]));
        sendJson(res, 200, { ok: true, data: { removed } });
        return;
      }
      if (route === 'key/ttl' && req.method === 'POST') {
        const body = await readBody(req);
        const name = String(body.name || '');
        const ttl = Number(body.ttl);
        if (!name) {
          fail(res, 400, '缺少 key');
          return;
        }
        if (!Number.isFinite(ttl) || ttl <= 0) {
          await this.exec(['PERSIST', name]);
          sendJson(res, 200, { ok: true, data: { ttl: -1 } });
          return;
        }
        await this.exec(['EXPIRE', name, String(Math.floor(ttl))]);
        sendJson(res, 200, { ok: true, data: { ttl: Math.floor(ttl) } });
        return;
      }
      if (route === 'key/rename' && req.method === 'POST') {
        const body = await readBody(req);
        const name = String(body.name || '');
        const newName = String(body.newName || '').trim();
        if (!name || !newName) {
          fail(res, 400, 'key 不能为空');
          return;
        }
        await this.exec(['RENAME', name, newName]);
        sendJson(res, 200, { ok: true, data: { name: newName } });
        return;
      }
      if (route === 'export' && req.method === 'GET') {
        const result = await this.exportData({
          scope: url.searchParams.get('scope') || 'key',
          name: url.searchParams.get('name') || '',
          pattern: url.searchParams.get('pattern') || '*',
          format: url.searchParams.get('format') || 'cmd'
        });
        sendFile(res, 200, result.body, 'text/plain; charset=utf-8', result.filename, result.headers);
        return;
      }
      if (route === 'import/start' && req.method === 'POST') {
        const id = crypto.randomUUID();
        this.imports.set(id, { id, executed: 0, ok: 0, failed: 0, failedList: [], buffer: '', touchedAt: Date.now() });
        sendJson(res, 200, { ok: true, data: { id } });
        return;
      }
      if (route === 'import/chunk' && req.method === 'POST') {
        const body = await readBody(req);
        const session = this.imports.get(String(body.id || ''));
        if (!session) {
          fail(res, 404, '导入会话不存在或已过期');
          return;
        }
        session.touchedAt = Date.now();
        const text = String(body.text || '');
        const combined = session.buffer + text;
        if (body.last) {
          session.buffer = '';
          await this.runImportChunk(session, combined);
          this.imports.delete(session.id);
        } else {
          const cut = combined.lastIndexOf('\n');
          if (cut < 0) {
            session.buffer = combined;
            await this.runImportChunk(session, '');
          } else {
            session.buffer = combined.slice(cut + 1);
            await this.runImportChunk(session, combined.slice(0, cut));
          }
        }
        sendJson(res, 200, {
          ok: true,
          data: {
            executed: session.executed,
            ok: session.ok,
            failed: session.failed,
            finished: Boolean(body.last),
            failedList: session.failedList
          }
        });
        return;
      }
      if (route === 'import/cancel' && req.method === 'POST') {
        const body = await readBody(req);
        const id = String(body.id || '');
        const had = this.imports.delete(id);
        sendJson(res, 200, { ok: true, data: { cancelled: had } });
        return;
      }
      if (route === 'command' && req.method === 'POST') {
        const body = await readBody(req);
        const cmd = (Array.isArray(body.cmd) ? body.cmd : String(body.cmd || '').split(/\s+/))
          .filter((item) => item !== '')
          .map(String);
        if (!cmd.length) {
          fail(res, 400, '命令不能为空');
          return;
        }
        const started = Date.now();
        const reply = await this.exec(cmd);
        sendJson(res, 200, {
          ok: true,
          data: { type: reply.type, value: replyToText(reply), tookMs: Date.now() - started }
        });
        return;
      }
      fail(res, 404, `未知接口：${route}`);
    } catch (err) {
      fail(res, 400, err.message || String(err), err.name === 'RedisError' ? 'REDIS_ERR' : 'ERROR');
    }
  }
}

function sanitizeFileName(name) {
  return String(name || 'redis').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'redis';
}

function parseKeyCommands(name, text) {
  const keys = {};
  const lines = String(text || '').split('\n').filter(Boolean);
  for (const line of lines) {
    const args = splitCommandLine(line);
    if (!args.length) continue;
    const cmd = args[0].toUpperCase();
    if (cmd === 'SET') {
      keys.name = name;
      keys.value = args[2];
    } else if (cmd === 'HSET') {
      for (let i = 2; i < args.length; i += 2) keys[args[i]] = args[i + 1];
    } else if (cmd === 'RPUSH') {
      keys.value = (keys.value || []).concat(args.slice(2));
    } else if (cmd === 'SADD') {
      keys.value = (keys.value || []).concat(args.slice(2));
    } else if (cmd === 'ZADD') {
      const items = [];
      for (let i = 2; i < args.length; i += 2) items.push({ score: Number(args[i]), value: args[i + 1] });
      keys.value = (keys.value || []).concat(items);
    }
  }
  return keys;
}

module.exports = { RedisWebBackend };
