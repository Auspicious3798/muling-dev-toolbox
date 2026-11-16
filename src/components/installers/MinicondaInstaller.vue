<template>
  <div class="installer">
    <div class="installer-header">
      <img :src="Icon" class="tool-icon" alt=""/>
      <div>
        <h3>Miniconda 安装</h3>
        <p class="installer-desc">轻量 conda 发行版 — 自带 Python，按需创建隔离环境</p>
      </div>
    </div>

    <div class="version-grid">
      <button
        v-for="v in versionOptions"
        :key="v.value"
        class="version-chip"
        :class="{ selected: selectedVersion === v.value }"
        @click="selectedVersion = v.value"
      >
        <span class="chip-label">{{ v.label }}</span>
        <span v-if="v.recommended" class="chip-badge">推荐</span>
      </button>
    </div>

    <p class="version-hint">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span>{{ hintText }}</span>
    </p>

    <div class="path-display">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span>{{ installPath }}</span>
    </div>

    <div v-if="installing" class="progress-card">
      <div class="progress-header">
        <span class="progress-phase">{{ downloading ? '下载中' : '安装中' }}</span>
        <span class="progress-stage">{{ currentStage }}</span>
      </div>
      <div class="progress-track"><div class="progress-bar" :style="{ width: progressPercent + '%' }"></div></div>
      <div class="progress-stats">
        <span class="progress-pct">{{ Math.round(progressPercent) }}%</span>
        <span v-if="downloading && downloadSpeed > 0" class="progress-speed">{{ formatSpeed(downloadSpeed) }}</span>
        <span v-if="downloading && downloadEta !== null" class="progress-eta">剩余 {{ formatEta(downloadEta) }}</span>
        <span v-if="downloading && downloadTotal > 0" class="progress-size">{{ formatSize(downloadReceived) }} / {{ formatSize(downloadTotal) }}</span>
      </div>
    </div>

    <div class="action-row">
      <button @click="install" :disabled="installing" class="btn-primary">
        <svg v-if="!installing" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        {{ installing ? (downloading ? '下载中...' : '安装中...') : '开始安装' }}
      </button>
      <button v-if="downloading" @click="cancelDownload" class="btn-cancel">取消下载</button>
    </div>

    <div class="status-bar" :class="{ success: status.includes('成功'), error: status.includes('失败') }">
      <span>{{ status }}</span>
    </div>
  </div>
</template>

<script>
import eventBus from '@/eventBus';
import Lemon from '@/utils/lemon';
import Icon from '../../../public/icons/Miniconda.svg?url';
import { sandboxPath, loadSandboxRoot } from '@/utils/sandbox';

