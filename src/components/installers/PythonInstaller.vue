<template>
  <div class="python-installer">
    <h3>🐍 Python 安装</h3>

    <div class="mode-switch">
      <button :class="['mode-btn', { active: activeMode === 'online' }]" @click="switchMode('online')">
        🌐 联网下载
      </button>
      <button :class="['mode-btn', { active: activeMode === 'local' }]" @click="switchMode('local')">
        📁 手动导入
      </button>
    </div>

    <div class="mirror-select">
      <label>pip 镜像源：</label>
      <select v-model="pipMirror">
        <option value="https://pypi.tuna.tsinghua.edu.cn/simple">清华大学</option>
        <option value="https://mirrors.aliyun.com/pypi/simple/">阿里云</option>
        <option value="https://mirrors.ustc.edu.cn/pypi/web/simple/">中科大</option>
        <option value="https://pypi.douban.com/simple/">豆瓣</option>
        <option value="https://pypi.org/simple">官方（PyPI）</option>
      </select>
    </div>

    <div v-if="activeMode === 'online'">
      <select v-model="selectedVersion" class="version-select">
        <option value="3.14.3">Python 3.14.3</option>
        <option value="3.13.12">Python 3.13.12</option>
        <option value="3.12.9">Python 3.12.9</option>
        <option value="3.11.9">Python 3.11.9</option>
        <option value="3.10.10">Python 3.10.10</option>
        <option value="3.9.10">Python 3.9.10</option>
        <option value="3.8.10">Python 3.8.10</option>
        <option value="3.7.8">Python 3.7.8</option>
        <option value="3.6.8">Python 3.6.8</option>
        <option value="3.5.3">Python 3.5.3</option>
      </select>
      <div class="install-path">
        <span class="path-label">安装目录：</span>
        <span class="path-display">{{ installPath }}</span>
      </div>
      <div class="button-group">
        <button @click="installPython" :disabled="installing" class="install-btn">
          {{ installing ? '安装中...' : '开始安装' }}
        </button>
        <button v-if="downloading" @click="cancelDownload" class="cancel-btn">
          取消下载
        </button>
      </div>
    </div>

    <div v-else>
      <div class="import-area">
        <button @click="importLocalPython" class="import-btn">📁 选择 Python 压缩包</button>
        <div v-if="localFilePath" class="import-path">
          <span class="path-label">已选择：</span>
          <span class="path-display">{{ localFilePath }}</span>
        </div>
        <div class="version-input">
          <label>Python 版本号：</label>
          <input type="text" v-model="localVersion" placeholder="例如 3.12.9" class="version-text-input"/>
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

