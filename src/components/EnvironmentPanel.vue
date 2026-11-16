<template>
  <div class="environment-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="title-section">
        <div class="tool-icon-wrap">
          <img v-if="toolIconPath" :src="toolIconPath" class="tool-icon-img" alt=""/>
          <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
        <div>
          <h3>{{ toolLabel }}</h3>
          <p class="panel-subtitle">{{ loading ? '扫描中...' : (versions.length > 0 ? versions.length + ' 个版本已安装' : '点击安装开始使用') }}</p>
        </div>
      </div>
      <div class="header-actions">
        <button @click="refresh" class="refresh-btn" :disabled="loading" title="刷新">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" :class="{ spinning: loading }"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
        <button class="install-btn" @click="$emit('install')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          安装
        </button>
      </div>
    </div>

    <!-- Warning banner -->
    <div v-if="apiMissing && tool !== 'maven'" class="warn-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span>当前工具暂未支持检测，敬请期待</span>
    </div>

    <!-- Sandbox location row -->
    <div v-if="sandboxInfo" class="sandbox-row">
      <div class="sandbox-row-main">
        <span class="sandbox-row-label">{{ toolLabel }} 安装位置</span>
        <code class="sandbox-row-path" :title="toolRoot">{{ toolRoot }}</code>
        <span class="sandbox-row-tag">沙箱</span>
      </div>
      <div class="sandbox-row-actions">
        <button v-if="toolInjectable" class="mini-btn" :class="{ on: injected }" :disabled="actionLoading" @click="toggleInjection">
          {{ injected ? '已注入 · 撤出系统变量' : '注入系统变量' }}
        </button>
        <button class="mini-btn" @click="openTerminal">在环境终端使用</button>
        <button v-if="hasServiceLog" class="mini-btn" @click="viewServiceLog">查看运行日志</button>
        <button v-if="canCopyConnection" class="mini-btn" @click="copyConnectionString">复制连接串</button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="versions.length === 0 && !loading" class="empty-state">
      <img class="empty-art" src="/art/scene-empty-card.png" alt=""/>
      <p>未检测到已安装的 {{ toolLabel }}</p>
      <div class="empty-actions">
        <button class="empty-cta" @click="$emit('install')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          立即安装
        </button>
        <button class="empty-ghost" @click="adoptExisting" :disabled="adopting">
          电脑上已经有了，接管一下
        </button>
      </div>
      <p class="empty-hint">接管后不会移动或复制你的文件，只是把它登记进沐柠，一起参与版本切换。</p>
    </div>

    <!-- Version grid -->
    <div v-else-if="versions.length > 0" class="versions-grid">
      <div v-for="(v, idx) in versions" :key="v" class="env-tile" :class="{ 'is-default': v === defaultVersion, 'is-running': serviceStatus[v] === 'running', 'is-clickable': v !== defaultVersion && !actionLoading }" :style="{ animationDelay: idx * 45 + 'ms' }" @click="onTileClick(v)">
        <!-- Top row: icon + name + status -->
        <div class="tile-top">
          <div class="tile-icon">
            <img v-if="toolIconPath" :src="toolIconPath" class="tile-icon-img" alt=""/>
            <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          </div>
          <div class="tile-info">
            <span class="tile-name">{{ toolLabel }} {{ v }}</span>
            <div class="tile-meta-row">
              <!-- MySQL info pills -->
              <template v-if="tool === 'mysql'">
                <span class="meta-pill port-pill" :class="{ 'is-editing': editingPort === v }" :title="editingPort === v ? '输入新端口后回车' : '点击修改端口'" @click.stop="startEditPort(v)">
                  <template v-if="editingPort === v">
                    <input class="port-input" v-model="portDraft" type="text" inputmode="numeric" @click.stop @keyup.enter="commitPort(v)" @keyup.esc="cancelPort" @blur="commitPort(v)" />
                  </template>
                  <template v-else>:{{ mysqlConfigs[v]?.port || '?' }}</template>
                </span>
                <span class="meta-pill" v-if="mysqlConfigs[v]?.hasPassword === true">有密码</span>
                <span class="meta-pill subtle" v-else>无密码</span>
              </template>
              <!-- Redis info pills -->
              <template v-else-if="tool === 'redis'">
                <span class="meta-pill port-pill" :class="{ 'is-editing': editingPort === v }" :title="editingPort === v ? '输入新端口后回车' : '点击修改端口'" @click.stop="startEditPort(v)">
                  <template v-if="editingPort === v">
                    <input class="port-input" v-model="portDraft" type="text" inputmode="numeric" @click.stop @keyup.enter="commitPort(v)" @keyup.esc="cancelPort" @blur="commitPort(v)" />
                  </template>
                  <template v-else>:{{ redisConfigs[v]?.port || '?' }}</template>
                </span>
                <span class="meta-pill" v-if="redisConfigs[v]?.hasPassword">有密码</span>
                <span class="meta-pill subtle" v-else>无密码</span>
              </template>
              <span v-else class="tile-meta">{{ v === defaultVersion ? '当前默认版本' : '点击卡片设为默认' }}</span>
            </div>
          </div>
          <div class="tile-badges">
            <span v-if="v === defaultVersion" class="default-pill">默认</span>
            <span v-if="serviceStatus[v] === 'running'" class="status-dot running" title="运行中"></span>
            <span v-else-if="serviceStatus[v] === 'stopped'" class="status-dot stopped" title="已停止"></span>
          </div>
        </div>

        <!-- Actions row -->
        <div class="tile-actions">
          <button @click.stop="openFolder(v)" class="act-btn icon-btn" :disabled="actionLoading" title="打开安装目录">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button @click.stop="openVersionTerminal(v)" class="act-btn icon-btn" :disabled="actionLoading" title="在此版本环境打开终端">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          </button>
          <button v-if="tool === 'mysql' || tool === 'redis'" @click.stop="toggleService(v)"
                  :class="['act-btn', serviceStatus[v] === 'running' ? 'ghost danger' : 'ghost success']" :disabled="actionLoading">
            <svg v-if="serviceStatus[v] !== 'running'" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="6" height="16" rx="1"/><rect x="14" y="4" width="6" height="16" rx="1"/></svg>
            {{ serviceStatus[v] === 'running' ? '停止' : '启动' }}
          </button>
          <button v-if="tool === 'redis' || tool === 'mysql'" @click.stop="tool === 'redis' ? openPasswordModal(v) : openMySQLPasswordModal(v)"
                  class="act-btn ghost" :disabled="actionLoading">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
            密码
          </button>
          <button v-if="tool === 'python'" @click.stop="openPackageManager(v)" class="act-btn ghost" :disabled="actionLoading">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            包管理
          </button>
          <button @click.stop="uninstallVersion(v)" class="act-btn ghost danger" :disabled="actionLoading">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            卸载
          </button>
        </div>
      </div>

      <div class="adopt-tile" v-if="adoptSupported" :class="{ loading: adopting }" @click="adoptExisting">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/></svg>
        <span>{{ adopting ? '正在扫描…' : '接管电脑上已有的' }}</span>
      </div>
    </div>

    <div class="adopt-panel" v-if="adoptCandidates.length">
      <div class="adopt-head">
        <span>发现 {{ adoptCandidates.length }} 个已安装的 {{ toolLabel }}</span>
        <button class="adopt-close" @click="adoptCandidates = []">×</button>
      </div>
      <div class="adopt-item" v-for="item in adoptCandidates" :key="item.dir">
        <div class="adopt-info">
          <span class="adopt-version">{{ item.version || '版本未知' }}</span>
          <span class="adopt-path">{{ item.dir }}</span>
        </div>
        <button class="adopt-btn" :disabled="adopting || item.registered" @click="adoptOne(item)">
          {{ item.registered ? '已接管' : '接管' }}
        </button>
      </div>
    </div>

    <div class="adopt-admin" v-if="adoptNeedsAdmin">
      <div class="adopt-admin-text">
        系统 PATH 里还有 {{ conflicts.systemEntries.length }} 条旧的 {{ toolLabel }} 路径，它排在用户 PATH 前面，重开终端后仍会优先用旧的：
        <span class="adopt-admin-list">{{ conflicts.systemEntries.join(' ; ') }}</span>
      </div>
      <button class="adopt-btn" :disabled="fixingAdmin" @click="fixAdoptAdmin">
        {{ fixingAdmin ? '正在请求授权…' : '以管理员身份清理' }}
      </button>
    </div>

    <!-- Redis Password Modal -->
    <div v-if="showPasswordModal" class="modal-overlay" @click.self="closePasswordModal">
      <div class="modal-card">
        <h4>修改 Redis 密码</h4>
        <div class="modal-field">
          <label>旧密码（若无则留空）</label>
          <input type="password" v-model="oldRedisPassword"/>
        </div>
        <div class="modal-field">
          <label>新密码</label>
          <input type="password" v-model="newRedisPassword"/>
        </div>
        <div class="modal-actions">
          <button @click="changeRedisPassword" :disabled="passwordChanging" class="modal-btn primary">确认修改</button>
          <button @click="closePasswordModal" class="modal-btn secondary">取消</button>
        </div>
      </div>
    </div>

    <!-- MySQL Password Modal -->
    <div v-if="showMySQLPasswordModal" class="modal-overlay" @click.self="closeMySQLPasswordModal">
      <div class="modal-card">
        <h4>修改 MySQL root 密码</h4>
        <div class="saved-pw" v-if="savedMySQLPassword !== null">
          <span class="saved-pw-label">沐柠记录的密码</span>
          <code class="saved-pw-value">{{ savedMySQLPassword || '（空密码）' }}</code>
          <button type="button" class="saved-pw-copy" @click="copySavedPassword">复制</button>
        </div>
        <p class="saved-pw-hint" v-else>这一版不是用沐柠装的，或者还没记录过密码。</p>
        <div class="modal-field">
          <label>旧密码（若无则留空）</label>
          <div class="password-wrap">
            <input :type="showMySQLPassword ? 'text' : 'password'" v-model="oldMySQLPassword"/>
            <button type="button" @click="showMySQLPassword = !showMySQLPassword" class="toggle-pw">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
        <div class="modal-field">
          <label>新密码</label>
          <div class="password-wrap">
            <input :type="showMySQLPassword ? 'text' : 'password'" v-model="newMySQLPassword"/>
            <button type="button" @click="showMySQLPassword = !showMySQLPassword" class="toggle-pw">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
        <div class="modal-actions">
          <button @click="changeMySQLPassword" :disabled="mysqlPasswordChanging" class="modal-btn primary">确认修改</button>
          <button @click="closeMySQLPasswordModal" class="modal-btn secondary">取消</button>
        </div>
      </div>
    </div>

    <PackageManager v-if="showPackageManager" :version="selectedPythonVersion" @close="closePackageManager"/>

    <!-- Service log modal -->
    <div v-if="showServiceLog" class="modal-overlay" @click.self="showServiceLog = false">
      <div class="modal-card log-card">
        <h4>{{ toolLabel }} 运行日志</h4>
        <p class="log-path">{{ serviceLog.path }}</p>
        <pre class="log-body">{{ serviceLog.lines.length ? serviceLog.lines.join('\n') : '（日志是空的）' }}</pre>
        <div class="modal-actions">
          <button @click="showServiceLog = false" class="modal-btn primary">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import AIIcon from '../../public/icons/AI.svg?url';
