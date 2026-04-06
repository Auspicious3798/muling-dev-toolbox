const fs = require('fs');
const path = require('path');

let configCache = null;
let configPath = null;

/**
 * 初始化配置文件
 */
function initConfig(userDataPath) {
    configPath = path.join(userDataPath, 'downloads.json');
    console.log('[Config] ========== 配置初始化开始 ==========');
    console.log('[Config] 用户数据目录:', userDataPath);
    console.log('[Config] 配置文件路径:', configPath);
    
    // 获取源码中的默认配置路径
    let defaultConfigPath;
    if (process.env.NODE_ENV === 'development') {
        // 开发环境：直接指向项目源码目录
        defaultConfigPath = path.join(__dirname, '..', 'config', 'downloads.json');
    } else {
        // 生产环境（打包后）
        defaultConfigPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'config', 'downloads.json');
    }

    console.log('[Config] 默认配置文件路径:', defaultConfigPath);
    console.log('[Config] 默认配置文件存在:', fs.existsSync(defaultConfigPath));
    console.log('[Config] 当前模式:', process.env.NODE_ENV);
    
    // 开发模式下强制每次启动同步源码配置
    if (process.env.NODE_ENV === 'development' && fs.existsSync(defaultConfigPath)) {
        try {
            const sourceContent = fs.readFileSync(defaultConfigPath, 'utf-8');
            const sourceConfig = JSON.parse(sourceContent);
            console.log('[Config] 源码配置文件镜像数量:', sourceConfig.mirrors ? sourceConfig.mirrors.length : 0);
            
            // 直接覆盖用户目录配置
            fs.writeFileSync(configPath, sourceContent, 'utf-8');
            console.log('[Config] ✓ 已强制同步源码配置到用户目录');
            
            // 验证写入结果
            const verifyContent = fs.readFileSync(configPath, 'utf-8');
            const verifyConfig = JSON.parse(verifyContent);
            console.log('[Config] ✓ 验证：用户配置镜像数量:', verifyConfig.mirrors ? verifyConfig.mirrors.length : 0);
        } catch (err) {
            console.error('[Config] ✗ 同步配置失败:', err);
        }
    } else if (!fs.existsSync(configPath) && fs.existsSync(defaultConfigPath)) {
        // 首次启动：复制默认配置
        try {
            const defaultConfig = fs.readFileSync(defaultConfigPath, 'utf-8');
            fs.writeFileSync(configPath, defaultConfig, 'utf-8');
            console.log('[Config] ✓ 已创建初始配置文件');
        } catch (err) {
            console.error('[Config] ✗ 创建配置文件失败:', err);
        }
    } else {
        console.log('[Config] 使用已存在的配置文件');
    }
    
    console.log('[Config] ========== 配置初始化完成 ==========\n');
    
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
            let defaultConfigPath;
            if (process.resourcesPath) {
                // 生产环境（打包后）
                defaultConfigPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'config', 'downloads.json');
                if (!fs.existsSync(defaultConfigPath)) {
                    defaultConfigPath = path.join(process.resourcesPath, 'config', 'downloads.json');
                }
            } else {
                // 开发环境
                defaultConfigPath = path.join(__dirname, '..', 'config', 'downloads.json');
            }
            
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
    
    // 确保 mirrors 字段始终存在且有默认值
    if (!config || !config.mirrors) {
        console.log('[Config] 配置中无 mirrors，使用默认值');
        return [
            { name: 'GitHub 官方直连', url: '', recommended: false },
            { name: 'ghfast.top', url: 'https://ghfast.top/', recommended: true },
            { name: 'gh-proxy.com', url: 'https://gh-proxy.com/', recommended: false },
            { name: 'ghproxy.com', url: 'http://ghproxy.com/', recommended: false },
            { name: 'all.mk-proxy.tk', url: 'https://all.mk-proxy.tk/', recommended: false },
            { name: 'kgithub.com', url: 'https://kgithub.com/', recommended: false },
            { name: 'github.moeyy.xyz', url: 'https://github.moeyy.xyz/', recommended: false }
        ];
    }
    
    console.log('[Config] config.mirrors:', JSON.stringify(config.mirrors));
    return config.mirrors;
}

/**
 * 替换 URL 中的 {mirror} 占位符
 */
function resolveUrl(urlTemplate) {
    const mirror = getCurrentMirror();
    
    // 如果镜像为空（直连模式），移除 {mirror} 占位符，直接使用原始 GitHub URL
    if (!mirror || mirror === '') {
        // 配置中的 URL 格式为：{mirror}https://github.com/...
        // 直连时移除 {mirror}，得到 https://github.com/...
        return urlTemplate.replace('{mirror}', '');
    }
    
    // 使用代理时，替换 {mirror} 为代理地址
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
