<template>
  <div class="maven-installer">
    <h3>
      <img :src="MavenIcon" class="title-icon" alt=""/>
      Maven 安装
    </h3>

    <div class="mode-switch">
      <button :class="['mode-btn', { active: activeMode === 'online' }]" @click="switchMode('online')">
        🌐 联网下载
      </button>
      <button :class="['mode-btn', { active: activeMode === 'local' }]" @click="switchMode('local')">
        📁 手动导入
      </button>
    </div>

    <div v-if="activeMode === 'online'">
      <div class="install-path">
        <span class="path-label">安装目录：</span>
        <span class="path-display">{{ installPath }}</span>
      </div>
      <div class="install-status" v-if="installing">
        <div class="status-header">
          <span class="phase-label">
            {{ downloading ? '📥 下载中' : '🔧 安装中' }}
          </span>
          <span class="stage-label">{{ currentStage }}</span>
        </div>
        <div class="progress-wrapper">
          <div class="progress-bar" :class="{ 'downloading': downloading, 'installing': !downloading }">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <span class="progress-percent">{{ Math.round(progressPercent) }}%</span>
        </div>
        <div class="steps-log">
          <div v-for="(step, idx) in installSteps" :key="idx" class="step-item">
            <span class="step-icon">✅</span>
            <span class="step-text">{{ step }}</span>
          </div>
          <div v-if="currentStage && !installSteps.includes(getStepLabel(currentStage))" class="step-item current">
            <span class="step-icon">⏳</span>
            <span class="step-text">{{ getStepLabel(currentStage) }}</span>
          </div>
        </div>
      </div>
      <div class="button-group">
        <button @click="installMaven" :disabled="installing || jdkMissing" class="install-btn">
          {{ installing ? (downloading ? '下载中...' : '安装中...') : '开始安装' }}
        </button>
        <button v-if="downloading" @click="cancelDownload" class="cancel-btn">
          取消下载
        </button>
      </div>
      <div v-if="jdkMissing" class="warning-message">
        ⚠️ 未检测到 JDK，请先安装 JDK 后再安装 Maven。
      </div>
    </div>

    <div v-else>
      <div class="import-area">
        <button @click="importLocalMaven" class="import-btn">📁 选择 Maven 压缩包</button>
        <div v-if="localFilePath" class="import-path">
          <span class="path-label">已选择：</span>
          <span class="path-display">{{ localFilePath }}</span>
        </div>
        <div class="install-path">
          <span class="path-label">安装目录：</span>
          <span class="path-display">{{ installPath }}</span>
        </div>
      </div>
      
      <!-- 本地安装进度显示 -->
      <div class="install-status" v-if="installing && activeMode === 'local'">
        <div class="status-header">
          <span class="phase-label">🔧 安装中</span>
          <span class="stage-label">{{ currentStage }}</span>
        </div>
        <div class="progress-wrapper">
          <div class="progress-bar installing">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <span class="progress-percent">{{ Math.round(progressPercent) }}%</span>
        </div>
        <div class="steps-log">
          <div v-for="(step, idx) in installSteps" :key="idx" class="step-item">
            <span class="step-icon">✅</span>
            <span class="step-text">{{ step }}</span>
          </div>
          <div v-if="currentStage && !installSteps.includes(getStepLabel(currentStage))" class="step-item current">
            <span class="step-icon">⏳</span>
            <span class="step-text">{{ getStepLabel(currentStage) }}</span>
          </div>
        </div>
      </div>
      
      <div class="button-group">
        <button @click="installMavenLocal" :disabled="installing || !localFilePath || jdkMissing" class="install-btn">
          {{ installing ? '安装中...' : '开始安装' }}
        </button>
      </div>
      <div v-if="jdkMissing" class="warning-message">
        ⚠️ 未检测到 JDK，请先安装 JDK 后再安装 Maven。
      </div>
    </div>

    <div class="status" :class="{ 'status-success': status.includes('✅'), 'status-error': status.includes('❌') }">
      {{ status }}
    </div>
    <div class="progress-bar" v-if="showProgress">
      <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
    </div>
  </div>
</template>

<script>
import eventBus from '@/eventBus';
import MavenIcon from '../../../public/icons/maven.svg?url';

