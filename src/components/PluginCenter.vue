<template>
  <div class="plugin-center">
    <!-- 页头 -->
    <header class="pc-head">
      <div class="pc-head-text">
        <h2 class="pc-title">
          <span class="pc-title-icon">🧩</span>
          插件中心
        </h2>
        <p class="pc-subtitle">
          按需装上能力，入口会自动挂到左侧「我的插件」。装与卸都在本地完成，随时可以还原。
        </p>
      </div>
      <div class="pc-head-stats">
        <div class="pc-stat">
          <span class="pc-stat-value">{{ installedNum }}</span>
          <span class="pc-stat-label">已安装</span>
        </div>
        <div class="pc-stat-divider"></div>
        <div class="pc-stat">
          <span class="pc-stat-value">{{ availableNum }}</span>
          <span class="pc-stat-label">可安装</span>
        </div>
      </div>
    </header>

    <!-- 筛选 -->
    <div class="pc-toolbar">
      <div class="pc-chips">
        <button
          type="button"
          class="pl-chip"
          :class="{ active: filter === 'all' }"
          @click="filter = 'all'"
        >
          全部<i>{{ plugins.length }}</i>
        </button>
        <button
          type="button"
          class="pl-chip"
          :class="{ active: filter === 'installed' }"
          @click="filter = 'installed'"
        >
          已安装<i>{{ installedNum }}</i>
        </button>
        <span class="pc-chip-divider"></span>
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          class="pl-chip"
          :class="{ active: filter === category.id }"
          @click="filter = category.id"
        >
          {{ category.label }}
        </button>
      </div>
      <div class="pc-search">
        <span class="pc-search-icon">⌕</span>
        <input
          v-model="keyword"
          type="text"
          class="pc-search-input"
          placeholder="搜插件名、标签或功能"
        />
        <button v-if="keyword" type="button" class="pc-search-clear" @click="keyword = ''">✕</button>
      </div>
    </div>

    <!-- 卡片列表 -->
    <div v-if="visiblePlugins.length" class="pc-grid">
      <article
        v-for="plugin in visiblePlugins"
        :key="plugin.id"
        class="pc-card"
        :class="[`accent-${plugin.accent}`, { installed: isInstalled(plugin.id) }]"
        @click="openDetail(plugin)"
      >
        <div class="pc-card-top">
          <div class="pc-icon">
            <img v-if="isImageIcon(plugin)" :src="plugin.icon" alt="" />
            <span v-else>{{ plugin.icon }}</span>
          </div>
          <div class="pc-card-title-wrap">
            <div class="pc-card-name-row">
              <h3 class="pc-card-name">{{ plugin.name }}</h3>
              <span v-if="plugin.official" class="pc-badge official">官方</span>
            </div>
            <p class="pc-card-subtitle">{{ plugin.subtitle }}</p>
          </div>
          <span v-if="isInstalled(plugin.id)" class="pc-status installed">已安装</span>
          <span v-else-if="plugin.status === 'planned'" class="pc-status planned">规划中</span>
        </div>

        <div class="pc-tags">
          <span v-for="tag in plugin.tags" :key="tag" class="pc-tag">{{ tag }}</span>
        </div>

        <div class="pc-card-foot">
          <div class="pc-card-meta">
            <span class="pc-category">{{ categoryLabel(plugin.category) }}</span>
            <span class="pc-dot">·</span>
            <span>v{{ plugin.version }}</span>
          </div>
          <button
            v-if="plugin.status === 'planned'"
            type="button"
            class="pl-btn ghost small"
            disabled
          >
            敬请期待
          </button>
          <button
            v-else-if="isInstalled(plugin.id)"
            type="button"
            class="pl-btn ghost small"
            @click.stop="openDetail(plugin)"
          >
            管理
          </button>
          <button
            v-else
            type="button"
            class="pl-btn primary small"
            :disabled="isBusy(plugin.id)"
            @click.stop="quickInstall(plugin)"
          >
            <span v-if="isBusy(plugin.id)" class="pc-installing">
              <span class="pl-spin">◌</span>{{ pluginBusyPercent(plugin.id) }}%
            </span>
            <span v-else>安装</span>
          </button>
        </div>
      </article>
    </div>

    <!-- 空态 -->
    <div v-else class="pc-empty">
      <div class="pc-empty-icon">🧩</div>
      <p class="pc-empty-title">没有找到符合条件的插件</p>
      <p class="pc-empty-desc">换个关键词，或者把筛选切回「全部」看看。</p>
      <button type="button" class="pl-btn ghost small" @click="resetFilters">重置筛选</button>
    </div>

    <p class="pc-foot-note">
      插件为本地能力集成：安装只登记配置与入口，卸载即移除。上架清单维护在
      <code>src/plugins/registry.js</code>。
    </p>

    <!-- 详情抽屉 -->
    <PluginDetail :plugin="detailPlugin" @close="detailPlugin = null" @open="handleOpenPlugin" />
  </div>
