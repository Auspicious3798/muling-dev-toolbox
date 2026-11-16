const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const SETX = 'C:\\Windows\\System32\\setx.exe';
const REG = 'C:\\Windows\\System32\\reg.exe';
const SYSTEM_ENV_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';

/* --------------------------- 写前快照 / 写后校验 --------------------------- */

/**
 * 快照目录：%APPDATA%\muling-environment-box\env-backups
 * 每次改动 PATH / 环境变量前都会落一份，出问题可以一键还原（或人工对照）。
 */
function backupDir() {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '.', 'AppData', 'Roaming');
    return path.join(appData, 'muling-environment-box', 'env-backups');
}

function stamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * 同步读一条注册表值（原始值，不展开 %VAR%）。
 */
function readRegRaw(hive, name) {
    try {
        const { execFileSync } = require('child_process');
        const out = execFileSync(REG, ['query', hive, '/v', name], { windowsHide: true, encoding: 'utf8' });
        const match = out.match(new RegExp(`${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)`, 'i'));
        return match && match[1] ? match[1].trim() : '';
    } catch (err) {
        return '';
    }
}

/**
 * 把当前 HKCU/HKLM 的 PATH 与所有 *_HOME 变量落盘。
 * @param {string} reason 触发原因，写进文件名，方便事后追溯
 * @returns {string} 快照文件路径（失败返回空串，绝不阻断主流程）
 */
function backupEnv(reason = 'change') {
    try {
        const dir = backupDir();
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${stamp()}-${String(reason).replace(/[^a-z0-9_-]/gi, '')}.json`);
        const userKey = 'HKCU\\Environment';
        const payload = {
            createdAt: new Date().toISOString(),
            reason,
            userPath: readRegRaw(userKey, 'Path'),
            systemPath: readRegRaw(SYSTEM_ENV_KEY, 'Path'),
            vars: {},
        };
        // 顺带把常见的 *_HOME 记下来（人工还原时用得上）
        for (const name of ['JAVA_HOME', 'JAVA_HOME17', 'NODE_HOME', 'MAVEN_HOME', 'GRADLE_HOME', 'PYTHON_HOME', 'UV_HOME']) {
            const user = readRegRaw(userKey, name);
            const machine = readRegRaw(SYSTEM_ENV_KEY, name);
            if (user || machine) payload.vars[name] = {user, machine};
        }
        fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
        pruneBackups(dir);
        return file;
    } catch (err) {
        return '';
    }
}

function pruneBackups(dir, keep = 30) {
    try {
        const files = fs.readdirSync(dir)
            .filter((name) => name.endsWith('.json'))
            .map((name) => ({name, time: fs.statSync(path.join(dir, name)).mtimeMs}))
            .sort((a, b) => b.time - a.time);
        for (const item of files.slice(keep)) {
            fs.unlinkSync(path.join(dir, item.name));
        }
    } catch (err) {
        // 清理失败无所谓
    }
}

/**
 * 用 reg add 写 PATH：保留 REG_EXPAND_SZ 类型，不会像 setx 那样截断到 1024 字符。
 */
function writePathViaReg(hive, value) {
    return new Promise((resolve, reject) => {
        const escaped = String(value).replace(/"/g, '\\"');
        const cmd = `${REG} add "${hive}" /v Path /t REG_EXPAND_SZ /d "${escaped}" /f`;
        exec(cmd, {windowsHide: true, timeout: 15000}, (err) => {
            if (err) return reject(new Error(`写入 PATH 失败：${err.message}`));
            resolve();
        });
    });
}

/**
 * 统一封装：写前快照 → 写入 → 读回校验 → 不一致就回滚。
 */
async function guardedPathWrite(hive, buildValue, label) {
    const before = readRegRaw(hive, 'Path');
    const snapshot = before;
    const backupFile = backupEnv(`path-${label}`);
    if (!backupFile) {
        // 拿不到快照就不动 PATH —— 宁可这次不改，也不能把用户环境改坏
        throw new Error(`${label} PATH 快照写入失败，已取消本次修改`);
    }
    const value = buildValue(before);
    if (typeof value !== 'string') {
        throw new Error(`${label} PATH 计算失败`);
    }
    if (value === before) return {changed: false, backupFile};
    await writePathViaReg(hive, value);
    const after = readRegRaw(hive, 'Path');
    if (after !== value) {
        // 读回不一致：立刻还原，避免把用户的 PATH 留成半截
        try { await writePathViaReg(hive, snapshot); } catch (err) { /* 还原也失败就只能报错 */ }
        throw new Error(`${label} PATH 写入校验失败（期望 ${value.length} 字符，实际 ${after.length} 字符），已还原`);
    }
    return {changed: true, backupFile, before, after};
}

/**
 * 执行命令，返回 Promise<{stdout, stderr}>；失败时 reject(带有 stdout/stderr 的 Error)。
 */
function execCmd(cmd, opts = {}) {
    return new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true, ...opts }, (error, stdout, stderr) => {
            if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); }
            else resolve({ stdout, stderr });
        });
    });
}

/**
 * 纯函数：从 PATH 中剔除匹配任意正则的条目，并把新条目插到最前。
 * @param {string} currentPath
 * @param {RegExp[]} removePatterns  需要移除的条目匹配正则
 * @param {string[]} entries         需要前置的新条目
 * @returns {string}
 */
function filterAndPrepend(currentPath, removePatterns, entries) {
    const parts = String(currentPath).split(';');
    const kept = parts.filter(p => !removePatterns.some(re => re.test(p)));
    return [...entries, ...kept].join(';');
}

/* ------------------------------ 系统级（需管理员） ------------------------------ */

/**
 * 设置系统级环境变量（setx /M + PowerShell 刷新当前进程）。
 */
function setSystemEnvVariable(name, value, { log = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        const setxCmd = `${SETX} /M "${name}" "${value}"`;
        log(`执行 setx: ${setxCmd}`);
        exec(setxCmd, { windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                log(`setx 失败: ${stderr || error.message}`);
                return reject(new Error(`设置系统变量失败: ${stderr || error.message}`));
            }
            log(`setx 成功: ${name}=${value}`);
            const psRefresh = `$env:${name} = "${value}"`;
            exec(`powershell -NoProfile -Command "${psRefresh.replace(/"/g, '\\"')}"`, (err) => {
                if (err) log(`刷新当前进程 ${name} 失败: ${err.message}`);
                resolve();
            });
        });
    });
}