export default {
  name: 'MavenInstaller',
  data() {
    return {
      MavenIcon,
      activeMode: 'online',
      installing: false,
      downloading: false,
      status: '未安装',
      currentStage: '',
      installSteps: [],
      showProgress: false,
      progressPercent: 0,
      localFilePath: '',
      jdkMissing: false
    };
  },
  computed: {
    installPath() {
      return 'C:\\Program Files\\muling\\muling-env-box\\Maven';
    }
  },
  mounted() {
    this.checkJDK();
    if (window.electronAPI) {
      window.electronAPI.onMavenProgress((data) => {
        if (data.type === 'maven') {
          this.progressPercent = data.progress * 100;
          if (data.stage) {
            this.currentStage = data.stage;
            // 将每一步添加到步骤日志中（去重）
            const stepLabel = this.getStepLabel(data.stage);
            if (stepLabel && !this.installSteps.includes(stepLabel)) {
              this.installSteps.push(stepLabel);
            }
          }
          if (data.progress === 1) {
            this.status = '✅ Maven 安装成功';
            setTimeout(() => {
              this.showProgress = false;
            }, 1500);
          }
        }
      });
      // 监听 maven-changed 事件，刷新状态
      window.electronAPI.onMavenChanged(() => {
        this.checkJDK();
      });
    } else {
      this.status = '错误：未连接到主进程';
    }
  },
  methods: {
    getStepLabel(stage) {
      if (!stage) return '';
      const map = {
        '下载安装包': '下载 Maven 安装包',
        '解压中': '解压安装包',
        '配置环境变量': '配置系统环境变量'
      };
      return map[stage] || stage;
    },
    async checkJDK() {
      try {
        const result = await window.electronAPI.checkJDK();
        this.jdkMissing = !result.versions || result.versions.length === 0;
      } catch (err) {
        this.jdkMissing = true;
      }
    },
    switchMode(mode) {
      this.activeMode = mode;
      if (mode === 'local') {
        this.localFilePath = '';
      }
    },
    cancelDownload() {
      if (window.electronAPI && window.electronAPI.cancelMavenDownload) {
        window.electronAPI.cancelMavenDownload();
        this.status = '⏸️ 已取消下载';
        this.downloading = false;
        this.showProgress = false;
      }
    },
    async installMaven() {
      if (this.installing) return;
      this.installing = true;
      this.showProgress = true;
      this.progressPercent = 0;
      this.status = '⏳ 正在安装...';
      eventBus.emit('install:start');

      try {
        this.downloading = true;
        const result = await window.electronAPI.installMaven(false);
        if (result.success) {
          this.status = `✅ ${result.message}`;
          this.$emit('installed');
          setTimeout(() => {
            this.showProgress = false;
          }, 2000);
        } else {
          this.status = `❌ 安装失败：${result.message}`;
          this.showProgress = false;
        }
      } catch (err) {
        if (err.message && err.message.includes('canceled')) {
          this.status = '⏸️ 下载已取消';
        } else {
          this.status = `❌ 安装失败：${err.message}`;
        }
        this.showProgress = false;
      } finally {
        this.installing = false;
        this.downloading = false;
        eventBus.emit('install:end');
      }
    },
    async importLocalMaven() {
      const filePath = await window.electronAPI.openFileDialog({
        title: '选择 Maven 压缩包',
        filters: [
          {name: 'Maven 安装包', extensions: ['zip']},
          {name: '所有文件', extensions: ['*']}
        ]
      });
      if (!filePath) return;

      this.localFilePath = filePath;
      this.status = `✅ 已选择文件：${filePath}`;

      this.installing = true;
      this.showProgress = false;
      this.status = '⏳ 正在导入 Maven 安装包...';
      eventBus.emit('install:start');

      try {
        const result = await window.electronAPI.importLocalMaven(filePath);
        if (result.success) {
          this.status = `✅ ${result.message}，请点击“开始安装”完成配置。`;
        } else {
          this.status = `❌ 导入失败：${result.message}`;
          this.localFilePath = '';
        }
      } catch (err) {
        this.status = `❌ 导入失败：${err.message}`;
        this.localFilePath = '';
      } finally {
        this.installing = false;
        eventBus.emit('install:end');
      }
    },
    async installMavenLocal() {
      if (this.installing) return;
      this.installing = true;
      this.showProgress = true;
      this.progressPercent = 0;
      this.currentStage = '';
      this.installSteps = [];
      this.status = '⏳ 正在安装...';
      eventBus.emit('install:start');

      try {
        const result = await window.electronAPI.installMaven(true);
        if (result.success) {
          this.status = `✅ ${result.message}`;
          this.$emit('installed');
          setTimeout(() => {
            this.showProgress = false;
          }, 2000);
          this.localFilePath = '';
        } else {
          this.status = `❌ 安装失败：${result.message}`;
          this.showProgress = false;
        }
      } catch (err) {
        this.status = `❌ 安装失败：${err.message}`;
        this.showProgress = false;
      } finally {
        this.installing = false;
        eventBus.emit('install:end');
      }
    }
  }
};
</script>

