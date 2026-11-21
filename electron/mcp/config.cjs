const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULTS = {
    port: 15801,
    host: '127.0.0.1',
    token: '',
    autoStart: true,
    allowCommands: true,
    commandTimeout: 30000,
};

function configDir(userData) {
    return path.join(userData, 'mcp');
}

function configPath(userData) {
    return path.join(configDir(userData), 'config.json');
}

function newToken() {
    return 'mc_' + crypto.randomBytes(18).toString('hex');
}

function normalize(raw, userData) {
    const cfg = Object.assign({}, DEFAULTS, raw && typeof raw === 'object' ? raw : {});
    let changed = false;
    if (!cfg.token || typeof cfg.token !== 'string') {
        cfg.token = newToken();
        changed = true;
    }
    const port = Number(cfg.port);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        cfg.port = DEFAULTS.port;
        changed = true;
    } else {
        cfg.port = port;
    }
    if (typeof cfg.autoStart !== 'boolean') {
        cfg.autoStart = DEFAULTS.autoStart;
        changed = true;
    }
    if (typeof cfg.allowCommands !== 'boolean') {
        cfg.allowCommands = DEFAULTS.allowCommands;
        changed = true;
    }
    const timeout = Number(cfg.commandTimeout);
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) {
        cfg.commandTimeout = DEFAULTS.commandTimeout;
        changed = true;
    } else {
        cfg.commandTimeout = timeout;
    }
    cfg.host = DEFAULTS.host;
    if (changed) save(userData, cfg);
    return cfg;
}

function load(userData) {
    let raw = {};
    try {
        raw = JSON.parse(fs.readFileSync(configPath(userData), 'utf8'));
    } catch (err) {
        raw = {};
    }
    return normalize(raw, userData);
}

function save(userData, cfg) {
    try {
        fs.mkdirSync(configDir(userData), {recursive: true});
        fs.writeFileSync(configPath(userData), JSON.stringify(cfg, null, 2), 'utf8');
        return true;
    } catch (err) {
        return false;
    }
}

module.exports = {DEFAULTS, load, save, newToken, configPath};