import CIcon from '../../public/icons/c.svg?url';
import ElasticsearchIcon from '../../public/icons/elasticsearch.svg?url';
import GolangIcon from '../../public/icons/Golang.svg?url';
import GradleIcon from '../../public/icons/gradle.svg?url';
import JavaIcon from '../../public/icons/java.svg?url';
import JupyterIcon from '../../public/icons/Jupyter.svg?url';
import KibanaIcon from '../../public/icons/kibana.svg?url';
import MavenIcon from '../../public/icons/maven.svg?url';
import MinicondaIcon from '../../public/icons/Miniconda.svg?url';
import MinioIcon from '../../public/icons/minio.svg?url';
import MysqlIcon from '../../public/icons/mysql.svg?url';
import NacosIcon from '../../public/icons/nacos.svg?url';
import NginxIcon from '../../public/icons/nginx.svg?url';
import OllamaIcon from '../../public/icons/Ollama.svg?url';
import PythonIcon from '../../public/icons/Python.svg?url';
import RabbitmqIcon from '../../public/icons/Rabbitmq.svg?url';
import RedisIcon from '../../public/icons/Redis.svg?url';
import SentinelIcon from '../../public/icons/sentinel.svg?url';
import DashboardIcon from '../../public/icons/Dashboard.svg?url';
import LemonIcon from '../../public/icons/lemon.svg?url';
import SettingsIcon from '../../public/icons/setting.svg?url';
import PackageManager from './PackageManager.vue';
import eventBus from '../eventBus';
import Lemon from '@/utils/lemon';