<style scoped>
.maven-installer {
  background: var(--bg-card);
  border-radius: 20px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
  transition: box-shadow 0.3s ease;
}

.title-icon {
  width: 28px;
  height: 28px;
  vertical-align: middle;
  margin-right: 8px;
}

.maven-installer:hover {
  box-shadow: var(--shadow-md);
}

h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.mode-switch {
  display: flex;
  gap: 12px;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 12px;
}

.mode-btn {
  flex: 1;
  background: none;
  border: none;
  padding: 8px 12px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s;
  color: var(--text-secondary);
}

.mode-btn.active {
  background-color: var(--info-bg);
  color: var(--info-text);
}

.mode-btn:hover:not(.active) {
  background-color: var(--bg-hover);
}

.install-path, .import-path {
  margin: 1rem 0;
  padding: 0.6rem;
  background-color: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-light);
  display: flex;
  align-items: center;
  gap: 8px;
}

.import-path {
  background-color: var(--success-bg);
  border-color: var(--border-light);
}

.path-label {
  font-weight: 500;
  color: var(--text-secondary);
}

.path-display {
  font-family: monospace;
  color: var(--text-primary);
  word-break: break-all;
}

.import-area {
  margin-bottom: 1rem;
}

.import-btn {
  width: 100%;
  background-color: #8b5cf6;
  color: white;
  border: none;
  padding: 0.8rem;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 1rem;
}

.import-btn:hover {
  background-color: #7c3aed;
  transform: scale(0.98);
}

.button-group {
  display: flex;
  gap: 8px;
  margin-bottom: 1rem;
}

.install-btn, .cancel-btn {
  flex: 1;
  padding: 0.8rem;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.install-btn {
  background-color: var(--primary);
  color: white;
  border: none;
}

.install-btn:hover:not(:disabled) {
  background-color: var(--primary-hover);
  transform: scale(0.98);
}

.install-btn:disabled {
  background-color: var(--text-muted);
  cursor: not-allowed;
}

.cancel-btn {
  background-color: var(--danger-bg);
  color: var(--danger-text);
  border: none;
}

.cancel-btn:hover {
  background-color: var(--danger-bg);
  filter: brightness(0.95);
  transform: scale(0.98);
}

.status {
  font-size: 0.9rem;
  text-align: center;
  padding: 0.5rem;
  border-radius: 10px;
  background-color: var(--bg-secondary);
  margin-bottom: 1rem;
  transition: all 0.3s ease;
  color: var(--text-primary);
}

.status-success {
  background-color: var(--success-bg);
  color: var(--success-text);
}

.status-error {
  background-color: var(--danger-bg);
  color: var(--danger-text);
}

.progress-bar {
  width: 100%;
  background-color: var(--border-light);
  border-radius: 999px;
  overflow: hidden;
  height: 8px;
}

.progress-fill {
  height: 100%;
  background-color: var(--primary);
  width: 0;
  transition: width 0.2s linear;
  border-radius: 999px;
  animation: shimmer 1.2s infinite linear;
  background-image: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.1) 0%,
      rgba(255, 255, 255, 0.3) 50%,
      rgba(255, 255, 255, 0.1) 100%
  );
  background-size: 200% 100%;
}

@keyframes shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

.warning-message {
  margin-top: 12px;
  padding: 8px;
  background-color: var(--danger-bg);
  border-radius: 8px;
  color: var(--danger-text);
  font-size: 0.8rem;
}
</style>