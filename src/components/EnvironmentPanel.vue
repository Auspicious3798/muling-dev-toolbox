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
          <p class="panel-subtitle">{{ loading ? '扫描中...' : (versions.length > 0 ? versions.length + ' 个版本已安装' : (mavenInstalled ? '已安装' : '点击安装开始使用')) }}</p>
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

    <!-- Maven standalone -->
    <div v-if="tool === 'maven' && !loading" class="content-area">
      <div v-if="mavenInstalled" class="env-tile is-default">
        <div class="tile-top">
          <div class="tile-icon">
            <img v-if="toolIconPath" :src="toolIconPath" class="tile-icon-img" alt=""/>
          </div>
          <div class="tile-info">
            <span class="tile-name">Maven {{ mavenVersion }}</span>
            <span class="tile-meta">构建工具</span>
          </div>
          <span class="default-pill">默认</span>
        </div>
        <div class="tile-actions">
          <button @click="uninstallMaven" class="act-btn ghost danger" :disabled="actionLoading">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            卸载
          </button>
        </div>
      </div>
      <div v-else class="empty-state">
        <div class="empty-icon-wrap">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
        <p>未检测到已安装的 Maven</p>
        <button class="empty-cta" @click="$emit('install')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          立即安装
        </button>
      </div>
    </div>

    <!-- Empty state (non-maven) -->
    <div v-else-if="versions.length === 0 && !loading && tool !== 'maven'" class="empty-state">
      <div class="empty-icon-wrap">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
      </div>
      <p>未检测到已安装的 {{ toolLabel }}</p>
      <button class="empty-cta" @click="$emit('install')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        立即安装
      </button>
    </div>

    <!-- Version grid -->
    <div v-else-if="tool !== 'maven'" class="versions-grid">
      <div v-for="v in versions" :key="v" class="env-tile" :class="{ 'is-default': v === defaultVersion, 'is-running': serviceStatus[v] === 'running' }">
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
                <span class="meta-pill">:{{ mysqlConfigs[v]?.port || '?' }}</span>
                <span class="meta-pill" v-if="mysqlConfigs[v]?.hasPassword === true">有密码</span>
                <span class="meta-pill subtle" v-else>无密码</span>
              </template>
              <!-- Redis info pills -->
              <template v-else-if="tool === 'redis'">
                <span class="meta-pill">:{{ redisConfigs[v]?.port || '?' }}</span>
                <span class="meta-pill" v-if="redisConfigs[v]?.hasPassword">有密码</span>
                <span class="meta-pill subtle" v-else>无密码</span>
              </template>
              <span v-else class="tile-meta">{{ v === defaultVersion ? '当前默认版本' : '已安装' }}</span>
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
          <button v-if="v !== defaultVersion" @click="switchVersion(v)" class="act-btn primary" :disabled="actionLoading" title="设为默认版本">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
            设为默认
          </button>
          <button v-if="tool === 'mysql' || tool === 'redis'" @click="toggleService(v)"
                  :class="['act-btn', serviceStatus[v] === 'running' ? 'ghost danger' : 'ghost success']" :disabled="actionLoading">
            <svg v-if="serviceStatus[v] !== 'running'" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="6" height="16" rx="1"/><rect x="14" y="4" width="6" height="16" rx="1"/></svg>
            {{ serviceStatus[v] === 'running' ? '停止' : '启动' }}
          </button>
          <button v-if="tool === 'redis' || tool === 'mysql'" @click="tool === 'redis' ? openPasswordModal(v) : openMySQLPasswordModal(v)"
                  class="act-btn ghost" :disabled="actionLoading">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
            密码
          </button>
          <button v-if="tool === 'python'" @click="openPackageManager(v)" class="act-btn ghost" :disabled="actionLoading">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            包管理
          </button>
          <button @click="uninstallVersion(v)" class="act-btn ghost danger" :disabled="actionLoading">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            卸载
          </button>
        </div>
      </div>
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
  </div>
</template>

<script>
import AIIcon from '../../public/icons/AI.svg?url';
import CIcon from '../../public/icons/c.svg?url';
import ElasticsearchIcon from '../../public/icons/elasticsearch.svg?url';
import GitIcon from '../../public/icons/git.svg?url';
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

