<template>
  <div class="dashboard">
    <!-- Welcome + Stats -->
    <div class="hero-banner">
      <div class="hero-blobs" aria-hidden="true">
        <div class="hero-blob blob-1"></div>
        <div class="hero-blob blob-2"></div>
        <div class="hero-blob blob-3"></div>
      </div>
      <div class="welcome-section">
        <div class="welcome-lemon">
          <img src="/art/xiaoning-portrait-disc.png" alt="小柠"/>
        </div>
        <div class="welcome-text">
          <h1>{{ greeting }}，{{ username }}</h1>
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
    </div>

    <!-- Adopt suggestion -->
    <div class="adopt-banner" v-if="adoptSuggestions.length">
      <div class="adopt-banner-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="9 12 12 15 16 10"/></svg>
      </div>
      <div class="adopt-banner-text">
        <strong>发现 {{ adoptSuggestions.length }} 个电脑上已有的环境</strong>
        <span>{{ adoptSummary }} —— 不用重装，接管一下就能一起切换。</span>
      </div>
      <div class="adopt-banner-actions">
        <button class="adopt-go" @click="goAdopt">去接管</button>
        <button class="adopt-dismiss" @click="dismissAdopt">不用了</button>
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
        <div v-for="(env, idx) in envList" :key="env.id" class="env-card" :class="{ 'not-installed': !env.installed }" :style="{ animationDelay: idx * 45 + 'ms' }" @click="env.installed ? null : installEnv(env.id)">
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

    <!-- Sandbox -->
    <div class="sandbox-section">
      <div class="section-header">
        <h2>沙箱环境</h2>
        <span class="sandbox-badge">不污染系统</span>
      </div>
      <div class="sandbox-card">
        <div class="sandbox-main">
          <div class="sandbox-label">安装根目录</div>
          <div class="sandbox-path" :title="sandbox.root">{{ sandbox.root || '正在读取…' }}</div>
          <div class="sandbox-hint">所有工具都安装在这里，不会修改系统环境变量；删掉这个目录即可彻底卸载。</div>
        </div>
        <div class="sandbox-actions">
          <button class="sandbox-btn primary" @click="openEnvTerminal">打开环境终端</button>
          <button class="sandbox-btn" @click="openSandboxRoot">打开目录</button>
          <button class="sandbox-btn" @click="copyEnvCommand">复制环境命令</button>
        </div>
      </div>
    </div>

    <!-- Integrity -->
    <div class="checkup-section">
      <div class="section-header">
        <h2>环境体检</h2>
        <button class="checkup-btn" :disabled="integrity.loading" @click="runIntegrityCheck">
          <span class="checkup-btn-icon" :class="{ spinning: integrity.loading }">◎</span>
          <span>{{ integrity.loading ? '体检中…' : '一键体检' }}</span>
        </button>
      </div>
      <div class="checkup-card">
        <div v-if="integrity.loading" class="checkup-scanning">
          <div class="checkup-scan-bar"><span></span></div>
          <p>正在为您全面体检…</p>
        </div>
        <div v-else-if="!integrity.done" class="checkup-placeholder">
          <p>检查沙箱里每个环境的核心文件是否还在，防止误删或被杀毒软件清理掉。</p>
        </div>
        <div v-else-if="integrity.items.length === 0" class="checkup-placeholder">
          <p>沙箱里还没有安装任何环境，装一个再来体检吧～</p>
        </div>
        <div v-else class="checkup-list">
          <div v-for="item in integrity.items" :key="item.tool + '-' + item.version" class="checkup-item" :class="{ broken: !item.healthy }">
            <span class="checkup-dot"></span>
            <span class="checkup-name">{{ item.label }} {{ item.version }}</span>
            <span class="checkup-state">{{ item.healthy ? '健康' : '缺失 ' + item.missing.join('、') }}</span>
            <button v-if="!item.healthy" class="checkup-fix" @click="fixEnv(item)">重新安装</button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script>
