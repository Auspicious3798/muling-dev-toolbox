<template>
  <div class="installer">
    <div class="installer-header">
      <img :src="RedisIcon" class="tool-icon" alt=""/>
      <div>
        <h3>Redis 安装</h3>
        <p class="installer-desc">Redis 内存数据库 — 高性能缓存与消息队列</p>
      </div>
    </div>

    <div class="version-grid">
      <button v-for="v in versionOptions" :key="v.value" class="version-chip" :class="{ selected: selectedVersion === v.value }" @click="selectedVersion = v.value">
        <span class="chip-label">{{ v.label }}</span>
        <span v-if="v.recommended" class="chip-badge">推荐</span>
      </button>
    </div>
    <p class="version-hint">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span v-if="selectedVersion === '7.0'">官方推荐，稳定且性能优异</span>
      <span v-else-if="selectedVersion.startsWith('8.')">最新版本，体验新特性</span>
      <span v-else>成熟版本，兼容性好</span>
    </p>
    <div class="path-display">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span>{{ installPath }}</span>
    </div>

    <div class="config-row">
      <label>端口</label>
      <input type="number" v-model.number="port" placeholder="自动分配" @blur="checkPort"/>
      <span v-if="portChecking" class="port-status checking">检查中...</span>
      <span v-else-if="portAvailable === true" class="port-status available">端口可用</span>
      <span v-else-if="portAvailable === false" class="port-status unavailable">端口已占用</span>
    </div>
    <div class="config-row">
      <label>密码</label>
      <input type="password" v-model="password" placeholder="留空则无密码"/>
    </div>
    <div class="config-row">
      <label>最大内存</label>
      <input type="number" v-model.number="maxmemory" placeholder="例如 256 (MB)"/>
    </div>

    <div v-if="installing" class="progress-card">
      <div class="progress-header"><span class="progress-phase">{{ downloading ? '下载中' : '安装中' }}</span><span class="progress-stage">{{ currentStage }}</span></div>
      <div class="progress-track"><div class="progress-bar" :style="{ width: progressPercent + '%' }"></div></div>
      <div class="progress-stats">
        <span class="progress-pct">{{ Math.round(progressPercent) }}%</span>
        <span v-if="downloading && downloadSpeed > 0" class="progress-speed">{{ formatSpeed(downloadSpeed) }}</span>
        <span v-if="downloading && downloadEta !== null" class="progress-eta">剩余 {{ formatEta(downloadEta) }}</span>
        <span v-if="downloading && downloadTotal > 0" class="progress-size">{{ formatSize(downloadReceived) }} / {{ formatSize(downloadTotal) }}</span>
      </div>
      <div class="step-list">
        <div v-for="(step, idx) in installSteps" :key="idx" class="step done"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg><span>{{ step }}</span></div>
        <div v-if="currentStage && !installSteps.includes(getStepLabel(normalizeStage(currentStage)))" class="step active" :class="{ failed: status.includes('安装失败') }"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg><span>{{ getStepLabel(normalizeStage(currentStage)) }}</span></div>
      </div>
    </div>

    <div class="action-row">
      <button @click="installRedis" :disabled="installing || portAvailable === false" class="btn-primary">
        <svg v-if="!installing" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        {{ installing ? (downloading ? '下载中...' : '安装中...') : '开始安装' }}
      </button>
      <button v-if="downloading" @click="cancelDownload" class="btn-cancel">取消下载</button>
    </div>

    <div class="status-bar" :class="{ success: status.includes('成功'), error: status.includes('失败') || status.includes('错误') }">
      <svg v-if="status.includes('成功')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <svg v-else-if="status.includes('失败') || status.includes('错误')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <span>{{ status }}</span>
    </div>
    <div v-if="status.includes('安装失败')" class="log-toggle" @click="toggleInstallLog">{{ logVisible ? '收起安装日志' : '查看安装日志' }}</div>
    <pre v-if="logVisible" class="log-panel">{{ logLines.join('\n') }}</pre>
  </div>
