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
        <label>关闭按钮行为</label>
        <select v-model="closeBehavior">
          <option value="exit">退出应用</option>
          <option value="tray">最小化到系统托盘</option>
        </select>
      </div>
      <div class="setting-item">
        <label>开机自动启动</label>
        <label class="switch">
          <input type="checkbox" v-model="autoLaunch"/>
          <span class="slider"></span>
        </label>
      </div>
      <div class="setting-item">
        <label>启动时自动恢复上次运行的服务</label>
        <label class="switch">
          <input type="checkbox" v-model="autoRestoreServices"/>
          <span class="slider"></span>
        </label>
      </div>
      <div class="setting-item">
        <label>版本</label>
        <div class="cache-info">
          <span v-if="updateInfo && updateInfo.hasUpdate" class="update-hint">
            发现新版本 {{ updateInfo.latest }}
          </span>
          <span v-else-if="updateInfo && updateInfo.latest" class="update-hint muted">
            已是最新（{{ updateInfo.current }}）
          </span>
          <span v-else-if="updateCheckTip" class="update-hint muted">{{ updateCheckTip }}</span>
          <button
            v-if="updateInfo && updateInfo.hasUpdate && updateInfo.url"
            class="download-update-btn"
            @click="openUpdatePage"
          >去下载</button>
          <button @click="checkUpdate" :disabled="checkingUpdate">{{ checkingUpdate ? '检查中…' : '检查更新' }}</button>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h2>显示与性能</h2>
      <div class="setting-item">
        <label>渲染模式</label>
        <select v-model="renderMode">
          <option value="auto">自动（按显卡能力探测）</option>
          <option value="lite">流畅优先（关闭毛玻璃与动画）</option>
          <option value="full">画质优先（毛玻璃与动效）</option>
        </select>
      </div>
      <div class="setting-item">
        <label>当前状态</label>
        <div class="cache-info">
          <span class="version-value">{{ renderStatusText }}</span>
          <button v-if="renderRestartHint" @click="relaunchApp">立即重启</button>
        </div>
      </div>
      <p class="render-hint">{{ renderDetailText }}</p>
    </div>

    <div class="settings-section">
      <h2>存储</h2>
      <div class="setting-item">
        <label>沙箱占用</label>
        <div class="cache-info">
          <span>{{ formatSize(sandboxUsage.total) }}</span>
          <button @click="openUsage" :disabled="usageLoading">{{ usageLoading ? '统计中…' : '查看明细' }}</button>
        </div>
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
      <h2>系统变量</h2>
      <div class="setting-item">
        <label>沙箱目录</label>
        <span class="version-value">{{ sandboxRoot || '未初始化' }}</span>
      </div>
      <div class="setting-item" v-for="item in injectionItems" :key="item.tool">
        <label>{{ item.label }}<span v-if="item.envVar" class="env-var-name">{{ item.envVar }}</span></label>
        <div class="cache-info">
          <span :class="['injection-state', item.enabled ? 'on' : 'off']">
            {{ item.enabled ? '已注入当前用户环境' : (item.active ? `未注入（默认 ${item.active}）` : (item.installed ? '未注入' : '未安装')) }}
          </span>
          <button v-if="item.enabled" @click="detachOne(item)" :disabled="detaching">撤出</button>
          <button v-else-if="item.active" @click="injectOne(item)" :disabled="detaching">注入</button>
        </div>
      </div>
      <div class="setting-item">
        <label>清理旧变量</label>
        <div class="cache-info">
          <span class="hint-text">把 PATH 里残留的旧 JDK / Python / MySQL 等目录摘掉（系统级需要一次管理员授权）</span>
          <button class="danger-btn" @click="cleanLegacy" :disabled="cleaningLegacy">{{ cleaningLegacy ? '清理中…' : '一键清理' }}</button>
        </div>
      </div>
      <div class="setting-item">
        <label>全部撤出</label>
        <div class="cache-info">
          <span class="hint-text">把注入过的所有 *_HOME 变量与对应 PATH 条目一次清干净</span>
          <button class="danger-btn" @click="detachAll" :disabled="detaching">一键撤出</button>
        </div>
      </div>
      <div v-if="!injectionItems.length" class="setting-item">
        <label>提示</label>
        <div class="cache-info">
          <span class="hint-text">还没有可注入的工具，先去装一个 JDK / Python / Maven 之类的吧</span>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <h2>配置备份</h2>
      <div class="setting-item">
        <label>导出配置</label>
        <div class="cache-info">
          <span class="hint-text">把已装的版本、默认版本、Nginx 站点打包成 .mlenv</span>
          <button @click="exportConfig" :disabled="backupBusy">导出</button>
        </div>
      </div>
      <div class="setting-item">
        <label>包含程序文件</label>
        <div class="cache-info">
          <span class="hint-text">勾选后把沙箱里的程序一起打包（体积可能几百 MB 到几 GB）</span>
          <label class="switch">
            <input type="checkbox" v-model="backupIncludeBinaries"/>
            <span class="slider"></span>
          </label>
        </div>
      </div>
      <div class="setting-item">
        <label>导入配置</label>
        <div class="cache-info">
          <span class="hint-text">在另一台电脑还原这套环境</span>
          <button @click="pickConfig" :disabled="backupBusy">选择配置包</button>
        </div>
      </div>
      <div class="setting-item">
        <label>覆盖已存在的同名版本</label>
        <label class="switch">
          <input type="checkbox" v-model="backupOverwrite"/>
          <span class="slider"></span>
        </label>
      </div>
      <div class="backup-missing" v-if="backupMissing.length">
        <div class="missing-head">
          <span>这些版本本机还没有，去左侧对应工具里安装一下就好啦～</span>
          <button @click="backupMissing = []">知道了</button>
        </div>
        <div class="missing-list">
          <span class="missing-chip" v-for="item in backupMissing" :key="item.tool + item.version">
            {{ toolLabel(item.tool) }} {{ item.version }}
          </span>
        </div>
      </div>
      <div class="backup-preview" v-if="backupPreview">
        <div class="preview-head">
          <span>配置包包含 {{ backupPreview.tools.length }} 个版本</span>
          <span class="preview-time">{{ formatDate(backupPreview.createdAt) }}</span>
        </div>
        <div class="preview-list">
          <div class="preview-item" v-for="item in backupPreview.tools" :key="item.tool + item.version">
            <span class="preview-name">{{ toolLabel(item.tool) }} {{ item.version }}</span>
            <span :class="['preview-state', item.present ? 'ok' : 'warn']">
              {{ item.present ? '本机已有' : '需下载' }}
            </span>
            <span v-if="item.active" class="preview-default">默认</span>
          </div>
        </div>
        <div class="preview-foot">
          <span class="hint-text" v-if="backupPreview.hasBinaries && backupPreview.size">
            含程序文件，约 {{ formatSize(backupPreview.size) }}
          </span>
          <div class="preview-actions">
            <button @click="backupPreview = null" :disabled="backupBusy">取消</button>
            <button class="primary-btn" @click="applyConfig" :disabled="backupBusy">开始导入</button>
          </div>
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

    <div v-if="showUsageModal" class="usage-overlay" @click.self="showUsageModal = false">
      <div class="usage-card">
        <h3>沙箱占用明细</h3>
        <p class="usage-total">合计 {{ formatSize(sandboxUsage.total) }}</p>
        <div class="usage-list" v-if="sandboxUsage.items.length">
          <div class="usage-row" v-for="item in sandboxUsage.items" :key="item.tool + item.dir">
            <span class="usage-tool">{{ toolLabel(item.tool) }} {{ item.version }}</span>
            <span class="usage-size">{{ formatSize(item.bytes) }}</span>
          </div>
        </div>
        <p class="usage-empty" v-else>沙箱里还没有安装任何工具。</p>
        <div class="usage-actions">
          <button @click="showUsageModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import eventBus from '../eventBus';
