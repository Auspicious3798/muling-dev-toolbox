<template>
  <div class="dashboard">
    <div class="welcome-section">
      <div class="welcome-text">
        <h1>你好，{{ username }}</h1>
        <p>{{ currentDate }}</p>
      </div>
      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-title">CPU 使用率</div>
          <div class="stat-value">{{ cpuUsage }}%</div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: cpuUsage + '%', backgroundColor: cpuColor }"></div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-title">内存使用率</div>
          <div class="stat-value">{{ memoryUsage }}%</div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: memoryUsage + '%', backgroundColor: memoryColor }"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="env-section">
      <div class="section-header">
        <h2>已安装环境</h2>
        <button class="refresh-all-btn" @click="refreshAll" :disabled="refreshing">
          <span class="refresh-icon">⟳</span> {{ refreshing ? '刷新中...' : '刷新全部' }}
        </button>
      </div>
      <div class="env-grid">
        <div v-for="env in envList" :key="env.id" class="env-card" :class="{ 'not-installed': !env.installed }">
          <div class="env-card-header">
            <img :src="env.icon" class="env-icon"/>
            <span class="env-name">{{ env.name }}</span>
          </div>
          <div class="env-info">
            <div v-if="env.installed" class="env-version">
              默认版本：{{ env.defaultVersion || '未知' }}
            </div>
            <div v-if="env.serviceStatus && env.installed" class="env-service" :class="env.serviceStatus">
              <span class="status-dot"></span> {{ env.serviceStatus === 'running' ? '运行中' : '已停止' }}
            </div>
            <div v-if="!env.installed" class="env-not-installed">
              未安装
            </div>
          </div>
          <div class="env-actions">
            <button v-if="env.installed && env.id !== 'maven'" @click="switchVersion(env.id)"
                    class="action-btn switch-btn" title="切换版本">
              🔄 切换
            </button>
            <button v-if="env.serviceCapable && env.installed" @click="toggleService(env.id)"
                    class="action-btn service-btn" :class="env.serviceStatus">
              {{ env.serviceStatus === 'running' ? '停止' : '启动' }}
            </button>
            <button v-if="!env.installed" @click="installEnv(env.id)" class="action-btn install-btn">
              ➕ 安装
            </button>
            <button v-if="env.installed" @click="uninstallEnv(env.id)" class="action-btn delete-btn">
              🗑 卸载
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <h2>快速操作</h2>
      <div class="quick-buttons">
        <button @click="quickInstall('jdk')" class="quick-btn">☕ 一键安装 JDK</button>
        <button @click="quickInstall('python')" class="quick-btn">🐍 一键安装 Python</button>
        <button @click="quickInstall('mysql')" class="quick-btn">🐬 一键安装 MySQL</button>
        <button @click="openVersionManager" class="quick-btn">⚙️ 版本管理器</button>
      </div>
    </div>

    <div class="log-section">
      <div class="log-header" @click="toggleLog">
        <span>最近操作</span>
        <span class="toggle-icon">{{ logExpanded ? '▼' : '▶' }}</span>
      </div>
      <div v-if="logExpanded" class="log-list">
        <div v-for="(log, idx) in recentLogs" :key="idx" class="log-item">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
        <div v-if="recentLogs.length === 0" class="log-empty">暂无操作记录</div>
      </div>
    </div>
  </div>
</template>

<script>
import eventBus from '@/eventBus';
import JavaIcon from '@/assets/icons/java.svg?url';
import PythonIcon from '@/assets/icons/Python.svg?url';
import MysqlIcon from '@/assets/icons/mysql.svg?url';
import RedisIcon from '@/assets/icons/Redis.svg?url';
import MavenIcon from '@/assets/icons/maven.svg?url';

