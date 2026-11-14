<template>
  <div class="app-layout" :class="{ 'is-maximized': isMaximized }">
    <!-- 全局扫描遮罩 -->
    <transition name="scan-overlay">
      <div v-if="showScanOverlay" class="global-scan-overlay">
        <div class="scan-content">
          <div class="scan-spinner">
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
          </div>
          <div class="scan-text">
            <p class="scan-title">正在扫描环境</p>
            <p class="scan-subtitle">正在检测已安装的 {{ scanningTool }} 版本...</p>
          </div>
          <div class="scan-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </transition>

    <NavMenu :active-tool="activeTool" @select-tool="handleToolSelect"/>
    <div class="right-panel">
      <div class="window-controls">
        <div class="control-btn" @click="minimizeWindow">─</div>
        <div class="control-btn close-btn" @click="closeWindow">✕</div>
      </div>
      <Dashboard v-if="activeTool === 'dashboard'" @install="openDrawerFromDashboard"/>
      <Settings v-else-if="activeTool === 'settings'"/>
      <div v-else-if="activeTool === 'about' || activeTool === 'product'" class="merged-page">
        <ProductIntro/>
        <AboutLemon/>
      </div>
      <AIAssistant v-else-if="activeTool === 'ai-assistant'"/>
      <NginxManager v-else-if="activeTool === 'nginx'" @install="openDrawer"/>
      <ComingSoon v-else-if="isComingSoon(activeTool)" :tool="activeTool"/>
      <EnvironmentPanel v-else ref="envPanel" :tool="activeTool" @install="openDrawer"/>
    </div>
    <InstallDrawer
        v-model:visible="drawerVisible"
        :tool="activeTool"
        @installed="onInstalled"
    />
    <TerminalPanel v-if="terminalOpen" :focus="terminalFocus" @close="terminalOpen = false"/>
    <LemonToast/>
  </div>
</template>

<script>
import NavMenu from './components/NavMenu.vue';
import EnvironmentPanel from './components/EnvironmentPanel.vue';
import InstallDrawer from './components/InstallDrawer.vue';
import AboutLemon from './components/AboutLemon.vue';
import AIAssistant from './components/AIAssistant.vue';
import ComingSoon from './components/ComingSoon.vue';
import Dashboard from './components/Dashboard.vue';
import Settings from './components/Settings.vue';
import NginxManager from './components/NginxManager.vue';
import ProductIntro from './components/ProductIntro.vue';
import TerminalPanel from './components/TerminalPanel.vue';
import LemonToast from './components/LemonToast.vue';
import eventBus from './eventBus';
import '@/styles/theme.css';

