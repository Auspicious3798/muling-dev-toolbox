<template>
  <div class="app-layout">
    <NavMenu :active-tool="activeTool" @select-tool="handleToolSelect"/>
    <div class="right-panel">
      <Dashboard v-if="activeTool === 'dashboard'" @install="openDrawerFromDashboard"/>
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
  },
  data() {
    return {
      activeTool: 'dashboard',
      drawerVisible: false,
    };
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
      const implemented = ['jdk', 'python', 'mysql', 'redis', 'maven', 'settings', 'about', 'ai-assistant'];
      return !implemented.includes(tool);
    }
  },
};
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  overflow: hidden;
}

.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: #f0f2f5;
}

.right-panel {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
</style>