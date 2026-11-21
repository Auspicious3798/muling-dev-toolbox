const os = require('os');
const net = require('net');
const {exec} = require('child_process');
const sandbox = require('../utils/sandbox.cjs');

const TOOL_IDS = ['jdk', 'python', 'mysql', 'redis', 'maven', 'nginx', 'gradle', 'uv', 'nodejs', 'miniconda'];

const CHECK_METHODS = {
    jdk: 'checkJDK',
    python: 'checkPython',
    mysql: 'checkMySQL',
    redis: 'checkRedis',
    maven: 'checkMaven',
    nginx: 'checkNginx',
    gradle: 'checkGradle',
    uv: 'checkUv',
    nodejs: 'checkNodejs',
    miniconda: 'checkMiniconda',
};

const SERVICE_LABELS = {mysql: 'MySQL', redis: 'Redis', nginx: 'Nginx'};

const DEFINITIONS = [
    {
        name: 'toolbox_overview',
        description: '查看沐柠环境盒的整体状态：每个开发工具装了哪些版本、当前激活版本，以及 MySQL / Redis / Nginx 服务的运行状态。智能体在动手前应先调用它了解环境。',
        inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    },
    {
        name: 'toolbox_check_tool',
        description: '查询单个开发工具的安装信息（已安装版本列表、当前激活版本、安装目录）。',
        inputSchema: {
            type: 'object',
            properties: {
                tool: {type: 'string', enum: TOOL_IDS, description: '工具 id'},
            },
            required: ['tool'],
            additionalProperties: false,
        },
    },
    {
        name: 'toolbox_service',
        description: '启动 / 停止 / 重启 / 查询 MySQL、Redis、Nginx 服务。启动 MySQL、Redis 时需要指定已安装的版本，不传则用当前激活版本。',
        inputSchema: {
            type: 'object',
            properties: {
                service: {type: 'string', enum: ['mysql', 'redis', 'nginx'], description: '服务名'},
                action: {type: 'string', enum: ['start', 'stop', 'restart', 'status'], description: '操作'},
                version: {type: 'string', description: 'MySQL / Redis 的版本号，可省略'},
            },
            required: ['service', 'action'],
            additionalProperties: false,
        },
    },
    {
        name: 'toolbox_run_command',
        description: '在环境盒的沙箱环境里执行一条 Windows 命令（自动注入已激活工具的 PATH 与 JAVA_HOME 等变量），返回退出码、stdout、stderr。适合跑 java -version、mvn -v、mysql --version 这类验证命令。',
        inputSchema: {
            type: 'object',
            properties: {
                command: {type: 'string', description: '要执行的命令，例如 java -version'},
                cwd: {type: 'string', description: '工作目录，默认沙箱根目录'},
                timeout_ms: {type: 'number', description: '超时毫秒，默认 30000，最大 120000'},
            },
            required: ['command'],
            additionalProperties: false,
        },
    },
    {
        name: 'toolbox_check_port',
        description: '检查本机某个端口是否已被占用（例如确认 3306 能不能起 MySQL）。',
        inputSchema: {
            type: 'object',
            properties: {
                port: {type: 'number', description: '端口号，1-65535'},
            },
            required: ['port'],
            additionalProperties: false,
        },
    },
    {
        name: 'toolbox_system_stats',
        description: '获取本机 CPU 使用率、内存使用率、运行时长等基础系统指标。',
        inputSchema: {type: 'object', properties: {}, additionalProperties: false},
    },
];

function clampText(text, limit = 12000) {
    const value = typeof text === 'string' ? text : JSON.stringify(text);
    if (value.length <= limit) return value;
    return value.slice(0, limit) + `\n…（已截断，共 ${value.length} 字符）`;
}