import eventBus from '@/eventBus';
import Lemon from '@/utils/lemon';
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
      recentLogs: [],
      sandbox: {root: '', launcher: ''},
      adoptSuggestions: [],
      adoptSignature: '',
      integrity: {loading: false, done: false, items: [], issues: 0, checkedAt: ''}
    };
  },
  computed: {
    adoptSummary() {
      return this.adoptSuggestions
        .slice(0, 4)
        .map((item) => `${item.label} ${item.version || ''}`.trim())
        .join('、');
    },
    cpuColor() {
      if (this.cpuUsage < 70) return '#10b981';
      if (this.cpuUsage < 90) return '#f59e0b';
      return '#ef4444';
    },
    memoryColor() {
      if (this.memoryUsage < 70) return '#10b981';
      if (this.memoryUsage < 90) return '#f59e0b';
      return '#ef4444';
    },
    greeting() {
      const h = new Date().getHours();
      if (h < 5) return '夜深了';
      if (h < 11) return '早上好';
      if (h < 14) return '中午好';
      if (h < 18) return '下午好';
      return '晚上好';
    }
  },
  mounted() {
    this.initUserInfo();
    this.updateDateTime();
    setInterval(() => this.updateDateTime(), 1000);
    this.loadEnvData();
    this.loadSandbox();
    this.loadLogs();
    this.startStatsRefresh();
    this.listenEvents();
    this.checkAdoptSuggestions();
  },
  methods: {
    async checkAdoptSuggestions() {
      if (!window.electronAPI || !window.electronAPI.detectExistingInstalls) return;
      try {
        const dismissed = localStorage.getItem('adopt_dismissed') || '';
        const r = await window.electronAPI.detectExistingInstalls();
        if (!r || !r.success) return;
        const pending = (r.data || []).filter((item) => !item.registered);
        if (!pending.length) return;
        const signature = pending.map((item) => `${item.tool}:${item.version}:${item.dir}`).sort().join('|');
        if (dismissed === signature) return;
        this.adoptSignature = signature;
        this.adoptSuggestions = pending;
      } catch (err) {
        console.error('扫描已有环境失败', err);
      }
    },
    goAdopt() {
      const first = this.adoptSuggestions[0];
      if (!first) return;
      this.$emit('select-tool', first.tool);
      const tool = first.tool;
      setTimeout(() => eventBus.emit('adopt:open', tool), 260);
    },
    dismissAdopt() {
      if (this.adoptSignature) localStorage.setItem('adopt_dismissed', this.adoptSignature);
      this.adoptSuggestions = [];
    },
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
    openVersionManager() { Lemon.info('版本管理器还在打磨，很快就来啦～'); },
    async loadSandbox() {
      if (!window.electronAPI || !window.electronAPI.getSandboxInfo) return;
      try {
        const res = await window.electronAPI.getSandboxInfo();
        if (res.success) this.sandbox = { root: res.data.root, launcher: res.data.launcher };
      } catch (err) { /* 沙箱信息读取失败不影响仪表盘 */ }
    },
    async openEnvTerminal() {
      eventBus.emit('terminal:open');
      this.addLog('已打开内置终端');
    },
    async openSandboxRoot() {
      if (!window.electronAPI) return;
      await window.electronAPI.openSandboxRoot();
    },
    async copyEnvCommand() {
      if (!window.electronAPI) return;
      const res = await window.electronAPI.getSandboxEnvCommand('all');
      const text = res && res.success ? res.data : '';
      if (!text) { Lemon.info('还没有装过工具，暂时没有命令可以抄给你～'); return; }
      try {
        await navigator.clipboard.writeText(text);
        this.addLog('已复制环境命令，粘到 cmd 里即可临时生效');
        Lemon.success('命令已经复制到剪贴板啦～');
      } catch (err) { Lemon.error(`复制没成功，手动抄一下：${text}`); }
    },
    async runIntegrityCheck() {
      if (this.integrity.loading) return;
      const api = window.electronAPI;
      if (!api || !api.checkIntegrity) { Lemon.error('当前版本还不支持体检，先更新一下～'); return; }
      this.integrity.loading = true;
      this.integrity.done = false;
      const startedAt = Date.now();
      try {
        const result = await api.checkIntegrity();
        const elapsed = Date.now() - startedAt;
        if (elapsed < 1200) await new Promise(resolve => setTimeout(resolve, 1200 - elapsed));
        if (!result || !result.success) {
          Lemon.error((result && result.message) || '体检没做成，要不再来一次？');
          return;
        }
        this.integrity.items = result.items || [];
        this.integrity.issues = result.issues || 0;
        this.integrity.checkedAt = result.checkedAt || '';
        this.integrity.done = true;
        if (!this.integrity.items.length) Lemon.info('沙箱里还没有安装任何环境，先去装一个吧～');
        else if (!this.integrity.issues) Lemon.success('主人，所有环境都非常健康哦～');
        else Lemon.error(`有 ${this.integrity.issues} 个环境缺文件，我给你标红了～`);
        this.addLog(`体检完成：${this.integrity.items.length} 个环境，异常 ${this.integrity.issues} 个`, this.integrity.issues > 0);
      } catch (err) {
        Lemon.error(`体检失败了：${err.message}`);
      } finally {
        this.integrity.loading = false;
      }
    },
    fixEnv(item) {
      this.addLog(`准备重新安装 ${item.label} ${item.version}`, true);
      this.$emit('install', item.tool);
    },
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
      this._unsubs = [];
      eventBus.on('install:end', () => { this.refreshAll(); });
      if (window.electronAPI) {
        this._unsubs.push(window.electronAPI.onJDKChanged?.(() => this.refreshAll()));
        this._unsubs.push(window.electronAPI.onPythonChanged?.(() => this.refreshAll()));
        this._unsubs.push(window.electronAPI.onMySQLChanged?.(() => this.refreshAll()));
        this._unsubs.push(window.electronAPI.onRedisChanged?.(() => this.refreshAll()));
        this._unsubs.push(window.electronAPI.onMavenChanged?.(() => this.refreshAll()));
        this._unsubs.push(window.electronAPI.onSandboxChanged?.(() => { this.loadSandbox(); this.refreshAll(); }));
      }
    }
  },
  unmounted() {
    (this._unsubs || []).forEach((u) => { try { u && u(); } catch (e) {} });
  }
};
</script>

