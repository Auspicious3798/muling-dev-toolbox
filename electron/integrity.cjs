const {ipcMain} = require('electron');
const path = require('path');
const fs = require('fs');
const sandbox = require('./utils/sandbox.cjs');
const {createLogger} = require('./utils/logger.cjs');

const TOOL_CHECKS = {
    jdk: {label: 'JDK', required: ['bin/java.exe', 'bin/javac.exe']},
    python: {label: 'Python', required: ['python.exe']},
    mysql: {label: 'MySQL', required: ['bin/mysqld.exe', 'bin/mysql.exe']},
    redis: {label: 'Redis', required: ['redis-server.exe']},
    maven: {label: 'Maven', required: ['bin/mvn.cmd']},
    nginx: {label: 'Nginx', required: ['nginx.exe']},
    gradle: {label: 'Gradle', required: ['bin/gradle.bat']},
    uv: {label: 'uv', required: ['uv.exe']},
    nodejs: {label: 'Node.js', required: ['node.exe', 'npm.cmd']},
};

function fileExists(target) {
    try {
        return fs.statSync(target).isFile();
    } catch (err) {
        return false;
    }
}

function checkTool(tool, item) {
    const spec = TOOL_CHECKS[tool];
    const dir = item.dir;
    const missing = [];
    for (const relative of spec.required) {
        const absolute = path.join(dir, relative);
        if (!fileExists(absolute)) missing.push(relative);
    }
    return {
        tool,
        label: spec.label,
        version: item.version,
        dir,
        healthy: missing.length === 0,
        missing,
    };
}

function collectItems(logToFile) {
    const items = [];
    for (const tool of Object.keys(TOOL_CHECKS)) {
        let installed = [];
        try {
            installed = sandbox.listInstalled(tool) || [];
        } catch (err) {
            logToFile(`扫描 ${tool} 失败: ${err.message}`);
            installed = [];
        }
        for (const entry of installed) {
            items.push(checkTool(tool, entry));
        }
    }
    return items;
}

module.exports = function registerIntegrityHandlers(mainWindow, userDataPath) {
    const logFile = path.join(userDataPath, 'integrity_check.log');
    const logToFile = createLogger(logFile);

    ipcMain.handle('check-integrity', async () => {
        try {
            sandbox.ensureRoot();
            const items = collectItems(logToFile);
            const issues = items.filter(item => !item.healthy);
            const checkedAt = new Date().toISOString();
            logToFile(`体检完成：共 ${items.length} 个环境，异常 ${issues.length} 个`);
            return {
                success: true,
                root: sandbox.getRoot(),
                checkedAt,
                total: items.length,
                healthy: items.length - issues.length,
                issues: issues.length,
                items,
                message: items.length === 0
                    ? '还没有安装任何环境'
                    : (issues.length === 0
                        ? '所有环境都非常健康'
                        : `${issues.length} 个环境存在缺失文件`),
            };
        } catch (err) {
            logToFile(`体检异常: ${err.message}`);
            return {success: false, message: err.message, items: []};
        }
    });

    ipcMain.handle('get-integrity-targets', async () => {
        return {success: true, targets: Object.keys(TOOL_CHECKS).map(tool => ({tool, label: TOOL_CHECKS[tool].label}))};
    });
};
