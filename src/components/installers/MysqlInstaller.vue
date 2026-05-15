<template>
  <div class="installer">
    <div class="installer-header">
      <img :src="MysqlIcon" class="tool-icon" alt=""/>
      <div>
        <h3>MySQL 安装</h3>
        <p class="installer-desc">MySQL 关系型数据库 — 数据存储与管理</p>
      </div>
    </div>

    <div class="mode-segment">
      <button :class="{ active: activeMode === 'online' }" @click="switchMode('online')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/></svg>
        联网下载
      </button>
      <button :class="{ active: activeMode === 'local' }" @click="switchMode('local')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        手动导入
      </button>
    </div>

    <div v-if="activeMode === 'online'">
      <div class="version-grid">
        <button v-for="v in versionOptions" :key="v.value" class="version-chip" :class="{ selected: selectedVersion === v.value }" @click="selectedVersion = v.value">
          <span class="chip-label">{{ v.label }}</span>
          <span v-if="v.recommended" class="chip-badge">推荐</span>
        </button>
      </div>
      <p class="version-hint">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span v-if="selectedVersion === '5.7'">经典稳定，适合老旧项目</span>
        <span v-else-if="selectedVersion === '8.0'">官方推荐，性能最优，广泛使用</span>
        <span v-else>最新版本，体验新特性</span>
      </p>
      <div class="path-display">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>{{ installPath }}</span>
      </div>
      <div class="config-row">
        <label>root 密码</label>
        <div class="password-wrap">
          <input :type="showPassword ? 'text' : 'password'" v-model="password" placeholder="留空则无密码"/>
          <button type="button" @click="showPassword = !showPassword" class="toggle-pw">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>

      <div v-if="installing" class="progress-card">
        <div class="progress-header"><span class="progress-phase">{{ downloading ? '下载中' : '安装中' }}</span><span class="progress-stage">{{ currentStage }}</span></div>
        <div class="progress-track"><div class="progress-bar" :style="{ width: progressPercent + '%' }"></div></div>
        <span class="progress-pct">{{ Math.round(progressPercent) }}%</span>
        <div class="step-list">
          <div v-for="(step, idx) in installSteps" :key="idx" class="step done"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>{{ step }}</span></div>
          <div v-if="currentStage && !installSteps.includes(getStepLabel(currentStage))" class="step active"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span>{{ getStepLabel(currentStage) }}</span></div>
        </div>
      </div>

      <div class="action-row">
        <button @click="installMySQL" :disabled="installing" class="btn-primary">
          <svg v-if="!installing" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {{ installing ? (downloading ? '下载中...' : '安装中...') : '开始安装' }}
        </button>
        <button v-if="downloading" @click="cancelDownload" class="btn-cancel">取消下载</button>
      </div>
    </div>

    <div v-else>
      <div class="version-grid">
        <button v-for="v in versionOptions" :key="v.value" class="version-chip" :class="{ selected: localVersion === v.value }" @click="localVersion = v.value">
          <span class="chip-label">{{ v.label }}</span>
          <span v-if="v.recommended" class="chip-badge">推荐</span>
        </button>
      </div>
      <button @click="importLocalMySQL" class="import-zone">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>{{ localFilePath ? '重新选择' : '选择 MySQL 压缩包' }}</span>
      </button>
      <div v-if="localFilePath" class="path-display success">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>{{ localFilePath }}</span>
      </div>
      <div class="config-row">
        <label>root 密码</label>
        <div class="password-wrap">
          <input :type="showPassword ? 'text' : 'password'" v-model="password" placeholder="留空则无密码"/>
          <button type="button" @click="showPassword = !showPassword" class="toggle-pw">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <div class="path-display">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>{{ localInstallPath }}</span>
      </div>
      <div v-if="dirExistsWarning" class="warn-banner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        安装目录已存在文件，请删除或选择其他版本。
      </div>

      <div v-if="installing" class="progress-card">
        <div class="progress-header"><span class="progress-phase">安装中</span><span class="progress-stage">{{ currentStage }}</span></div>
        <div class="progress-track"><div class="progress-bar" :style="{ width: progressPercent + '%' }"></div></div>
        <span class="progress-pct">{{ Math.round(progressPercent) }}%</span>
        <div class="step-list">
          <div v-for="(step, idx) in installSteps" :key="idx" class="step done"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>{{ step }}</span></div>
          <div v-if="currentStage && !installSteps.includes(getStepLabel(currentStage))" class="step active"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span>{{ getStepLabel(currentStage) }}</span></div>
        </div>
      </div>

      <div class="action-row">
        <button @click="installFromLocal" :disabled="installing || !localFilePath || dirExistsWarning" class="btn-primary">
          <svg v-if="!installing" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {{ installing ? '安装中...' : '开始安装' }}
        </button>
      </div>
    </div>

    <!-- Service Panel -->
    <div v-if="currentVersion && serviceStatus" class="service-panel">
      <div class="service-header">
        <h4>服务管理 — MySQL {{ currentVersion }}</h4>
        <span class="service-badge" :class="serviceStatus">{{ serviceStatusText }}</span>
      </div>
      <div class="service-actions">
        <button @click="startService" :disabled="serviceActionLoading" class="svc-btn start">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> 启动
        </button>
        <button @click="stopService" :disabled="serviceActionLoading" class="svc-btn stop">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg> 停止
        </button>
        <button @click="restartService" :disabled="serviceActionLoading" class="svc-btn restart">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg> 重启
        </button>
        <button @click="showChangePasswordModal = true" class="svc-btn password">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg> 密码
        </button>
      </div>
    </div>

    <div class="status-bar" :class="{ success: status.includes('成功'), error: status.includes('失败') || status.includes('错误') }">
      <svg v-if="status.includes('成功')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <svg v-else-if="status.includes('失败') || status.includes('错误')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <span>{{ status }}</span>
    </div>

    <!-- Password Modal -->
    <div v-if="showChangePasswordModal" class="modal-overlay" @click.self="closeModal">
      <div class="modal-card">
        <h4>修改 MySQL root 密码</h4>
        <div class="modal-field">
          <label>旧密码（若无则留空）</label>
          <input type="password" v-model="oldPassword"/>
        </div>
        <div class="modal-field">
          <label>新密码</label>
          <input type="password" v-model="newPassword"/>
        </div>
        <div class="modal-buttons">
          <button @click="changePassword" :disabled="passwordChanging" class="btn-primary">确认修改</button>
          <button @click="closeModal" class="btn-cancel">取消</button>
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
      installing: false, downloading: false,
      status: '未安装', currentStage: '', installSteps: [],
      showProgress: false, progressPercent: 0,
      localFilePath: '', localVersion: '8.0', dirExistsWarning: false,
      password: '', showPassword: false,
      currentVersion: null, serviceStatus: null, serviceActionLoading: false,
      showChangePasswordModal: false, oldPassword: '', newPassword: '', passwordChanging: false
    };
  },
  computed: {
    installPath() { return `C:\\Program Files\\muling\\muling-env-box\\MySQL\\mysql-${this.selectedVersion}`; },
    localInstallPath() { return `C:\\Program Files\\muling\\muling-env-box\\MySQL\\mysql-${this.localVersion}`; },
    serviceStatusText() { const m = {running:'运行中',stopped:'已停止','not installed':'未安装',unknown:'未知'}; return m[this.serviceStatus] || this.serviceStatus; }
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onMySQLProgress((data) => {
        if (data.type === 'mysql' && data.version === (this.activeMode === 'online' ? this.selectedVersion : this.localVersion)) {
          this.progressPercent = data.progress * 100;
          if (data.stage) { this.currentStage = data.stage; const sl = this.getStepLabel(data.stage); if (sl && !this.installSteps.includes(sl)) this.installSteps.push(sl); }
          if (data.progress === 1) { this.status = 'MySQL 安装成功'; setTimeout(() => { this.showProgress = false; }, 1500); }
        }
      });
      window.electronAPI.onMySQLChanged(() => { this.refreshServiceStatus(); });
    }
  },
  methods: {
    getStepLabel(stage) { const m = {'下载安装包':'下载 MySQL 安装包','解压中':'解压安装包','初始化配置':'生成配置文件','初始化数据目录':'初始化数据目录','安装服务':'注册 Windows 服务','启动服务':'启动 MySQL 服务','设置 root 密码':'设置 root 密码','配置环境变量':'配置系统环境变量','安装完成':'安装完成'}; return m[stage] || stage; },
    switchMode(mode) { this.activeMode = mode; if (mode === 'local') { this.localFilePath = ''; this.localVersion = '8.0'; this.dirExistsWarning = false; } },
    cancelDownload() { if (window.electronAPI && window.electronAPI.cancelMySQLDownload) { window.electronAPI.cancelMySQLDownload(); this.status = '已取消下载'; this.downloading = false; this.showProgress = false; } },
    installMySQL() {
      if (this.installing) return;
      this.installing = true; this.showProgress = true; this.progressPercent = 0; this.currentStage = ''; this.installSteps = []; this.status = '准备安装...';
      eventBus.emit('install:start'); this.downloading = true;
      window.electronAPI.installMySQL(this.selectedVersion, this.password).then((result) => {
        if (result.success) { this.status = `MySQL 安装成功 — ${result.message}`; this.currentVersion = this.selectedVersion; this.$emit('installed'); this.refreshServiceStatus(); setTimeout(() => { this.showProgress = false; }, 2000); }
        else { this.status = `安装失败：${result.message}`; this.showProgress = false; }
      }).catch((err) => { this.status = err.message && err.message.includes('canceled') ? '下载已取消' : `安装失败：${err.message}`; this.showProgress = false; })
      .finally(() => { this.installing = false; this.downloading = false; eventBus.emit('install:end'); });
    },
    async importLocalMySQL() {
      const filePath = await window.electronAPI.openFileDialog({ title: '选择 MySQL 安装包', filters: [{name:'MySQL 安装包',extensions:['zip']},{name:'所有文件',extensions:['*']}] });
      if (!filePath) return;
      this.localFilePath = filePath; this.status = `已选择文件：${filePath}`;
      if (!this.localVersion) { this.status = '导入失败：请选择版本。'; this.localFilePath = ''; return; }
      this.installing = true; this.showProgress = false; this.status = '正在导入 MySQL 安装包...'; eventBus.emit('install:start');
      try {
        const result = await window.electronAPI.importLocalMySQL(filePath);
        if (result.success) { this.status = `${result.message}，请点击"开始安装"完成配置。`; await this.validateLocalVersion(); }
        else { this.status = `导入失败：${result.message}`; this.localFilePath = ''; }
      } catch (err) { this.status = `导入失败：${err.message}`; this.localFilePath = ''; }
      finally { this.installing = false; eventBus.emit('install:end'); }
    },
    async validateLocalVersion() { if (!this.localFilePath) return; try { const exists = await window.electronAPI.checkPathExists(this.localInstallPath); this.dirExistsWarning = exists; this.status = exists ? '安装目录已存在文件。' : '安装目录可用。'; } catch { this.dirExistsWarning = false; } },
    async installFromLocal() {
      if (this.installing || this.dirExistsWarning) return;
      this.installing = true; this.showProgress = true; this.progressPercent = 0; this.currentStage = ''; this.installSteps = []; this.status = '正在安装...';
      eventBus.emit('install:start');
      try {
        const result = await window.electronAPI.installFromLocalMySQL(this.localVersion, this.password);
        if (result.success) { this.status = `MySQL 安装成功 — ${result.message}`; this.currentVersion = this.localVersion; this.$emit('installed'); await this.refreshServiceStatus(); setTimeout(()=>{this.showProgress=false;},2000); this.localFilePath=''; this.dirExistsWarning=false; }
        else { this.status = `安装失败：${result.message}`; this.showProgress = false; }
      } catch (err) { this.status = `安装失败：${err.message}`; this.showProgress = false; }
      finally { this.installing = false; eventBus.emit('install:end'); }
    },
    async refreshServiceStatus() { if (!this.currentVersion) return; try { const r = await window.electronAPI.getMySQLServiceStatus(this.currentVersion); this.serviceStatus = r.success ? r.status : 'unknown'; } catch { this.serviceStatus = 'unknown'; } },
    async startService() { if (this.serviceActionLoading) return; this.serviceActionLoading = true; try { const r = await window.electronAPI.startMySQLService(this.currentVersion); if (r.success) { this.status = `MySQL ${r.message}`; await this.refreshServiceStatus(); } else { this.status = `启动失败：${r.message}`; } } catch (err) { this.status = `启动失败：${err.message}`; } finally { this.serviceActionLoading = false; } },
    async stopService() { if (this.serviceActionLoading) return; this.serviceActionLoading = true; try { const r = await window.electronAPI.stopMySQLService(this.currentVersion); if (r.success) { this.status = `MySQL ${r.message}`; await this.refreshServiceStatus(); } else { this.status = `停止失败：${r.message}`; } } catch (err) { this.status = `停止失败：${err.message}`; } finally { this.serviceActionLoading = false; } },
    async restartService() { if (this.serviceActionLoading) return; this.serviceActionLoading = true; try { const r = await window.electronAPI.restartMySQLService(this.currentVersion); if (r.success) { this.status = `MySQL ${r.message}`; await this.refreshServiceStatus(); } else { this.status = `重启失败：${r.message}`; } } catch (err) { this.status = `重启失败：${err.message}`; } finally { this.serviceActionLoading = false; } },
    async changePassword() { if (this.passwordChanging) return; this.passwordChanging = true; try { const r = await window.electronAPI.changeMySQLPassword(this.currentVersion, this.oldPassword, this.newPassword); if (r.success) { this.status = `MySQL ${r.message}`; this.closeModal(); } else { this.status = `修改密码失败：${r.message}`; } } catch (err) { this.status = `修改密码失败：${err.message}`; } finally { this.passwordChanging = false; } },
    closeModal() { this.showChangePasswordModal = false; this.oldPassword = ''; this.newPassword = ''; }
  }
};
</script>

