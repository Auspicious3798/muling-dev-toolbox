<template>
  <div class="installer">
    <div class="installer-header">
      <img v-if="meta.icon" :src="meta.icon" class="tool-icon" alt=""/>
      <div>
        <h3>{{ meta.label }} 安装</h3>
        <p class="installer-desc">{{ meta.desc }}</p>
      </div>
    </div>

    <div v-if="versionOptions.length > 1" class="version-grid">
      <button v-for="v in versionOptions" :key="v" class="version-chip" :class="{ selected: selectedVersion === v }" @click="selectedVersion = v">
        {{ meta.label }} {{ v }}
      </button>
    </div>

    <div v-if="blocked" class="warn-banner">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      {{ blocked }}
    </div>

    <div class="path-display">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
      <span>{{ installPath }}</span>
    </div>

    <div v-if="installing" class="progress-card">
      <div class="progress-header"><span class="progress-phase">{{ phaseText }}</span><span class="progress-stage">{{ currentStage }}</span></div>
      <div class="progress-track"><div class="progress-bar" :style="{ width: progressPercent + '%' }"></div></div>
      <div class="progress-stats">
        <span class="progress-pct">{{ Math.round(progressPercent) }}%</span>
        <span v-if="downloadSpeed > 0" class="progress-speed">{{ formatSpeed(downloadSpeed) }}</span>
        <span v-if="downloadTotal > 0" class="progress-size">{{ formatSize(downloadReceived) }} / {{ formatSize(downloadTotal) }}</span>
      </div>
    </div>

    <div class="action-row">
      <button @click="install" :disabled="installing || Boolean(blocked)" class="btn-primary">
        {{ installing ? '安装中...' : '开始安装' }}
      </button>
      <button v-if="installing" @click="cancel" class="btn-cancel">取消下载</button>
    </div>

    <div class="status-bar" :class="{ success: status.includes('成功'), error: status.includes('失败') || status.includes('错误') }">
      <span>{{ status }}</span>
    </div>
  </div>
</template>

<script>
import eventBus from '@/eventBus';
import Lemon from '@/utils/lemon';
import { sandboxPath, sandboxRoot, loadSandboxRoot } from '@/utils/sandbox';

const META = {
  nacos: {
    label: 'Nacos', desc: 'Nacos — 注册中心与配置中心', icon: '/icons/nacos.svg',
    versions: ['2.4.3'], needsJava: true, defaultPort: 8848,
    detail: '默认单机模式启动，控制台 http://127.0.0.1:8848/nacos（账号密码 nacos / nacos）',
  },
  sentinel: {
    label: 'Sentinel', desc: 'Sentinel Dashboard — 流量控制与熔断', icon: '/icons/sentinel.svg',
    versions: ['1.8.8'], needsJava: true, defaultPort: 8858,
    detail: '控制台 http://127.0.0.1:8858（账号密码 sentinel / sentinel）',
  },
  rabbitmq: {
    label: 'RabbitMQ', desc: 'RabbitMQ — 消息队列', icon: '/icons/Rabbitmq.svg',
    versions: ['3.13.7'], needsJava: false, needsErlang: true, defaultPort: 5672,
    detail: '需要电脑上先装好 Erlang（erl 能在 PATH 里找到）；管理台 http://127.0.0.1:15672（guest / guest）',
  },
  minio: {
    label: 'MinIO', desc: 'MinIO — S3 兼容对象存储', icon: '/icons/minio.svg',
    versions: ['2025.04.22'], needsJava: false, defaultPort: 9000,
    detail: 'API http://127.0.0.1:9000，控制台 http://127.0.0.1:9001（minioadmin / minioadmin）',
  },
  elasticsearch: {
    label: 'Elasticsearch', desc: 'Elasticsearch — 搜索与日志分析引擎', icon: '/icons/elasticsearch.svg',
    versions: ['8.15.0'], needsJava: false, defaultPort: 9200,
    detail: '自带 JDK，首次启动较慢（约 30-60 秒）；建议机器内存 8G 以上',
  },
  kibana: {
    label: 'Kibana', desc: 'Kibana — Elasticsearch 可视化', icon: '/icons/kibana.svg',
    versions: ['8.15.0'], needsJava: false, defaultPort: 5601,
    detail: '需要先装好 Elasticsearch；启动较慢，首次约 1-2 分钟',
  },
};

