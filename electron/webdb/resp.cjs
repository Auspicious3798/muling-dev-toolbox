'use strict';

/**
 * 极简 RESP2 客户端：只服务内置 Web Redis 控制台（局域网回环、单连接、命令级超时）。
 * 不引入 redis 依赖，避免 ESM/CJS 互通和额外打包体积。
 */
const net = require('net');

class RedisError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RedisError';
  }
}

function encodeCommand(args) {
  const chunks = [Buffer.from(`*${args.length}\r\n`, 'utf8')];
  for (const arg of args) {
    const buf = Buffer.from(String(arg), 'utf8');
    chunks.push(Buffer.from(`$${buf.length}\r\n`, 'utf8'), buf, Buffer.from('\r\n', 'utf8'));
  }
  return Buffer.concat(chunks);
}

function tryParse(buf, offset) {
  if (offset >= buf.length) return null;
  const type = String.fromCharCode(buf[offset]);
  const lineEnd = buf.indexOf('\r\n', offset + 1);
  if (lineEnd === -1) return null;
  const line = buf.slice(offset + 1, lineEnd).toString('utf8');

  if (type === '+') return { reply: { type: 'status', value: line }, end: lineEnd + 2 };
  if (type === '-') return { reply: { type: 'error', value: line }, end: lineEnd + 2 };
  if (type === ':') return { reply: { type: 'integer', value: Number(line) }, end: lineEnd + 2 };
  if (type === '_') return { reply: { type: 'null', value: null }, end: lineEnd + 2 };
  if (type === ',') return { reply: { type: 'double', value: Number(line) }, end: lineEnd + 2 };
  if (type === '#') return { reply: { type: 'boolean', value: line === 't' }, end: lineEnd + 2 };

  if (type === '$') {
    const len = Number(line);
    if (len === -1) return { reply: { type: 'bulk', value: null }, end: lineEnd + 2 };
    const start = lineEnd + 2;
    if (buf.length < start + len + 2) return null;
    return { reply: { type: 'bulk', value: buf.slice(start, start + len) }, end: start + len + 2 };
  }

  if (type === '*' || type === '~' || type === '>') {
    const count = Number(line);
    if (count === -1) return { reply: { type: 'array', value: null }, end: lineEnd + 2 };
    let pos = lineEnd + 2;
    const items = [];
    for (let i = 0; i < count; i += 1) {
      const item = tryParse(buf, pos);
      if (!item) return null;
      items.push(item.reply);
      pos = item.end;
    }
    return { reply: { type: 'array', value: items }, end: pos };
  }

  // 未知类型直接吞掉这一行，避免卡死
  return { reply: { type: 'error', value: `unsupported reply type "${type}"` }, end: lineEnd + 2 };
}

class RespClient {
  constructor({ host = '127.0.0.1', port = 6379, password = '', db = 0, timeout = 8000 } = {}) {
    this.host = host;
    this.port = port;
    this.password = password || '';
    this.db = db || 0;
    this.timeout = timeout;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = [];
    this.connected = false;
    this.lastError = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      this.socket = socket;
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        this.connected = false;
        this.lastError = err.message;
        socket.destroy();
        reject(err);
      };

      socket.setNoDelay(true);
      socket.setTimeout(this.timeout, () => fail(new RedisError(`连接 Redis 超时（${this.host}:${this.port}）`)));
      socket.once('error', (err) => fail(new RedisError(err.code === 'ECONNREFUSED'
        ? `Redis 没有在 ${this.host}:${this.port} 监听，先在环境盒里启动服务`
        : err.message)));
      socket.once('connect', async () => {
        socket.setTimeout(0);
        try {
          if (this.password) await this.command(['AUTH', this.password]);
          if (this.db) await this.command(['SELECT', String(this.db)]);
          settled = true;
          this.connected = true;
          resolve(this);
        } catch (err) {
          fail(err instanceof RedisError ? err : new RedisError(err.message));
        }
      });
      socket.on('data', (chunk) => {
        this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
        this.flush();
      });
      socket.on('close', () => {
        this.connected = false;
        while (this.pending.length) {
          const item = this.pending.shift();
          clearTimeout(item.timer);
          item.reject(new RedisError('Redis 连接已断开'));
        }
      });
    });
  }

  flush() {
    while (this.pending.length) {
      const parsed = tryParse(this.buffer, 0);
      if (!parsed) return;
      this.buffer = this.buffer.slice(parsed.end);
      const item = this.pending.shift();
      clearTimeout(item.timer);
      if (parsed.reply.type === 'error') item.reject(new RedisError(parsed.reply.value));
      else item.resolve(parsed.reply);
    }
  }

  command(args) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new RedisError('Redis 连接不可用'));
        return;
      }
      const timer = setTimeout(() => {
        const idx = this.pending.findIndex((p) => p.timer === timer);
        if (idx >= 0) this.pending.splice(idx, 1);
        reject(new RedisError(`命令超时：${args[0]}`));
      }, this.timeout);
      this.pending.push({ resolve, reject, timer });
      this.socket.write(encodeCommand(args));
    });
  }

  async exec(args) {
    return this.command(args);
  }

  close() {
    if (this.socket) this.socket.destroy();
    this.socket = null;
    this.connected = false;
  }
}

function replyToText(reply) {
  if (!reply) return '(nil)';
  switch (reply.type) {
    case 'status': return reply.value;
    case 'bulk': return reply.value === null ? '(nil)' : reply.value.toString('utf8');
    case 'integer': return String(reply.value);
    case 'double': return String(reply.value);
    case 'boolean': return reply.value ? 'true' : 'false';
    case 'null': return '(nil)';
    case 'array': {
      if (reply.value === null) return '(nil)';
      if (!reply.value.length) return '(empty array)';
      return reply.value.map((item, idx) => `${idx + 1}) ${replyToText(item)}`).join('\n');
    }
    default: return String(reply.value);
  }
}

module.exports = { RespClient, RedisError, replyToText, encodeCommand };
