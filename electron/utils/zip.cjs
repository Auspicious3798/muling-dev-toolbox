const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * 解压 zip 到目录，并按字节数回调进度。
 *
 * maven/nginx 的 zip 解压后内含一个顶层子目录（如 apache-maven-x / nginx-x），
 * 历史实现会把子目录内容摊平到安装目录。这里通过 flattenPrefix 参数化保留该行为。
 *
 * @param {string} zipPath     压缩包路径
 * @param {string} installDir  安装目录
 * @param {object} opts
 * @param {function} [opts.log]          日志函数
 * @param {string} [opts.flattenPrefix]  需要摊平的子目录前缀，如 'apache-maven-'
 * @param {function} [opts.onProgress]   解压进度回调 (percent: 0~1) => void
 */
async function installZip(zipPath, installDir, { log = () => {}, flattenPrefix = null, onProgress = null } = {}) {
    if (fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true, force: true });
        log(`已删除旧目录: ${installDir}`);
    }
    fs.mkdirSync(installDir, { recursive: true });

    let zip;
    try {
        zip = new AdmZip(zipPath);
    } catch (err) {
        log(`解压失败: ${err.message}`);
        throw err;
    }

    const entries = zip.getEntries();
    const totalBytes = entries.reduce((sum, entry) => sum + (entry.header && entry.header.size ? entry.header.size : 0), 0);
    let doneBytes = 0;
    let lastTick = 0;

    const report = (force) => {
        if (typeof onProgress !== 'function') return;
        const now = Date.now();
        if (!force && now - lastTick < 120) return;
        lastTick = now;
        const percent = totalBytes > 0 ? Math.min(1, doneBytes / totalBytes) : 0;
        try { onProgress(percent); } catch (e) { /* 进度回调异常不影响解压 */ }
    };

    try {
        let sinceYield = 0;
        let lastYieldAt = Date.now();
        for (const entry of entries) {
            const entryName = entry.entryName;
            if (entry.isDirectory) {
                fs.mkdirSync(path.join(installDir, entryName), { recursive: true });
                continue;
            }
            const target = path.join(installDir, entryName);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            if (entry.header && entry.header.size > 16 * 1024 * 1024) {
                await new Promise((resolve) => setImmediate(resolve));
            }
            fs.writeFileSync(target, entry.getData());
            doneBytes += entry.header && entry.header.size ? entry.header.size : 0;
            report(false);
            sinceYield += 1;
            // 每写一批文件让出事件循环，保证进度能及时渲染到界面
            if (Date.now() - lastYieldAt >= 12) {
                sinceYield = 0;
                lastYieldAt = Date.now();
                await new Promise((resolve) => setImmediate(resolve));
            }
        }
    } catch (err) {
        log(`解压失败: ${err.message}`);
        throw err;
    }
    report(true);

    if (flattenPrefix) {
        const extracted = fs.readdirSync(installDir);
        const subDir = extracted.find((name) => {
            if (!String(name).startsWith(flattenPrefix)) return false;
            return isDir(path.join(installDir, name));
        });
        if (subDir) {
            const subPath = path.join(installDir, subDir);
            const files = fs.readdirSync(subPath);
            for (const file of files) {
                fs.renameSync(path.join(subPath, file), path.join(installDir, file));
            }
            fs.rmdirSync(subPath);
        }
    }

    log(`解压成功: ${zipPath} -> ${installDir}`);
}

function isDir(p) {
    try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
}

/**
 * 把解压进度映射到整条安装进度上，生成可直接传给 installZip 的 onProgress。
 *
 * @param {function} sendProgress sendProgress(percent, stage, meta)
 * @param {number} start 解压阶段的起点进度（0~1）
 * @param {number} end   解压阶段的终点进度（0~1）
 */
function zipProgress(sendProgress, start, end) {
    return (percent) => {
        const p = typeof percent === 'number' ? percent : 0;
        const stage = p >= 1 ? '解压完成' : `解压中 ${Math.round(p * 100)}%`;
        sendProgress(start + (end - start) * p, stage, { extract: true, extractPercent: p });
    };
}

module.exports = { installZip, zipProgress };
