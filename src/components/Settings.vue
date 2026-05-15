<template>
  <div class="settings">
    <div class="settings-header">
      <h1>工具箱设置</h1>
    </div>

    <div class="settings-section">
      <h2>通用设置</h2>
      <div class="setting-item">
        <label>主题</label>
        <select v-model="theme">
          <option value="light">浅色</option>
          <option value="dark">深色</option>
          <option value="system">跟随系统</option>
        </select>
      </div>
      <div class="setting-item">
        <label>启动时自动检查更新</label>
        <input type="checkbox" v-model="autoCheckUpdate"/>
      </div>
      <div class="setting-item">
        <label>关闭按钮行为</label>
        <select v-model="closeBehavior">
          <option value="exit">退出应用</option>
          <option value="tray">最小化到系统托盘</option>
        </select>
      </div>
    </div>

    <div class="settings-section">
      <h2>下载与网络</h2>
      <div class="setting-item">
        <label>使用代理加速</label>
        <div class="proxy-switch">
          <label class="switch">
            <input type="checkbox" v-model="useProxy" @change="onProxyToggle"/>
            <span class="slider"></span>
          </label>
          <span class="switch-label">{{ useProxy ? '已开启（加速下载）' : '已关闭（直连 GitHub）' }}</span>
        </div>
      </div>
      <div class="setting-item" v-if="useProxy">
        <label>代理节点</label>
        <div class="mirror-selector">
          <select v-model="mirror" @change="saveMirror" :disabled="testingSpeed">
            <option v-for="m in proxyMirrors" :key="m.url" :value="m.url">
              {{ m.name }} ({{ speedResults[m.url] ? (speedResults[m.url].success ? speedResults[m.url].duration + 'ms' : '超时') : '未测试' }})
            </option>
          </select>
          <button @click="testSpeed" :disabled="testingSpeed" class="test-speed-btn">
            {{ testingSpeed ? '测试中...' : '测速' }}
          </button>
        </div>
      </div>
      <div class="quarkpan-banner" v-if="useProxy">
        <div class="quarkpan-banner-content">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span class="banner-text">沐柠环境盒 - 夸克网盘备用下载</span>
          <button @click="copyQuarkpanLink" class="banner-copy-btn">
            {{ copied ? '已复制' : '复制链接' }}
          </button>
        </div>
      </div>
      <div class="setting-item">
        <label>代理设置</label>
        <input type="text" v-model="proxy" placeholder="http://127.0.0.1:7890"/>
      </div>
      <div class="setting-item">
        <label>下载缓存</label>
        <div class="cache-info">
          <span>{{ formatSize(cacheSize) }}</span>
          <button @click="clearCache" :disabled="clearingCache">清理缓存</button>
        </div>
      </div>
      <div class="setting-item">
        <label>日志文件</label>
        <div class="cache-info">
          <span>{{ formatSize(logsSize) }}</span>
          <button @click="clearLogs" :disabled="clearingLogs">清理日志</button>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h2>关于</h2>
      <div class="setting-item">
        <label>版本</label>
        <span class="version-value">{{ versionInfo.version }}</span>
      </div>
      <div class="setting-item">
        <label>Electron</label>
        <span class="version-value">{{ versionInfo.electron }}</span>
      </div>
      <div class="setting-item">
        <label>Node.js</label>
        <span class="version-value">{{ versionInfo.node }}</span>
      </div>
      <div class="setting-item">
        <label>Chrome</label>
        <span class="version-value">{{ versionInfo.chrome }}</span>
      </div>
      <div class="setting-item">
        <button @click="openGitHub" class="github-btn">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
          GitHub 仓库
        </button>
      </div>
    </div>

    <div class="settings-footer">
      <button @click="resetSettings" class="reset-btn">恢复默认设置</button>
    </div>
  </div>
</template>

<script>
import eventBus from '../eventBus';

