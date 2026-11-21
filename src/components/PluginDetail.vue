<template>
  <transition name="pd">
    <div v-if="plugin" class="pd-mask" @click.self="close">
      <aside class="pd-drawer" role="dialog" aria-modal="true">
        <!-- 头部 -->
        <header class="pd-head">
          <div class="pd-icon" :class="`accent-${plugin.accent}`">
            <img v-if="isImageIcon" :src="plugin.icon" alt="" />
            <span v-else>{{ plugin.icon }}</span>
          </div>
          <div class="pd-head-text">
            <div class="pd-title-row">
              <h3 class="pd-title">{{ plugin.name }}</h3>
              <span v-if="plugin.official" class="pd-badge official">官方</span>
              <span v-if="isPlanned" class="pd-badge planned">规划中</span>
              <span v-else-if="installed" class="pd-badge installed">已安装</span>
            </div>
            <p class="pd-subtitle">{{ plugin.subtitle }}</p>
          </div>
          <button type="button" class="pd-close" title="关闭" @click="close">✕</button>
        </header>

        <!-- 内容 -->
        <div class="pd-body">
          <section class="pd-section">
            <h4 class="pd-section-title">简介</h4>
            <p class="pd-desc">{{ plugin.description }}</p>
          </section>

          <section class="pd-section">
            <h4 class="pd-section-title">元信息</h4>
            <dl class="pd-meta">
              <div class="pd-meta-row">
                <dt>版本</dt>
                <dd>{{ plugin.version }}</dd>
              </div>
              <div class="pd-meta-row">
                <dt>作者</dt>
                <dd>{{ plugin.author }}</dd>
              </div>
              <div class="pd-meta-row">
                <dt>分类</dt>
                <dd>{{ category }}</dd>
              </div>
              <div class="pd-meta-row">
                <dt>体积</dt>
                <dd>{{ plugin.size }}</dd>
              </div>
              <div class="pd-meta-row">
                <dt>更新</dt>
                <dd>{{ plugin.updated }}</dd>
              </div>
            </dl>
          </section>

          <section class="pd-section">
            <h4 class="pd-section-title">集成位置</h4>
            <ul class="pd-integrations">
              <li v-for="item in integrations" :key="item.id" class="pd-integration">
                <span class="pd-integration-dot" :class="`accent-${plugin.accent}`"></span>
                <div>
                  <strong>{{ item.label }}</strong>
                  <span>{{ item.desc }}</span>
                </div>
              </li>
            </ul>
          </section>

          <section class="pd-section">
            <h4 class="pd-section-title">功能点</h4>
            <ul class="pd-features">
              <li v-for="feature in plugin.features" :key="feature">
                <span class="pd-feature-check">✓</span>{{ feature }}
              </li>
            </ul>
          </section>

          <section class="pd-section">
            <h4 class="pd-section-title">申请的权限</h4>
            <ul class="pd-permissions">
              <li v-for="permission in plugin.permissions" :key="permission">{{ permission }}</li>
            </ul>
            <p class="pd-hint">插件只在你本机运行，不会上传数据，也不会改动系统环境变量。</p>
          </section>

          <section v-if="plugin.changelog && plugin.changelog.length" class="pd-section">
            <h4 class="pd-section-title">更新日志</h4>
            <div class="pd-changelog">
              <div v-for="item in plugin.changelog" :key="item.version" class="pd-log">
                <div class="pd-log-head">
                  <span class="pd-log-version">v{{ item.version }}</span>
                  <span class="pd-log-date">{{ item.date }}</span>
                </div>
                <p class="pd-log-notes">{{ item.notes }}</p>
              </div>
            </div>
          </section>
        </div>

        <!-- 底部操作 -->
        <footer class="pd-foot">
          <template v-if="isPlanned">
            <button type="button" class="pl-btn ghost wide" disabled>规划中，敬请期待</button>
          </template>
          <template v-else-if="installed">
            <button type="button" class="pl-btn ghost" @click="openPlugin">打开使用</button>
            <button
              type="button"
              class="pl-btn danger"
              :class="{ confirming: confirmUninstall }"
              @click="handleUninstall"
            >
              {{ confirmUninstall ? '确认卸载？' : '卸载' }}
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="pl-btn primary wide"
              :disabled="installing"
              @click="handleInstall"
            >
              <span v-if="installing" class="pd-installing">
                <span class="pl-spin">◌</span>
                {{ installLabel }}（{{ installPercent }}%）
              </span>
              <span v-else>安装到工具箱</span>
            </button>
          </template>
        </footer>
      </aside>
    </div>
  </transition>
</template>

<script>
import { findPlugin, categoryLabel, INTEGRATION_META } from '@/plugins/registry';
import {
  pluginState,
  isInstalled,
  installPlugin,
  uninstallPlugin
} from '@/plugins/store';