/**
 * 删除系统级环境变量。
 */
function removeSystemEnvVariable(name, { log = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        const setxCmd = `${SETX} /M "${name}" ""`;
        log(`执行 setx: ${setxCmd}`);
        exec(setxCmd, { windowsHide: true }, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

/**
 * 彻底删除系统级环境变量（reg delete，比 setx 置空更干净）。
 */
function deleteSystemEnvVariable(name, { log = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        const cmd = `${REG} delete "${SYSTEM_ENV_KEY}" /v "${name}" /f`;
        log(`执行 reg delete: ${cmd}`);
        exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                // 变量本来就不存在时 reg 会返回错误，视为成功
                if (/unable to find|找不到/i.test(stderr || stdout || '')) return resolve();
                return reject(new Error(`删除系统变量失败: ${stderr || error.message}`));
            }
            resolve();
        });
    });
}

/**
 * 读取系统级 PATH 值。
 */
async function getSystemPath() {
    try {
        const { stdout } = await execCmd(`${REG} query "${SYSTEM_ENV_KEY}" /v Path`);
        const match = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
        return match && match[1] ? match[1].trim() : '';
    } catch { return ''; }
}

/**
 * 写入系统级 PATH（写前快照 + 读回校验 + 不一致自动还原）。
 * 不再用 setx：它会把超过 1024 字符的值截断。
 */
async function setSystemPath(newPath, { log = () => {} } = {}) {
    log(`准备写入系统 PATH，长度=${String(newPath).length}`);
    const result = await guardedPathWrite(SYSTEM_ENV_KEY, () => String(newPath), '系统');
    if (result.backupFile) log(`系统 PATH 快照已保存: ${result.backupFile}`);
    log(result.changed ? `系统 PATH 写入成功，长度=${String(newPath).length}` : '系统 PATH 无变化，跳过写入');
    return result;
}

/**
 * 以系统注册表为准刷新当前进程的 PATH（展开 %VAR%）。
 * @param {object} [extra] 需要优先展开的变量，如 { MAVEN_HOME: '...' }
 */
