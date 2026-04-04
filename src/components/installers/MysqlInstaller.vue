<template>
  <div class="mysql-installer">
    <h3>
      <img src="/src/assets/icons/mysql.svg" class="title-icon" alt=""/>
      MySQL 安装
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
      <select v-model="selectedVersion" class="version-select">
        <option value="5.7">MySQL 5.7</option>
        <option value="8.0">MySQL 8.0</option>
        <option value="9.0">MySQL 9.0</option>
      </select>
      <div class="install-path">
        <span class="path-label">安装目录：</span>
        <span class="path-display">{{ installPath }}</span>
      </div>
      <div class="password-input">
        <label>root 密码（可选）：</label>
        <input type="password" v-model="password" placeholder="留空则无密码"/>
      </div>
      <div class="button-group">
        <button @click="installMySQL" :disabled="installing" class="install-btn">
          {{ installing ? '安装中...' : '开始安装' }}
        </button>
        <button v-if="downloading" @click="cancelDownload" class="cancel-btn">
          取消下载
        </button>
      </div>
    </div>

    <div v-else>
      <div class="import-area">
        <button @click="importLocalMySQL" class="import-btn">📁 选择 MySQL 压缩包</button>
        <div v-if="localFilePath" class="import-path">
          <span class="path-label">已选择：</span>
          <span class="path-display">{{ localFilePath }}</span>
        </div>
        <div class="version-input">
          <label>MySQL 版本：</label>
          <select v-model="localVersion" class="version-select-small">
            <option value="5.7">5.7</option>
            <option value="8.0">8.0</option>
            <option value="9.0">9.0</option>
          </select>
          <button @click="validateLocalVersion" class="validate-btn">验证目录</button>
        </div>
        <div v-if="dirExistsWarning" class="warning-message">
          ⚠️ 安装目录已存在文件！请删除或选择其他版本。
        </div>
        <div class="password-input">
          <label>root 密码（可选）：</label>
          <input type="password" v-model="password" placeholder="留空则无密码"/>
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

    <div v-if="currentVersion && serviceStatus" class="service-panel">
      <h4>📡 服务管理 - MySQL {{ currentVersion }}</h4>
      <div class="service-status">
        <span>状态：</span>
        <span :class="statusClass">{{ serviceStatusText }}</span>
      </div>
      <div class="service-buttons">
        <button @click="startService" :disabled="serviceActionLoading" class="service-btn start">启动</button>
        <button @click="stopService" :disabled="serviceActionLoading" class="service-btn stop">停止</button>
        <button @click="restartService" :disabled="serviceActionLoading" class="service-btn restart">重启</button>
        <button @click="showChangePasswordModal = true" class="service-btn password">修改密码</button>
      </div>
    </div>

    <div class="status" :class="{ 'status-success': status.includes('✅'), 'status-error': status.includes('❌') }">
      {{ status }}
    </div>
    <div class="progress-bar" v-if="showProgress">
      <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
    </div>

    <div v-if="showChangePasswordModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <h4>修改 MySQL root 密码</h4>
        <div class="modal-field">
          <label>旧密码（若无则留空）：</label>
          <input type="password" v-model="oldPassword"/>
        </div>
        <div class="modal-field">
          <label>新密码：</label>
          <input type="password" v-model="newPassword"/>
        </div>
        <div class="modal-buttons">
          <button @click="changePassword" :disabled="passwordChanging" class="modal-btn confirm">确认修改</button>
          <button @click="closeModal" class="modal-btn cancel">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import eventBus from '@/eventBus';

