<template>
  <Transition name="drawer">
    <div v-show="visible" class="drawer-overlay" @click.self="handleOverlayClick">
      <div class="drawer-container">
        <!-- Premium Header -->
        <div class="drawer-header">
          <div class="drawer-header-left">
            <div class="header-icon-wrap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div class="header-text">
              <h3>安装 {{ toolLabel }}</h3>
              <span class="header-subtitle">{{ headerSubtitle }}</span>
            </div>
          </div>
          <button class="close-btn" @click="handleCloseButton" aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="drawer-body">
          <component v-if="installerComponent" :is="installerComponent" ref="installerRef" @installed="onInstalled"/>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Speed Warning Toast -->
  <Transition name="toast">
    <div v-if="showSpeedWarning" class="speed-warning-toast">
      <div class="toast-icon-wrap">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      </div>
      <div class="toast-body">
        <p class="toast-title">下载速度较慢</p>
        <p class="toast-message">{{ speedWarningMessage }}</p>
      </div>
      <button class="toast-close-btn" @click="showSpeedWarning = false" aria-label="关闭">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="toast-actions">
        <button class="toast-action secondary" @click="showSpeedWarning = false">我知道了</button>
        <button class="toast-action primary" @click="goToSettings">前往设置</button>
      </div>
    </div>
  </Transition>
</template>

<script>
import JDKInstaller from './installers/JDKInstaller.vue';
import PythonInstaller from './installers/PythonInstaller.vue';
import MySQLInstaller from './installers/MysqlInstaller.vue';
import RedisInstaller from './installers/RedisInstaller.vue';
import MavenInstaller from './installers/MavenInstaller.vue';
import GradleInstaller from './installers/GradleInstaller.vue';
import UvInstaller from './installers/UvInstaller.vue';
import NodejsInstaller from './installers/NodejsInstaller.vue';
import MinicondaInstaller from './installers/MinicondaInstaller.vue';
import NginxInstaller from './installers/NginxInstaller.vue';
import eventBus from '@/eventBus';
import Lemon from '@/utils/lemon';
import { taskCenter } from '@/utils/taskCenter';

export default {
  name: 'InstallDrawer',
  components: { JDKInstaller, PythonInstaller, MySQLInstaller, RedisInstaller, MavenInstaller, NginxInstaller, GradleInstaller, UvInstaller, NodejsInstaller, MinicondaInstaller },
  props: { visible: Boolean, tool: String },
  emits: ['update:visible', 'installed'],
  data() {
    return {
      showSpeedWarning: false, speedWarningMessage: '',
    };
  },
  mounted() {
    this._unsubs = [];
    if (window.electronAPI) {
      this._unsubs.push(window.electronAPI.onDownloadSpeedWarning((data) => { this.speedWarningMessage = data.message; this.showSpeedWarning = true; }));
    }
  },
  unmounted() {
    (this._unsubs || []).forEach((u) => { try { u && u(); } catch (e) {} });
  },
  computed: {
    toolLabel() { const m = {jdk:'JDK',python:'Python',mysql:'MySQL',redis:'Redis',maven:'Maven',nginx:'Nginx',miniconda:'Miniconda'}; return m[this.tool]||this.tool.toUpperCase(); },
    installerComponent() { const c = {jdk:'JDKInstaller',python:'PythonInstaller',mysql:'MySQLInstaller',redis:'RedisInstaller',maven:'MavenInstaller',nginx:'NginxInstaller',gradle:'GradleInstaller',uv:'UvInstaller',nodejs:'NodejsInstaller',miniconda:'MinicondaInstaller'}; return c[this.tool]; },
    currentTask() {
      const active = taskCenter.active;
      if (!active || active.status !== 'running') return null;
      return active.tool === this.tool ? active : null;
    },
    busy() { return Boolean(this.currentTask); },
    taskPercent() { return this.currentTask ? Math.round(this.currentTask.percent) : 0; },
    headerSubtitle() {
      if (!this.currentTask) return '选择版本并开始安装';
      const stage = this.currentTask.stage || '安装中';
      return `${this.taskPercent}% · ${stage}`;
    },
  },
  methods: {
    close() { this.$emit('update:visible', false); },
    handleOverlayClick() {
      // 安装进行中时，误点空白区域不再直接把面板关掉（否则用户会以为任务丢了）
      if (this.busy) {
        const now = Date.now();
        if (!this._busyHintAt || now - this._busyHintAt > 1800) {
          this._busyHintAt = now;
          if (Lemon && Lemon.info) Lemon.info('安装还在跑，关掉面板也不会中断，右下角能看到进度～');
        }
        return;
      }
      this.close();
    },
    handleCloseButton() {
      if (this.busy && Lemon && Lemon.info) {
        Lemon.info(`${this.toolLabel} 继续在后台安装，右下角可以点回来～`);
      }
      this.close();
    },
    onInstalled() { this.$emit('installed'); },
    goToSettings() { this.showSpeedWarning = false; this.$emit('update:visible', false); eventBus.emit('navigate:settings'); },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.drawer-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--overlay-bg);
  backdrop-filter: blur(30px) saturate(140%); -webkit-backdrop-filter: blur(30px) saturate(140%);
  z-index: 1000; display: flex; justify-content: flex-end;
}

