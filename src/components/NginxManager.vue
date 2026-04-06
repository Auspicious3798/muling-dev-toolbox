<template>
  <div class="nginx-manager">
    <!-- 全局扫描遮罩 -->
    <transition name="scan-overlay">
      <div v-if="loading" class="global-scan-overlay">
        <div class="scan-content">
          <div class="scan-spinner">
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
          </div>
          <div class="scan-text">
            <p class="scan-title">正在扫描环境</p>
            <p class="scan-subtitle">正在检测 Nginx 状态...</p>
          </div>
          <div class="scan-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </transition>

    <div class="panel-header">
      <div class="title-section">
        <img src="/icons/nginx.svg" class="tool-icon-img" alt=""/>
        <h3>Nginx 站点管理</h3>
        <span v-if="nginxInstalled" class="status-badge" :class="nginxRunning ? 'running' : 'stopped'">
          {{ nginxRunning ? '运行中' : '已停止' }}
        </span>
      </div>
      <div class="nginx-global-actions">
        <button @click="refreshAll" :disabled="loading" class="refresh-btn">
          <span class="refresh-icon">⟳</span> {{ loading ? '刷新中...' : '刷新' }}
        </button>
        <button v-if="!nginxInstalled" @click="openInstallDrawer" class="install-btn">安装 Nginx</button>
        <template v-else>
          <button @click="startNginx" :disabled="actionLoading" class="action-btn start">启动</button>
          <button @click="stopNginx" :disabled="actionLoading" class="action-btn stop">停止</button>
          <button @click="reloadNginx" :disabled="actionLoading" class="action-btn reload">重载</button>
          <button @click="uninstallNginx" :disabled="actionLoading" class="action-btn uninstall">卸载</button>
        </template>
      </div>
    </div>

    <!-- 未安装提示 -->
    <div v-if="!nginxInstalled && !loading" class="empty-state">
      <div class="empty-animation">
        <img src="/icons/nginx.svg" class="floating-icon" alt="Nginx"/>
        <div class="pulse-ring"></div>
        <div class="pulse-ring delay-1"></div>
        <div class="pulse-ring delay-2"></div>
      </div>
      <h3 class="empty-title">暂未安装 Nginx</h3>
      <p class="empty-desc">点击顶部"安装 Nginx"按钮开始安装</p>
    </div>

    <div v-else-if="nginxInstalled" class="sites-list">
      <div class="list-header">
        <span>网站列表</span>
        <button @click="openAddSiteDialog" class="add-btn">+ 新增站点</button>
      </div>
      <div class="site-table">
        <div class="table-header">
          <div>网站名</div>
          <div>端口</div>
          <div>dist 路径</div>
          <div>操作</div>
        </div>
        <div v-for="site in sites" :key="site.port" class="table-row">
          <div>{{ site.name }}</div>
          <div>{{ site.port }}</div>
          <div class="path-cell">{{ site.path }}</div>
          <div class="actions">
            <button @click="copySiteUrl(site.port)" class="action-icon-btn" title="复制链接">📋</button>
            <button @click="editSite(site)" class="action-icon-btn" title="编辑">✏️</button>
            <button @click="openDir(site.path)" class="action-icon-btn" title="打开目录">📁</button>
            <button @click="deleteSite(site.port)" class="action-icon-btn delete" title="删除">🗑</button>
          </div>
        </div>
        <div v-if="sites.length === 0" class="empty-row">暂无站点，点击上方按钮添加</div>
      </div>
    </div>

    <div v-if="showAddDialog" class="modal-overlay" @click.self="closeAddDialog">
      <div class="modal">
        <h4>{{ isEditMode ? '编辑站点' : '新增静态网站' }}</h4>
        <div class="modal-field">
          <label>网站名称</label>
          <input v-model="newSite.name" placeholder="例如：我的项目"/>
        </div>
        <div class="modal-field">
          <label>dist 目录路径</label>
          <div class="path-select">
            <input v-model="newSite.path" placeholder="D:/project/dist"/>
            <button @click="selectDistFolder" class="browse-btn">挂载</button>
          </div>
          <span v-if="newSite.path" class="warning-msg">⚠️ 提示：站点运行期间请勿删除或移动此文件夹</span>
        </div>
        <div class="modal-field">
          <label>端口号{{ isEditMode ? '' : '（可选）' }}</label>
          <input type="number" v-model.number="newSite.port" :placeholder="isEditMode ? '修改端口号' : '留空则自动分配'"/>
          <span v-if="portConflict" class="error-msg">端口已被占用或已被其他站点使用</span>
        </div>
        <div class="modal-buttons">
          <button @click="isEditMode ? updateSite() : addSite()" :disabled="addingSite" class="modal-btn confirm">
            {{ addingSite ? (isEditMode ? '保存中...' : '添加中...') : (isEditMode ? '保存' : '添加') }}
          </button>
          <button @click="closeAddDialog" :disabled="addingSite" class="modal-btn cancel">取消</button>
        </div>
      </div>
    </div>

    <div class="status" :class="{ 'status-success': status.includes('✅'), 'status-error': status.includes('❌') }">
      {{ status }}
    </div>
  </div>
