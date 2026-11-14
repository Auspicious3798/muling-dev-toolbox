const fs = require('fs');
const path = require('path');
const assetBase = require('./utils/assetBase.cjs');

let configCache = null;
let configPath = null;

function normalizeUrl(url) {
    if (typeof url !== 'string') return url;
    return url.replace(/^\{mirror\}/, '');
}

/**
 * 把所有下载地址统一过一遍基址解析：
 * 指向官方桶的绝对地址可被 MULING_ASSET_BASE / assetBase 改写到自建源。
 * 不修改磁盘上的配置文件，只在内存里替换。
 */
function applyAssetBase(config) {
    if (!config) return config;
    assetBase.init(config);

    const rewrite = (entry) => {
        if (entry && typeof entry.url === 'string') {
            entry.url = assetBase.resolve(entry.url);
        }
    };

    const tools = config.tools || {};
    Object.keys(tools).forEach((name) => {
        const tool = tools[name];
        if (!tool) return;
        rewrite(tool);
        const versions = tool.versions || {};
        Object.keys(versions).forEach((v) => rewrite(versions[v]));
    });

    return config;
}

function initConfig(userDataPath) {
    configPath = path.join(userDataPath, 'downloads.json');

    let defaultConfigPath;
    if (process.env.NODE_ENV === 'development') {
        defaultConfigPath = path.join(__dirname, '..', 'config', 'downloads.json');
    } else {
        defaultConfigPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'config', 'downloads.json');
    }

    if (process.env.NODE_ENV === 'development' && fs.existsSync(defaultConfigPath)) {
        try {
            const sourceContent = fs.readFileSync(defaultConfigPath, 'utf-8');
            fs.writeFileSync(configPath, sourceContent, 'utf-8');
            console.log('[Config] 已同步源码配置到用户目录');
        } catch (err) {
            console.error('[Config] 同步配置失败:', err.message);
        }
    } else if (!fs.existsSync(configPath) && fs.existsSync(defaultConfigPath)) {
        try {
            fs.copyFileSync(defaultConfigPath, configPath);
            console.log('[Config] 已创建初始配置文件');
        } catch (err) {
            console.error('[Config] 创建配置文件失败:', err.message);
        }
    }

    loadConfig();
}

function loadConfig() {
    try {
        if (!fs.existsSync(configPath)) {
            console.error('[Config] 配置文件不存在:', configPath);
            return null;
        }
        configCache = applyAssetBase(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
        console.log('[Config] 配置加载成功，工具:', Object.keys(configCache.tools || {}).join(', '));
        return configCache;
    } catch (err) {
        console.error('[Config] 加载配置失败:', err.message);
        try {
            const fallback = process.resourcesPath
                ? path.join(process.resourcesPath, 'app.asar.unpacked', 'config', 'downloads.json')
                : path.join(__dirname, '..', 'config', 'downloads.json');
            if (fs.existsSync(fallback)) {
                configCache = applyAssetBase(JSON.parse(fs.readFileSync(fallback, 'utf-8')));
                return configCache;
            }
        } catch (e) {
            console.error('[Config] 加载内置配置失败:', e.message);
        }
        return null;
    }
}

function saveConfig() {
    try {
        if (!configCache || !configPath) return false;
        fs.writeFileSync(configPath, JSON.stringify(configCache, null, 2), 'utf-8');
        return true;
    } catch (err) {
        console.error('[Config] 保存配置失败:', err.message);
        return false;
    }
}

function getConfig() {
    if (!configCache) loadConfig();
    return configCache;
}

function getFallbackHosts() {
    const config = getConfig();
    const hosts = config && Array.isArray(config.fallbackHosts) ? config.fallbackHosts : [];
    return hosts.filter((host) => typeof host === 'string' && host.trim().length > 0).map((host) => host.trim());
}

function getToolConfig(toolName, version = null) {
    const config = getConfig();
    if (!config || !config.tools || !config.tools[toolName]) return null;

    const toolConfig = config.tools[toolName];

    if (version && toolConfig.versions) {
        const versionConfig = toolConfig.versions[version];
        if (!versionConfig) return null;
        return {
            ...versionConfig,
            url: normalizeUrl(versionConfig.url),
        };
    }

    if (toolConfig.url) {
        return {
            ...toolConfig,
            url: normalizeUrl(toolConfig.url),
        };
    }

    return toolConfig;
}

function addVersion(toolName, version, versionConfig) {
    const config = getConfig();
    if (!config || !config.tools || !config.tools[toolName]) return false;
    if (!config.tools[toolName].versions) config.tools[toolName].versions = {};
    config.tools[toolName].versions[version] = versionConfig;
    return saveConfig();
}

module.exports = {
    initConfig,
    loadConfig,
    saveConfig,
    getConfig,
    normalizeUrl,
    getToolConfig,
    getFallbackHosts,
    addVersion,
};