.drawer-container {
  width: 580px; height: 100%;
  background: var(--glass-tint-strong);
  border-left: 1px solid var(--glass-stroke);
  backdrop-filter: blur(36px) saturate(180%); -webkit-backdrop-filter: blur(36px) saturate(180%);
  box-shadow: var(--glass-shadow-float);
  display: flex; flex-direction: column;
}

/* ── Premium Header ── */
.drawer-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-5) var(--space-6);
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.drawer-header-left { display: flex; align-items: center; gap: var(--space-3); }

.header-icon-wrap {
  width: 38px; height: 38px; border-radius: var(--radius-md);
  background: var(--primary-light); color: var(--primary);
  display: flex; align-items: center; justify-content: center;
}

.header-text h3 {
  margin: 0; font-size: 1.05rem; font-weight: 700;
  color: var(--text-primary); letter-spacing: -0.2px; line-height: 1.3;
}

.header-subtitle {
  font-size: 0.75rem; color: var(--text-muted); font-weight: 400;
}

.close-btn {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: var(--radius-md);
  border: 1px solid var(--border-light); cursor: pointer;
  color: var(--text-secondary); background: var(--bg-secondary);
  transition: all var(--transition-fast);
}
.close-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-medium); }

/* ── Body ── */
.drawer-body { flex: 1; overflow-y: auto; padding: var(--space-5) var(--space-6); }

/* ── Drawer slide animation ── */
.drawer-enter-active, .drawer-leave-active { transition: opacity 0.3s ease; }
.drawer-enter-active .drawer-container, .drawer-leave-active .drawer-container { transition: transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1); }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .drawer-container { transform: translateX(100%); }
.drawer-leave-to .drawer-container { transform: translateX(100%); }

/* ── Premium Toast ── */
.speed-warning-toast {
  position: fixed; top: 24px; right: 24px;
  width: 400px;
  background: var(--bg-card); border-radius: var(--radius-xl);
  padding: var(--space-5);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-light);
  z-index: 3000;
  display: flex; flex-wrap: wrap;
}

.toast-icon-wrap {
  width: 44px; height: 44px; border-radius: 50%;
  background: var(--warning-bg); color: var(--warning);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; margin-right: var(--space-3);
}

.toast-body { flex: 1; min-width: 0; }

.toast-title { font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin: 0 0 2px; }
.toast-message { font-size: 0.8rem; color: var(--text-secondary); margin: 0 0 4px; }

.toast-close-btn {
  position: absolute; top: 12px; right: 12px;
  background: none; border: none; cursor: pointer; color: var(--text-muted);
  padding: 4px; border-radius: var(--radius-sm); transition: all var(--transition-fast);
}
.toast-close-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

.toast-actions { display: flex; gap: var(--space-2); width: 100%; margin-top: var(--space-4); }
.toast-actions .toast-action {
  flex: 1; border: none; padding: 9px 16px; border-radius: var(--radius-md);
  cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: all var(--transition-fast);
}
.toast-action.primary { background: var(--primary); color: white; }
.toast-action.primary:hover { background: var(--primary-hover); }
.toast-action.secondary { background: var(--bg-hover); color: var(--text-primary); }
.toast-action.secondary:hover { background: var(--border-light); }

/* ── Toast animation ── */
.toast-enter-active { transition: all 0.35s cubic-bezier(0.22, 0.61, 0.36, 1); }
.toast-leave-active { transition: all 0.2s ease-in; }
.toast-enter-from { transform: translateX(120%); opacity: 0; }
.toast-leave-to { transform: translateX(120%); opacity: 0; }
</style>
