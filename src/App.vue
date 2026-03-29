<template>
  <div class="app-layout">
    <NavMenu :active="activeMenu" @select="activeMenu = $event"/>
    <div class="content-panel">
      <JDKInstaller v-if="activeMenu === 'jdk'"/>
      <div v-else-if="activeMenu === 'python'" class="coming-soon">
        <h3>🐍 Python 一键安装</h3>
        <p>即将支持，敬请期待</p>
      </div>
      <div v-else-if="activeMenu === 'mysql'" class="coming-soon">
        <h3>🗄️ MySQL 一键安装</h3>
        <p>即将支持，敬请期待</p>
      </div>
    </div>
    <div class="right-panel">
      <EnvironmentPanel :type="activeMenu"/>
    </div>
  </div>
</template>

<script>
import NavMenu from './components/NavMenu.vue';
import JDKInstaller from './components/installers/JDKInstaller.vue';
import EnvironmentPanel from './components/EnvironmentPanel.vue';

export default {
  name: 'App',
  components: {
    NavMenu,
    JDKInstaller,
    EnvironmentPanel
  },
  data() {
    return {
      activeMenu: 'jdk',
    };
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
}

.content-panel {
  flex: 1;
  background: #f0f2f5;
  padding: 20px;
  overflow-y: auto;
}

.right-panel {
  width: 400px;
  background: white;
  border-left: 1px solid #e2e8f0;
  padding: 20px;
  overflow-y: auto;
}

.coming-soon {
  background: white;
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-width: 600px;
  margin: 0 auto;
}

.coming-soon h3 {
  margin-bottom: 12px;
  color: #1e2a3a;
}

.coming-soon p {
  color: #5a6e7a;
}
</style>