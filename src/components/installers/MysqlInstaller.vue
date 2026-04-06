<template>
  <div class="mysql-installer">
    <h3>
      <img :src="MysqlIcon" class="title-icon" alt=""/>
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
      <div class="version-selection">
        <div class="version-options">
          <label v-for="v in versionOptions" :key="v.value" class="version-option" :class="{ selected: selectedVersion === v.value }" @click="selectedVersion = v.value">
            <input type="radio" :value="v.value" v-model="selectedVersion" class="radio-hidden"/>
            <span class="version-name">{{ v.label }}</span>
            <span v-if="v.recommended" class="recommend-tag">推荐</span>
          </label>
        </div>
        <div class="version-info">
          <span v-if="selectedVersion === '5.7'" class="info-text">⚡ 经典稳定，适合老旧项目</span>
          <span v-else-if="selectedVersion === '8.0'" class="info-text">✅ 官方推荐，性能最优，广泛使用</span>
          <span v-else-if="selectedVersion === '9.0'" class="info-text">🚀 最新版本，体验新特性</span>
        </div>
      </div>
      <div class="install-path">
        <span class="path-label">安装目录：</span>
        <span class="path-display">{{ installPath }}</span>
      </div>
      <div class="password-input">
        <label>root 密码（可选）：</label>
        <div class="password-wrapper">
          <input :type="showPassword ? 'text' : 'password'" v-model="password" placeholder="留空则无密码"/>
          <button type="button" @click="showPassword = !showPassword" class="toggle-password">
            {{ showPassword ? '🙈' : '👁️' }}
          </button>
        </div>
      </div>
      <div class="install-status" v-if="installing">
        <div class="status-header">
          <span class="phase-label">
            {{ downloading ? '📥 下载中' : '🔧 安装中' }}
          </span>
          <span class="stage-label">{{ currentStage }}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
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
        <button @click="installMySQL" :disabled="installing" class="install-btn">
          {{ installing ? (downloading ? '下载中...' : '安装中...') : '开始安装' }}
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
          <div class="version-options-inline">
            <label v-for="v in versionOptions" :key="v.value" class="version-option-small" :class="{ selected: localVersion === v.value }" @click="localVersion = v.value">
              <input type="radio" :value="v.value" v-model="localVersion" class="radio-hidden"/>
              <span>{{ v.label }}</span>
              <span v-if="v.recommended" class="recommend-tag-small">推荐</span>
            </label>
          </div>
          <button @click="validateLocalVersion" class="validate-btn">验证目录</button>
        </div>
        <div v-if="dirExistsWarning" class="warning-message">
          ⚠️ 安装目录已存在文件！请删除或选择其他版本。
        </div>
        <div class="password-input">
          <label>root 密码（可选）：</label>
          <div class="password-wrapper">
            <input :type="showPassword ? 'text' : 'password'" v-model="password" placeholder="留空则无密码"/>
            <button type="button" @click="showPassword = !showPassword" class="toggle-password">
              {{ showPassword ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>
        <div class="install-path">
          <span class="path-label">安装目录：</span>
          <span class="path-display">{{ localInstallPath }}</span>
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
    <div class="progress-bar" v-if="showProgress && !installing">
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
import MysqlIcon from '../../../public/icons/mysql.svg?url';

export default {
  name: 'MySQLInstaller',
  data() {
    return {
      MysqlIcon,
      activeMode: 'online',
      selectedVersion: '8.0',
      versionOptions: [
        { value: '5.7', label: 'MySQL 5.7', recommended: false },
        { value: '8.0', label: 'MySQL 8.0', recommended: true },
        { value: '9.0', label: 'MySQL 9.0', recommended: false }
      ],
      installing: false,
      downloading: false,
      status: '未安装',
      currentStage: '',
      installSteps: [],
      showProgress: false,
      progressPercent: 0,
      localFilePath: '',
      localVersion: '8.0',
      dirExistsWarning: false,
      password: '',
      showPassword: false,
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
      return `C:\\Program Files\\muling\\muling-env-box\\MySQL\\mysql-${this.selectedVersion}`;
    },
    localInstallPath() {
      return `C:\\Program Files\\muling\\muling-env-box\\MySQL\\mysql-${this.localVersion}`;
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
          if (data.stage) {
            this.currentStage = data.stage;
            // 将每一步添加到步骤日志中（去重）
            const stepLabel = this.getStepLabel(data.stage);
            if (stepLabel && !this.installSteps.includes(stepLabel)) {
              this.installSteps.push(stepLabel);
            }
          }
          if (data.progress === 1) {
            this.status = '✅ MySQL 安装成功';
            setTimeout(() => {
              this.showProgress = false;
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
    getStepLabel(stage) {
      if (!stage) return '';
      const map = {
        '下载安装包': '下载 MySQL 安装包',
        '解压中': '解压安装包',
        '初始化配置': '生成配置文件 (my.ini)',
        '初始化数据目录': '初始化数据目录',
        '安装服务': '注册 Windows 服务',
        '启动服务': '启动 MySQL 服务',
        '设置 root 密码': '设置 root 密码',
        '配置环境变量': '配置系统环境变量',
        '安装完成': '安装完成'
      };
      return map[stage] || stage;
    },
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
    installMySQL() {
      if (this.installing) return;
      this.installing = true;
      this.showProgress = true;
      this.progressPercent = 0;
      this.currentStage = '';
      this.installSteps = [];
      this.status = '准备安装...';
      eventBus.emit('install:start');

      this.downloading = true;
      window.electronAPI.installMySQL(this.selectedVersion, this.password).then((result) => {
        if (result.success) {
          this.status = `✅ ${result.message}`;
          this.currentVersion = this.selectedVersion;
          this.$emit('installed');
          this.refreshServiceStatus();
          setTimeout(() => {
            this.showProgress = false;
          }, 2000);
        } else {
          this.status = `❌ 安装失败：${result.message}`;
          this.showProgress = false;
        }
      }).catch((err) => {
        if (err.message && err.message.includes('canceled')) {
          this.status = '⏸️ 下载已取消';
        } else {
          this.status = `❌ 安装失败：${err.message}`;
        }
        this.showProgress = false;
      }).finally(() => {
        this.installing = false;
        this.downloading = false;
        eventBus.emit('install:end');
      });
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
      this.currentStage = '';
      this.installSteps = [];
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
  background: var(--bg-card);
  border-radius: 20px;
  padding: 24px;
  box-shadow: var(--shadow-sm);
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

/* Version selection area */
.version-selection {
  margin-bottom: 1rem;
}

.version-options {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
}

.version-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 12px;
  border: 2px solid var(--border-medium);
  background-color: var(--bg-input);
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  font-size: 0.9rem;
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
  font-size: 0.9rem;
  color: var(--text-primary);
}

.recommend-tag {
  display: inline-block;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: white;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
}

.version-info {
  display: flex;
  min-height: 24px;
}

.info-text {
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

/* Inline version options for local install */
.version-options-inline {
  display: flex;
  gap: 8px;
}

.version-option-small {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-medium);
  background-color: var(--bg-input);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.version-option-small:hover {
  border-color: var(--primary);
}

.version-option-small.selected {
  border-color: var(--primary);
  background-color: var(--primary-bg);
}

.version-option-small .radio-hidden {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.recommend-tag-small {
  display: inline-block;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  color: white;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 8px;
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

.password-input {
  margin: 1rem 0;
}

.password-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
}

.password-wrapper input {
  flex: 1;
  padding: 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--border-medium);
  background-color: var(--bg-input);
  color: var(--text-primary);
}

.toggle-password {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0 4px;
}

.version-input {
  margin: 1rem 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.validate-btn {
  background-color: var(--text-muted);
  color: white;
  border: none;
  padding: 4px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.warning-message {
  margin-top: 8px;
  padding: 8px;
  background-color: var(--danger-bg);
  border-radius: 8px;
  color: var(--danger-text);
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
  background-color: var(--primary);
  color: white;
  border: none;
}

.install-btn:hover:not(:disabled) {
  background-color: var(--primary-hover);
}

.cancel-btn {
  background-color: var(--danger-bg);
  color: var(--danger-text);
  border: none;
}

.service-panel {
  margin-top: 24px;
  padding: 16px;
  background-color: var(--bg-secondary);
  border-radius: 16px;
  border: 1px solid var(--border-light);
}

.service-panel h4 {
  margin-bottom: 12px;
  color: var(--text-primary);
}

.service-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: var(--text-secondary);
}

.status-running {
  color: var(--success-text);
  font-weight: 600;
}

.status-stopped {
  color: var(--danger-text);
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
  background-color: var(--success-bg);
  color: var(--success-text);
}

.service-btn.stop {
  background-color: var(--danger-bg);
  color: var(--danger-text);
}

.service-btn.restart {
  background-color: var(--warning-bg);
  color: var(--warning-text);
}

.service-btn.password {
  background-color: var(--info-bg);
  color: var(--info-text);
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
  background-color: var(--bg-secondary);
  margin-bottom: 1rem;
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
}

.install-status {
  margin: 1rem 0;
  padding: 1rem;
  background-color: var(--bg-secondary);
  border-radius: 12px;
  border: 1px solid var(--border-light);
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.phase-label {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--primary);
}

.stage-label {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.steps-log {
  margin-top: 0.75rem;
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  border-radius: 6px;
  background-color: var(--bg-card);
}

.step-item.current {
  color: var(--primary);
  font-weight: 500;
}

.step-icon {
  font-size: 0.9rem;
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
  background: var(--bg-modal);
  padding: 24px;
  border-radius: 20px;
  width: 400px;
  box-shadow: var(--shadow-lg);
}

.modal h4 {
  margin-bottom: 16px;
  color: var(--text-primary);
}

.modal-field {
  margin-bottom: 12px;
}

.modal-field label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  color: var(--text-secondary);
}

.modal-field input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-medium);
  border-radius: 8px;
  background: var(--bg-input);
  color: var(--text-primary);
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
  background-color: var(--primary);
  color: white;
}

.modal-btn.cancel {
  background-color: var(--danger-bg);
  color: var(--danger-text);
}
</style>