export default {
  name: 'MiddlewareInstaller',
  props: { tool: {type: String, required: true} },
  data() {
    return {
      installing: false, blocked: '',
      status: '未安装', currentStage: '', phaseText: '下载中',
      progressPercent: 0, downloadSpeed: 0, downloadReceived: 0, downloadTotal: 0,
      selectedVersion: '',
    };
  },
  computed: {
    meta() { return META[this.tool] || {label: this.tool, desc: '', versions: [], icon: ''}; },
    versionOptions() { return this.meta.versions || []; },
    api() { return (window.electronAPI && window.electronAPI.middleware && window.electronAPI.middleware[this.tool]) || null; },
    installPath() {
      const ver = this.selectedVersion || this.versionOptions[0] || '';
      return sandboxRoot.value ? sandboxPath(this.tool, ver) : '沙箱目录（安装后自动确定）';
    },
  },
  watch: {
    tool() { this.reset(); },
  },
  mounted() {
    this._unsubs = [];
    loadSandboxRoot();
    this.reset();
    this.checkPrereq();
  },
  beforeUnmount() {
    (this._unsubs || []).forEach((fn) => { try { fn(); } catch (e) {} });
  },
  methods: {
    reset() {
      this.selectedVersion = this.versionOptions[0] || '';
      this.installing = false;
      this.status = '未安装';
      this.progressPercent = 0;
      this.currentStage = '';
      (this._unsubs || []).forEach((fn) => { try { fn(); } catch (e) {} });
      this._unsubs = [];
      if (!this.api) { this.blocked = '当前版本还没有接入这个工具'; return; }
      this._unsubs.push(this.api.onProgress((data) => this.handleProgress(data)));
    },
    async checkPrereq() {
      if (!this.meta.needsJava) { this.blocked = ''; return; }
      try {
        const res = await window.electronAPI.checkJDK();
        const hasJdk = res && (res.installed || (res.versions && res.versions.length));
        this.blocked = hasJdk ? '' : '这个工具要用 JDK 跑，请先在「后端开发 → JDK」里装一个（或接管电脑上已有的 JDK）';
      } catch (err) {
        this.blocked = '';
      }
    },
    handleProgress(data) {
      if (!data) return;
      if (typeof data.progress === 'number') this.progressPercent = data.progress * 100;
      if (data.stage) this.currentStage = data.stage;
      if (typeof data.speed === 'number') this.downloadSpeed = data.speed;
      if (typeof data.received === 'number') this.downloadReceived = data.received;
      if (typeof data.total === 'number') this.downloadTotal = data.total;
      if (data.state === 'installing') this.phaseText = '安装中';
      if (data.state === 'downloading') this.phaseText = '下载中';
    },
    async install() {
      if (!this.api) return;
      this.installing = true;
      this.phaseText = '下载中';
      this.progressPercent = 0;
      this.status = '正在安装...';
      eventBus.emit('install:start', this.tool);
      try {
        const res = await this.api.install(this.selectedVersion);
        this.status = res.message || (res.success ? '安装成功' : '安装失败');
        if (res.success) {
          Lemon.success(`${this.meta.label} 安装完成`, this.meta.detail);
          this.$emit('installed', {tool: this.tool, version: res.version || this.selectedVersion});
        } else {
          Lemon.error('安装没成功', res.message || '请查看日志');
        }
      } catch (err) {
        this.status = `安装失败：${err.message}`;
        Lemon.error('安装没成功', err.message);
      } finally {
        this.installing = false;
        eventBus.emit('install:end', this.tool);
      }
    },
    cancel() {
      if (this.api) this.api.cancel();
      this.status = '已取消';
    },
    formatSpeed(bytes) {
      if (!bytes) return '';
      return `${(bytes / 1048576).toFixed(1)} MB/s`;
    },
    formatSize(bytes) {
      if (!bytes) return '0 B';
      if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
      return `${(bytes / 1048576).toFixed(1)} MB`;
    },
  },
};
</script>

<style scoped>
.installer { display: flex; flex-direction: column; gap: 14px; }
.installer-header { display: flex; gap: 12px; align-items: center; }
.tool-icon { width: 40px; height: 40px; border-radius: 10px; }
.installer-header h3 { margin: 0; font-size: 18px; }
.installer-desc { margin: 2px 0 0; font-size: 12px; opacity: .68; }
.version-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.version-chip { padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(148,163,184,.35); background: transparent; color: inherit; cursor: pointer; font-size: 12px; }
.version-chip.selected { border-color: var(--accent, #14b8a6); color: var(--accent, #14b8a6); }
.warn-banner { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; background: rgba(245,158,11,.12); color: #b45309; font-size: 12px; }
.path-display { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-radius: 10px; background: rgba(148,163,184,.12); font-size: 12px; word-break: break-all; }
.progress-card { padding: 12px; border-radius: 12px; background: rgba(148,163,184,.1); }
.progress-header { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 8px; }
.progress-track { height: 6px; border-radius: 999px; background: rgba(148,163,184,.25); overflow: hidden; }
.progress-bar { height: 100%; background: var(--accent, #14b8a6); transition: width .3s; }
.progress-stats { display: flex; gap: 12px; font-size: 11px; opacity: .7; margin-top: 6px; }
.action-row { display: flex; gap: 10px; }
.btn-primary { flex: 1; padding: 10px 16px; border-radius: 10px; border: none; background: var(--accent, #14b8a6); color: #fff; font-weight: 600; cursor: pointer; }
.btn-primary:disabled { opacity: .55; cursor: not-allowed; }
.btn-cancel { padding: 10px 16px; border-radius: 10px; border: 1px solid rgba(148,163,184,.4); background: transparent; color: inherit; cursor: pointer; }
.status-bar { font-size: 12px; padding: 8px 12px; border-radius: 10px; background: rgba(148,163,184,.12); }
.status-bar.success { background: rgba(16,185,129,.12); color: #047857; }
.status-bar.error { background: rgba(239,68,68,.12); color: #b91c1c; }
</style>
