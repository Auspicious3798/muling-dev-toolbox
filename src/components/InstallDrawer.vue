<template>
  <Transition name="drawer">
    <div v-if="visible" class="drawer-overlay" @click.self="close">
      <div class="drawer-container">
        <div class="drawer-header">
          <h3>安装 {{ toolLabel }}</h3>
          <button class="close-btn" @click="close">✕</button>
        </div>
        <div class="drawer-body">
          <component
              :is="installerComponent"
              ref="installerRef"
              @installed="onInstalled"
          />
        </div>
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

export default {
  name: 'InstallDrawer',
  components: {
    JDKInstaller,
    PythonInstaller,
    MySQLInstaller,
    RedisInstaller,
    MavenInstaller,
    NginxInstaller,
  },
  props: {
    visible: Boolean,
    tool: String,
  },
  computed: {
    toolLabel() {
      const map = {jdk: 'JDK', python: 'Python', mysql: 'MySQL', redis: 'Redis', maven: 'Maven', nginx: 'Nginx'};
      return map[this.tool] || this.tool.toUpperCase();
    },
    installerComponent() {
      const components = {
        jdk: 'JDKInstaller',
        python: 'PythonInstaller',
        mysql: 'MySQLInstaller',
        redis: 'RedisInstaller',
        maven: 'MavenInstaller',
        nginx: 'NginxInstaller',
      };
      return components[this.tool];
    },
  },
  methods: {
    close() {
      this.$emit('update:visible', false);
    },
    onInstalled() {
      this.$emit('installed');
    },
  },
};
</script>

<style scoped>
.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.drawer-container {
  width: 500px;
  height: 100%;
  background: var(--bg-card);
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border-light);
}

.drawer-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-secondary);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
</style>