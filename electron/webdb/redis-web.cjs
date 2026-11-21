'use strict';

const { RespClient, replyToText } = require('./resp.cjs');
const { readBody, sendJson, fail } = require('./common.cjs');

function bulk(reply) {
  if (!reply || reply.type !== 'bulk' || reply.value === null) return null;
  return reply.value.toString('utf8');
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

class RedisWebBackend {
  constructor() {
    this.client = null;
    this.meta = null;
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
    if (this.client) {
      const client = this.client;
      this.client = null;
      client.close();
    }
  }

  async exec(args) {
    if (!this.client) throw new Error('Redis 连接未建立');
    return this.client.command(args);
  }

  async readKey(name) {
    const type = replyToText(await this.exec(['TYPE', name]));
    const ttl = integer(await this.exec(['TTL', name]));
    if (type === 'none') return { name, type: 'none', ttl: -2, value: null };

    if (type === 'string') {
      const value = bulk(await this.exec(['GET', name]));
      const length = integer(await this.exec(['STRLEN', name]));
      return { name, type, ttl, length, value: { type: 'string', value } };
    }
    if (type === 'hash') {
      const flat = bulkArray(await this.exec(['HGETALL', name]));
      const items = [];
      for (let i = 0; i < flat.length; i += 2) items.push({ field: flat[i], value: flat[i + 1] });
      return { name, type, ttl, length: integer(await this.exec(['HLEN', name])), value: { type: 'hash', value: items } };
    }
    if (type === 'list') {
      const values = bulkArray(await this.exec(['LRANGE', name, '0', '999']));
      return {
        name,
        type,
        ttl,
        length: integer(await this.exec(['LLEN', name])),
        value: { type: 'list', value: values.map((value, index) => ({ index, value })) }
      };
    }
    if (type === 'set') {
      const members = bulkArray(await this.exec(['SMEMBERS', name]));
      return {
        name,
        type,
        ttl,
        length: integer(await this.exec(['SCARD', name])),
        value: { type: 'set', value: members.slice(0, 1000).map((value) => ({ value })) }
      };
    }
    if (type === 'zset') {
      const flat = bulkArray(await this.exec(['ZRANGE', name, '0', '999', 'WITHSCORES']));
      const items = [];
      for (let i = 0; i < flat.length; i += 2) items.push({ value: flat[i], score: Number(flat[i + 1]) });
      return { name, type, ttl, length: integer(await this.exec(['ZCARD', name])), value: { type: 'zset', value: items } };
    }
    if (type === 'stream') {
      const rows = array(await this.exec(['XRANGE', name, '-', '+', 'COUNT', '100']));
      const items = rows.map((row) => {
        const pair = array(row);
        const id = pair[0] ? bulk(pair[0]) : '';
        const fields = bulkArray(pair[1] || { type: 'array', value: [] });
        const entries = [];
        for (let i = 0; i < fields.length; i += 2) entries.push({ field: fields[i], value: fields[i + 1] });
        return { id, fields: entries };
      });
      return { name, type, ttl, length: integer(await this.exec(['XLEN', name])), value: { type: 'stream', value: items } };
    }
    return { name, type, ttl, length: 0, value: { type, value: null } };
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
        sendJson(res, 200, { ok: true, data: await this.readKey(name) });
        return;
      }
      if (route === 'key/set' && req.method === 'POST') {
        const body = await readBody(req);
        const name = String(body.name || '').trim();
        const type = String(body.type || 'string');
        const ttl = Number(body.ttl) || -1;
        if (!name) {
          fail(res, 400, 'key 不能为空');
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

module.exports = { RedisWebBackend };
