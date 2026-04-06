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
  
  <!-- 下载速度慢提示（Toast 通知） -->
  <Transition name="toast">
    <div v-if="showSpeedWarning" class="speed-warning-toast">
      <div class="toast-content">
        <span class="toast-icon">⚠️</span>
        <div class="toast-text">
          <p class="toast-message">{{ speedWarningMessage }}</p>
          <p class="toast-tip">建议前往「设置」页面更换更快的代理节点</p>
          <div class="alipan-toast-box">
            <input type="text" readonly :value="alipanUrl" class="alipan-toast-input" />
            <button @click="copyAlipanLink" class="alipan-toast-copy-btn">
              {{ copied ? '✅' : '📋' }}
            </button>
          </div>
        </div>
        <button class="toast-close" @click="showSpeedWarning = false">✕</button>
      </div>
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
      copied: false,
      alipanUrl: 'https://www.alipan.com/s/qJWiQqF1FdB',
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
    copyAlipanLink() {
      navigator.clipboard.writeText(this.alipanUrl).then(() => {
        this.copied = true;
        setTimeout(() => {
          this.copied = false;
        }, 2000);
      }).catch(err => {
        console.error('复制失败:', err);
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = this.alipanUrl;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          this.copied = true;
          setTimeout(() => {
            this.copied = false;
          }, 2000);
        } catch (e) {
          alert('复制失败，请手动复制链接');
        }
        document.body.removeChild(textArea);
      });
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
  width: 600px;
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

/* 下载速度慢提示样式（Toast 通知） */
.speed-warning-toast {
  position: fixed;
  top: 80px;
  right: 20px;
  background: var(--bg-card);
  border-radius: 12px;
  padding: 16px;
  min-width: 380px;
  max-width: 450px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border-left: 4px solid var(--warning-bg);
  z-index: 3000;
  animation: slideInRight 0.3s ease;
}

@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.toast-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.toast-icon {
  font-size: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.toast-text {
  flex: 1;
}

.toast-message {
  font-size: 0.95rem;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  line-height: 1.5;
}

.toast-tip {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin: 0;
}

.alipan-toast-box {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  align-items: center;
}

.alipan-toast-input {
  flex: 1;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.8rem;
  color: var(--text-primary);
  font-family: 'Courier New', monospace;
  outline: none;
  transition: all 0.2s ease;
}

.alipan-toast-input:focus {
  border-color: #007AFF;
  box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.1);
}

.alipan-toast-copy-btn {
  background: #007AFF;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.alipan-toast-copy-btn:hover {
  background: #0051D5;
  transform: scale(1.05);
}

.toast-close {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.toast-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toast-action {
  width: 100%;
  background: var(--primary);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
}

.toast-actions {
  display: flex;
  gap: 8px;
}

.toast-actions .toast-action {
  flex: 1;
}

.toast-action.primary {
  background: var(--primary);
}

.toast-action.secondary {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toast-action:hover {
  transform: translateY(-1px);
}

.toast-action.primary:hover {
  background: var(--primary-hover);
}

/* Toast 过渡动画 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.toast-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