<style scoped>
.dashboard {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding-right: 4px;
}

.dashboard > * {
  flex: 0 0 auto;
}

/* ── Hero Banner ── */
.hero-banner {
  position: relative;
  border-radius: 20px;
  padding: 26px 28px;
  overflow: hidden;
  background:
    radial-gradient(120% 140% at 88% -20%, rgba(94, 234, 212, 0.55) 0%, rgba(94, 234, 212, 0) 58%),
    linear-gradient(122deg, #0f766e 0%, #0d9488 42%, #14b8a6 100%);
  box-shadow:
    0 18px 40px -18px rgba(13, 148, 136, 0.65),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.hero-blobs {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.hero-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(52px);
  opacity: 0.4;
  background: rgba(255, 255, 255, 0.55);
  animation: blobFloat 12s ease-in-out infinite alternate;
}

.blob-1 { width: 240px; height: 240px; top: -90px; right: -50px; }
.blob-2 { width: 180px; height: 180px; bottom: -90px; left: 14%; animation-delay: -4s; background: rgba(255, 255, 255, 0.32); }
.blob-3 { width: 140px; height: 140px; top: 18%; left: 46%; animation-delay: -8s; background: rgba(255, 255, 255, 0.24); }

@keyframes blobFloat {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-26px, 22px, 0) scale(1.12); }
}

.welcome-section {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.welcome-lemon {
  position: relative;
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  margin-right: 6px;
}

.welcome-lemon::after {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0) 68%);
  animation: lemonHalo 3.4s ease-in-out infinite;
}

.welcome-lemon img {
  position: relative;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid #FFFFFF;
  background: #FDFBF4;
  box-shadow: 0 12px 26px rgba(2, 44, 40, 0.28);
  animation: lemonFloat 4.2s ease-in-out infinite;
}

@keyframes lemonFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@keyframes lemonHalo {
  0%, 100% { opacity: 0.55; transform: scale(0.96); }
  50% { opacity: 0.95; transform: scale(1.06); }
}

.welcome-text h1 {
  margin: 0;
  font-size: 1.7rem;
  font-weight: 800;
  letter-spacing: -0.6px;
  color: #ffffff;
  text-shadow: 0 2px 18px rgba(2, 44, 40, 0.35);
}

.welcome-text p {
  margin: 6px 0 0;
  font-size: 0.85rem;
  font-weight: 500;
  color: rgba(236, 254, 255, 0.82);
  letter-spacing: 0.2px;
}

/* ── Stat cards ── */
.stats-cards {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 176px;
  padding: 12px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(255, 255, 255, 0.28);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.28);
  transition: transform var(--transition-fast), background-color var(--transition-fast);
}

.stat-card:hover {
  transform: translateY(-2px);
  background: rgba(255, 255, 255, 0.22);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  border-radius: 11px;
  color: #ecfeff;
  background: rgba(6, 78, 74, 0.32);
  border: 1px solid rgba(255, 255, 255, 0.22);
}

