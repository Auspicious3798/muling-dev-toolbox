/**
 * 中间件统一接入（Nacos / Sentinel / MinIO / RabbitMQ / Elasticsearch / Kibana）
 *
 * 这些工具的共同点：都是一个「常驻服务」——装到沙箱目录、按端口启动、能停能看状态。
 * 差异都在 TOOLS 表里描述，这个文件只负责通用的下载/解压/起停/端口/日志。
 */
const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const {spawn, exec} = require('child_process');
const {promisify} = require('util');
const execPromise = promisify(exec);
const configManager = require('../configManager.cjs');
const {downloadFile} = require('../utils/download.cjs');
const {installZip, zipProgress} = require('../utils/zip.cjs');
const {createLogger} = require('../utils/logger.cjs');
const sandbox = require('../utils/sandbox.cjs');
const servicePorts = require('../utils/servicePorts.cjs');
const portUtils = require('../utils/port.cjs');

// kind: zip 解压安装 / jar 单文件 / binary 单文件可执行
const TOOLS = {
    nacos: {
        label: 'Nacos',
        kind: 'zip',
        flattenPrefix: 'nacos',
        defaultPort: 8848,
        needsJava: true,
        // Nacos 的 startup.cmd 自己去调 java，必须把 JAVA_HOME 传进去
        startCommand: (dir) => ({file: 'cmd.exe', args: ['/c', path.join(dir, 'bin', 'startup.cmd'), '-m', 'standalone'], cwd: path.join(dir, 'bin')}),
        console: (port) => `http://127.0.0.1:${port}/nacos`,
    },
    sentinel: {
        label: 'Sentinel',
        kind: 'jar',
        defaultPort: 8858,
        needsJava: true,
        startCommand: (dir, port) => {
            const jar = findJar(dir);
            return {
                file: 'java',
                args: [`-Dserver.port=${port}`, `-Dcsp.sentinel.dashboard.server=127.0.0.1:${port}`, '-Dproject.name=sentinel-dashboard', '-jar', jar],
                cwd: dir,
            };
        },
        console: (port) => `http://127.0.0.1:${port}`,
    },
    rabbitmq: {
        label: 'RabbitMQ',
        kind: 'zip',
        flattenPrefix: 'rabbitmq_server-',
        defaultPort: 5672,
        extraPorts: {management: 15672},
        needsJava: false,
        startCommand: (dir) => ({file: 'cmd.exe', args: ['/c', path.join(dir, 'sbin', 'rabbitmq-server.bat')], cwd: path.join(dir, 'sbin')}),
        console: () => 'http://127.0.0.1:15672',
        // RabbitMQ 依赖 Erlang，启动前要先确认
        precheck: () => checkErlang(),
    },
    minio: {
        label: 'MinIO',
        kind: 'binary',
        binaryName: 'minio.exe',
        defaultPort: 9000,
        extraPorts: {console: 9001},
        needsJava: false,
        startCommand: (dir, port) => ({
            file: path.join(dir, 'minio.exe'),
            args: ['server', path.join(dir, 'data'), '--address', `:${port}`, '--console-address', `:${port + 1}`],
            cwd: dir,
            env: {MINIO_ROOT_USER: 'minioadmin', MINIO_ROOT_PASSWORD: 'minioadmin'},
        }),
        console: (port) => `http://127.0.0.1:${port + 1}`,
    },
    elasticsearch: {
        label: 'Elasticsearch',
        kind: 'zip',
        flattenPrefix: 'elasticsearch-',
        defaultPort: 9200,
        needsJava: false, // 自带 JDK
        startCommand: (dir) => ({file: 'cmd.exe', args: ['/c', path.join(dir, 'bin', 'elasticsearch.bat')], cwd: path.join(dir, 'bin')}),
        console: (port) => `http://127.0.0.1:${port}`,
    },
    kibana: {
        label: 'Kibana',
        kind: 'zip',
        flattenPrefix: 'kibana-',
        defaultPort: 5601,
        needsJava: false, // 自带 Node
        startCommand: (dir) => ({file: 'cmd.exe', args: ['/c', path.join(dir, 'bin', 'kibana.bat')], cwd: path.join(dir, 'bin')}),
        console: (port) => `http://127.0.0.1:${port}`,
    },
};

function findJar(dir) {
    try {
        const hit = fs.readdirSync(dir).find((name) => name.toLowerCase().endsWith('.jar'));
        return hit ? path.join(dir, hit) : path.join(dir, 'app.jar');
    } catch (err) {
        return path.join(dir, 'app.jar');
    }
}

