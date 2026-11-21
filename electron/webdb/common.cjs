'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-webdb-token',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS'
  });
  res.end(body);
}

function fail(res, status, message, code) {
  sendJson(res, status, { ok: false, error: { message, code: code || 'ERR' } });
}

/** 以文件形式返回内容（导出用），filename 支持中文，同时带 ASCII fallback */
function sendFile(res, status, body, contentType, filename, extraHeaders) {
  const encoded = encodeURIComponent(filename);
  const headers = Object.assign(
    {
      'content-type': contentType,
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
      'content-disposition': `attachment; filename="export"; filename*=UTF-8''${encoded}`,
      'access-control-allow-origin': '*',
      'access-control-expose-headers': 'content-disposition, x-webdb-export-rows, x-webdb-export-truncated'
    },
    extraHeaders || {}
  );
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, assetsDir, urlPath) {
  const relative = decodeURIComponent(urlPath === '/' ? '/index.html' : urlPath);
  const target = path.resolve(assetsDir, `.${relative}`);
  if (!target.startsWith(path.resolve(assetsDir))) {
    fail(res, 403, '非法路径');
    return;
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      fail(res, 404, '页面不存在');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(data);
  });
}

function createToken() {
  return crypto.randomBytes(18).toString('hex');
}

/**
 * 统一的 HTTP 外壳：静态页面 + 需要令牌的 /api/*。
 */
function createWebApp({ assetsDir, token, api }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type, x-webdb-token',
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS'
        });
        res.end();
        return;
      }

      if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.pathname.startsWith('/api/')) {
        const provided = String(req.headers['x-webdb-token'] || url.searchParams.get('t') || '');
        if (!token || provided !== token) {
          fail(res, 401, '访问令牌无效，请从环境盒重新打开这个页面');
          return;
        }
        await api(req, res, url);
        return;
      }

      serveStatic(res, assetsDir, url.pathname);
    } catch (err) {
      fail(res, 500, err.message || String(err));
    }
  });
}

module.exports = { createWebApp, createToken, readBody, sendJson, sendFile, fail, serveStatic };