.cpu-icon { color: #a5f3fc; }
.memory-icon { color: #bbf7d0; }

.stat-body {
  flex: 1;
  min-width: 0;
}

.stat-title {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(236, 254, 255, 0.75);
}

.stat-value {
  font-family: var(--font-mono);
  font-size: 1.28rem;
  font-weight: 700;
  line-height: 1.25;
  color: #ffffff;
  font-variant-numeric: tabular-nums;
}

.progress-bar {
  height: 4px;
  margin-top: 7px;
  border-radius: 999px;
  background: rgba(6, 78, 74, 0.28);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 600ms cubic-bezier(0.4, 0, 0.2, 1), background-color 400ms ease;
}

/* ── Adopt banner ── */
.adopt-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  margin-bottom: 18px;
  border-radius: 18px;
  background: var(--bg-card);
  background-image: var(--glass-sheen);
  border: 1px solid color-mix(in srgb, var(--primary) 32%, transparent);
  box-shadow: var(--glass-edge), var(--glass-shadow);
  animation: fadeUp 420ms ease both;
}

.adopt-banner-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--primary) 16%, transparent);
  color: var(--primary);
}

.adopt-banner-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.adopt-banner-text strong {
  font-size: 0.9rem;
  color: var(--text-primary);
}

.adopt-banner-text span {
  font-size: 0.78rem;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.adopt-banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.adopt-go {
  background: var(--primary);
  color: #fff;
  border: none;
  cursor: pointer;
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  transition: all var(--transition-fast);
}

.adopt-go:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
}

.adopt-dismiss {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 0.78rem;
  padding: 8px 6px;
  transition: color var(--transition-fast);
}

.adopt-dismiss:hover {
  color: var(--text-secondary);
}

/* ── Section header ── */
.env-section,
.sandbox-section,
.checkup-section {
  border-radius: 18px;
  background: var(--bg-card);
  background-image: var(--glass-sheen);
  border: 1px solid var(--border-light);
  box-shadow: var(--glass-edge), var(--glass-shadow);
  padding: 20px 22px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.section-header h2 {
  position: relative;
  margin: 0;
  padding-left: 12px;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: -0.2px;
  color: var(--text-primary);
}

.section-header h2::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 15px;
  border-radius: 999px;
  background: linear-gradient(180deg, #2dd4bf, #0d9488);
}

.refresh-all-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: 999px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.refresh-all-btn:hover:not(:disabled) {
  color: var(--primary);
  border-color: var(--primary-light);
  transform: translateY(-1px);
}

.refresh-all-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.spinning {
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Environment grid ── */
.env-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}

.env-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  box-shadow: inset 0 1px 0 var(--glass-stroke);
  cursor: default;
  opacity: 0;
  animation: cardIn 420ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
  transition: transform var(--transition-base), box-shadow var(--transition-base), border-color var(--transition-base);
}

.env-card:hover {
  transform: translateY(-3px);
  border-color: var(--primary-light);
  box-shadow: var(--glass-shadow-hover);
}

.env-card.not-installed {
  cursor: pointer;
  background: var(--bg-hover);
  border-style: dashed;
}

.env-card.not-installed:hover {
  border-color: var(--primary);
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.env-card-header {
  display: flex;
  align-items: center;
  gap: 9px;
}

.env-icon {
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  object-fit: contain;
  filter: drop-shadow(0 3px 8px rgba(15, 23, 42, 0.18));
}

.env-name {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.env-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: auto;
  flex: 0 0 8px;
}

.env-status-dot.running {
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16);
  animation: pulse 2.4s ease-in-out infinite;
}

.env-status-dot.stopped {
  background: var(--text-muted);
  opacity: 0.7;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.14); }
  50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, 0.06); }
}

.env-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 22px;
  flex-wrap: wrap;
}

.env-version {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--primary);
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--primary-glow);
  font-variant-numeric: tabular-nums;
}

.env-service {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 999px;
}

.env-service.running {
  color: #16a34a;
  background: rgba(34, 197, 94, 0.14);
}

.env-service.stopped {
  color: var(--text-muted);
  background: var(--bg-hover);
}

.env-not-installed {
  font-size: 0.76rem;
  font-weight: 500;
  color: var(--text-muted);
}

.env-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 27px;
  min-width: 27px;
  padding: 0 8px;
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-hover);
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.action-btn:hover {
  color: var(--text-primary);
  background: var(--bg-input);
  border-color: var(--border-light);
  transform: translateY(-1px);
}

