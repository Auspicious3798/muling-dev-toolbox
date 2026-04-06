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
        document.body.style.backgroundColor = '#0f172a';
        document.body.style.color = '#f1f5f9';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.body.style.backgroundColor = '#f8fafc';
        document.body.style.color = '#1e293b';
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
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  -ms-overflow-style: none;
  scrollbar-width: none;
}

*::-webkit-scrollbar {
  display: none;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  overflow: hidden;
  transition: background-color 0.3s, color 0.3s;
}

.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
}

.right-panel {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background-color: transparent !important;
  position: relative;
}

.window-controls {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  height: 32px;
  z-index: 100;
}

.control-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s;
  -webkit-app-region: no-drag;
}

.control-btn:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.control-btn.close-btn:hover {
  background-color: #e81123;
  color: white;
}

/* 全局扫描遮罩 */
.global-scan-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
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
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border-light);
}

.scan-spinner {
  position: relative;
  width: 80px;
  height: 80px;
}

.spinner-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 3px solid transparent;
  border-radius: 50%;
  animation: spin 1.5s linear infinite;
}

.spinner-ring:nth-child(1) {
  border-top-color: #3b82f6;
  animation-delay: 0s;
}

.spinner-ring:nth-child(2) {
  border-right-color: #8b5cf6;
  animation-delay: 0.15s;
  width: 90%;
  height: 90%;
  top: 5%;
  left: 5%;
}

.spinner-ring:nth-child(3) {
  border-bottom-color: #06b6d4;
  animation-delay: 0.3s;
  width: 80%;
  height: 80%;
  top: 10%;
  left: 10%;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.scan-text {
  text-align: center;
}

.scan-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.scan-subtitle {
  font-size: 0.95rem;
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
  animation: pulse 1.4s ease-in-out infinite;
}

.scan-dots span:nth-child(1) {
  animation-delay: 0s;
}

.scan-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.scan-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse {
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* 遮罩过渡动画 */
.scan-overlay-enter-active,
.scan-overlay-leave-active {
  transition: opacity 0.3s ease;
}

.scan-overlay-enter-from,
.scan-overlay-leave-to {
  opacity: 0;
}

.scan-overlay-enter-to,
.scan-overlay-leave-from {
  opacity: 1;
}
</style>