<template>
  <div class="app-layout">
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
        <div class="control-btn" @click="maximizeWindow">□</div>
        <div class="control-btn close-btn" @click="closeWindow">✕</div>
      </div>
      <Dashboard v-if="activeTool === 'dashboard'" @install="openDrawerFromDashboard"/>
      <Settings v-else-if="activeTool === 'settings'"/>
      <ProductIntro v-else-if="activeTool === 'product'"/>
      <AboutLemon v-else-if="activeTool === 'about'"/>
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
  },
  data() {
    return {
      activeTool: 'dashboard',
      drawerVisible: false,
      showScanOverlay: false,
      scanningTool: '',
    };
  },
  mounted() {
    this.initTheme();
    eventBus.on('theme-change', this.handleThemeChange);
    eventBus.on('scan-start', this.handleScanStart);
    eventBus.on('scan-end', this.handleScanEnd);
    eventBus.on('navigate:settings', this.handleNavigateToSettings);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this.handleSystemThemeChange);
  },
  beforeUnmount() {
    eventBus.off('theme-change', this.handleThemeChange);
    eventBus.off('scan-start', this.handleScanStart);
    eventBus.off('scan-end', this.handleScanEnd);
    eventBus.off('navigate:settings', this.handleNavigateToSettings);
    window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', this.handleSystemThemeChange);
  },
  methods: {
    handleToolSelect(toolId) {
      this.activeTool = toolId;
      this.drawerVisible = false;
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
      const implemented = ['jdk', 'python', 'mysql', 'redis', 'maven', 'about', 'product', 'ai-assistant', 'dashboard', 'settings', 'nginx'];
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
        document.body.style.backgroundColor = '#0b1120';
        document.body.style.color = '#f1f5f9';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.body.style.backgroundColor = '#f1f5f9';
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
    maximizeWindow() {
      if (window.electronAPI) window.electronAPI.maximizeWindow();
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
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color var(--transition-slow), color var(--transition-slow);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Minimal Scrollbar ── */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}
*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
*::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}
*::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}
*::-webkit-scrollbar-thumb:hover {
  background: var(--border-dark);
}

/* ── Layout ── */
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.right-panel {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
  background-color: var(--bg-primary);
  position: relative;
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
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-light);
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