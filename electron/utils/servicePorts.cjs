/**
 * 用户自定义的服务端口。
 *
 * 服务类环境（MySQL / Redis / Nginx）必须绑定一个固定端口，不再「被占用就自动顺延」。
 * 这里只负责持久化用户选定的端口，可用性由 utils/port.cjs 负责校验。
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_PORTS = {
    mysql: 3306,
    redis: 6379,
    nginx: 80,
};

const FILE_NAME = 'service-ports.json';

function fileOf(userDataPath) {
    return path.join(userDataPath, FILE_NAME);
}

function readAll(userDataPath) {
    try {
        const raw = fs.readFileSync(fileOf(userDataPath), 'utf8');
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : {};
    } catch (err) {
        return {};
    }
}

function writeAll(userDataPath, data) {
    const target = fileOf(userDataPath);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, JSON.stringify(data, null, 2), 'utf8');
}

/** 带版本号时按版本存（mysql@8.0），不带版本时按工具存 */
function storageKey(tool, version) {
    return version ? `${tool}@${version}` : tool;
}

function defaultPortOf(tool, version) {
    if (tool === 'mysql') {
        if (version === '5.7') return 3306;
        if (version === '8.0') return 3307;
        if (version === '9.0') return 3308;
    }
    return DEFAULT_PORTS[tool] || null;
}

function getPort(userDataPath, tool, version) {
    const data = readAll(userDataPath);
    const stored = Number(data[storageKey(tool, version)]);
    if (Number.isInteger(stored) && stored > 0 && stored <= 65535) return stored;
    const legacy = Number(data[tool]);
    if (Number.isInteger(legacy) && legacy > 0 && legacy <= 65535) return legacy;
    return defaultPortOf(tool, version);
}

function isValidPort(port) {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function setPort(userDataPath, tool, version, port) {
    const numeric = Number(port);
    if (!isValidPort(numeric)) {
        return {success: false, message: '端口必须是 1 - 65535 之间的整数'};
    }
    if (numeric < 1024) {
        return {success: false, message: `端口 ${numeric} 属于系统保留端口（1-1023），建议换一个 1024 以上的`};
    }
    const data = readAll(userDataPath);
    data[storageKey(tool, version)] = numeric;
    if (version) delete data[tool];
    writeAll(userDataPath, data);
    return {success: true, port: numeric};
}

module.exports = {
    DEFAULT_PORTS,
    defaultPortOf,
    getPort,
    setPort,
    isValidPort,
    storageKey,
};
