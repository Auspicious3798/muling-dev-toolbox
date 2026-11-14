const fs = require('fs');

/**
 * 创建带文件大小轮转的日志记录器。
 *
 * 比各 handler 里硬编码的 fs.appendFileSync 更强的点是：
 *  - 文件超过 maxBytes 后自动滚动为 `<logFile>.1`（保留最近一份），避免日志无限膨胀；
 *  - 日志失败不会影响主流程。
 *
 * @param {string} logFile 日志文件绝对路径
 * @param {number} maxBytes 触发轮转的字节数，默认 5MB
 * @returns {(message: string) => void}
 */
function createLogger(logFile, maxBytes = 5 * 1024 * 1024) {
    return function logToFile(message) {
        try {
            try {
                if (fs.statSync(logFile).size > maxBytes) {
                    try {
                        fs.renameSync(logFile, logFile + '.1');
                    } catch (e) { /* 旧日志删除失败可忽略 */ }
                }
            } catch (e) { /* 文件尚不存在时忽略 */ }
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
        } catch (e) { /* 日志写入失败不应影响安装主流程 */ }
    };
}

module.exports = { createLogger };