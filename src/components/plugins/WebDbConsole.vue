<template>
  <div class="wdb">
    <header class="wdb-head">
      <div class="wdb-title">
        <img class="wdb-brand" src="/art/brand-128.png" alt="沐柠环境盒"/>
        <div>
          <h2>{{ meta.title }}<span class="wdb-brand-tag">沐柠环境盒</span></h2>
          <p>{{ meta.subtitle }}</p>
        </div>
      </div>
      <span class="wdb-pill" :class="running ? 'is-running' : 'is-idle'">
        <span class="wdb-dot" aria-hidden="true"></span>
        {{ running ? 'Web 服务运行中' : 'Web 服务未启动' }}
      </span>
    </header>

    <div v-if="!hasApi" class="wdb-note">
      这个插件需要在环境盒桌面端里使用：启动 Web 服务、读取数据库密码都依赖本机主进程能力。
    </div>

    <template v-else>
      <div class="wdb-grid">
        <section class="wdb-card">
          <div class="wdb-card-head">
            <h3>Web 服务</h3>
            <span v-if="serverVersion" class="wdb-chip">{{ meta.label }} {{ serverVersion }}</span>
          </div>
          <div class="wdb-row">
            <span class="wdb-label">访问地址</span>
            <code class="wdb-value">{{ url || '—' }}</code>
            <button class="wdb-mini" type="button" :disabled="!running" @click="copyUrl">复制</button>
            <button class="wdb-mini" type="button" :disabled="!running" @click="openBrowser">打开</button>
          </div>
          <div class="wdb-row">
            <span class="wdb-label">Web 端口</span>
            <input v-model.number="portDraft" class="wdb-input" type="number" min="1024" max="65535" :disabled="busy"/>
            <button class="wdb-mini" type="button" :disabled="busy" @click="applyPort">应用</button>
            <span v-if="running" class="wdb-tip">运行中改端口需重启 Web 服务</span>
          </div>
          <div class="wdb-actions">
            <button v-if="!running" class="wdb-btn primary" type="button" :disabled="busy || !dbReady" @click="start">
              {{ busy ? '正在启动…' : '启动 Web 服务' }}
            </button>
            <button v-else class="wdb-btn danger" type="button" :disabled="busy" @click="stop">
              {{ busy ? '正在停止…' : '停止 Web 服务' }}
            </button>
            <button class="wdb-btn ghost" type="button" :disabled="busy" @click="load">刷新状态</button>
          </div>
          <p class="wdb-hint">
            服务只监听 127.0.0.1，地址里带一次性访问令牌；环境盒退出时会自动关闭。
          </p>
        </section>

        <section class="wdb-card">
          <div class="wdb-card-head">
            <h3>数据源</h3>
            <span class="wdb-chip" :class="{ 'is-idle': !versions.length }">{{ boundLabel }}</span>
          </div>
          <div class="wdb-row">
            <span class="wdb-label">绑定实例</span>
            <select
              v-model="version"
              class="wdb-select"
              :disabled="busy || running || !versions.length"
              @change="onVersionChange"
            >
              <option v-for="item in versions" :key="item" :value="item">{{ meta.label }} {{ item }}</option>
            </select>
            <span class="wdb-tip">仅限环境盒接管/安装的实例</span>
          </div>
          <div class="wdb-row">
            <span class="wdb-label">连接端口</span>
            <code class="wdb-value ro">{{ dbPort || '读取中…' }}</code>
          </div>
          <div class="wdb-row">
            <span class="wdb-label">{{ meta.passwordLabel }}</span>
            <code class="wdb-value ro">{{ passwordText }}</code>
            <button class="wdb-mini" type="button" :disabled="!passwordLoaded || !password" @click="showPassword = !showPassword">
              {{ showPassword ? '隐藏' : '显示' }}
            </button>
          </div>
          <div class="wdb-row">
            <span class="wdb-label">服务状态</span>
            <span class="wdb-chip" :class="serviceClass">{{ serviceText }}</span>
            <button
              v-if="serviceStatus !== 'running' && versions.length"
              class="wdb-mini"
              type="button"
              :disabled="busy"
              @click="startDbService"
            >启动 {{ meta.label }}</button>
          </div>
          <p v-if="!versions.length" class="wdb-warn">
            环境盒里还没有接管的 {{ meta.label }} 实例。先去左侧「{{ meta.label }}」页面安装或接管一个版本，再回来绑定。
          </p>
          <p v-else class="wdb-hint">
            端口和密码都直接读环境盒里这个实例的配置，不需要手填；要连别的库，请先在左侧把它接管进来。
            <template v-if="running">切换实例需先停止 Web 服务。</template>
          </p>
        </section>

        <section class="wdb-card wide">
          <div class="wdb-card-head">
            <h3>怎么用</h3>
          </div>
          <ol class="wdb-steps">
            <li v-for="(step, index) in meta.steps" :key="index">{{ step }}</li>
          </ol>
          <p class="wdb-hint">{{ meta.note }}</p>
        </section>
      </div>

      <p v-if="message" class="wdb-msg" :class="{ 'is-error': messageError }">{{ message }}</p>
    </template>
  </div>