export default {
  name: 'EnvironmentPanel',
  components: { PackageManager },
  props: { tool: { type: String, required: true } },
  data() {
    return {
      loading: false, versions: [], defaultVersion: null,
      serviceStatus: {}, redisConfigs: {}, actionLoading: false, apiMissing: false,
      showPasswordModal: false, currentVersionForPassword: null,
      showServiceLog: false, serviceLog: {path: '', lines: []},
      oldRedisPassword: '', newRedisPassword: '', passwordChanging: false,
      showPackageManager: false, selectedPythonVersion: '',
      mysqlConfigs: {},
      showMySQLPasswordModal: false, currentMySQLVersion: null,
      oldMySQLPassword: '', newMySQLPassword: '', mysqlPasswordChanging: false, showMySQLPassword: false, savedMySQLPassword: null,
      sandboxInfo: null, injected: false,
      adoptCandidates: [], adopting: false, adoptHandler: null,
      adoptNeedsAdmin: '', fixingAdmin: false,
      conflicts: { supported: false, userEntries: [], systemEntries: [] },
      lastCleanAt: '',
      editingPort: null, portDraft: '', portSaving: false
    };
  },
  computed: {
    toolLabel() {
      const m = { jdk:'JDK',python:'Python',mysql:'MySQL',redis:'Redis',maven:'Maven',gradle:'Gradle',uv:'uv',nodejs:'Node.js',nacos:'Nacos',sentinel:'Sentinel',rabbitmq:'RabbitMQ',miniconda:'Miniconda',jupyter:'Jupyter Lab',ollama:'Ollama',go:'Go',mingw:'MinGW',nginx:'Nginx',minio:'MinIO',elasticsearch:'Elasticsearch',kibana:'Kibana' };
      return m[this.tool] || this.tool.toUpperCase();
    },
    toolIconPath() {
      const p = { jdk:JavaIcon,python:PythonIcon,mysql:MysqlIcon,redis:RedisIcon,maven:MavenIcon,gradle:GradleIcon,uv:'/icons/uv.svg',nodejs:'/icons/nodejs.svg',nacos:NacosIcon,sentinel:SentinelIcon,rabbitmq:RabbitmqIcon,miniconda:MinicondaIcon,jupyter:JupyterIcon,ollama:OllamaIcon,go:GolangIcon,mingw:CIcon,nginx:NginxIcon,minio:MinioIcon,elasticsearch:ElasticsearchIcon,kibana:KibanaIcon,dashboard:DashboardIcon,settings:SettingsIcon,about:LemonIcon,'ai-assistant':AIIcon };
      return p[this.tool] || null;
    },
    checkMethod() { const m={jdk:'checkJDK',python:'checkPython',mysql:'checkMySQL',redis:'checkRedis',maven:'checkMaven',gradle:'checkGradle',uv:'checkUv',nodejs:'checkNodejs'}; return m[this.tool]; },
    switchMethod() { const m={jdk:'switchJDK',python:'switchPython',mysql:'switchMySQL',redis:'switchRedis',maven:'switchMaven',gradle:'switchGradle',uv:'switchUv',nodejs:'switchNodejs'}; return m[this.tool]; },
    hasServiceLog() { return ['mysql','redis','nginx'].includes(this.tool); },
    canCopyConnection() { return ['mysql','redis'].includes(this.tool); },
    adoptSupported() { return !!window.electronAPI.detectExistingInstalls && ['jdk','python','mysql','redis','maven','gradle','uv','nodejs','nginx'].includes(this.tool); },
    deleteMethod() { const m={jdk:'deleteJDK',python:'deletePython',mysql:'deleteMySQL',redis:'deleteRedis',maven:'uninstallMaven',gradle:'uninstallGradle',nodejs:'uninstallNodejs',uv:'uninstallUv'}; return m[this.tool]; },
    startServiceMethod() { return this.tool==='mysql'?'startMySQLService':'startRedisService'; },
    stopServiceMethod() { return this.tool==='mysql'?'stopMySQLService':'stopRedisService'; },
    getServiceStatusMethod() { return this.tool==='mysql'?'getMySQLServiceStatus':'getRedisServiceStatus'; },
    changePasswordMethod() { return this.tool==='mysql'?'changeMySQLPassword':'changeRedisPassword'; },
    sandboxTool() { return (this.sandboxInfo && this.sandboxInfo.tools && this.sandboxInfo.tools[this.tool]) || null; },
    toolRoot() { return this.sandboxTool ? this.sandboxTool.root : ''; },
    toolInjectable() { return !!(this.sandboxTool && this.sandboxTool.injectable); }
  },
  watch: { tool: { immediate: true, handler() { this.refresh(); } } },
  mounted() {
    this.adoptHandler = (tool) => {
      if (tool === this.tool) this.adoptExisting();
    };
    eventBus.on('adopt:open', this.adoptHandler);
    this._unsubs = [];
    if (window.electronAPI) {
      this._unsubs.push(window.electronAPI.onJDKChanged?.(() => { if (this.tool==='jdk') this.refresh(); }));
      this._unsubs.push(window.electronAPI.onPythonChanged?.(() => { if (this.tool==='python') this.refresh(); }));
      this._unsubs.push(window.electronAPI.onMySQLChanged?.(() => { if (this.tool==='mysql') this.refresh(); }));
      this._unsubs.push(window.electronAPI.onRedisChanged?.(() => { if (this.tool==='redis') this.refresh(); }));
      this._unsubs.push(window.electronAPI.onMavenChanged?.(() => { if (this.tool==='maven') this.refresh(); }));
      this._unsubs.push(window.electronAPI.onGradleChanged?.(() => { if (this.tool==='gradle') this.refresh(); }));
      this._unsubs.push(window.electronAPI.onUvChanged?.(() => { if (this.tool==='uv') this.refresh(); }));
    this._unsubs.push(window.electronAPI.onNodejsChanged?.(() => { if (this.tool==='nodejs') this.refresh(); }));
      this._unsubs.push(window.electronAPI.onSandboxChanged?.(() => this.loadSandbox()));
    }
  },
  unmounted() {
    if (this.adoptHandler) { try { eventBus.off('adopt:open', this.adoptHandler); } catch (e) {} }
    (this._unsubs || []).forEach((u) => { try { u && u(); } catch (e) {} });
  },
  methods: {
    async adoptExisting() {
      if (this.adopting) return;
      this.adopting = true;
      try {
        const r = await window.electronAPI.detectExistingInstalls();
        if (!r || !r.success) {
          Lemon.error((r && r.message) || '扫描本机环境失败');
          return;
        }
        const list = (r.data || []).filter((item) => item.tool === this.tool);
        if (!list.length) {
          Lemon.info(`没在系统里找到已安装的 ${this.toolLabel}，可以先点「立即安装」～`);
          return;
        }
        this.adoptCandidates = list;
      } catch (err) {
        Lemon.error(`扫描失败：${err.message}`);
      } finally {
        this.adopting = false;
      }
    },
    async loadConflicts() {
      const api = window.electronAPI || {};
      if (!api.envConflicts) return;
      try {
        const r = await api.envConflicts(this.tool);
        if (!r || !r.success || !r.data) return;
        this.conflicts = r.data;
        const sys = (r.data.systemEntries || []);
        this.adoptNeedsAdmin = sys.length ? this.tool : '';
        const last = r.data.lastResult;
        if (last && last.tool === this.tool && last.at && last.at !== this.lastCleanAt) {
          this.lastCleanAt = last.at;
          if (last.removed) Lemon.success(`已以管理员身份清掉 ${last.removed} 条系统 PATH 旧条目，重开终端就生效`);
          else if (!last.ok) Lemon.info(`提权清理没成功：${last.message || '未知原因'}`);
          else Lemon.info('系统 PATH 里已经没有该工具的旧条目了');
        }
      } catch (err) {
        // 读不到冲突信息不影响主流程
      }
    },
    async fixAdoptAdmin() {
      const api = window.electronAPI || {};
      if (!api.adoptEnvElevated) { Lemon.error('当前环境不支持提权清理'); return; }
      this.fixingAdmin = true;
      try {
        const r = await api.adoptEnvElevated(this.tool);
        if (r && r.success) {
          Lemon.success(r.message || '已请求管理员权限');
          // 等 UAC 那边的进程跑完再回来刷新，拿到清理回执
          [3000, 7000, 12000].forEach((delay) => setTimeout(() => this.loadConflicts(), delay));
        } else {
          Lemon.error((r && r.message) || '提权失败，可右键程序「以管理员身份运行」后重试');
        }
      } catch (err) {
        Lemon.error(`提权失败：${err.message}`);
      } finally {
        this.fixingAdmin = false;
      }
    },
    async adoptOne(item) {
      if (this.adopting || item.registered) return;
      this.adopting = true;
      try {
        const r = await window.electronAPI.adoptExistingInstall(this.tool, item.dir, item.version);
        if (!r || !r.success) {
          Lemon.error((r && r.message) || '接管失败');
          return;
        }
        Lemon.success(`已接管 ${this.toolLabel} ${r.data.version}，文件还在原来的位置，环境变量也交给环境盒管了～`);
        const notes = (r.data && r.data.messages) || [];
        notes.forEach((line, i) => setTimeout(() => Lemon.info(line), 600 * (i + 1)));
        this.adoptNeedsAdmin = notes.some((line) => String(line).includes('系统 PATH 里还有')) ? this.tool : '';
        this.loadConflicts();
        this.adoptCandidates = [];
        await this.refresh();
      } catch (err) {
        Lemon.error(`接管失败：${err.message}`);
      } finally {
        this.adopting = false;
      }
    },
    async refresh() {
      if (this.loading) return;
      this.loading=true; this.apiMissing=false; eventBus.emit('scan-start', this.toolLabel);
      this.loadSandbox();
      this.loadConflicts();
      try {
        const api = window.electronAPI[this.checkMethod];
        if (!api) { this.apiMissing=true; eventBus.emit('scan-end'); return; }
        const r=await api(); this.versions=r.versions||[]; this.defaultVersion=r.default||null;
        if (['mysql','redis'].includes(this.tool)) await this.refreshAllServiceStatus();
        if (this.tool==='redis') await this.refreshRedisConfigs();
        if (this.tool==='mysql') await this.refreshMySQLConfigs();
      } catch (err) { console.error(`${this.toolLabel} 检测失败`, err); if(err.message&&err.message.includes('is not a function')) this.apiMissing=true; }
      finally { this.loading=false; eventBus.emit('scan-end'); }
    },
    async refreshAllServiceStatus() {
      if (!['mysql','redis'].includes(this.tool)) return;
      const a=window.electronAPI[this.getServiceStatusMethod]; if(!a) return;
      for(const v of this.versions) { try{ const r=await a(v); this.serviceStatus[v]=r.success?r.status:'unknown'; } catch { this.serviceStatus[v]='unknown'; } }
    },
    async refreshRedisConfigs() {
      if (this.tool!=='redis') return;
      for(const v of this.versions) { try{ const r=await window.electronAPI.getRedisConfig(v); this.redisConfigs[v]=r.success?{port:r.port,hasPassword:r.hasPassword}:{port:'未知',hasPassword:false}; } catch { this.redisConfigs[v]={port:'未知',hasPassword:false}; } }
    },
    async refreshMySQLConfigs() {
      if (this.tool!=='mysql') return;
      for(const v of this.versions) { try{ const r=await window.electronAPI.getMySQLConfig(v); this.mysqlConfigs[v]=r.success?{port:r.port,hasPassword:r.hasPassword}:{port:'未知',hasPassword:null}; } catch { this.mysqlConfigs[v]={port:'未知',hasPassword:null}; } }
    },
    async switchVersion(version) {
      if(this.actionLoading) return false; this.actionLoading=true;
      try {
        const a=window.electronAPI[this.switchMethod]; if(!a) return false;
        const r=await a(version);
        if(r.success) { Lemon.success(`${this.toolLabel} 已经换到 ${version} 啦～`); await this.refresh(); return true; }
        Lemon.error(r.message || `切换到 ${version} 没成功，要不再试一次？`);
        return false;
      } catch (err) { Lemon.error(`切换失败了：${err.message}`); return false; }
      finally { this.actionLoading=false; }
    },
    async uninstallVersion(version) {
      if(this.actionLoading) return;
      if(!confirm(`确定要卸载 ${this.toolLabel} ${version} 吗？此操作不可撤销。`)) return;
      this.actionLoading=true;
      try { const a=window.electronAPI[this.deleteMethod]; if(!a) return; const r=await a(version);
        if(r.success) { Lemon.success(`${this.toolLabel} ${version} 已经搬走啦～`); await this.refresh(); }
        else Lemon.error(r.message || '卸载没成功，可能是文件夹被占用了');
      } catch (err) { Lemon.error(`卸载失败了：${err.message}`); }
      finally { this.actionLoading=false; }
    },
    async startService(version) {
      if(this.actionLoading) return; this.actionLoading=true;
      try {
        const a=window.electronAPI[this.startServiceMethod]; if(!a) return;
        const r=await a(version);
        if(r.success) {
          if(r.portChanged) Lemon.info(`默认端口 ${r.defaultPort} 被占用了，我已经帮你换到 ${r.port} 啦～`);
          else Lemon.success(`${this.toolLabel} 已经在跑了～`);
          await this.refreshAllServiceStatus();
          if(this.tool==='mysql') await this.refreshMySQLConfigs();
          await this.persistServiceState();
        } else {
          Lemon.error(r.message || `${this.toolLabel} 没启动起来`);
        }
      } catch(err){ Lemon.error(`启动失败了：${err.message}`); }
      finally { this.actionLoading=false; }
    },
    async stopService(version) {
      if(this.actionLoading) return; this.actionLoading=true;
      try { const a=window.electronAPI[this.stopServiceMethod]; if(!a) return; const r=await a(version); if(r.success) { await this.refreshAllServiceStatus(); if(this.tool==='mysql') await this.refreshMySQLConfigs(); await this.persistServiceState(); } } catch(err){}
      finally { this.actionLoading=false; }
    },
    async toggleService(version) {
      if(this.serviceStatus[version]==='running') await this.stopService(version);
      else await this.startService(version);
    },
    async persistServiceState() {
      if (!window.electronAPI || !window.electronAPI.setServiceState) return;
      if (!['mysql', 'redis', 'nginx'].includes(this.tool)) return;
      try {
        const prev = await window.electronAPI.getServiceState();
        const services = (prev && prev.success && prev.services) || {};
        services[this.tool] = Object.values(this.serviceStatus || {}).includes('running');
        await window.electronAPI.setServiceState(services);
      } catch (err) {}
    },
    async copyConnectionString() {
      const version = this.defaultVersion || this.versions[0];
      const port = (this.tool === 'mysql'
        ? (this.mysqlConfigs[version] && this.mysqlConfigs[version].port)
        : (this.redisConfigs[version] && this.redisConfigs[version].port)) || (this.tool === 'mysql' ? 3306 : 6379);
      const text = this.tool === 'mysql'
        ? `jdbc:mysql://127.0.0.1:${port}/your_database?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai`
        : `redis://127.0.0.1:${port}/0`;
      try {
        await navigator.clipboard.writeText(text);
        Lemon.success('连接串已经抄下来啦～');
      } catch (err) {
        Lemon.error('复制失败了：' + err.message);
      }
    },
    async viewServiceLog() {
      if (!window.electronAPI || !window.electronAPI.readServiceLog) return;
      try {
        const res = await window.electronAPI.readServiceLog(this.tool);
        if (!res || !res.success) {
          Lemon.error((res && res.message) || '还没有日志文件');
          return;
        }
        this.serviceLog = {path: res.path || '', lines: res.lines || []};
        this.showServiceLog = true;
      } catch (err) {
        Lemon.error('读取日志失败：' + err.message);
      }
    },
    openPasswordModal(version) { this.currentVersionForPassword=version; this.oldRedisPassword=''; this.newRedisPassword=''; this.showPasswordModal=true; },
    closePasswordModal() { this.showPasswordModal=false; this.currentVersionForPassword=null; },
    async changeRedisPassword() {
      if(this.passwordChanging) return; this.passwordChanging=true;
      try {
        const a=window.electronAPI[this.changePasswordMethod]; if(!a) return;
        const r=await a(this.currentVersionForPassword, this.oldRedisPassword, this.newRedisPassword);
        if(r.success) { this.closePasswordModal(); await this.refreshAllServiceStatus(); await this.refreshRedisConfigs(); }
      } catch(err){}
      finally { this.passwordChanging=false; }
    },
    openPackageManager(version) { this.selectedPythonVersion=version; this.showPackageManager=true; },
    closePackageManager() { this.showPackageManager=false; this.selectedPythonVersion=''; },
    currentPortOf(version) {
      const cfg = this.tool === 'mysql' ? this.mysqlConfigs[version] : this.redisConfigs[version];
      return cfg && cfg.port ? Number(cfg.port) : null;
    },

    async startEditPort(version) {
      this.portDraft = String(this.currentPortOf(version) || '');
      this.editingPort = version;
      await this.$nextTick();
      const input = this.$el && this.$el.querySelector ? this.$el.querySelector('.port-input') : null;
      if (input) { input.focus(); if (input.select) input.select(); }
    },

    cancelPort() { this.editingPort = null; this.portDraft = ''; },

    async commitPort(version) {
      if (this.editingPort !== version || this.portSaving) return;
      const raw = String(this.portDraft || '').trim();
      const port = Number(raw);
      const current = this.currentPortOf(version);
      if (!raw || port === current) { this.cancelPort(); return; }
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        Lemon.error('端口要填 1-65535 之间的数字');
        this.cancelPort();
        return;
      }
      const api = window.electronAPI || {};
      if (!api.setServicePort) { Lemon.error('当前环境不支持修改端口'); this.cancelPort(); return; }
      this.portSaving = true;
      try {
        const check = await api.checkServicePort(port);
        if (check && check.available === false) {
          Lemon.error(check.message || `端口 ${port} 已被占用，换一个试试`);
          this.cancelPort();
          return;
        }
        const res = await api.setServicePort(this.tool, version, port);
        if (res && res.success) {
          const running = this.serviceStatus[version] === 'running';
          Lemon.success(`端口已改成 ${port}，${running ? '重启服务后' : '下次启动'}按新端口连接～`);
          this.cancelPort();
          await this.refresh();
        } else {
          Lemon.error((res && res.message) || '端口没设置成功');
          this.cancelPort();
        }
      } catch (err) {
        Lemon.error(`设置端口失败：${err.message}`);
        this.cancelPort();
      } finally {
        this.portSaving = false;
      }
    },

    openMySQLPasswordModal(version) { this.currentMySQLVersion=version; this.oldMySQLPassword=''; this.newMySQLPassword=''; this.savedMySQLPassword=null; this.showMySQLPasswordModal=true; this.loadSavedPassword(version); },
  async loadSavedPassword(version) { try { const r = await window.electronAPI.getMySQLPassword(version); this.savedMySQLPassword = r && r.success ? (r.password === null ? null : r.password) : null; } catch (err) { this.savedMySQLPassword = null; } },
  async copySavedPassword() { const value = this.savedMySQLPassword || ''; try { await navigator.clipboard.writeText(value); Lemon.success('密码已经复制好啦～'); } catch (err) { Lemon.error('复制失败，手动选中复制吧'); } },
    closeMySQLPasswordModal() { this.showMySQLPasswordModal=false; this.currentMySQLVersion=null; this.oldMySQLPassword=''; this.newMySQLPassword=''; },
    async changeMySQLPassword() {
      if(this.mysqlPasswordChanging) return; this.mysqlPasswordChanging=true;
      try { const r=await window.electronAPI.changeMySQLPassword(this.currentMySQLVersion, this.oldMySQLPassword, this.newMySQLPassword); if(r.success) { this.closeMySQLPasswordModal(); await this.refreshMySQLConfigs(); await this.refreshAllServiceStatus(); } } catch(err){}
      finally { this.mysqlPasswordChanging=false; }
    },
    async loadSandbox() {
      if (!window.electronAPI || !window.electronAPI.getSandboxInfo) return;
      try {
        const r = await window.electronAPI.getSandboxInfo();
        if (r.success) {
          this.sandboxInfo = r.data;
          const t = r.data.tools && r.data.tools[this.tool];
          this.injected = !!(t && t.injected);
        }
      } catch (err) {}
    },
    async toggleInjection() {
      if (this.actionLoading) return;
      const enable = !this.injected;
      if (enable) {
        let detail = '';
        try {
          const info = await window.electronAPI.getInjectionInfo(this.tool);
          if (info && info.success && info.data) {
            const d = info.data;
            if (d.varValue) detail = `\n\n注意：你现在的 ${d.varName} 是\n${d.varValue}\n注入后会被指向沐柠里的版本，撤出时会还原成这个值。`;
          }
        } catch (err) {}
        const ok = confirm(`将把 ${this.toolLabel} 的路径写入当前用户的环境变量，\n这样在任意新终端里都能直接用 ${this.toolLabel}。${detail}\n\n随时可以点「已注入 · 撤出系统变量」还原。继续吗？`);
        if (!ok) return;
      } else {
        let detail = '';
        try {
          const info = await window.electronAPI.getInjectionInfo(this.tool);
          if (info && info.success && info.data) {
            const d = info.data;
            const lines = [];
            if (d.varName) {
              lines.push(d.original
                ? `变量：${d.varName} 会还原成 ${d.original}`
                : `变量：${d.varName}=${d.varValue || '(空)'}`);
            }
            if (d.leakedEntries && d.leakedEntries.length) lines.push(`PATH 里的 ${d.leakedEntries.length} 条路径`);
            if (lines.length) detail = `\n\n将删除：\n· ${lines.join('\n· ')}`;
          }
        } catch (err) {}
        const ok = confirm(`确定要撤出 ${this.toolLabel} 的系统变量吗？\n撤出后只有「沐柠环境终端」里能用，系统自带的 cmd/PowerShell 就找不到了。${detail}`);
        if (!ok) return;
      }
      this.actionLoading = true;
      try {
        const r = await window.electronAPI.setSandboxInjection(this.tool, enable);
        if (r.success) {
          this.injected = enable;
          await this.loadSandbox();
          if (enable) Lemon.success(`${this.toolLabel} 已经写进系统变量啦，新开的终端就能直接用～`);
          else Lemon.success(`${this.toolLabel} 的系统变量已经撤干净了，系统环境回到原样～`);

          const check = enable && r.selfCheck;
          if (check && check.own && check.own.verdict !== 'ok') {
            setTimeout(() => Lemon.error(`注入成功，但自检没跑起来：${check.own.detail}\n${check.exe}\n`
              + '这份可能装坏了，建议先卸载再重装一次'), 500);
          } else if (check && check.shadowed) {
            setTimeout(() => Lemon.info(`注入了，但新终端里 ${this.toolLabel} 仍会优先用到\n${check.effective}\n`
              + '它排在用户 PATH 前面；在面板上点「以管理员身份清理」把系统 PATH 里的旧条目摘掉才行'), 500);
          }
        }
        else Lemon.error(r.message || '变量设置没成功');
      } catch (err) { Lemon.error(`变量设置失败了：${err.message}`); }
      finally { this.actionLoading = false; }
    },
    async openTerminal() {
      eventBus.emit('terminal:open');
    },
    async openFolder(version) {
      try {
        const api = window.electronAPI;
        if (!api || !api.getSandboxToolDir) { Lemon.error('当前环境不支持打开目录'); return; }
        const dirResult = await api.getSandboxToolDir(this.tool, version);
        if (!dirResult || !dirResult.success) { Lemon.error((dirResult && dirResult.message) || '找不到这个版本的目录'); return; }
        const opened = await api.openSandboxDir(dirResult.dir);
        if (!opened || !opened.success) { Lemon.error((opened && opened.message) || '打开目录失败了'); }
      } catch (err) { Lemon.error(`打开目录失败了：${err.message}`); }
    },
    async openVersionTerminal(version) {
      eventBus.emit('terminal:open', { tool: this.tool, version });
    },
    async onTileClick(version) {
      if (this.actionLoading) return;
      if (version === this.defaultVersion) return;
      await this.switchVersion(version);
    }
  }
};
</script>

