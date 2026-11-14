const { exec } = require('child_process');

const SETX = 'C:\\Windows\\System32\\setx.exe';
const REG = 'C:\\Windows\\System32\\reg.exe';
const SYSTEM_ENV_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';

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
 * 写入系统级 PATH。
 */
function setSystemPath(newPath, { log = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        const setxCmd = `${SETX} /M PATH "${newPath}"`;
        log(`执行 setx PATH: ${setxCmd}`);
        exec(setxCmd, { windowsHide: true }, (err) => {
            if (err) return reject(new Error(`设置 PATH 失败: ${err.message}`));
            log(`PATH 设置成功: ${newPath}`);
            resolve();
        });
    });
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
 * 写入用户级 PATH。
 */
function setUserPath(newPath, { log = () => {} } = {}) {
    return new Promise((resolve, reject) => {
        const psCmd = `[Environment]::SetEnvironmentVariable('PATH', '${String(newPath).replace(/'/g, "''")}', 'User')`;
        const fullCmd = `powershell -Command "${psCmd}"`;
        log(`执行 PowerShell 设置 PATH (用户): 长度=${newPath.length}`);
        exec(fullCmd, { windowsHide: true, timeout: 15000 }, (err) => {
            if (err) {
                if (err.killed) return reject(new Error('设置 PATH 超时'));
                return reject(new Error(`设置用户 PATH 失败: ${err.message}`));
            }
            log(`用户 PATH 设置成功: 长度=${newPath.length}`);
            resolve();
        });
    });
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