export default {
  name: 'Dashboard',
  data() {
    return {
      username: '',
      currentDate: '',
      cpuUsage: 0,
      memoryUsage: 0,
      refreshing: false,
      envList: [],
      serviceStatusCache: {},
      logExpanded: true,
      recentLogs: []
    };
  },
  computed: {
    cpuColor() {
      if (this.cpuUsage < 70) return '#16a34a';
      if (this.cpuUsage < 90) return '#f59e0b';
      return '#dc2626';
    },
    memoryColor() {
      if (this.memoryUsage < 70) return '#16a34a';
      if (this.memoryUsage < 90) return '#f59e0b';
      return '#dc2626';
    }
  },
  mounted() {
    this.initUserInfo();
    this.updateDateTime();
    setInterval(() => this.updateDateTime(), 1000);
    this.loadEnvData();
    this.loadLogs();
    this.startStatsRefresh();
    this.listenEvents();
  },
  methods: {
    initUserInfo() {
      this.username = window.electronAPI ? window.electronAPI.getUserDataPath ? '开发者' : '用户' : '用户';
    },
    updateDateTime() {
      const now = new Date();
      this.currentDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    },
    async loadEnvData() {
      const envs = [
        {
          id: 'jdk',
          name: 'JDK',
          icon: JavaIcon,
          checkMethod: 'checkJDK',
          switchMethod: 'switchJDK',
          deleteMethod: 'deleteJDK',
          serviceCapable: false
        },
        {
          id: 'python',
          name: 'Python',
          icon: PythonIcon,
          checkMethod: 'checkPython',
          switchMethod: 'switchPython',
          deleteMethod: 'deletePython',
          serviceCapable: false
        },
        {
          id: 'mysql',
          name: 'MySQL',
          icon: MysqlIcon,
          checkMethod: 'checkMySQL',
          switchMethod: 'switchMySQL',
          deleteMethod: 'deleteMySQL',
          serviceCapable: true,
          getStatusMethod: 'getMySQLServiceStatus',
          startMethod: 'startMySQLService',
          stopMethod: 'stopMySQLService'
        },
        {
          id: 'redis',
          name: 'Redis',
          icon: RedisIcon,
          checkMethod: 'checkRedis',
          switchMethod: 'switchRedis',
          deleteMethod: 'deleteRedis',
          serviceCapable: true,
          getStatusMethod: 'getRedisServiceStatus',
          startMethod: 'startRedisService',
          stopMethod: 'stopRedisService'
        },
        {
          id: 'maven',
          name: 'Maven',
          icon: MavenIcon,
          checkMethod: 'checkMaven',
          deleteMethod: 'uninstallMaven',
          serviceCapable: false,
          isSimple: true
        }
      ];
      const results = [];
      for (const env of envs) {
        try {
          const api = window.electronAPI[env.checkMethod];
          if (!api) {
            results.push({...env, installed: false, defaultVersion: null});
            continue;
          }
          const result = await api();
          if (env.isSimple) {
            results.push({...env, installed: result.installed, defaultVersion: result.version});
          } else {
            results.push({
              ...env,
              installed: result.versions && result.versions.length > 0,
              defaultVersion: result.default || (result.versions && result.versions[0])
            });
          }
          if (env.serviceCapable && results[results.length - 1].installed) {
            const statusApi = window.electronAPI[env.getStatusMethod];
            if (statusApi) {
              const version = results[results.length - 1].defaultVersion || (result.versions && result.versions[0]);
              if (version) {
                const statusRes = await statusApi(version);
                results[results.length - 1].serviceStatus = statusRes.status;
              }
            }
          }
        } catch (err) {
          results.push({...env, installed: false, defaultVersion: null});
        }
      }
      this.envList = results;
    },
    async refreshAll() {
      if (this.refreshing) return;
      this.refreshing = true;
      await this.loadEnvData();
      this.refreshing = false;
    },
    async switchVersion(envId) {
      const env = this.envList.find(e => e.id === envId);
      if (!env || !env.installed) return;
      const switchApi = window.electronAPI[env.switchMethod];
      if (!switchApi) return;
      const version = env.defaultVersion;
      const result = await switchApi(version);
      if (result.success) {
        this.addLog(`已切换到 ${env.name} ${version}`);
        await this.loadEnvData();
      } else {
        this.addLog(`切换失败：${result.message}`, true);
      }
    },
    async toggleService(envId) {
      const env = this.envList.find(e => e.id === envId);
      if (!env || !env.installed) return;
      const version = env.defaultVersion;
      const isRunning = env.serviceStatus === 'running';
      const method = isRunning ? env.stopMethod : env.startMethod;
      const api = window.electronAPI[method];
      if (!api) return;
      const result = await api(version);
      if (result.success) {
        this.addLog(`${env.name} 服务已${isRunning ? '停止' : '启动'}`);
        await this.loadEnvData();
      } else {
        this.addLog(`${env.name} 服务${isRunning ? '停止' : '启动'}失败：${result.message}`, true);
      }
    },
    async uninstallEnv(envId) {
      const env = this.envList.find(e => e.id === envId);
      if (!env || !env.installed) return;
      if (!confirm(`确定要卸载 ${env.name} 吗？此操作不可撤销。`)) return;
      const deleteApi = window.electronAPI[env.deleteMethod];
      if (!deleteApi) return;
      let result;
      if (env.isSimple) {
        result = await deleteApi();
      } else {
        const version = env.defaultVersion;
        result = await deleteApi(version);
      }
      if (result.success) {
        this.addLog(`已卸载 ${env.name}`);
        await this.loadEnvData();
      } else {
        this.addLog(`卸载失败：${result.message}`, true);
      }
    },
    installEnv(envId) {
      this.$emit('install', envId);
    },
    quickInstall(envId) {
      this.$emit('install', envId);
    },
    openVersionManager() {
      alert('版本管理器功能开发中');
    },
    startStatsRefresh() {
      const updateStats = async () => {
        if (window.electronAPI && window.electronAPI.getSystemStats) {
          const stats = await window.electronAPI.getSystemStats();
          this.cpuUsage = stats.cpu;
          this.memoryUsage = stats.memory;
        }
      };
      updateStats();
      setInterval(updateStats, 5000);
    },
    loadLogs() {
      const stored = localStorage.getItem('dashboard_logs');
      if (stored) {
        this.recentLogs = JSON.parse(stored).slice(0, 20);
      }
    },
    addLog(message, isError = false) {
      const log = {
        time: new Date().toLocaleTimeString(),
        message: isError ? `❌ ${message}` : `✅ ${message}`
      };
      this.recentLogs.unshift(log);
      if (this.recentLogs.length > 20) this.recentLogs.pop();
      localStorage.setItem('dashboard_logs', JSON.stringify(this.recentLogs));
    },
    toggleLog() {
      this.logExpanded = !this.logExpanded;
    },
    listenEvents() {
      eventBus.on('install:end', () => {
        this.refreshAll();
      });
      if (window.electronAPI) {
        window.electronAPI.onJDKChanged?.(() => this.refreshAll());
        window.electronAPI.onPythonChanged?.(() => this.refreshAll());
        window.electronAPI.onMySQLChanged?.(() => this.refreshAll());
        window.electronAPI.onRedisChanged?.(() => this.refreshAll());
        window.electronAPI.onMavenChanged?.(() => this.refreshAll());
      }
    }
  }
};
</script>

