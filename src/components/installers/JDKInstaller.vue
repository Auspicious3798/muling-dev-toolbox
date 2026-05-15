<template>
  <div class="installer">
    <div class="installer-header">
      <img :src="JavaIcon" class="tool-icon" alt=""/>
      <div>
        <h3>JDK 安装</h3>
        <p class="installer-desc">Java Development Kit — 编译与运行 Java 程序</p>
      </div>
    </div>

    <!-- Mode Switch -->
    <div class="mode-segment">
      <button :class="{ active: activeMode === 'online' }" @click="switchMode('online')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10"/><path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10"/></svg>
        联网下载
      </button>
      <button :class="{ active: activeMode === 'local' }" @click="switchMode('local')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        手动导入
      </button>
    </div>

    <!-- Online Mode -->
    <div v-if="activeMode === 'online'">
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

      <div class="path-display">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 22 0 0 1 2 2z"/></svg>
        <span>{{ installPath }}</span>
      </div>

      <div v-if="installing" class="progress-card">
        <div class="progress-header">
          <span class="progress-phase">{{ downloading ? '下载中' : '安装中' }}</span>
          <span class="progress-stage">{{ currentStage }}</span>
        </div>
        <div class="progress-track">
          <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <span class="progress-pct">{{ Math.round(progressPercent) }}%</span>
        <div class="step-list">
          <div v-for="(step, idx) in installSteps" :key="idx" class="step done">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>{{ step }}</span>
          </div>
          <div v-if="currentStage && !installSteps.includes(getStepLabel(currentStage))" class="step active">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>{{ getStepLabel(currentStage) }}</span>
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
    </div>

    <!-- Local Mode -->
    <div v-else>
      <button @click="importLocalJDK" class="import-zone">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <span>{{ localFilePath ? '重新选择' : '选择 JDK 压缩包' }}</span>
      </button>
      <div v-if="localFilePath" class="path-display success">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <span>{{ localFilePath }}</span>
      </div>
      <div class="config-row">
        <label>JDK 大版本号</label>
        <input type="number" v-model.number="localVersion" min="8" max="26"/>
        <button @click="validateLocalVersion" class="btn-validate">验证目录</button>
      </div>
      <div v-if="dirExistsWarning" class="warn-banner">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        安装目录已存在文件，请删除或选择其他版本。
      </div>
      <div class="path-display">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>{{ localInstallPath }}</span>
      </div>

      <div v-if="installing" class="progress-card">
        <div class="progress-header">
          <span class="progress-phase">安装中</span>
          <span class="progress-stage">{{ currentStage }}</span>
        </div>
        <div class="progress-track">
          <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <span class="progress-pct">{{ Math.round(progressPercent) }}%</span>
        <div class="step-list">
          <div v-for="(step, idx) in installSteps" :key="idx" class="step done">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            <span>{{ step }}</span>
          </div>
          <div v-if="currentStage && !installSteps.includes(getStepLabel(currentStage))" class="step active">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>{{ getStepLabel(currentStage) }}</span>
          </div>
        </div>
      </div>

      <div class="action-row">
        <button @click="installFromLocal" :disabled="installing || !localFilePath || dirExistsWarning" class="btn-primary">
          <svg v-if="!installing" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {{ installing ? '安装中...' : '开始安装' }}
        </button>
      </div>
    </div>

    <div class="status-bar" :class="{ success: status.includes('成功'), error: status.includes('失败') || status.includes('错误') }">
      <svg v-if="status.includes('成功')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      <svg v-else-if="status.includes('失败') || status.includes('错误')" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <span>{{ status }}</span>
    </div>
  </div>
</template>

<script>
import eventBus from '@/eventBus';
import JavaIcon from '../../../public/icons/java.svg?url';