<style scoped>
.environment-panel { height: 100%; display: flex; flex-direction: column; gap: var(--space-5); }

/* ── Header ── */
.panel-header { display: flex; justify-content: space-between; align-items: flex-start; }
.title-section { display: flex; align-items: center; gap: var(--space-3); }
.tool-icon-wrap { width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--primary-light); display: flex; align-items: center; justify-content: center; color: var(--primary); flex-shrink: 0; }
.tool-icon-img { width: 28px; height: 28px; object-fit: contain; }
.panel-header h3 { font-size: 1.35rem; font-weight: 800; color: var(--text-primary); letter-spacing: -0.4px; margin: 0; line-height: 1.2; }
.panel-subtitle { font-size: 0.75rem; color: var(--text-muted); margin: 1px 0 0; }

.header-actions { display: flex; gap: var(--space-2); }
.refresh-btn {
  display: flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: var(--radius-md);
  border: 1px solid var(--border-light); cursor: pointer;
  color: var(--text-secondary); background: var(--bg-card);
  transition: all var(--transition-fast);
}
.refresh-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-medium); }
.refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.spinning { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.install-btn {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--primary); color: white; border: none;
  padding: 9px 20px; border-radius: var(--radius-md); cursor: pointer;
  font-weight: 700; font-size: 0.88rem; transition: all var(--transition-fast);
  box-shadow: var(--shadow-sm);
}
.install-btn:hover { background: var(--primary-hover); box-shadow: var(--shadow-md); transform: translateY(-1px); }

