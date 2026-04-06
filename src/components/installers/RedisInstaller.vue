<template>
  <div class="redis-installer">
    <h3>
      <img :src="RedisIcon" class="title-icon" alt=""/>
      Redis 安装
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
          <span v-if="selectedVersion === '7.0'" class="info-text">✅ 官方推荐，稳定且性能优异</span>
          <span v-else-if="selectedVersion.startsWith('8.')" class="info-text">🚀 最新版本，体验新特性</span>
          <span v-else-if="selectedVersion === '6.2'" class="info-text">⚡ 经典稳定，广泛使用</span>
          <span v-else class="info-text">💡 成熟版本，兼容性好</span>
        </div>
      </div>
      <div class="install-path">
        <span class="path-label">安装目录：</span>
        <span class="path-display">{{ installPath }}</span>
      </div>
      <div class="config-input">
        <label>端口（可选）：</label>
        <input type="number" v-model.number="port" placeholder="留空则自动分配" @blur="checkPort"/>
        <span v-if="portChecking" class="port-checking">检查中...</span>
        <span v-else-if="portAvailable === true" class="port-available">✓ 端口可用</span>
        <span v-else-if="portAvailable === false" class="port-unavailable">✗ 端口已被占用</span>
      </div>
      <div class="config-input">
        <label>密码（可选）：</label>
        <input type="password" v-model="password" placeholder="留空则无密码"/>
      </div>
      <div class="config-input">
        <label>最大内存（MB，可选）：</label>
        <input type="number" v-model.number="maxmemory" placeholder="例如 256"/>
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
        <button @click="installRedis" :disabled="installing || portAvailable === false" class="install-btn">
          {{ installing ? (downloading ? '下载中...' : '安装中...') : '开始安装' }}
        </button>
        <button v-if="downloading" @click="cancelDownload" class="cancel-btn">
          取消下载
        </button>
      </div>
    </div>

    <div v-else>
      <div class="import-area">
        <button @click="importLocalRedis" class="import-btn">📁 选择 Redis 压缩包</button>
        <div v-if="localFilePath" class="import-path">
          <span class="path-label">已选择：</span>
          <span class="path-display">{{ localFilePath }}</span>
        </div>
        <div class="version-input">
          <label>Redis 版本：</label>
          <select v-model="localVersion" class="version-select-small">
            <option value="3.2">3.2</option>
            <option value="4.0">4.0</option>
            <option value="5.0">5.0</option>
            <option value="6.0">6.0</option>
            <option value="6.2">6.2</option>
            <option value="7.0">7.0</option>
            <option value="7.2">7.2</option>
            <option value="7.4">7.4</option>
            <option value="8.0">8.0</option>
            <option value="8.2">8.2</option>
            <option value="8.4">8.4</option>
            <option value="8.6">8.6</option>
          </select>
          <button @click="validateLocalVersion" class="validate-btn">验证目录</button>
        </div>
        <div v-if="dirExistsWarning" class="warning-message">
          ⚠️ 安装目录已存在文件！请删除或选择其他版本。
        </div>
        <div class="config-input">
          <label>端口（可选）：</label>
          <input type="number" v-model.number="localPort" placeholder="留空则自动分配" @blur="checkLocalPort"/>
          <span v-if="localPortChecking" class="port-checking">检查中...</span>
          <span v-else-if="localPortAvailable === true" class="port-available">✓ 端口可用</span>
          <span v-else-if="localPortAvailable === false" class="port-unavailable">✗ 端口已被占用</span>
        </div>
        <div class="config-input">
          <label>密码（可选）：</label>
          <input type="password" v-model="localPassword" placeholder="留空则无密码"/>
        </div>
        <div class="config-input">
          <label>最大内存（MB，可选）：</label>
          <input type="number" v-model.number="localMaxmemory" placeholder="例如 256"/>
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
        <button @click="installFromLocal"
                :disabled="installing || !localFilePath || dirExistsWarning || localPortAvailable === false"
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
import RedisIcon from '../../../public/icons/Redis.svg?url';