<style scoped>
.dashboard {
  background: var(--gradient-bg);
  border-radius: 28px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  height: 100%;
  overflow-y: auto;
}

.welcome-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.welcome-text h1 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.welcome-text p {
  color: var(--text-secondary);
  margin: 4px 0 0;
}

.stats-cards {
  display: flex;
  gap: 16px;
}

.stat-card {
  background: var(--bg-card);
  border-radius: 20px;
  padding: 12px 20px;
  width: 160px;
  box-shadow: var(--shadow-sm);
}

.stat-title {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 8px 0;
  color: var(--text-primary);
}

.progress-bar {
  height: 6px;
  background: var(--border-light);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  transition: width 0.3s;
}

.env-section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h2 {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-primary);
}

.refresh-all-btn {
  background: var(--bg-hover);
  border: 1px solid var(--border-medium);
  border-radius: 30px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--text-primary);
}

.env-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.env-card {
  background: var(--bg-card);
  border-radius: 24px;
  padding: 16px;
  border: 1px solid var(--border-light);
  transition: all 0.2s;
}

.env-card.not-installed {
  opacity: 0.7;
  background: var(--bg-hover);
}

.env-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.env-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.env-name {
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.env-info {
  margin-bottom: 12px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.env-version {
  margin-bottom: 4px;
}

.env-service {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 0.75rem;
}

.env-service.running {
  background: var(--success-bg);
  color: var(--success-text);
}

.env-service.stopped {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.env-service.running .status-dot {
  background: var(--success-text);
}

.env-service.stopped .status-dot {
  background: var(--danger-text);
}

.env-not-installed {
  color: var(--text-muted);
  font-style: italic;
}

.env-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  background: none;
  border: none;
  padding: 4px 12px;
  border-radius: 40px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.switch-btn {
  background: var(--info-bg);
  color: var(--info-text);
}

.switch-btn:hover {
  filter: brightness(0.95);
}

.service-btn {
  background: var(--success-bg);
  color: var(--success-text);
}

.service-btn.stopped {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.install-btn {
  background: var(--primary);
  color: white;
}

.delete-btn {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.quick-actions {
  margin-bottom: 24px;
}

.quick-actions h2 {
  font-size: 1.2rem;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.quick-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.quick-btn {
  background: var(--bg-hover);
  border: 1px solid var(--border-medium);
  border-radius: 40px;
  padding: 8px 20px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-primary);
}

.quick-btn:hover {
  background: var(--border-light);
  transform: scale(0.98);
}

.log-section {
  background: var(--bg-card);
  border-radius: 20px;
  padding: 12px;
  margin-top: 16px;
  border: 1px solid var(--border-light);
}

.log-header {
  display: flex;
  justify-content: space-between;
  cursor: pointer;
  padding: 8px;
  font-weight: 600;
  color: var(--text-primary);
}

.log-list {
  max-height: 200px;
  overflow-y: auto;
  margin-top: 8px;
}

.log-item {
  display: flex;
  gap: 12px;
  padding: 6px 8px;
  font-size: 0.8rem;
  border-bottom: 1px solid var(--border-light);
}

.log-time {
  color: var(--text-secondary);
  width: 70px;
}

.log-message {
  color: var(--text-primary);
}

.log-empty {
  text-align: center;
  color: var(--text-muted);
  padding: 12px;
}
</style>