export default {
  name: 'EnvironmentPanel',
  components: { PackageManager },
  props: { tool: { type: String, required: true } },
  data() {
    return {
      loading: false, versions: [], defaultVersion: null,
      serviceStatus: {}, redisConfigs: {}, actionLoading: false, apiMissing: false,
      showPasswordModal: false, currentVersionForPassword: null,
      oldRedisPassword: '', newRedisPassword: '', passwordChanging: false,
      mavenInstalled: false, mavenVersion: '',
      showPackageManager: false, selectedPythonVersion: '',
      mysqlConfigs: {},
      showMySQLPasswordModal: false, currentMySQLVersion: null,
      oldMySQLPassword: '', newMySQLPassword: '', mysqlPasswordChanging: false, showMySQLPassword: false
    };
  },
  computed: {
    toolLabel() {
      const m = { jdk:'JDK',python:'Python',mysql:'MySQL',redis:'Redis',maven:'Maven',gradle:'Gradle',nacos:'Nacos',sentinel:'Sentinel',rabbitmq:'RabbitMQ',miniconda:'Miniconda',jupyter:'Jupyter Lab',ollama:'Ollama',go:'Go',mingw:'MinGW',git:'Git',nginx:'Nginx',minio:'MinIO',elasticsearch:'Elasticsearch',kibana:'Kibana','redis-insight':'Redis Insight' };
      return m[this.tool] || this.tool.toUpperCase();
    },
    toolIconPath() {
      const p = { jdk:JavaIcon,python:PythonIcon,mysql:MysqlIcon,redis:RedisIcon,maven:MavenIcon,gradle:GradleIcon,nacos:NacosIcon,sentinel:SentinelIcon,rabbitmq:RabbitmqIcon,miniconda:MinicondaIcon,jupyter:JupyterIcon,ollama:OllamaIcon,go:GolangIcon,mingw:CIcon,git:GitIcon,nginx:NginxIcon,minio:MinioIcon,elasticsearch:ElasticsearchIcon,kibana:KibanaIcon,'redis-insight':RedisIcon,dashboard:DashboardIcon,settings:SettingsIcon,about:LemonIcon,'ai-assistant':AIIcon };
      return p[this.tool] || null;
    },
    checkMethod() { const m={jdk:'checkJDK',python:'checkPython',mysql:'checkMySQL',redis:'checkRedis',maven:'checkMaven'}; return m[this.tool]; },
    switchMethod() { const m={jdk:'switchJDK',python:'switchPython',mysql:'switchMySQL',redis:'switchRedis'}; return m[this.tool]; },
    deleteMethod() { const m={jdk:'deleteJDK',python:'deletePython',mysql:'deleteMySQL',redis:'deleteRedis',maven:'uninstallMaven'}; return m[this.tool]; },
    startServiceMethod() { return this.tool==='mysql'?'startMySQLService':'startRedisService'; },
    stopServiceMethod() { return this.tool==='mysql'?'stopMySQLService':'stopRedisService'; },
    getServiceStatusMethod() { return this.tool==='mysql'?'getMySQLServiceStatus':'getRedisServiceStatus'; },
    changePasswordMethod() { return this.tool==='mysql'?'changeMySQLPassword':'changeRedisPassword'; }
  },
  watch: { tool: { immediate: true, handler() { this.refresh(); } } },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onJDKChanged?.(() => { if (this.tool==='jdk') this.refresh(); });
      window.electronAPI.onPythonChanged?.(() => { if (this.tool==='python') this.refresh(); });
      window.electronAPI.onMySQLChanged?.(() => { if (this.tool==='mysql') this.refresh(); });
      window.electronAPI.onRedisChanged?.(() => { if (this.tool==='redis') this.refresh(); });
      window.electronAPI.onMavenChanged?.(() => { if (this.tool==='maven') this.refresh(); });
    }
  },
  methods: {
    async refresh() {
      if (this.loading) return;
      this.loading=true; this.apiMissing=false; eventBus.emit('scan-start', this.toolLabel);
      try {
        const api = window.electronAPI[this.checkMethod];
        if (!api) { this.apiMissing=true; eventBus.emit('scan-end'); return; }
        if (this.tool==='maven') { const r=await api(); this.mavenInstalled=r.installed; if(r.version) this.mavenVersion=r.version; }
        else {
          const r=await api(); this.versions=r.versions||[]; this.defaultVersion=r.default||null;
          if (['mysql','redis'].includes(this.tool)) await this.refreshAllServiceStatus();
          if (this.tool==='redis') await this.refreshRedisConfigs();
          if (this.tool==='mysql') await this.refreshMySQLConfigs();
        }
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
      if(this.actionLoading) return; this.actionLoading=true;
      try {
        const a=window.electronAPI[this.switchMethod]; if(!a) return;
        const r=await a(version);
        if(r.success) { alert(`已切换到 ${this.toolLabel} ${version}`); await this.refresh(); }
      } catch (err) {}
      finally { this.actionLoading=false; }
    },
    async uninstallVersion(version) {
      if(this.actionLoading) return;
      if(!confirm(`确定要卸载 ${this.toolLabel} ${version} 吗？此操作不可撤销。`)) return;
      this.actionLoading=true;
      try { const a=window.electronAPI[this.deleteMethod]; if(!a) return; const r=await a(version); if(r.success) await this.refresh(); } catch (err) {}
      finally { this.actionLoading=false; }
    },
    async uninstallMaven() {
      if(this.actionLoading) return;
      if(!confirm('确定要卸载 Maven 吗？此操作不可撤销。')) return;
      this.actionLoading=true;
      try { const r=await window.electronAPI.uninstallMaven(); if(r.success) await this.refresh(); } catch(err) {}
      finally { this.actionLoading=false; }
    },
    async startService(version) {
      if(this.actionLoading) return; this.actionLoading=true;
      try { const a=window.electronAPI[this.startServiceMethod]; if(!a) return; const r=await a(version); if(r.success) { await this.refreshAllServiceStatus(); if(this.tool==='mysql') await this.refreshMySQLConfigs(); } } catch(err){}
      finally { this.actionLoading=false; }
    },
    async stopService(version) {
      if(this.actionLoading) return; this.actionLoading=true;
      try { const a=window.electronAPI[this.stopServiceMethod]; if(!a) return; const r=await a(version); if(r.success) { await this.refreshAllServiceStatus(); if(this.tool==='mysql') await this.refreshMySQLConfigs(); } } catch(err){}
      finally { this.actionLoading=false; }
    },
    async toggleService(version) {
      if(this.serviceStatus[version]==='running') await this.stopService(version);
      else await this.startService(version);
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
    openMySQLPasswordModal(version) { this.currentMySQLVersion=version; this.oldMySQLPassword=''; this.newMySQLPassword=''; this.showMySQLPasswordModal=true; },
    closeMySQLPasswordModal() { this.showMySQLPasswordModal=false; this.currentMySQLVersion=null; this.oldMySQLPassword=''; this.newMySQLPassword=''; },
    async changeMySQLPassword() {
      if(this.mysqlPasswordChanging) return; this.mysqlPasswordChanging=true;
      try { const r=await window.electronAPI.changeMySQLPassword(this.currentMySQLVersion, this.oldMySQLPassword, this.newMySQLPassword); if(r.success) { this.closeMySQLPasswordModal(); await this.refreshMySQLConfigs(); await this.refreshAllServiceStatus(); } } catch(err){}
      finally { this.mysqlPasswordChanging=false; }
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
}

.env-tile:hover { border-color: var(--border-medium); box-shadow: var(--shadow-md); }

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

/* ── Empty State ── */
.empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: var(--space-4); }
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

/* ── Warning banner ── */
.warn-banner {
  display: flex; align-items: center; gap: var(--space-3);
  padding: 11px 14px; background: var(--warning-bg); color: var(--warning-text);
  border-radius: var(--radius-md); font-size: 0.84rem; font-weight: 500;
}

/* ═══════════════════════════════════════════════════
   Modal
   ═══════════════════════════════════════════════════ */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--overlay-bg); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal-card {
  background: var(--bg-modal); padding: var(--space-6);
  border-radius: var(--radius-xl); width: 380px;
  box-shadow: var(--shadow-xl); border: 1px solid var(--border-light);
}
.modal-card h4 { margin: 0 0 var(--space-4); font-size: 1rem; font-weight: 700; color: var(--text-primary); }
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