</template>

<script>
import eventBus from '../eventBus';

export default {
  name: 'NginxManager',
  data() {
    return {
      nginxInstalled: false,
      nginxVersion: '',
      nginxRunning: false,
      sites: [],
      actionLoading: false,
      loading: false,
      status: '',
      showAddDialog: false,
      newSite: {name: '', path: '', port: null},
      addingSite: false,
      portConflict: false,
      isEditMode: false,
      originalPort: null
    };
  },
  watch: {
    // 监听端口输入，实时验证
    'newSite.port'(newPort) {
      if (newPort && newPort > 0) {
        this.checkPortConflict(newPort);
      } else {
        this.portConflict = false;
      }
    }
  },
  mounted() {
    this.checkNginx();
    this.loadSites();
    this.checkNginxStatus();
    setInterval(() => this.checkNginxStatus(), 3000);
    if (window.electronAPI) {
      window.electronAPI.onNginxChanged(() => {
        this.checkNginx();
        this.loadSites();
        this.checkNginxStatus();
      });
    }
    // 监听全局扫描事件，实现安装后自动刷新
    eventBus.on('scan-start', async (toolLabel) => {
      if (toolLabel === 'Nginx' && !this.loading) {
        console.log('[NginxManager] 收到 scan-start 事件，开始自动刷新');
        this.loading = true;
        try {
          await Promise.all([
            this.checkNginx(),
            this.loadSites(),
            this.checkNginxStatus()
          ]);
          console.log('[NginxManager] 自动刷新完成');
        } catch (err) {
          console.error('[NginxManager] 自动刷新失败', err);
        } finally {
          this.loading = false;
        }
      }
    });
  },
  beforeUnmount() {
    // 清理事件监听器，防止内存泄漏
    eventBus.off('scan-start');
  },
  methods: {
    openInstallDrawer() {
      this.$emit('install');
    },
    async refreshAll() {
      if (this.loading) return;
      this.loading = true;
      console.log('[NginxManager] 发送 scan-start 事件');
      eventBus.emit('scan-start', 'Nginx');
      try {
        await Promise.all([
          this.checkNginx(),
          this.loadSites(),
          this.checkNginxStatus()
        ]);
      } catch (err) {
        console.error('Nginx 刷新失败', err);
      } finally {
        this.loading = false;
        console.log('[NginxManager] 发送 scan-end 事件');
        eventBus.emit('scan-end');
      }
    },
    async checkNginx() {
      const res = await window.electronAPI.checkNginx();
      this.nginxInstalled = res.installed;
      this.nginxVersion = res.version;
    },
    async loadSites() {
      const res = await window.electronAPI.getNginxSites();
      this.sites = res.sites || [];
    },
    async checkNginxStatus() {
      if (!this.nginxInstalled) return;
      const res = await window.electronAPI.getNginxStatus();
      this.nginxRunning = res.running;
    },
    async uninstallNginx() {
      if (!confirm('确定要卸载 Nginx 吗？此操作会删除所有站点配置。')) return;
      this.actionLoading = true;
      const res = await window.electronAPI.uninstallNginx();
      if (res.success) this.status = `✅ ${res.message}`;
      else this.status = `❌ 卸载失败：${res.message}`;
      await this.checkNginx();
      await this.loadSites();
      this.actionLoading = false;
    },
    async startNginx() {
      this.actionLoading = true;
      const res = await window.electronAPI.startNginx();
      if (res.success) this.status = `✅ ${res.message}`;
      else this.status = `❌ 启动失败：${res.message}`;
      await this.checkNginxStatus();
      this.actionLoading = false;
    },
    async stopNginx() {
      this.actionLoading = true;
      const res = await window.electronAPI.stopNginx();
      if (res.success) this.status = `✅ ${res.message}`;
      else this.status = `❌ 停止失败：${res.message}`;
      await this.checkNginxStatus();
      this.actionLoading = false;
    },
    async reloadNginx() {
      this.actionLoading = true;
      const res = await window.electronAPI.reloadNginx();
      if (res.success) this.status = `✅ ${res.message}`;
      else this.status = `❌ 重载失败：${res.message}`;
      this.actionLoading = false;
    },
    async copySiteUrl(port) {
      const url = `http://localhost:${port}`;
      await this.copyToClipboard(url);
      this.status = `✅ 已复制网址：${url}`;
      setTimeout(() => {
        this.status = '';
      }, 3000);
    },
    async copyToClipboard(text) {
      try {
        // 优先使用现代 Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          // 降级方案：使用传统的 execCommand
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
      } catch (err) {
        console.error('[NginxManager] 复制失败:', err);
        // 最后降级：提示用户手动复制
        prompt('请手动复制以下网址：', text);
      }
    },
    async openDir(dirPath) {
      await window.electronAPI.openFileDialog({properties: ['openDirectory'], defaultPath: dirPath});
    },
    openAddSiteDialog() {
      this.newSite = {name: '', path: '', port: null};
      this.portConflict = false;
      this.isEditMode = false;
      this.originalPort = null;
      this.showAddDialog = true;
    },
    editSite(site) {
      this.newSite = {
        name: site.name,
        path: site.path,
        port: site.port
      };
      this.portConflict = false;
      this.isEditMode = true;
      this.originalPort = site.port;
      this.showAddDialog = true;
    },
    closeAddDialog() {
      this.showAddDialog = false;
    },
    async selectDistFolder() {
      const dir = await window.electronAPI.openFileDialog({properties: ['openDirectory']});
      if (dir) this.newSite.path = dir;
    },
    async addSite() {
      if (!this.newSite.name || !this.newSite.path) {
        alert('请填写网站名称和 dist 路径');
        return;
      }
      this.addingSite = true;
      this.portConflict = false;
      console.log('[NginxManager] 开始添加站点:', this.newSite);
      try {
        // 将响应式对象转换为纯对象，避免 Electron IPC 克隆错误
        const siteData = {
          name: this.newSite.name,
          path: this.newSite.path,
          port: this.newSite.port
        };
        const res = await window.electronAPI.addNginxSite(siteData);
        if (res.success) {
          await this.loadSites();
          this.closeAddDialog();
          
          // 如果 Nginx 正在运行，则重载配置
          if (this.nginxRunning) {
            await this.reloadNginx();
            this.status = `✅ 站点已添加，端口：${res.port}，Nginx 已重载`;
          } else {
            this.status = `✅ 站点已添加，端口：${res.port}。请启动 Nginx 使配置生效。`;
          }
          console.log('[NginxManager] 站点添加成功');
        } else {
          if (res.message.includes('端口')) {
            this.portConflict = true;
            console.log('[NginxManager] 端口冲突');
          } else {
            alert('添加失败：' + res.message);
            console.error('[NginxManager] 添加失败:', res.message);
          }
        }
      } catch (err) {
        console.error('[NginxManager] 添加站点异常:', err);
        alert('添加站点时发生错误：' + err.message);
      } finally {
        this.addingSite = false;
      }
    },
    async updateSite() {
      if (!this.newSite.name || !this.newSite.path) {
        alert('请填写网站名称和 dist 路径');
        return;
      }
      if (!this.originalPort) {
        alert('错误：无法找到原始端口');
        return;
      }
      
      this.addingSite = true;
      this.portConflict = false;
      console.log('[NginxManager] 开始更新站点:', this.newSite);
      
      try {
        const siteData = {
          originalPort: this.originalPort,
          name: this.newSite.name,
          path: this.newSite.path,
          port: this.newSite.port
        };
        const res = await window.electronAPI.updateNginxSite(siteData);
        
        if (res.success) {
          await this.loadSites();
          this.closeAddDialog();
          
          // 如果 Nginx 正在运行，则重载配置
          if (this.nginxRunning) {
            await this.reloadNginx();
            this.status = `✅ 站点已更新，Nginx 已重载`;
          } else {
            this.status = `✅ 站点已更新。请启动 Nginx 使配置生效。`;
          }
          console.log('[NginxManager] 站点更新成功');
        } else {
          if (res.message.includes('端口')) {
            this.portConflict = true;
            console.log('[NginxManager] 端口冲突');
          } else {
            alert('更新失败：' + res.message);
            console.error('[NginxManager] 更新失败:', res.message);
          }
        }
      } catch (err) {
        console.error('[NginxManager] 更新站点异常:', err);
        alert('更新站点时发生错误：' + err.message);
      } finally {
        this.addingSite = false;
      }
    },
    async deleteSite(port) {
      if (!confirm('确定要删除该站点吗？')) return;
      const res = await window.electronAPI.deleteNginxSite(port);
      if (res.success) {
        await this.loadSites();
        
        // 如果 Nginx 正在运行，则重载配置
        if (this.nginxRunning) {
          await this.reloadNginx();
          this.status = '✅ 站点已删除，Nginx 已重载';
        } else {
          this.status = '✅ 站点已删除。请启动 Nginx 使配置生效。';
        }
      } else {
        alert('删除失败：' + res.message);
      }
    }
  }
};
</script>