.service-btn.running {
  color: #16a34a;
  background: rgba(34, 197, 94, 0.14);
}

.install-btn {
  color: var(--primary);
  background: var(--primary-glow);
}

.install-btn:hover {
  color: #ffffff;
  background: var(--primary);
  border-color: var(--primary);
}

.delete-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.3);
}

/* ── Sandbox ── */
.sandbox-badge {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--primary);
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--primary-glow);
  border: 1px solid var(--primary-light);
}

.sandbox-card {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
}

.sandbox-main {
  flex: 1;
  min-width: 260px;
}

.sandbox-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.sandbox-path {
  margin-top: 5px;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--text-primary);
  word-break: break-all;
}

.sandbox-hint {
  margin-top: 6px;
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.sandbox-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sandbox-btn {
  height: 32px;
  padding: 0 14px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 9px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.sandbox-btn:hover {
  color: var(--text-primary);
  border-color: var(--primary-light);
  transform: translateY(-1px);
}

.sandbox-btn.primary {
  color: #ffffff;
  background: linear-gradient(135deg, #14b8a6, #0d9488);
  border-color: transparent;
  box-shadow: 0 8px 18px -8px rgba(13, 148, 136, 0.75);
}

.sandbox-btn.primary:hover {
  box-shadow: 0 10px 22px -8px rgba(13, 148, 136, 0.9);
}

/* ── Integrity check ── */
.checkup-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 15px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #ffffff;
  background: linear-gradient(135deg, #14b8a6, #0d9488);
  border: 1px solid transparent;
  border-radius: 9px;
  cursor: pointer;
  box-shadow: 0 8px 18px -8px rgba(13, 148, 136, 0.75);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), opacity var(--transition-fast);
}

.checkup-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px -8px rgba(13, 148, 136, 0.9);
}

.checkup-btn:disabled {
  opacity: 0.72;
  cursor: default;
}

.checkup-btn-icon {
  display: inline-flex;
  font-size: 0.95rem;
  line-height: 1;
}

.checkup-btn-icon.spinning {
  animation: checkupSpin 1.1s linear infinite;
}

@keyframes checkupSpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.checkup-card {
  margin-top: 14px;
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--glass-tint-soft);
  border: 1px solid var(--glass-stroke);
  box-shadow: var(--glass-edge);
}

.checkup-placeholder p {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.checkup-scanning {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.checkup-scanning p {
  margin: 0;
  font-size: 0.84rem;
  color: var(--text-secondary);
}

.checkup-scan-bar {
  position: relative;
  height: 4px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--primary) 14%, transparent);
}

.checkup-scan-bar span {
  position: absolute;
  top: 0;
  left: -40%;
  width: 40%;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, var(--primary), transparent);
  animation: checkupScan 1.15s ease-in-out infinite;
}

@keyframes checkupScan {
  from { left: -40%; }
  to { left: 100%; }
}

.checkup-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkup-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--primary) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 16%, transparent);
  font-size: 0.84rem;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

.checkup-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px -12px rgba(15, 23, 42, 0.6);
}

.checkup-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 3px color-mix(in srgb, #10b981 22%, transparent);
}

.checkup-name {
  font-weight: 600;
  color: var(--text-primary);
}

.checkup-state {
  margin-left: auto;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.checkup-item.broken {
  background: color-mix(in srgb, #ef4444 7%, transparent);
  border-color: color-mix(in srgb, #ef4444 28%, transparent);
}

.checkup-item.broken .checkup-dot {
  background: #ef4444;
  box-shadow: 0 0 0 3px color-mix(in srgb, #ef4444 22%, transparent);
}

.checkup-item.broken .checkup-name,
.checkup-item.broken .checkup-state {
  color: #ef4444;
}

.checkup-fix {
  height: 26px;
  padding: 0 12px;
  font-size: 0.76rem;
  font-weight: 600;
  color: #ef4444;
  background: color-mix(in srgb, #ef4444 10%, transparent);
  border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.checkup-fix:hover {
  color: #ffffff;
  background: #ef4444;
  border-color: #ef4444;
}

@media (max-width: 720px) {
  .hero-banner {
    padding: 20px;
  }

  .env-grid {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  }

  .checkup-item {
    flex-wrap: wrap;
  }

  .checkup-state {
    margin-left: 18px;
    width: 100%;
  }
}
</style>
