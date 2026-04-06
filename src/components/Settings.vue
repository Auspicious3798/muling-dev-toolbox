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
        <p class="proxy-tip">💡 如果所有代理节点都失效，可使用阿里云盘获取资源</p>
      </div>
      <div class="alipan-banner" v-if="useProxy">
        <div class="alipan-banner-content">
          <span class="banner-icon">☁️</span>
          <span class="banner-text">沐柠环境盒 - 阿里云盘备用下载</span>
          <button @click="copyAlipanLink" class="banner-copy-btn">
            {{ copied ? '✅ 已复制' : '📋 复制链接' }}
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
          <span>缓存大小：{{ formatSize(cacheSize) }}</span>
          <button @click="clearCache" :disabled="clearingCache">清理缓存</button>
        </div>
      </div>
      <div class="setting-item">
        <label>日志文件</label>
        <div class="cache-info">
          <span>日志大小：{{ formatSize(logsSize) }}</span>
          <button @click="clearLogs" :disabled="clearingLogs">清理日志</button>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h2>关于</h2>
      <div class="setting-item">
        <label>版本</label>
        <span>{{ versionInfo.version }}</span>
      </div>
      <div class="setting-item">
        <label>Electron</label>
        <span>{{ versionInfo.electron }}</span>
      </div>
      <div class="setting-item">
        <label>Node.js</label>
        <span>{{ versionInfo.node }}</span>
      </div>
      <div class="setting-item">
        <label>Chrome</label>
        <span>{{ versionInfo.chrome }}</span>
      </div>
      <div class="setting-item">
        <button @click="openGitHub" class="github-btn">GitHub 仓库</button>
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
      alipanUrl: 'https://www.alipan.com/s/qJWiQqF1FdB',
      versionInfo: {
        version: '',
        electron: '',
        node: '',
        chrome: ''
      }
    };
  },
  mounted() {
    this.loadSettings();
    this.loadMirrors();
    this.loadCacheInfo();
    this.loadVersionInfo();
  },
  computed: {
    proxyMirrors() {
      return this.mirrors.filter(m => m.url !== '');
    }
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
      const settings = {
        theme: this.theme,
        autoCheckUpdate: this.autoCheckUpdate,
        closeBehavior: this.closeBehavior,
        mirror: this.mirror,
        proxy: this.proxy,
        useProxy: this.useProxy
      };
      localStorage.setItem('toolbox_settings', JSON.stringify(settings));
      this.applyTheme();
      console.log('Settings.vue emitting theme-change event:', this.theme);
      eventBus.emit('theme-change', this.theme);
      if (window.electronAPI && window.electronAPI.setProxy) {
        window.electronAPI.setProxy(this.proxy);
      }
    },
    applyTheme() {
      localStorage.setItem('theme', this.theme);
      if (this.theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else if (this.theme === 'light') {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      } else if (this.theme === 'system') {
        document.documentElement.classList.remove('light');
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    },
    async loadCacheInfo() {
      if (!window.electronAPI || !window.electronAPI.getCacheSize) return;
      const result = await window.electronAPI.getCacheSize();
      this.cacheSize = result.cacheSize;
      this.logsSize = result.logsSize;
    },
    async clearCache() {
      this.clearingCache = true;
      try {
        await window.electronAPI.clearCache();
        await this.loadCacheInfo();
      } finally {
        this.clearingCache = false;
      }
    },
    async clearLogs() {
      this.clearingLogs = true;
      try {
        await window.electronAPI.clearLogs();
        await this.loadCacheInfo();
      } finally {
        this.clearingLogs = false;
      }
    },
    async loadVersionInfo() {
      if (!window.electronAPI || !window.electronAPI.getVersionInfo) return;
      this.versionInfo = await window.electronAPI.getVersionInfo();
    },
    async loadMirrors() {
      if (!window.electronAPI || !window.electronAPI.getMirrors) {
        console.error('electronAPI.getMirrors 不存在');
        return;
      }
      try {
        const result = await window.electronAPI.getMirrors();
        console.log('Settings.vue getMirrors 返回结果:', result);
        console.log('结果类型:', typeof result, '是否为数组:', Array.isArray(result));
        console.log('结果长度:', result ? result.length : 'null');
        
        // 如果返回结果为空或不是数组，使用默认值
        if (!result || !Array.isArray(result) || result.length === 0) {
          console.warn('镜像列表为空，使用默认值');
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
          // 自动选择推荐的镜像
          const recommendedMirror = this.mirrors.find(m => m.recommended && m.url !== '');
          if (recommendedMirror) {
            this.mirror = recommendedMirror.url;
          }
        }
        
        console.log('最终 mirrors 列表:', this.mirrors);
        console.log('当前选择的镜像:', this.mirror);
      } catch (err) {
        console.error('加载镜像列表失败:', err);
        // 使用默认镜像列表
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
      if (!window.electronAPI || !window.electronAPI.testMirrorSpeed) {
        console.error('electronAPI.testMirrorSpeed 不存在');
        return;
      }
      
      this.testingSpeed = true;
      this.speedResults = {};
      
      try {
        const results = await window.electronAPI.testMirrorSpeed();
        console.log('测速结果:', results);
        
        // 将结果转换为以 URL 为键的对象
        results.forEach(result => {
          this.speedResults[result.url] = result;
        });
        
        // 刷新镜像列表以更新推荐标记
        await this.loadMirrors();
      } catch (err) {
        console.error('测速失败:', err);
      } finally {
        this.testingSpeed = false;
      }
    },
    onProxyToggle() {
      this.saveSettings();
      // 同步更新主进程配置
      if (this.useProxy) {
        // 开启代理时，使用当前选择的镜像
        this.saveMirror();
      } else {
        // 关闭代理时，使用直连（空字符串）
        if (window.electronAPI && window.electronAPI.setMirror) {
          window.electronAPI.setMirror('');
        }
      }
    },
    async saveMirror() {
      if (!window.electronAPI || !window.electronAPI.setMirror) return;
      try {
        const result = await window.electronAPI.setMirror(this.mirror);
        if (result.success) {
          console.log('镜像源已更新:', this.mirror);
        }
      } catch (err) {
        console.error('保存镜像源失败:', err);
      }
      // 同时保存到 localStorage
      this.saveSettings();
    },
    openGitHub() {
      if (window.electronAPI && window.electronAPI.openGitHub) {
        window.electronAPI.openGitHub();
      }
    },
    resetSettings() {
      this.theme = 'system';
      this.autoCheckUpdate = true;
      this.closeBehavior = 'exit';
      this.useProxy = true;
      this.mirror = 'https://ghfast.top/';
      this.proxy = '';
      this.saveSettings();
      // 同步更新主进程配置
      this.saveMirror();
      alert('设置已重置为默认值');
    },
    formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    copyAlipanLink() {
      navigator.clipboard.writeText(this.alipanUrl).then(() => {
        this.copied = true;
        setTimeout(() => {
          this.copied = false;
        }, 2000);
      }).catch(err => {
        console.error('复制失败:', err);
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = this.alipanUrl;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          this.copied = true;
          setTimeout(() => {
            this.copied = false;
          }, 2000);
        } catch (e) {
          alert('复制失败，请手动复制链接');
        }
        document.body.removeChild(textArea);
      });
    }
  },
  watch: {
    theme() {
      this.saveSettings();
    },
    autoCheckUpdate() {
      this.saveSettings();
    },
    closeBehavior() {
      this.saveSettings();
    },
    proxy() {
      this.saveSettings();
    }
  }
};
</script>