<style scoped>
.nginx-manager {
  background: var(--gradient-bg);
  border-radius: 28px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--border-light);
}

.title-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-icon-img {
  width: 32px;
  height: 32px;
}

h3 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.nginx-global-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.refresh-btn {
  background-color: var(--bg-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-medium);
  padding: 8px 18px;
  border-radius: 30px;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background-color: var(--border-light);
  border-color: var(--border-dark);
  transform: scale(0.98);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 30px;
  font-size: 0.8rem;
  font-weight: 600;
}

.status-badge.running {
  background: var(--success-bg);
  color: var(--success-text);
}

.status-badge.stopped {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.install-btn, .action-btn {
  padding: 6px 16px;
  border-radius: 30px;
  border: none;
  font-weight: 500;
  cursor: pointer;
}

.install-btn {
  background: var(--primary);
  color: white;
}

.action-btn.start {
  background: var(--success-bg);
  color: var(--success-text);
}

.action-btn.stop {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.action-btn.reload {
  background: var(--info-bg);
  color: var(--info-text);
}

.action-btn.uninstall {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.sites-list {
  flex: 1;
  background: var(--bg-card);
  border-radius: 24px;
  padding: 16px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-weight: 600;
}

.add-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: 6px 16px;
  border-radius: 30px;
  cursor: pointer;
}

.site-table {
  width: 100%;
}

.table-header, .table-row {
  display: grid;
  grid-template-columns: 1fr 80px 2fr 120px;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-light);
}

.table-header {
  font-weight: 600;
  color: var(--text-secondary);
}

.path-cell {
  font-size: 0.8rem;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions {
  display: flex;
  gap: 8px;
}

.action-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2rem;
}

.action-icon-btn.delete {
  color: var(--danger-text);
}

.empty-row {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}

.empty-state {
  text-align: center;
  padding: 80px 20px;
  background: var(--bg-card);
  border-radius: 28px;
  margin-top: 20px;
  border: 1px dashed var(--border-medium);
  position: relative;
  overflow: hidden;
}

.empty-animation {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 0 auto 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.floating-icon {
  width: 60px;
  height: 60px;
  z-index: 2;
  animation: float 3s ease-in-out infinite;
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.15));
}