async function refreshSystemPath({ extra = {}, log = () => {} } = {}) {
    try {
        let systemPath = await getSystemPath();
        for (const [name, value] of Object.entries(extra)) {
            if (value) systemPath = systemPath.split(`%${name}%`).join(value);
        }
        process.env.Path = systemPath.replace(/%([^%]+)%/g, (_, name) => process.env[name] || `%${name}%`);
    } catch (err) {
        log(`刷新环境变量失败: ${err.message}`);
    }
}

/* ------------------------------ 用户级（mysql 使用） ------------------------------ */

/**
 * 设置用户级环境变量（PowerShell，User 作用域）。
 */
function setUserEnvVariable(name, value, { log = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        const psCmd = `[Environment]::SetEnvironmentVariable('${name}', '${String(value).replace(/'/g, "''")}', 'User')`;
        const fullCmd = `powershell -Command "${psCmd}"`;
        log(`执行 PowerShell 设置环境变量: ${name}=${value}`);
        exec(fullCmd, { windowsHide: true, timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                if (error.killed) return reject(new Error(`设置环境变量超时: ${name}`));
                return reject(new Error(`设置环境变量失败: ${stderr || error.message}`));
            }
            log(`环境变量设置成功: ${name}=${value}`);
            process.env[name] = value;
            resolve();
        });
    });
}

/**
 * 删除用户级环境变量。
 */
function removeUserEnvVariable(name, { log = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        const setxCmd = `setx "${name}" ""`;
        log(`执行 setx: ${setxCmd}`);
        exec(setxCmd, { windowsHide: true }, (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

/**
 * 彻底删除用户级环境变量（reg delete HKCU）。
 */
function deleteUserEnvVariable(name, { log = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        const cmd = `${REG} delete "HKCU\\Environment" /v "${name}" /f`;
        log(`执行 reg delete (用户): ${cmd}`);
        exec(cmd, { windowsHide: true }, (error, stdout, stderr) => {
            if (error) {
                if (/unable to find|找不到/i.test(stderr || stdout || '')) return resolve();
                return reject(new Error(`删除用户变量失败: ${stderr || error.message}`));
            }
            resolve();
        });
    });
}

/**
 * 读取用户级 PATH 值。
 */
async function getUserPath() {
    return new Promise((resolve) => {
        exec(`${REG} query HKCU\\Environment /v PATH`, { windowsHide: true }, (error, stdout) => {
            if (error) return resolve('');
            const match = stdout.match(/PATH\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
            resolve(match && match[1] ? match[1].trim() : '');
        });
    });
}

/**
 * 写入用户级 PATH（写前快照 + 读回校验 + 不一致自动还原）。
 * 走 reg add REG_EXPAND_SZ，保留 %VAR% 原样，不会被展开成写死的 C:\WINDOWS。
 */
async function setUserPath(newPath, { log = () => {} } = {}) {
    log(`准备写入用户 PATH，长度=${String(newPath).length}`);
    const result = await guardedPathWrite('HKCU\\Environment', () => String(newPath), '用户');
    if (result.backupFile) log(`用户 PATH 快照已保存: ${result.backupFile}`);
    log(result.changed ? `用户 PATH 写入成功，长度=${String(newPath).length}` : '用户 PATH 无变化，跳过写入');
    return result;
}

async function getUserEnvVariable(name) {
    return new Promise((resolve) => {
        exec(`${REG} query HKCU\\Environment /v ${name}`, { windowsHide: true }, (error, stdout) => {
            if (error) return resolve('');
            const match = stdout.match(new RegExp(`${name}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)`, 'i'));
            resolve(match && match[1] ? match[1].trim() : '');
        });
    });
}

module.exports = {
    execCmd,
    filterAndPrepend,
    backupDir,
    backupEnv,
    guardedPathWrite,
    readRegRaw,
    setSystemEnvVariable,
    removeSystemEnvVariable,
    deleteSystemEnvVariable,
    getSystemPath,
    setSystemPath,
    refreshSystemPath,
    setUserEnvVariable,
    removeUserEnvVariable,
    deleteUserEnvVariable,
    getUserPath,
    getUserEnvVariable,
    setUserPath,
};