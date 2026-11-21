const http = require('http');
const crypto = require('crypto');
const {URL} = require('url');

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = {name: 'muling-toolbox', title: '沐柠环境盒 MCP', version: '1.0.0'};
const MAX_BODY = 2 * 1024 * 1024;

function safeEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function clientName(req) {
    const custom = req.headers['x-mcp-client'];
    if (custom) return String(custom).slice(0, 64);
    const ua = req.headers['user-agent'] || '';
    if (!ua) return '未知客户端';
    return String(ua).slice(0, 64);
}

function rpcError(id, code, message) {
    return {jsonrpc: '2.0', id: id === undefined ? null : id, error: {code, message}};
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(new Error('请求体过大'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}

function createServer(options) {
    const {getConfig, activity, tools} = options;
    let httpServer = null;
    let startedAt = 0;
    let lastError = '';
    let port = 0;
    const activityBroadcast = typeof options.onActivity === 'function' ? options.onActivity : () => {};

    const corsHeaders = (req) => {
        const origin = req.headers.origin || '';
        const allowOrigin = origin || '*';
        return {
            'Access-Control-Allow-Origin': allowOrigin,
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, X-Mcp-Client',
            'Access-Control-Max-Age': '600',
            'Vary': 'Origin',
        };
    };

    const send = (req, res, code, payload, extra = {}) => {
        const body = payload === null ? '' : JSON.stringify(payload);
        res.writeHead(code, Object.assign({
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body),
        }, corsHeaders(req), extra));
        res.end(body);
    };

    const authorized = (req) => {
        const cfg = getConfig();
        if (!cfg || !cfg.token) return false;
        const header = req.headers.authorization || '';
        if (header.toLowerCase().startsWith('bearer ')) {
            return safeEqual(header.slice(7).trim(), cfg.token);
        }
        if (req.headers['x-api-key']) {
            return safeEqual(String(req.headers['x-api-key']).trim(), cfg.token);
        }
        try {
            const url = new URL(req.url, 'http://127.0.0.1');
            const token = url.searchParams.get('token');
            if (token) return safeEqual(token, cfg.token);
        } catch (err) {
            // ignore
        }
        return false;
    };

    async function callTool(name, args, client) {
        const startedAtMs = Date.now();
        const result = await tools.execute(name, args, {config: getConfig(), callRenderer: options.callRenderer});
        const entry = {
            ts: startedAtMs,
            tool: name,
            ok: !result.isError,
            ms: Date.now() - startedAtMs,
            client,
            summary: result.summary || '',
            error: result.isError ? String(result.text).slice(0, 200) : '',
        };
        const saved = activity ? activity.record(entry) : entry;
        activityBroadcast(saved);
        return result;
    }

    async function handleMessage(msg, client) {
        if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
            return rpcError(msg && msg.id, -32600, 'Invalid Request');
        }
        const hasId = Object.prototype.hasOwnProperty.call(msg, 'id');
        const method = String(msg.method || '');
        const params = msg.params && typeof msg.params === 'object' ? msg.params : {};
        try {
            if (method === 'initialize') {
                const requested = params.protocolVersion;
                const version = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
                return {
                    jsonrpc: '2.0',
                    id: msg.id,
                    result: {
                        protocolVersion: version,
                        capabilities: {tools: {listChanged: true}},
                        serverInfo: SERVER_INFO,
                        instructions: '这是沐柠环境盒（本地开发环境管理器）的 MCP 接口。用它查看已安装的 JDK / Python / Node.js / MySQL / Redis / Nginx 等工具，启停服务，或在本机沙箱环境里执行验证命令。',
                    },
                };
            }
            if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
                return null;
            }
            if (method === 'ping') {
                return {jsonrpc: '2.0', id: msg.id, result: {}};
            }
            if (method === 'tools/list') {
                return {jsonrpc: '2.0', id: msg.id, result: {tools: tools.list()}};
            }
            if (method === 'tools/call') {
                const name = String(params.name || '');
                const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
                if (!name) {
                    return rpcError(msg.id, -32602, '缺少工具名 name');
                }
                const result = await callTool(name, args, client);
                return {
                    jsonrpc: '2.0',
                    id: msg.id,
                    result: {
                        content: [{type: 'text', text: String(result.text || '')}],
                        isError: Boolean(result.isError),
                    },
                };
            }
            if (!hasId) return null;
            return rpcError(msg.id, -32601, `不支持的方法：${method}`);
        } catch (err) {
            if (!hasId) return null;
            return rpcError(msg.id, -32603, err && err.message ? err.message : String(err));
        }
    }

    async function handlePost(req, res) {
        if (!authorized(req)) {
            send(req, res, 401, {jsonrpc: '2.0', id: null, error: {code: -32001, message: '令牌无效或缺失，请在 Authorization: Bearer <token> 里带上插件里的令牌'}}, {
                'WWW-Authenticate': 'Bearer realm="muling-toolbox"',
            });
            return;
        }
        let text = '';
        try {
            text = await readBody(req);
        } catch (err) {
            send(req, res, 413, {jsonrpc: '2.0', id: null, error: {code: -32700, message: err.message}});
            return;
        }
        let payload;
        try {
            payload = JSON.parse(text);
        } catch (err) {
            send(req, res, 400, {jsonrpc: '2.0', id: null, error: {code: -32700, message: 'JSON 解析失败'}});
            return;
        }
        const client = clientName(req);
        if (Array.isArray(payload)) {
            if (payload.length === 0) {
                send(req, res, 400, {jsonrpc: '2.0', id: null, error: {code: -32600, message: '空批次'}});
                return;
            }
            const results = [];
            for (const msg of payload) {
                const result = await handleMessage(msg, client);
                if (result) results.push(result);
            }
            if (results.length === 0) {
                res.writeHead(202, corsHeaders(req));
                res.end();
                return;
            }
            send(req, res, 200, results);
            return;
        }
        const result = await handleMessage(payload, client);
        if (!result) {
            res.writeHead(202, corsHeaders(req));
            res.end();
            return;
        }
        send(req, res, 200, result);
    }

    const requestHandler = (req, res) => {
        let pathname = '/';
        try {
            pathname = new URL(req.url, 'http://127.0.0.1').pathname;
        } catch (err) {
            pathname = '/';
        }
        if (req.method === 'OPTIONS') {
            res.writeHead(204, corsHeaders(req));
            res.end();
            return;
        }
        if (pathname === '/' && req.method === 'GET') {
            const cfg = getConfig();
            send(req, res, 200, {
                name: SERVER_INFO.name,
                title: SERVER_INFO.title,
                version: SERVER_INFO.version,
                endpoint: '/mcp',
                port,
                tools: tools.list().map((tool) => tool.name),
                note: 'POST /mcp 需要 Authorization: Bearer <token>，令牌在环境盒「MCP 控制中枢」里查看。',
            });
            return;
        }
        if (pathname === '/mcp' && req.method === 'POST') {
            handlePost(req, res).catch((err) => {
                lastError = err.message;
                if (!res.headersSent) {
                    send(req, res, 500, {jsonrpc: '2.0', id: null, error: {code: -32603, message: err.message}});
                } else {
                    res.end();
                }
            });
            return;
        }
        if (pathname === '/mcp') {
            send(req, res, 405, {jsonrpc: '2.0', id: null, error: {code: -32000, message: '只支持 POST /mcp（Streamable HTTP）；SSE 长连接未启用'}}, {Allow: 'POST, OPTIONS'});
            return;
        }
        send(req, res, 404, {error: 'Not Found', hint: 'MCP 端点是 POST /mcp'});
    };

    function status() {
        const cfg = getConfig();
        return {
            running: Boolean(httpServer && httpServer.listening),
            port: port || (cfg && cfg.port) || 0,
            host: '127.0.0.1',
            url: `http://127.0.0.1:${port || (cfg && cfg.port) || 0}/mcp`,
            startedAt,
            uptimeMs: startedAt ? Date.now() - startedAt : 0,
            error: lastError,
            tools: tools.list().length,
        };
    }

    function start() {
        return new Promise((resolve, reject) => {
            if (httpServer && httpServer.listening) {
                resolve(status());
                return;
            }
            const cfg = getConfig();
            port = cfg.port;
            lastError = '';
            const server = http.createServer(requestHandler);
            server.on('clientError', (err, socket) => {
                try {
                    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
                } catch (e) {
                    // ignore
                }
            });
            const onError = (err) => {
                lastError = err && err.code === 'EADDRINUSE'
                    ? `端口 ${port} 已被占用，换一个端口再试`
                    : (err && err.message ? err.message : '启动失败');
                try {
                    server.close();
                } catch (e) {
                    // ignore
                }
                httpServer = null;
                reject(new Error(lastError));
            };
            server.once('error', onError);
            server.listen(port, '127.0.0.1', () => {
                server.removeListener('error', onError);
                server.on('error', (err) => {
                    lastError = err.message;
                });
                httpServer = server;
                startedAt = Date.now();
                resolve(status());
            });
        });
    }

    function stop() {
        return new Promise((resolve) => {
            if (!httpServer) {
                startedAt = 0;
                resolve(status());
                return;
            }
            const server = httpServer;
            httpServer = null;
            startedAt = 0;
            server.close(() => resolve(status()));
            setTimeout(() => resolve(status()), 1500);
        });
    }

    return {start, stop, status};
}

module.exports = {createServer, PROTOCOL_VERSIONS, SERVER_INFO};
