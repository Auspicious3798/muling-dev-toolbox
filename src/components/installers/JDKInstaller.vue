<template>
  <div class="jdk-installer">
    <h3>☕ JDK</h3>
    <div class="detect-area">
      <button @click="checkJDK" class="detect-btn" :disabled="checking">
        {{ checking ? '检测中...' : '环境检测' }}
      </button>
      <div v-if="detectedVersions.length" class="detected-list">
        <div class="default-version" v-if="defaultVersion">
          <span>当前默认 JDK：</span>
          <span class="version-badge">{{ defaultVersion }}</span>
        </div>
        <div v-for="v in detectedVersions" :key="v" class="version-card">
          <span class="version-number">JDK {{ v }}</span>
          <div class="card-actions">
            <button @click="switchToVersion(v)" class="switch-btn" title="设为默认">🔄 切换</button>
            <button @click="deleteVersion(v)" class="delete-btn" title="卸载">🗑️ 卸载</button>
          </div>
        </div>
      </div>
      <div v-else-if="!checking" class="no-version">
        未检测到 JDK
      </div>
    </div>
    <select v-model="selectedVersion" class="version-select">
      <option value="26">JDK 26</option>
      <option value="25">JDK 25</option>
      <option value="24">JDK 24</option>
      <option value="23">JDK 23</option>
      <option value="22">JDK 22</option>
      <option value="21">JDK 21 (LTS)</option>
      <option value="20">JDK 20</option>
      <option value="19">JDK 19</option>
      <option value="18">JDK 18</option>
      <option value="17">JDK 17 (LTS)</option>
      <option value="16">JDK 16</option>
      <option value="15">JDK 15</option>
      <option value="14">JDK 14</option>
      <option value="13">JDK 13</option>
      <option value="12">JDK 12</option>
      <option value="11">JDK 11 (LTS)</option>
      <option value="8">JDK 8 (LTS)</option>
    </select>
    <div class="install-path">
      <span class="path-label">安装目录：</span>
      <span class="path-display">{{ installPath }}</span>
    </div>
    <button @click="importLocalJDK" class="import-btn">📁 手动导入 JDK</button>
    <div class="button-group">
      <button @click="installJDK" :disabled="installing" class="install-btn">
        {{ installing ? '安装中...' : '开始安装' }}
      </button>
      <button v-if="downloading" @click="cancelDownload" class="cancel-btn">
        取消下载
      </button>
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
  name: 'JDKInstaller',
  data() {
    return {
      selectedVersion: '21',
      installing: false,
      downloading: false,
      status: '未安装',
      showProgress: false,
      progressPercent: 0,
      checking: false,
      detectedVersions: [],
      defaultVersion: null,
      switching: false,
      deleting: false,
      pendingLocalImport: false
    };
  },
  computed: {
    installPath() {
      return `C:\\Program Files\\Java\\jdk-${this.selectedVersion}`;
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
      this.checkJDK();
      window.electronAPI.onJDKChanged(() => {
        this.checkJDK();
      });
    } else {
      this.status = '错误：未连接到主进程';
    }
  },
  watch: {
    selectedVersion() {
      this.pendingLocalImport = false;
    }
  },
  methods: {
    async checkJDK() {
      if (this.checking) return;
      this.checking = true;
      this.detectedVersions = [];
      this.defaultVersion = null;
      try {
        const result = await window.electronAPI.checkJDK();
        this.detectedVersions = result.versions;
        this.defaultVersion = result.default;
      } catch (err) {
        console.error('检测失败', err);
      } finally {
        this.checking = false;
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
        let result;
        if (this.pendingLocalImport) {
          result = await window.electronAPI.installFromLocal();
          this.pendingLocalImport = false;
        } else {
          this.downloading = true;
          result = await window.electronAPI.installJDK(this.selectedVersion);
        }
        if (result.success) {
          this.status = `✅ ${result.message}`;
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

      const version = window.prompt('请输入 JDK 大版本号（例如 8、11、17、21 等）:', '21');
      if (!version || !/^\d+$/.test(version)) {
        this.status = '❌ 导入失败：版本号无效，请重新导入。';
        return;
      }
      const versionNum = parseInt(version, 10);
      if (versionNum < 8 || versionNum > 26) {
        this.status = '❌ 导入失败：版本号应在 8 到 26 之间。';
        return;
      }

      this.installing = true;
      this.showProgress = false;
      this.status = '⏳ 正在导入 JDK 安装包...';
      eventBus.emit('install:start');

      try {
        const result = await window.electronAPI.importLocalJDK(filePath, version);
        if (result.success) {
          this.status = `✅ ${result.message}，请点击“开始安装”完成配置。`;
          this.pendingLocalImport = true;
          this.selectedVersion = version;
        } else {
          this.status = `❌ 导入失败：${result.message}`;
        }
      } catch (err) {
        this.status = `❌ 导入失败：${err.message}`;
      } finally {
        this.installing = false;
        eventBus.emit('install:end');
      }
    },
    async switchToVersion(version) {
      if (this.switching) return;
      this.switching = true;
      try {
        const result = await window.electronAPI.switchJDK(version);
        if (result.success) {
          this.status = `✅ 已切换到 JDK ${version}`;
        } else {
          this.status = `❌ 切换失败：${result.message}`;
        }
      } catch (err) {
        this.status = `❌ 切换失败：${err.message}`;
      } finally {
        this.switching = false;
      }
    },
    async deleteVersion(version) {
      if (this.deleting) return;
      if (!confirm(`确定要卸载 JDK ${version} 吗？此操作不可撤销。`)) return;
      this.deleting = true;
      try {
        const result = await window.electronAPI.deleteJDK(version);
        if (result.success) {
          this.status = `✅ 已卸载 JDK ${version}`;
        } else {
          this.status = `❌ 卸载失败：${result.message}`;
        }
      } catch (err) {
        this.status = `❌ 卸载失败：${err.message}`;
      } finally {
        this.deleting = false;
      }
    }
  }
};
</script>

<style scoped>
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

.path-label {
  font-weight: 500;
  color: #4b5563;
}

.path-display {
  font-family: monospace;
  color: #1f2937;
  word-break: break-all;
}

.jdk-installer {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
  transition: box-shadow 0.3s ease;
}

.jdk-installer:hover {
  box-shadow: 0 20px 25px -12px rgba(0, 0, 0, 0.1);
}

h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #1f2937;
}