/* ── Content area ── */
.content-area { flex: 1; display: flex; flex-direction: column; }

/* ═══════════════════════════════════════════════════
   ENV TILE — The core card design
   ═══════════════════════════════════════════════════ */
.versions-grid {
  display: flex; flex-direction: column; gap: var(--space-3);
  overflow-y: auto; padding-right: 4px;
}

.env-tile {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  border: 1px solid var(--border-light);
  transition: all var(--transition-fast);
  display: flex; flex-direction: column; gap: var(--space-3);
  animation: cardIn 0.45s cubic-bezier(0.22, 0.61, 0.36, 1) backwards;
}

@keyframes cardIn {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

.env-tile:hover { border-color: var(--border-medium); box-shadow: var(--glass-shadow-hover); transform: translateY(-2px); }

/* Click-to-switch affordance */
.env-tile.is-clickable { cursor: pointer; }

.env-tile.is-clickable:hover {
  border-color: color-mix(in srgb, var(--primary) 55%, transparent);
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 7%, var(--bg-card)), var(--bg-card));
  box-shadow: var(--glass-shadow-hover), 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
}

.env-tile.is-clickable:active { transform: translateY(-1px) scale(0.995); }

.env-tile.is-clickable .tile-meta { transition: color var(--transition-fast); }
.env-tile.is-clickable:hover .tile-meta { color: var(--primary); }

