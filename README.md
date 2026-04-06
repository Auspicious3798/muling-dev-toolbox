# 🍋 沐柠环境盒 (Muling Environment Box)

<p align="center">
  <img src="public/icons/lemon.svg" alt="沐柠" width="120" height="120">
</p>

<p align="center">
  <strong>一键配置开发环境，让编程更简单</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Version-v1.0.0-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=flat-square&logo=windows" alt="Platform">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#使用指南">使用指南</a> •
  <a href="#技术栈">技术栈</a> •
  <a href="#贡献指南">贡献指南</a> •
  <a href="#许可证">许可证</a>
</p>

---

## 📖 项目简介

**沐柠环境盒** 是一款专为开发者设计的开发环境管理工具，提供 JDK、Python、MySQL、Redis、Maven、Nginx 等常用开发工具的**一键下载、安装、配置**功能。无论你是编程新手还是资深开发者，都能通过本工具快速搭建开发环境，节省大量配置时间。

> 💡 **沐柠 (Lemon)**：诞生于数字世界的虚拟形象，她是朋友，是陪伴，更是一份长久的陪伴。"沐柠相伴，万物可期"。

---

## ✨ 功能特性

### 🎯 核心功能

- **📦 一键安装**：支持 JDK (8-26)、Python (3.5-3.14)、MySQL (5.7-9.0)、Redis (3.2-7.2)、Maven、Nginx 等工具的自动下载和安装
- **🔧 智能配置**：自动配置环境变量、服务端口、数据库密码等
- **🚀 代理加速**：内置多个 GitHub 加速节点，支持测速并自动选择最快节点
- **🔄 版本管理**：支持多版本共存，随时切换
- **🎨 双主题**：支持浅色/深色主题，跟随系统或手动切换
- **📊 站点管理**：可视化管理 MySQL、Redis 等服务的启动/停止

### 🛡️ 安全特性

- **管理员权限检测**：启动时自动检测，确保安装过程权限充足
- **下载速度监控**：实时监测下载速度，过慢时提醒更换代理
- **数据备份提醒**：操作前提示用户备份重要数据

---

## 🚀 快速开始

### 系统要求

- **操作系统**：Windows 10/11 (64位)
- **内存**：建议 4GB 以上
- **硬盘空间**：至少 10GB 可用空间
- **权限**：需要管理员权限（安装系统服务、配置环境变量）

### 下载安装

1. 前往 [GitHub Releases](https://github.com/Auspicious3798/muling-dev-toolbox/releases) 下载最新版本
2. 双击安装包，按照提示完成安装
3. **重要**：右键点击程序图标 → 选择「**以管理员身份运行**」

### 首次使用

1. 打开应用后，在左侧导航栏选择需要的开发环境
2. 选择要安装的软件版本
3. 点击「安装」按钮，等待自动完成
4. 安装完成后，即可开始使用

---

## 📖 使用指南

### 安装开发工具

```
1. 打开沐柠环境盒
2. 左侧菜单选择：Java开发环境 / Python环境 / 通用中间件 等
3. 选择需要安装的软件及版本
4. 点击「安装」按钮
5. 等待下载和安装完成
6. 验证安装：点击「验证」按钮或打开命令行检查
```

### 配置代理加速

如果下载速度较慢：

```
1. 进入「工具箱设置」
2. 找到「下载与网络」
3. 开启「使用代理加速」开关
4. 点击「测速」按钮，自动选择最快节点
5. 返回安装页面重新下载
```

**可用代理节点**：
- ghfast.top
- gh-proxy.com
- ghproxy.com
- all.mk-proxy.tk
- kgithub.com
- github.moeyy.xyz

### 管理站点服务

```
1. 进入「站点管理」
2. 查看已安装的数据库/服务
3. 点击「启动/停止」按钮管理服务
4. 点击「编辑」修改端口、密码等配置
5. 端口冲突时会自动提示并验证
```

### 切换主题

```
1. 进入「工具箱设置」
2. 在「通用设置」中选择主题
3. 可选：浅色 / 深色 / 跟随系统
```

---

## 🏗️ 技术栈

- **前端框架**：Vue 3 + Vite
- **桌面应用**：Electron
- **UI 样式**：自定义 CSS 变量主题系统
- **包管理**：Yarn
- **打包工具**：electron-builder

### 项目结构

```
muling-dev-toolbox/
├── electron/               # Electron 主进程
│   ├── main.cjs           # 应用入口
│   ├── preload.cjs        # 预加载脚本
│   ├── configManager.cjs  # 配置管理
│   └── handlers/          # 安装处理器
│       ├── jdk.cjs
│       ├── python.cjs
│       ├── mysql.cjs
│       ├── redis.cjs
│       ├── maven.cjs
│       └── nginx.cjs
├── src/                   # Vue 渲染进程
│   ├── components/        # Vue 组件
│   │   ├── InstallDrawer.vue
│   │   ├── Settings.vue
│   │   ├── AboutLemon.vue
│   │   └── ...
│   ├── styles/            # 样式文件
│   └── App.vue
├── config/                # 配置文件
│   └── downloads.json     # 下载源配置
└── public/                # 静态资源
```

---

## 🔧 开发指南

### 环境准备

```bash
# 克隆项目
git clone https://github.com/Auspicious3798/muling-dev-toolbox.git
cd muling-dev-toolbox

# 安装依赖
yarn install
```

### 开发模式

```bash
# 启动开发服务器
yarn electron:dev
```

### 打包发布

```bash
# 打包为 Windows 安装包
yarn electron:build
```

打包后的文件在 `dist_electron/` 目录下。

---

## ⚠️ 免责声明

**使用本工具前，请仔细阅读：**

1. 沐柠环境盒在开发者环境中已经过充分测试，但由于不同用户的操作系统、网络环境、权限配置等因素存在差异，**实际使用中可能会出现兼容性问题或未知 Bug**。
2. 本工具仅供学习、研究和个人使用，请谨慎操作。
3. 使用前请确保已**备份重要数据**。
4. 如因使用本工具导致的数据丢失、系统异常或其他损失，沐柠团队**不承担直接或间接责任**。
5. 本工具提供的第三方软件均为各自版权方所有，用户应遵守相应开源协议。
6. 用户应自行确保所下载软件的来源合法、安全可用，并**自行承担使用风险**。

> 如遇问题或发现 Bug，请联系沐柠：<taxuexunmei3798@126.com>
> 
> **使用本工具即表示您已阅读并同意以上声明。**

---

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出建议！

### 提交 Issue

- 描述问题详情
- 提供操作系统版本
- 附上错误日志（如有）

### 提交 PR

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

---

## 📧 联系方式

- **邮箱**：[taxuexunmei3798@126.com](mailto:taxuexunmei3798@126.com)
- **GitHub**：[Auspicious3798](https://github.com/Auspicious3798)

---

## 📜 许可证

本项目仅供学习和研究使用。

第三方软件版权说明：
- **JDK**：Oracle / OpenJDK 许可证
- **Python**：Python Software Foundation License
- **MySQL**：GPL v2 / 商业许可证
- **Redis**：BSD / Redis Source Available License
- **Maven**：Apache License 2.0
- **Nginx**：BSD-like License

请遵守相应软件的许可证条款。

---

## ⭐ 支持项目

如果这个项目对你有帮助，欢迎给它一个 Star！

<p align="center">
  <strong>沐柠相伴，万物可期 ✨</strong>
</p>

<p align="center">Made with 💛 by 沐柠团队</p>