</template>

<script>
import eventBus from '@/eventBus';
import Lemon from '@/utils/lemon';
import RedisIcon from '../../../public/icons/Redis.svg?url';
import { sandboxPath, loadSandboxRoot } from '@/utils/sandbox';

export default {
  name: 'RedisInstaller',
  data() {
    return {
      RedisIcon,
      selectedVersion: '7.0',
      versionOptions: [
        { value: '3.2', label: '3.2' }, { value: '4.0', label: '4.0' }, { value: '5.0', label: '5.0' },
        { value: '6.0', label: '6.0' }, { value: '6.2', label: '6.2' }, { value: '7.0', label: '7.0', recommended: true },
        { value: '7.2', label: '7.2' }, { value: '7.4', label: '7.4' },
        { value: '8.0', label: '8.0' }, { value: '8.2', label: '8.2' }, { value: '8.4', label: '8.4' }, { value: '8.6', label: '8.6' }
      ],
      installing: false, downloading: false, status: '未安装', currentStage: '', installSteps: [],
      progressPercent: 0, downloadSpeed: 0, downloadEta: null, downloadReceived: 0, downloadTotal: 0, logVisible: false, logLines: [],
      password: '', maxmemory: null,
      port: null, portChecking: false, portAvailable: null
    };
  },
  computed: {
    installPath() { return sandboxPath('redis', this.selectedVersion); }
  },
  mounted() {
    loadSandboxRoot();
    this._unsubs = [];
    if (window.electronAPI) {
      this._unsubs.push(window.electronAPI.onRedisProgress((data) => {
        if (data.type === 'redis' && data.version === this.selectedVersion) {
          this.progressPercent = data.progress * 100;
          if (typeof data.speed === 'number') { this.downloadSpeed = data.speed; }
          if (data.eta !== undefined) { this.downloadEta = data.eta; }
          if (typeof data.received === 'number') { this.downloadReceived = data.received; }
          if (typeof data.total === 'number') { this.downloadTotal = data.total; }
          if (data.stage) { this.currentStage = data.stage; const base = this.normalizeStage(data.stage); const sl = this.getStepLabel(base); if (sl && !this.installSteps.includes(sl)) this.installSteps.push(sl); }
        }
      }));
    } else { this.status = '错误：未连接到主进程'; }
  },
  unmounted() {
    (this._unsubs || []).forEach((u) => { try { u && u(); } catch (e) {} });
  },
  methods: {
    getStepLabel(stage) { const m = {'下载安装包':'下载 Redis 安装包','解压中':'解压安装包','生成配置':'生成 Redis 配置文件','加入沙箱环境':'加入沙箱环境'}; return m[stage] || stage; },
    formatSpeed(bps) { if (!bps || bps <= 0) return ''; if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'; return Math.max(1, Math.round(bps / 1024)) + ' KB/s'; },
    formatEta(seconds) { if (seconds === null || seconds === undefined) return ''; if (seconds >= 60) return Math.floor(seconds / 60) + '分' + (seconds % 60) + '秒'; return seconds + 's'; },
    formatSize(bytes) { const n = Number(bytes) || 0; if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'; if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'; if (n >= 1024) return Math.round(n / 1024) + ' KB'; return n + ' B'; },
    normalizeStage(stage) { return String(stage || '').split('·')[0].trim().replace(/\s*\d+%$/, ''); },
    async toggleInstallLog() {
      if (this.logVisible) { this.logVisible = false; return; }
      try {
        const r = await window.electronAPI.readInstallLog('redis');
        if (r && r.success) { this.logLines = r.lines; this.logVisible = true; }
        else { Lemon.error(r && r.message ? r.message : '没有读到安装日志'); }
      } catch (err) {
        Lemon.error('读取安装日志失败：' + err.message);
      }
    },
    cancelDownload() { if (window.electronAPI && window.electronAPI.cancelRedisDownload) { window.electronAPI.cancelRedisDownload(); this.status = '已取消下载'; this.downloading = false; } },
    async checkPort() { if (!this.port) { this.portAvailable = null; return; } if (this.port < 1 || this.port > 65535) { this.portAvailable = false; return; } this.portChecking = true; try { const r = await window.electronAPI.checkPort(this.port); this.portAvailable = r.available; } catch { this.portAvailable = false; } finally { this.portChecking = false; } },
    async installRedis() {
      if (this.installing) return;
      this.installing = true; this.progressPercent = 0; this.currentStage = ''; this.installSteps = []; this.status = '正在安装...'; eventBus.emit('install:start');
      try {
        this.downloading = true;
        const result = await window.electronAPI.installRedis(this.selectedVersion, this.password, this.maxmemory || 0, this.port || null);
        if (result.success) {
          this.status = `Redis 安装成功 — ${result.message}`;
          if (result.portChanged) Lemon.info(`默认端口 ${result.defaultPort} 被占用了，我已经帮你换到 ${result.port} 啦～`);
          else Lemon.success(`Redis ${this.selectedVersion} 已经在沙箱里跑起来啦，端口 ${result.port || ''}～`);
          this.$emit('installed');
        }
        else {
          this.status = `安装失败：${result.message}`;
          Lemon.error(`Redis 没装成：${result.message}`);
        }
      } catch (err) {
        if (err.message && err.message.includes('canceled')) {
          this.status = '下载已取消';
          Lemon.info('下载停下啦，随时可以再来～');
        } else {
          this.status = `安装失败：${err.message}`;
          Lemon.error(`Redis 没装成：${err.message}`);
        }
      }
      finally { this.installing = false; this.downloading = false; eventBus.emit('install:end'); }
    }
  }
};
</script>

<style scoped>
.installer { display: flex; flex-direction: column; gap: var(--space-5); }
.installer-header { display: flex; align-items: center; gap: var(--space-3); }
.tool-icon { width: 36px; height: 36px; object-fit: contain; }
.installer-header h3 { font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin: 0; }
.installer-desc { font-size: 0.78rem; color: var(--text-muted); margin: 1px 0 0; }

.version-grid { display:flex; gap:8px; flex-wrap:wrap; }
.version-chip { display:flex; align-items:center; gap:5px; padding:7px 14px; border-radius:var(--radius-full); border:1px solid var(--border-light); background:var(--bg-card); cursor:pointer; font-size:0.85rem; font-weight:500; color:var(--text-secondary); transition:all var(--transition-fast); }
.version-chip:hover { border-color:var(--primary); color:var(--text-primary); }
.version-chip.selected { border-color:var(--primary); background:var(--primary-light); color:var(--text-primary); font-weight:600; }
.chip-badge { font-size:0.62rem; background:var(--accent); color:white; padding:1px 5px; border-radius:8px; font-weight:700; }

.version-hint { display:flex; align-items:center; gap:5px; font-size:0.78rem; color:var(--text-muted); margin-top:8px; }
.version-hint svg { flex-shrink:0; color:var(--primary); }

.path-display { display:flex; align-items:center; gap:8px; padding:9px 12px; background:var(--bg-secondary); border-radius:var(--radius-md); font-family:var(--font-mono); font-size:0.75rem; color:var(--text-secondary); }

.config-row { display:flex; align-items:center; gap:var(--space-2); }
.config-row label { font-size:0.85rem; color:var(--text-secondary); font-weight:500; white-space:nowrap; }
.config-row input { flex:1; padding:7px 10px; border:1px solid var(--border-light); border-radius:var(--radius-sm); background:var(--bg-input); color:var(--text-primary); font-family:var(--font-mono); font-size:0.9rem; }
.config-row input:focus { outline:none; border-color:var(--primary); box-shadow:0 0 0 3px var(--primary-light); }
.port-status { font-size:0.75rem; font-weight:600; white-space:nowrap; }
.port-status.checking { color:var(--text-muted); }
.port-status.available { color:var(--success-text); }
.port-status.unavailable { color:var(--danger-text); }

.progress-card { background:var(--bg-secondary); border-radius:var(--radius-lg); padding:var(--space-4); border:1px solid var(--border-light); }
.progress-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.progress-phase { font-size:0.88rem; font-weight:700; color:var(--primary); }
.progress-stage { font-size:0.78rem; color:var(--text-muted); }
.progress-track { width:100%; height:6px; background:var(--border-light); border-radius:3px; overflow:hidden; margin-bottom:6px; }
.progress-bar { height:100%; border-radius:3px; background:linear-gradient(90deg, var(--primary), #2dd4bf); background-size:200% 100%; animation:shimmer 1.5s linear infinite; transition:width 0.3s ease; }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.progress-stats { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
.progress-pct { font-size:0.85rem; font-weight:700; color:var(--primary); font-family:var(--font-mono); margin-right:auto; }
.progress-speed { font-size:0.78rem; font-weight:500; color:var(--text-secondary); font-family:var(--font-mono); }
.progress-eta { font-size:0.78rem; font-weight:500; color:var(--text-muted); font-family:var(--font-mono); }

.step-list { display:flex; flex-direction:column; gap:4px; }
.step { display:flex; align-items:center; gap:8px; padding:5px 8px; border-radius:var(--radius-sm); font-size:0.82rem; }
.step.done { color:var(--text-secondary); }
.step.done svg { color:var(--success); }
.step.active { color:var(--primary); font-weight:600; background:var(--primary-light);
  box-shadow: 0 0 0 0 rgba(13,148,136,0.35);
  animation: stepPulse 1.8s ease-out infinite;
}
.spin-icon { animation:spin 2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.action-row { display:flex; gap:var(--space-2); }
.btn-primary { flex:1; display:flex; align-items:center; justify-content:center; gap:var(--space-2); padding:12px; border-radius:var(--radius-md); border:none; cursor:pointer; font-size:0.95rem; font-weight:700; color:white; background:linear-gradient(135deg, var(--primary), var(--primary-hover)); transition:all var(--transition-fast); box-shadow:var(--shadow-sm); }
.btn-primary:hover:not(:disabled) { box-shadow:var(--shadow-md); transform:translateY(-1px); }
.btn-primary:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
.btn-cancel { padding:12px 20px; border-radius:var(--radius-md); border:1px solid var(--border-light); cursor:pointer; font-size:0.9rem; font-weight:600; color:var(--text-secondary); background:var(--bg-card); transition:all var(--transition-fast); }
.btn-cancel:hover { background:var(--danger-bg); color:var(--danger-text); border-color:var(--danger-border); }

.status-bar { display:flex; align-items:center; gap:8px; padding:10px 14px; border-radius:var(--radius-md); background:var(--bg-secondary); color:var(--text-secondary); font-size:0.85rem; font-weight:500; }
.status-bar.success { background:var(--success-bg); color:var(--success-text); }
.status-bar.error { background:var(--danger-bg); color:var(--danger-text); }

@keyframes stepPulse {
  0% { box-shadow: 0 0 0 0 rgba(13,148,136,0.35); }
  70% { box-shadow: 0 0 0 9px rgba(13,148,136,0); }
  100% { box-shadow: 0 0 0 0 rgba(13,148,136,0); }
}

.progress-size { font-size: 0.78rem; font-weight: 500; color: var(--text-muted); font-family: var(--font-mono); }
.step.failed { color: var(--danger-text); background: var(--danger-bg); font-weight: 600; }
.step.failed svg { color: var(--danger-text); }

.log-toggle {
  margin-top: 10px;
  align-self: flex-start;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
  user-select: none;
}
.log-toggle:hover { text-decoration: underline; }
.log-panel {
  margin-top: 8px;
  max-height: 220px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--bg-solid);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
