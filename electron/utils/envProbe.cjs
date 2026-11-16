'use strict';

/**
 * 环境变量「探针」
 *
 * 目的：不要靠变量名（*_HOME）或目录长相去猜，而是真的在一个隐藏的后台进程里
 * 跑一次目标命令，看它到底能不能用：
 *   - ok      正常输出（java -version 之类）
 *   - silent  进程起来了，但一个字节都不输出、退出码还怪 —— 说明 PATH 指向的是
 *             一个已经被搬空/半残的安装目录（典型症状：cmd 里敲 java 什么都不发生）
 *   - missing 系统里根本找不到这条命令
 *   - error   明确报错（缺 DLL、找不到 JRE 之类）
 *
 * 再结合 `where.exe` 给出的解析顺序，就能精确指出「是哪一条 PATH 让它变成这样的」。
 */

const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const PROBES = {
    jdk: {command: 'java', exe: 'java.exe', args: ['-version']},
    python: {command: 'python', exe: 'python.exe', args: ['--version']},
    nodejs: {command: 'node', exe: 'node.exe', args: ['--version']},
    maven: {command: 'mvn', exe: 'mvn.cmd', args: ['-v']},
    gradle: {command: 'gradle', exe: 'gradle.bat', args: ['-v']},
    uv: {command: 'uv', exe: 'uv.exe', args: ['--version']},
    mysql: {command: 'mysql', exe: 'mysql.exe', args: ['--version']},
    redis: {command: 'redis-server', exe: 'redis-server.exe', args: ['--version']},
    nginx: {command: 'nginx', exe: 'nginx.exe', args: ['-v']},
};

// 工具根目录里常见的「说明性」子目录，用来识别被搬空的老安装
const TOOL_ROOT_MARKERS = ['bin', 'lib', 'conf', 'release', 'include', 'jre', 'plugins', 'etc'];

function systemExe(name) {
    const base = process.env.SystemRoot || 'C:\\Windows';
    return path.join(base, 'System32', name);
}

/** 展开 %VAR%，有任何一个变量解析不出来就返回 null（避免把 '\bin' 这种残缺值当路径） */
function expandEntry(entry) {
    if (!entry) return null;
    let value = String(entry).trim().replace(/^"|"$/g, '');
    if (!value) return null;
    let unresolved = false;
    value = value.replace(/%([^%]+)%/g, (m, name) => {
        const found = process.env[name] || process.env[name.toUpperCase()];
        if (!found) {
            unresolved = true;
            return '';
        }
        return found;
    });
    if (unresolved || value.includes('%')) return null;
    return value;
}

function isDirectory(dir) {
    try {
        return fs.statSync(dir).isDirectory();
    } catch (err) {
        return false;
    }
}

function isEmptyDir(dir) {
    try {
        return isDirectory(dir) && fs.readdirSync(dir).length === 0;
    } catch (err) {
        return false;
    }
}

/** 这个目录看起来像某个工具的安装根（有 bin/lib/conf 之类的骨架，但里面是空的） */
function looksLikeEmptiedRoot(dir) {
    if (!isDirectory(dir)) return false;
    try {
        const names = fs.readdirSync(dir).map((n) => n.toLowerCase());
        if (!names.length) return true;
        const hasSkeleton = names.some((n) => TOOL_ROOT_MARKERS.includes(n));
        if (!hasSkeleton) return false;
        // 骨架在，但一条可执行文件都没有 = 被搬空了
        for (const name of names) {
            const sub = path.join(dir, name);
            if (!isDirectory(sub)) {
                if (/\.(exe|cmd|bat)$/i.test(name)) return false;
                continue;
            }
            const inner = fs.readdirSync(sub);
            if (inner.some((f) => /\.(exe|cmd|bat|dll)$/i.test(f))) return false;
        }
        return true;
    } catch (err) {
        return false;
    }
}

/** 用 where.exe 拿到整条解析链（按 PATH 顺序） */
function whereAll(command) {
    const result = spawnSync(systemExe('where.exe'), [command], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 8000,
    });
    if (result.status !== 0 || !result.stdout) return [];
    return result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function spawnOf(exePath, args) {
    const ext = path.extname(exePath).toLowerCase();
    if (ext === '.cmd' || ext === '.bat') {
        return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${exePath}"`, ...args], {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 8000,
        });
    }
    return spawnSync(exePath, args, {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 8000,
        windowsVerbatimArguments: false,
    });
}

/**
 * 在隐藏的后台进程里跑一次，看真实结果
 */