export default {
  name: 'App',
  components: {
    NavMenu,
    EnvironmentPanel,
    InstallDrawer,
    AboutLemon,
    AIAssistant,
    ComingSoon,
    Dashboard,
    Settings,
    NginxManager,
    ProductIntro,
    TerminalPanel,
    LemonToast,
  },
  data() {
    return {
      activeTool: 'dashboard',
      drawerVisible: false,
      terminalOpen: false,
      terminalFocus: null,
      showScanOverlay: false,
      scanningTool: '',
      isMaximized: false,
      unsubscribeMaximized: null,
    };
  },
  mounted() {
    this.initTheme();
    this.syncCloseBehavior();
    this.syncWindowState();
    eventBus.on('theme-change', this.handleThemeChange);
    eventBus.on('scan-start', this.handleScanStart);
    eventBus.on('scan-end', this.handleScanEnd);
    eventBus.on('navigate:settings', this.handleNavigateToSettings);
    eventBus.on('terminal:open', this.openTerminalPanel);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this.handleSystemThemeChange);
    setTimeout(() => this.restoreServices(), 1800);
  },
  beforeUnmount() {
    if (typeof this.unsubscribeMaximized === 'function') this.unsubscribeMaximized();
    eventBus.off('theme-change', this.handleThemeChange);
    eventBus.off('scan-start', this.handleScanStart);
    eventBus.off('scan-end', this.handleScanEnd);
    eventBus.off('navigate:settings', this.handleNavigateToSettings);
    eventBus.off('terminal:open', this.openTerminalPanel);
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', this.handleSystemThemeChange);
  },
  methods: {
    async restoreServices() {
      if (!window.electronAPI || !window.electronAPI.getServiceState) return;
      let settings = {};
      try {
        settings = JSON.parse(localStorage.getItem('toolbox_settings') || '{}') || {};
      } catch (err) {
        settings = {};
      }
      if (settings.autoRestoreServices === false) return;
      try {
        const state = await window.electronAPI.getServiceState();
        const services = (state && state.success && state.services) || {};
        const starters = {
          mysql: window.electronAPI.startMySQLService,
          redis: window.electronAPI.startRedisService,
          nginx: window.electronAPI.startNginx
        };
        const labels = {mysql: 'MySQL', redis: 'Redis', nginx: 'Nginx'};
        const started = [];
        for (const tool of Object.keys(starters)) {
          if (!services[tool] || typeof starters[tool] !== 'function') continue;
          try {
            const res = await starters[tool]();
            if (res && res.success) started.push(labels[tool]);
          } catch (err) {}
        }
        if (started.length && window.Lemon) {
          window.Lemon.success(`${started.join('、')} 已经按上次的状态帮你启动好啦～`);
        }
      } catch (err) {}
    },
    handleToolSelect(toolId) {
      this.terminalOpen = false;
      this.activeTool = toolId;
      this.drawerVisible = false;
    },
    syncCloseBehavior() {
      if (!window.electronAPI || !window.electronAPI.setCloseBehavior) return;
      let behavior = 'tray';
      try {
        const stored = localStorage.getItem('toolbox_settings');
        if (stored) {
          const settings = JSON.parse(stored);
          if (settings.closeBehavior === 'exit') behavior = 'exit';
        }
      } catch (err) {
      }
      window.electronAPI.setCloseBehavior(behavior);
    },
    syncWindowState() {
      if (!window.electronAPI || !window.electronAPI.onWindowMaximized) return;
      this.unsubscribeMaximized = window.electronAPI.onWindowMaximized((maximized) => {
        this.isMaximized = Boolean(maximized);
      });
    },
    openTerminalPanel(payload) {
      if (payload && payload.tool && payload.version) {
        this.terminalFocus = { tool: payload.tool, version: payload.version };
      } else {
        this.terminalFocus = null;
      }
      this.terminalOpen = true;
    },
    openDrawer() {
      this.drawerVisible = true;
    },
    openDrawerFromDashboard(toolId) {
      this.activeTool = toolId;
      this.drawerVisible = true;
    },
    onInstalled() {
      // 根据当前工具类型触发对应的刷新
      if (this.activeTool === 'nginx') {
        // Nginx 安装完成后，通过 eventBus 通知 NginxManager 自动刷新
        console.log('[App.vue] Nginx 安装完成，触发自动刷新');
        eventBus.emit('scan-start', 'Nginx');
        setTimeout(() => {
          eventBus.emit('scan-end');
        }, 500);
      } else if (this.$refs.envPanel) {
        // 其他工具刷新 EnvironmentPanel（会自动发送 scan-start/scan-end 事件）
        this.$refs.envPanel.refresh();
      }
      
      setTimeout(() => {
        this.drawerVisible = false;
      }, 1000);
    },
    isComingSoon(tool) {
      const implemented = ['jdk', 'python', 'mysql', 'redis', 'maven', 'gradle', 'uv', 'nodejs', 'about', 'ai-assistant', 'dashboard', 'settings', 'nginx'];
      return !implemented.includes(tool);
    },
    applyTheme(theme) {
      let isDark = false;
      if (theme === 'dark') isDark = true;
      else if (theme === 'light') isDark = false;
      else if (theme === 'system') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

      if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.body.style.backgroundColor = '';
        document.body.style.color = '#f1f5f9';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.body.style.backgroundColor = '';
        document.body.style.color = '#0f172a';
      }
      localStorage.setItem('theme', theme);
    },
    initTheme() {
      let savedTheme = localStorage.getItem('theme');
      const stored = localStorage.getItem('toolbox_settings');
      if (stored) {
        try {
          const settings = JSON.parse(stored);
          savedTheme = settings.theme || savedTheme;
        } catch (e) {
        }
      }

      if (savedTheme) {
        this.applyTheme(savedTheme);
      } else {
        this.applyTheme('system');
      }
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'system') {
          this.applyTheme('system');
        }
      });
    },
    handleThemeChange(theme) {
      this.applyTheme(theme);
    },
    handleSystemThemeChange(e) {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'system') {
        this.applyTheme('system');
      }
    },
    minimizeWindow() {
      if (window.electronAPI) window.electronAPI.minimizeWindow();
    },
    closeWindow() {
      if (window.electronAPI) window.electronAPI.closeWindow();
    },
    handleScanStart(toolLabel) {
      console.log('[App.vue] 收到 scan-start 事件，工具:', toolLabel);
      this.scanningTool = toolLabel;
      this.showScanOverlay = true;
      console.log('[App.vue] showScanOverlay:', this.showScanOverlay);
    },
    handleScanEnd() {
      console.log('[App.vue] 收到 scan-end 事件');
      this.showScanOverlay = false;
      this.scanningTool = '';
    },
    handleNavigateToSettings() {
      console.log('[App.vue] 收到 navigate:settings 事件');
      this.activeTool = 'settings';
    },
  },
};
</script>