export default {
  name: 'JDKInstaller',
  data() {
    return {
      JavaIcon,
      activeMode: 'online',
      selectedVersion: '21',
      versionOptions: [
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
      showProgress: false, progressPercent: 0,
      localFilePath: '', localVersion: 21, dirExistsWarning: false
    };
  },
  computed: {
    installPath() { return `C:\\Program Files\\muling\\muling-env-box\\Java\\jdk-${this.selectedVersion}`; },
    localInstallPath() { return `C:\\Program Files\\muling\\muling-env-box\\Java\\jdk-${this.localVersion}`; }
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onDownloadProgress((data) => {
        if (data.type === 'jdk' && data.version === this.selectedVersion) {
          this.progressPercent = data.progress * 100;
          if (data.stage) { this.currentStage = data.stage; const sl = this.getStepLabel(data.stage); if (sl && !this.installSteps.includes(sl)) this.installSteps.push(sl); }
          if (data.progress === 1) { this.status = 'JDK 安装成功'; setTimeout(() => { this.showProgress = false; }, 1500); }
        }
      });
    } else { this.status = '错误：未连接到主进程'; }
  },
  methods: {
    getStepLabel(stage) { const m = {'下载安装包':'下载 JDK 安装包','解压中':'解压安装包','配置环境变量':'配置系统环境变量'}; return m[stage] || stage; },
    switchMode(mode) { this.activeMode = mode; if (mode === 'local') { this.localFilePath = ''; this.localVersion = 21; this.dirExistsWarning = false; } },
    cancelDownload() { if (window.electronAPI && window.electronAPI.cancelDownload) { window.electronAPI.cancelDownload(); this.status = '已取消下载'; this.downloading = false; this.showProgress = false; } },
    installJDK() {
      if (this.installing) return;
      this.installing = true; this.showProgress = true; this.progressPercent = 0; this.currentStage = ''; this.installSteps = []; this.status = '准备安装...';
      eventBus.emit('install:start');
      this.downloading = true;
      window.electronAPI.installJDK(this.selectedVersion).then((result) => {
        if (result.success) { this.status = `JDK 安装成功 — ${result.message}`; this.$emit('installed'); setTimeout(() => { this.showProgress = false; }, 2000); }
        else { this.status = `安装失败：${result.message}`; this.showProgress = false; }
      }).catch((err) => {
        this.status = err.message && err.message.includes('canceled') ? '下载已取消' : `安装失败：${err.message}`;
        this.showProgress = false;
      }).finally(() => { this.installing = false; this.downloading = false; eventBus.emit('install:end'); });
    },
    async importLocalJDK() {
      const filePath = await window.electronAPI.openFileDialog({ title: '选择 JDK 安装包', filters: [{name:'JDK 安装包',extensions:['zip']},{name:'所有文件',extensions:['*']}] });
      if (!filePath) return;
      this.localFilePath = filePath; this.status = `已选择文件：${filePath}`;
      const version = this.localVersion;
      if (!version || version < 8 || version > 26) { this.status = `导入失败：版本号应在 8 到 26 之间。`; this.localFilePath = ''; return; }
      this.installing = true; this.showProgress = false; this.status = '正在导入 JDK 安装包...'; eventBus.emit('install:start');
      try {
        const result = await window.electronAPI.importLocalJDK(filePath);
        if (result.success) { this.status = `${result.message}，请点击"开始安装"完成配置。`; await this.validateLocalVersion(); }
        else { this.status = `导入失败：${result.message}`; this.localFilePath = ''; }
      } catch (err) { this.status = `导入失败：${err.message}`; this.localFilePath = ''; }
      finally { this.installing = false; eventBus.emit('install:end'); }
    },
    async validateLocalVersion() {
      if (!this.localFilePath) { this.status = '请先选择 JDK 安装包。'; return; }
      try { const exists = await window.electronAPI.checkPathExists(this.localInstallPath); this.dirExistsWarning = exists; this.status = exists ? '安装目录已存在文件，请删除或选择其他版本。' : '安装目录可用。'; }
      catch (err) { this.dirExistsWarning = false; }
    },
    async installFromLocal() {
      if (this.installing) return;
      if (this.dirExistsWarning) { this.status = '安装目录已存在文件，请删除或选择其他版本。'; return; }
      this.installing = true; this.showProgress = true; this.progressPercent = 0; this.currentStage = ''; this.installSteps = []; this.status = '正在安装...';
      eventBus.emit('install:start');
      try {
        const result = await window.electronAPI.installFromLocal(this.localVersion);
        if (result.success) { this.status = `JDK 安装成功 — ${result.message}`; this.$emit('installed'); setTimeout(()=>{this.showProgress=false;},2000); this.localFilePath=''; this.dirExistsWarning=false; }
        else { this.status = `安装失败：${result.message}`; this.showProgress = false; }
      } catch (err) { this.status = `安装失败：${err.message}`; this.showProgress = false; }
      finally { this.installing = false; eventBus.emit('install:end'); }
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

/* Mode segment */
.mode-segment { display: flex; background: var(--bg-secondary); border-radius: var(--radius-md); padding: 3px; gap: 3px; }
.mode-segment button {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 12px; border-radius: var(--radius-sm); border: none; cursor: pointer;
  font-size: 0.85rem; font-weight: 500; color: var(--text-secondary);
  background: transparent; transition: all var(--transition-fast);
}
.mode-segment button.active { background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-xs); font-weight: 600; }
.mode-segment button:hover:not(.active) { color: var(--text-primary); }

/* Version grid */
.version-grid { display: flex; flex-wrap: wrap; gap: 6px; max-height: 170px; overflow-y: auto; }
.version-chip {
  display: flex; align-items: center; gap: 5px;
  padding: 7px 12px; border-radius: var(--radius-full);
  border: 1px solid var(--border-light); background: var(--bg-card);
  cursor: pointer; font-size: 0.82rem; font-weight: 500;
  color: var(--text-secondary); transition: all var(--transition-fast);
}
.version-chip:hover { border-color: var(--primary); color: var(--text-primary); }
.version-chip.selected { border-color: var(--primary); background: var(--primary-light); color: var(--primary-dark); font-weight: 600; }
.chip-label { white-space: nowrap; }
.chip-badge { font-size: 0.62rem; background: var(--accent); color: white; padding: 1px 5px; border-radius: 8px; font-weight: 700; }

.version-hint { display: flex; align-items: center; gap: 5px; font-size: 0.78rem; color: var(--text-muted); margin-top: 8px; }
.version-hint svg { flex-shrink: 0; color: var(--primary); }

/* Path */
.path-display {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px; background: var(--bg-secondary); border-radius: var(--radius-md);
  font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-secondary);
}
.path-display.success { background: var(--success-bg); color: var(--success-text); }

/* Config row */
.config-row { display: flex; align-items: center; gap: var(--space-2); }
.config-row label { font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; white-space: nowrap; }
.config-row input { width: 80px; padding: 7px 10px; border: 1px solid var(--border-light); border-radius: var(--radius-sm); background: var(--bg-input); color: var(--text-primary); font-family: var(--font-mono); font-size: 0.9rem; }
.config-row input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }
.btn-validate {
  background: var(--bg-hover); color: var(--text-secondary); border: 1px solid var(--border-light);
  padding: 7px 14px; border-radius: var(--radius-sm); font-size: 0.8rem; cursor: pointer; font-weight: 500;
  transition: all var(--transition-fast);
}
.btn-validate:hover { background: var(--border-light); color: var(--text-primary); }