</template>

<script>
const KIND_META = {
  mysql: {
    label: 'MySQL',
    title: 'Web MySQL',
    subtitle: '浏览器里的 MySQL 管理台：库、表结构、数据浏览和 SQL 控制台',
    passwordLabel: 'root 密码',
    steps: [
      '先在左侧「MySQL」页面装好或接管一个版本，需要时启动 MySQL 服务。',
      '回到这里在「数据源」里绑定这个实例，端口和密码由环境盒自动读取。',
      '点「启动 Web 服务」，环境盒会在本机 127.0.0.1 上开一个带令牌的管理台。',
      '点「打开」会拉起默认浏览器，可以像 Navicat 一样浏览表、筛选数据、执行 SQL。',
      '关掉环境盒或点「停止 Web 服务」，管理台立即失效。'
    ],
    note: '只能绑定环境盒接管或安装的 MySQL 实例；端口和 root 密码直接读环境盒配置，不需要手填。令牌每次启动都会更换。'
  },
  redis: {
    label: 'Redis',
    title: 'Web Redis',
    subtitle: '浏览器里的 Redis 工作台：键浏览、各类型编辑、TTL、命令行',
    passwordLabel: '访问密码',
    steps: [
      '先在左侧「Redis」页面装好或接管一个版本，需要时启动 Redis 服务。',
      '回到这里在「数据源」里绑定这个实例，端口和 requirepass 由环境盒自动读取。',
      '点「启动 Web 服务」，环境盒会在本机 127.0.0.1 上开一个带令牌的工作台。',
      '点「打开」拉起浏览器，可以按模式扫键、查看并编辑 string/hash/list/set/zset、调整 TTL。',
      '「命令行」页可以直接执行 Redis 命令，比如 GET、KEYS、INFO。'
    ],
    note: '只能绑定环境盒接管或安装的 Redis 实例；端口和密码直接读环境盒配置，不需要手填。所有请求都走 127.0.0.1。'
  }
};