.detect-area {
  margin-bottom: 1rem;
}

.detect-btn {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 0.4rem 1rem;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s ease, transform 0.1s ease;
  margin-bottom: 12px;
}

.detect-btn:hover:not(:disabled) {
  background-color: #2563eb;
  transform: scale(0.98);
}

.detect-btn:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
}

.detected-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding-right: 4px;
}

.default-version {
  background-color: #e0f2fe;
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 8px;
  font-size: 0.9rem;
  color: #0369a1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.version-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #f9fafb;
  border-radius: 12px;
  padding: 8px 12px;
  transition: all 0.2s ease;
  border: 1px solid #e5e7eb;
}

.version-card:hover {
  background-color: #f3f4f6;
  border-color: #d1d5db;
  transform: translateX(2px);
}

.version-number {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1f2937;
  background: #e5e7eb;
  padding: 2px 8px;
  border-radius: 20px;
}

.card-actions {
  display: flex;
  gap: 8px;
}

.switch-btn, .delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 4px 8px;
  border-radius: 20px;
  transition: all 0.2s;
  font-weight: 500;
}

.switch-btn {
  color: #3b82f6;
  background-color: #eff6ff;
}

.switch-btn:hover {
  background-color: #dbeafe;
  transform: scale(0.95);
}

.delete-btn {
  color: #ef4444;
  background-color: #fee2e2;
}

.delete-btn:hover {
  background-color: #fecaca;
  transform: scale(0.95);
}

.no-version {
  color: #6b7280;
  font-size: 0.85rem;
  text-align: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 12px;
  margin-top: 8px;
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
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.path-input {
  flex: 1;
  padding: 0.6rem 1rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background-color: #f9fafb;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.path-input:focus {
  outline: none;
  border-color: #2c7a4d;
  box-shadow: 0 0 0 3px rgba(44, 122, 77, 0.1);
}

.select-path-btn {
  background-color: #4b5563;
  color: white;
  border: none;
  padding: 0 1rem;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s ease, transform 0.1s ease;
}

.select-path-btn:hover {
  background-color: #374151;
  transform: scale(0.98);
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
</style>