export default {
  name: 'MinicondaInstaller',
  data() {
    return {
      Icon,
      selectedVersion: '3.12-24.9.2',
      versionOptions: [
        { value: '3.13-26.9.4', label: 'Python 3.13', recommended: false },
        { value: '3.12-24.9.2', label: 'Python 3.12', recommended: true },
        { value: '3.11-24.9.2', label: 'Python 3.11', recommended: false },
        { value: '3.10-23.11.0', label: 'Python 3.10', recommended: false }
      ],
      installing: false,
      downloading: false,
      status: '未安装',
      currentStage: '',
      progressPercent: 0,
      downloadSpeed: 0,
      downloadEta: null,
      downloadReceived: 0,
      downloadTotal: 0
    };
  },
  computed: {
    installPath() {
      return sandboxPath('miniconda', this.selectedVersion);
    },
    hintText() {
      const map = {
        '3.13-26.9.4': '最新的 conda + Python 3.13，适合新项目',
        '3.12-24.9.2': '生态最全，科学计算/机器学习都稳',
        '3.11-24.9.2': '兼容性好，老项目也能用',
        '3.10-23.11.0': '体积最小，适合老环境'
      };
      return map[this.selectedVersion] || '按需选一个即可，装完可以再加别的版本';
    }
  },
  mounted() {
    loadSandboxRoot();
    this._unsubs = [];
    if (window.electronAPI) {
      this._unsubs.push(
        window.electronAPI.onDownloadProgress((data) => {
          if (data.type !== 'miniconda' || data.version !== this.selectedVersion) return;
          this.progressPercent = (data.progress || 0) * 100;
          if (typeof data.speed === 'number') this.downloadSpeed = data.speed;
          if (data.eta !== undefined) this.downloadEta = data.eta;
          if (typeof data.received === 'number') this.downloadReceived = data.received;
          if (typeof data.total === 'number') this.downloadTotal = data.total;
          if (data.stage) {
            this.currentStage = data.stage;
            this.downloading = data.stage.includes('下载');
          }
        })
      );
    } else {
      this.status = '错误：未连接到主进程';
    }
  },
  unmounted() {
    (this._unsubs || []).forEach((unsub) => {
      try { unsub && unsub(); } catch (err) { /* 忽略 */ }
    });
  },
  methods: {
    formatSpeed(bps) {
      if (!bps || bps <= 0) return '';
      if (bps >= 1024 * 1024) return (bps / 1024 / 1024).toFixed(1) + ' MB/s';
      return Math.max(1, Math.round(bps / 1024)) + ' KB/s';
    },
    formatEta(seconds) {
      if (seconds === null || seconds === undefined) return '';
      if (seconds >= 60) return Math.floor(seconds / 60) + '分' + (seconds % 60) + '秒';
      return seconds + 's';
    },
    formatSize(bytes) {
      const n = Number(bytes) || 0;
      if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
      if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
      if (n >= 1024) return Math.round(n / 1024) + ' KB';
      return n + ' B';
    },
    cancelDownload() {
      if (window.electronAPI && window.electronAPI.cancelMinicondaDownload) {
        window.electronAPI.cancelMinicondaDownload();
        this.status = '已取消下载';
        this.downloading = false;
      }
    },
    async install() {
      if (this.installing) return;
      this.installing = true;
      this.progressPercent = 0;
      this.currentStage = '';
      this.status = '准备安装...';
      this.downloading = true;
      eventBus.emit('install:start', 'miniconda');
      try {
        const result = await window.electronAPI.installMiniconda(this.selectedVersion);
        if (result.success) {
          this.status = `安装成功 — ${result.message}`;
          Lemon.success(`Miniconda（${this.selectedVersion}）装好了，conda 源已配成清华镜像～`);
          this.$emit('installed');
        } else {
          this.status = `安装失败：${result.message}`;
          Lemon.error(`Miniconda 没装成：${result.message}`);
        }
      } catch (err) {
        this.status = `安装失败：${err.message}`;
        Lemon.error(`Miniconda 没装成：${err.message}`);
      } finally {
        this.installing = false;
        this.downloading = false;
        eventBus.emit('install:end');
      }
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

.version-grid { display: flex; gap: 8px; flex-wrap: wrap; }
.version-chip { display: flex; align-items: center; gap: 5px; padding: 7px 14px; border-radius: var(--radius-full); border: 1px solid var(--border-light); background: var(--bg-card); cursor: pointer; font-size: 0.85rem; font-weight: 500; color: var(--text-secondary); transition: all var(--transition-fast); }
.version-chip:hover { border-color: var(--primary); color: var(--text-primary); }
.version-chip.selected { border-color: var(--primary); background: var(--primary-light); color: var(--text-primary); font-weight: 600; }
.chip-badge { font-size: 0.62rem; background: var(--accent); color: white; padding: 1px 5px; border-radius: 8px; font-weight: 700; }

.version-hint { display: flex; align-items: center; gap: 5px; font-size: 0.78rem; color: var(--text-muted); margin-top: 8px; }
.version-hint svg { flex-shrink: 0; color: var(--primary); }

.path-display { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--bg-input); border-radius: var(--radius-sm); font-size: 0.78rem; color: var(--text-secondary); font-family: 'JetBrains Mono', Consolas, monospace; overflow: hidden; }
.path-display svg { flex-shrink: 0; opacity: 0.6; }
.path-display span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.progress-card { padding: var(--space-3); background: var(--bg-input); border-radius: var(--radius-md); }
.progress-header { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 8px; }
.progress-phase { font-weight: 600; color: var(--primary); }
.progress-track { height: 6px; background: var(--border-light); border-radius: 3px; overflow: hidden; }
.progress-bar { height: 100%; background: var(--primary); transition: width 0.3s ease; }
.progress-stats { display: flex; gap: 10px; margin-top: 6px; font-size: 0.72rem; color: var(--text-muted); }

.action-row { display: flex; gap: var(--space-2); }
.btn-primary { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 11px; border: none; border-radius: var(--radius-sm); background: var(--primary); color: white; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all var(--transition-fast); }
.btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-cancel { padding: 11px 16px; border: 1px solid var(--border-light); border-radius: var(--radius-sm); background: var(--bg-card); color: var(--text-secondary); font-size: 0.85rem; cursor: pointer; }

.status-bar { padding: 9px 12px; background: var(--bg-input); border-radius: var(--radius-sm); font-size: 0.8rem; color: var(--text-secondary); }
.status-bar.success { color: var(--success); background: var(--success-bg, var(--bg-input)); }
.status-bar.error { color: var(--danger); }
</style>
