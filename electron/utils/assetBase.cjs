/**
 * 资源基址解析
 *
 * 开源后，其他人 fork 这份代码时不应该继续消耗官方 OSS 的流量。
 * 只要设置环境变量 MULING_ASSET_BASE（或在 downloads.json 顶层加 "assetBase"），
 * 所有指向官方桶的地址都会被改写到自己的源上。
 *
 * 优先级：环境变量 > downloads.json 的 assetBase > 原始地址
 */

const DEFAULT_BASE = 'https://muling-env-box.oss-cn-beijing.aliyuncs.com';

let overrideBase = null;

function normalizeBase(base) {
    if (typeof base !== 'string') return null;
    const trimmed = base.trim();
    if (!trimmed) return null;
    return trimmed.replace(/\/+$/, '');
}

function init(config) {
    const fromEnv = normalizeBase(process.env.MULING_ASSET_BASE);
    const fromConfig = config ? normalizeBase(config.assetBase) : null;
    overrideBase = fromEnv || fromConfig || null;
    if (overrideBase) {
        console.log('[AssetBase] 资源基址已覆盖为:', overrideBase);
    }
}

function getBase() {
    return overrideBase || DEFAULT_BASE;
}

/**
 * 把任意资源地址解析成最终可下载地址。
 * - 绝对地址且指向官方桶 → 换成覆盖后的基址
 * - 以 / 开头的相对路径 → 拼到覆盖后的基址（未配置覆盖时用官方基址）
 */
function resolve(url) {
    if (typeof url !== 'string') return url;
    const trimmed = url.trim();
    if (!trimmed) return url;

    if (overrideBase && trimmed.startsWith(DEFAULT_BASE)) {
        return overrideBase + trimmed.slice(DEFAULT_BASE.length);
    }
    if (trimmed.startsWith('/')) {
        return getBase() + trimmed;
    }
    return url;
}

module.exports = { init, getBase, resolve, DEFAULT_BASE };
