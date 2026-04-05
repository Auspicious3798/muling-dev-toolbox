<template>
  <div class="environment-panel">
    <div class="panel-header">
      <div class="title-section">
        <img v-if="toolIconPath" :src="toolIconPath" class="tool-icon-img" alt=""/>
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

    <div v-if="tool === 'maven'">
      <div v-if="mavenInstalled && !loading" class="version-card maven-card">
        <div class="card-header">
          <span class="version-badge">Maven {{ mavenVersion }}</span>
        </div>
        <div class="card-actions">
          <button @click="uninstallMaven" class="action-delete" :disabled="actionLoading">
            <span class="action-icon">🗑</span> 卸载
          </button>
        </div>
      </div>
      <div v-else-if="!loading" class="empty-state">
        <div class="empty-icon">📦</div>
        <p>未检测到已安装的 Maven</p>
      </div>
      <div v-if="apiMissing" class="warning-message">
        <span class="warning-icon">⚠️</span> 当前工具暂未支持检测，敬请期待。
      </div>
    </div>

    <div v-else-if="versions.length === 0 && !loading" class="empty-state">
      <div class="empty-icon">📦</div>
      <p>未检测到已安装的 {{ toolLabel }}</p>
    </div>

    <div v-else-if="tool !== 'maven'" class="versions-grid">
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
          <button v-if="tool === 'redis'" @click="toggleService(v)"
                  :class="serviceStatus[v] === 'running' ? 'action-stop' : 'action-start'" :disabled="actionLoading">
            <span class="action-icon">{{ serviceStatus[v] === 'running' ? '■' : '▶' }}</span>
            {{ serviceStatus[v] === 'running' ? '停止' : '启动' }}
          </button>
          <button v-if="tool === 'redis'" @click="openPasswordModal(v)" class="action-password"
                  :disabled="actionLoading">
            <span class="action-icon">🔑</span> 修改密码
          </button>
          <button @click="uninstallVersion(v)" class="action-delete" :disabled="actionLoading">
            <span class="action-icon">🗑</span> 卸载
          </button>
        </div>
      </div>
    </div>

    <div v-if="apiMissing && tool !== 'maven'" class="warning-message">
      <span class="warning-icon">⚠️</span> 当前工具暂未支持检测，敬请期待。
    </div>

    <div v-if="showPasswordModal" class="modal-overlay" @click.self="closePasswordModal">
      <div class="modal">
        <h4>修改 Redis 密码</h4>
        <div class="modal-field">
          <label>旧密码（若无则留空）：</label>
          <input type="password" v-model="oldRedisPassword"/>
        </div>
        <div class="modal-field">
          <label>新密码：</label>
          <input type="password" v-model="newRedisPassword"/>
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
import AIIcon from '../../public/icons/AI.svg?url';
import CIcon from '../../public/icons/c.svg?url';
import ElasticsearchIcon from '../../public/icons/elasticsearch.svg?url';
import GitIcon from '../../public/icons/git.svg?url';
import GolangIcon from '../../public/icons/Golang.svg?url';
import GradleIcon from '../../public/icons/gradle.svg?url';
import JavaIcon from '../../public/icons/java.svg?url';
import JupyterIcon from '../../public/icons/Jupyter.svg?url';
import KibanaIcon from '../../public/icons/kibana.svg?url';
import MavenIcon from '../../public/icons/maven.svg?url';
import MinicondaIcon from '../../public/icons/Miniconda.svg?url';
import MinioIcon from '../../public/icons/minio.svg?url';
import MysqlIcon from '../../public/icons/mysql.svg?url';
import NacosIcon from '../../public/icons/nacos.svg?url';
import NginxIcon from '../../public/icons/nginx.svg?url';
import OllamaIcon from '../../public/icons/Ollama.svg?url';
import PythonIcon from '../../public/icons/Python.svg?url';
import RabbitmqIcon from '../../public/icons/Rabbitmq.svg?url';
import RedisIcon from '../../public/icons/Redis.svg?url';
import SentinelIcon from '../../public/icons/sentinel.svg?url';
import DashboardIcon from '../../public/icons/Dashboard.svg?url';
import LemonIcon from '../../public/icons/lemon.svg?url';
import SettingsIcon from '../../public/icons/setting.svg?url';

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
      passwordChanging: false,
      mavenInstalled: false,
      mavenVersion: ''
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
        redis: 'checkRedis',
        maven: 'checkMaven'
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
        redis: 'deleteRedis',
        maven: 'uninstallMaven'
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
      window.electronAPI.onMavenChanged?.(() => {
        if (this.tool === 'maven') this.refresh();
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
        if (this.tool === 'maven') {
          const result = await api();
          this.mavenInstalled = result.installed;
          if (result.version) this.mavenVersion = result.version;
        } else {
          const result = await api();
          this.versions = result.versions || [];
          this.defaultVersion = result.default || null;
          if (['mysql', 'redis'].includes(this.tool)) {
            await this.refreshAllServiceStatus();
          }
          if (this.tool === 'redis') {
            await this.refreshRedisConfigs();
          }
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
            this.redisConfigs[v] = {port: res.port, hasPassword: res.hasPassword};
          } else {
            this.redisConfigs[v] = {port: '未知', hasPassword: false};
          }
        } catch {
          this.redisConfigs[v] = {port: '未知', hasPassword: false};
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
          const msg = `✅ 已切换到 ${this.toolLabel} ${version}`;
          this.$emit('status', msg);
          alert(msg);
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
    async uninstallMaven() {
      if (this.actionLoading) return;
      if (!confirm('确定要卸载 Maven 吗？此操作不可撤销。')) return;
      this.actionLoading = true;
      try {
        const result = await window.electronAPI.uninstallMaven();
        if (result.success) {
          this.$emit('status', `✅ ${result.message}`);
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
  background: var(--gradient-bg);
  border-radius: 28px;
  padding: 24px;
  box-shadow: var(--shadow-md);
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
  border-bottom: 2px solid var(--border-light);
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
  background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  letter-spacing: -0.5px;
}

.install-btn {
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
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
  box-shadow: var(--shadow-sm);
}

.install-btn .plus-icon {
  font-size: 1.3rem;
  font-weight: 700;
}

.install-btn:hover {
  transform: translateY(-2px);
  background: linear-gradient(135deg, var(--primary-hover), #154e2f);
  box-shadow: var(--shadow-md);
}

.toolbar {
  margin-bottom: 20px;
}

.refresh-btn {
  background-color: var(--bg-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-medium);
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
  background-color: var(--border-light);
  border-color: var(--border-dark);
  transform: scale(0.98);
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: var(--bg-card);
  border-radius: 28px;
  margin-top: 20px;
  border: 1px dashed var(--border-medium);
}

.empty-icon {
  font-size: 3.5rem;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-state p {
  color: var(--text-secondary);
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
  background: var(--bg-card);
  border-radius: 24px;
  padding: 16px;
  border: 1px solid var(--border-light);
  transition: all 0.2s ease;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-card:hover {
  border-color: var(--border-dark);
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.version-card.is-default {
  background: linear-gradient(135deg, #f0f9ff, #e6f4ff);
  border-left: 4px solid var(--primary);
  border-color: #b9e0f0;
}

.maven-card {
  max-width: 400px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.version-badge {
  font-weight: 700;
  font-size: 1rem;
  background: var(--info-bg);
  padding: 6px 14px;
  border-radius: 40px;
  color: var(--info-text);
}

.default-tag {
  font-size: 0.75rem;
  background-color: var(--primary);
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
  color: var(--text-secondary);
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
  background-color: var(--success-bg);
  color: var(--success-text);
}

.service-status.running .status-dot {
  background-color: var(--success-text);
}

.service-status.stopped {
  background-color: var(--danger-bg);
  color: var(--danger-text);
}

.service-status.stopped .status-dot {
  background-color: var(--danger-text);
}

.redis-config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.8rem;
  color: var(--text-secondary);
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
  background-color: var(--info-bg);
  color: var(--info-text);
}

.action-switch:hover:not(:disabled) {
  background-color: var(--info-bg);
  filter: brightness(0.95);
  transform: scale(0.96);
}

.action-start {
  background-color: var(--success-bg);
  color: var(--success-text);
}

.action-start:hover:not(:disabled) {
  filter: brightness(0.95);
  transform: scale(0.96);
}

.action-stop {
  background-color: var(--danger-bg);
  color: var(--danger-text);
}

.action-stop:hover:not(:disabled) {
  filter: brightness(0.95);
  transform: scale(0.96);
}

.action-delete {
  background-color: var(--danger-bg);
  color: var(--danger-text);
}

.action-delete:hover:not(:disabled) {
  filter: brightness(0.95);
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
  background-color: var(--warning-bg);
  border-left: 4px solid #f59e0b;
  border-radius: 20px;
  font-size: 0.9rem;
  color: var(--warning-text);
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