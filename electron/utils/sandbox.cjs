const fs = require('fs');
const path = require('path');
const os = require('os');
const {execFile} = require('child_process');
const {promisify} = require('util');

const execFileAsync = promisify(execFile);

/**
 * 沙箱模式核心
 *
 * 设计原则：所有工具都装在 %LOCALAPPDATA%\Muling\env 下，
 * 默认不写任何系统环境变量、不注册 Windows 服务，
 * 删除该目录即可把机器恢复原样。
 *
 * 需要一个终端里能直接用的 java/python 时，使用本模块生成的
 * 「沐柠环境终端」（muling-env.cmd），或对 JDK/Python 单独开启系统注入。
 */

const TOOL_META = {
    jdk: {prefix: 'jdk-', entries: ['bin'], envVar: 'JAVA_HOME', label: 'JDK'},
    python: {prefix: 'python-', entries: ['', 'Scripts'], envVar: 'PYTHON_HOME', label: 'Python'},
    mysql: {prefix: 'mysql-', entries: ['bin'], envVar: 'MYSQL_HOME', label: 'MySQL'},
    redis: {prefix: 'redis-', entries: [''], envVar: 'REDIS_HOME', label: 'Redis'},
    maven: {prefix: 'maven-', entries: ['bin'], envVar: 'MAVEN_HOME', label: 'Maven'},
    nginx: {prefix: 'nginx-', entries: [''], envVar: 'NGINX_HOME', label: 'Nginx'},
    gradle: {prefix: 'gradle-', entries: ['bin'], envVar: 'GRADLE_HOME', label: 'Gradle'},
    uv: {prefix: 'uv-', entries: [''], envVar: 'UV_HOME', label: 'uv'},
    nodejs: {prefix: 'nodejs-', entries: [''], envVar: 'NODE_HOME', label: 'Node.js'},
};

// 只有命令行工具允许「注入系统变量」
const INJECTABLE_TOOLS = ['jdk', 'python', 'maven', 'gradle', 'uv', 'nodejs'];

let stateCache = null;

function getRoot() {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'Muling', 'env');
}

function getStatePath() {
    return path.join(getRoot(), 'state.json');
}

function getLauncherPath() {
    return path.join(getRoot(), 'muling-env.cmd');
}

function getLauncherPs1Path() {
    return path.join(getRoot(), 'muling-env.ps1');
}

function getToolMeta(tool) {
    return TOOL_META[tool] || null;
}

function ensureRoot() {
    const root = getRoot();
    fs.mkdirSync(root, {recursive: true});
    return root;
}

function emptyState() {
    return {version: 1, tools: {}, injection: {}, passwords: {}};
}

function readState() {
    if (stateCache) return stateCache;
    try {
        const raw = fs.readFileSync(getStatePath(), 'utf8');
        const parsed = JSON.parse(raw);
        stateCache = {
            version: parsed.version || 1,
            tools: parsed.tools && typeof parsed.tools === 'object' ? parsed.tools : {},
            injection: parsed.injection && typeof parsed.injection === 'object' ? parsed.injection : {},
        };
    } catch (err) {
        stateCache = emptyState();
    }
    return stateCache;
}

function writeState() {
    ensureRoot();
    fs.writeFileSync(getStatePath(), JSON.stringify(readState(), null, 2), 'utf8');
}

function getToolState(tool, create = false) {
    const state = readState();
    if (!state.tools[tool]) {
        if (!create) return null;
        state.tools[tool] = {active: null, versions: {}};
    }
    if (!state.tools[tool].versions) state.tools[tool].versions = {};
    return state.tools[tool];
}

/**
 * 某个工具某个版本的安装目录（沙箱内）
 */
function installDir(tool, version) {
    const meta = getToolMeta(tool);
    if (!meta) throw new Error(`未知工具: ${tool}`);
    const dirName = version.startsWith(meta.prefix) ? version : `${meta.prefix}${version}`;
    return path.join(getRoot(), tool, dirName);
}

function versionFromDirName(tool, dirName) {
    const meta = getToolMeta(tool);
    if (!meta) return null;
    if (!dirName.startsWith(meta.prefix)) return null;
    return dirName.slice(meta.prefix.length);
}

/**
 * 扫描磁盘上沙箱内已安装的版本（以目录为准，避免 state.json 丢失后失联）
 */
function scanInstalled(tool) {
    const meta = getToolMeta(tool);
    const toolRoot = path.join(getRoot(), tool);
    const result = [];
    if (!meta || !fs.existsSync(toolRoot)) return result;
    for (const name of fs.readdirSync(toolRoot)) {
        const full = path.join(toolRoot, name);
        let stat;
        try {
            stat = fs.statSync(full);
        } catch (e) {
            continue;
        }
        if (!stat.isDirectory()) continue;
        const version = versionFromDirName(tool, name);
        if (!version) continue;
        if (!looksInstalled(tool, full)) continue;
        result.push({version, dir: full});
    }
    return result;
}

const VERSION_PROBES = {
    jdk: {exe: 'bin\\java.exe', args: ['-version'], pattern: /version "([^"]+)"/},
    python: {exe: 'python.exe', args: ['--version'], pattern: /Python (\d+\.\d+\.\d+)/},
    nodejs: {exe: 'node.exe', args: ['-v'], pattern: /v(\d+\.\d+\.\d+)/},
    mysql: {exe: 'bin\\mysqld.exe', args: ['--version'], pattern: /Ver (\d+\.\d+\.\d+)/},
    redis: {exe: 'redis-server.exe', args: ['--version'], pattern: /v=(\d+\.\d+\.\d+)/},
    nginx: {exe: 'nginx.exe', args: ['-v'], pattern: /nginx\/(\d+\.\d+\.\d+)/},
    maven: {exe: 'bin\\mvn.cmd', args: ['-v'], pattern: /Apache Maven (\d+\.\d+\.\d+)/},
    gradle: {exe: 'bin\\gradle.bat', args: ['--version'], pattern: /Gradle (\d+\.\d+\.\d+)/},
};

/**
 * 跑一下程序自己报版本（目录名里没有版本号时用）
 */
function probeVersion(tool, dir) {
    const probe = VERSION_PROBES[tool];
    if (!probe) return null;
    const exePath = path.join(dir, probe.exe);
    if (!fs.existsSync(exePath)) return null;
    try {
        const {execFileSync} = require('child_process');
        const needsShell = /\.(cmd|bat)$/i.test(exePath);
        const output = execFileSync(needsShell ? `"${exePath}"` : exePath, probe.args, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 8000,
            shell: needsShell,
        });
        const match = String(output).match(probe.pattern);
        return match ? match[1] : null;
    } catch (err) {
        const text = `${err.stdout || ''}\n${err.stderr || ''}`;
        const match = text.match(probe.pattern);
        return match ? match[1] : null;
    }
}

/**
 * 从目录名推断版本号（接管已有安装时用）
 */
function guessVersion(tool, dir) {
    const base = path.basename(dir);
    const meta = getToolMeta(tool);
    let text = base;
    if (meta && text.startsWith(meta.prefix)) text = text.slice(meta.prefix.length);

    if (tool === 'jdk') {
        try {
            const releaseFile = path.join(dir, 'release');
            if (fs.existsSync(releaseFile)) {
                const match = fs.readFileSync(releaseFile, 'utf8').match(/JAVA_VERSION="([^"]+)"/);
                if (match) return match[1];
            }
        } catch (err) {
        }
        const match = text.match(/(\d+(?:\.\d+){0,3})/);
        return match ? match[1] : null;
    }

    if (tool === 'python') {
        const dotted = text.match(/(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)/);
        if (dotted) return dotted[1];
        const compact = text.match(/^(\d)(\d{2})$/);
        if (compact) return `${compact[1]}.${compact[2]}`;
        return null;
    }

    const match = text.match(/(\d+(?:\.\d+){0,3})/);
    return match ? match[1] : null;
}