function cpuUsage() {
    return new Promise((resolve) => {
        const start = os.cpus().map((cpu) => cpu.times);
        setTimeout(() => {
            const end = os.cpus().map((cpu) => cpu.times);
            const usage = start.map((s, i) => {
                const idle = end[i].idle - s.idle;
                const total = (end[i].user + end[i].nice + end[i].sys + end[i].idle + end[i].irq)
                    - (s.user + s.nice + s.sys + s.idle + s.irq);
                return total > 0 ? 1 - idle / total : 0;
            });
            const avg = usage.reduce((a, b) => a + b, 0) / (usage.length || 1);
            resolve(Math.round(avg * 100));
        }, 120);
    });
}

function portInUse(port) {
    return new Promise((resolve) => {
        const socket = net.connect({host: '127.0.0.1', port, timeout: 1200});
        const done = (result) => {
            socket.destroy();
            resolve(result);
        };
        socket.once('connect', () => done(true));
        socket.once('timeout', () => done(false));
        socket.once('error', () => done(false));
    });
}

function runCommand(command, args, ctx) {
    const timeout = Math.min(Math.max(Number(args.timeout_ms) || ctx.config.commandTimeout, 2000), 120000);
    const cwd = args.cwd && String(args.cwd).trim() ? String(args.cwd) : sandbox.getRoot();
    const env = sandbox.getTerminalEnv({});
    const startedAt = Date.now();
    return new Promise((resolve) => {
        exec(command, {
            cwd,
            env,
            timeout,
            windowsHide: true,
            maxBuffer: 1024 * 1024 * 4,
            encoding: 'utf8',
        }, (err, stdout, stderr) => {
            const exitCode = err && typeof err.code === 'number' ? err.code : (err ? 1 : 0);
            resolve({
                command,
                cwd,
                exitCode,
                timedOut: Boolean(err && err.killed),
                durationMs: Date.now() - startedAt,
                stdout: String(stdout || '').slice(0, 8000),
                stderr: String(stderr || '').slice(0, 4000),
                error: err && err.message ? err.message : '',
            });
        });
    });
}

async function serviceStatus(service, ctx) {
    const version = sandbox.getActive(service) || '';
    if (typeof ctx.callRenderer !== 'function') {
        return {service, status: 'unknown', message: '主窗口未就绪'};
    }
    try {
        if (service === 'nginx') {
            const res = await ctx.callRenderer('getNginxStatus', [], 6000);
            return {service, status: res && res.running ? 'running' : (res && res.status) || 'unknown', detail: res};
        }
        const method = service === 'mysql' ? 'getMySQLServiceStatus' : 'getRedisServiceStatus';
        const res = await ctx.callRenderer(method, [version], 8000);
        return {service, version, status: (res && res.status) || 'unknown', detail: res};
    } catch (err) {
        return {service, status: 'unknown', message: err.message};
    }
}

async function overview(ctx) {
    const tools = TOOL_IDS.map((tool) => {
        let installed = [];
        try {
            installed = sandbox.listInstalled(tool) || [];
        } catch (err) {
            installed = [];
        }
        return {
            tool,
            label: (sandbox.TOOL_META[tool] && sandbox.TOOL_META[tool].label) || tool,
            active: sandbox.getActive(tool) || '',
            installed: installed.map((item) => ({version: item.version, dir: item.dir})),
        };
    });
    const services = [];
    for (const service of ['mysql', 'redis', 'nginx']) {
        services.push(await serviceStatus(service, ctx));
    }
    return {
        app: '沐柠环境盒',
        sandboxRoot: sandbox.getRoot(),
        tools,
        services,
        hint: '需要启动服务时调用 toolbox_service；需要验证命令时调用 toolbox_run_command。',
    };
}

