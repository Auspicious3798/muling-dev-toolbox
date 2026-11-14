const axios = require('axios');
const fs = require('fs');

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;
const SAMPLE_INTERVAL_MS = 500;
const PROGRESS_INTERVAL_MS = 1000;

async function getRemoteFileSize(url, signal, timeout = 15000) {
    try {
        const response = await axios({ method: 'HEAD', url, timeout, signal });
        const length = response.headers['content-length'];
        return length ? parseInt(length, 10) : null;
    } catch {
        return null;
    }
}

function removeQuietly(filePath) {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
        /* 清理失败交给后续写入覆盖 */
    }
}

function partSize(partPath) {
    try {
        return fs.statSync(partPath).size;
    } catch (err) {
        return 0;
    }
}

function sleep(ms, signal) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        if (signal) {
            signal.addEventListener('abort', () => {
                clearTimeout(timer);
                resolve();
            }, { once: true });
        }
    });
}

/**
 * 单次下载尝试。若 .part 已有内容则发 Range 请求续传。
 */
async function downloadOnce({ url, partPath, signal, onProgress, log, label, timeout, agent }) {
    let existing = partSize(partPath);
    const headers = { 'Cache-Control': 'no-cache' };
    if (existing > 0) headers.Range = `bytes=${existing}-`;

    let response;
    try {
        response = await axios({
            method: 'GET',
            url,
            responseType: 'stream',
            timeout,
            signal,
            httpsAgent: agent,
            maxRedirects: 5,
            headers,
            validateStatus: (status) => status === 200 || status === 206 || status === 416,
        });
    } catch (err) {
        throw err;
    }

    if (response.status === 416) {
        removeQuietly(partPath);
        const err = new Error('断点位置已失效，重新下载');
        if (response.data && typeof response.data.destroy === 'function') response.data.destroy();
        throw err;
    }

    if (existing > 0 && response.status === 200) {
        // 服务器不支持 Range，本次从头来
        log(`[${label}] 服务器不支持断点续传，从头下载`);
        if (response.data && typeof response.data.destroy === 'function') response.data.destroy();
        removeQuietly(partPath);
        existing = 0;
    }

    const writer = fs.createWriteStream(partPath, { flags: existing > 0 ? 'a' : 'w' });

    const lengthHeader = response.headers['content-length'];
    const remaining = lengthHeader ? parseInt(lengthHeader, 10) : null;
    const total = existing > 0 ? (remaining ? existing + remaining : null) : remaining;

    let received = existing;
    let windowBytes = 0;
    let speed = 0;
    let settled = false;
    let lastTick = Date.now();
    let lastEmit = 0;

    return new Promise((resolve, reject) => {
        const cleanTimers = () => clearInterval(sampler);

        const emit = (force) => {
            const now = Date.now();
            if (!force && now - lastEmit < PROGRESS_INTERVAL_MS) return;
            lastEmit = now;
            const percent = total ? Math.min(received / total, 1) : null;
            const eta = total && speed > 0 ? Math.max(0, Math.ceil((total - received) / speed)) : null;
            if (typeof onProgress === 'function') {
                try {
                    onProgress({ percent, received, total, speed, eta, resumed: existing > 0 });
                } catch (err) {
                    /* 进度回调异常不中断下载 */
                }
            }
        };

        const fail = (err) => {
            if (settled) return;
            settled = true;
            cleanTimers();
            if (!writer.destroyed) writer.destroy();
            if (response.data && typeof response.data.destroy === 'function') response.data.destroy();
            reject(err);
        };

        const finish = () => {
            if (settled) return;
            if (total && received < total) {
                fail(new Error(`下载不完整（${received}/${total} 字节）`));
                return;
            }
            settled = true;
            cleanTimers();
            emit(true);
            resolve();
        };

        const sampler = setInterval(() => {
            const now = Date.now();
            const seconds = Math.max((now - lastTick) / 1000, 0.001);
            const instant = windowBytes / seconds;
            speed = speed > 0 ? speed * 0.6 + instant * 0.4 : instant;
            windowBytes = 0;
            lastTick = now;
            if (typeof log === 'function' && label) {
                log(`[${label}] ${(speed / 1024 / 1024).toFixed(2)} MB/s，已下载 ${(received / 1024 / 1024).toFixed(2)} MB`);
            }
            emit(false);
        }, SAMPLE_INTERVAL_MS);

        response.data.on('data', (chunk) => {
            received += chunk.length;
            windowBytes += chunk.length;
            emit(false);
        });
        response.data.on('error', (err) => fail(err));
        response.data.on('aborted', () => fail(new Error('连接被中断')));
        writer.on('error', (err) => fail(err));
        writer.on('finish', finish);

        if (signal) {
            signal.addEventListener('abort', () => fail(new Error('下载已取消')), { once: true });
        }

        response.data.pipe(writer);
    });
}