import Lemon from '@/utils/lemon';

export default {
  name: 'Settings',
  data() {
    return {
      theme: 'system',
      autoLaunch: false,
      autoRestoreServices: true,
      checkingUpdate: false,
      updateInfo: null,
      updateCheckTip: '',
      closeBehavior: 'tray',
      renderMode: 'auto',
      renderProfile: null,
      renderRestartHint: false,
      cacheSize: 0,
      logsSize: 0,
      clearingCache: false,
      clearingLogs: false,
      sandboxRoot: '',
      injectionItems: [],
      detaching: false,
      cleaningLegacy: false,
      backupBusy: false,
      backupIncludeBinaries: false,
      backupPreview: null,
      backupPreviewPath: '',
      backupMissing: [],
      backupOverwrite: false,
      versionInfo: { version: '', electron: '', node: '', chrome: '' },
      sandboxUsage: {total: 0, items: []},
      showUsageModal: false,
      usageLoading: false
    };
  },
  mounted() { this.loadSettings(); this.loadCacheInfo(); this.loadVersionInfo(); this.loadInjection(); this.loadAutoLaunch(); this.loadSandboxUsage(); this.loadRenderProfile(); },
  computed: {
    renderStatusText() {
      const p = this.renderProfile;
      if (!p) return '读取中…';
      const tier = p.lite ? '流畅档' : '画质档';
      const gpu = p.compositing === 'enabled' ? 'GPU 合成已启用' : 'GPU 合成不可用';
      const vram = p.vramMb ? `显存 ${p.vramMb} MB` : '显存未知';
      const from = p.mode === 'auto' ? '自动探测' : '手动指定';
      return `${tier} · ${gpu} · ${vram} · ${from}`;
    },
    renderDetailText() {
      const p = this.renderProfile;
      if (!p) return '';
      if (p.hint && p.hint.detail) return p.hint.detail;
      if (p.lite && p.vramMb && p.vramMb < 2048) return '显存低于 2 GB，已自动切到流畅档。';
      return p.lite ? '' : '当前为画质档：毛玻璃与动效全部开启。';
    }
  },
  methods: {
    async loadRenderProfile() {
      if (!window.electronAPI || !window.electronAPI.getRenderProfile) return;
      try {
        const res = await window.electronAPI.getRenderProfile();
        if (res && res.success) {
          this.renderProfile = res;
          this.renderMode = res.mode || 'auto';
        }
      } catch (err) {}
    },
    async applyRenderMode(mode) {
      if (!window.electronAPI || !window.electronAPI.setRenderMode) return;
      try {
        const res = await window.electronAPI.setRenderMode(mode);
        this.renderRestartHint = !!(res && res.restartRequired);
        if (res && res.restartRequired && window.Lemon && window.Lemon.info) {
          window.Lemon.info('渲染模式已保存，重启后生效');
        }
        await this.loadRenderProfile();
      } catch (err) {}
    },
    relaunchApp() {
      if (window.electronAPI && window.electronAPI.relaunchApp) window.electronAPI.relaunchApp();
    },
    async loadSandboxUsage() {
      if (!window.electronAPI || !window.electronAPI.getSandboxUsage) return;
      try {
        const res = await window.electronAPI.getSandboxUsage();
        if (res && res.success) {
          this.sandboxUsage = {total: res.total || 0, items: res.items || []};
        }
      } catch (err) {}
    },
    async openUsage() {
      this.usageLoading = true;
      await this.loadSandboxUsage();
      this.usageLoading = false;
      this.showUsageModal = true;
    },
    async loadAutoLaunch() {
      if (!window.electronAPI || !window.electronAPI.getAutoLaunch) return;
      try {
        const res = await window.electronAPI.getAutoLaunch();
        if (res && res.success) this.autoLaunch = Boolean(res.enabled);
      } catch (err) {
        this.autoLaunch = false;
      }
    },
    async openUpdatePage() {
      const url = (this.updateInfo && this.updateInfo.url) || '';
      if (!url) return;
      try { await window.electronAPI.openExternal(url); } catch (err) { Lemon.error('打开下载页失败'); }
    },

    async checkUpdate() {
      if (this.checkingUpdate || !window.electronAPI || !window.electronAPI.checkAppUpdate) return;
      this.checkingUpdate = true;
      this.updateCheckTip = '';
      try {
        const res = await window.electronAPI.checkAppUpdate();
        if (!res || !res.success) {
          this.updateCheckTip = '检查失败：' + ((res && res.message) || '网络不可用');
          return;
        }
        this.updateInfo = res;
        if (res.hasUpdate) Lemon.info(`发现新版本 ${res.latest}，当前 ${res.current}`);
        else Lemon.success('已经是最新版本啦～');
      } catch (err) {
        this.updateCheckTip = '检查失败：' + err.message;
      } finally {
        this.checkingUpdate = false;
      }
    },
    toolLabel(tool) {
      return { jdk: 'JDK', python: 'Python', mysql: 'MySQL', redis: 'Redis', maven: 'Maven', gradle: 'Gradle', nodejs: 'Node.js', nginx: 'Nginx', uv: 'uv' }[tool] || tool;
    },
    formatSize(bytes) {
      const size = Number(bytes) || 0;
      if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
      if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
      if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
      return `${size} B`;
    },
    formatDate(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },
    async exportConfig() {
      if (this.backupBusy) return;
      this.backupBusy = true;
      try {
        const settings = { theme: this.theme, closeBehavior: this.closeBehavior };
        const r = await window.electronAPI.exportEnvConfig({
          includeBinaries: this.backupIncludeBinaries,
          settings
        });
        if (r && r.success) {
          Lemon.success(`配置包已经装好啦：${r.toolCount} 个版本 · ${this.formatSize(r.size)}`, { duration: 5000 });
        } else if (r && !r.canceled) {
          Lemon.error(r.message || '导出失败');
        }
      } catch (err) {
        Lemon.error(`导出失败：${err.message}`);
      } finally {
        this.backupBusy = false;
      }
    },
    async pickConfig() {
      if (this.backupBusy) return;
      this.backupBusy = true;
      try {
        const r = await window.electronAPI.inspectEnvConfig();
        if (r && r.success) {
          this.backupPreview = r.preview;
          this.backupPreviewPath = r.filePath;
        } else if (r && !r.canceled) {
          Lemon.error(r.message || '读取配置包失败');
        }
      } catch (err) {
        Lemon.error(`读取失败：${err.message}`);
      } finally {
        this.backupBusy = false;
      }
    },
    async applyConfig() {
      if (this.backupBusy || !this.backupPreview) return;
      const preview = this.backupPreview;
      const missing = preview.tools.filter((item) => !item.present);
      const includeBinaries = preview.hasBinaries && missing.length > 0;
      this.backupBusy = true;
      try {
        const r = await window.electronAPI.importEnvConfig({
          filePath: this.backupPreviewPath,
          restoreBinaries: includeBinaries,
          onConflict: this.backupOverwrite ? 'overwrite' : 'skip'
        });
        if (!r || !r.success) {
          Lemon.error((r && r.message) || '导入失败');
          return;
        }
        this.backupPreview = null;
        this.backupMissing = r.missing || [];
        if (r.missing.length) {
          Lemon.show({
            type: 'info',
            text: `已还原 ${r.restored.length} 个版本；还有 ${r.missing.length} 个需要重新下载：${r.missing.map((item) => `${this.toolLabel(item.tool)} ${item.version}`).join('、')}`,
            duration: 8000
          });
        } else {
          Lemon.success(`环境还原完成：${r.restored.length} 个版本${r.siteCount ? ` · ${r.siteCount} 个站点` : ''}～`);
        }
        await this.loadInjection();
      } catch (err) {
        Lemon.error(`导入失败：${err.message}`);
      } finally {
        this.backupBusy = false;
      }
    },
    async loadInjection() {
      try {
        const info = await window.electronAPI.getSandboxInfo();
        if (!info || !info.success) return;
        this.sandboxRoot = info.data.root || '';
        const tools = info.data.tools || {};
        // 不再写死三项：主进程把所有「可注入」的工具都标了 injectable + label + envVar
        this.injectionItems = Object.entries(tools)
          .filter(([, meta]) => meta && meta.injectable)
          .map(([tool, meta]) => ({
            tool,
            label: meta.label || tool,
            envVar: meta.envVar || '',
            enabled: !!meta.injected,
            active: meta.active || '',
            installed: Array.isArray(meta.versions) ? meta.versions.length > 0 : false,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));

      } catch (err) {}
    },
    async injectOne(item) {
      if (this.detaching) return;
      if (!confirm(`把 ${item.label} ${item.active} 写进当前用户环境变量吗？\n写入 ${item.envVar || item.label} 与 PATH 引用，随时可以在这里撤出。`)) return;
      this.detaching = true;
      try {
        const r = await window.electronAPI.setSandboxInjection(item.tool, true);
        if (r.success) { Lemon.success(`${item.label} 已写进系统变量，新开的终端就能直接用啦～`); await this.loadInjection(); }
        else Lemon.error(r.message || '注入失败');
      } catch (err) { Lemon.error(`注入失败：${err.message}`); }
      finally { this.detaching = false; }
    },
    async detachOne(item) {
      if (this.detaching) return;
      if (!confirm(`确定撤出 ${item.label} 的用户环境变量吗？\n撤出后系统终端里就找不到它了，但「沐柠环境终端」仍然可用。`)) return;
      this.detaching = true;
      try {
        const r = await window.electronAPI.setSandboxInjection(item.tool, false);
        if (r.success) { Lemon.success(`${item.label} 的系统变量已经撤干净了～`); await this.loadInjection(); }
        else Lemon.error(r.message || '撤出失败');
      } catch (err) { Lemon.error(`撤出失败：${err.message}`); }
      finally { this.detaching = false; }
    },
    async cleanLegacy() {
      const api = window.electronAPI || {};
      if (!api.cleanLegacyEnv) { Lemon.error('当前环境不支持一键清理'); return; }
      this.cleaningLegacy = true;
      try {
        // 先探针：真的跑一遍 java/python/mvn…，看是不是「有进程、零输出」这种哑巴状态
        const probe = await (api.probeEnv ? api.probeEnv() : Promise.resolve(null));
        const items = (probe && probe.success && probe.data) || [];
        const crashed = items.filter((item) => item && item.probe && item.probe.verdict === 'crashed');
        const broken = items.filter((item) => item.broken);
        // 死掉的 javapath 转发壳既算「有问题」也算「被终止」，提示里只算一次
        const crashedOnly = crashed.filter((item) => !item.broken);
        if (items.length) {
          const healthy = items.filter((item) => !item.broken
            && !(item.probe && item.probe.verdict === 'crashed')).length;
          Lemon.info(`探针跑完：${items.length} 个命令，${healthy} 个正常，${broken.length} 个有问题`
            + (crashedOnly.length ? `，${crashedOnly.length} 个被系统直接终止` : ''));
          broken.slice(0, 3).forEach((item, i) => setTimeout(
            () => {
              const isShim = Boolean(item.deadShim);
              Lemon.error(isShim
                ? `${item.tool}：走的是 Oracle javapath 转发壳，它指向的 Java 已经不在了（运行即被系统终止），这条会被一并清掉`
                : `${item.tool}：${item.probe && item.probe.detail}`);
            },
            400 * (i + 1)
          ));
          // 被系统直接终止（0xC000000x）但不属于死壳的不动 PATH，只把路径和可能的成因说清楚
          crashedOnly.slice(0, 3).forEach((item, i) => setTimeout(
            () => {
              const isShim = /\\javapath(\\|$)/i.test(String(item.effective || ''));
              const hint = isShim
                ? '它其实是 Oracle javapath 的转发壳，跑起来直接被系统终止，多半它指向的 Java 已经被卸载了；接管一个 JDK 之后可以点「以管理员身份清理」把这条系统 PATH 去掉'
                : '可以手动在这个目录里跑一下看看，或用别的版本';
              Lemon.info(`${item.tool} 先不动：${item.effective || '未知路径'} —— ${item.probe.detail}，${hint}`);
            },
            400 * (broken.length + i + 1)
          ));
        }

        const res = await api.cleanLegacyEnv();
        if (!res || !res.success) { Lemon.error((res && res.message) || '清理失败'); return; }
        const data = res.data || {};
        const removed = data.removed || [];
        const affected = data.affectedVars || [];
        if (removed.length) {
          Lemon.success(`精准清掉了 ${removed.length} 条让命令失效的 PATH 条目，重开终端就生效～`);
          removed.slice(0, 5).forEach((line, i) => setTimeout(() => Lemon.info(line), 500 * (i + 1)));
        } else if (broken.length) {
          Lemon.info('探针发现有问题，但 PATH 里没有可以直接摘掉的条目，可能是变量指向了坏目录');
        } else {
          Lemon.info('探针全部正常，PATH 里没有会让命令失效的条目，不用担心～');
        }
        if (affected.length) {
          Lemon.info(`${affected.length} 个变量还指着旧目录，建议改掉：`);
          affected.slice(0, 4).forEach((line, i) => setTimeout(() => Lemon.info(line), 500 * (i + 1)));
        }
        if (data.needsAdmin) {
          Lemon.info('系统 PATH 里还有几条需要管理员权限，正在请求授权…');
          const el = await api.cleanLegacyEnvElevated();
          if (el && el.success) Lemon.info(el.message || '已请求管理员授权');
          else Lemon.error((el && el.message) || '提权失败，可右键程序「以管理员身份运行」后重试');
        }
      } catch (err) {
        Lemon.error(`清理失败：${err.message}`);
      } finally {
        this.cleaningLegacy = false;
      }
    },

    async detachAll() {
      if (this.detaching) return;
      if (!confirm('把注入过的所有系统变量（各项 *_HOME 及对应 PATH 条目）全部撤出吗？')) return;
      this.detaching = true;
      try {
        const r = await window.electronAPI.detachAllInjections();
        if (r.success) {
          Lemon.success(r.detached && r.detached.length ? `已撤出 ${r.detached.join('、')} 的系统变量～` : '本来就很干净，没有需要撤出的变量～');
          await this.loadInjection();
        } else Lemon.error(r.message || '撤出失败');
      } catch (err) { Lemon.error(`撤出失败：${err.message}`); }
      finally { this.detaching = false; }
    },
    loadSettings() {
      const stored = localStorage.getItem('toolbox_settings');
      if (stored) {
        const settings = JSON.parse(stored);
        this.theme = settings.theme || 'system';
        this.autoRestoreServices = settings.autoRestoreServices !== false;
        this.closeBehavior = settings.closeBehavior === 'exit' ? 'exit' : 'tray';
      }
      this.applyTheme();
    },
    saveSettings() {
      const settings = { theme: this.theme, autoRestoreServices: this.autoRestoreServices, closeBehavior: this.closeBehavior };
      localStorage.setItem('toolbox_settings', JSON.stringify(settings));
      this.applyTheme();
      eventBus.emit('theme-change', this.theme);
      if (window.electronAPI && window.electronAPI.setCloseBehavior) { window.electronAPI.setCloseBehavior(this.closeBehavior); }
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
    openGitHub() { if (window.electronAPI && window.electronAPI.openGitHub) { window.electronAPI.openGitHub(); } },
    resetSettings() {
      this.theme = 'system'; this.autoRestoreServices = true; this.closeBehavior = 'tray';
      this.saveSettings();
      Lemon.success('设置回到出厂模样啦～');
    },
    formatSize(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
  },
  watch: {
    theme() { this.saveSettings(); },
    autoRestoreServices() { this.saveSettings(); },
    autoLaunch(value) {
      if (window.electronAPI && window.electronAPI.setAutoLaunch) {
        window.electronAPI.setAutoLaunch(Boolean(value)).then((res) => {
          if (!res || !res.success) Lemon.error('设置开机自启失败：' + ((res && res.message) || '未知错误'));
        });
      }
    },
    closeBehavior() { this.saveSettings(); },
    renderMode(value) { this.applyRenderMode(value); }
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
  background: var(--bg-solid);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-family: var(--font-sans);
  transition: border-color var(--transition-fast);
}

.setting-item select option {
  background-color: var(--bg-solid);
  color: var(--text-primary);
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


.download-update-btn {
  background: var(--primary);
  color: #fff;
  border: none;
  cursor: pointer;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  margin-right: 8px;
  transition: all var(--transition-fast);
}

.download-update-btn:hover { background: var(--primary-hover); }
.update-hint { font-size: 0.76rem; color: var(--primary); margin-right: 8px; }
.update-hint.muted { color: var(--text-muted); }
.cache-info { display: flex; gap: var(--space-3); align-items: center; color: var(--text-secondary); font-size: 0.88rem; }

.render-hint {
  margin: 6px 0 0;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.cache-info button {
  background: var(--info-bg); color: var(--info-text); border: none;
  padding: 4px 12px; border-radius: var(--radius-full); cursor: pointer;
  font-size: 0.8rem; font-weight: 500;
  transition: all var(--transition-fast);
}
.cache-info button:hover:not(:disabled) { filter: brightness(0.93); }
.cache-info button:disabled { opacity: 0.5; cursor: not-allowed; }

.injection-state { font-size: 0.82rem; font-weight: 600; }
.injection-state.on { color: var(--primary); }
.injection-state.off { color: var(--text-muted); }
.env-var-name {
  margin-left: 8px;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text-muted);
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
}
.hint-text { font-size: 0.78rem; color: var(--text-muted); max-width: 420px; }
.cache-info button.danger-btn {
  background: color-mix(in srgb, #ef4444 14%, transparent);
  color: #f87171;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #ef4444 32%, transparent);
}
.cache-info button.danger-btn:hover:not(:disabled) {
  background: color-mix(in srgb, #ef4444 22%, transparent);
  filter: none;
}

.backup-missing {
  margin-top: var(--space-3);
  padding: 12px 16px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--primary) 8%, var(--bg-card));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 22%, transparent);
}
.missing-head {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  font-size: 0.8rem; color: var(--text-secondary);
}
.missing-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.missing-chip {
  font-size: 0.72rem; font-weight: 600; color: var(--text-secondary);
  background: var(--bg-input); padding: 3px 10px; border-radius: var(--radius-full);
}

.backup-preview {
  margin-top: var(--space-3);
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: var(--bg-card);
  box-shadow: var(--glass-edge), var(--glass-shadow);
}
.preview-head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.82rem; font-weight: 600; color: var(--text-primary);
  margin-bottom: 10px;
}
.preview-time { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }
.preview-list { display: flex; flex-direction: column; gap: 6px; max-height: 220px; overflow-y: auto; }
.preview-item { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; }
.preview-name { flex: 1; color: var(--text-secondary); }
.preview-state { font-size: 0.72rem; font-weight: 600; }
.preview-state.ok { color: var(--primary); }
.preview-state.warn { color: var(--text-muted); }
.preview-default {
  font-size: 0.68rem; font-weight: 700; color: var(--primary);
  background: color-mix(in srgb, var(--primary) 14%, transparent);
  padding: 2px 8px; border-radius: var(--radius-full);
}
.preview-foot {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 12px; padding-top: 10px;
  border-top: 1px solid var(--border-color);
}
.preview-actions { display: flex; gap: 8px; }
.preview-actions .primary-btn {
  background: var(--primary); color: #052e2b; font-weight: 700;
  padding: 8px 18px; border-radius: var(--radius-full); border: none; cursor: pointer;
}
.preview-actions .primary-btn:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }

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
.usage-overlay {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
}
.usage-card {
  width: min(520px, 90vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  padding: 22px 24px;
  border-radius: 18px;
  background: var(--bg-modal);
  border: 1px solid var(--border-light);
  box-shadow: var(--glass-shadow-float);
}
.usage-card h3 { margin: 0 0 6px; font-size: 1rem; }
.usage-total { margin: 0 0 12px; font-size: 0.82rem; color: var(--text-secondary); }
.usage-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.usage-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 4px;
  border-bottom: 1px solid var(--border-light);
  font-size: 0.8rem;
}
.usage-tool { color: var(--text-primary); }
.usage-size { color: var(--text-muted); font-family: var(--font-mono); }
.usage-empty { color: var(--text-muted); font-size: 0.82rem; }
.usage-actions { display: flex; justify-content: flex-end; margin-top: 14px; }
.usage-actions button {
  padding: 7px 18px;
  border-radius: 999px;
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}
</style>