export default {
  name: 'Settings',
  data() {
    return {
      theme: 'system',
      autoCheckUpdate: true,
      closeBehavior: 'exit',
      useProxy: true,
      mirror: 'https://ghfast.top/',
      mirrors: [],
      speedResults: {},
      testingSpeed: false,
      proxy: '',
      cacheSize: 0,
      logsSize: 0,
      clearingCache: false,
      clearingLogs: false,
      copied: false,
      quarkpanUrl: 'https://pan.quark.cn/s/93eb50a2e3e3',
      versionInfo: { version: '', electron: '', node: '', chrome: '' }
    };
  },
  mounted() { this.loadSettings(); this.loadMirrors(); this.loadCacheInfo(); this.loadVersionInfo(); },
  computed: {
    proxyMirrors() { return this.mirrors.filter(m => m.url !== ''); }
  },
  methods: {
    loadSettings() {
      const stored = localStorage.getItem('toolbox_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        this.theme = settings.theme || 'system';
        this.autoCheckUpdate = settings.autoCheckUpdate !== false;
        this.closeBehavior = settings.closeBehavior || 'exit';
        this.mirror = settings.mirror || 'https://ghfast.top/';
        this.proxy = settings.proxy || '';
        this.useProxy = settings.useProxy !== false;
      }
      this.applyTheme();
    },
    saveSettings() {
      const settings = { theme: this.theme, autoCheckUpdate: this.autoCheckUpdate, closeBehavior: this.closeBehavior, mirror: this.mirror, proxy: this.proxy, useProxy: this.useProxy };
      localStorage.setItem('toolbox_settings', JSON.stringify(settings));
      this.applyTheme();
      eventBus.emit('theme-change', this.theme);
      if (window.electronAPI && window.electronAPI.setProxy) { window.electronAPI.setProxy(this.proxy); }
    },
    applyTheme() {
      localStorage.setItem('theme', this.theme);
      if (this.theme === 'dark') { document.documentElement.classList.add('dark'); document.documentElement.classList.remove('light'); }
      else if (this.theme === 'light') { document.documentElement.classList.add('light'); document.documentElement.classList.remove('dark'); }
      else if (this.theme === 'system') {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
    },
    async loadCacheInfo() { if (!window.electronAPI || !window.electronAPI.getCacheSize) return; const result = await window.electronAPI.getCacheSize(); this.cacheSize = result.cacheSize; this.logsSize = result.logsSize; },
    async clearCache() { this.clearingCache = true; try { await window.electronAPI.clearCache(); await this.loadCacheInfo(); } finally { this.clearingCache = false; } },
    async clearLogs() { this.clearingLogs = true; try { await window.electronAPI.clearLogs(); await this.loadCacheInfo(); } finally { this.clearingLogs = false; } },
    async loadVersionInfo() { if (!window.electronAPI || !window.electronAPI.getVersionInfo) return; this.versionInfo = await window.electronAPI.getVersionInfo(); },
    async loadMirrors() {
      if (!window.electronAPI || !window.electronAPI.getMirrors) return;
      try {
        const result = await window.electronAPI.getMirrors();
        if (!result || !Array.isArray(result) || result.length === 0) {
          this.mirrors = [
            { name: 'GitHub 官方直连', url: '', recommended: false },
            { name: 'ghfast.top', url: 'https://ghfast.top/', recommended: true },
            { name: 'gh-proxy.com', url: 'https://gh-proxy.com/', recommended: false },
            { name: 'ghproxy.com', url: 'http://ghproxy.com/', recommended: false },
            { name: 'all.mk-proxy.tk', url: 'https://all.mk-proxy.tk/', recommended: false },
            { name: 'kgithub.com', url: 'https://kgithub.com/', recommended: false },
            { name: 'github.moeyy.xyz', url: 'https://github.moeyy.xyz/', recommended: false }
          ];
        } else {
          this.mirrors = result;
          const recommendedMirror = this.mirrors.find(m => m.recommended && m.url !== '');
          if (recommendedMirror) { this.mirror = recommendedMirror.url; }
        }
      } catch (err) {
        console.error('加载镜像列表失败:', err);
        this.mirrors = [
          { name: 'GitHub 官方直连', url: '', recommended: false },
          { name: 'ghfast.top', url: 'https://ghfast.top/', recommended: true },
          { name: 'gh-proxy.com', url: 'https://gh-proxy.com/', recommended: false },
          { name: 'ghproxy.com', url: 'http://ghproxy.com/', recommended: false },
          { name: 'all.mk-proxy.tk', url: 'https://all.mk-proxy.tk/', recommended: false },
          { name: 'kgithub.com', url: 'https://kgithub.com/', recommended: false },
          { name: 'github.moeyy.xyz', url: 'https://github.moeyy.xyz/', recommended: false }
        ];
      }
    },
    async testSpeed() {
      if (!window.electronAPI || !window.electronAPI.testMirrorSpeed) return;
      this.testingSpeed = true; this.speedResults = {};
      try {
        const results = await window.electronAPI.testMirrorSpeed();
        results.forEach(result => { this.speedResults[result.url] = result; });
        await this.loadMirrors();
      } catch (err) { console.error('测速失败:', err); }
      finally { this.testingSpeed = false; }
    },
    onProxyToggle() {
      this.saveSettings();
      if (this.useProxy) { this.saveMirror(); }
      else { if (window.electronAPI && window.electronAPI.setMirror) { window.electronAPI.setMirror(''); } }
    },
    async saveMirror() {
      if (!window.electronAPI || !window.electronAPI.setMirror) return;
      try { await window.electronAPI.setMirror(this.mirror); } catch (err) { console.error('保存镜像源失败:', err); }
      this.saveSettings();
    },
    openGitHub() { if (window.electronAPI && window.electronAPI.openGitHub) { window.electronAPI.openGitHub(); } },
    resetSettings() {
      this.theme = 'system'; this.autoCheckUpdate = true; this.closeBehavior = 'exit'; this.useProxy = true; this.mirror = 'https://ghfast.top/'; this.proxy = '';
      this.saveSettings(); this.saveMirror();
      alert('设置已重置为默认值');
    },
    formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    copyQuarkpanLink() {
      navigator.clipboard.writeText(this.quarkpanUrl).then(() => { this.copied = true; setTimeout(() => { this.copied = false; }, 2000); })
      .catch(() => { const ta = document.createElement('textarea'); ta.value = this.quarkpanUrl; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); this.copied = true; setTimeout(() => { this.copied = false; }, 2000); } catch (e) { alert('复制失败，请手动复制链接'); }
        document.body.removeChild(ta); });
    }
  },
  watch: {
    theme() { this.saveSettings(); },
    autoCheckUpdate() { this.saveSettings(); },
    closeBehavior() { this.saveSettings(); },
    proxy() { this.saveSettings(); }
  }
};
</script>