<style scoped>
.settings {
  background: var(--gradient-bg);
  border-radius: 28px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  height: 100%;
  overflow-y: auto;
}

.settings-header h1 {
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 24px;
  background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.settings-section {
  background: var(--bg-card);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 20px;
  border: 1px solid var(--border-light);
}

.settings-section h2 {
  font-size: 1.2rem;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-item label {
  font-weight: 500;
  color: var(--text-secondary);
}

.setting-item select, .setting-item input[type="text"] {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-medium);
  background: var(--bg-input);
  color: var(--text-primary);
}

.proxy-switch {
  display: flex;
  align-items: center;
  gap: 12px;
}

.switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 24px;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--bg-input);
  transition: 0.3s;
  border-radius: 24px;
  border: 1px solid var(--border-medium);
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background-color: var(--text-secondary);
  transition: 0.3s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: var(--primary);
  border-color: var(--primary);
}

input:checked + .slider:before {
  transform: translateX(24px);
  background-color: white;
}

.switch-label {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.mirror-selector {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mirror-selector select {
  flex: 1;
}

.test-speed-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

.test-speed-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.recommended-badge {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  margin-left: 8px;
  font-weight: 600;
}

.speed-badge {
  color: var(--text-secondary);
  font-size: 0.75rem;
  margin-left: 8px;
}

.proxy-tip {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 8px;
  margin-bottom: 0;
}

.alipan-banner {
  margin-top: 12px;
  padding: 0;
}

.alipan-banner-content {
  display: flex;
  align-items: center;
  gap: 12px;
  background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%);
  color: white;
  padding: 14px 20px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
}

.banner-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.banner-text {
  flex: 1;
  font-weight: 500;
  font-size: 0.95rem;
}

.banner-copy-btn {
  background: white;
  color: #007AFF;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.banner-copy-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.cache-info {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--text-secondary);
}

.cache-info button {
  background: var(--info-bg);
  color: var(--info-text);
  border: none;
  padding: 4px 12px;
  border-radius: 20px;
  cursor: pointer;
}

.github-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 20px;
  cursor: pointer;
}

.apply-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 30px;
  cursor: pointer;
  font-weight: 500;
  margin-right: 12px;
}

.reset-btn {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: none;
  padding: 8px 20px;
  border-radius: 30px;
  cursor: pointer;
  font-weight: 500;
}

.settings-footer {
  text-align: center;
  margin-top: 20px;
}
</style>
