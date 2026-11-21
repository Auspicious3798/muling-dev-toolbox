/**
 * 插件运行时（安装状态 + 入口注册）
 * -------------------------------------------------------------------------
 * 「安装」目前是本地行为：把插件登记进 localStorage，然后由导航和路由去读。
 * 装完立刻生效，卸载立刻消失，不写系统环境变量、不落盘任何可执行文件。
 *
 * 状态存在 localStorage 的 toolbox_plugins_v1：
 *   { installed: { 'mcp-control': { version: '1.0.0', installedAt: 1700000000000 } } }
 */
import { reactive } from 'vue';
import eventBus from '../eventBus';
import { PLUGINS, findPlugin } from './registry';
import { hasPluginView } from './views';

const STORAGE_KEY = 'toolbox_plugins_v1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readInstalled() {
  const result = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return result;
    const parsed = JSON.parse(raw);
    const source = parsed && parsed.installed ? parsed.installed : parsed;
    if (!source || typeof source !== 'object') return result;
    Object.keys(source).forEach((id) => {
      // 清单里已经不存在的插件（下架了）直接忽略，避免留下打不开的入口
      if (!findPlugin(id)) return;
      const item = source[id] || {};
      result[id] = {
        version: typeof item.version === 'string' ? item.version : '',
        installedAt: Number(item.installedAt) || Date.now()
      };
    });
  } catch (err) {
    return result;
  }
  return result;
}

export const pluginState = reactive({
  installed: readInstalled(),
  /** 安装过程：{ id, label, percent }，null 表示没在装 */
  busy: null
});

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ installed: pluginState.installed }));
  } catch (err) {
    /* 存储不可用时只影响下次冷启动，本次会话仍然可用 */
  }
}

export function isInstalled(id) {
  return Boolean(pluginState.installed[id]);
}

export function installedMeta(id) {
  return pluginState.installed[id] || null;
}

export function installedCount() {
  return Object.keys(pluginState.installed).length;
}

/** 已安装的插件清单（按清单顺序）。 */
export function installedPlugins() {
  return PLUGINS.filter((plugin) => isInstalled(plugin.id));
}

/**
 * 左侧导航要挂的插件入口。
 * 只有声明了 integrates: ['nav'] 且已安装的插件才会出现。
 */
export function pluginNavItems() {
  return installedPlugins()
    .filter((plugin) => (plugin.integrates || []).includes('nav'))
    .map((plugin) => ({
      id: `plugin:${plugin.id}`,
      label: plugin.name,
      icon: plugin.icon
    }));
}

export function isBusy(id) {
  return Boolean(pluginState.busy && pluginState.busy.id === id);
}

/**
 * 安装插件。
 * 三步都会真正执行：校验清单 → 写入配置 → 注册入口（写完后导航立刻多一项）。
 */
export async function installPlugin(id) {
  const plugin = findPlugin(id);
  if (!plugin) throw new Error('插件不存在');
  if (plugin.status !== 'available') throw new Error('这个插件还在规划中');
  if (isInstalled(id)) return true;
  if (!hasPluginView(id)) throw new Error('插件界面还没注册');

  try {
    pluginState.busy = { id, label: '校验插件清单', percent: 25 };
    await sleep(200);

    pluginState.busy = { id, label: '写入本地配置', percent: 60 };
    pluginState.installed[id] = {
      version: plugin.version,
      installedAt: Date.now()
    };
    persist();
    await sleep(220);

    pluginState.busy = { id, label: '注册导航入口', percent: 100 };
    await sleep(180);

    eventBus.emit('plugin:changed', { id, action: 'install' });
    return true;
  } finally {
    pluginState.busy = null;
  }
}

/** 卸载插件：删掉登记，导航入口同一帧消失。 */
export function uninstallPlugin(id) {
  if (!isInstalled(id)) return false;
  delete pluginState.installed[id];
  persist();
  eventBus.emit('plugin:changed', { id, action: 'uninstall' });
  return true;
}