/**
 * 某个工具某版本的实际目录：接管过的用登记目录（可能在 Program Files），
 * 没登记的才回落到沙箱路径。用于「打开目录」「在终端中使用」这类入口。
 */
function getVersionDir(tool, version) {
    const wanted = String(version || '');
    const toolState = getToolState(tool);
    const info = toolState && toolState.versions ? toolState.versions[wanted] : null;
    if (info && info.dir) return info.dir;
    const hit = listInstalled(tool).find((item) => String(item.version) === wanted);
    if (hit && hit.dir) return hit.dir;
    return installDir(tool, wanted);
}

/**
 * 这个路径是不是沙箱认可的目录（沙箱内，或某个已登记版本的目录）
 */
function isKnownDir(target) {
    const resolved = path.resolve(String(target || ''));
    const root = path.resolve(getRoot());
    if (resolved === root || resolved.startsWith(root + path.sep)) return true;
    const state = readState();
    for (const [tool, toolState] of Object.entries(state.tools || {})) {
        const versions = (toolState && toolState.versions) || {};
        for (const version of Object.keys(versions)) {
            const info = versions[version];
            if (!info || !info.dir) continue;
            const dir = path.resolve(info.dir);
            if (resolved === dir || resolved.startsWith(dir + path.sep)) return true;
        }
    }
    return false;
}

/**
 * 删除某个版本的安装目录——但只删沙箱内自己装的。
 * 接管的目录在 Program Files 之类的地方，属于「只登记不搬文件」，
 * 卸载时应当只解绑，绝不能去删人家的官方安装。
 */
function removeDirIfSandboxed(dir) {
    const target = path.resolve(String(dir || ''));
    const root = path.resolve(getRoot());
    const inside = target.toLowerCase().startsWith(root.toLowerCase() + path.sep);
    if (!inside) return {removed: false, sandboxed: false, dir: target};
    if (!fs.existsSync(target)) return {removed: false, sandboxed: true, dir: target};
    try {
        fs.rmSync(target, {recursive: true, force: true, maxRetries: 3, retryDelay: 120});
    } catch (err) {
        // 删不掉就抛出去，让调用方把原因告诉用户，而不是假装卸载成功
        throw new Error(`删除 ${target} 失败：${err.message}`);
    }
    return {removed: true, sandboxed: true, dir: target};
}

/**
 * 接管一个已经存在的安装目录（不复制、不移动文件）
 */
async function adopt(tool, dir, version) {
    const meta = getToolMeta(tool);
    if (!meta) throw new Error(`未知工具: ${tool}`);
    const target = path.resolve(String(dir || ''));
    if (!fs.existsSync(target)) throw new Error('目录不存在');
    if (!fs.statSync(target).isDirectory()) throw new Error('请选择安装目录');
    if (!looksInstalled(tool, target)) throw new Error(`这个目录看起来不是 ${meta.label} 的安装目录`);

    let finalVersion = String(version || guessVersion(tool, target) || '').trim();
    if (!finalVersion) {
        // 目录名里没版本号（E:\develop\Redis 这类），问一下程序自己
        finalVersion = String(probeVersion(tool, target) || '').trim();
    }
    if (!finalVersion) {
        // 还是问不出来就用目录名兜底，至少让人能在卡片上认出是哪一个
        finalVersion = path.basename(target) || 'custom';
    }

    register(tool, finalVersion, target, {activate: true});
    let messages = [];
    if (!/^[\d.]+$/.test(finalVersion)) {
        messages.push(`没识别出 ${meta.label} 的版本号，先按「${finalVersion}」记下，能用就行`);
    }
    try {
        const takeover = await takeOverEnv(tool);
        const notes = (takeover && takeover.messages) || [];
        if (notes.length) messages = messages.concat(notes);
    } catch (err) {
        messages.push(`接管环境变量时出错：${err.message}`);
    }
    syncInjection(tool).catch(() => {
    });
    return {tool, version: finalVersion, dir: target, label: meta.label, messages};
}

const DETECT_COMMANDS = {
    jdk: ['javac', 'java'],
    python: ['python'],
    nodejs: ['node'],
    mysql: ['mysqld'],
    redis: ['redis-server'],
    nginx: ['nginx'],
    maven: ['mvn'],
    gradle: ['gradle'],
};

