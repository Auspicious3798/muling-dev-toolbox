const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CENTRAL_SIG = 0x02014b50;

/**
 * 解压 zip 到目录，并按字节数回调进度。
 *
 * 优先用系统自带 bsdtar（Windows 10 1803+ 的 System32\tar.exe）解压：
 * 它是流式的，不会把整个压缩包/单个大文件读进内存，进度也用异步轮询，
 * 主进程不会被卡住（MySQL 包里有 500MB 级的 mysqld.exe，用 adm-zip 会 OOM）。
 * 没有 tar 的环境退回 adm-zip 逐条目解压。
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

    let lastTick = 0;
    const report = (percent, force) => {
        if (typeof onProgress !== 'function') return;
        const now = Date.now();
        if (!force && now - lastTick < 120) return;
        lastTick = now;
        const value = percentile(percent);
        try { onProgress(value); } catch (e) { /* 进度回调异常不影响解压 */ }
    };

    const tarExe = findTar();
    let usedTar = false;
    if (tarExe) {
        try {
            await extractWithTar(tarExe, zipPath, installDir, { log, report });
            usedTar = true;
        } catch (err) {
            log(`tar 解压失败（${err.message}），回退到内置解压`);
            fs.rmSync(installDir, { recursive: true, force: true });
            fs.mkdirSync(installDir, { recursive: true });
        }
    }

    if (!usedTar) {
        await extractWithAdmZip(zipPath, installDir, { log, report });
    }
    report(1, true);

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

function percentile(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(1, value));
}

function candidateTar() {
    if (process.platform !== 'win32') return '/usr/bin/tar';
    const root = process.env.SystemRoot || 'C:\\Windows';
    return path.join(root, 'System32', 'tar.exe');
}

function findTar() {
    const exe = candidateTar();
    try {
        return fs.existsSync(exe) ? exe : null;
    } catch (err) {
        return null;
    }
}

/**
 * 只解析 zip 的中央目录，拿到“解压后总字节数”用于进度估算。
 * 不开 adm-zip，避免把整个压缩包读进内存。
 */
function readZipTotals(zipPath) {
    let fd = null;
    try {
        fd = fs.openSync(zipPath, 'r');
        const size = fs.fstatSync(fd).size;

        const tailLen = Math.min(size, 66000);
        const tail = Buffer.alloc(tailLen);
        fs.readSync(fd, tail, 0, tailLen, size - tailLen);

        let eocd = -1;
        for (let i = tailLen - 22; i >= 0; i -= 1) {
            if (tail.readUInt32LE(i) === ZIP_EOCD_SIG) {
                eocd = i;
                break;
            }
        }
        if (eocd < 0) return null;

        const totalEntries = tail.readUInt16LE(eocd + 10);
        const cdOffset = tail.readUInt32LE(eocd + 16);
        if (!cdOffset || cdOffset >= size) return null;

        const cdLen = Math.min(size - cdOffset, 64 * 1024 * 1024);
        const cd = Buffer.alloc(cdLen);
        fs.readSync(fd, cd, 0, cdLen, cdOffset);

        let pos = 0;
        let total = 0;
        let seen = 0;
        while (pos + 46 <= cdLen && cd.readUInt32LE(pos) === ZIP_CENTRAL_SIG) {
            const uncompressed = cd.readUInt32LE(pos + 24);
            const nameLen = cd.readUInt16LE(pos + 28);
            const extraLen = cd.readUInt16LE(pos + 30);
            const commentLen = cd.readUInt16LE(pos + 32);
            if (uncompressed !== 0xFFFFFFFF) total += uncompressed;
            pos += 46 + nameLen + extraLen + commentLen;
            seen += 1;
        }
        return { totalBytes: total, entries: seen || totalEntries };
    } catch (err) {
        return null;
    } finally {
        if (fd !== null) {
            try { fs.closeSync(fd); } catch (err) { /* 关闭失败忽略 */ }
        }
    }
}

function dirBytes(dir) {
    let total = 0;
    const stack = [dir];
    while (stack.length) {
        const current = stack.pop();
        let items = [];
        try {
            items = fs.readdirSync(current, { withFileTypes: true });
        } catch (err) {
            continue;
        }
        for (const item of items) {
            const full = path.join(current, item.name);
            if (item.isDirectory()) {
                stack.push(full);
            } else if (item.isFile()) {
                try { total += fs.statSync(full).size; } catch (err) { /* 文件可能还在写 */ }
            }
        }
    }
    return total;
}

function extractWithTar(tarExe, zipPath, installDir, { log, report }) {
    const totals = readZipTotals(zipPath);
    const expected = totals && totals.totalBytes > 0 ? totals.totalBytes : 0;
    log(`[解压] 使用 ${tarExe}，预计 ${Math.round(expected / 1024 / 1024)}MB`);

    return new Promise((resolve, reject) => {
        let settled = false;
        const child = spawn(tarExe, ['-xf', zipPath, '-C', installDir], {
            windowsHide: true,
            stdio: ['ignore', 'ignore', 'pipe'],
        });

        let stderr = '';
        if (child.stderr) {
            child.stderr.on('data', (chunk) => {
                if (stderr.length < 4000) stderr += chunk.toString();
            });
        }

        let lastSize = 0;
        const timer = setInterval(() => {
            const written = dirBytes(installDir);
            lastSize = written;
            if (expected > 0) report(Math.min(0.98, written / expected), false);
        }, 400);

        const finish = (err) => {
            if (settled) return;
            settled = true;
            clearInterval(timer);
            if (err) reject(err);
            else resolve();
        };

        child.on('error', (err) => finish(err));
        child.on('close', (code) => {
            if (code !== 0) {
                finish(new Error(`tar 退出码 ${code}${stderr ? '：' + stderr.trim() : ''}`));
                return;
            }
            if (lastSize <= 0 && dirBytes(installDir) <= 0) {
                finish(new Error('tar 未解出任何文件'));
                return;
            }
            finish(null);
        });
    });
}

async function extractWithAdmZip(zipPath, installDir, { log, report }) {
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

    try {
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
            if (totalBytes > 0) report(Math.min(0.98, doneBytes / totalBytes), false);
            if (Date.now() - lastYieldAt >= 12) {
                lastYieldAt = Date.now();
                await new Promise((resolve) => setImmediate(resolve));
            }
        }
    } catch (err) {
        log(`解压失败: ${err.message}`);
        throw err;
    }
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