</template>

<script>
import PluginDetail from './PluginDetail.vue';
import { PLUGINS, PLUGIN_CATEGORIES, categoryLabel, findPlugin } from '@/plugins/registry';
import eventBus from '../eventBus';
import {
  pluginState,
  isInstalled,
  isBusy,
  installedCount,
  installPlugin
} from '@/plugins/store';

export default {
  name: 'PluginCenter',
  components: { PluginDetail },
  emits: ['open-plugin'],
  data() {
    return {
      filter: 'all',
      keyword: '',
      detailPlugin: null
    };
  },
  mounted() {
    eventBus.on('plugin:focus', this.handleFocus);
  },
  beforeUnmount() {
    eventBus.off('plugin:focus', this.handleFocus);
  },
  computed: {
    plugins() {
      return PLUGINS;
    },
    categories() {
      // 只展示真的有插件的分类，避免空分类占着筛选条
      return PLUGIN_CATEGORIES.filter((category) =>
        PLUGINS.some((plugin) => plugin.category === category.id)
      );
    },
    installedNum() {
      return installedCount();
    },
    availableNum() {
      return PLUGINS.filter((plugin) => plugin.status === 'available').length;
    },
    visiblePlugins() {
      const keyword = this.keyword.trim().toLowerCase();
      return PLUGINS.filter((plugin) => {
        if (this.filter === 'installed' && !isInstalled(plugin.id)) return false;
        if (this.filter !== 'all' && this.filter !== 'installed' && plugin.category !== this.filter) {
          return false;
        }
        if (!keyword) return true;
        const haystack = [plugin.name, plugin.subtitle, (plugin.tags || []).join(' '), plugin.description]
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      });
    }
  },
  methods: {
    categoryLabel(id) {
      return categoryLabel(id);
    },
    isInstalled(id) {
      return isInstalled(id);
    },
    isBusy(id) {
      return isBusy(id);
    },
    pluginBusyPercent(id) {
      if (!pluginState.busy || pluginState.busy.id !== id) return 0;
      return pluginState.busy.percent;
    },
    isImageIcon(plugin) {
      return Boolean(plugin.icon && plugin.icon.startsWith('/'));
    },
    resetFilters() {
      this.filter = 'all';
      this.keyword = '';
    },
    openDetail(plugin) {
      this.detailPlugin = plugin;
    },
    handleFocus(id) {
      const plugin = findPlugin(id);
      if (plugin) this.detailPlugin = plugin;
    },
    handleOpenPlugin(id) {
      this.detailPlugin = null;
      this.$emit('open-plugin', id);
    },
    async quickInstall(plugin) {
      try {
        await installPlugin(plugin.id);
        if (window.Lemon) window.Lemon.success(`${plugin.name} 已安装，入口已加入左侧导航`);
      } catch (err) {
        if (window.Lemon) window.Lemon.error(err.message || '安装失败');
      }
    }
  }
};
</script>