export default {
  name: 'RedisInstaller',
  data() {
    return {
      RedisIcon,
      activeMode: 'online',
      selectedVersion: '7.0',
      versionOptions: [
        { value: '3.2', label: '3.2', recommended: false },
        { value: '4.0', label: '4.0', recommended: false },
        { value: '5.0', label: '5.0', recommended: false },
        { value: '6.0', label: '6.0', recommended: false },
        { value: '6.2', label: '6.2', recommended: false },
        { value: '7.0', label: '7.0', recommended: true },
        { value: '7.2', label: '7.2', recommended: false },
        { value: '7.4', label: '7.4', recommended: false },
        { value: '8.0', label: '8.0', recommended: false },
        { value: '8.2', label: '8.2', recommended: false },
        { value: '8.4', label: '8.4', recommended: false },
        { value: '8.6', label: '8.6', recommended: false }
      ],
      installing: false,
      downloading: false,
      status: '未安装',
      currentStage: '',
      installSteps: [],
      showProgress: false,
      progressPercent: 0,
      localFilePath: '',
      localVersion: '7.0',
      dirExistsWarning: false,
      password: '',
      maxmemory: null,
      localPassword: '',
      localMaxmemory: null,
      port: null,
      localPort: null,
      portChecking: false,
      localPortChecking: false,
      portAvailable: null,
      localPortAvailable: null,
      checkTimer: null,
      localCheckTimer: null
    };
  },
  computed: {
    installPath() {
      return `C:\\Program Files\\muling\\muling-env-box\\Redis\\redis-${this.selectedVersion}`;
    },
    localInstallPath() {
      return `C:\\Program Files\\muling\\muling-env-box\\Redis\\redis-${this.localVersion}`;
    }
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onRedisProgress((data) => {
        if (data.type === 'redis' && data.version === (this.activeMode === 'online' ? this.selectedVersion : this.localVersion)) {
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
            this.status = '✅ Redis 安装成功';
            setTimeout(() => {
              this.showProgress = false;
            }, 1500);
          }
        }
      });
      window.electronAPI.onRedisChanged(() => {
      });
    }
  },
  methods: {
    getStepLabel(stage) {
      if (!stage) return '';
      const map = {
        '下载安装包': '下载 Redis 安装包',
        '解压中': '解压安装包',
        '生成配置': '生成 Redis 配置文件',
        '配置环境变量': '配置系统环境变量'
      };
      return map[stage] || stage;
    },
    switchMode(mode) {
      this.activeMode = mode;
      if (mode === 'local') {
        this.localFilePath = '';
        this.localVersion = '7.0';
        this.dirExistsWarning = false;
        this.localPassword = '';
        this.localMaxmemory = null;
        this.localPort = null;
        this.localPortAvailable = null;
      } else {
        this.password = '';
        this.maxmemory = null;
        this.port = null;
        this.portAvailable = null;
      }
    },
    cancelDownload() {
      if (window.electronAPI && window.electronAPI.cancelRedisDownload) {
        window.electronAPI.cancelRedisDownload();
        this.status = '⏸️ 已取消下载';
        this.downloading = false;
        this.showProgress = false;
      }
    },
    async checkPort() {
      if (!this.port) {
        this.portAvailable = null;
        return;
      }
      if (this.port < 1 || this.port > 65535) {
        this.portAvailable = false;
        return;
      }
      this.portChecking = true;
      try {
        const result = await window.electronAPI.checkPort(this.port);
        this.portAvailable = result.available;
      } catch (err) {
        this.portAvailable = false;
      } finally {
        this.portChecking = false;
      }
    },
    async checkLocalPort() {
      if (!this.localPort) {
        this.localPortAvailable = null;
        return;
      }
      if (this.localPort < 1 || this.localPort > 65535) {
        this.localPortAvailable = false;
        return;
      }
      this.localPortChecking = true;
      try {
        const result = await window.electronAPI.checkPort(this.localPort);
        this.localPortAvailable = result.available;
      } catch (err) {
        this.localPortAvailable = false;
      } finally {
        this.localPortChecking = false;
      }
    },
    async installRedis() {
      if (this.installing) return;
      this.installing = true;
      this.showProgress = true;
      this.progressPercent = 0;
      this.status = '⏳ 正在安装...';
      eventBus.emit('install:start');

      try {
        this.downloading = true;
        const result = await window.electronAPI.installRedis(
            this.selectedVersion,
            this.password,
            this.maxmemory || 0,
            this.port || null
        );
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
    async importLocalRedis() {
      const filePath = await window.electronAPI.openFileDialog({
        title: '选择 Redis 压缩包',
        filters: [
          {name: 'Redis 安装包', extensions: ['zip']},
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
      this.status = '⏳ 正在导入 Redis 安装包...';
      eventBus.emit('install:start');

      try {
        const result = await window.electronAPI.importLocalRedis(filePath);
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
        this.status = '请先选择 Redis 安装包。';
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
        const result = await window.electronAPI.installFromLocalRedis(
            this.localVersion,
            this.localPassword,
            this.localMaxmemory || 0,
            this.localPort || null
        );
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
.redis-installer {
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
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}

.version-option {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 6px;
  border-radius: 10px;
  border: 2px solid var(--border-medium);
  background-color: var(--bg-input);
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  font-size: 0.85rem;
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

.version-select,
.version-select-small {
  width: 100%;
  padding: 0.6rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--border-medium);
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.95rem;
  margin-bottom: 1rem;
}

.version-select-small {
  width: auto;
  margin-bottom: 0;
}

.install-path,
.import-path {
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

.config-input {
  margin: 1rem 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.config-input label {
  font-weight: 500;
  color: var(--text-secondary);
  width: 100px;
}

.config-input input {
  flex: 1;
  padding: 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--border-medium);
  background-color: var(--bg-input);
  color: var(--text-primary);
}

.version-input {
  margin: 1rem 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.title-icon {
  width: 28px;
  height: 28px;
  vertical-align: middle;
  margin-right: 8px;
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

.install-btn,
.cancel-btn {
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

.port-checking {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-left: 8px;
}

.port-available {
  font-size: 0.8rem;
  color: var(--success-text);
  margin-left: 8px;
}

.port-unavailable {
  font-size: 0.8rem;
  color: var(--danger-text);
  margin-left: 8px;
}
</style>