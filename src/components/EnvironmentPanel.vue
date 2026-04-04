<template>
  <div class="environment-panel">
    <div class="panel-header">
      <div class="title-section">
        <img v-if="toolIconPath" :src="toolIconPath" class="tool-icon-img" alt="" />
        <span v-else class="tool-icon-emoji">{{ toolIconEmoji }}</span>
        <h3>{{ toolLabel }}</h3>
      </div>
      <button class="install-btn" @click="$emit('install')">
        <span class="plus-icon">+</span> 安装
      </button>
    </div>

    <div class="toolbar">
      <button @click="refresh" class="refresh-btn" :disabled="loading">
        <span class="refresh-icon">⟳</span> {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </div>

    <div v-if="versions.length === 0 && !loading" class="empty-state">
      <div class="empty-icon">📦</div>
      <p>未检测到已安装的 {{ toolLabel }}</p>
    </div>

    <div v-else class="versions-grid">
      <div v-for="v in versions" :key="v" class="version-card" :class="{ 'is-default': v === defaultVersion }">
        <div class="card-header">
          <span class="version-badge">{{ toolLabel }} {{ v }}</span>
          <span v-if="v === defaultVersion" class="default-tag">默认</span>
        </div>
        <div class="card-body">
          <div v-if="['mysql', 'redis'].includes(tool)" class="service-status-row">
            <span class="status-label">服务状态：</span>
            <span v-if="serviceStatus[v]" class="service-status" :class="serviceStatus[v]">
              <span class="status-dot"></span>
              {{ serviceStatus[v] === 'running' ? '运行中' : (serviceStatus[v] === 'stopped' ? '已停止' : '未知') }}
            </span>
          </div>
          <div v-if="tool === 'redis'" class="redis-config-row">
            <span class="config-label">端口：</span>
            <span>{{ redisConfigs[v]?.port || '未知' }}</span>
            <span class="config-label">密码：</span>
            <span>{{ redisConfigs[v]?.hasPassword ? '已设置' : '无密码' }}</span>
          </div>
        </div>
        <div class="card-actions">
          <button v-if="v !== defaultVersion" @click="switchVersion(v)" class="action-switch" :disabled="actionLoading">
            <span class="action-icon">⇄</span> 切换
          </button>
          <template v-if="tool === 'mysql'">
            <button @click="startService(v)" class="action-start" :disabled="actionLoading">
              <span class="action-icon">▶</span> 启动
            </button>
            <button @click="stopService(v)" class="action-stop" :disabled="actionLoading">
              <span class="action-icon">■</span> 停止
            </button>
          </template>
          <button v-if="tool === 'redis'" @click="toggleService(v)" :class="serviceStatus[v] === 'running' ? 'action-stop' : 'action-start'" :disabled="actionLoading">
            <span class="action-icon">{{ serviceStatus[v] === 'running' ? '■' : '▶' }}</span>
            {{ serviceStatus[v] === 'running' ? '停止' : '启动' }}
          </button>
          <button v-if="tool === 'redis'" @click="openPasswordModal(v)" class="action-password" :disabled="actionLoading">
            <span class="action-icon">🔑</span> 修改密码
          </button>
          <button @click="uninstallVersion(v)" class="action-delete" :disabled="actionLoading">
            <span class="action-icon">🗑</span> 卸载
          </button>
        </div>
      </div>
    </div>

    <div v-if="apiMissing" class="warning-message">
      <span class="warning-icon">⚠️</span> 当前工具暂未支持检测，敬请期待。
    </div>

    <div v-if="showPasswordModal" class="modal-overlay" @click.self="closePasswordModal">
      <div class="modal">
        <h4>修改 Redis 密码</h4>
        <div class="modal-field">
          <label>旧密码（若无则留空）：</label>
          <input type="password" v-model="oldRedisPassword" />
        </div>
        <div class="modal-field">
          <label>新密码：</label>
          <input type="password" v-model="newRedisPassword" />
        </div>
        <div class="modal-buttons">
          <button @click="changeRedisPassword" :disabled="passwordChanging" class="modal-btn confirm">确认修改</button>
          <button @click="closePasswordModal" class="modal-btn cancel">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import AIIcon from '@/assets/icons/AI.svg?url';
import CIcon from '@/assets/icons/c.svg?url';
import ElasticsearchIcon from '@/assets/icons/elasticsearch.svg?url';
import GitIcon from '@/assets/icons/git.svg?url';
import GolangIcon from '@/assets/icons/Golang.svg?url';
import GradleIcon from '@/assets/icons/gradle.svg?url';
import JavaIcon from '@/assets/icons/java.svg?url';
import JupyterIcon from '@/assets/icons/Jupyter.svg?url';
import KibanaIcon from '@/assets/icons/kibana.svg?url';
import MavenIcon from '@/assets/icons/maven.svg?url';
import MinicondaIcon from '@/assets/icons/Miniconda.svg?url';
import MinioIcon from '@/assets/icons/minio.svg?url';
import MysqlIcon from '@/assets/icons/mysql.svg?url';
import NacosIcon from '@/assets/icons/nacos.svg?url';
import NginxIcon from '@/assets/icons/nginx.svg?url';
import OllamaIcon from '@/assets/icons/Ollama.svg?url';
import PythonIcon from '@/assets/icons/Python.svg?url';
import RabbitmqIcon from '@/assets/icons/Rabbitmq.svg?url';
import RedisIcon from '@/assets/icons/Redis.svg?url';
import SentinelIcon from '@/assets/icons/sentinel.svg?url';
import DashboardIcon from '@/assets/icons/仪表板.svg?url';
import LemonIcon from '@/assets/icons/柠檬.svg?url';
import SettingsIcon from '@/assets/icons/设置.svg?url';

export default {
  name: 'EnvironmentPanel',
  props: {
    tool: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      loading: false,
      versions: [],
      defaultVersion: null,
      serviceStatus: {},
      redisConfigs: {},
      actionLoading: false,
      apiMissing: false,
      showPasswordModal: false,
      currentVersionForPassword: null,
      oldRedisPassword: '',
      newRedisPassword: '',
      passwordChanging: false
    };
  },
  computed: {
    toolLabel() {
      const map = {
        jdk: 'JDK',
        python: 'Python',
        mysql: 'MySQL',
        redis: 'Redis',
        maven: 'Maven',
        gradle: 'Gradle',
        nacos: 'Nacos',
        sentinel: 'Sentinel',
        rabbitmq: 'RabbitMQ',
        miniconda: 'Miniconda',
        jupyter: 'Jupyter Lab',
        ollama: 'Ollama',
        go: 'Go',
        mingw: 'MinGW',
        git: 'Git',
        nginx: 'Nginx',
        minio: 'MinIO',
        elasticsearch: 'Elasticsearch',
        kibana: 'Kibana',
        'redis-insight': 'Redis Insight'
      };
      return map[this.tool] || this.tool.toUpperCase();
    },
    toolIconEmoji() {
      const icons = {
        jdk: '☕',
        python: '🐍',
        mysql: '🐬',
        redis: '🔴',
        maven: '📦',
        gradle: '🔄',
        nacos: '⚙️',
        sentinel: '🛡️',
        rabbitmq: '🐇',
        miniconda: '📦',
        jupyter: '📓',
        ollama: '🦙',
        go: '🐹',
        mingw: '🔧',
        git: '📜',
        nginx: '🌐',
        minio: '💾',
        elasticsearch: '🔍',
        kibana: '📊',
        'redis-insight': '🔴'
      };
      return icons[this.tool] || '🛠️';
    },
    toolIconPath() {
      const pathMap = {
        jdk: JavaIcon,
        python: PythonIcon,
        mysql: MysqlIcon,
        redis: RedisIcon,
        maven: MavenIcon,
        gradle: GradleIcon,
        nacos: NacosIcon,
        sentinel: SentinelIcon,
        rabbitmq: RabbitmqIcon,
        miniconda: MinicondaIcon,
        jupyter: JupyterIcon,
        ollama: OllamaIcon,
        go: GolangIcon,
        mingw: CIcon,
        git: GitIcon,
        nginx: NginxIcon,
        minio: MinioIcon,
        elasticsearch: ElasticsearchIcon,
        kibana: KibanaIcon,
        'redis-insight': RedisIcon,
        dashboard: DashboardIcon,
        settings: SettingsIcon,
        about: LemonIcon,
        'ai-assistant': AIIcon
      };
      return pathMap[this.tool] || null;
    },
    checkMethod() {
      const methodMap = {
        jdk: 'checkJDK',
        python: 'checkPython',
        mysql: 'checkMySQL',
        redis: 'checkRedis'
      };
      return methodMap[this.tool];
    },
    switchMethod() {
      const methodMap = {
        jdk: 'switchJDK',
        python: 'switchPython',
        mysql: 'switchMySQL',
        redis: 'switchRedis'
      };
      return methodMap[this.tool];
    },
    deleteMethod() {
      const methodMap = {
        jdk: 'deleteJDK',
        python: 'deletePython',
        mysql: 'deleteMySQL',
        redis: 'deleteRedis'
      };
      return methodMap[this.tool];
    },
    startServiceMethod() {
      return this.tool === 'mysql' ? 'startMySQLService' : 'startRedisService';
    },
    stopServiceMethod() {
      return this.tool === 'mysql' ? 'stopMySQLService' : 'stopRedisService';
    },
    getServiceStatusMethod() {
      return this.tool === 'mysql' ? 'getMySQLServiceStatus' : 'getRedisServiceStatus';
    },
    changePasswordMethod() {
      return this.tool === 'mysql' ? 'changeMySQLPassword' : 'changeRedisPassword';
    }
  },
  watch: {
    tool: {
      immediate: true,
      handler() {
        this.refresh();
      }
    }
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onJDKChanged?.(() => {
        if (this.tool === 'jdk') this.refresh();
      });
      window.electronAPI.onPythonChanged?.(() => {
        if (this.tool === 'python') this.refresh();
      });
      window.electronAPI.onMySQLChanged?.(() => {
        if (this.tool === 'mysql') this.refresh();
      });
      window.electronAPI.onRedisChanged?.(() => {
        if (this.tool === 'redis') this.refresh();
      });
    }
  },
  methods: {
    async refresh() {
      if (this.loading) return;
      this.loading = true;
      this.apiMissing = false;
      try {
        const api = window.electronAPI[this.checkMethod];
        if (!api) {
          this.apiMissing = true;
          return;
        }
        const result = await api();
        this.versions = result.versions || [];
        this.defaultVersion = result.default || null;
        if (['mysql', 'redis'].includes(this.tool)) {
          await this.refreshAllServiceStatus();
        }
        if (this.tool === 'redis') {
          await this.refreshRedisConfigs();
        }
      } catch (err) {
        console.error(`${this.toolLabel} 检测失败`, err);
        if (err.message && err.message.includes('is not a function')) {
          this.apiMissing = true;
        }
      } finally {
        this.loading = false;
      }
    },
    async refreshAllServiceStatus() {
      if (!['mysql', 'redis'].includes(this.tool)) return;
      const getStatusApi = window.electronAPI[this.getServiceStatusMethod];
      if (!getStatusApi) return;
      for (const v of this.versions) {
        try {
          const res = await getStatusApi(v);
          if (res.success) {
            this.serviceStatus[v] = res.status;
          } else {
            this.serviceStatus[v] = 'unknown';
          }
        } catch {
          this.serviceStatus[v] = 'unknown';
        }
      }
    },
    async refreshRedisConfigs() {
      if (this.tool !== 'redis') return;
      for (const v of this.versions) {
        try {
          const res = await window.electronAPI.getRedisConfig(v);
          if (res.success) {
            this.redisConfigs[v] = { port: res.port, hasPassword: res.hasPassword };
          } else {
            this.redisConfigs[v] = { port: '未知', hasPassword: false };
          }
        } catch {
          this.redisConfigs[v] = { port: '未知', hasPassword: false };
        }
      }
    },
    async switchVersion(version) {
      if (this.actionLoading) return;
      this.actionLoading = true;
      try {
        const api = window.electronAPI[this.switchMethod];
        if (!api) {
          this.$emit('status', `❌ 切换功能暂未支持`);
          return;
        }
        const result = await api(version);
        if (result.success) {
          this.$emit('status', `✅ 已切换到 ${this.toolLabel} ${version}`);
          await this.refresh();
        } else {
          this.$emit('status', `❌ 切换失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 切换失败：${err.message}`);
      } finally {
        this.actionLoading = false;
      }
    },
    async uninstallVersion(version) {
      if (this.actionLoading) return;
      if (!confirm(`确定要卸载 ${this.toolLabel} ${version} 吗？此操作不可撤销。`)) return;
      this.actionLoading = true;
      try {
        const api = window.electronAPI[this.deleteMethod];
        if (!api) {
          this.$emit('status', `❌ 卸载功能暂未支持`);
          return;
        }
        const result = await api(version);
        if (result.success) {
          this.$emit('status', `✅ 已卸载 ${this.toolLabel} ${version}`);
          await this.refresh();
        } else {
          this.$emit('status', `❌ 卸载失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 卸载失败：${err.message}`);
      } finally {
        this.actionLoading = false;
      }
    },
    async startService(version) {
      if (this.actionLoading) return;
      this.actionLoading = true;
      try {
        const api = window.electronAPI[this.startServiceMethod];
        if (!api) {
          this.$emit('status', `❌ 启动功能暂未支持`);
          return;
        }
        const result = await api(version);
        if (result.success) {
          this.$emit('status', `✅ ${result.message}`);
          await this.refreshAllServiceStatus();
        } else {
          this.$emit('status', `❌ 启动失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 启动失败：${err.message}`);
      } finally {
        this.actionLoading = false;
      }
    },
    async stopService(version) {
      if (this.actionLoading) return;
      this.actionLoading = true;
      try {
        const api = window.electronAPI[this.stopServiceMethod];
        if (!api) {
          this.$emit('status', `❌ 停止功能暂未支持`);
          return;
        }
        const result = await api(version);
        if (result.success) {
          this.$emit('status', `✅ ${result.message}`);
          await this.refreshAllServiceStatus();
        } else {
          this.$emit('status', `❌ 停止失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 停止失败：${err.message}`);
      } finally {
        this.actionLoading = false;
      }
    },
    async toggleService(version) {
      if (this.serviceStatus[version] === 'running') {
        await this.stopService(version);
      } else {
        await this.startService(version);
      }
    },
    openPasswordModal(version) {
      this.currentVersionForPassword = version;
      this.oldRedisPassword = '';
      this.newRedisPassword = '';
      this.showPasswordModal = true;
    },
    closePasswordModal() {
      this.showPasswordModal = false;
      this.currentVersionForPassword = null;
    },
    async changeRedisPassword() {
      if (this.passwordChanging) return;
      this.passwordChanging = true;
      try {
        const api = window.electronAPI[this.changePasswordMethod];
        if (!api) {
          this.$emit('status', `❌ 修改密码功能暂未支持`);
          return;
        }
        const result = await api(this.currentVersionForPassword, this.oldRedisPassword, this.newRedisPassword);
        if (result.success) {
          this.$emit('status', `✅ ${result.message}`);
          this.closePasswordModal();
          await this.refreshAllServiceStatus();
          await this.refreshRedisConfigs();
        } else {
          this.$emit('status', `❌ 修改密码失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 修改密码失败：${err.message}`);
      } finally {
        this.passwordChanging = false;
      }
    }
  }
};
</script>

<style scoped>
.environment-panel {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 28px;
  padding: 24px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.02);
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.3s ease;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #eef2f6;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-icon-img {
  width: 32px;
  height: 32px;
  display: block;
  object-fit: contain;
}

.tool-icon-emoji {
  font-size: 2rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.panel-header h3 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #1e293b, #2c3e50);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  letter-spacing: -0.5px;
}

.install-btn {
  background: linear-gradient(135deg, #2c7a4d, #1f5e3a);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 40px;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.install-btn .plus-icon {
  font-size: 1.3rem;
  font-weight: 700;
}

.install-btn:hover {
  transform: translateY(-2px);
  background: linear-gradient(135deg, #1f5e3a, #154e2f);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
}

.toolbar {
  margin-bottom: 20px;
}

.refresh-btn {
  background-color: #f1f5f9;
  color: #334155;
  border: 1px solid #e2e8f0;
  padding: 8px 18px;
  border-radius: 30px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background-color: #e6edf4;
  border-color: #cbd5e1;
  transform: scale(0.98);
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: #fefefe;
  border-radius: 28px;
  margin-top: 20px;
  border: 1px dashed #cbd5e1;
}

.empty-icon {
  font-size: 3.5rem;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-state p {
  color: #64748b;
  font-size: 1rem;
}

.versions-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  overflow-y: auto;
  padding-right: 4px;
}

.version-card {
  background: white;
  border-radius: 24px;
  padding: 16px;
  border: 1px solid #eef2f6;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.version-card.is-default {
  background: linear-gradient(135deg, #f0f9ff, #e6f4ff);
  border-left: 4px solid #2c7a4d;
  border-color: #b9e0f0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.version-badge {
  font-weight: 700;
  font-size: 1rem;
  background: #eef2ff;
  padding: 6px 14px;
  border-radius: 40px;
  color: #1e293b;
}

.default-tag {
  font-size: 0.75rem;
  background-color: #2c7a4d;
  color: white;
  padding: 4px 12px;
  border-radius: 30px;
  font-weight: 600;
}

.card-body {
  font-size: 0.9rem;
}

.service-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-weight: 500;
  color: #475569;
}

.service-status {
  font-size: 0.85rem;
  padding: 4px 12px;
  border-radius: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.service-status.running {
  background-color: #dcfce7;
  color: #166534;
}

.service-status.running .status-dot {
  background-color: #16a34a;
}

.service-status.stopped {
  background-color: #fee2e2;
  color: #991b1b;
}

.service-status.stopped .status-dot {
  background-color: #dc2626;
}

.redis-config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.8rem;
  color: #475569;
  margin-top: 4px;
}

.config-label {
  font-weight: 500;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.card-actions button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 6px 12px;
  border-radius: 40px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.action-icon {
  font-size: 0.9rem;
}

.action-switch {
  background-color: #eff6ff;
  color: #2563eb;
}

.action-switch:hover:not(:disabled) {
  background-color: #dbeafe;
  transform: scale(0.96);
}

.action-start {
  background-color: #dcfce7;
  color: #16a34a;
}

.action-start:hover:not(:disabled) {
  background-color: #bbf7d0;
  transform: scale(0.96);
}

.action-stop {
  background-color: #fee2e2;
  color: #dc2626;
}

.action-stop:hover:not(:disabled) {
  background-color: #fecaca;
  transform: scale(0.96);
}

.action-delete {
  background-color: #fee2e2;
  color: #dc2626;
}

.action-delete:hover:not(:disabled) {
  background-color: #fecaca;
  transform: scale(0.96);
}

.action-password {
  background-color: #e9d5ff;
  color: #6b21a5;
}

.action-password:hover:not(:disabled) {
  background-color: #d8b4fe;
  transform: scale(0.96);
}

.card-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.warning-message {
  margin-top: 20px;
  padding: 14px 18px;
  background-color: #fffbeb;
  border-left: 4px solid #f59e0b;
  border-radius: 20px;
  font-size: 0.9rem;
  color: #b45309;
  display: flex;
  align-items: center;
  gap: 10px;
}

.warning-icon {
  font-size: 1.1rem;
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