<style scoped>
.installer { display: flex; flex-direction: column; gap: var(--space-5); }
.installer-header { display: flex; align-items: center; gap: var(--space-3); }
.tool-icon { width: 36px; height: 36px; object-fit: contain; }
.installer-header h3 { font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin: 0; }
.installer-desc { font-size: 0.78rem; color: var(--text-muted); margin: 1px 0 0; }

.mode-segment { display: flex; background: var(--bg-secondary); border-radius: var(--radius-md); padding: 3px; gap: 3px; }
.mode-segment button { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:9px 12px; border-radius:var(--radius-sm); border:none; cursor:pointer; font-size:0.85rem; font-weight:500; color:var(--text-secondary); background:transparent; transition:all var(--transition-fast); }
.mode-segment button.active { background:var(--bg-card); color:var(--text-primary); box-shadow:var(--shadow-xs); font-weight:600; }
.mode-segment button:hover:not(.active) { color:var(--text-primary); }

.version-grid { display:flex; gap:8px; }
.version-chip { display:flex; align-items:center; gap:5px; padding:7px 14px; border-radius:var(--radius-full); border:1px solid var(--border-light); background:var(--bg-card); cursor:pointer; font-size:0.85rem; font-weight:500; color:var(--text-secondary); transition:all var(--transition-fast); }
.version-chip:hover { border-color:var(--primary); color:var(--text-primary); }
.version-chip.selected { border-color:var(--primary); background:var(--primary-light); color:var(--primary-dark); font-weight:600; }
.chip-badge { font-size:0.62rem; background:var(--accent); color:white; padding:1px 5px; border-radius:8px; font-weight:700; }

