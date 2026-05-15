<template>
  <Transition name="drawer">
    <div v-if="visible" class="drawer-overlay" @click.self="close">
      <div class="drawer-container">
        <!-- Premium Header -->
        <div class="drawer-header">
          <div class="drawer-header-left">
            <div class="header-icon-wrap">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div class="header-text">
              <h3>安装 {{ toolLabel }}</h3>
              <span class="header-subtitle">选择版本并开始安装</span>
            </div>
          </div>
          <button class="close-btn" @click="close" aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Body -->
        <div class="drawer-body">
          <component :is="installerComponent" ref="installerRef" @installed="onInstalled"/>
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
        <p class="toast-tip">建议前往「设置」页面更换更快的代理节点</p>
        <div class="quarkpan-toast-box">
          <input type="text" readonly :value="quarkpanUrl" class="quarkpan-toast-input" @focus="$event.target.select()"/>
          <button @click="copyQuarkpanLink" class="quarkpan-toast-copy-btn">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
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
import NginxInstaller from './installers/NginxInstaller.vue';
import eventBus from '@/eventBus';

export default {
  name: 'InstallDrawer',
  components: { JDKInstaller, PythonInstaller, MySQLInstaller, RedisInstaller, MavenInstaller, NginxInstaller },
  props: { visible: Boolean, tool: String },
  emits: ['update:visible', 'installed'],
  data() {
    return {
      showSpeedWarning: false, speedWarningMessage: '', copied: false,
      quarkpanUrl: 'https://pan.quark.cn/s/93eb50a2e3e3',
    };
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onDownloadSpeedWarning((data) => { this.speedWarningMessage = data.message; this.showSpeedWarning = true; });
    }
  },
  computed: {
    toolLabel() { const m = {jdk:'JDK',python:'Python',mysql:'MySQL',redis:'Redis',maven:'Maven',nginx:'Nginx'}; return m[this.tool]||this.tool.toUpperCase(); },
    installerComponent() { const c = {jdk:'JDKInstaller',python:'PythonInstaller',mysql:'MySQLInstaller',redis:'RedisInstaller',maven:'MavenInstaller',nginx:'NginxInstaller'}; return c[this.tool]; },
  },
  methods: {
    close() { this.$emit('update:visible', false); },
    onInstalled() { this.$emit('installed'); },
    goToSettings() { this.showSpeedWarning = false; this.$emit('update:visible', false); eventBus.emit('navigate:settings'); },
    copyQuarkpanLink() {
      navigator.clipboard.writeText(this.quarkpanUrl).then(() => { this.copied=true; setTimeout(()=>{this.copied=false;},2000); })
      .catch(() => { const ta=document.createElement('textarea'); ta.value=this.quarkpanUrl; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); this.copied=true; setTimeout(()=>{this.copied=false;},2000); } catch(e){ alert('复制失败'); }
        document.body.removeChild(ta); });
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.drawer-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--overlay-bg);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  z-index: 1000; display: flex; justify-content: flex-end;
}

.drawer-container {
  width: 580px; height: 100%;
  background: var(--bg-primary);
  box-shadow: -8px 0 40px rgba(0,0,0,0.15);
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
.toast-tip { font-size: 0.78rem; color: var(--text-muted); margin: 0 0 var(--space-3); }

.quarkpan-toast-box { display: flex; gap: 6px; }

.quarkpan-toast-input {
  flex: 1; background: var(--bg-secondary); border: 1px solid var(--border-light);
  border-radius: var(--radius-sm); padding: 7px 10px; font-size: 0.73rem;
  color: var(--text-primary); font-family: var(--font-mono);
  outline: none; transition: all var(--transition-fast);
}
.quarkpan-toast-input:focus { border-color: var(--primary); }

.quarkpan-toast-copy-btn {
  background: var(--primary); color: white; border: none;
  padding: 7px 14px; border-radius: var(--radius-sm); font-size: 0.78rem;
  cursor: pointer; font-weight: 600; transition: all var(--transition-fast); flex-shrink: 0;
}
.quarkpan-toast-copy-btn:hover { background: var(--primary-hover); }

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