<style scoped>
.settings {
  height: 100%;
  overflow-y: auto;
}

.settings-header h1 {
  font-size: 1.75rem;
  font-weight: 800;
  margin-bottom: var(--space-6);
  color: var(--text-primary);
  letter-spacing: -0.5px;
}

.settings-section {
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  padding: var(--space-5);
  margin-bottom: var(--space-5);
  border: 1px solid var(--border-light);
  box-shadow: var(--shadow-xs);
}

.settings-section h2 {
  font-size: 1.05rem;
  font-weight: 700;
  margin-bottom: var(--space-4);
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--border-light);
}

.setting-item:last-child { border-bottom: none; }

.setting-item label {
  font-weight: 500;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.setting-item select,
.setting-item input[type="text"] {
  padding: 7px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-family: var(--font-sans);
  transition: border-color var(--transition-fast);
}

.setting-item select:focus,
.setting-item input[type="text"]:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}

.setting-item input[type="checkbox"] {
  width: 18px; height: 18px; accent-color: var(--primary); cursor: pointer;
}

.version-value {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.proxy-switch { display: flex; align-items: center; gap: var(--space-3); }

.switch { position: relative; display: inline-block; width: 46px; height: 24px; }

.switch input { opacity: 0; width: 0; height: 0; }

.slider {
  position: absolute; cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: var(--border-light);
  transition: var(--transition-normal);
  border-radius: 24px;
}

.slider::before {
  position: absolute; content: "";
  height: 18px; width: 18px;
  left: 3px; bottom: 3px;
  background: white;
  transition: var(--transition-normal);
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

input:checked + .slider { background: var(--primary); }
input:checked + .slider::before { transform: translateX(22px); }

.switch-label { color: var(--text-secondary); font-size: 0.85rem; }

.mirror-selector { display: flex; gap: var(--space-2); align-items: center; }
.mirror-selector select { flex: 1; }

.test-speed-btn {
  background: var(--primary); color: white; border: none;
  padding: 7px 14px; border-radius: var(--radius-md); cursor: pointer;
  font-size: 0.85rem; font-weight: 500; white-space: nowrap;
  transition: all var(--transition-fast);
}
.test-speed-btn:hover:not(:disabled) { background: var(--primary-hover); }
.test-speed-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.quarkpan-banner { margin-top: var(--space-3); }

.quarkpan-banner-content {
  display: flex; align-items: center; gap: var(--space-3);
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white; padding: 12px 18px; border-radius: var(--radius-lg);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.banner-text { flex: 1; font-weight: 500; font-size: 0.9rem; }

.banner-copy-btn {
  background: white; color: #6366f1; border: none;
  padding: 6px 14px; border-radius: var(--radius-md);
  font-size: 0.82rem; font-weight: 600; cursor: pointer;
  white-space: nowrap; transition: all var(--transition-fast);
}
.banner-copy-btn:hover { transform: scale(1.03); box-shadow: 0 2px 8px rgba(0,0,0,0.15); }

.cache-info { display: flex; gap: var(--space-3); align-items: center; color: var(--text-secondary); font-size: 0.88rem; }

.cache-info button {
  background: var(--info-bg); color: var(--info-text); border: none;
  padding: 4px 12px; border-radius: var(--radius-full); cursor: pointer;
  font-size: 0.8rem; font-weight: 500;
  transition: all var(--transition-fast);
}
.cache-info button:hover:not(:disabled) { filter: brightness(0.93); }
.cache-info button:disabled { opacity: 0.5; cursor: not-allowed; }

.github-btn {
  display: inline-flex; align-items: center; gap: var(--space-2);
  background: #24292e; color: white; border: none;
  padding: 8px 18px; border-radius: var(--radius-full); cursor: pointer;
  font-size: 0.85rem; font-weight: 600;
  transition: all var(--transition-fast);
}
.github-btn:hover { background: #1a1f23; transform: translateY(-1px); }

.reset-btn {
  background: var(--danger-bg); color: var(--danger-text); border: none;
  padding: 9px 20px; border-radius: var(--radius-full); cursor: pointer;
  font-weight: 600; font-size: 0.85rem;
  transition: all var(--transition-fast);
}
.reset-btn:hover { filter: brightness(0.95); }

.settings-footer { text-align: center; margin-top: var(--space-5); }
</style>