export default {
  name: 'PluginDetail',
  props: {
    plugin: {
      type: Object,
      default: null
    }
  },
  emits: ['close', 'open'],
  data() {
    return {
      confirmUninstall: false,
      confirmTimer: null
    };
  },
  computed: {
    id() {
      return this.plugin ? this.plugin.id : '';
    },
    installed() {
      return isInstalled(this.id);
    },
    isPlanned() {
      return this.plugin ? this.plugin.status === 'planned' : false;
    },
    isImageIcon() {
      return Boolean(this.plugin && this.plugin.icon && this.plugin.icon.startsWith('/'));
    },
    category() {
      return this.plugin ? categoryLabel(this.plugin.category) : '';
    },
    integrations() {
      if (!this.plugin) return [];
      return (this.plugin.integrates || []).map((id) => ({
        id,
        ...(INTEGRATION_META[id] || { label: id, desc: '' })
      }));
    },
    installing() {
      return Boolean(pluginState.busy && pluginState.busy.id === this.id);
    },
    installLabel() {
      return pluginState.busy ? pluginState.busy.label : '';
    },
    installPercent() {
      return pluginState.busy ? pluginState.busy.percent : 0;
    }
  },
  watch: {
    plugin() {
      this.confirmUninstall = false;
    }
  },
  beforeUnmount() {
    if (this.confirmTimer) clearTimeout(this.confirmTimer);
  },
  methods: {
    close() {
      this.$emit('close');
    },
    openPlugin() {
      this.$emit('open', this.id);
      this.$emit('close');
    },
    async handleInstall() {
      try {
        await installPlugin(this.id);
        if (window.Lemon) window.Lemon.success(`${this.plugin.name} 已安装`);
        this.close();
      } catch (err) {
        if (window.Lemon) window.Lemon.error(err.message || '安装失败');
      }
    },
    handleUninstall() {
      if (!this.confirmUninstall) {
        this.confirmUninstall = true;
        if (this.confirmTimer) clearTimeout(this.confirmTimer);
        this.confirmTimer = setTimeout(() => {
          this.confirmUninstall = false;
        }, 3000);
        return;
      }
      uninstallPlugin(this.id);
      if (window.Lemon) window.Lemon.info(`${this.plugin.name} 已卸载`);
      this.confirmUninstall = false;
      this.close();
    }
  }
};
</script>

<style scoped>
.pd-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  justify-content: flex-end;
  background: var(--overlay-bg);
  -webkit-app-region: no-drag;
}

.pd-drawer {
  display: flex;
  flex-direction: column;
  width: min(460px, 92vw);
  height: 100%;
  background: var(--bg-solid);
  border-left: 1px solid var(--border-light);
  box-shadow: var(--shadow-xl);
}

/* 头部 */
.pd-head {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: 18px 18px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.pd-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 1.3rem;
  border: 1px solid var(--border-light);
}

.pd-icon img {
  width: 24px;
  height: 24px;
}

.pd-head-text {
  flex: 1;
  min-width: 0;
}

.pd-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.pd-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.pd-subtitle {
  margin: 4px 0 0;
  font-size: 0.76rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.pd-badge {
  padding: 1px 7px;
  border-radius: var(--radius-full);
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.6;
}

.pd-badge.official {
  color: var(--primary);
  background: var(--primary-light);
}

.pd-badge.installed {
  color: var(--success-text);
  background: var(--success-bg);
}

.pd-badge.planned {
  color: var(--text-muted);
  background: var(--bg-secondary);
}

.pd-close {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.8rem;
  cursor: pointer;
  transition: background-color var(--transition-fast), color var(--transition-fast);
}

.pd-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* 内容 */
.pd-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px 22px;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.pd-section-title {
  margin: 0 0 8px;
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-secondary);
  letter-spacing: 0.02em;
}

.pd-desc {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

/* 元信息 */
.pd-meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px 12px;
  margin: 0;
  padding: 12px;
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
}

.pd-meta-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pd-meta-row dt {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.pd-meta-row dd {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-primary);
  font-weight: 500;
}

/* 集成 */
.pd-integrations,
.pd-features,
.pd-permissions {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pd-integration {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 0.78rem;
}

.pd-integration-dot {
  width: 6px;
  height: 6px;
  margin-top: 6px;
  flex-shrink: 0;
  border-radius: 50%;
}

.pd-integration strong {
  display: block;
  color: var(--text-primary);
  font-weight: 600;
}

.pd-integration span {
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1.5;
}

.pd-features li {
  display: flex;
  gap: 8px;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.pd-feature-check {
  flex-shrink: 0;
  color: var(--primary);
  font-weight: 700;
}

.pd-permissions li {
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  font-size: 0.74rem;
  color: var(--text-secondary);
}

.pd-hint {
  margin: 8px 0 0;
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.6;
}

/* 更新日志 */
.pd-changelog {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pd-log {
  padding-left: 10px;
  border-left: 2px solid var(--border-medium);
}

.pd-log-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.pd-log-version {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--text-primary);
}

.pd-log-date {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.pd-log-notes {
  margin: 2px 0 0;
  font-size: 0.74rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* 底部 */
.pd-foot {
  flex-shrink: 0;
  display: flex;
  gap: var(--space-2);
  padding: 14px 18px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-card);
}

.pd-foot .pl-btn.ghost {
  flex: 1;
}

.pd-installing {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.pd-integration-dot.accent-teal {
  background: var(--primary);
}

.pd-integration-dot.accent-amber {
  background: var(--accent);
}

.pd-integration-dot.accent-blue {
  background: var(--info);
}

.pd-integration-dot.accent-violet {
  background: #8b5cf6;
}

.pd-integration-dot.accent-rose {
  background: #f43f5e;
}

.pd-integration-dot.accent-slate {
  background: var(--text-muted);
}
</style>