.env-tile.is-clickable .tile-name::after {
  content: '设为默认';
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--primary);
  background-color: color-mix(in srgb, var(--primary) 14%, transparent);
  opacity: 0;
  transform: translateX(-4px);
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

.env-tile.is-clickable:hover .tile-name::after { opacity: 1; transform: translateX(0); }

/* Default version highlight */
.env-tile.is-default {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
  background: linear-gradient(135deg, color-mix(in srgb, var(--primary) 4%, var(--bg-card)), var(--bg-card));
}

/* Running service glow */
.env-tile.is-running { box-shadow: 0 0 0 1px var(--success-border), var(--shadow-sm); }

/* ── Tile top row ── */
.tile-top { display: flex; align-items: center; gap: var(--space-3); }
.tile-icon { width: 36px; height: 36px; border-radius: var(--radius-sm); background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.tile-icon-img { width: 22px; height: 22px; object-fit: contain; }
.tile-info { flex: 1; min-width: 0; }

.tile-name {
  font-weight: 700; font-size: 0.9rem; color: var(--text-primary);
  font-family: var(--font-mono);
}

.tile-meta-row { display: flex; align-items: center; gap: 6px; margin-top: 3px; }
.tile-meta { font-size: 0.73rem; color: var(--text-muted); }

/* Info pills */
.meta-pill {
  font-size: 0.68rem; padding: 2px 7px; border-radius: var(--radius-full);
  background: var(--bg-secondary); color: var(--text-secondary);
  font-family: var(--font-mono); font-weight: 600;
}
.meta-pill.subtle { color: var(--text-muted); }

/* 端口胶囊：点一下就能改 */
.meta-pill.port-pill {
  cursor: pointer; display: inline-flex; align-items: center; gap: 2px;
  transition: var(--transition-fast, all .15s ease);
}
.meta-pill.port-pill:hover { color: var(--accent); border: 1px dashed currentColor; padding: 1px 6px; }
.meta-pill.port-pill.is-editing { padding: 0; background: transparent; border: none; }
.meta-pill.port-pill .port-input {
  width: 58px; padding: 1px 5px; font-size: 0.68rem; font-family: var(--font-mono); font-weight: 600;
  color: var(--text-primary); background: var(--bg-secondary);
  border: 1px solid var(--accent); border-radius: var(--radius-full); outline: none; text-align: center;
}

.tile-badges { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* Default pill */
.default-pill {
  font-size: 0.65rem; background: var(--primary); color: white;
  padding: 3px 10px; border-radius: var(--radius-full);
  font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;
}

/* Status dot */
.status-dot {
  width: 9px; height: 9px; border-radius: 50%;
}
.status-dot.running { background: #10b981; box-shadow: 0 0 8px rgba(16,185,129,0.5); animation: dotPulse 2s ease-in-out infinite; }
.status-dot.stopped { background: #94a3b8; }
@keyframes dotPulse { 0%,100%{box-shadow:0 0 4px rgba(16,185,129,0.3)} 50%{box-shadow:0 0 12px rgba(16,185,129,0.7)} }

/* ── Tile actions ── */
.tile-actions { display: flex; flex-wrap: wrap; gap: var(--space-1); }

.act-btn {
  display: inline-flex; align-items: center; gap: 4px;
  border: none; cursor: pointer; font-size: 0.73rem; padding: 5px 10px;
  border-radius: var(--radius-full); font-weight: 600;
  transition: all var(--transition-fast); background: transparent;
}
.act-btn.ghost { color: var(--text-secondary); }
.act-btn.ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
.act-btn.primary { background: var(--primary); color: white; }
.act-btn.primary:hover:not(:disabled) { background: var(--primary-hover); }
.act-btn.ghost.success { color: var(--success-text); }
.act-btn.ghost.success:hover:not(:disabled) { background: var(--success-bg); }
.act-btn.ghost.danger { color: var(--text-muted); }
.act-btn.ghost.danger:hover:not(:disabled) { background: var(--danger-bg); color: var(--danger-text); }
.act-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

/* ── Icon-only action buttons ── */
.act-btn.icon-btn {
  width: 26px;
  height: 26px;
  padding: 0;
  justify-content: center;
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  background-color: var(--glass-tint-soft);
  border: 1px solid var(--glass-stroke);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

.act-btn.icon-btn:hover:not(:disabled) {
  color: var(--primary);
  background-color: var(--glass-tint);
  border-color: color-mix(in srgb, var(--primary) 55%, transparent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 4px 14px rgba(20, 184, 166, 0.22);
  transform: translateY(-1px);
}

.act-btn.icon-btn:active:not(:disabled) { transform: translateY(0) scale(0.94); }

/* ── Empty State ── */
.empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: var(--space-4); }

.empty-art {
  background: var(--art-bg);
  padding: 10px;
  width: 260px;
  max-width: 52%;
  height: auto;
  display: block;
  border-radius: 18px;
  box-shadow: 0 16px 34px rgba(2, 6, 23, 0.16);
}

@keyframes emptyFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
.empty-icon-wrap { width: 80px; height: 80px; border-radius: 50%; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; color: var(--text-muted); border: 2px dashed var(--border-light); }
.empty-state p { color: var(--text-secondary); font-size: 0.95rem; margin: 0; }
.empty-cta {
  display: inline-flex; align-items: center; gap: 6px; margin-top: var(--space-2);
  background: var(--primary); color: white; border: none;
  padding: 9px 20px; border-radius: var(--radius-full); cursor: pointer;
  font-weight: 700; font-size: 0.88rem; transition: all var(--transition-fast);
  box-shadow: var(--shadow-sm);
}
.empty-cta:hover { background: var(--primary-hover); box-shadow: var(--shadow-md); transform: translateY(-1px); }

.empty-actions { display: flex; align-items: center; gap: var(--space-3); }
.empty-ghost {
  background: transparent; color: var(--text-secondary);
  border: none; cursor: pointer; padding: 9px 4px;
  font-size: 0.85rem; font-weight: 600;
  border-bottom: 1px dashed color-mix(in srgb, var(--primary) 55%, transparent);
  transition: color var(--transition-fast);
}
.empty-ghost:hover:not(:disabled) { color: var(--primary); }
.empty-hint { font-size: 0.76rem; color: var(--text-muted); max-width: 420px; }

.adopt-admin {
  margin: 0 24px 20px; padding: 14px 18px;
  display: flex; align-items: center; gap: 16px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--glass-edge), var(--glass-shadow);
  border-left: 3px solid var(--warning, #f0a020);
}
.adopt-admin-text { flex: 1; min-width: 0; font-size: 0.8rem; line-height: 1.6; color: var(--text-secondary); }
.adopt-admin-list {
  display: block; margin-top: 2px; word-break: break-all;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.74rem; color: var(--text-tertiary, #94a3b8);
}
.adopt-panel {
  margin: 0 24px 20px; padding: 16px 18px;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: var(--glass-edge), var(--glass-shadow);
}
.adopt-head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.86rem; font-weight: 700; color: var(--text-primary);
  margin-bottom: 12px;
}
.adopt-close {
  background: transparent; border: none; cursor: pointer;
  color: var(--text-muted); font-size: 1.1rem; line-height: 1;
}
.adopt-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0; border-top: 1px solid var(--border-light);
}
.adopt-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.adopt-version { font-size: 0.85rem; font-weight: 700; color: var(--text-primary); }
.adopt-path {
  font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.adopt-btn {
  flex-shrink: 0; padding: 6px 16px; border-radius: var(--radius-full);
  border: none; cursor: pointer; font-size: 0.78rem; font-weight: 700;
  background: var(--primary); color: white;
  transition: all var(--transition-fast);
}
.adopt-btn:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
.adopt-btn:disabled { opacity: 0.55; cursor: default; }
.adopt-tile {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
  min-height: 132px; padding: 20px;
  border-radius: var(--radius-lg);
  border: 1.5px dashed var(--border-light);
  color: var(--text-muted); cursor: pointer;
  font-size: 0.84rem; font-weight: 600;
  transition: all var(--transition-fast);
}
.adopt-tile:hover {
  border-color: color-mix(in srgb, var(--primary) 60%, transparent);
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 6%, transparent);
}
.adopt-tile.loading { opacity: 0.6; pointer-events: none; }

/* ── Warning banner ── */
.warn-banner {
  display: flex; align-items: center; gap: var(--space-3);
  padding: 11px 14px; background: var(--warning-bg); color: var(--warning-text);
  border-radius: var(--radius-md); font-size: 0.84rem; font-weight: 500;
}

/* ── Sandbox row ── */
.sandbox-row {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-4);
  flex-wrap: wrap;
  padding: 10px 14px;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}

.sandbox-row-main { display: flex; align-items: center; gap: var(--space-3); min-width: 0; flex: 1; }

.sandbox-row-label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); white-space: nowrap; }

.sandbox-row-path {
  font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}

.sandbox-row-tag {
  font-size: 0.68rem; font-weight: 600; padding: 1px 8px; border-radius: var(--radius-full);
  color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, transparent);
  white-space: nowrap;
}

