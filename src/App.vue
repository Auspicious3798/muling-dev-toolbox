<template>
  <div class="app-layout">
    <NavMenu :active-tool="activeTool" @select-tool="handleToolSelect"/>
    <div class="right-panel">
      <Dashboard v-if="activeTool === 'dashboard'" @install="openDrawerFromDashboard"/>
      <Settings v-else-if="activeTool === 'settings'"/>
      <AboutLemon v-else-if="activeTool === 'about'"/>
      <AIAssistant v-else-if="activeTool === 'ai-assistant'"/>
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
  },
  data() {
    return {
      activeTool: 'dashboard',
      drawerVisible: false,
    };
  },
  mounted() {
    this.initTheme();
    eventBus.on('theme-change', this.handleThemeChange);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this.handleSystemThemeChange);
  },
  beforeUnmount() {
    eventBus.off('theme-change', this.handleThemeChange);
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
      this.$refs.envPanel?.refresh();
      setTimeout(() => {
        this.drawerVisible = false;
      }, 1000);
    },
    isComingSoon(tool) {
      const implemented = ['jdk', 'python', 'mysql', 'redis', 'maven', 'about', 'ai-assistant'];
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
      // 优先从 toolbox_settings 读取主题设置
      let savedTheme = localStorage.getItem('theme');
      const stored = localStorage.getItem('toolbox_settings');
      if (stored) {
        try {
          const settings = JSON.parse(stored);
          savedTheme = settings.theme || savedTheme;
        } catch (e) {
          // ignore parse error
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
}
</style>