export default {
  name: 'PythonInstaller',
  data() {
    return {
      activeMode: 'online',
      selectedVersion: '3.12.9',
      installing: false,
      downloading: false,
      status: '未安装',
      showProgress: false,
      progressPercent: 0,
      localFilePath: '',
      localVersion: '3.12.9',
      dirExistsWarning: false,
      pipMirror: 'https://pypi.tuna.tsinghua.edu.cn/simple'
    };
  },
  computed: {
    installPath() {
      return `C:\\Program Files\\Python\\python-${this.selectedVersion}`;
    },
    localInstallPath() {
      if (!this.localVersion) return '';
      return `C:\\Program Files\\Python\\python-${this.localVersion}`;
    }
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onDownloadProgress((data) => {
        if (data.type === 'python' && data.version === this.selectedVersion) {
          this.progressPercent = data.progress * 100;
          if (data.stage) {
            this.status = data.stage;
          } else if (data.progress === 1) {
            this.status = '安装完成';
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
        this.localVersion = '3.12.9';
        this.dirExistsWarning = false;
      }
    },
    cancelDownload() {
      if (window.electronAPI && window.electronAPI.cancelPythonDownload) {
        window.electronAPI.cancelPythonDownload();
        this.status = '⏸️ 已取消下载';
        this.downloading = false;
        this.showProgress = false;
      }
    },
    async installPython() {
      if (this.installing) return;
      this.installing = true;
      this.showProgress = true;
      this.progressPercent = 0;
      this.status = '准备安装...';
      eventBus.emit('install:start');

      try {
        this.downloading = true;
        const result = await window.electronAPI.installPython(this.selectedVersion, this.pipMirror);
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
    async importLocalPython() {
      const filePath = await window.electronAPI.openFileDialog({
        title: '选择 Python 压缩包',
        filters: [
          {name: 'Python 安装包', extensions: ['zip']},
          {name: '所有文件', extensions: ['*']}
        ]
      });
      if (!filePath) return;

      this.localFilePath = filePath;
      this.status = `✅ 已选择文件：${filePath}`;

      const version = this.localVersion;
      if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
        this.status = '❌ 导入失败：版本号格式应为 x.y.z（例如 3.12.9）';
        this.localFilePath = '';
        return;
      }

      this.installing = true;
      this.showProgress = false;
      this.status = '⏳ 正在导入 Python 安装包...';
      eventBus.emit('install:start');

      try {
        const result = await window.electronAPI.importLocalPython(filePath);
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
        this.status = '请先选择 Python 安装包。';
        return;
      }
      if (!this.localVersion || !/^\d+\.\d+\.\d+$/.test(this.localVersion)) {
        this.status = '❌ 版本号无效，格式应为 x.y.z（例如 3.12.9）';
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
      if (!this.localVersion || !/^\d+\.\d+\.\d+$/.test(this.localVersion)) {
        this.status = '❌ 版本号无效，请重新导入并填写正确版本。';
        return;
      }
      this.installing = true;
      this.showProgress = true;
      this.progressPercent = 0;
      this.status = '准备安装...';
      eventBus.emit('install:start');

      try {
        const result = await window.electronAPI.installFromLocalPython(this.localVersion, this.pipMirror);
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
.python-installer {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
  transition: box-shadow 0.3s ease;
}

.python-installer:hover {
  box-shadow: 0 20px 25px -12px rgba(0, 0, 0, 0.1);
}

h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #1f2937;
}

.mode-switch {
  display: flex;
  gap: 12px;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid #e5e7eb;
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
  color: #6b7280;
}

.mode-btn.active {
  background-color: #e0f2fe;
  color: #0369a1;
}

.mode-btn:hover:not(.active) {
  background-color: #f3f4f6;
}

.mirror-select {
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mirror-select label {
  font-weight: 500;
  color: #4b5563;
}

.mirror-select select {
  flex: 1;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background-color: #f9fafb;
  font-size: 0.9rem;
}

.version-select {
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background-color: #f9fafb;
  font-size: 0.95rem;
  margin-bottom: 1rem;
  transition: all 0.2s ease;
}

.version-select:focus {
  outline: none;
  border-color: #2c7a4d;
  box-shadow: 0 0 0 3px rgba(44, 122, 77, 0.1);
}

.install-path {
  margin: 1rem 0;
  padding: 0.6rem;
  background-color: #f9fafb;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.import-path {
  margin: 0.5rem 0;
  padding: 0.6rem;
  background-color: #f0fdf4;
  border-radius: 12px;
  border: 1px solid #bbf7d0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-label {
  font-weight: 500;
  color: #4b5563;
}

.path-display {
  font-family: monospace;
  color: #1f2937;
  word-break: break-all;
}

.version-input {
  margin: 1rem 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.version-text-input {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
}

.validate-btn {
  background-color: #6b7280;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.2s;
}

.validate-btn:hover {
  background-color: #4b5563;
}

.warning-message {
  margin-top: 8px;
  padding: 8px;
  background-color: #fee2e2;
  border-radius: 8px;
  color: #991b1b;
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
  background-color: #2c7a4d;
  color: white;
  border: none;
}

.install-btn:hover:not(:disabled) {
  background-color: #1f5e3a;
  transform: scale(0.98);
}

.install-btn:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
}

.cancel-btn {
  background-color: #ef4444;
  color: white;
  border: none;
}

.cancel-btn:hover {
  background-color: #dc2626;
  transform: scale(0.98);
}

.status {
  font-size: 0.9rem;
  text-align: center;
  padding: 0.5rem;
  border-radius: 10px;
  background-color: #f3f4f6;
  margin-bottom: 1rem;
  transition: all 0.3s ease;
}

.status-success {
  background-color: #dcfce7;
  color: #166534;
}

.status-error {
  background-color: #fee2e2;
  color: #991b1b;
}

.progress-bar {
  width: 100%;
  background-color: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
  height: 8px;
}

.progress-fill {
  height: 100%;
  background-color: #2c7a4d;
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