.sandbox-row-actions { display: flex; align-items: center; gap: var(--space-2); }

.mini-btn {
  padding: 5px 11px; border-radius: var(--radius-sm);
  border: 1px solid var(--border-light); background: var(--bg-card);
  color: var(--text-secondary); font-size: 0.76rem; font-weight: 500;
  cursor: pointer; transition: all var(--transition-fast); white-space: nowrap;
}
.mini-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.mini-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.mini-btn.on { border-color: var(--primary); color: var(--primary); background: color-mix(in srgb, var(--primary) 10%, transparent); }
.mini-btn.danger:hover:not(:disabled) { border-color: var(--danger, #ef4444); color: var(--danger, #ef4444); }

/* ═══════════════════════════════════════════════════
   Modal
   ═══════════════════════════════════════════════════ */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--overlay-bg);
  backdrop-filter: blur(30px) saturate(140%);
  -webkit-backdrop-filter: blur(30px) saturate(140%);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.log-card { width: min(760px, 92vw); }
.log-path {
  margin: 4px 0 10px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-muted);
  word-break: break-all;
}
.log-body {
  margin: 0;
  max-height: 46vh;
  overflow: auto;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.35);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.modal-card {
  background: var(--glass-tint-strong); padding: var(--space-6);
  border-radius: var(--glass-radius-lg); width: 380px;
  box-shadow: var(--glass-shadow-float);
  border: 1px solid var(--glass-stroke);
  backdrop-filter: blur(36px) saturate(180%);
  -webkit-backdrop-filter: blur(36px) saturate(180%);
}
.modal-card h4 { margin: 0 0 var(--space-4); font-size: 1rem; font-weight: 700; color: var(--text-primary); }
.saved-pw {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin-bottom: 14px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 26%, transparent);
}