const EXECUTORS = {
    async toolbox_overview(args, ctx) {
        const data = await overview(ctx);
        return {
            text: clampText(data, 14000),
            summary: 'overview',
            isError: false,
        };
    },

    async toolbox_check_tool(args, ctx) {
        const tool = String(args.tool || '');
        const method = CHECK_METHODS[tool];
        if (!method) {
            return {text: `未知工具：${tool}，可选：${TOOL_IDS.join(', ')}`, summary: `check:${tool}`, isError: true};
        }
        if (typeof ctx.callRenderer !== 'function') {
            return {text: '主窗口未就绪，暂时无法查询工具状态', summary: `check:${tool}`, isError: true};
        }
        const data = await ctx.callRenderer(method, [], 15000);
        return {text: clampText(data, 8000), summary: `check:${tool}`, isError: false};
    },

    async toolbox_service(args, ctx) {
        const service = String(args.service || '');
        const action = String(args.action || '');
        const summary = `${service}.${action}`;
        if (!SERVICE_LABELS[service]) {
            return {text: `不支持的服务：${service}`, summary, isError: true};
        }
        if (!['start', 'stop', 'restart', 'status'].includes(action)) {
            return {text: `不支持的操作：${action}`, summary, isError: true};
        }
        if (typeof ctx.callRenderer !== 'function') {
            return {text: '主窗口未就绪，无法操作服务', summary, isError: true};
        }
        const version = String(args.version || sandbox.getActive(service) || '');
        let method = '';
        let params = [];
        if (service === 'nginx') {
            if (action === 'start') method = 'startNginx';
            else if (action === 'stop') method = 'stopNginx';
            else if (action === 'restart') method = 'reloadNginx';
            else method = 'getNginxStatus';
        } else {
            const prefix = service === 'mysql' ? 'MySQL' : 'Redis';
            method = {
                start: `start${prefix}Service`,
                stop: `stop${prefix}Service`,
                restart: `restart${prefix}Service`,
                status: `get${prefix}ServiceStatus`,
            }[action];
            params = [version];
        }
        if (!method) {
            return {text: `内部错误：没有匹配到 ${service}.${action} 的方法`, summary, isError: true};
        }
        const data = await ctx.callRenderer(method, params, action === 'status' ? 9000 : 90000);
        const isError = action !== 'status' && !(data && data.success);
        return {
            text: clampText({service, action, version: version || null, result: data}, 8000),
            summary,
            isError,
        };
    },

    async toolbox_run_command(args, ctx) {
        const command = String(args.command || '').trim();
        if (!command) {
            return {text: '命令不能为空', summary: 'run_command', isError: true};
        }
        if (!ctx.config.allowCommands) {
            return {text: '终端命令执行权限已在插件设置里关闭，请先在环境盒里打开', summary: command.slice(0, 60), isError: true};
        }
        const result = await runCommand(command, args, ctx);
        return {
            text: clampText(result, 12000),
            summary: command.slice(0, 60),
            isError: result.exitCode !== 0 && !result.stdout,
        };
    },

    async toolbox_check_port(args, ctx) {
        const port = Number(args.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            return {text: '端口必须是 1-65535 之间的整数', summary: `port:${args.port}`, isError: true};
        }
        const used = await portInUse(port);
        return {
            text: clampText({port, inUse: used, message: used ? `端口 ${port} 已被占用` : `端口 ${port} 空闲`}, 2000),
            summary: `port:${port}`,
            isError: false,
        };
    },

    async toolbox_system_stats(args, ctx) {
        const cpu = await cpuUsage();
        const total = os.totalmem();
        const free = os.freemem();
        const memPercent = Math.round(((total - free) / total) * 100);
        const data = {
            cpuPercent: cpu,
            memoryPercent: memPercent,
            totalMemMB: Math.round(total / 1048576),
            freeMemMB: Math.round(free / 1048576),
            platform: process.platform,
            hostname: os.hostname(),
            uptimeMinutes: Math.round(os.uptime() / 60),
            processUptimeMinutes: Math.round(process.uptime() / 60),
        };
        return {text: clampText(data, 3000), summary: 'stats', isError: false};
    },
};

function list() {
    return DEFINITIONS;
}

async function execute(name, args, ctx) {
    const executor = EXECUTORS[name];
    if (!executor) {
        return {text: `未知工具：${name}`, summary: name, isError: true};
    }
    try {
        return await executor(args || {}, ctx);
    } catch (err) {
        return {text: `执行失败：${err && err.message ? err.message : String(err)}`, summary: name, isError: true};
    }
}

module.exports = {list, execute, TOOL_IDS, SERVICE_LABELS};