.version-hint { display:flex; align-items:center; gap:5px; font-size:0.78rem; color:var(--text-muted); margin-top:8px; }
.version-hint svg { flex-shrink:0; color:var(--primary); }

.path-display { display:flex; align-items:center; gap:8px; padding:9px 12px; background:var(--bg-secondary); border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.75rem; color:var(--text-secondary); }
.path-display.success { background:var(--success-bg); color:var(--success-text); }

.config-row { display:flex; align-items:center; gap:var(--space-2); }
.config-row label { font-size:0.85rem; color:var(--text-secondary); font-weight:500; white-space:nowrap; }
.password-wrap { display:flex; gap:4px; flex:1; }
.password-wrap input { flex:1; padding:7px 10px; border:1px solid var(--border-light); border-radius:var(--radius-sm); background:var(--bg-input); color:var(--text-primary); font-family:var(--font-mono); font-size:0.9rem; }
.password-wrap input:focus { outline:none; border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-light); }
.toggle-pw { display:flex; align-items:center; justify-content:center; width:36px; border:1px solid var(--border-light); border-radius:var(--radius-sm); background:var(--bg-secondary); cursor:pointer; color:var(--text-muted); transition:all var(--transition-fast); }
.toggle-pw:hover { color:var(--text-primary); background:var(--bg-hover); }

