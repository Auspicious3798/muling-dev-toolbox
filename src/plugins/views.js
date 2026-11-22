/**
 * 插件视图注册表
 * -------------------------------------------------------------------------
 * key = 插件清单里的 id，value = 对应的 Vue 组件。
 * 插件页面（PluginHost）按 id 在这里查组件渲染；没注册的插件只会显示占位说明。
 *
 * 新增一个带界面的插件：写好组件 → 这里 import 并登记 → 完事。
 */
import McpControlCenter from '@/components/plugins/McpControlCenter.vue';
import WebMysqlPlugin from '@/components/plugins/WebMysqlPlugin.vue';
import WebRedisPlugin from '@/components/plugins/WebRedisPlugin.vue';
import PortManager from '@/components/plugins/PortManager.vue';

export const PLUGIN_VIEWS = {
  'mcp-control': McpControlCenter,
  'web-mysql': WebMysqlPlugin,
  'web-redis': WebRedisPlugin,
  'port-manager': PortManager
};

/** 取插件视图组件，没注册返回 null。 */
export function pluginView(id) {
  return PLUGIN_VIEWS[id] || null;
}

/** 是否有可用视图。 */
export function hasPluginView(id) {
  return Boolean(PLUGIN_VIEWS[id]);
}