function whereCommand(name) {
    try {
        const {execFileSync} = require('child_process');
        const shell = process.env.ComSpec || 'cmd.exe';
        const out = execFileSync(shell, ['/d', '/c', `where ${name}`], {
            encoding: 'utf8',
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    } catch (err) {
        return [];
    }
}

/**
 * 扫描本机已存在的环境（PATH / 环境变量 / 常见目录）
 */
function detectExistingInstalls() {
    const root = path.resolve(getRoot());
    const found = new Map();

    const push = (tool, dir) => {
        if (!dir) return;
        const target = path.resolve(dir);
        if (target.toLowerCase().startsWith(root.toLowerCase())) return;
        if (!fs.existsSync(target)) return;
        try {
            if (!fs.statSync(target).isDirectory()) return;
        } catch (err) {
            return;
        }
        if (!looksInstalled(tool, target)) return;
        const key = `${tool}|${target.toLowerCase()}`;
        if (found.has(key)) return;
        const state = getToolState(tool);
        const registered = Boolean(state && Object.values(state.versions || {}).some(
            (item) => path.resolve(item.dir || '').toLowerCase() === target.toLowerCase()
        ));
        found.set(key, {
            tool,
            label: TOOL_META[tool].label,
            dir: target,
            version: guessVersion(tool, target) || probeVersion(tool, target),
            registered
        });
    };

    const javaHome = process.env.JAVA_HOME;
    if (javaHome) push('jdk', javaHome);

    for (const [tool, commands] of Object.entries(DETECT_COMMANDS)) {
        for (const command of commands) {
            for (const exePath of whereCommand(command)) {
                const exeDir = path.dirname(exePath);
                if (tool === 'jdk' || tool === 'maven' || tool === 'gradle' || tool === 'mysql') {
                    push(tool, path.dirname(exeDir));
                } else {
                    push(tool, exeDir);
                }
            }
        }
    }

    const jdks = path.join(os.homedir(), '.jdks');
    if (fs.existsSync(jdks)) {
        for (const name of fs.readdirSync(jdks)) push('jdk', path.join(jdks, name));
    }

    // 常见 JDK 安装根：多版本共存时也能扫到没进 PATH 的那几个
    const jdkRoots = [
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Java'),
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Eclipse Adoptium'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Java'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Java'),
    ];
    for (const jdkRoot of jdkRoots) {
        if (!jdkRoot || !fs.existsSync(jdkRoot)) continue;
        for (const name of fs.readdirSync(jdkRoot)) push('jdk', path.join(jdkRoot, name));
    }

    const pythonRoot = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python');
    if (pythonRoot && fs.existsSync(pythonRoot)) {
        for (const name of fs.readdirSync(pythonRoot)) push('python', path.join(pythonRoot, name));
    }

    const nodeRoot = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs');
    if (nodeRoot && fs.existsSync(nodeRoot)) push('nodejs', nodeRoot);

    return Array.from(found.values());
}

function looksInstalled(tool, dir) {
    switch (tool) {
        case 'jdk':
            return fs.existsSync(path.join(dir, 'bin', 'java.exe')) || fs.existsSync(path.join(dir, 'release'));
        case 'python':
            return fs.existsSync(path.join(dir, 'python.exe'));
        case 'mysql':
            return fs.existsSync(path.join(dir, 'bin', 'mysqld.exe'));
        case 'redis':
            return fs.existsSync(path.join(dir, 'redis-server.exe'));
        case 'maven':
            return fs.existsSync(path.join(dir, 'bin', 'mvn.cmd'));
        case 'nginx':
            return fs.existsSync(path.join(dir, 'nginx.exe'));
        case 'gradle':
            return fs.existsSync(path.join(dir, 'bin', 'gradle.bat')) || fs.existsSync(path.join(dir, 'bin', 'gradle'));
        case 'uv':
            return fs.existsSync(path.join(dir, 'uv.exe'));
        case 'nodejs':
            return fs.existsSync(path.join(dir, 'node.exe'));
        default:
            return true;
    }
}

/**
 * 列出已安装版本，合并 state.json 与磁盘扫描结果，并标注当前启用版本
 */
function listInstalled(tool) {
    const toolState = getToolState(tool);
    const active = toolState ? toolState.active : null;
    const map = new Map();
    for (const item of scanInstalled(tool)) {
        map.set(item.version, {version: item.version, dir: item.dir, active: item.version === active});
    }
    if (toolState) {
        for (const [version, info] of Object.entries(toolState.versions)) {
            if (!map.has(version) && info && info.dir && fs.existsSync(info.dir)) {
                map.set(version, {version, dir: info.dir, active: version === active});
            }
        }
    }
    return Array.from(map.values()).sort((a, b) => compareVersion(b.version, a.version));
}

function compareVersion(a, b) {
    const pa = String(a).split(/[.\-+]/).map(n => parseInt(n, 10) || 0);
    const pb = String(b).split(/[.\-+]/).map(n => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const x = pa[i] || 0;
        const y = pb[i] || 0;
        if (x !== y) return x - y;
    }
    return 0;
}

function register(tool, version, dir, {activate = true} = {}) {
    const toolState = getToolState(tool, true);
    toolState.versions[version] = {dir, installedAt: new Date().toISOString()};
    if (activate || !toolState.active) toolState.active = version;
    writeState();
    syncLauncher().catch(() => {
    });
}

function setToolPassword(tool, version, password) {
    const state = readState();
    if (!state.passwords) state.passwords = {};
    if (!state.passwords[tool]) state.passwords[tool] = {};
    if (password === null || password === undefined) {
        delete state.passwords[tool][String(version)];
    } else {
        state.passwords[tool][String(version)] = String(password);
    }
    writeState();
}

function getToolPassword(tool, version) {
    const state = readState();
    const saved = (state.passwords || {})[tool];
    if (!saved) return null;
    const value = saved[String(version)];
    return typeof value === 'string' ? value : null;
}
function unregister(tool, version) {
    const toolState = getToolState(tool);
    if (!toolState) return;
    const wasActive = toolState.active === version;
    delete toolState.versions[version];
    if (wasActive) {
        const rest = Object.keys(toolState.versions).sort((a, b) => compareVersion(b, a));
        toolState.active = rest[0] || null;
    }
    writeState();
    if (wasActive) {
        const nextDir = toolState.active ? getActiveDir(tool) : null;
        if (isInjectionEnabled(tool)) {
            if (nextDir) {
                syncInjection(tool).catch(() => {
                });
            } else {
                setInjection(tool, false).catch(() => {
                });
            }
        }
    }
    syncLauncher().catch(() => {
    });
}

function setActive(tool, version) {
    const toolState = getToolState(tool, true);
    if (version && !toolState.versions[version]) {
        const dir = installDir(tool, version);
        if (!fs.existsSync(dir)) throw new Error(`未找到 ${tool} ${version} 的安装目录`);
        toolState.versions[version] = {dir, installedAt: new Date().toISOString()};
    }
    toolState.active = version || null;
    writeState();
    syncLauncher().catch(() => {
    });
    syncInjection(tool).catch(() => {
    });
}

function getActive(tool) {
    const toolState = getToolState(tool);
    return toolState ? toolState.active : null;
}

function getActiveDir(tool) {
    const version = getActive(tool);
    if (!version) return null;
    const toolState = getToolState(tool);
    const recorded = toolState && toolState.versions[version] && toolState.versions[version].dir;
    if (recorded && fs.existsSync(recorded)) return recorded;
    const dir = installDir(tool, version);
    return fs.existsSync(dir) ? dir : null;
}

/**
 * 某版本需要加入 PATH 的目录列表
 */
function pathEntries(tool, dir) {
    const meta = getToolMeta(tool);
    if (!meta) return [];
    return meta.entries
        .map(entry => (entry ? path.join(dir, entry) : dir))
        .filter(p => fs.existsSync(p));
}

function buildPath() {
    const entries = [];
    for (const tool of Object.keys(TOOL_META)) {
        const dir = getActiveDir(tool);
        if (!dir) continue;
        for (const entry of pathEntries(tool, dir)) entries.push(entry);
    }
    return entries;
}

/**
 * 给内置终端用的环境变量：在当前进程环境基础上临时注入沙箱 PATH 与 *_HOME
 * 只影响这一个子进程，关闭终端即失效
 */
function getTerminalEnv(options = {}) {
    const env = {...process.env};
    const focusEntries = [];
    if (options.tool && options.version) {
        const meta = getToolMeta(options.tool);
        const dir = installDir(options.tool, options.version);
        if (meta && fs.existsSync(dir)) {
            focusEntries.push(...pathEntries(options.tool, dir));
            env[meta.envVar] = dir;
        }
    }
    const entries = focusEntries.concat(buildPath().filter((entry) => !focusEntries.includes(entry)));
    if (entries.length > 0) {
        const current = env.PATH || env.Path || '';
        env.PATH = entries.join(';') + (current ? ';' + current : '');
        env.Path = env.PATH;
    }
    for (const tool of Object.keys(TOOL_META)) {
        if (options.tool === tool) continue;
        const dir = getActiveDir(tool);
        const meta = getToolMeta(tool);
        if (dir && meta) env[meta.envVar] = dir;
    }
    env.TERM = 'xterm-256color';
    env.MULING_SANDBOX_ROOT = getRoot();
    return env;
}

/**
 * 当前激活环境摘要，用于终端状态栏
 */
function getActiveSummary(options = {}) {
    const parts = [];
    if (options.tool && options.version) {
        parts.push(`${getToolMeta(options.tool).label} ${options.version}`);
    }
    for (const tool of Object.keys(TOOL_META)) {
        if (options.tool === tool) continue;
        const version = getActive(tool);
        if (!version) continue;
        parts.push(`${getToolMeta(tool).label} ${version}`);
    }
    return parts;
}

function quoteIfNeeded(value) {
    return /\s/.test(value) ? `"${value}"` : value;
}

/**
 * 生成「沐柠环境终端」的 cmd / ps1 脚本
 */
async function syncLauncher() {
    ensureRoot();
    const pathValue = buildPath().join(';');
    const vars = [];
    for (const tool of INJECTABLE_TOOLS) {
        const dir = getActiveDir(tool);
        const meta = getToolMeta(tool);
        if (dir && meta) vars.push([meta.envVar, dir]);
    }

    const cmdLines = [
        '@echo off',
        'chcp 65001 >nul',
        `title 沐柠环境终端`,
        ...vars.map(([name, value]) => `set "${name}=${value}"`),
        ...(pathValue ? [`set "PATH=${pathValue};%PATH%"`] : []),
        'echo ============================================',
        'echo  沐柠环境终端 - 沙箱环境已就绪',
        ...vars.map(([name, value]) => `echo   ${name}=${value}`),
        'echo ============================================',
        'echo.',
        'cd /d "%USERPROFILE%"',
        '',
    ];

    const psLines = [
        '# 沐柠环境终端（PowerShell）',
        ...vars.map(([name, value]) => `$env:${name} = '${value.replace(/'/g, "''")}'`),
        ...(pathValue ? [`$env:PATH = '${pathValue.replace(/'/g, "''")};' + $env:PATH`] : []),
        'Write-Host "沐柠环境终端 - 沙箱环境已就绪" -ForegroundColor Cyan',
        ...vars.map(([name, value]) => `Write-Host "  ${name}=${value}" -ForegroundColor DarkGray`),
        'Set-Location $env:USERPROFILE',
        '',
    ];

    fs.writeFileSync(getLauncherPath(), cmdLines.join('\r\n'), 'utf8');
    // PowerShell 5.1 需要用 BOM 才能正确识别 UTF-8 中文
    fs.writeFileSync(getLauncherPs1Path(), '\uFEFF' + psLines.join('\r\n'), 'utf8');

    await createShortcuts();
    return {launcher: getLauncherPath(), ps1: getLauncherPs1Path()};
}

function startMenuDir() {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        'Microsoft', 'Windows', 'Start Menu', 'Programs');
}

async function createShortcuts(iconPath = '') {
    const launcher = getLauncherPath();
    const targets = [
        {dir: startMenuDir(), name: '沐柠环境终端.lnk'},
    ];
    const desktopLnk = path.join(os.homedir(), 'Desktop', '沐柠环境终端.lnk');
    const icon = iconPath || process.execPath;
    const script = `
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$targets = @(
${targets.map(t => `  @{ Path = '${path.join(t.dir, t.name).replace(/'/g, "''")}' }`).join(',\n')}
)
foreach ($t in $targets) {
  $parent = Split-Path -Parent $t.Path
  if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  $sc = $shell.CreateShortcut($t.Path)
  $sc.TargetPath = $env:ComSpec
  $sc.Arguments = '/k "' + '${launcher.replace(/'/g, "''")}' + '"'
  $sc.WorkingDirectory = $env:USERPROFILE
  $sc.IconLocation = '${icon.replace(/'/g, "''")}'
  $sc.Description = '沐柠环境终端 - 已配置好沙箱内的 JDK / Python / Maven'
  $sc.Save()
}
$staleDesktop = '${desktopLnk.replace(/'/g, "''")}'
if (Test-Path $staleDesktop) { Remove-Item -LiteralPath $staleDesktop -Force -ErrorAction SilentlyContinue }
`;
    const tmp = path.join(os.tmpdir(), `muling-shortcut-${Date.now()}.ps1`);
    fs.writeFileSync(tmp, '\ufeff' + script, 'utf8');
    try {
        await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp], {
            windowsHide: true,
            timeout: 15000,
        });
    } catch (err) {
        // 快捷方式失败不影响沙箱可用性，只记录
        throw new Error(`创建快捷方式失败: ${err.message}`);
    } finally {
        try {
            fs.unlinkSync(tmp);
        } catch (e) {
        }
    }
}

/**
 * 给用户复制的「一次性命令」
 */
function getEnvCommand(tool = null) {
    const lines = [];
    if (!tool || tool === 'all') {
        for (const t of INJECTABLE_TOOLS) {
            const dir = getActiveDir(t);
            const meta = getToolMeta(t);
            if (dir && meta) lines.push(`set "${meta.envVar}=${dir}"`);
        }
        const entries = buildPath();
        if (entries.length) lines.push(`set "PATH=${entries.join(';')};%PATH%"`);
    } else {
        const dir = getActiveDir(tool);
        const meta = getToolMeta(tool);
        if (!dir || !meta) return '';
        lines.push(`set "${meta.envVar}=${dir}"`);
        lines.push(`set "PATH=${pathEntries(tool, dir).join(';')};%PATH%"`);
    }
    return lines.join('\r\n');
}

function isInjectionEnabled(tool) {
    const state = readState();
    return !!(state.injection && state.injection[tool]);
}

/**
 * 注入到用户 PATH 的条目（以环境变量引用形式，切换版本时无需重写 PATH）
 */
function injectionPathEntries(tool) {
    const meta = getToolMeta(tool);
    if (!meta) return [];
    return meta.entries.map(entry => (entry ? `%${meta.envVar}%\\${entry}` : `%${meta.envVar}%`));
}

function injectionRemovePatterns(tool) {
    const meta = getToolMeta(tool);
    const root = path.join(getRoot(), tool).replace(/\\/g, '[\\\\/]');
    return [
        new RegExp(`^%${meta.envVar}%`, 'i'),
        new RegExp(`^${root}[\\\\/]`, 'i'),
    ];
}

/**
 * 系统注入（可选，仅 JDK / Python / Maven）
 * 写入的是**用户级**环境变量（HKCU），关闭注入后完全还原，不碰 HKLM。
 */
async function setInjection(tool, enabled) {
    if (!INJECTABLE_TOOLS.includes(tool)) {
        throw new Error(`${tool} 不支持系统注入，请使用沐柠环境终端`);
    }
    const meta = getToolMeta(tool);
    const dir = getActiveDir(tool);
    if (enabled && !dir) throw new Error('请先安装一个版本再开启系统注入');

    const {
        setUserEnvVariable, removeUserEnvVariable, getUserPath, setUserPath, filterAndPrepend,
        getUserEnvVariable,
    } = require('./env.cjs');

    const state = readState();
    if (!state.injectionBackup) state.injectionBackup = {};

    if (enabled) {
        // 第一次开启时，先把用户原有的变量值存下来，撤出时还原
        if (!state.injectionBackup[tool]) {
            let original = '';
            try {
                original = (await getUserEnvVariable(meta.envVar)) || '';
            } catch (err) {
                original = '';
            }
            state.injectionBackup[tool] = {varName: meta.envVar, value: original};
        }
        await setUserEnvVariable(meta.envVar, dir);
        const currentPath = await getUserPath();
        await setUserPath(filterAndPrepend(currentPath, injectionRemovePatterns(tool), injectionPathEntries(tool)));
    } else {
        const currentPath = await getUserPath();
        const cleaned = currentPath
            .split(';')
            .filter(p => !injectionRemovePatterns(tool).some(re => re.test(p)))
            .join(';');
        await setUserPath(cleaned);

        // 还原注入前的值；原本没有这个变量才删除
        const backup = state.injectionBackup[tool];
        if (backup && backup.value) {
            await setUserEnvVariable(meta.envVar, backup.value);
        } else {
            await removeUserEnvVariable(meta.envVar);
        }
        // 接管时删掉的旧 PATH 条目，撤出时补回去
        if (backup && backup.takeover && backup.takeover.pathEntries && backup.takeover.pathEntries.length) {
            try {
                const currentPath = await getUserPath();
                const existing = String(currentPath || '').split(';').filter(Boolean);
                const missing = backup.takeover.pathEntries.filter(
                    (p) => !existing.some((e) => e.toLowerCase() === String(p).toLowerCase())
                );
                if (missing.length) await setUserPath([...existing, ...missing].join(';'));
            } catch (err) {
                // 补不回去就算了，别把撤出流程卡住
            }
        }
        delete state.injectionBackup[tool];
    }

    state.injection[tool] = !!enabled;
    writeState();

    // 注入后自检：真的跑一次被注入的 exe，区分「这份 JDK 本身跑了没输出」还是「被别的 java 抢先」
    let selfCheck = null;
    if (enabled) {
        try {
            const envProbe = require('./envProbe.cjs');
            const spec = envProbe.PROBES && envProbe.PROBES[tool];
            if (spec) {
                const own = envProbe.probeExecutable(path.join(dir, 'bin', spec.exe), spec.args);
                const hits = envProbe.whereAll(spec.command);
                const effective = (hits && hits[0]) || '';
                selfCheck = {
                    exe: path.join(dir, 'bin', spec.exe),
                    own,
                    effective,
                    shadowed: Boolean(effective) && !path.resolve(effective).toLowerCase()
                        .startsWith(path.resolve(dir).toLowerCase()),
                };
            }
        } catch (err) {
            selfCheck = {error: err.message};
        }
    }

    return {enabled: !!enabled, backup: state.injectionBackup[tool] || null, selfCheck};
}

async function syncInjection(tool) {
    if (!isInjectionEnabled(tool)) return;
    const dir = getActiveDir(tool);
    if (!dir) return;
    const meta = getToolMeta(tool);
    const {setUserEnvVariable, getUserPath, setUserPath, filterAndPrepend} = require('./env.cjs');
    await setUserEnvVariable(meta.envVar, dir);
    const currentPath = await getUserPath();
    await setUserPath(filterAndPrepend(currentPath, injectionRemovePatterns(tool), injectionPathEntries(tool)));
}

/**
 * 打开环境终端（通过快捷方式交给资源管理器启动，能拿到正常可见的控制台窗口）
 */
async function openTerminal() {
    ensureRoot();
    await syncLauncher();
    const {spawn} = require('child_process');
    const lnk = path.join(startMenuDir(), '沐柠环境终端.lnk');
    // 直接 detached 启动 cmd 时，子进程可能继承父进程的隐藏窗口状态而不可见；
    // 交给 explorer 打开快捷方式可以稳定拿到可见的终端窗口。
    const child = fs.existsSync(lnk)
        ? spawn('explorer.exe', [lnk], {detached: true, stdio: 'ignore'})
        : spawn(process.env.ComSpec || 'cmd.exe',
            ['/c', 'start', '沐柠环境终端', 'cmd', '/k', `"${getLauncherPath()}"`], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
                cwd: os.homedir(),
            });
    child.unref();
    return true;
}

/* ------------------------------ 旧版本（系统模式）迁移 ------------------------------ */

// 旧版本安装在 C:\Program Files 下，并且写入了系统环境变量
const LEGACY_BASE_DIRS = {
    jdk: [
        'C:\\Program Files\\muling\\muling-env-box\\Java',
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\OpenJDK',
    ],
    python: ['C:\\Program Files\\muling\\muling-env-box\\Python', 'C:\\Program Files\\Python'],
    mysql: ['C:\\Program Files\\muling\\muling-env-box\\MySQL', 'C:\\Program Files\\MySQL'],
    redis: ['C:\\Program Files\\muling\\muling-env-box\\Redis', 'C:\\Program Files\\Redis'],
    maven: ['C:\\Program Files\\muling\\muling-env-box\\Maven', 'C:\\Program Files\\Maven'],
    nginx: ['C:\\Program Files\\muling\\muling-env-box\\Nginx'],
};

const LEGACY_VAR_PATTERNS = {
    jdk: [/^JAVA_HOME\d+$/i],
    python: [/^PYTHON_HOME\d+$/i],
    mysql: [/^MYSQL_HOME\d+$/i],
    redis: [/^REDIS_HOME\d+$/i],
    maven: [/^MAVEN_HOME$/i],
    nginx: [/^NGINX_HOME\d*$/i],
};

const LEGACY_PATH_PATTERNS = {
    jdk: [/^%JAVA_HOME\d+%\\bin$/i],
    python: [/^%PYTHON_HOME\d+%$/i, /^%PYTHON_HOME\d+%\\Scripts$/i],
    mysql: [/^%MYSQL_HOME\d+%\\bin$/i],
    redis: [/^%REDIS_HOME\d+%$/i],
    maven: [/^%MAVEN_HOME%\\bin$/i],
    nginx: [/^%NGINX_HOME\d*%$/i],
};

/**
 * 扫描「系统模式」时代遗留下来的安装目录
 */
function scanLegacy() {
    const result = [];
    for (const [tool, bases] of Object.entries(LEGACY_BASE_DIRS)) {
        const meta = getToolMeta(tool);
        for (const base of bases) {
            if (!fs.existsSync(base)) continue;
            let names = [];
            try {
                names = fs.readdirSync(base);
            } catch (e) {
                continue;
            }
            for (const name of names) {
                const dir = path.join(base, name);
                let stat;
                try {
                    stat = fs.statSync(dir);
                } catch (e) {
                    continue;
                }
                if (!stat.isDirectory()) continue;
                if (!looksInstalled(tool, dir)) continue;
                const version = name.startsWith(meta.prefix) ? name.slice(meta.prefix.length) : name;
                if (!version) continue;
                result.push({tool, version, dir, source: 'legacy'});
            }
        }
    }
    return result;
}

/**
 * 把旧目录搬到沙箱，并清理对应的系统环境变量
 */
async function migrate(tool, version, legacyDir) {
    if (!fs.existsSync(legacyDir)) throw new Error(`旧目录不存在: ${legacyDir}`);
    const dest = installDir(tool, version);
    if (fs.existsSync(dest)) throw new Error(`沙箱内已经存在 ${tool} ${version}`);

    fs.mkdirSync(path.dirname(dest), {recursive: true});
    try {
        fs.renameSync(legacyDir, dest);
    } catch (err) {
        // 跨盘或权限问题：退化为复制 + 删除
        copyDirSync(legacyDir, dest);
        fs.rmSync(legacyDir, {recursive: true, force: true});
    }

    register(tool, version, dest, {activate: true});
    const cleanup = await cleanLegacyEnv(tool);
    return {dir: dest, cleanup};
}

function copyDirSync(src, dest) {
    fs.mkdirSync(dest, {recursive: true});
    for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirSync(from, to);
        else if (entry.isSymbolicLink()) {
            try {
                fs.symlinkSync(fs.readlinkSync(from), to);
            } catch (e) {
                fs.copyFileSync(from, to);
            }
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

/**
 * 判断某个 PATH 条目是不是「这个工具」的安装目录（接管时用来找出旧条目）
 */
function isToolDirEntry(tool, entry) {
    if (!entry) return false;
    let candidate = String(entry).trim().replace(/^"|"$/g, '');
    if (!candidate) return false;
    candidate = candidate.replace(/%([A-Za-z0-9_()]+)%/g, (m, name) => process.env[name] || '');
    if (candidate.includes('%')) return false;
    try {
        if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) return false;
    } catch (err) {
        return false;
    }
    const resolved = path.resolve(candidate);
    const root = path.resolve(getRoot()).toLowerCase();
    if (resolved.toLowerCase().startsWith(root)) return false;
    if (looksInstalled(tool, resolved)) return true;
    return looksInstalled(tool, path.dirname(resolved));
}

/**
 * 接管之后把该工具的环境配置收归环境盒管理：
 * 1) 把用户/系统 PATH 里指向其它安装的条目挑出来（能从用户级删的立即删）
 * 2) 用户级 JAVA_HOME 之类的变量改指到接管目录
 * 3) 用户 PATH 最前面放 %JAVA_HOME%\bin
 * 删掉的东西全部记进 state.injectionBackup[tool].takeover，撤出注入时还原。
 */
async function takeOverEnv(tool) {
    const meta = getToolMeta(tool);
    if (!meta) return {ok: false, messages: ['未知工具']};
    if (!INJECTABLE_TOOLS.includes(tool)) {
        return {ok: true, messages: [`${meta.label} 走沙箱终端，不需要改系统变量`]};
    }
    const dir = getActiveDir(tool);
    if (!dir) return {ok: false, messages: ['还没有可用的版本']};

    const env = require('./env.cjs');
    const state = readState();
    if (!state.injectionBackup) state.injectionBackup = {};
    const backup = state.injectionBackup[tool] || {varName: meta.envVar, value: ''};
    if (!backup.takeover) backup.takeover = {pathEntries: [], systemEntries: []};
    state.injectionBackup[tool] = backup;

    const messages = [];

    // 1) 旧 PATH 条目：用户级直接删，系统级尽力而为
    try {
        const userPath = await env.getUserPath();
        const parts = String(userPath || '').split(';').filter(Boolean);
        const stale = parts.filter((p) => isToolDirEntry(tool, p) || (tool === 'jdk' && isJavaShimEntry(p)));
        if (stale.length) {
            const kept = parts.filter((p) => !stale.includes(p));
            await env.setUserPath(kept.join(';'));
            backup.takeover.pathEntries = [...new Set([...(backup.takeover.pathEntries || []), ...stale])];
            messages.push(`清掉了用户 PATH 里 ${stale.length} 条旧的 ${meta.label} 路径`);
        }
    } catch (err) {
        messages.push(`清理用户 PATH 失败：${err.message}`);
    }

    try {
        const systemPath = await env.getSystemPath();
        const sysParts = String(systemPath || '').split(';').filter(Boolean);
        const sysStale = sysParts.filter((p) => isToolDirEntry(tool, p) || (tool === 'jdk' && isJavaShimEntry(p)));
        if (sysStale.length) {
            const kept = sysParts.filter((p) => !sysStale.includes(p));
            await env.setSystemPath(kept.join(';'));
            backup.takeover.systemEntries = [...new Set([...(backup.takeover.systemEntries || []), ...sysStale])];
            messages.push(`清掉了系统 PATH 里 ${sysStale.length} 条旧的 ${meta.label} 路径`);
        }
    } catch (err) {
        const systemPath = await env.getSystemPath().catch(() => '');
        const sysStale = String(systemPath || '').split(';').filter((p) => isToolDirEntry(tool, p) || (tool === 'jdk' && isJavaShimEntry(p)));
        if (sysStale.length) {
            messages.push(`系统 PATH 里还有 ${sysStale.length} 条旧的 ${meta.label} 路径，需要以管理员身份再接管一次才能清掉`);
        }
    }

    // 2) 旧的 JAVA_HOME 之类：记下原值再改指到接管目录
    try {
        const current = await env.getUserEnvVariable(meta.envVar);
        if (current && path.resolve(current).toLowerCase() !== path.resolve(dir).toLowerCase()) {
            if (!backup.value) backup.value = current;
            messages.push(`用户变量 ${meta.envVar} 原来指向 ${current}，已改为 ${dir}`);
        }
    } catch (err) {
        // 读不到就跳过
    }

    // 3) 写入受管的变量与 PATH 条目
    try {
        await setInjection(tool, true);
    } catch (err) {
        messages.push(`写入环境变量失败：${err.message}`);
    }

    // 4) 复核：系统 PATH 里如果还有旧条目，它会排在用户 PATH 前面，
    //    等于「接管了但没真正生效」，必须如实告诉用户，别让人以为已经切过来了
    try {
        const systemPath = await env.getSystemPath();
        const shadow = String(systemPath || '')
            .split(';')
            .filter((p) => p && (isToolDirEntry(tool, p) || (tool === 'jdk' && isJavaShimEntry(p))));
        if (shadow.length) {
            messages.push(
                `注意：系统 PATH 里还有 ${shadow.length} 条旧的 ${meta.label} 路径（${shadow[0]}），`
                + '它排在用户 PATH 前面，重开终端后仍会优先用旧的；需要以管理员身份再接管一次才能彻底切过来'
            );
        }
    } catch (err) {
        // 读不到系统 PATH 就不做这项复核
    }

    writeState();
    return {ok: true, messages};
}

/**
 * 提权模式专用：把系统 PATH 里属于该工具的旧条目摘掉（只动 HKLM 的 PATH 这一处）
 */
/**
 * 只看不改：报告某个工具在用户/系统 PATH 里还残留多少条「抢道」条目。
 * 面板拿它决定要不要显示「以管理员身份清理」。
 */
async function inspectEnvConflicts(tool) {
    const meta = getToolMeta(tool);
    if (!meta || !INJECTABLE_TOOLS.includes(tool)) {
        return {supported: false, tool, label: (meta && meta.label) || tool, systemEntries: [], userEntries: []};
    }
    const env = require('./env.cjs');
    const match = (entry) => isToolDirEntry(tool, entry) || (tool === 'jdk' && isJavaShimEntry(entry));
    const pick = (value) => String(value || '').split(';').map((s) => s.trim()).filter(Boolean).filter(match);
    const userPath = await env.getUserPath().catch(() => '');
    const systemPath = await env.getSystemPath().catch(() => '');
    return {
        supported: true,
        tool,
        label: meta.label,
        userEntries: pick(userPath),
        systemEntries: pick(systemPath)
    };
}

async function removeSystemToolEntries(tool) {
    const meta = getToolMeta(tool);
    if (!meta) return {ok: false, removed: [], message: `未知工具：${tool}`};
    const env = require('./env.cjs');
    try {
        const systemPath = await env.getSystemPath();
        const parts = String(systemPath || '').split(';').filter(Boolean);
        const stale = parts.filter((entry) => isToolDirEntry(tool, entry) || (tool === 'jdk' && isJavaShimEntry(entry)));
        if (!stale.length) {
            return {ok: true, removed: [], message: `系统 PATH 里没有 ${meta.label} 的旧条目`};
        }
        const kept = parts.filter((entry) => !stale.includes(entry));
        await env.setSystemPath(kept.join(';'));
        return {ok: true, removed: stale, message: `已从系统 PATH 清掉 ${stale.length} 条 ${meta.label} 旧路径`};
    } catch (err) {
        return {ok: false, removed: [], message: `清理系统 PATH 失败：${err.message}`};
    }
}

/**
 * Oracle 安装 JDK 时留下的 javapath 转发目录：
 * 里面只有 java.exe / javaw.exe / javac.exe 几个壳，真正的 JDK 由 Oracle 安装器维护指向，
 * 所以它不在「JDK 安装目录」的判定里，却同样会让 java 解析到别的 JDK。
 * 单独认出来，接管/清理时才算得干净。
 */
function isJavaShimEntry(entry) {
    if (!entry) return false;
    const text = String(entry).trim().replace(/"/g, '');
    if (!text) return false;
    return /(^|\\)javapath(\\|$)/i.test(text)
        || /\\Common Files\\Oracle\\Java\\javapath(\\|$)/i.test(text);
}

/**
 * 一键清理：先做探针，再精确清理。
 *
 * 旧版是按「目录长得像某个工具」一刀切，会把用户还要用的安装也一并摘掉。
 * 现在改成：
 *   1) 在隐藏进程里真的跑一次 java/python/mvn…，看它能不能用
 *   2) 如果这个命令是「哑巴」（有进程、零输出），说明 PATH 里让命令生效的那一条
 *      指向了被搬空的旧目录 —— 只摘这一条（以及确实空掉的同族条目）
 *   3) 一个都不坏就什么都不动
 * 用户级直接改，系统级有权限顺手清，没权限返回 needsAdmin 让上层提权再跑一次。
 */
const CLEAN_TOOLS = ['jdk', 'python', 'maven', 'gradle', 'nodejs', 'uv', 'mysql', 'redis', 'nginx'];

async function cleanLegacyAll() {
    const env = require('./env.cjs');
    const envProbe = require('./envProbe.cjs');

    const removed = [];
    const warnings = [];
    const diag = await envProbe.diagnoseAll(CLEAN_TOOLS);

    // 需要摘掉的 PATH 条目（统一小写去重，保留原样用于比较）
    const targets = new Map();
    const addTarget = (raw, reason) => {
        if (!raw) return;
        const key = String(raw).toLowerCase();
        if (!targets.has(key)) targets.set(key, {raw: String(raw), reason});
    };
    for (const item of diag) {
        if (item.broken && item.shadowEntry) {
            addTarget(item.shadowEntry, item.deadShim
                ? `${item.tool} 走的是 Oracle javapath 转发壳，它指向的 Java 已经不在了（运行即被系统终止）`
                : `${item.tool} 命令能启动但没有任何输出（指向的目录已残缺）`);
        }
        for (const raw of item.staleEntries || []) addTarget(raw, `${item.tool} 的旧目录已经被搬空`);
    }

    // 还有一类纯垃圾：目录早就被删了，PATH 里还留着这条（只认工具特征词 / 已知安装根）
    const deadEntries = [];
    try {
        const parsed = await envProbe.readPathEntries();
        for (const entry of [...parsed.user, ...parsed.system]) {
            const dead = envProbe.isDeadLocalEntry(entry.raw);
            if (!dead) continue;
            addTarget(entry.raw, dead.reason);
            deadEntries.push(`${entry.scope}: ${dead.entry}`);
        }
    } catch (err) {
        warnings.push(`检查失效路径失败：${err.message}`);
    }

    const insideSandbox = (entry) => {
        const dir = envProbe.expandEntry(entry);
        if (!dir) return false;
        return path.resolve(dir).toLowerCase().startsWith(path.resolve(getRoot()).toLowerCase());
    };

    const staleSystem = [];

    if (targets.size) {
        try {
            const userPath = await env.getUserPath();
            const parts = String(userPath || '').split(';').filter(Boolean);
            const kept = [];
            for (const entry of parts) {
                const hit = targets.get(entry.toLowerCase());
                if (hit && !insideSandbox(entry)) removed.push(`user: ${entry}（${hit.reason}）`);
                else kept.push(entry);
            }
            if (kept.length !== parts.length) await env.setUserPath(kept.join(';'));
        } catch (err) {
            warnings.push(`清理用户 PATH 失败：${err.message}`);
        }

        try {
            const systemPath = await env.getSystemPath();
            const parts = String(systemPath || '').split(';').filter(Boolean);
            const kept = [];
            for (const entry of parts) {
                const hit = targets.get(entry.toLowerCase());
                if (hit && !insideSandbox(entry)) staleSystem.push(entry);
                else kept.push(entry);
            }
            if (staleSystem.length) {
                await env.setSystemPath(kept.join(';'));
                removed.push(...staleSystem.map((entry) => `system: ${entry}`));
                staleSystem.length = 0;
            }
        } catch (err) {
            // 没权限清系统 PATH：把待清理的条目留给上层提权
            if (!staleSystem.length) {
                try {
                    const systemPath = await env.getSystemPath();
                    const parts = String(systemPath || '').split(';').filter(Boolean);
                    for (const entry of parts) {
                        if (targets.has(entry.toLowerCase()) && !insideSandbox(entry)) staleSystem.push(entry);
                    }
                } catch (err2) {
                    warnings.push(`读取系统 PATH 失败：${err2.message}`);
                }
            }
        }
    }

    // 指向这些坏目录的自定义变量（未必叫 *_HOME）也一并报出来，让用户知道该改什么
    const affectedVars = [];
    try {
        const names = await listEnvVarNames('HKCU\\Environment');
        for (const name of names) {
            if (name.toUpperCase() === 'PATH') continue;
            let value = '';
            try {
                value = (await env.getUserEnvVariable(name)) || '';
            } catch (err) {
                continue;
            }
            const dir = envProbe.expandEntry(value);
            if (!dir || !dir.includes('\\')) continue;
            const hit = targets.get(dir.toLowerCase()) || targets.get(path.dirname(dir).toLowerCase());
            if (hit) affectedVars.push(`${name} = ${value}（${hit.reason}）`);
        }
    } catch (err) {
        warnings.push(`读取用户变量失败：${err.message}`);
    }

    return {
        ok: true,
        removed,
        affectedVars,
        deadEntries,
        needsAdmin: staleSystem.length > 0,
        systemStale: staleSystem,
        warnings,
        probe: diag.map((item) => ({
            tool: item.tool,
            command: item.command,
            effective: item.effective,
            verdict: item.probe ? item.probe.verdict : 'missing',
            detail: item.probe ? item.probe.detail : '',
            broken: Boolean(item.broken),
            deadShim: Boolean(item.deadShim),
            crashed: Boolean(item.crashed),
        })),
        // 探针跑出「进程被系统直接终止」的，只报告不清理，把可执行文件路径带回去方便自查
        crashed: diag
            .filter((item) => item.crashed)
            .map((item) => ({
                tool: item.tool,
                effective: item.effective,
                exitCode: item.probe.exitCode,
                detail: item.probe.detail,
            })),
    };
}

/**
 * 清理旧系统模式写入的环境变量与 PATH 条目
 * （系统级需要管理员；没有权限时返回 ok:false，不影响迁移本身）
 */
async function cleanLegacyEnv(tool) {
    const {
        getSystemPath, setSystemPath, deleteSystemEnvVariable,
        getUserPath, setUserPath, deleteUserEnvVariable,
    } = require('./env.cjs');

    const varPatterns = LEGACY_VAR_PATTERNS[tool] || [];
    const pathPatterns = LEGACY_PATH_PATTERNS[tool] || [];
    const isUserScope = tool === 'mysql';
    const removedVars = [];
    const warnings = [];

    // 变量：先列出再逐个删（reg query 全量键值）
    try {
        const names = await listEnvVarNames(isUserScope ? 'HKCU\\Environment' : 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment');
        for (const name of names) {
            if (!varPatterns.some(re => re.test(name))) continue;
            try {
                if (isUserScope) await deleteUserEnvVariable(name);
                else await deleteSystemEnvVariable(name);
                removedVars.push(name);
            } catch (err) {
                warnings.push(`${name}: ${err.message}`);
            }
        }
    } catch (err) {
        warnings.push(`读取环境变量失败: ${err.message}`);
    }

    // PATH 条目
    try {
        const current = isUserScope ? await getUserPath() : await getSystemPath();
        const parts = String(current || '').split(';');
        const kept = parts.filter(p => p && !pathPatterns.some(re => re.test(p)));
        if (kept.length !== parts.filter(Boolean).length) {
            if (isUserScope) await setUserPath(kept.join(';'));
            else await setSystemPath(kept.join(';'));
        }
    } catch (err) {
        warnings.push(`清理 PATH 失败（需要管理员权限）: ${err.message}`);
    }

    return {removedVars, warnings, ok: warnings.length === 0};
}

async function listEnvVarNames(key) {
    const {execCmd} = require('./env.cjs');
    const {stdout} = await execCmd(`C:\\Windows\\System32\\reg.exe query "${key}"`);
    const names = [];
    for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(/^\s{4}([A-Za-z0-9_()#@$%^&*\-\.]+)\s+REG_/);
        if (match) names.push(match[1]);
    }
    return names;
}

/**
 * 沙箱概览：给前端展示
 */
function getInfo() {
    const tools = {};
    for (const tool of Object.keys(TOOL_META)) {
        const installed = listInstalled(tool);
        tools[tool] = {
            root: path.join(getRoot(), tool),
            active: getActive(tool),
            injected: isInjectionEnabled(tool),
            injectable: INJECTABLE_TOOLS.includes(tool),
            label: TOOL_META[tool].label,
            envVar: TOOL_META[tool].envVar,
            versions: installed,
        };
    }
    // 已经接管（登记进沙箱）的安装目录不算「旧的安装」，否则接管完横幅还挂在界面上
    const legacy = scanLegacy().filter((item) => {
        const info = tools[item.tool];
        if (!info) return true;
        const target = path.resolve(item.dir).toLowerCase();
        return !info.versions.some((v) => v && v.dir && path.resolve(v.dir).toLowerCase() === target);
    });
    return {
        root: getRoot(),
        launcher: getLauncherPath(),
        statePath: getStatePath(),
        tools,
        legacy,
    };
}

/**
 * 查询某个工具当前的注入详情（用于「撤出」前给用户看清会删掉什么）
 */
async function getInjectionInfo(tool) {
    const meta = getToolMeta(tool);
    if (!meta) throw new Error(`未知工具: ${tool}`);
    const {getUserPath, getUserEnvVariable} = require('./env.cjs');
    const enabled = isInjectionEnabled(tool);
    const activeDir = getActiveDir(tool);
    const varValue = await getUserEnvVariable(meta.envVar);
    const userPath = await getUserPath();
    const patterns = injectionRemovePatterns(tool);
    const leakedEntries = userPath
        .split(';')
        .map(item => item.trim())
        .filter(item => item && patterns.some(re => re.test(item)));
    const state = readState();
    const backup = (state.injectionBackup || {})[tool] || null;
    return {
        tool,
        label: meta.label,
        injectable: INJECTABLE_TOOLS.includes(tool),
        enabled,
        varName: meta.envVar,
        varValue,
        activeDir,
        pathEntries: injectionPathEntries(tool),
        leakedEntries,
        hasResidue: !!(varValue || leakedEntries.length),
        original: backup ? backup.value : null,
    };
}

async function detachAllInjections() {
    const detached = [];
    for (const tool of INJECTABLE_TOOLS) {
        if (!isInjectionEnabled(tool)) continue;
        await setInjection(tool, false);
        detached.push(getToolMeta(tool).label);
    }
    return detached;
}

function resetCache() {
    stateCache = null;
}

/**
 * 卸载专用：把「我们写进去的东西」原样撤掉。
 *
 * 与 cleanLegacyAll（先探针、只清坏条目）不同，这里完全按归属判定：
 * 值指向沙箱根目录的变量 / PATH 条目就是我们的，一律撤掉；指向别处的一律不碰。
 * 系统 PATH 需要管理员权限，没权限就返回 needsAdmin 交给调用方提权重跑。
 */
async function purgeInjectedEnv() {
    const env = require('./env.cjs');
    const root = path.resolve(getRoot()).toLowerCase();
    const normalize = (value) => String(value || '')
        .trim()
        .replace(/"/g, '')
        .replace(/%LOCALAPPDATA%/ig, process.env.LOCALAPPDATA || '%LOCALAPPDATA%')
        .replace(/%APPDATA%/ig, process.env.APPDATA || '%APPDATA%');
    const underRoot = (value) => {
        const text = normalize(value);
        if (!text) return false;
        return path.resolve(text).toLowerCase().startsWith(root) || text.toLowerCase().startsWith(root);
    };

    const removedVars = [];
    const removedPathEntries = [];
    let needsAdmin = false;

    for (const meta of Object.values(TOOL_META)) {
        const name = meta && meta.envVar;
        if (!name) continue;
        try {
            const value = await env.getUserEnvVariable(name);
            if (value && underRoot(value)) {
                await env.deleteUserEnvVariable(name);
                removedVars.push(name);
            }
        } catch (err) {
            // 单个变量删不掉不影响整体
        }
    }

    try {
        const userPath = await env.getUserPath();
        const parts = String(userPath || '').split(';').filter(Boolean);
        const kept = parts.filter((entry) => !underRoot(entry));
        if (kept.length !== parts.length) {
            await env.setUserPath(kept.join(';'));
            removedPathEntries.push(...parts.filter((entry) => underRoot(entry)));
        }
    } catch (err) {
        needsAdmin = true;
    }

    try {
        const systemPath = await env.getSystemPath();
        const parts = String(systemPath || '').split(';').filter(Boolean);
        const stale = parts.filter((entry) => underRoot(entry));
        if (stale.length) {
            const kept = parts.filter((entry) => !underRoot(entry));
            await env.setSystemPath(kept.join(';'));
            removedPathEntries.push(...stale.map((entry) => `[系统] ${entry}`));
        }
    } catch (err) {
        // 没有管理员权限时写 HKLM 会失败，交给上层提权重试
        needsAdmin = true;
    }

    return {ok: true, removedVars, removedPathEntries, needsAdmin};
}

module.exports = {
    TOOL_META,
    INJECTABLE_TOOLS,
    getRoot,
    getStatePath,
    getLauncherPath,
    getLauncherPs1Path,
    ensureRoot,
    installDir,
    getVersionDir,
    removeDirIfSandboxed,
    isKnownDir,
    scanInstalled,
    listInstalled,
    looksInstalled,
    guessVersion,
    adopt,
    takeOverEnv,
    cleanLegacyAll,
    inspectEnvConflicts,
    removeSystemToolEntries,
    detectExistingInstalls,
    register,
    setToolPassword,
    getToolPassword,
    unregister,
    setActive,
    getActive,
    getActiveDir,
    pathEntries,
    buildPath,
    getTerminalEnv,
    getActiveSummary,
    syncLauncher,
    createShortcuts,
    getEnvCommand,
    isInjectionEnabled,
    setInjection,
    getInjectionInfo,
    detachAllInjections,
    scanLegacy,
    migrate,
    cleanLegacyEnv,
    purgeInjectedEnv,
    openTerminal,
    getInfo,
    resetCache,
    readState,
    writeState,
};