export default {
  name: 'WebDbConsole',
  props: {
    kind: { type: String, required: true }
  },
  data() {
    return {
      hasApi: Boolean(window.electronAPI && window.electronAPI.webdbStart),
      busy: false,
      status: null,
      versions: [],
      version: '',
      dbPort: 0,
      password: '',
      passwordLoaded: false,
      showPassword: false,
      serviceStatus: 'unknown',
      portDraft: this.kind === 'mysql' ? 15811 : 15812,
      message: '',
      messageError: false,
      unsubscribe: null
    };
  },
  computed: {
    meta() {
      return KIND_META[this.kind] || KIND_META.mysql;
    },
    running() {
      return Boolean(this.status && this.status.running);
    },
    url() {
      return (this.status && this.status.url) || '';
    },
    serverVersion() {
      return (this.status && this.status.serverVersion) || '';
    },
    hasPassword() {
      return this.passwordLoaded && Boolean(this.password);
    },
    serviceText() {
      if (!this.versions.length) return '未安装';
      if (this.serviceStatus === 'running') return '运行中';
      if (this.serviceStatus === 'stopped') return '已停止';
      return '状态未知';
    },
    serviceClass() {
      if (this.serviceStatus === 'running') return 'is-running';
      if (this.serviceStatus === 'stopped') return 'is-idle';
      return '';
    },
    boundLabel() {
      if (!this.versions.length) return '未绑定实例';
      if (!this.version) return '待选择实例';
      return this.meta.label + ' ' + this.version;
    },
    passwordText() {
      if (!this.passwordLoaded) return '读取中…';
      if (!this.password) return '（空密码）';
      if (this.showPassword) return this.password;
      return '••••••••';
    },
    dbReady() {
      return Boolean(this.version) && this.versions.length > 0;
    }
  },
  mounted() {
    this.load();
    const api = window.electronAPI;
    if (api && api.onWebdbChanged) {
      this.unsubscribe = api.onWebdbChanged((payload) => {
        if (payload && payload.kind === this.kind) this.refreshStatus();
      });
    }
  },
  beforeUnmount() {
    if (typeof this.unsubscribe === 'function') this.unsubscribe();
  },
  methods: {
    note(text, isError) {
      this.message = text;
      this.messageError = Boolean(isError);
    },
    async load() {
      if (!this.hasApi) return;
      await this.refreshStatus();
      await this.loadVersions();
    },    async refreshStatus() {
      try {
        const result = await window.electronAPI.webdbStatus();
        const list = result && result.ok ? result.data : [];
        this.status = (list || []).find((item) => item.kind === this.kind) || null;
        if (this.status) this.portDraft = this.status.configuredPort || this.portDraft;
      } catch (err) {
        this.note('读取 Web 服务状态失败：' + err.message, true);
      }
    },
    async loadVersions() {
      const api = window.electronAPI;
      const check = this.kind === 'mysql' ? api.checkMySQL : api.checkRedis;
      if (!check) return;
      try {
        const result = await check();
        this.versions = (result && result.versions) || [];
        const saved = this.readSavedVersion();
        const pick = saved && this.versions.includes(saved)
          ? saved
          : ((result && result.default) || this.versions[0] || '');
        if (pick && !this.versions.includes(this.version)) this.version = pick;
        await this.loadInstanceInfo();
      } catch (err) {
        this.note('检测 ' + this.meta.label + ' 失败：' + err.message, true);
      }
    },
    readSavedVersion() {
      try {
        return window.localStorage.getItem('wdb.instance.' + this.kind) || '';
      } catch (err) {
        return '';
      }
    },
    onVersionChange() {
      try {
        window.localStorage.setItem('wdb.instance.' + this.kind, this.version);
      } catch (err) {
        // 记不住不影响使用
      }
      this.showPassword = false;
      this.loadInstanceInfo();
    },
    async loadInstanceInfo() {
      if (!this.version) return;
      const api = window.electronAPI;
      try {
        const config = this.kind === 'mysql'
          ? await api.getMySQLConfig(this.version)
          : await api.getRedisConfig(this.version);
        if (config && config.success) this.dbPort = Number(config.port) || 0;
      } catch (err) {
        this.dbPort = 0;
      }
      this.passwordLoaded = false;
      this.password = '';
      try {
        const secret = this.kind === 'mysql'
          ? await api.getMySQLPassword(this.version)
          : await api.getRedisPassword(this.version);
        this.password = secret && secret.success ? (secret.password || '') : '';
      } catch (err) {
        this.password = '';
      } finally {
        this.passwordLoaded = true;
      }
      const statusFn = this.kind === 'mysql' ? api.getMySQLServiceStatus : api.getRedisServiceStatus;
      try {
        const result = statusFn ? await statusFn(this.version) : null;
        this.serviceStatus = result && result.success ? result.status : 'unknown';
      } catch (err) {
        this.serviceStatus = 'unknown';
      }
    },
    async start() {
      if (!this.version) {
        this.note('先绑定一个 ' + this.meta.label + ' 实例', true);
        return;
      }
      this.busy = true;
      this.note('');
      try {
        const conn = {
          host: '127.0.0.1',
          port: Number(this.dbPort) || (this.kind === 'mysql' ? 3306 : 6379),
          password: this.password,
          user: this.kind === 'mysql' ? 'root' : '',
          db: 0,
          version: this.version
        };
        const result = await window.electronAPI.webdbStart({
          kind: this.kind,
          conn,
          port: Number(this.portDraft) || undefined
        });
        if (result && result.ok) {
          this.note('Web 服务已启动：' + result.url);
          await this.refreshStatus();
        } else {
          const raw = (result && result.message) || '启动失败';
          const hint = /access denied|authentication failed|invalid password|WRONGPASS/i.test(raw)
            ? '。端口和密码读取自环境盒，确认这个实例的密码是否与配置一致，或换一个已接管的实例'
            : '';
          this.note(raw + hint, true);
        }
      } catch (err) {
        this.note('启动失败：' + err.message, true);
      } finally {
        this.busy = false;
      }
    },
    async stop() {
      this.busy = true;
      try {
        const result = await window.electronAPI.webdbStop(this.kind);
        if (result && result.ok) {
          this.note('Web 服务已停止');
          await this.refreshStatus();
        } else {
          this.note((result && result.message) || '停止失败', true);
        }
      } catch (err) {
        this.note('停止失败：' + err.message, true);
      } finally {
        this.busy = false;
      }
    },
    async openBrowser() {
      try {
        const result = await window.electronAPI.webdbOpen(this.kind);
        if (!result || !result.ok) this.note((result && result.message) || '打开失败', true);
      } catch (err) {
        this.note('打开失败：' + err.message, true);
      }
    },
    async copyUrl() {
      if (!this.url) return;
      try {
        await navigator.clipboard.writeText(this.url);
        this.note('地址已复制到剪贴板，记得要带着令牌一起打开');
      } catch (err) {
        this.note('复制失败：' + err.message, true);
      }
    },
    async applyPort() {
      const port = Number(this.portDraft);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        this.note('Web 端口必须在 1024-65535 之间', true);
        return;
      }
      try {
        const result = await window.electronAPI.webdbSetPort(this.kind, port);
        if (result && result.ok) {
          this.note('Web 端口已保存为 ' + port + (this.running ? '，重启 Web 服务后生效' : ''));
          await this.refreshStatus();
        } else {
          this.note((result && result.message) || '保存端口失败', true);
        }
      } catch (err) {
        this.note('保存端口失败：' + err.message, true);
      }
    },
    async startDbService() {
      const api = window.electronAPI;
      const start = this.kind === 'mysql' ? api.startMySQLService : api.startRedisService;
      if (!start) return;
      this.busy = true;
      try {
        const result = await start(this.version);
        if (result && result.success) {
          this.note(this.meta.label + ' 服务已启动');
        } else {
          this.note((result && result.message) || '启动 ' + this.meta.label + ' 失败', true);
        }
        await this.loadInstanceInfo();
      } catch (err) {
        this.note('启动 ' + this.meta.label + ' 失败：' + err.message, true);
      } finally {
        this.busy = false;
      }
    }
  }
};
</script>

