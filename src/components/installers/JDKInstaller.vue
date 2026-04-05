<template>
  <div class="jdk-installer">
    <h3>
      <img :src="JavaIcon" class="title-icon" alt=""/>
      JDK 安装
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
      <div class="version-selection">
        <div class="version-options">
          <label v-for="v in versionOptions" :key="v.value" class="version-option" :class="{ selected: selectedVersion === v.value }" @click="selectedVersion = v.value">
            <input type="radio" :value="v.value" v-model="selectedVersion" class="radio-hidden"/>
            <span class="version-name">{{ v.label }}</span>
            <span v-if="v.recommended" class="recommend-tag">推荐</span>
          </label>
        </div>
        <div class="version-info">
          <span v-if="selectedVersion === '8'" class="info-text">🏛️ 经典 LTS，企业级应用首选</span>
          <span v-else-if="selectedVersion === '11'" class="info-text">✅ LTS 版本，稳定可靠</span>
          <span v-else-if="selectedVersion === '17'" class="info-text">✅ 最新 LTS，性能优异</span>
          <span v-else-if="selectedVersion === '21'" class="info-text">🚀 长期支持版，现代特性</span>
          <span v-else class="info-text">💡 最新版本，体验前沿功能</span>
        </div>
      </div>
      <div class="install-path">
        <span class="path-label">安装目录：</span>
        <span class="path-display">{{ installPath }}</span>
      </div>
      <div class="button-group">
        <button @click="installJDK" :disabled="installing" class="install-btn">
          <span v-if="downloading">{{ `安装中 ${Math.round(progressPercent)}%` }}</span>
          <span v-else>{{ installing ? '安装中...' : '开始安装' }}</span>
        </button>
        <button v-if="downloading" @click="cancelDownload" class="cancel-btn">
          取消下载
        </button>
      </div>
    </div>

    <div v-else>
      <div class="import-area">
        <button @click="importLocalJDK" class="import-btn">📁 选择 JDK 压缩包</button>
        <div v-if="localFilePath" class="import-path">
          <span class="path-label">已选择：</span>
          <span class="path-display">{{ localFilePath }}</span>
        </div>
        <div class="version-input">
          <label>JDK 大版本号：</label>
          <input type="number" v-model.number="localVersion" min="8" max="26" step="1" class="version-number-input"/>
          <button @click="validateLocalVersion" class="validate-btn">验证目录</button>
        </div>
        <div v-if="dirExistsWarning" class="warning-message">
          ⚠️ 安装目录已存在文件！请删除或选择其他版本。
        </div>
        <div class="install-path">
          <span class="path-label">安装目录：</span>
          <span class="path-display">{{ localInstallPath }}</span>
        </div>
      </div>
      <div class="button-group">
        <button @click="installFromLocal" :disabled="installing || !localFilePath || dirExistsWarning"
                class="install-btn">
          {{ installing ? '安装中...' : '开始安装' }}
        </button>
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
import JavaIcon from '../../../public/icons/java.svg?url';

