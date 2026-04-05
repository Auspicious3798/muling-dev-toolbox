const fs = require('fs');
const path = require('path');

let configCache = null;
let configPath = null;

/**
 * 初始化配置文件
 */
function initConfig(userDataPath) {
    configPath = path.join(userDataPath, 'downloads.json');
    console.log('[Config] 用户数据目录:', userDataPath);
    console.log('[Config] 配置文件路径:', configPath);
    
    // 如果配置文件不存在，从默认配置复制
    if (!fs.existsSync(configPath)) {
        const defaultConfigPath = path.join(__dirname, '..', 'config', 'downloads.json');
        console.log('[Config] 默认配置文件路径:', defaultConfigPath);
        console.log('[Config] 默认配置文件存在:', fs.existsSync(defaultConfigPath));
        if (fs.existsSync(defaultConfigPath)) {
            try {
                const defaultConfig = fs.readFileSync(defaultConfigPath, 'utf-8');
                fs.writeFileSync(configPath, defaultConfig, 'utf-8');
                console.log('[Config] 已创建默认配置文件');
            } catch (err) {
                console.error('[Config] 创建默认配置文件失败:', err);
            }
        }
    } else {
        console.log('[Config] 配置文件已存在，跳过创建');
    }
    
    // 加载配置
    loadConfig();
}

/**
 * 加载配置文件
 */
function loadConfig() {
    try {
        if (!fs.existsSync(configPath)) {
            console.error('[Config] 配置文件不存在:', configPath);
            return null;
        }
        
        const content = fs.readFileSync(configPath, 'utf-8');
        configCache = JSON.parse(content);
        console.log('[Config] 配置文件加载成功');
        console.log('[Config] 当前镜像:', configCache.currentMirror);
        console.log('[Config] 可用工具:', Object.keys(configCache.tools || {}).join(', '));
        if (configCache.tools && configCache.tools.jdk) {
            console.log('[Config] JDK 版本:', Object.keys(configCache.tools.jdk.versions || {}).join(', '));
        }
        return configCache;
    } catch (err) {
        console.error('[Config] 加载配置文件失败:', err.message);
        // 如果解析失败，尝试使用内置默认配置
        try {
            const defaultConfigPath = path.join(__dirname, '..', 'config', 'downloads.json');
            if (fs.existsSync(defaultConfigPath)) {
                const defaultContent = fs.readFileSync(defaultConfigPath, 'utf-8');
                configCache = JSON.parse(defaultContent);
                console.log('[Config] 使用内置默认配置');
                return configCache;
            }
        } catch (e) {
            console.error('[Config] 加载内置默认配置也失败:', e.message);
        }
        return null;
    }
}

/**
 * 保存配置文件
 */
function saveConfig() {
    try {
        if (!configCache || !configPath) {
            console.error('[Config] 配置未初始化');
            return false;
        }
        
        const content = JSON.stringify(configCache, null, 2);
        fs.writeFileSync(configPath, content, 'utf-8');
        console.log('[Config] 配置文件保存成功');
        return true;
    } catch (err) {
        console.error('[Config] 保存配置文件失败:', err.message);
        return false;
    }
}

/**
 * 获取完整配置
 */
function getConfig() {
    if (!configCache) {
        loadConfig();
    }
    return configCache;
}

/**
 * 获取当前镜像 URL
 */
function getCurrentMirror() {
    const config = getConfig();
    return config ? config.currentMirror : '';
}

/**
 * 设置当前镜像
 */
function setCurrentMirror(mirrorUrl) {
    const config = getConfig();
    if (!config) return false;
    
    // 验证镜像 URL 是否在列表中
    const mirrorExists = config.mirrors.some(m => m.url === mirrorUrl);
    if (!mirrorExists) {
        console.error('[Config] 无效的镜像 URL:', mirrorUrl);
        return false;
    }
    
    config.currentMirror = mirrorUrl;
    return saveConfig();
}

/**
 * 获取所有可用镜像
 */
function getMirrors() {
    const config = getConfig();
    console.log('[Config] getMirrors 被调用');
    console.log('[Config] config 对象:', config ? '存在' : 'null');
    if (config) {
        console.log('[Config] config.mirrors:', config.mirrors);
        console.log('[Config] config.mirrors 类型:', typeof config.mirrors);
        console.log('[Config] config.mirrors 是否为数组:', Array.isArray(config.mirrors));
    }
    const mirrors = config && config.mirrors ? config.mirrors : [];
    console.log('[Config] 返回的 mirrors:', mirrors);
    return mirrors;
}

/**
 * 替换 URL 中的 {mirror} 占位符
 */
function resolveUrl(urlTemplate) {
    const mirror = getCurrentMirror();
    return urlTemplate.replace('{mirror}', mirror);
}

/**
 * 获取工具的下载配置
 */
function getToolConfig(toolName, version = null) {
    const config = getConfig();
    if (!config || !config.tools || !config.tools[toolName]) {
        return null;
    }
    
    const toolConfig = config.tools[toolName];
    
    if (version && toolConfig.versions) {
        const versionConfig = toolConfig.versions[version];
        if (!versionConfig) {
            return null;
        }
        
        return {
            ...versionConfig,
            url: resolveUrl(versionConfig.url),
            baseDir: toolConfig.baseDir || toolConfig.installDir
        };
    }
    
    // 返回整个工具配置（如 Maven）
    if (toolConfig.url) {
        return {
            ...toolConfig,
            url: resolveUrl(toolConfig.url)
        };
    }
    
    return toolConfig;
}

/**
 * 添加新版本到配置
 */
function addVersion(toolName, version, versionConfig) {
    const config = getConfig();
    if (!config || !config.tools || !config.tools[toolName]) {
        return false;
    }
    
    if (!config.tools[toolName].versions) {
        config.tools[toolName].versions = {};
    }
    
    config.tools[toolName].versions[version] = versionConfig;
    return saveConfig();
}

module.exports = {
    initConfig,
    loadConfig,
    saveConfig,
    getConfig,
    getCurrentMirror,
    setCurrentMirror,
    getMirrors,
    resolveUrl,
    getToolConfig,
    addVersion
};