/* Warn banner */
.warn-banner {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; background: var(--danger-bg); color: var(--danger-text);
  border-radius: var(--radius-md); font-size: 0.82rem; font-weight: 500;
}

/* Progress card */
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
.progress-pct { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); display: block; margin-bottom: 10px; }

.step-list { display: flex; flex-direction: column; gap: 4px; }
.step { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius-sm); font-size: 0.82rem; }
.step.done { color: var(--text-secondary); }
.step.done svg { color: var(--success); }
.step.active { color: var(--primary); font-weight: 600; background: var(--primary-light); }
.spin-icon { animation: spin 2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Import zone */
.import-zone {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: var(--space-3);
  padding: 18px; border: 2px dashed var(--border-medium); border-radius: var(--radius-lg);
  background: var(--bg-secondary); cursor: pointer; color: var(--text-secondary);
  font-size: 0.9rem; font-weight: 500; transition: all var(--transition-fast);
}
.import-zone:hover { border-color: var(--primary); color: var(--primary); background: var(--primary-light); }

/* Action row */
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

/* Status bar */
.status-bar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; border-radius: var(--radius-md);
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: 0.85rem; font-weight: 500;
}
.status-bar.success { background: var(--success-bg); color: var(--success-text); }
.status-bar.error { background: var(--danger-bg); color: var(--danger-text); }
</style>
