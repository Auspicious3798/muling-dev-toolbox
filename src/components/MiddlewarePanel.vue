<template>
  <div class="mw-panel">
    <div class="mw-head">
      <div class="mw-head-left">
        <img v-if="meta.icon" :src="meta.icon" class="mw-icon" alt=""/>
        <div>
          <h3>{{ meta.label }}</h3>
          <p class="mw-sub">{{ versions.length ? `${versions.length} 个版本已安装` : '点击安装开始使用' }}</p>
        </div>
      </div>
      <div class="mw-head-actions">
        <button class="mini-btn" @click="refresh" :disabled="loading" title="刷新">刷新</button>
        <button class="mw-install-btn" @click="$emit('install')">安装</button>
      </div>
    </div>

    <div class="mw-loc">
      <span class="mw-loc-label">{{ meta.label }} 安装位置</span>
      <code class="mw-loc-path">{{ root }}</code>
      <span class="mw-tag">沙箱</span>
    </div>

    <div v-if="!versions.length" class="mw-empty">
      <p>还没有装 {{ meta.label }}</p>
      <div class="mw-empty-actions">
        <button class="mw-cta" @click="$emit('install')">立即安装</button>
        <button class="mini-btn" @click="$emit('adopt')">电脑上已经有了，接管一下</button>
      </div>
      <p class="mw-hint">{{ meta.detail }}</p>
    </div>

    <div v-else class="mw-list">
      <div v-for="row in items" :key="row.version" class="mw-card" :class="{ running: row.running }">
        <div class="mw-card-top">
          <span class="mw-name">{{ meta.label }} {{ row.version }}</span>
          <div class="mw-pills">
            <span class="mw-pill port-pill" :class="{ 'is-editing': editing === row.version }" :title="editing === row.version ? '回车确认，Esc 取消' : '点击修改端口'" @click.stop="startEdit(row.version)">
              <template v-if="editing === row.version">
                <input class="mw-port-input" v-model="portDraft" @keydown.enter.prevent="commit(row.version)" @keydown.esc.prevent="cancelEdit" @blur="cancelEdit" ref="portInput" />
              </template>
              <template v-else>:{{ row.port }}</template>
            </span>
            <span v-if="row.running" class="mw-pill ok">运行中</span>
            <span v-else class="mw-pill idle">已停止</span>
          </div>
        </div>
        <div class="mw-card-actions">
          <button class="mini-btn" @click.stop="openDir(row.version)">打开目录</button>
          <button v-if="!row.running" class="mini-btn" @click.stop="start(row.version)" :disabled="busy">启动</button>
          <button v-else class="mini-btn" @click.stop="stop(row.version)" :disabled="busy">停止</button>
          <a v-if="row.running && row.console" class="mini-btn" :href="row.console" target="_blank" rel="noreferrer">打开控制台</a>
          <button class="mini-btn" @click.stop="viewLog(row.version)">查看日志</button>
        </div>
      </div>
    </div>

    <pre v-if="logLines.length" class="mw-log">{{ logLines.join('\n') }}</pre>
  </div>
</template>

<script>
import Lemon from '@/utils/lemon';
import { sandboxRoot, loadSandboxRoot } from '@/utils/sandbox';

const META = {
  nacos: {label: 'Nacos', icon: '/icons/nacos.svg', detail: '单机模式启动，控制台 http://127.0.0.1:8848/nacos（nacos / nacos）'},
  sentinel: {label: 'Sentinel', icon: '/icons/sentinel.svg', detail: '控制台 http://127.0.0.1:8858（sentinel / sentinel）'},
  rabbitmq: {label: 'RabbitMQ', icon: '/icons/Rabbitmq.svg', detail: '需要先装 Erlang；管理台 http://127.0.0.1:15672（guest / guest）'},
  minio: {label: 'MinIO', icon: '/icons/minio.svg', detail: 'API :9000，控制台 :9001（minioadmin / minioadmin）'},
  elasticsearch: {label: 'Elasticsearch', icon: '/icons/elasticsearch.svg', detail: '自带 JDK，首次启动 30-60 秒'},
  kibana: {label: 'Kibana', icon: '/icons/kibana.svg', detail: '需要先装好 Elasticsearch'},
};