<style scoped>
.wdb { display: flex; flex-direction: column; gap: 16px; padding-bottom: 24px; }

.wdb-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.wdb-title { display: flex; align-items: center; gap: 12px; }
.wdb-brand { width: 34px; height: 34px; border-radius: 9px; object-fit: contain; flex-shrink: 0; }
.wdb-title h2 { margin: 0; font-size: 18px; color: var(--text-primary); display: flex; align-items: center; gap: 8px; }
.wdb-brand-tag { font-size: 10.5px; font-weight: 500; letter-spacing: 0.02em; padding: 1px 7px; border-radius: 4px; border: 1px solid var(--border-medium); color: var(--text-muted); }
.wdb-title p { margin: 2px 0 0; font-size: 12.5px; color: var(--text-secondary); }

.wdb-pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-light); font-size: 12px; color: var(--text-secondary); background: var(--bg-secondary); }
.wdb-pill.is-running { color: var(--success-text); border-color: var(--success-border); background: var(--success-bg); }
.wdb-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted); }
.wdb-pill.is-running .wdb-dot { background: var(--success); box-shadow: 0 0 0 3px var(--success-bg); }

.wdb-note { padding: 16px 18px; border-radius: var(--radius-lg); border: 1px solid var(--warning-border); background: var(--warning-bg); color: var(--warning-text); font-size: 13px; }

