<template>
  <div class="plugin-host">
    <!-- 插件页头 -->
    <header class="ph-head">
      <div class="ph-head-main">
        <div class="ph-icon" :class="`accent-${accent}`">
          <img v-if="isImageIcon" :src="plugin.icon" alt="" />
          <span v-else>{{ plugin.icon }}</span>
        </div>
        <div class="ph-head-text">
          <div class="ph-title-row">
            <h2 class="ph-title">{{ plugin.name }}</h2>
            <span class="ph-version">v{{ plugin.version }}</span>
            <span class="ph-badge">插件</span>
          </div>
          <p class="ph-subtitle">{{ plugin.subtitle }}</p>
        </div>
      </div>
      <div class="ph-head-actions">
        <button type="button" class="pl-btn ghost small" @click="$emit('open-center')">
          🧩 插件中心
        </button>
      </div>
    </header>

    <!-- 插件内容 -->
    <div class="ph-body">
      <component :is="view" v-if="view" :key="plugin.id" />
      <div v-else class="ph-missing">
        <p>这个插件还没有注册界面。</p>
        <p class="ph-missing-hint">在 <code>src/plugins/views.js</code> 里挂上视图即可。</p>
      </div>
    </div>
  </div>
</template>

<script>
import { findPlugin } from '@/plugins/registry';
import { pluginView } from '@/plugins/views';
import { isInstalled } from '@/plugins/store';

export default {
  name: 'PluginHost',
  props: {
    pluginId: {
      type: String,
      required: true
    }
  },
  emits: ['open-center'],
  computed: {
    plugin() {
      return findPlugin(this.pluginId) || {
        id: this.pluginId,
        name: '未知插件',
        subtitle: '清单里找不到这个插件，可能已经下架。',
        version: '—',
        icon: '❓',
        accent: 'slate'
      };
    },
    view() {
      // 只有已安装的插件才渲染界面，避免直接改路由绕过安装
      if (!isInstalled(this.pluginId)) return null;
      return pluginView(this.pluginId);
    },
    isImageIcon() {
      return Boolean(this.plugin.icon && this.plugin.icon.startsWith('/'));
    },
    accent() {
      return this.plugin.accent || 'slate';
    }
  }
};
</script>

<style scoped>
.plugin-host {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  height: 100%;
  min-height: 0;
}

/* 页头 */
.ph-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding: 16px 20px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.ph-head-main {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  min-width: 0;
}

.ph-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 1.2rem;
  border: 1px solid var(--border-light);
}

.ph-icon img {
  width: 22px;
  height: 22px;
}

.ph-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.ph-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.ph-version {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.ph-badge {
  padding: 1px 7px;
  border-radius: var(--radius-full);
  background: var(--primary-light);
  color: var(--primary);
  font-size: 0.64rem;
  font-weight: 600;
  line-height: 1.7;
}

.ph-subtitle {
  margin: 4px 0 0;
  font-size: 0.76rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.ph-head-actions {
  display: flex;
  gap: var(--space-2);
}

/* 内容区 */
.ph-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 20px 24px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.ph-missing {
  padding: 40px 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.ph-missing-hint {
  color: var(--text-muted);
  font-size: 0.74rem;
}

.ph-missing code {
  font-family: var(--font-mono);
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--bg-secondary);
}

/* 配色 */
.accent-teal {
  background: var(--primary-light);
}

.accent-amber {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
}

.accent-blue {
  background: color-mix(in srgb, var(--info) 16%, transparent);
}

.accent-violet {
  background: color-mix(in srgb, #8b5cf6 16%, transparent);
}

.accent-rose {
  background: color-mix(in srgb, #f43f5e 16%, transparent);
}

.accent-slate {
  background: var(--bg-secondary);
}
</style>