.pulse-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 3px solid var(--primary);
  border-radius: 50%;
  opacity: 0;
  animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}

.pulse-ring.delay-1 {
  animation-delay: 0.4s;
}

.pulse-ring.delay-2 {
  animation-delay: 0.8s;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  25% {
    transform: translateY(-10px) rotate(-2deg);
  }
  50% {
    transform: translateY(-5px) rotate(0deg);
  }
  75% {
    transform: translateY(-12px) rotate(2deg);
  }
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.empty-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 12px;
  background: linear-gradient(135deg, var(--text-primary), var(--primary));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.empty-desc {
  color: var(--text-secondary);
  font-size: 0.95rem;
  line-height: 1.6;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-modal);
  padding: 24px;
  border-radius: 20px;
  width: 450px;
}

.modal-field {
  margin-bottom: 16px;
}

.modal-field label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
}

.modal-field input {
  width: 100%;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-medium);
  background: var(--bg-input);
  color: var(--text-primary);
}

.path-select {
  display: flex;
  gap: 8px;
}

.browse-btn {
  background: var(--info-bg);
  border: none;
  padding: 0 12px;
  border-radius: 8px;
  cursor: pointer;
}

.error-msg {
  color: var(--danger-text);
  font-size: 0.75rem;
  margin-top: 4px;
  display: block;
}

.warning-msg {
  color: var(--warning-text, #f59e0b);
  font-size: 0.75rem;
  margin-top: 6px;
  display: block;
  line-height: 1.4;
}

.modal-buttons {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}

.modal-btn {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
}

.modal-btn.confirm {
  background: var(--primary);
  color: white;
}

.modal-btn.cancel {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.status {
  font-size: 0.9rem;
  text-align: center;
  padding: 0.5rem;
  border-radius: 10px;
  background-color: var(--bg-secondary);
  margin-top: 16px;
  color: var(--text-primary);
}

.status-success {
  background-color: var(--success-bg);
  color: var(--success-text);
}

.status-error {
  background-color: var(--danger-bg);
  color: var(--danger-text);
}
</style>