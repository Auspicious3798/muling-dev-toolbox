<template>
  <div class="installer">
    <div class="installer-header">
      <img :src="JavaIcon" class="tool-icon" alt=""/>
      <div>
        <h3>JDK 安装</h3>
        <p class="installer-desc">Java Development Kit — 编译与运行 Java 程序</p>
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
      <span v-if="selectedVersion === '8'">经典 LTS，企业级应用首选</span>
      <span v-else-if="selectedVersion === '11'">LTS 版本，稳定可靠</span>
      <span v-else-if="selectedVersion === '17'">最新 LTS，性能优异</span>
      <span v-else-if="selectedVersion === '21'">长期支持版，现代特性最全</span>
      <span v-else>最新版本，体验前沿功能</span>
    </p>

    <div class="path-config">
      <label>安装目录 <span class="path-note">沙箱内，不改系统环境变量</span></label>
      <div class="path-row">
        <input type="text" :value="effectiveInstallPath" readonly class="path-input"/>
      </div>
    </div>

    <div v-if="installing" class="progress-card">
      <div class="progress-header">
        <span class="progress-phase">{{ downloading ? '下载中' : '安装中' }}</span>
        <span class="progress-stage">{{ currentStage }}</span>
      </div>
      <div class="progress-track">
        <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <div class="progress-stats">
        <span class="progress-pct">{{ Math.round(progressPercent) }}%</span>
        <span v-if="downloading && downloadSpeed > 0" class="progress-speed">{{ formatSpeed(downloadSpeed) }}</span>
        <span v-if="downloading && downloadEta !== null" class="progress-eta">剩余 {{ formatEta(downloadEta) }}</span>
        <span v-if="downloading && downloadTotal > 0" class="progress-size">{{ formatSize(downloadReceived) }} / {{ formatSize(downloadTotal) }}</span>
      </div>
      <div class="step-list">
        <div v-for="(step, idx) in installSteps" :key="idx" class="step done">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>{{ step }}</span>
        </div>
        <div v-if="currentStage && !installSteps.includes(getStepLabel(normalizeStage(currentStage)))" class="step active" :class="{ failed: status.includes('安装失败') }">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          <span>{{ getStepLabel(normalizeStage(currentStage)) }}</span>
        </div>
      </div>
    </div>

    <div class="action-row">
      <button @click="installJDK" :disabled="installing" class="btn-primary">
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
import JavaIcon from '../../../public/icons/java.svg?url';
import { sandboxPath, loadSandboxRoot } from '@/utils/sandbox';

