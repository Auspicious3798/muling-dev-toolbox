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
    initTheme() {
      const savedTheme = localStorage.getItem('theme');
      const applyTheme = (theme) => {
        let isDark = false;
        if (theme === 'dark') isDark = true;
        else if (theme === 'light') isDark = false;
        else if (theme === 'system') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
      };

      if (savedTheme) {
        applyTheme(savedTheme);
      } else {
        applyTheme('system');
      }

      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'system') {
          applyTheme('system');
        }
      });
    },
    handleThemeChange(theme) {
      console.log('App.vue received theme-change event:', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        localStorage.setItem('theme', 'dark');
      } else if (theme === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      } else if (theme === 'system') {
        document.documentElement.classList.remove('light');
        localStorage.setItem('theme', 'system');
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
      console.log('Current theme class on html:', document.documentElement.classList.contains('dark') ? 'dark' : (document.documentElement.classList.contains('light') ? 'light' : 'system'));
    },
    handleSystemThemeChange(e) {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'system') {
        if (e.matches) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
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
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: var(--bg-secondary);
}

.right-panel {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
</style>