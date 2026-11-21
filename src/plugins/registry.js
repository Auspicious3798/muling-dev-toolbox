/**
 * 插件清单（Plugin Catalog）
 * -------------------------------------------------------------------------
 * 插件中心的「货架」就是这份数组。一个插件 = 一段声明式清单 + 一个 Vue 视图。
 *
 * 清单字段：
 *  id          唯一标识，也是视图注册表（views.js）里的 key
 *  name        展示名，会出现在卡片、详情、左侧导航
 *  subtitle    一句话卖点
 *  version     版本号
 *  author      作者
 *  official    是否官方出品（卡片上显示「官方」标）
 *  status      'available' 可安装 / 'planned' 规划中（按钮置灰，预留给后续插件）
 *  category    分类，见 PLUGIN_CATEGORIES
 *  icon        图片路径（/icons/xxx.svg）或 emoji
 *  accent      卡片配色：teal / amber / blue / violet / rose / slate
 *  tags        标签
 *  size        安装体积（展示用）
 *  updated     最近更新日期
 *  integrates  集成位置：nav（左侧导航入口）、page（独立功能页）
 *  permissions 申明的权限，安装前给用户看
 *  description 详情页的介绍
 *  features    功能点列表
 *  changelog   更新日志
 *
 * 新增一个插件：这里加一条 → src/plugins/views.js 注册视图 → 完事。
 * 详细步骤见 docs/插件系统.md
 */

export const PLUGIN_CATEGORIES = [
  { id: 'efficiency', label: '效率工具' },
  { id: 'environment', label: '环境增强' },
  { id: 'database', label: '数据库' },
  { id: 'appearance', label: '界面美化' }
];

/** 集成位置说明，详情页用它渲染「集成到哪里」。 */
export const INTEGRATION_META = {
  nav: { label: '侧边导航入口', desc: '装好后在左侧「我的插件」里多一个入口' },
  page: { label: '独立功能页', desc: '点开入口就是一块完整的功能界面' }
};

export const PLUGINS = [
  /* ────────────────────────── 已上架 ────────────────────────── */
  {
    id: 'mcp-control',
    name: 'MCP 控制中枢',
    subtitle: '让 DSH / Codex 直接操作环境盒',
    version: '1.0.0',
    author: '沐柠官方',
    official: true,
    status: 'available',
    category: 'environment',
    icon: '/icons/plugin-mcp.svg',
    accent: 'violet',
    size: '24 KB',
    updated: '2026-11-16',
    tags: ['MCP', '智能体', 'Agent', '监控'],
    integrates: ['nav', 'page'],
    permissions: [
      '监听本机回环端口（127.0.0.1，外部机器连不进来）',
      '读取已安装工具与服务状态',
      '执行终端命令（可在插件设置里随时关闭）',
      '读写本地调用日志'
    ],
    description:
      '在环境盒里起一个 MCP 服务，把「查环境、起服务、跑命令」这些能力开放给 DSH、Codex 这类智能体。谁调用了什么、耗时多久、成没成功，全部落在调用流水里——今天启动了几次 MySQL、跑了几条终端命令，一眼可见。',
    features: [
      '一键启停 MCP 服务，只看本机 127.0.0.1，令牌鉴权',
      '六个工具：环境总览、工具查询、服务启停、终端命令、端口检测、系统指标',
      '实时调用流水：时间、工具、参数摘要、耗时、客户端',
      '今日 / 近 7 天 / 累计统计：调用量、成功率、命令数、服务操作数',
      '工具热度排行与 7 日趋势',
      '复制 DSH / Codex 可直接用的接入配置与 curl 自检命令'
    ],
    changelog: [
      { version: '1.0.0', date: '2026-11-16', notes: '首个版本：MCP 服务、六个工具、调用流水与统计面板。' }
    ]
  },
  {
    id: 'web-mysql',
    name: 'Web MySQL',
    subtitle: '在浏览器里像 Navicat 一样管 MySQL',
    version: '1.0.0',
    author: '沐柠官方',
    official: true,
    status: 'available',
    category: 'database',
    icon: '/icons/plugin-mysql.svg',
    accent: 'blue',
    size: '38 KB',
    updated: '2026-11-19',
    tags: ['MySQL', '数据库', 'Navicat', 'SQL'],
    integrates: ['nav', 'page'],
    permissions: [
      '在本机回环端口启动 Web 服务（127.0.0.1，随机令牌访问）',
      '读取 MySQL 实例端口与 root 密码（用于自动连接）',
      '执行 SELECT / INSERT / UPDATE / DDL 等 SQL',
      '调用系统默认浏览器打开管理台'
    ],
    description:
      '给装好的 MySQL 版本配一个浏览器管理台：左边库表树，右边数据、结构、SQL 三个面板。可以翻页筛选数据、看字段与索引、复制建表语句，也可以直接跑多条 SQL —— 对标 Navicat 的轻量替代。',
    features: [
      '库 / 表树浏览，按表名过滤，显示行数与体积',
      '数据面板：WHERE 条件筛选、列排序、50/100/300 行分页、单元格点击复制',
      '结构面板：字段、索引、完整建表语句一键复制',
      'SQL 控制台：多语句执行、结果表格、影响行数与耗时、Ctrl+Enter 运行',
      '自动读取环境盒里的端口与密码，Web 地址带一次性令牌',
      '从 MySQL 卡片一键进入：终端按钮右边的「Web」入口'
    ],
    changelog: [
      { version: '1.0.0', date: '2026-11-19', notes: '首个版本：库表浏览、数据筛选分页、结构查看、SQL 控制台。' }
    ]
  },
  {
    id: 'web-redis',
    name: 'Web Redis',
    subtitle: '浏览器里的 Redis 工作台，键值一目了然',
    version: '1.0.0',
    author: '沐柠官方',
    official: true,
    status: 'available',
    category: 'database',
    icon: '/icons/plugin-redis.svg',
    accent: 'rose',
    size: '34 KB',
    updated: '2026-11-19',
    tags: ['Redis', '缓存', 'Another Redis', '命令行'],
    integrates: ['nav', 'page'],
    permissions: [
      '在本机回环端口启动 Web 服务（127.0.0.1，随机令牌访问）',
      '读取 Redis 实例端口与 requirepass 密码',
      '读写、重命名、删除键，修改 TTL',
      '执行任意 Redis 命令（命令行页）'
    ],
    description:
      '给装好的 Redis 版本配一个浏览器工作台：按模式扫键、按类型查看与编辑 string/hash/list/set/zset、调整 TTL，还带一个可以直接敲 Redis 命令的终端页 —— 对标 Another Redis Desktop 的轻量替代。',
    features: [
      'SCAN 模式扫键（支持 * 通配、加载更多），按类型筛选',
      'string / hash / list / set / zset 可视编辑，stream 只读查看',
      'TTL 查看、设置与一键永久，重命名、二次确认删除',
      '新建键向导：类型、初始值、TTL 一次填完',
      '命令行页：任意 Redis 命令、历史回溯、结果原文展示',
      'db0–db15 切换，自动读取端口与密码'
    ],
    changelog: [
      { version: '1.0.0', date: '2026-11-19', notes: '首个版本：键浏览、五种类型编辑、TTL、新建与命令行。' }
    ]
  }
];

/** 按 id 找插件清单。 */
export function findPlugin(id) {
  return PLUGINS.find((plugin) => plugin.id === id) || null;
}

/** 分类展示名。 */
export function categoryLabel(categoryId) {
  const hit = PLUGIN_CATEGORIES.find((item) => item.id === categoryId);
  return hit ? hit.label : '其他';
}