export default {
  name: 'JDKInstaller',
  data() {
    return {
      JavaIcon,
      activeMode: 'online',
      selectedVersion: '21',
      versionOptions: [
        { value: '26', label: 'JDK 26', recommended: false },
        { value: '25', label: 'JDK 25', recommended: false },
        { value: '24', label: 'JDK 24', recommended: false },
        { value: '23', label: 'JDK 23', recommended: false },
        { value: '22', label: 'JDK 22', recommended: false },
        { value: '21', label: 'JDK 21', recommended: true },
        { value: '20', label: 'JDK 20', recommended: false },
        { value: '19', label: 'JDK 19', recommended: false },
        { value: '18', label: 'JDK 18', recommended: false },
        { value: '17', label: 'JDK 17', recommended: false },
        { value: '16', label: 'JDK 16', recommended: false },
        { value: '15', label: 'JDK 15', recommended: false },
        { value: '14', label: 'JDK 14', recommended: false },
        { value: '13', label: 'JDK 13', recommended: false },
        { value: '12', label: 'JDK 12', recommended: false },
        { value: '11', label: 'JDK 11', recommended: false },
        { value: '8', label: 'JDK 8', recommended: false }
      ],
      installing: false,
      downloading: false,
      status: '未安装',
      showProgress: false,
      progressPercent: 0,
      localFilePath: '',
      localVersion: 21,
      dirExistsWarning: false
    };
  },
  computed: {
    installPath() {
      return `C:\\Program Files\\Java\\jdk-${this.selectedVersion}`;
    },
    localInstallPath() {
      return `C:\\Program Files\\Java\\jdk-${this.localVersion}`;
    }
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onDownloadProgress((data) => {
        if (data.type === 'jdk' && data.version === this.selectedVersion) {
          this.progressPercent = data.progress * 100;
          if (data.progress === 1) {
            this.status = '下载完成，正在安装...';
          }
        }
      });
    } else {
      this.status = '错误：未连接到主进程';
    }
  },
  methods: {
    switchMode(mode) {
      this.activeMode = mode;
      if (mode === 'local') {
        this.localFilePath = '';
        this.localVersion = 21;
        this.dirExistsWarning = false;
      }
    },
    cancelDownload() {
      if (window.electronAPI && window.electronAPI.cancelDownload) {
        window.electronAPI.cancelDownload();
        this.status = '⏸️ 已取消下载';
        this.downloading = false;
        this.showProgress = false;
      }
    },
    async installJDK() {
      if (this.installing) return;
      this.installing = true;
      this.showProgress = true;
      this.progressPercent = 0;
      this.status = '⏳ 正在安装...';
      eventBus.emit('install:start');

      try {
        this.downloading = true;
        const result = await window.electronAPI.installJDK(this.selectedVersion);
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
    async importLocalJDK() {
      const filePath = await window.electronAPI.openFileDialog({
        title: '选择 JDK 安装包',
        filters: [
          {name: 'JDK 安装包', extensions: ['zip']},
          {name: '所有文件', extensions: ['*']}
        ]
      });
      if (!filePath) return;

      this.localFilePath = filePath;
      this.status = `✅ 已选择文件：${filePath}`;

      const version = this.localVersion;
      if (!version || version < 8 || version > 26) {
        this.status = '❌ 导入失败：版本号应在 8 到 26 之间。';
        this.localFilePath = '';
        return;
      }

      this.installing = true;
      this.showProgress = false;
      this.status = '⏳ 正在导入 JDK 安装包...';
      eventBus.emit('install:start');

      try {
        const result = await window.electronAPI.importLocalJDK(filePath);
        if (result.success) {
          this.status = `✅ ${result.message}，请点击“开始安装”完成配置。`;
          await this.validateLocalVersion();
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
    async validateLocalVersion() {
      if (!this.localFilePath) {
        this.status = '请先选择 JDK 安装包。';
        return;
      }
      try {
        const exists = await window.electronAPI.checkPathExists(this.localInstallPath);
        this.dirExistsWarning = exists;
        if (exists) {
          this.status = '⚠️ 安装目录已存在文件，请删除或选择其他版本。';
        } else {
          this.status = '✅ 安装目录可用。';
        }
      } catch (err) {
        console.error('检查目录失败', err);
        this.dirExistsWarning = false;
      }
    },
    async installFromLocal() {
      if (this.installing) return;
      if (this.dirExistsWarning) {
        this.status = '❌ 安装目录已存在文件，请删除或选择其他版本。';
        return;
      }
      this.installing = true;
      this.showProgress = true;
      this.progressPercent = 0;
      this.status = '⏳ 正在安装...';
      eventBus.emit('install:start');

      try {
        const result = await window.electronAPI.installFromLocal(this.localVersion);
        if (result.success) {
          this.status = `✅ ${result.message}`;
          this.$emit('installed');
          setTimeout(() => {
            this.showProgress = false;
          }, 2000);
          this.localFilePath = '';
          this.dirExistsWarning = false;
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
.jdk-installer {
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

.jdk-installer:hover {
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

/* Version selection area */
.version-selection {
  margin-bottom: 1rem;
}

.version-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
}

.version-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 10px;
  border: 2px solid var(--border-medium);
  background-color: var(--bg-input);
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  font-size: 0.85rem;
  min-width: 80px;
}

.version-option:hover {
  border-color: var(--primary);
  background-color: var(--bg-hover);
}

.version-option.selected {
  border-color: var(--primary);
  background-color: var(--primary-bg);
}

.version-option.selected .version-name {
  color: var(--primary);
  font-weight: 600;
}

.version-option .radio-hidden {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.version-name {
  font-size: 0.85rem;
  color: var(--text-primary);
}

.recommend-tag {
  display: inline-block;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: white;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 8px;
  white-space: nowrap;
}

.version-info {
  display: flex;
  min-height: 20px;
}

.info-text {
  font-size: 0.8rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.version-select {
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--border-medium);
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.95rem;
  margin-bottom: 1rem;
  transition: all 0.2s ease;
}

.version-select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
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

.version-input {
  margin: 1rem 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.version-number-input {
  width: 100px;
  padding: 6px 12px;
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  font-size: 1rem;
  background-color: var(--bg-input);
  color: var(--text-primary);
}

.validate-btn {
  background-color: var(--text-muted);
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.2s;
}

.validate-btn:hover {
  background-color: var(--text-secondary);
}

.warning-message {
  margin-top: 8px;
  padding: 8px;
  background-color: var(--danger-bg);
  border-radius: 8px;
  color: var(--danger-text);
  font-size: 0.8rem;
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
  width: 0%;
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
</style>