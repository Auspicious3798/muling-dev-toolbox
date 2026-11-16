# 更新日志

## v2.1.0 · 2026-11-16

端口自己说了算、接管后环境变量不再打架，外加两处界面顺手改善。

### 新增

- **服务端口可自定义**：MySQL / Redis / Nginx 的端口从「被占用就自动顺延」改成「你来定、我来校验」。
  点版本卡片上的端口胶囊即可改，回车前先探测端口是否真的能绑上；被占用会直接提示，不会偷偷换到陌生端口。
  已装好的服务改端口会同步改写 `my.ini` / `redis.windows.conf`。
- **一键清理旧环境变量**：设置页「系统变量」新增「清理旧变量」。它按特征文件识别 PATH 里指向其它
  JDK / Python / MySQL … 安装的条目并摘掉，系统级条目会自动弹 UAC 提权后再清，全程不用手敲命令。
- **接管即接管环境变量**：接管电脑上已有的环境时，除了登记目录，还会把该工具残留的 PATH 条目和
  `JAVA_HOME` 一类变量收归环境盒管理，旧条目存进备份，撤出时可还原。

### 改进

- 终端顶部的「当前环境」标签改成独立横向滚动区，环境装多了也能左右滑动看完。
- 设置页的系统变量列表不再写死 JDK / Python / Maven，改为按主进程的可注入工具清单动态生成，
  每行顺带显示对应环境变量名（`JAVA_HOME`、`NODE_HOME` …）。

### 修复

- 接管 JDK 后 `java` 输出空白：旧 PATH 条目把沙箱条目顶掉了，现在接管时会清干净。
- MySQL 启动不再弹控制台黑窗口，关掉窗口也不会再停服务。

## v2.0.0 · 2026-11-15

首个开源版本。沐柠环境盒是一个 Windows 上的「开发环境收纳盒」：把 JDK、Node.js、MySQL、Redis 这些
工具装进沙箱目录（默认 `%LOCALAPPDATA%\Muling\env`），不写系统 PATH、不碰注册表，用完整个目录一删就干净。

### 新增

- **沙箱式安装**：JDK / Python / MySQL / Redis / Maven / Nginx / Gradle / uv / Node.js 九个工具，
  版本并存、随时切换默认版本，互不干扰。
- **仪表盘动态化**：只显示真正装上的环境，点卡片直接跳到对应工具面板。
- **安装面板常驻**：安装过程中点面板外面不再丢任务，右下角有进度浮条，随时点回去看。
- **服务器托管**：MySQL / Redis 等可在面板里一键启停，`mysqld` 以隐藏窗口方式在后台跑，
  不会再糊一个黑窗口在桌面上。
- **卸载可选清理**：卸载时可选是否一并删除个人配置（`%APPDATA%\muling-environment-box`）
  和已安装的环境（`%LOCALAPPDATA%\Muling\env`），默认都保留。
- **渲染档位自适应**：按 GPU 合成能力与显存自动选「流畅档 / 画质档」，虚拟机和远程桌面里
  自动关掉毛玻璃与动效；也可以在「工具箱设置 → 显示与性能」手动指定，并显示降级原因。
- **终端**：环境标签过多时可横向滑动；系统变量注入列表按工具能力动态生成。

### 修复

- 透明窗口在无 GPU 合成的机器（虚拟机 / 远程桌面）上整块白屏。
- 软件渲染下大面积 `backdrop-filter` 导致窗口「未响应」。
- MySQL 安装包（解压后近 1GB）用 adm-zip 整包读入内存导致主进程卡死、崩溃——
  改为调用系统 `tar.exe` 流式解压，内存峰值从 1GB 级降到 50MB 级。
- 安装过程中关闭安装面板导致进度与步骤状态丢失。
- 打包时 electron-builder 生成卸载器的临时文件失败（`Error writing temporary file`）——
  构建脚本把 `TEMP/TMP` 指向仓库内 `.build-tmp`。

### 已知限制

- 仅支持 Windows（依赖 `tar.exe`、`reg.exe`、`net session` 等系统命令）。
- 工具安装包从作者的阿里云 OSS 分发，首次安装需要联网；可用环境变量 `MULING_ASSET_BASE` 指向自建镜像。
- Go / Miniconda / Jupyter Lab / 中间件暂只支持安装与终端使用，尚未提供系统变量注入。

### 致谢

- [Electron](https://www.electronjs.org/) · [Vue 3](https://vuejs.org/) · [Vite](https://vitejs.dev/)
- [xterm.js](https://xtermjs.org/) · [adm-zip](https://github.com/cthackers/adm-zip) · [axios](https://axios-http.com/)
- [node-pty](https://github.com/microsoft/node-pty)（终端会话）

以上依赖均为 MIT 协议，版权归各自作者所有。