.saved-pw-label {
  font-size: 0.76rem;
  color: var(--text-muted);
  flex-shrink: 0;
}

.saved-pw-value {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.saved-pw-copy {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
  color: var(--primary);
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.saved-pw-copy:hover { background: color-mix(in srgb, var(--primary) 14%, transparent); }

.saved-pw-hint {
  margin: 0 0 14px;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.modal-field { margin-bottom: var(--space-3); }
.modal-field label { display: block; margin-bottom: 4px; font-size: 0.82rem; font-weight: 500; color: var(--text-secondary); }
.modal-field input {
  width: 100%; padding: 9px 12px; border: 1px solid var(--border-light);
  border-radius: var(--radius-md); background: var(--bg-input); color: var(--text-primary);
  font-family: var(--font-mono); font-size: 0.9rem;
  transition: border-color var(--transition-fast);
}
.modal-field input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.password-wrap { display: flex; gap: var(--space-2); align-items: center; }
.password-wrap input { flex: 1; }
.toggle-pw {
  display: flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border: 1px solid var(--border-light);
  border-radius: var(--radius-md); background: var(--bg-secondary);
  cursor: pointer; color: var(--text-muted); transition: all var(--transition-fast);
}
.toggle-pw:hover { color: var(--text-primary); background: var(--bg-hover); }

.modal-actions { display: flex; gap: var(--space-3); margin-top: var(--space-5); }
.modal-btn {
  flex: 1; padding: 9px; border-radius: var(--radius-md); border: none;
  cursor: pointer; font-weight: 600; font-size: 0.88rem; transition: all var(--transition-fast);
}
.modal-btn.primary { background: var(--primary); color: white; }
.modal-btn.primary:hover:not(:disabled) { background: var(--primary-hover); }
.modal-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-btn.secondary { background: var(--bg-hover); color: var(--text-secondary); }
.modal-btn.secondary:hover { background: var(--border-light); color: var(--text-primary); }
</style>
