<template>
  <div class="dashboard">
    <!-- Welcome + Stats -->
    <div class="welcome-section">
      <div class="welcome-text">
        <h1>你好，{{ username }}</h1>
        <p>{{ currentDate }}</p>
      </div>
      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-icon cpu-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
          </div>
          <div class="stat-body">
            <div class="stat-title">CPU</div>
            <div class="stat-value">{{ cpuUsage }}%</div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: cpuUsage + '%', backgroundColor: cpuColor }"></div>
            </div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon memory-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="1"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/><line x1="14" y1="10" x2="14" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/></svg>
          </div>
          <div class="stat-body">
            <div class="stat-title">内存</div>
            <div class="stat-value">{{ memoryUsage }}%</div>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: memoryUsage + '%', backgroundColor: memoryColor }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Environment Grid -->
    <div class="env-section">
      <div class="section-header">
        <h2>已安装环境</h2>
        <button class="refresh-all-btn" @click="refreshAll" :disabled="refreshing">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" :class="{ spinning: refreshing }"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          {{ refreshing ? '刷新中...' : '刷新全部' }}
        </button>
      </div>
      <div class="env-grid">
        <div v-for="env in envList" :key="env.id" class="env-card" :class="{ 'not-installed': !env.installed }" @click="env.installed ? null : installEnv(env.id)">
          <div class="env-card-header">
            <img :src="env.icon" class="env-icon" alt=""/>
            <span class="env-name">{{ env.name }}</span>
            <span v-if="env.serviceStatus" class="env-status-dot" :class="env.serviceStatus"></span>
          </div>
          <div class="env-info">
            <div v-if="env.installed" class="env-version">
              v{{ env.defaultVersion || '未知' }}
            </div>
            <div v-if="env.serviceStatus && env.installed" class="env-service" :class="env.serviceStatus">
              {{ env.serviceStatus === 'running' ? '运行中' : '已停止' }}
            </div>
            <div v-if="!env.installed" class="env-not-installed">
              点击安装
            </div>
          </div>
          <div class="env-actions">
            <button v-if="env.installed && env.id !== 'maven'" @click.stop="switchVersion(env.id)" class="action-btn switch-btn" title="切换版本">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            </button>
            <button v-if="env.serviceCapable && env.installed" @click.stop="toggleService(env.id)" class="action-btn service-btn" :class="env.serviceStatus">
              <svg v-if="env.serviceStatus !== 'running'" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="6" height="16" rx="1"/><rect x="14" y="4" width="6" height="16" rx="1"/></svg>
            </button>
            <button v-if="!env.installed" @click.stop="installEnv(env.id)" class="action-btn install-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              安装
            </button>
            <button v-if="env.installed" @click.stop="uninstallEnv(env.id)" class="action-btn delete-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h2>快速操作</h2>
      <div class="quick-buttons">
        <button @click="quickInstall('jdk')" class="quick-btn">
          <img src="/icons/java.svg" class="quick-btn-icon" alt=""/>
          JDK
        </button>
        <button @click="quickInstall('python')" class="quick-btn">
          <img src="/icons/Python.svg" class="quick-btn-icon" alt=""/>
          Python
        </button>
        <button @click="quickInstall('mysql')" class="quick-btn">
          <img src="/icons/mysql.svg" class="quick-btn-icon" alt=""/>
          MySQL
        </button>
        <button @click="openVersionManager" class="quick-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          版本管理
        </button>
      </div>
    </div>

    <!-- Log Section -->
    <div class="log-section">
      <div class="log-header" @click="toggleLog">
        <span>最近操作</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" :class="{ rotated: !logExpanded }"><polyline points="6 9 12 15 18 9"/></svg>
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
import JavaIcon from '../../public/icons/java.svg?url';
import PythonIcon from '../../public/icons/Python.svg?url';
import MysqlIcon from '../../public/icons/mysql.svg?url';
import RedisIcon from '../../public/icons/Redis.svg?url';
import MavenIcon from '../../public/icons/maven.svg?url';

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
      if (this.cpuUsage < 70) return '#10b981';
      if (this.cpuUsage < 90) return '#f59e0b';
      return '#ef4444';
    },
    memoryColor() {
      if (this.memoryUsage < 70) return '#10b981';
      if (this.memoryUsage < 90) return '#f59e0b';
      return '#ef4444';
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
    async initUserInfo() {
      if (window.electronAPI && window.electronAPI.getUsername) {
        try { this.username = await window.electronAPI.getUsername(); }
        catch (err) { this.username = '用户'; }
      } else { this.username = '用户'; }
    },
    updateDateTime() {
      const now = new Date();
      this.currentDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    },
    async loadEnvData() {
      const envs = [
        { id: 'jdk', name: 'JDK', icon: JavaIcon, checkMethod: 'checkJDK', switchMethod: 'switchJDK', deleteMethod: 'deleteJDK', serviceCapable: false },
        { id: 'python', name: 'Python', icon: PythonIcon, checkMethod: 'checkPython', switchMethod: 'switchPython', deleteMethod: 'deletePython', serviceCapable: false },
        { id: 'mysql', name: 'MySQL', icon: MysqlIcon, checkMethod: 'checkMySQL', switchMethod: 'switchMySQL', deleteMethod: 'deleteMySQL', serviceCapable: true, getStatusMethod: 'getMySQLServiceStatus', startMethod: 'startMySQLService', stopMethod: 'stopMySQLService' },
        { id: 'redis', name: 'Redis', icon: RedisIcon, checkMethod: 'checkRedis', switchMethod: 'switchRedis', deleteMethod: 'deleteRedis', serviceCapable: true, getStatusMethod: 'getRedisServiceStatus', startMethod: 'startRedisService', stopMethod: 'stopRedisService' },
        { id: 'maven', name: 'Maven', icon: MavenIcon, checkMethod: 'checkMaven', deleteMethod: 'uninstallMaven', serviceCapable: false, isSimple: true }
      ];
      const results = [];
      for (const env of envs) {
        try {
          const api = window.electronAPI[env.checkMethod];
          if (!api) { results.push({...env, installed: false, defaultVersion: null}); continue; }
          const result = await api();
          if (env.isSimple) {
            results.push({...env, installed: result.installed, defaultVersion: result.version});
          } else {
            results.push({...env, installed: result.versions && result.versions.length > 0, defaultVersion: result.default || (result.versions && result.versions[0])});
          }
          if (env.serviceCapable && results[results.length - 1].installed) {
            const statusApi = window.electronAPI[env.getStatusMethod];
            if (statusApi) {
              const version = results[results.length - 1].defaultVersion || (result.versions && result.versions[0]);
              if (version) { const statusRes = await statusApi(version); results[results.length - 1].serviceStatus = statusRes.status; }
            }
          }
        } catch (err) { results.push({...env, installed: false, defaultVersion: null}); }
      }
      this.envList = results;
    },
    async refreshAll() { if (this.refreshing) return; this.refreshing = true; await this.loadEnvData(); this.refreshing = false; },
    async switchVersion(envId) {
      const env = this.envList.find(e => e.id === envId);
      if (!env || !env.installed) return;
      const switchApi = window.electronAPI[env.switchMethod];
      if (!switchApi) return;
      const result = await switchApi(env.defaultVersion);
      if (result.success) { this.addLog(`已切换到 ${env.name} ${env.defaultVersion}`); await this.loadEnvData(); }
      else { this.addLog(`切换失败：${result.message}`, true); }
    },
    async toggleService(envId) {
      const env = this.envList.find(e => e.id === envId);
      if (!env || !env.installed) return;
      const isRunning = env.serviceStatus === 'running';
      const method = isRunning ? env.stopMethod : env.startMethod;
      const api = window.electronAPI[method];
      if (!api) return;
      const result = await api(env.defaultVersion);
      if (result.success) { this.addLog(`${env.name} 服务已${isRunning ? '停止' : '启动'}`); await this.loadEnvData(); }
      else { this.addLog(`${env.name} 服务${isRunning ? '停止' : '启动'}失败：${result.message}`, true); }
    },
    async uninstallEnv(envId) {
      const env = this.envList.find(e => e.id === envId);
      if (!env || !env.installed) return;
      if (!confirm(`确定要卸载 ${env.name} 吗？此操作不可撤销。`)) return;
      const deleteApi = window.electronAPI[env.deleteMethod];
      if (!deleteApi) return;
      let result;
      if (env.isSimple) { result = await deleteApi(); }
      else { result = await deleteApi(env.defaultVersion); }
      if (result.success) { this.addLog(`已卸载 ${env.name}`); await this.loadEnvData(); }
      else { this.addLog(`卸载失败：${result.message}`, true); }
    },
    installEnv(envId) { this.$emit('install', envId); },
    quickInstall(envId) { this.$emit('install', envId); },
    openVersionManager() { alert('版本管理器功能开发中'); },
    startStatsRefresh() {
      const updateStats = async () => {
        if (window.electronAPI && window.electronAPI.getSystemStats) {
          const stats = await window.electronAPI.getSystemStats();
          this.cpuUsage = stats.cpu; this.memoryUsage = stats.memory;
        }
      };
      updateStats();
      setInterval(updateStats, 5000);
    },
    loadLogs() { const stored = localStorage.getItem('dashboard_logs'); if (stored) { this.recentLogs = JSON.parse(stored).slice(0, 20); } },
    addLog(message, isError = false) {
      const log = { time: new Date().toLocaleTimeString(), message: isError ? `[错误] ${message}` : `[完成] ${message}` };
      this.recentLogs.unshift(log);
      if (this.recentLogs.length > 20) this.recentLogs.pop();
      localStorage.setItem('dashboard_logs', JSON.stringify(this.recentLogs));
    },
    toggleLog() { this.logExpanded = !this.logExpanded; },
    listenEvents() {
      eventBus.on('install:end', () => { this.refreshAll(); });
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
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* ── Welcome ── */
.welcome-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.welcome-text h1 {
  font-size: 1.75rem;
  font-weight: 800;
  margin: 0;
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.welcome-text p {
  color: var(--text-secondary);
  margin: 2px 0 0;
  font-size: 0.9rem;
}

.stats-cards {
  display: flex;
  gap: var(--space-3);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  min-width: 170px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-light);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.cpu-icon {
  background: #dbeafe;
  color: #2563eb;
}

.memory-icon {
  background: #d1fae5;
  color: #059669;
}

.stat-body {
  flex: 1;
  min-width: 0;
}

.stat-title {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 2px 0 6px;
  line-height: 1;
  font-family: var(--font-mono);
}

.progress-bar {
  height: 4px;
  background: var(--border-light);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.4s ease;
}

/* ── Environment Section ── */
.env-section {
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-sm);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.section-header h2 {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.refresh-all-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  padding: 6px 14px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.refresh-all-btn:hover:not(:disabled) {
  background: var(--border-light);
  color: var(--text-primary);
}

.refresh-all-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.env-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-3);
}

.env-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  border: 1px solid var(--border-light);
  transition: all var(--transition-fast);
  cursor: default;
  position: relative;
}

.env-card:hover {
  border-color: var(--border-medium);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.env-card.not-installed {
  opacity: 0.65;
  cursor: pointer;
}

.env-card.not-installed:hover {
  opacity: 1;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px var(--primary-light);
}

.env-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.env-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.env-name {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-primary);
  flex: 1;
}

.env-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.env-status-dot.running {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
}

.env-status-dot.stopped {
  background: #94a3b8;
}

.env-info {
  margin-bottom: var(--space-3);
  font-size: 0.8rem;
}

.env-version {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.env-service {
  display: inline-block;
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 600;
}

.env-service.running {
  background: var(--success-bg);
  color: var(--success-text);
}

.env-service.stopped {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.env-not-installed {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.env-actions {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.switch-btn { background: var(--info-bg); color: var(--info-text); }
.switch-btn:hover { filter: brightness(0.93); }

.service-btn { background: var(--bg-hover); color: var(--text-secondary); }
.service-btn.running { background: var(--success-bg); color: var(--success-text); }
.service-btn:hover { filter: brightness(0.93); }

.install-btn { background: var(--primary); color: white; }
.install-btn:hover { background: var(--primary-hover); }

.delete-btn { background: transparent; color: var(--text-muted); }
.delete-btn:hover { background: var(--danger-bg); color: var(--danger-text); }

/* ── Quick Actions ── */
.quick-actions h2 {
  font-size: 1rem;
  font-weight: 700;
  margin-bottom: var(--space-3);
  color: var(--text-primary);
}

.quick-buttons {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.quick-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-full);
  padding: 9px 18px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary);
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-xs);
}

.quick-btn:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.quick-btn-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

/* ── Log ── */
.log-section {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-xs);
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  padding: var(--space-1) 0;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
  user-select: none;
}

.log-header svg {
  transition: transform var(--transition-fast);
}

.log-header svg.rotated {
  transform: rotate(-90deg);
}

.log-list {
  max-height: 180px;
  overflow-y: auto;
  margin-top: var(--space-2);
}

.log-item {
  display: flex;
  gap: var(--space-3);
  padding: 5px 0;
  font-size: 0.78rem;
  border-bottom: 1px solid var(--border-light);
}

.log-item:last-child { border-bottom: none; }

.log-time {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  flex-shrink: 0;
  width: 60px;
}

.log-message { color: var(--text-primary); }

.log-empty {
  text-align: center;
  color: var(--text-muted);
  padding: var(--space-4);
  font-size: 0.85rem;
}
</style>
