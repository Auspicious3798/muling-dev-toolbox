/**
 * 以「完全不弹窗」的方式启动控制台程序（mysqld.exe / redis-server.exe 这类）。
 *
 * 为什么不能直接用 spawn({windowsHide:true})：
 *   mysqld 这类程序在拿不到控制台时会自己调 AllocConsole()，CREATE_NO_WINDOW 拦不住，
 *   结果就是每启动一次服务，桌面上就多一个黑窗口，关掉它服务就断了。
 *   用 Start-Process -WindowStyle Hidden 启动，窗口的 STARTUPINFO 带上 SW_HIDE，
 *   进程自己再 AllocConsole 也是隐藏的，服务在后台安静跑。
 */
const {execFile} = require('child_process');
const path = require('path');

const POWERSHELL = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
);

function quote(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * 启动一个隐藏窗口的进程，解析出 PID。
 * @param {string} exePath 可执行文件绝对路径
 * @param {string[]} args 参数数组
 * @param {string} cwd 工作目录
 * @returns {Promise<number>} 子进程 PID
 */
function spawnHidden(exePath, args = [], cwd) {
    return new Promise((resolve, reject) => {
        const script = [
            `Start-Process -FilePath ${quote(exePath)}`,
            args.length ? `-ArgumentList ${args.map(quote).join(',')}` : '',
            cwd ? `-WorkingDirectory ${quote(cwd)}` : '',
            '-WindowStyle Hidden',
            '-PassThru | ForEach-Object { $_.Id }'
        ].filter(Boolean).join(' ');

        execFile(
            POWERSHELL,
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
            {windowsHide: true, timeout: 20000},
            (err, stdout) => {
                if (err) return reject(err);
                const pid = parseInt(String(stdout).trim(), 10);
                if (!Number.isFinite(pid) || pid <= 0) {
                    return reject(new Error(`无法获取隐藏启动的进程 PID：${stdout}`));
                }
                resolve(pid);
            }
        );
    });
}

module.exports = {spawnHidden};