async function checkErlang() {
    try {
        const {stdout} = await execPromise('erl -version', {windowsHide: true, timeout: 5000});
        return {ok: true, version: String(stdout || '').trim()};
    } catch (err) {
        return {ok: false, message: err.message};
    }
}

module.exports = function registerMiddlewareHandlers(mainWindow, userDataPath) {
    const downloadDir = path.join(userDataPath, 'downloads');
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, {recursive: true});
    const logFile = path.join(userDataPath, 'middleware_install.log');
    const logToFile = createLogger(logFile);

    const processes = new Map(); // `${tool}@${version}` -> ChildProcess
    const abortControllers = new Map();

    const key = (tool, version) => `${tool}@${version}`;
    const def = (tool) => TOOLS[tool] || null;
    const channel = (tool, suffix) => `${tool}-${suffix}`;

    function resolveJavaHome() {
        const activeJdk = sandbox.getActiveDir('jdk');
        if (activeJdk && fs.existsSync(path.join(activeJdk, 'bin', 'java.exe'))) return activeJdk;
        if (process.env.JAVA_HOME && fs.existsSync(path.join(process.env.JAVA_HOME, 'bin', 'java.exe'))) return process.env.JAVA_HOME;
        return null;
    }

    function toolConfig(tool) {
        return configManager.getToolConfig(tool);
    }

    function resolveVersionEntry(tool, version) {
        const cfg = toolConfig(tool) || {};
        const versions = cfg.versions || {};
        const wanted = version || cfg.version || Object.keys(versions)[0];
        const entry = versions[wanted];
        if (!entry) return null;
        return {version: wanted, url: entry.url, type: entry.type || 'zip'};
    }

    function findHome(tool, version) {
        const hit = sandbox.listInstalled(tool).find((item) => item.version === version);
        if (hit && fs.existsSync(hit.dir)) return hit.dir;
        const dir = sandbox.installDir(tool, version);
        return fs.existsSync(dir) ? dir : null;
    }

    function pidPath(dir) {
        return path.join(dir, 'muling.pid');
    }

    function serviceLog(dir) {
        return path.join(dir, 'muling-service.log');
    }

    function send(tool, state, extra = {}) {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send(channel(tool, 'progress'), {type: tool, state, ...extra});
    }

    async function isRunning(tool, version, dir) {
        const proc = processes.get(key(tool, version));
        if (proc && !proc.killed) return true;
        if (!dir) return false;
        const file = pidPath(dir);
        if (!fs.existsSync(file)) return false;
        const pid = parseInt(fs.readFileSync(file, 'utf8').trim(), 10);
        if (!pid) return false;
        try {
            const {stdout} = await execPromise(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {windowsHide: true, timeout: 5000});
            if (stdout.includes(String(pid))) return true;
        } catch (err) {
            // 查询失败就当没在跑
        }
        try {
            fs.unlinkSync(file);
        } catch (err) {
            // ignore
        }
        return false;
    }

    async function startService(tool, version) {
        const meta = def(tool);
        const home = findHome(tool, version);
        if (!home) throw new Error(`未找到 ${meta.label} ${version} 的安装目录`);
        if (await isRunning(tool, version, home)) throw new Error(`${meta.label} ${version} 已经在运行`);

        if (meta.needsJava) {
            const javaHome = resolveJavaHome();
            if (!javaHome) throw new Error(`${meta.label} 需要 JDK：请先在环境盒里安装 JDK（或接管电脑上已有的 JDK）`);
        }
        if (meta.precheck) {
            const result = await meta.precheck();
            if (!result.ok) throw new Error(`${meta.label} 依赖 Erlang，但当前环境没找到 erl（${result.message}）`);
        }

        const port = servicePorts.getPort(userDataPath, tool, version) || meta.defaultPort;
        const spec = meta.startCommand(home, port);
        const env = {...process.env, ...(spec.env || {})};
        if (meta.needsJava) {
            const javaHome = resolveJavaHome();
            if (javaHome) {
                env.JAVA_HOME = javaHome;
                env.PATH = `${path.join(javaHome, 'bin')};${env.PATH || ''}`;
            }
        }

        const logStream = fs.createWriteStream(serviceLog(home), {flags: 'a'});
        logStream.write(`\n===== ${new Date().toISOString()} 启动 ${tool} ${version} 端口 ${port} =====\n`);

        const proc = spawn(spec.file, spec.args, {
            cwd: spec.cwd || home,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env,
            shell: spec.file === 'java' && process.platform === 'win32',
        });
        proc.stdout.on('data', (chunk) => logStream.write(chunk));
        proc.stderr.on('data', (chunk) => logStream.write(chunk));
        proc.on('exit', (code) => {
            logToFile(`[${tool}] 进程退出 code=${code}`);
            logStream.write(`\n===== 进程退出 code=${code} =====\n`);
            processes.delete(key(tool, version));
            try {
                const file = pidPath(home);
                if (fs.existsSync(file)) fs.unlinkSync(file);
            } catch (err) {
                // ignore
            }
        });
        processes.set(key(tool, version), proc);
        fs.writeFileSync(pidPath(home), String(proc.pid), 'utf8');
        logToFile(`[${tool}] 已启动 ${version} pid=${proc.pid} port=${port}`);

        // 等服务把端口占上，最多等 60 秒（ES / Kibana 起得慢）
        const ok = await waitForPort(port, 60000);
        return {pid: proc.pid, port, ready: ok};
    }

    async function waitForPort(port, timeoutMs) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (!(await portUtils.isPortAvailable(port))) return true;
            await new Promise((resolve) => setTimeout(resolve, 800));
        }
        return false;
    }

    async function stopService(tool, version) {
        const home = findHome(tool, version);
        const proc = processes.get(key(tool, version));
        let pid = proc ? proc.pid : null;
        if (!pid && home && fs.existsSync(pidPath(home))) {
            const parsed = parseInt(fs.readFileSync(pidPath(home), 'utf8').trim(), 10);
            if (parsed) pid = parsed;
        }
        if (!pid) return false;
        await new Promise((resolve) => {
            exec(`taskkill /PID ${pid} /T /F`, {windowsHide: true}, () => resolve());
        });
        processes.delete(key(tool, version));
        if (home) {
            try {
                const file = pidPath(home);
                if (fs.existsSync(file)) fs.unlinkSync(file);
            } catch (err) {
                // ignore
            }
        }
        return true;
    }

    function emit(tool) {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel(tool, 'changed'));
    }

    for (const tool of Object.keys(TOOLS)) {
        const meta = TOOLS[tool];

        ipcMain.on(`cancel-${tool}-download`, () => {
            const controller = abortControllers.get(tool);
            if (controller) {
                controller.abort();
                abortControllers.delete(tool);
            }
        });

        ipcMain.handle(`check-${tool}`, async () => {
            const items = sandbox.listInstalled(tool);
            const active = sandbox.getActive(tool);
            return {
                installed: items.length > 0,
                versions: items.map((item) => item.version),
                default: active,
                items,
                serviceCapable: true,
            };
        });

        ipcMain.handle(`install-${tool}`, async (event, version) => {
            const entry = resolveVersionEntry(tool, version);
            if (!entry || !entry.url) return {success: false, message: `没有找到 ${meta.label} 的下载地址`};
            const installPath = sandbox.installDir(tool, entry.version);
            const fileName = path.basename(new URL(entry.url).pathname) || `${tool}-${entry.version}.zip`;
            const installerPath = path.join(downloadDir, fileName);

            try {
                if (!fs.existsSync(installerPath)) {
                    const controller = new AbortController();
                    abortControllers.set(tool, controller);
                    send(tool, 'downloading', {progress: 0, stage: '下载安装包'});
                    await downloadFile({
                        url: entry.url,
                        destPath: installerPath,
                        signal: controller.signal,
                        onProgress: (info) => send(tool, 'downloading', {progress: (info.percent ?? 0) * 0.6, stage: '下载安装包', speed: info.speed, received: info.received, total: info.total}),
                        log: logToFile,
                        label: `${meta.label}下载`,
                        timeout: 1800000,
                    });
                }
                send(tool, 'installing', {progress: 0.62, stage: '解压中'});
                if (meta.kind === 'zip') {
                    await installZip(installerPath, installPath, {
                        log: logToFile,
                        flattenPrefix: meta.flattenPrefix,
                        onProgress: zipProgress((p, stage) => send(tool, 'installing', {progress: 0.62 + p * 0.3, stage}), 0, 0.3),
                    });
                } else if (meta.kind === 'jar') {
                    fs.mkdirSync(installPath, {recursive: true});
                    fs.copyFileSync(installerPath, path.join(installPath, path.basename(installerPath)));
                } else {
                    fs.mkdirSync(installPath, {recursive: true});
                    fs.copyFileSync(installerPath, path.join(installPath, meta.binaryName || path.basename(installerPath)));
                }
                send(tool, 'installing', {progress: 0.95, stage: '登记到环境盒'});
                sandbox.register(tool, entry.version, installPath, {activate: true});
                send(tool, 'done', {progress: 1, stage: '安装完成'});
                emit(tool);
                return {success: true, version: entry.version, message: `${meta.label} ${entry.version} 安装成功`};
            } catch (err) {
                logToFile(`[${tool}] 安装失败: ${err.message}`);
                if (String(err.message).includes('取消')) return {success: false, message: '下载已取消'};
                return {success: false, message: `安装失败: ${err.message}`};
            } finally {
                abortControllers.delete(tool);
            }
        });

        ipcMain.handle(`switch-${tool}`, async (event, version) => {
            if (!version) return {success: false, message: '没有指定版本'};
            if (!findHome(tool, version)) return {success: false, message: `${meta.label} ${version} 的安装目录不存在`};
            sandbox.setActive(tool, version);
            emit(tool);
            return {success: true, message: `已切换到 ${meta.label} ${version}`};
        });

        ipcMain.handle(`uninstall-${tool}`, async (event, version) => {
            try {
                const target = version || sandbox.getActive(tool);
                if (target) await stopService(tool, target);
                const dir = target ? sandbox.getVersionDir(tool, target) : null;
                const removal = dir ? sandbox.removeDirIfSandboxed(dir) : {removed: false, sandboxed: true, dir};
                if (target) sandbox.unregister(tool, target);
                emit(tool);
                if (dir && !removal.sandboxed) return {success: true, message: `已解除 ${meta.label} 的登记，文件仍保留在 ${removal.dir}`};
                return {success: true, message: `${meta.label} 已卸载`};
            } catch (err) {
                return {success: false, message: err.message};
            }
        });

        ipcMain.handle(`start-${tool}-service`, async (event, version) => {
            try {
                const target = version || sandbox.getActive(tool);
                const result = await startService(tool, target);
                sandbox.setActive(tool, target);
                emit(tool);
                return {
                    success: true,
                    port: result.port,
                    message: result.ready
                        ? `${meta.label} 已启动，端口 ${result.port}`
                        : `${meta.label} 进程已拉起（PID ${result.pid}），端口 ${result.port} 还在初始化，稍等十几秒再访问`,
                };
            } catch (err) {
                logToFile(`[${tool}] 启动失败: ${err.message}`);
                return {success: false, message: err.message};
            }
        });

        ipcMain.handle(`stop-${tool}-service`, async (event, version) => {
            try {
                const target = version || sandbox.getActive(tool);
                const stopped = await stopService(tool, target);
                emit(tool);
                return stopped
                    ? {success: true, message: `${meta.label} 已停止`}
                    : {success: false, message: `${meta.label} 当前没有在运行`};
            } catch (err) {
                return {success: false, message: err.message};
            }
        });

        ipcMain.handle(`get-${tool}-service-status`, async (event, version) => {
            try {
                const home = findHome(tool, version);
                const running = await isRunning(tool, version, home);
                return {success: true, status: running ? 'running' : 'stopped'};
            } catch (err) {
                return {success: false, status: 'error', message: err.message};
            }
        });

        ipcMain.handle(`get-${tool}-config`, async (event, version) => {            const home = findHome(tool, version);
            if (!home) return {success: false, message: '未找到安装目录'};
            const port = servicePorts.getPort(userDataPath, tool, version) || meta.defaultPort;
            const running = await isRunning(tool, version, home);
            return {
                success: true,
                port,
                defaultPort: meta.defaultPort,
                running,
                dir: home,
                console: meta.console ? meta.console(port) : '',
                logPath: serviceLog(home),
            };
        });

        ipcMain.handle(`get-${tool}-log`, async (event, version) => {
            const home = findHome(tool, version);
            if (!home) return {success: false, message: '未找到安装目录', lines: []};
            const file = serviceLog(home);
            try {
                if (!fs.existsSync(file)) return {success: true, lines: [], path: file};
                const text = fs.readFileSync(file, 'utf8');
                return {success: true, path: file, lines: text.split(/\r?\n/).filter(Boolean).slice(-200)};
            } catch (err) {
                return {success: false, message: err.message, lines: []};
            }
        });

        ipcMain.handle(`set-${tool}-port`, async (event, version, port) => {
            const num = Number(port);
            if (!servicePorts.isValidPort(num)) return {success: false, message: '端口需要是 1024-65535 之间的数字'};
            const available = await portUtils.isPortAvailable(num);
            if (!available) return {success: false, message: `端口 ${num} 已被占用`};
            if (!servicePorts.setPort(userDataPath, tool, version, num)) return {success: false, message: '保存端口失败'};
            return {success: true, message: `端口已改成 ${num}，下次启动生效`, port: num};
        });
    }

    return {TOOLS};
};
