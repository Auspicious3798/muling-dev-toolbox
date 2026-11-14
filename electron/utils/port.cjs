const net = require('net');

function tryListen(port, host) {
    return new Promise((resolve) => {
        const server = net.createServer();
        let settled = false;
        const finish = (available) => {
            if (settled) return;
            settled = true;
            try {
                server.close();
            } catch (err) {
            }
            resolve(available);
        };
        server.unref();
        server.once('error', () => finish(false));
        server.once('listening', () => finish(true));
        try {
            server.listen({port, host, exclusive: true});
        } catch (err) {
            finish(false);
        }
    });
}

function tryConnect(port, host) {
    return new Promise((resolve) => {
        const socket = net.connect({port, host});
        let settled = false;
        const finish = (reachable) => {
            if (settled) return;
            settled = true;
            try {
                socket.destroy();
            } catch (err) {
            }
            resolve(reachable);
        };
        socket.setTimeout(600);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
    });
}

async function isPortAvailable(port) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
    const [ipv4, ipv6] = await Promise.all([
        tryListen(port, '0.0.0.0'),
        tryListen(port, '::'),
    ]);
    if (!ipv4 || !ipv6) return false;
    const [v4Reachable, v6Reachable] = await Promise.all([
        tryConnect(port, '127.0.0.1'),
        tryConnect(port, '::1'),
    ]);
    return !v4Reachable && !v6Reachable;
}

async function isPortInUse(port) {
    return !(await isPortAvailable(port));
}

async function findAvailablePort(startPort, options = {}) {
    const begin = Number.isInteger(startPort) ? startPort : 80;
    const maxTries = Number.isInteger(options.maxTries) ? options.maxTries : 200;
    const limit = options.maxPort || 65535;
    for (let offset = 0; offset < maxTries; offset++) {
        const candidate = begin + offset;
        if (candidate > limit) break;
        if (await isPortAvailable(candidate)) return candidate;
    }
    return null;
}

async function resolvePort(requestedPort, options = {}) {
    const base = Number.isInteger(requestedPort) ? requestedPort : options.defaultPort;
    if (!Number.isInteger(base)) return {port: null, changed: false, error: '端口无效'};
    if (await isPortAvailable(base)) return {port: base, changed: false};
    if (options.strict) {
        return {port: null, changed: false, error: `端口 ${base} 已被占用，请选择其他端口`};
    }
    const found = await findAvailablePort(base, options);
    if (found === null) {
        return {port: null, changed: false, error: `从 ${base} 起没有找到可用端口`};
    }
    return {port: found, changed: true, original: base};
}

module.exports = {
    isPortAvailable,
    isPortInUse,
    findAvailablePort,
    resolvePort,
};