.warn-banner { display:flex; align-items:center; gap:8px; padding:10px 14px; background:var(--danger-bg); color:var(--danger-text); border-radius:var(--radius-md); font-size:0.82rem; font-weight:500; }

.progress-card { background:var(--bg-secondary); border-radius:var(--radius-lg); padding:var(--space-4); border:1px solid var(--border-light); }
.progress-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.progress-phase { font-size:0.88rem; font-weight:700; color:var(--primary); }
.progress-stage { font-size:0.78rem; color:var(--text-muted); }
.progress-track { width:100%; height:6px; background:var(--border-light); border-radius:3px; overflow:hidden; margin-bottom:6px; }
.progress-bar { height:100%; border-radius:3px; background:linear-gradient(90deg, var(--primary), #2dd4bf); background-size:200% 100%; animation:shimmer 1.5s linear infinite; transition:width 0.3s ease; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.progress-pct { font-size:0.8rem; font-weight:600; color:var(--text-secondary); display:block; margin-bottom:10px; }

.step-list { display:flex; flex-direction:column; gap:4px; }
.step { display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:var(--radius-sm); font-size:0.82rem; }
.step.done { color:var(--text-secondary); }
.step.done svg { color:var(--success); }
.step.active { color:var(--primary); font-weight:600; background:var(--primary-light); }
.spin-icon { animation:spin 2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.import-zone { width:100%; display:flex; align-items:center; justify-content:center; gap:var(--space-3); padding:18px; border:2px dashed var(--border-medium); border-radius:var(--radius-lg); background:var(--bg-secondary); cursor:pointer; color:var(--text-secondary); font-size:0.9rem; font-weight:500; transition:all var(--transition-fast); }
.import-zone:hover { border-color:var(--primary); color:var(--primary); background:var(--primary-light); }

.action-row { display:flex; gap:var(--space-2); }
.btn-primary { flex:1; display:flex; align-items:center; justify-content:center; gap:var(--space-2); padding:12px; border-radius:var(--radius-md); border:none; cursor:pointer; font-size:0.95rem; font-weight:700; color:white; background:linear-gradient(135deg, var(--primary), var(--primary-hover)); transition:all var(--transition-fast); box-shadow:var(--shadow-sm); }
.btn-primary:hover:not(:disabled) { box-shadow:var(--shadow-md); transform:translateY(-1px); }
.btn-primary:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
.btn-cancel { padding:12px 20px; border-radius:var(--radius-md); border:1px solid var(--border-light); cursor:pointer; font-size:0.9rem; font-weight:600; color:var(--text-secondary); background:var(--bg-card); transition:all var(--transition-fast); }
.btn-cancel:hover { background:var(--danger-bg); color:var(--danger-text); border-color:var(--danger-border); }

.status-bar { display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:var(--radius-md); background:var(--bg-secondary); color:var(--text-secondary); font-size:0.85rem; font-weight:500; }
.status-bar.success { background:var(--success-bg); color:var(--success-text); }
.status-bar.error { background:var(--danger-bg); color:var(--danger-text); }

/* Service Panel */
.service-panel { background:var(--bg-secondary); border-radius:var(--radius-lg); padding:var(--space-4); border:1px solid var(--border-light); }
.service-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.service-header h4 { font-size:0.95rem; font-weight:700; color:var(--text-primary); margin:0; }
.service-badge { font-size:0.72rem; padding:3px 10px; border-radius:var(--radius-full); font-weight:600; }
.service-badge.running { background:var(--success-bg); color:var(--success-text); }
.service-badge.stopped { background:var(--bg-hover); color:var(--text-muted); }
.service-actions { display:flex; gap:8px; flex-wrap:wrap; }
.svc-btn { display:flex; align-items:center; gap:5px; padding:7px 14px; border-radius:var(--radius-full); border:none; cursor:pointer; font-size:0.78rem; font-weight:600; transition:all var(--transition-fast); }
.svc-btn.start { background:var(--success-bg); color:var(--success-text); }
.svc-btn.stop { background:var(--danger-bg); color:var(--danger-text); }
.svc-btn.restart { background:var(--warning-bg); color:var(--warning-text); }
.svc-btn.password { background:var(--info-bg); color:var(--info-text); }
.svc-btn:hover:not(:disabled) { filter:brightness(0.93); }
.svc-btn:disabled { opacity:0.4; cursor:not-allowed; }

/* Modal */
.modal-overlay { position:fixed; top:0; left:0; right:0; bottom:0; background:var(--overlay-bg); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:2000; }
.modal-card { background:var(--bg-modal); padding:var(--space-6); border-radius:var(--radius-xl); width:380px; box-shadow:var(--shadow-xl); border:1px solid var(--border-light); }
.modal-card h4 { margin-bottom:var(--space-4); font-size:1rem; font-weight:700; color:var(--text-primary); }
.modal-field { margin-bottom:var(--space-3); }
.modal-field label { display:block; margin-bottom:4px; font-size:0.85rem; font-weight:500; color:var(--text-secondary); }
.modal-field input { width:100%; padding:9px 12px; border:1px solid var(--border-light); border-radius:var(--radius-md); background:var(--bg-input); color:var(--text-primary); font-family:var(--font-mono); font-size:0.9rem; }
.modal-field input:focus { outline:none; border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-light); }
.modal-buttons { display:flex; gap:var(--space-3); margin-top:var(--space-5); }
</style>