.wdb-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; align-items: start; }
.wdb-card { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-light); background: var(--bg-solid); }
.wdb-card.wide { grid-column: 1 / -1; }
.wdb-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.wdb-card h3 { margin: 0; font-size: 13px; color: var(--text-primary); letter-spacing: 0.02em; }
.wdb-chip { font-size: 11px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border-light); color: var(--text-secondary); background: var(--bg-secondary); }
.wdb-chip.is-running { color: var(--success-text); border-color: var(--success-border); background: var(--success-bg); }
.wdb-chip.is-idle { color: var(--text-muted); }

.wdb-row { display: flex; align-items: center; gap: 8px; min-height: 28px; flex-wrap: wrap; }
.wdb-label { width: 66px; flex-shrink: 0; font-size: 12px; color: var(--text-muted); }
.wdb-value { flex: 1; min-width: 0; padding: 4px 8px; border-radius: var(--radius-sm); background: var(--bg-secondary); border: 1px solid var(--border-light); font-family: var(--font-mono); font-size: 11.5px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wdb-value.mono { flex: 0 1 auto; letter-spacing: 0.04em; }
.wdb-value.ro { flex: 1; background: transparent; border-style: dashed; color: var(--text-secondary); cursor: default; }
.wdb-input, .wdb-select { width: 120px; padding: 4px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-medium); background: var(--bg-input); color: var(--text-primary); font-size: 12px; }
.wdb-input.short { width: 96px; }
.wdb-input.mono { flex: 1 1 160px; min-width: 120px; width: auto; font-family: var(--font-mono); letter-spacing: 0.04em; }
.wdb-select { width: auto; min-width: 120px; }
.wdb-input:focus-visible, .wdb-select:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }

.wdb-mini { border: 1px solid var(--border-medium); background: transparent; color: var(--text-secondary); border-radius: var(--radius-sm); padding: 3px 9px; font-size: 11.5px; cursor: pointer; transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast); }
.wdb-mini:hover:not(:disabled) { color: var(--primary); border-color: var(--primary); background: var(--primary-light); }
.wdb-mini:disabled { opacity: 0.45; cursor: not-allowed; }

.wdb-actions { display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }
.wdb-btn { padding: 7px 16px; border-radius: var(--radius-md); border: 1px solid var(--border-medium); background: var(--bg-secondary); color: var(--text-primary); font-size: 12.5px; cursor: pointer; transition: background var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast); }
.wdb-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.wdb-btn:active:not(:disabled) { transform: translateY(1px); }
.wdb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.wdb-btn.primary { background: var(--primary); border-color: var(--primary); color: var(--text-inverse); }
.wdb-btn.primary:hover:not(:disabled) { background: var(--primary-hover); color: var(--text-inverse); }
.wdb-btn.danger { color: var(--danger-text); border-color: var(--danger-border); background: var(--danger-bg); }
.wdb-btn.danger:hover:not(:disabled) { color: var(--danger-text); border-color: var(--danger); }

.wdb-hint { margin: 0; font-size: 11.5px; color: var(--text-muted); line-height: 1.6; }
.wdb-tip { font-size: 11.5px; color: var(--text-muted); }
.wdb-warn { margin: 0; font-size: 12px; color: var(--warning-text); }
.wdb-steps { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--text-secondary); line-height: 1.7; }

.wdb-msg { margin: 0; padding: 10px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-light); background: var(--bg-secondary); color: var(--text-secondary); font-size: 12px; word-break: break-all; }
.wdb-msg.is-error { color: var(--danger-text); border-color: var(--danger-border); background: var(--danger-bg); }

@media (max-width: 760px) {
  .wdb-label { width: 56px; }
  .wdb-grid { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .wdb-btn, .wdb-mini { transition: none; }
}
</style>