export default {
  name: 'MySQLInstaller',
  data() {
    return {
      activeMode: 'online',
      selectedVersion: '8.0',
      installing: false,
      downloading: false,
      status: '未安装',
      showProgress: false,
      progressPercent: 0,
      localFilePath: '',
      localVersion: '8.0',
      dirExistsWarning: false,
      password: '',
      currentVersion: null,
      serviceStatus: null,
      serviceActionLoading: false,
      showChangePasswordModal: false,
      oldPassword: '',
      newPassword: '',
      passwordChanging: false
    };
  },
  computed: {
    installPath() {
      return `C:\\Program Files\\MySQL\\mysql-${this.selectedVersion}`;
    },
    localInstallPath() {
      return `C:\\Program Files\\MySQL\\mysql-${this.localVersion}`;
    },
    serviceStatusText() {
      if (!this.serviceStatus) return '未知';
      const map = {running: '运行中', stopped: '已停止', 'not installed': '未安装', unknown: '未知'};
      return map[this.serviceStatus] || this.serviceStatus;
    },
    statusClass() {
      if (!this.serviceStatus) return '';
      return {
        'running': 'status-running',
        'stopped': 'status-stopped'
      }[this.serviceStatus] || '';
    }
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onMySQLProgress((data) => {
        if (data.type === 'mysql' && data.version === (this.activeMode === 'online' ? this.selectedVersion : this.localVersion)) {
          this.progressPercent = data.progress * 100;
          if (data.stage) this.status = `${data.stage}...`;
          if (data.progress === 1) {
            this.status = '安装完成，正在刷新环境...';
            setTimeout(() => {
              this.showProgress = false;
              this.status = '✅ MySQL 安装成功';
            }, 1500);
          }
        }
      });
      window.electronAPI.onMySQLChanged(() => {
        this.refreshServiceStatus();
      });
    }
  },
  methods: {
    switchMode(mode) {
      this.activeMode = mode;
      if (mode === 'local') {
        this.localFilePath = '';
        this.localVersion = '8.0';
        this.dirExistsWarning = false;
      }
    },
    cancelDownload() {
      if (window.electronAPI && window.electronAPI.cancelMySQLDownload) {
        window.electronAPI.cancelMySQLDownload();
        this.status = '⏸️ 已取消下载';
        this.downloading = false;
        this.showProgress = false;
      }
    },
    async installMySQL() {
      if (this.installing) return;
      this.installing = true;
      this.showProgress = true;
      this.progressPercent = 0;
      this.status = '⏳ 正在安装...';
      eventBus.emit('install:start');

      try {
        this.downloading = true;
        const result = await window.electronAPI.installMySQL(this.selectedVersion, this.password);
        if (result.success) {
          this.status = `✅ ${result.message}`;
          this.currentVersion = this.selectedVersion;
          this.$emit('installed');
          await this.refreshServiceStatus();
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
    async importLocalMySQL() {
      const filePath = await window.electronAPI.openFileDialog({
        title: '选择 MySQL 安装包',
        filters: [
          {name: 'MySQL 安装包', extensions: ['zip']},
          {name: '所有文件', extensions: ['*']}
        ]
      });
      if (!filePath) return;

      this.localFilePath = filePath;
      this.status = `✅ 已选择文件：${filePath}`;

      if (!this.localVersion) {
        this.status = '❌ 导入失败：请选择版本。';
        this.localFilePath = '';
        return;
      }

      this.installing = true;
      this.showProgress = false;
      this.status = '⏳ 正在导入 MySQL 安装包...';
      eventBus.emit('install:start');

      try {
        const result = await window.electronAPI.importLocalMySQL(filePath);
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
        this.status = '请先选择 MySQL 安装包。';
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
        const result = await window.electronAPI.installFromLocalMySQL(this.localVersion, this.password);
        if (result.success) {
          this.status = `✅ ${result.message}`;
          this.currentVersion = this.localVersion;
          this.$emit('installed');
          await this.refreshServiceStatus();
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
    },
    async refreshServiceStatus() {
      if (!this.currentVersion) return;
      try {
        const result = await window.electronAPI.getMySQLServiceStatus(this.currentVersion);
        if (result.success) {
          this.serviceStatus = result.status;
        } else {
          this.serviceStatus = 'unknown';
        }
      } catch (err) {
        console.error('获取服务状态失败', err);
        this.serviceStatus = 'unknown';
      }
    },
    async startService() {
      if (this.serviceActionLoading) return;
      this.serviceActionLoading = true;
      try {
        const result = await window.electronAPI.startMySQLService(this.currentVersion);
        if (result.success) {
          this.status = `✅ ${result.message}`;
          await this.refreshServiceStatus();
        } else {
          this.status = `❌ 启动失败：${result.message}`;
        }
      } catch (err) {
        this.status = `❌ 启动失败：${err.message}`;
      } finally {
        this.serviceActionLoading = false;
      }
    },
    async stopService() {
      if (this.serviceActionLoading) return;
      this.serviceActionLoading = true;
      try {
        const result = await window.electronAPI.stopMySQLService(this.currentVersion);
        if (result.success) {
          this.status = `✅ ${result.message}`;
          await this.refreshServiceStatus();
        } else {
          this.status = `❌ 停止失败：${result.message}`;
        }
      } catch (err) {
        this.status = `❌ 停止失败：${err.message}`;
      } finally {
        this.serviceActionLoading = false;
      }
    },
    async restartService() {
      if (this.serviceActionLoading) return;
      this.serviceActionLoading = true;
      try {
        const result = await window.electronAPI.restartMySQLService(this.currentVersion);
        if (result.success) {
          this.status = `✅ ${result.message}`;
          await this.refreshServiceStatus();
        } else {
          this.status = `❌ 重启失败：${result.message}`;
        }
      } catch (err) {
        this.status = `❌ 重启失败：${err.message}`;
      } finally {
        this.serviceActionLoading = false;
      }
    },
    async changePassword() {
      if (this.passwordChanging) return;
      this.passwordChanging = true;
      try {
        const result = await window.electronAPI.changeMySQLPassword(
            this.currentVersion,
            this.oldPassword,
            this.newPassword
        );
        if (result.success) {
          this.status = `✅ ${result.message}`;
          this.closeModal();
        } else {
          this.status = `❌ 修改密码失败：${result.message}`;
        }
      } catch (err) {
        this.status = `❌ 修改密码失败：${err.message}`;
      } finally {
        this.passwordChanging = false;
      }
    },
    closeModal() {
      this.showChangePasswordModal = false;
      this.oldPassword = '';
      this.newPassword = '';
    }
  }
};
</script>

<style scoped>
.mysql-installer {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
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

.version-select, .version-select-small {
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background-color: #f9fafb;
  font-size: 0.95rem;
  margin-bottom: 1rem;
}

.version-select-small {
  width: auto;
  margin-bottom: 0;
}

.install-path, .import-path {
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
  background-color: #f0fdf4;
  border-color: #bbf7d0;
}

.password-input {
  margin: 1rem 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.password-input label {
  font-weight: 500;
  color: #4b5563;
}

.password-input input {
  flex: 1;
  padding: 0.5rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.version-input {
  margin: 1rem 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.validate-btn {
  background-color: #6b7280;
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.warning-message {
  margin-top: 8px;
  padding: 8px;
  background-color: #fee2e2;
  border-radius: 8px;
  color: #991b1b;
  font-size: 0.8rem;
}

.import-btn {
  width: 100%;
  background-color: #8b5cf6;
  color: white;
  border: none;
  padding: 0.8rem;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 1rem;
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
  cursor: pointer;
}

.install-btn {
  background-color: #2c7a4d;
  color: white;
  border: none;
}

.install-btn:hover:not(:disabled) {
  background-color: #1f5e3a;
}

.cancel-btn {
  background-color: #ef4444;
  color: white;
  border: none;
}

.service-panel {
  margin-top: 24px;
  padding: 16px;
  background-color: #f8fafc;
  border-radius: 16px;
  border: 1px solid #e2e8f0;
}

.service-panel h4 {
  margin-bottom: 12px;
  color: #1e293b;
}

.service-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.status-running {
  color: #16a34a;
  font-weight: 600;
}

.status-stopped {
  color: #dc2626;
  font-weight: 600;
}

.service-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.service-btn {
  padding: 6px 12px;
  border-radius: 20px;
  border: none;
  cursor: pointer;
  font-weight: 500;
  transition: 0.2s;
}

.service-btn.start {
  background-color: #22c55e;
  color: white;
}

.service-btn.stop {
  background-color: #ef4444;
  color: white;
}

.service-btn.restart {
  background-color: #f59e0b;
  color: white;
}

.service-btn.password {
  background-color: #3b82f6;
  color: white;
}

.service-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status {
  font-size: 0.9rem;
  text-align: center;
  padding: 0.5rem;
  border-radius: 10px;
  background-color: #f3f4f6;
  margin-bottom: 1rem;
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
}

.title-icon {
  width: 28px;
  height: 28px;
  vertical-align: middle;
  margin-right: 8px;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 24px;
  border-radius: 20px;
  width: 400px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
}

.modal h4 {
  margin-bottom: 16px;
}

.modal-field {
  margin-bottom: 12px;
}

.modal-field label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.modal-field input {
  width: 100%;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.modal-buttons {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.modal-btn {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-weight: 500;
}

.modal-btn.confirm {
  background-color: #2c7a4d;
  color: white;
}

.modal-btn.cancel {
  background-color: #ef4444;
  color: white;
}
</style>