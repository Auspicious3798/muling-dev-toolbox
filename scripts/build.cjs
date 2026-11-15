#!/usr/bin/env node
/**
 * 打包入口（npm run electron:build 调用）。
 *
 * 背景：electron-builder 生成卸载器的步骤，会先把刚编译出来的 Setup.exe 实际运行一次
 * （app-builder-lib/out/targets/nsis/NsisTarget.js 里 vm.exec(installerPath, [])），
 * 由这次运行把 Uninstall*.exe 写出来。在部分机器上，该进程写默认 %TEMP% 会失败，
 * NSIS 弹出 "Error writing temporary file. Make sure your temp folder is valid."，
 * 构建随之中断（exit code 2）。
 *
 * 处理：构建期间把 TEMP/TMP 指到仓库内的 .build-tmp（已被 .gitignore 忽略），
 * 让这一步不依赖系统临时目录的状态。可用 MULING_BUILD_TMP 覆盖目标目录。
 */
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const tmpDir = process.env.MULING_BUILD_TMP
  ? path.resolve(root, process.env.MULING_BUILD_TMP)
  : path.join(root, '.build-tmp')

fs.mkdirSync(tmpDir, { recursive: true })
const env = {
  ...process.env,
  TEMP: tmpDir,
  TMP: tmpDir,
  // 国内直连 GitHub 拉 electron / nsis 常被 reset，默认走 npmmirror；需要时用环境变量覆盖。
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
    'https://npmmirror.com/mirrors/electron-builder-binaries/',
}
const isWindows = process.platform === 'win32'

function run(label, args, extraEnv) {
  console.log(`\n[build] ${label} ...`)
  const result = spawnSync('npx', args, {
    cwd: root,
    env: extraEnv ? { ...env, ...extraEnv } : env,
    stdio: 'inherit',
    shell: isWindows,
  })
  if (result.status !== 0) {
    console.error(`\n[build] ${label} 失败，退出码 ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

console.log(`[build] TEMP=${env.TEMP}`)
run('vite build', ['vite', 'build'])
run('electron-builder', ['electron-builder'])
console.log('\n[build] 完成，安装包在 dist_electron/')
