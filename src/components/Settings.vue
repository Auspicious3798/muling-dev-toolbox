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
        <label>下载镜像源</label>
        <select v-model="mirror" @change="saveMirror">
          <option v-for="m in mirrors" :key="m.url" :value="m.url">{{ m.name }}</option>
        </select>
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
      mirror: 'https://ghfast.top/',
      mirrors: [],
      proxy: '',
      cacheSize: 0,
      logsSize: 0,
      clearingCache: false,
      clearingLogs: false,
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
      }
      this.applyTheme();
    },
    saveSettings() {
      const settings = {
        theme: this.theme,
        autoCheckUpdate: this.autoCheckUpdate,
        closeBehavior: this.closeBehavior,
        mirror: this.mirror,
        proxy: this.proxy
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
            { name: '默认 (ghfast.top)', url: 'https://ghfast.top/' },
            { name: 'ghproxy.com', url: 'https://ghproxy.com/' },
            { name: 'mirror.ghproxy.com', url: 'https://mirror.ghproxy.com/' }
          ];
        } else {
          this.mirrors = result;
        }
        
        console.log('最终 mirrors 列表:', this.mirrors);
      } catch (err) {
        console.error('加载镜像列表失败:', err);
        // 使用默认镜像列表
        this.mirrors = [
          { name: '默认 (ghfast.top)', url: 'https://ghfast.top/' },
          { name: 'ghproxy.com', url: 'https://ghproxy.com/' },
          { name: 'mirror.ghproxy.com', url: 'https://mirror.ghproxy.com/' }
        ];
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