<style>
/* ── Reset & Base ── */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.6;
  overflow: hidden;
  background-color: transparent;
  color: var(--text-primary);
  transition: background-color var(--transition-slow), color var(--transition-slow);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Scrollbars hidden (wheel / trackpad still scrolls) ── */
* {
  scrollbar-width: none;
}
*::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

/* ── Layout ── */
.app-layout {
  position: relative;
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  border-radius: 16px;
  background-color: var(--bg-primary);
  background-image: var(--window-sheen);
  box-shadow: var(--glass-depth);
  transition: border-radius var(--transition-fast);
}

.app-layout > * {
  position: relative;
  z-index: 1;
}

.app-layout.is-maximized {
  border-radius: 0;
}

.right-panel {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
  background-color: transparent;
  position: relative;
}

/* ── 产品介绍 + 关于沐柠 合并页 ── */
.merged-page {
  height: 100%;
  overflow-y: auto;
}

.merged-page > * {
  height: auto;
  overflow: visible;
}

.merged-page > * + * {
  margin-top: var(--space-6);
}

/* ── Window Controls ── */
.window-controls {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  height: 36px;
  z-index: 100;
  -webkit-app-region: no-drag;
}

.control-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
  -webkit-app-region: no-drag;
  user-select: none;
  font-family: var(--font-sans);
}

.control-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
}

.control-btn.close-btn:hover {
  background-color: #ef4444;
  color: white;
}

/* ── Global Scan Overlay ── */
.global-scan-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
}

.scan-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  padding: 48px 64px;
  background: var(--glass-tint-strong);
  border-radius: var(--glass-radius-lg);
  box-shadow: var(--glass-shadow-float);
  border: 1px solid var(--glass-stroke);
  backdrop-filter: blur(36px) saturate(180%);
  -webkit-backdrop-filter: blur(36px) saturate(180%);
}

.scan-spinner {
  position: relative;
  width: 72px;
  height: 72px;
}

.spinner-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 3px solid transparent;
  border-radius: 50%;
  animation: spin 1.2s linear infinite;
}

.spinner-ring:nth-child(1) {
  border-top-color: var(--primary);
}
.spinner-ring:nth-child(2) {
  border-right-color: var(--accent);
  animation-delay: 0.15s;
  width: 88%;
  height: 88%;
  top: 6%;
  left: 6%;
}
.spinner-ring:nth-child(3) {
  border-bottom-color: var(--info);
  animation-delay: 0.3s;
  width: 76%;
  height: 76%;
  top: 12%;
  left: 12%;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.scan-text {
  text-align: center;
}

.scan-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  letter-spacing: -0.3px;
}

.scan-subtitle {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin: 0;
}

.scan-dots {
  display: flex;
  gap: 8px;
}

.scan-dots span {
  width: 10px;
  height: 10px;
  background: var(--primary);
  border-radius: 50%;
  animation: dotPulse 1.4s ease-in-out infinite;
}

.scan-dots span:nth-child(1) { animation-delay: 0s; }
.scan-dots span:nth-child(2) { animation-delay: 0.2s; }
.scan-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotPulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* ── Overlay transitions ── */
.scan-overlay-enter-active,
.scan-overlay-leave-active {
  transition: opacity 0.25s ease;
}
.scan-overlay-enter-from,
.scan-overlay-leave-to {
  opacity: 0;
}

/* ── Selection ── */
::selection {
  background-color: var(--primary);
  color: white;
}
</style>