function probeExecutable(exePath, args) {
    if (!exePath) return {verdict: 'missing', exitCode: null, stdout: '', stderr: '', detail: '找不到可执行文件'};
    if (!fs.existsSync(exePath)) {
        return {verdict: 'missing', exitCode: null, stdout: '', stderr: '', detail: `文件不存在：${exePath}`};
    }
    let result;
    try {
        result = spawnOf(exePath, args);
    } catch (err) {
        return {verdict: 'error', exitCode: null, stdout: '', stderr: String(err.message || err), detail: '启动失败'};
    }
    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();
    const exitCode = typeof result.status === 'number' ? result.status : null;

    if (result.error && result.error.code === 'ENOENT') {
        return {verdict: 'missing', exitCode, stdout, stderr, detail: '系统里没有这条命令'};
    }
    if (result.error && result.error.code === 'ETIMEDOUT') {
        return {verdict: 'error', exitCode, stdout, stderr, detail: '运行超时（8 秒没有响应）'};
    }
    if (stdout || stderr) {
        // 有输出基本就算能跑；java -version 会写 stderr 且退出码为 0
        if (exitCode === 0 || /version|usage|help|apache|openjdk|python|node|uv|mysql|redis|nginx|gradle/i.test(stdout + stderr)) {
            return {verdict: 'ok', exitCode, stdout, stderr, detail: '可以正常运行'};
        }
        return {verdict: 'error', exitCode, stdout, stderr, detail: `运行报错（退出码 ${exitCode}）`};
    }
    // 一个字节都没有：典型的「目录被搬空 / 只剩壳」
    return {
        verdict: 'silent',
        exitCode,
        stdout,
        stderr,
        detail: exitCode === 0 ? '没有任何输出' : `没有任何输出（退出码 ${exitCode}）`,
    };
}

/**
 * 诊断单个工具：找出当前真正生效的那条路径，以及它是不是坏的
 */
async function diagnoseTool(tool, paths) {
    const spec = PROBES[tool];
    if (!spec) return null;

    const hits = whereAll(spec.command);
    const effective = hits[0] || '';
    const effectiveDir = effective ? path.dirname(effective) : '';

    let probe;
    if (effective) {
        probe = probeExecutable(effective, spec.args);
    } else {
        // 命令根本不在 PATH 上：看看有没有哪个目录是「搬空的工具根」
        probe = {verdict: 'missing', exitCode: null, stdout: '', stderr: '', detail: 'PATH 里找不到这条命令'};
    }

    const broken = probe.verdict === 'silent' || probe.verdict === 'error';
    const state = {
        tool,
        command: spec.command,
        effective,
        effectiveDir,
        hits,
        probe,
        broken,
        // 需要摘掉的 PATH 条目：就是让命令解析到这个坏目录的那一条
        shadowEntry: broken && effectiveDir ? effectiveDir : '',
        staleEntries: [],
        emptyEntries: [],
    };

    // 顺带把所有「空目录 / 搬空的工具根」PATH 条目找出来（这类条目留着只会让命令变成哑巴）
    const parsed = paths || (await readPathEntries());
    for (const entry of [...parsed.user, ...parsed.system]) {
        const dir = expandEntry(entry.raw);
        if (!dir || !isDirectory(dir)) continue;
        if (dir.toLowerCase() === String(effectiveDir).toLowerCase()) continue;
        if (isEmptyDir(dir)) {
            state.emptyEntries.push(entry.raw);
            if (looksLikeEmptiedRoot(path.dirname(dir))) state.staleEntries.push(entry.raw);
            continue;
        }
        if (looksLikeEmptiedRoot(dir)) state.staleEntries.push(entry.raw);
    }

    return state;
}

async function diagnoseAll(tools) {
    const list = tools && tools.length ? tools : Object.keys(PROBES);
    const paths = await readPathEntries();
    const results = [];
    for (const tool of list) {
        try {
            const item = await diagnoseTool(tool, paths);
            if (item) results.push(item);
        } catch (err) {
            results.push({tool, error: err.message, broken: false, probe: {verdict: 'error', detail: err.message}});
        }
    }
    return results;
}

/**
 * 解析 用户 / 系统 两条 PATH，并记住每一条来自哪个作用域
 */
async function readPathEntries() {
    const env = require('./env.cjs'); // 惰性 require，避免循环依赖
    const user = [];
    const system = [];
    try {
        const raw = await env.getUserPath();
        for (const item of String(raw || '').split(';').filter(Boolean)) {
            user.push({raw: item, scope: 'user'});
        }
    } catch (err) {
        /* 用户 PATH 读不到就当没有 */
    }
    try {
        const raw = await env.getSystemPath();
        for (const item of String(raw || '').split(';').filter(Boolean)) {
            system.push({raw: item, scope: 'system'});
        }
    } catch (err) {
        /* 系统 PATH 读不到就当没有 */
    }
    return {user, system};
}

module.exports = {
    PROBES,
    expandEntry,
    whereAll,
    probeExecutable,
    diagnoseTool,
    diagnoseAll,
    readPathEntries,
    isEmptyDir,
    looksLikeEmptiedRoot,
};