<style scoped>
.plugin-center {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  height: 100%;
  min-height: 0;
}

/* 页头 */
.pc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding: 18px 20px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.pc-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.pc-title-icon {
  font-size: 1.2rem;
}

.pc-subtitle {
  margin: 6px 0 0;
  max-width: 560px;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.pc-head-stats {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.pc-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.pc-stat-value {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.pc-stat-label {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.pc-stat-divider {
  width: 1px;
  height: 26px;
  background: var(--border-light);
}

/* 工具条 */
.pc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.pc-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pc-chip-divider {
  width: 1px;
  height: 16px;
  background: var(--border-light);
  margin: 0 4px;
}

.pc-search {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  transition: border-color var(--transition-fast);
}

.pc-search:focus-within {
  border-color: var(--primary);
}

.pc-search-icon {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.pc-search-input {
  width: 190px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.78rem;
}

.pc-search-input::placeholder {
  color: var(--text-muted);
}

.pc-search-clear {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.72rem;
  padding: 2px;
  cursor: pointer;
}

/* 卡片 */
.pc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: var(--space-3);
}

.pc-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition:
    transform var(--transition-fast),
    box-shadow var(--transition-normal),
    border-color var(--transition-fast);
}

.pc-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-medium);
}

.pc-card.installed {
  border-color: color-mix(in srgb, var(--primary) 34%, var(--border-light));
}

.pc-card-top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.pc-icon {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  font-size: 1.15rem;
  border: 1px solid var(--border-light);
}

.pc-icon img {
  width: 22px;
  height: 22px;
}

.pc-card-title-wrap {
  flex: 1;
  min-width: 0;
}

.pc-card-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pc-card-name {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary);
}

.pc-card-subtitle {
  margin: 3px 0 0;
  font-size: 0.73rem;
  line-height: 1.5;
  color: var(--text-muted);
}

.pc-badge {
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-size: 0.64rem;
  font-weight: 600;
  line-height: 1.6;
}

.pc-badge.official {
  color: var(--primary);
  background: var(--primary-light);
}

.pc-status {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.6;
}

.pc-status.installed {
  color: var(--success-text);
  background: var(--success-bg);
}

.pc-status.planned {
  color: var(--text-muted);
  background: var(--bg-secondary);
}

/* 标签 */
.pc-tags {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.pc-tag {
  padding: 1px 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.66rem;
  line-height: 1.7;
}

/* 卡片底部 */
.pc-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed var(--border-light);
}

.pc-card-meta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.pc-category {
  color: var(--text-secondary);
  font-weight: 500;
}

.pc-dot {
  opacity: 0.5;
}

.pc-installing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* 空态 */
.pc-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 48px 16px;
  border-radius: var(--radius-lg);
  border: 1px dashed var(--border-medium);
  color: var(--text-muted);
  text-align: center;
}

.pc-empty-icon {
  font-size: 1.6rem;
  opacity: 0.55;
}

.pc-empty-title {
  margin: 4px 0 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.pc-empty-desc {
  margin: 0 0 8px;
  font-size: 0.75rem;
}

.pc-foot-note {
  margin: 0;
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.6;
}

.pc-foot-note code {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}

/* 配色（图标底色） */
.accent-teal .pc-icon {
  background: var(--primary-light);
}

.accent-amber .pc-icon {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}

.accent-blue .pc-icon {
  background: color-mix(in srgb, var(--info) 16%, transparent);
}

.accent-violet .pc-icon {
  background: color-mix(in srgb, #8b5cf6 16%, transparent);
}

.accent-rose .pc-icon {
  background: color-mix(in srgb, #f43f5e 16%, transparent);
}

.accent-slate .pc-icon {
  background: var(--bg-secondary);
}
</style>
