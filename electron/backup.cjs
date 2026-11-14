const {ipcMain, dialog, app} = require('electron');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const sandbox = require('./utils/sandbox.cjs');
const {createLogger} = require('./utils/logger.cjs');

const MANIFEST_NAME = 'muling-env.json';
const FORMAT = 'muling-env-backup';

module.exports = function registerBackupHandlers(mainWindow, userDataPath) {
    const logFile = path.join(userDataPath, 'backup.log');
    const log = createLogger(logFile);

    const timestamp = () => {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    };

    const readSites = () => {
        const sitesFile = path.join(userDataPath, 'nginx_sites.json');
        if (!fs.existsSync(sitesFile)) return null;
        try {
            return JSON.parse(fs.readFileSync(sitesFile, 'utf8'));
        } catch (err) {
            log(`站点配置解析失败: ${err.message}`);
            return null;
        }
    };

    const writeSites = (sites) => {
        const sitesFile = path.join(userDataPath, 'nginx_sites.json');
        fs.writeFileSync(sitesFile, JSON.stringify(sites, null, 2), 'utf8');
    };

    const collectState = () => {
        const state = sandbox.readState();
        const tools = [];
        for (const [tool, info] of Object.entries(state.tools || {})) {
            for (const version of Object.keys(info.versions || {})) {
                tools.push({tool, version, active: info.active === version});
            }
        }
        return {state, tools};
    };

    const buildManifest = (extra = {}) => {
        const {state, tools} = collectState();
        return {
            format: FORMAT,
            formatVersion: 1,
            createdAt: new Date().toISOString(),
            appVersion: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            sandboxRoot: sandbox.getRoot(),
            tools,
            injection: state.injection || {},
            nginxSites: readSites(),
            settings: extra.settings || null
        };
    };

    const sizeOf = (target) => {
        try {
            return fs.statSync(target).size;
        } catch (err) {
            return 0;
        }
    };

    ipcMain.handle('export-env-config', async (_event, options = {}) => {
        const includeBinaries = Boolean(options.includeBinaries);
        const settings = options.settings || null;
        try {
            const saveResult = await dialog.showSaveDialog(mainWindow, {
                title: '导出环境配置',
                defaultPath: path.join(app.getPath('downloads'), `沐柠环境配置-${timestamp()}.mlenv`),
                filters: [
                    {name: '沐柠环境配置包', extensions: ['mlenv']},
                    {name: 'Zip 压缩包', extensions: ['zip']}
                ]
            });
            if (saveResult.canceled || !saveResult.filePath) {
                return {success: false, canceled: true};
            }

            const manifest = buildManifest({settings});
            if (options.includeBinaries) {
                manifest.hasBinaries = true;
            }
            const zip = new AdmZip();
            zip.addFile(MANIFEST_NAME, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));

            if (includeBinaries) {
                const root = sandbox.getRoot();
                if (fs.existsSync(root)) {
                    for (const tool of fs.readdirSync(root)) {
                        const toolDir = path.join(root, tool);
                        if (!fs.statSync(toolDir).isDirectory()) continue;
                        zip.addLocalFolder(toolDir, path.posix.join('sandbox', tool));
                    }
                    log(`打包程序文件: ${root}`);
                }
            }

            zip.writeZip(saveResult.filePath);
            const size = sizeOf(saveResult.filePath);
            log(`导出成功: ${saveResult.filePath}（${(size / 1024 / 1024).toFixed(2)} MB）`);
            return {
                success: true,
                path: saveResult.filePath,
                size,
                toolCount: manifest.tools.length,
                includeBinaries
            };
        } catch (err) {
            log(`导出失败: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('inspect-env-config', async () => {
        try {
            const openResult = await dialog.showOpenDialog(mainWindow, {
                title: '选择环境配置包',
                properties: ['openFile'],
                filters: [{name: '沐柠环境配置包', extensions: ['mlenv', 'zip']}]
            });
            if (openResult.canceled || !openResult.filePaths.length) {
                return {success: false, canceled: true};
            }
            const filePath = openResult.filePaths[0];
            const zip = new AdmZip(filePath);
            const entry = zip.getEntry(MANIFEST_NAME);
            if (!entry) {
                return {success: false, message: '这不是沐柠环境盒导出的配置包（缺少 ' + MANIFEST_NAME + '）'};
            }
            const manifest = JSON.parse(zip.readAsText(entry));
            if (manifest.format !== FORMAT) {
                return {success: false, message: '配置包格式不匹配'};
            }

            const tools = (manifest.tools || []).map((item) => ({
                ...item,
                target: sandbox.installDir(item.tool, item.version),
                present: fs.existsSync(sandbox.installDir(item.tool, item.version))
            }));

            return {
                success: true,
                filePath,
                preview: {
                    createdAt: manifest.createdAt,
                    appVersion: manifest.appVersion,
                    platform: manifest.platform,
                    tools,
                    hasBinaries: Boolean(manifest.hasBinaries),
                    siteCount: Array.isArray(manifest.nginxSites) ? manifest.nginxSites.length : 0,
                    settings: manifest.settings || null,
                    size: sizeOf(filePath)
                }
            };
        } catch (err) {
            log(`读取配置包失败: ${err.message}`);
            return {success: false, message: err.message};
        }
    });

    ipcMain.handle('import-env-config', async (_event, payload = {}) => {
        const filePath = payload.filePath;
        const restoreBinaries = Boolean(payload.restoreBinaries);
        const onConflict = payload.onConflict === 'overwrite' ? 'overwrite' : 'skip';
        try {
            if (!filePath || !fs.existsSync(filePath)) {
                return {success: false, message: '配置包不存在'};
            }
            const zip = new AdmZip(filePath);
            const entry = zip.getEntry(MANIFEST_NAME);
            if (!entry) return {success: false, message: '配置包缺少清单文件'};
            const manifest = JSON.parse(zip.readAsText(entry));
            if (manifest.format !== FORMAT) return {success: false, message: '配置包格式不匹配'};

            const root = sandbox.getRoot();
            const skippedDirs = [];
            if (restoreBinaries && manifest.hasBinaries) {
                fs.mkdirSync(root, {recursive: true});
                const entries = zip.getEntries();
                for (const item of entries) {
                    if (!item.entryName.startsWith('sandbox/')) continue;
                    const relative = item.entryName.slice('sandbox/'.length);
                    if (!relative) continue;
                    const topLevel = relative.split(/[\\/]/)[0];
                    if (onConflict === 'skip' && topLevel && fs.existsSync(path.join(root, topLevel))) {
                        if (!skippedDirs.includes(topLevel)) skippedDirs.push(topLevel);
                        continue;
                    }
                    const target = path.join(root, relative);
                    const normalized = path.resolve(target);
                    if (!normalized.startsWith(path.resolve(root) + path.sep)) continue;
                    if (item.isDirectory) {
                        fs.mkdirSync(normalized, {recursive: true});
                    } else {
                        fs.mkdirSync(path.dirname(normalized), {recursive: true});
                        fs.writeFileSync(normalized, item.getData());
                    }
                }
                log(`已还原程序文件到: ${root}`);
            }

            const restored = [];
            const missing = [];
            for (const item of manifest.tools || []) {
                const dir = sandbox.installDir(item.tool, item.version);
                if (fs.existsSync(dir)) {
                    sandbox.register(item.tool, item.version, dir, {activate: false});
                    restored.push({tool: item.tool, version: item.version});
                } else {
                    missing.push({tool: item.tool, version: item.version});
                }
            }

            for (const item of manifest.tools || []) {
                if (!item.active) continue;
                if (restored.some((r) => r.tool === item.tool && r.version === item.version)) {
                    sandbox.setActive(item.tool, item.version);
                }
            }

            if (Array.isArray(manifest.nginxSites) && manifest.nginxSites.length) {
                writeSites(manifest.nginxSites);
            }

            log(`导入完成：还原 ${restored.length} 项，缺失 ${missing.length} 项，跳过 ${skippedDirs.length} 个同名目录`);
            return {
                success: true,
                restored,
                missing,
                skipped: skippedDirs,
                siteCount: Array.isArray(manifest.nginxSites) ? manifest.nginxSites.length : 0,
                settings: manifest.settings || null
            };
        } catch (err) {
            log(`导入失败: ${err.message}`);
            return {success: false, message: err.message};
        }
    });
};