export default {
  name: 'JDKInstaller',
  data() {
    return {
      JavaIcon,
      selectedVersion: '21',
      versionOptions: [
        { value: '27', label: 'JDK 27', recommended: false },
        { value: '26', label: 'JDK 26', recommended: false },
        { value: '25', label: 'JDK 25', recommended: false },
        { value: '24', label: 'JDK 24', recommended: false },
        { value: '23', label: 'JDK 23', recommended: false },
        { value: '22', label: 'JDK 22', recommended: false },
        { value: '21', label: 'JDK 21', recommended: true },
        { value: '20', label: 'JDK 20', recommended: false },
        { value: '19', label: 'JDK 19', recommended: false },
        { value: '18', label: 'JDK 18', recommended: false },
        { value: '17', label: 'JDK 17', recommended: false },
        { value: '16', label: 'JDK 16', recommended: false },
        { value: '15', label: 'JDK 15', recommended: false },
        { value: '14', label: 'JDK 14', recommended: false },
        { value: '13', label: 'JDK 13', recommended: false },
        { value: '12', label: 'JDK 12', recommended: false },
        { value: '11', label: 'JDK 11', recommended: false },
        { value: '8', label: 'JDK 8', recommended: false }
      ],
      installing: false, downloading: false,
      status: '未安装', currentStage: '', installSteps: [],
      progressPercent: 0, downloadSpeed: 0, downloadEta: null, downloadReceived: 0, downloadTotal: 0, logVisible: false, logLines: []
    };
  },
  computed: {
    effectiveInstallPath() { return sandboxPath('jdk', this.selectedVersion); }
  },
  mounted() {
    this._unsubs = [];
    loadSandboxRoot();
    if (window.electronAPI) {
      this._unsubs.push(window.electronAPI.onDownloadProgress((data) => {
        if (data.type === 'jdk' && data.version === this.selectedVersion) {
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
    getStepLabel(stage) { const m = {'下载安装包':'下载 JDK 安装包','解压中':'解压安装包','配置环境变量':'写入沙箱环境','加入沙箱环境':'加入沙箱环境'}; return m[stage] || stage; },
    formatSpeed(bps) { if (!bps || bps <= 0) return ''; if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s'; return Math.max(1, Math.round(bps / 1024)) + ' KB/s'; },
    formatEta(seconds) { if (seconds === null || seconds === undefined) return ''; if (seconds >= 60) return Math.floor(seconds / 60) + '分' + (seconds % 60) + '秒'; return seconds + 's'; },
    formatSize(bytes) { const n = Number(bytes) || 0; if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'; if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'; if (n >= 1024) return Math.round(n / 1024) + ' KB'; return n + ' B'; },
    normalizeStage(stage) { return String(stage || '').split('·')[0].trim().replace(/\s*\d+%$/, ''); },
    async toggleInstallLog() {
      if (this.logVisible) { this.logVisible = false; return; }
      try {
        const r = await window.electronAPI.readInstallLog('jdk');
        if (r && r.success) { this.logLines = r.lines; this.logVisible = true; }
        else { Lemon.error(r && r.message ? r.message : '没有读到安装日志'); }
      } catch (err) {
        Lemon.error('读取安装日志失败：' + err.message);
      }
    },
    cancelDownload() { if (window.electronAPI && window.electronAPI.cancelDownload) { window.electronAPI.cancelDownload(); this.status = '已取消下载'; this.downloading = false; } },
    installJDK() {
      if (this.installing) return;
      this.installing = true; this.progressPercent = 0; this.currentStage = ''; this.installSteps = []; this.status = '准备安装...';
      eventBus.emit('install:start');
      this.downloading = true;
      window.electronAPI.installJDK(this.selectedVersion, null).then((result) => {
        if (result.success) {
          this.status = `JDK 安装成功 — ${result.message}`;
          Lemon.success(`JDK ${this.selectedVersion} 已经安家落户啦～`);
          this.$emit('installed');
        }
        else {
          this.status = `安装失败：${result.message}`;
          Lemon.error(`JDK 没装成：${result.message}`);
        }
      }).catch((err) => {
        if (err.message && err.message.includes('canceled')) {
          this.status = '下载已取消';
          Lemon.info('下载停下啦，随时可以再来～');
        } else {
          this.status = `安装失败：${err.message}`;
          Lemon.error(`JDK 没装成：${err.message}`);
        }
      }).finally(() => { this.installing = false; this.downloading = false; eventBus.emit('install:end'); });
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

.version-grid { display: flex; flex-wrap: wrap; gap: 6px; max-height: 170px; overflow-y: auto; }
.version-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 12px; border-radius: var(--radius-full);
  border: 1px solid var(--border-light); background: var(--bg-card);
  cursor: pointer; font-size: 0.82rem; font-weight: 500;
  color: var(--text-secondary); transition: all var(--transition-fast);
}
.version-chip:hover { border-color: var(--primary); color: var(--text-primary); }
.version-chip.selected { border-color: var(--primary); background: var(--primary-light); color: var(--text-primary); font-weight: 600; }
.chip-label { white-space: nowrap; }
.chip-badge { font-size: 0.62rem; background: var(--accent); color: white; padding: 1px 5px; border-radius: 8px; font-weight: 700; }

.version-hint { display: flex; align-items: center; gap: 5px; font-size: 0.78rem; color: var(--text-muted); margin-top: 8px; }
.version-hint svg { flex-shrink: 0; color: var(--primary); }

.path-config { display: flex; flex-direction: column; gap: 6px; }
.path-config label { font-size: 0.82rem; color: var(--text-secondary); font-weight: 500; }
.path-note { font-size: 0.72rem; color: var(--text-tertiary); font-weight: 400; }
.path-row { display: flex; gap: 6px; align-items: center; }
.path-input {
  flex: 1; padding: 8px 11px; border: 1px solid var(--border-light);
  border-radius: var(--radius-sm); background: var(--bg-input);
  color: var(--text-primary); font-family: var(--font-mono); font-size: 0.78rem;
  cursor: pointer; transition: border-color var(--transition-fast);
}
.path-input:hover { border-color: var(--border-medium); }
.path-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.progress-card {
  background: var(--bg-secondary); border-radius: var(--radius-lg);
  padding: var(--space-4); border: 1px solid var(--border-light);
}
.progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.progress-phase { font-size: 0.88rem; font-weight: 700; color: var(--primary); }
.progress-stage { font-size: 0.78rem; color: var(--text-muted); }
.progress-track { width: 100%; height: 6px; background: var(--border-light); border-radius: 3px; overflow: hidden; margin-bottom: 6px; }
.progress-bar {
  height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, var(--primary), #2dd4bf);
  background-size: 200% 100%; animation: shimmer 1.5s linear infinite;
  transition: width 0.3s ease;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.progress-stats { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
.progress-pct { font-size: 0.85rem; font-weight: 700; color: var(--primary); font-family: var(--font-mono); margin-right: auto; }
.progress-speed { font-size: 0.78rem; font-weight: 500; color: var(--text-secondary); font-family: var(--font-mono); }
.progress-eta { font-size: 0.78rem; font-weight: 500; color: var(--text-muted); font-family: var(--font-mono); }

.step-list { display: flex; flex-direction: column; gap: 4px; }
.step { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius-sm); font-size: 0.82rem; }
.step.done { color: var(--text-secondary); }
.step.done svg { color: var(--success); }
.step.active { color: var(--primary); font-weight: 600; background: var(--primary-light); 
  box-shadow: 0 0 0 0 rgba(13,148,136,0.35);
  animation: stepPulse 1.8s ease-out infinite;
}
.spin-icon { animation: spin 2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.action-row { display: flex; gap: var(--space-2); }
.btn-primary {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: var(--space-2);
  padding: 12px; border-radius: var(--radius-md); border: none; cursor: pointer;
  font-size: 0.95rem; font-weight: 700; color: white;
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
  transition: all var(--transition-fast); box-shadow: var(--shadow-sm);
}
.btn-primary:hover:not(:disabled) { box-shadow: var(--shadow-md); transform: translateY(-1px); }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
.btn-cancel {
  padding: 12px 20px; border-radius: var(--radius-md); border: 1px solid var(--border-light);
  cursor: pointer; font-size: 0.9rem; font-weight: 600; color: var(--text-secondary);
  background: var(--bg-card); transition: all var(--transition-fast);
}
.btn-cancel:hover { background: var(--danger-bg); color: var(--danger-text); border-color: var(--danger-border); }

.status-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: var(--radius-md);
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: 0.85rem; font-weight: 500;
}
.status-bar.success { background: var(--success-bg); color: var(--success-text); }
.status-bar.error { background: var(--danger-bg); color: var(--danger-text); }

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
