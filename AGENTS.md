# AGENTS.md

本文件记录这个仓库的固定协作约定，改动前先读一遍。

## 「全量推送」= 一条固定发布流程

当用户说「全量推送」（或「全量发版」「push 全部」）时，默认指下面这一整套动作，不需要再确认细节：

1. **升版本号（所有出现的地方都要改）**
   - `package.json` / `package-lock.json`：用 `npm version <x.y.z> --no-git-tag-version --allow-same-version` 更新（不要手改 lock 里的依赖版本）。
   - `docs/version.json`：`version`、`notes`、`url`（`.../releases/download/v<x.y.z>/MulingEnvBox-Setup-<x.y.z>.exe`）、`publishedAt`。
   - `README.md`：版本徽标、安装包文件名、目录树里的 `MulingEnvBox-Setup-<x.y.z>.exe`。
   - `CHANGELOG.md`：在 `# 更新日志` 下面插入新版本小节（新增 / 变更 / 修复）。
   - 改完用 `Select-String -Pattern '<旧版本号>'` 全仓扫一遍（排除 node_modules、dist、dist_electron、.git），确认没有漏。
2. **打包安装包**
   - `npm run electron:build`（内部是 `node scripts/build.cjs`，vite build + electron-builder）。
   - 产物在 `dist_electron/`：`MulingEnvBox-Setup-<x.y.z>.exe` 与 `.exe.blockmap`。
   - 本项目没有配置代码签名证书，构建日志里会出现 “no code signing certificate configured, signing is skipped”，安装时会触发 SmartScreen，属正常。
3. **提交 + 打标签**
   - `git add -A` 后提交，提交信息用 `chore(release): <x.y.z>`（功能提交另起一条）。
   - `git tag -f v<x.y.z>` 指向含 version.json 的这次提交。
4. **推到两个远端**
   - Gitee（`origin`）：`git push origin develop --tags`。
   - GitHub（`github`）：`git push github develop` + `git push github v<x.y.z>`。GitHub 走代理时可能报 `RPC failed; curl 56` 但 refs 已落，可用 `git ls-remote` 核对后再补推标签。
5. **发 GitHub Release 并上传附件**
   - 无 `gh` CLI，用 REST API：`POST /repos/Auspicious3798/muling-dev-toolbox/releases`（`tag_name`、`target_commitish: develop`、标题、正文）。
   - 附件用 `POST https://uploads.github.com/repos/.../releases/<id>/assets?name=<file>`，`--data-binary "@<绝对路径>"`，`Content-Type: application/octet-stream`。
   - 凭据来自 `git credential fill`（host=github.com）拿到的 token，用完清理临时 curl 配置文件。
   - 传完用 `GET .../releases/<id>` 确认两个资产 `state=uploaded`。
6. **收尾**
   - 确认两个远端的 `develop` 与 `v<x.y.z>` 指向同一个提交。
   - 提醒用户：应用内「检查更新」读的是 `<assetBase>/version.json`，`docs/version.json` 还需要上传到 OSS 根目录才会生效。

## 环境注意事项

- 本机 PowerShell 是 **5.1**，`Get-Content` / `Set-Content` 默认按 ANSI 处理，**禁止用来改 UTF-8 文本**（会毁掉中文）；一律用编辑工具改。
- `npm run build` / `electron:build` 需要完整文件权限（esbuild 要起子进程）。
- Web 控制台的静态资源带 `?v=N` 查询串，改 `electron/webdb/assets/**` 后要同步升版本号，否则浏览器会用缓存。
