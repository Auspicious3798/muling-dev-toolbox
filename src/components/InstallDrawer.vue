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
  
  <!-- 下载速度慢警告弹窗 -->
  <div v-if="showSpeedWarning" class="speed-warning-overlay" @click="showSpeedWarning = false">
    <div class="speed-warning-dialog" @click.stop>
      <div class="warning-header">
        <span class="warning-icon">⚠️</span>
        <span class="warning-title">下载速度较慢</span>
      </div>
      <div class="warning-body">
        <p class="warning-message">{{ speedWarningMessage }}</p>
        <p class="warning-tip">建议前往「设置」页面更换更快的代理节点</p>
      </div>
      <div class="warning-actions">
        <button class="btn-secondary" @click="showSpeedWarning = false">我知道了</button>
        <button class="btn-primary" @click="goToSettings">前往设置</button>
      </div>
    </div>
  </div>
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
  emits: ['update:visible', 'installed'],
  data() {
    return {
      showSpeedWarning: false,
      speedWarningMessage: '',
    };
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onDownloadSpeedWarning((data) => {
        this.speedWarningMessage = data.message;
        this.showSpeedWarning = true;
      });
    }
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
    goToSettings() {
      this.showSpeedWarning = false;
      this.$emit('update:visible', false);
      eventBus.emit('navigate:settings');
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

/* 下载速度慢警告样式 */
.speed-warning-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.speed-warning-dialog {
  background: var(--bg-card);
  border-radius: 16px;
  padding: 24px;
  min-width: 400px;
  max-width: 480px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.warning-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.warning-icon {
  font-size: 24px;
}

.warning-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.warning-body {
  margin-bottom: 24px;
}

.warning-message {
  font-size: 1rem;
  color: var(--text-primary);
  margin-bottom: 12px;
  line-height: 1.6;
}

.warning-tip {
  font-size: 0.9rem;
  color: var(--text-secondary);
  padding: 8px 12px;
  background-color: var(--info-bg);
  border-radius: 8px;
  border-left: 3px solid var(--info-text);
}

.warning-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.btn-secondary,
.btn-primary {
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: none;
}

.btn-secondary {
  background-color: var(--bg-secondary);
  color: var(--text-secondary);
}

.btn-secondary:hover {
  background-color: var(--border-light);
}

.btn-primary {
  background-color: var(--primary);
  color: white;
}

.btn-primary:hover {
  background-color: var(--primary-hover);
  transform: scale(0.98);
}
</style>