async function downloadFile({
    url,
    destPath,
    signal,
    onProgress = null,
    log = () => {},
    label = '',
    timeout = 600000,
    agent,
    attempts = MAX_ATTEMPTS,
}) {
    if (!url || typeof url !== 'string') throw new Error('下载地址无效');
    if (signal && signal.aborted) throw new Error('下载已取消');

    const partPath = `${destPath}.part`;
    const candidates = buildCandidates(url, label, log);
    let effectiveTimeout = timeout;
    if (timeout === 'auto') {
        const totalSizeBytes = await getRemoteFileSize(url, signal);
        const secs = totalSizeBytes ? Math.max(600, Math.ceil(totalSizeBytes / (100 * 1024)) + 120) : 600;
        effectiveTimeout = secs * 1000;
        log(`预估超时 ${secs}s，文件大小 ${totalSizeBytes ? (totalSizeBytes / 1024 / 1024).toFixed(1) + 'MB' : '未知'}`);
    }

    removeQuietly(destPath);

    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
        const currentUrl = candidates[index];
        const isLastSource = index === candidates.length - 1;
        if (index > 0) {
            removeQuietly(partPath);
            log(`[${label}] 主下载源不可用，切换备用源：${currentUrl}`);
            if (typeof onProgress === 'function') {
                try {
                    onProgress({percent: 0, received: 0, total: null, speed: 0, eta: null, retrying: true, attempt: 1, sourceSwitched: true});
                } catch (e) {
                    /* 忽略 */
                }
            }
        }
        try {
            return await downloadFrom(currentUrl, {attempts, isLastSource});
        } catch (err) {
            if (err.message === '下载已取消') throw err;
            lastError = err;
        }
    }

    async function downloadFrom(targetUrl, {attempts: tries, isLastSource: last}) {
        for (let attempt = 1; attempt <= tries; attempt++) {
            if (signal && signal.aborted) {
                removeQuietly(partPath);
                throw new Error('下载已取消');
            }

            const resumeFrom = partSize(partPath);
            if (resumeFrom > 0) log(`[${label}] 从 ${(resumeFrom / 1024 / 1024).toFixed(2)} MB 处继续下载`);

            try {
                await downloadOnce({
                    url: targetUrl,
                    partPath,
                    signal,
                    onProgress,
                    log,
                    label,
                    timeout: effectiveTimeout,
                    agent,
                });
                removeQuietly(destPath);
                fs.renameSync(partPath, destPath);
                return destPath;
            } catch (err) {
                if (err.message === '下载已取消' || (signal && signal.aborted)) {
                    removeQuietly(partPath);
                    throw new Error('下载已取消');
                }
                if (attempt >= tries) {
                    if (last) throw err;
                    return Promise.reject(err);
                }
                const kept = partSize(partPath);
                log(`[${label}] 第 ${attempt} 次下载中断：${err.message}，已保留 ${(kept / 1024 / 1024).toFixed(2)} MB 用于续传`);
                if (typeof onProgress === 'function') {
                    try {
                        onProgress({
                            percent: null,
                            received: kept,
                            total: null,
                            speed: 0,
                            eta: null,
                            retrying: true,
                            attempt,
                            resumed: kept > 0,
                        });
                    } catch (e) {
                        /* 忽略 */
                    }
                }
                await sleep(RETRY_DELAY_MS, signal);
            }
        }
        throw new Error('下载失败');
    }

    removeQuietly(partPath);
    throw new Error(`下载失败（已重试 ${attempts} 次）：${lastError ? lastError.message : '未知错误'}`);
}

function buildCandidates(url, label, log) {
    const list = [url];
    let hosts = [];
    try {
        const configManager = require('../configManager.cjs');
        if (configManager && typeof configManager.getFallbackHosts === 'function') {
            hosts = configManager.getFallbackHosts() || [];
        }
    } catch (err) {
        hosts = [];
    }
    for (const host of hosts) {
        try {
            const parsed = new URL(url);
            const base = String(host).replace(/\/+$/, '');
            if (!base) continue;
            const candidate = `${base}${parsed.pathname}`;
            if (!list.includes(candidate)) list.push(candidate);
        } catch (err) {
            /* 忽略非法地址 */
        }
    }
    if (list.length > 1) log(`[${label}] 可用下载源 ${list.length} 个`);
    return list;
}

module.exports = { downloadFile, getRemoteFileSize };