export default {
  name: 'MiddlewarePanel',
  props: { tool: {type: String, required: true} },
  emits: ['install', 'adopt'],
  data() {
    return {
      loading: false, busy: false, versions: [], items: [],
      editing: '', portDraft: '', logLines: [],
    };
  },
  computed: {
    meta() { return META[this.tool] || {label: this.tool, icon: '', detail: ''}; },
    api() { return (window.electronAPI && window.electronAPI.middleware && window.electronAPI.middleware[this.tool]) || null; },
    root() { return sandboxRoot.value || '沙箱目录'; },
  },
  watch: { tool() { this.refresh(); } },
  mounted() { loadSandboxRoot(); this.refresh(); },
  methods: {
    async refresh() {
      if (!this.api) return;
      this.loading = true;
      try {
        const res = await this.api.check();
        this.versions = (res && res.versions) || [];
        const items = [];
        for (const v of this.versions) {
          const cfg = await this.api.config(v);
          const st = await this.api.status(v);
          items.push({
            version: v,
            port: (cfg && cfg.port) || (cfg && cfg.defaultPort) || 0,
            dir: (cfg && cfg.dir) || '',
            logPath: (cfg && cfg.logPath) || '',
            console: (cfg && cfg.console) || '',
            running: Boolean((st && st.status === 'running') || (cfg && cfg.running)),
          });
        }
        this.items = items;
      } catch (err) {
        Lemon.error('读取状态失败', err.message);
      } finally {
        this.loading = false;
      }
    },
    startEdit(v) {
      const row = this.items.find((it) => it.version === v);
      this.editing = v;
      this.portDraft = String((row && row.port) || '');
      this.$nextTick(() => {
        const el = Array.isArray(this.$refs.portInput) ? this.$refs.portInput[0] : this.$refs.portInput;
        if (el) { el.focus(); el.select(); }
      });
    },
    cancelEdit() { this.editing = ''; },
    async commit(v) {
      const port = Number(this.portDraft);
      const row = this.items.find((it) => it.version === v);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) { Lemon.warn('端口不对', '端口要填 1024-65535 之间的数字'); return; }
      if (row && row.port === port) { this.editing = ''; return; }
      try {
        const res = await this.api.setPort(v, port);
        if (res && res.success === false) { Lemon.error('端口没改成', res.message || '这个端口可能被占用了'); return; }
        if (row) row.port = port;
        this.editing = '';
        await this.refresh();
        Lemon.success(`端口已改成 ${port}`, '下次启动会按新端口运行');
      } catch (err) {
        Lemon.error('端口没改成', err.message);
      }
    },
    async openDir(v) {
      const row = this.items.find((it) => it.version === v);
      if (!row || !row.dir) { Lemon.info('还没装好', '装好之后就能直接打开目录了'); return; }
      try { await window.electronAPI.openSandboxDir(row.dir); } catch (err) { Lemon.error('打不开目录', err.message); }
    },
    async start(v) {
      this.busy = true;
      try {
        const res = await this.api.start(v);
        if (res && res.success === false) Lemon.error('启动失败', res.message || '请查看日志');
        else Lemon.success(`${this.meta.label} 已启动`, this.meta.detail);
        await this.refresh();
      } catch (err) {
        Lemon.error('启动失败', err.message);
      } finally { this.busy = false; }
    },
    async stop(v) {
      this.busy = true;
      try {
        await this.api.stop(v);
        await this.refresh();
        Lemon.info(`${this.meta.label} 已停止`);
      } catch (err) {
        Lemon.error('停止失败', err.message);
      } finally { this.busy = false; }
    },
    async viewLog(v) {
      try {
        const res = await this.api.log(v);
        const lines = (res && res.lines) || [];
        this.logLines = lines;
        if (!lines.length) Lemon.info('日志是空的', (res && res.path) || '还没有运行记录');
      } catch (err) { Lemon.error('读日志失败', err.message); }
    },
  },
};
</script>

<style scoped>
.mw-panel { display: flex; flex-direction: column; gap: 14px; }
.mw-head { display: flex; justify-content: space-between; align-items: center; }
.mw-head-left { display: flex; gap: 12px; align-items: center; }
.mw-icon { width: 36px; height: 36px; border-radius: 9px; }
.mw-head h3 { margin: 0; font-size: 18px; }
.mw-sub { margin: 2px 0 0; font-size: 12px; opacity: .65; }
.mw-head-actions { display: flex; gap: 8px; }
.mw-install-btn { padding: 8px 16px; border-radius: 10px; border: none; background: var(--accent, #14b8a6); color: #fff; font-weight: 600; cursor: pointer; }
.mw-loc { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-radius: 12px; background: rgba(148,163,184,.1); font-size: 12px; }
.mw-loc-path { flex: 1; word-break: break-all; opacity: .85; }
.mw-tag { padding: 2px 8px; border-radius: 999px; background: rgba(20,184,166,.15); color: var(--accent, #14b8a6); }
.mw-empty { text-align: center; padding: 40px 0; }
.mw-empty-actions { display: flex; gap: 10px; justify-content: center; margin: 12px 0; }
.mw-cta { padding: 8px 18px; border-radius: 10px; border: none; background: var(--accent, #14b8a6); color: #fff; cursor: pointer; }
.mw-hint { font-size: 12px; opacity: .6; max-width: 520px; margin: 0 auto; }
.mw-list { display: flex; flex-direction: column; gap: 12px; }
.mw-card { padding: 14px 16px; border-radius: 14px; border: 1px solid rgba(148,163,184,.22); }
.mw-card.running { border-color: rgba(20,184,166,.5); }
.mw-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.mw-name { font-weight: 600; }
.mw-pills { display: flex; gap: 8px; align-items: center; }
.mw-pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(148,163,184,.16); }
.mw-pill.ok { background: rgba(16,185,129,.16); color: #047857; }
.mw-pill.idle { background: rgba(148,163,184,.16); opacity: .8; }
.port-pill { cursor: pointer; }
.mw-port-input { width: 56px; border: none; background: transparent; color: inherit; font: inherit; outline: none; }
.mw-card-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.mini-btn { padding: 5px 10px; border-radius: 8px; border: 1px solid rgba(148,163,184,.35); background: transparent; color: inherit; font-size: 12px; cursor: pointer; text-decoration: none; }
.mw-log { max-height: 220px; overflow: auto; font-size: 11px; background: rgba(15,23,42,.6); color: #cbd5e1; padding: 10px; border-radius: 10px; }
</style>
