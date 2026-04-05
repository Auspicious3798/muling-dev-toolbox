<template>
  <div class="package-manager-overlay" @click.self="close">
    <div class="package-manager">
      <div class="pm-header">
        <h3>Python {{ version }} 包管理</h3>
        <button class="close-btn" @click="close">✕</button>
      </div>
      <div class="pm-toolbar">
        <input
            type="text"
            v-model="searchQuery"
            placeholder="搜索包..."
            class="search-input"
        />
        <button @click="refreshPackages" class="refresh-btn" :disabled="loading">
          ⟳ 刷新
        </button>
      </div>
      <div class="install-section">
        <input
            type="text"
            v-model="newPackageName"
            placeholder="输入包名，例如 requests"
            class="install-input"
            @keyup.enter="installPackage"
        />
        <button @click="installPackage" :disabled="installing" class="install-pkg-btn">
          {{ installing ? '安装中...' : '安装' }}
        </button>
      </div>
      <div class="package-list">
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else-if="filteredPackages.length === 0" class="empty">暂无包</div>
        <div v-else class="package-items">
          <div v-for="pkg in filteredPackages" :key="pkg.name" class="package-item">
            <div class="pkg-info">
              <span class="pkg-name">{{ pkg.name }}</span>
              <span class="pkg-version">{{ pkg.version }}</span>
            </div>
            <button
                @click="uninstallPackage(pkg.name)"
                class="uninstall-btn"
                :disabled="uninstalling === pkg.name"
            >
              {{ uninstalling === pkg.name ? '卸载中...' : '卸载' }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="message" class="status-message" :class="messageType">
        {{ message }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'PackageManager',
  props: {
    version: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      loading: false,
      packages: [],
      searchQuery: '',
      newPackageName: '',
      installing: false,
      uninstalling: '',
      message: '',
      messageType: ''
    };
  },
  computed: {
    filteredPackages() {
      if (!this.searchQuery) return this.packages;
      const q = this.searchQuery.toLowerCase();
      return this.packages.filter(pkg => pkg.name.toLowerCase().includes(q));
    }
  },
  mounted() {
    this.refreshPackages();
  },
  methods: {
    showMessage(msg, isError = false) {
      this.message = msg;
      this.messageType = isError ? 'error' : 'success';
      setTimeout(() => {
        this.message = '';
      }, 3000);
    },
    async refreshPackages() {
      this.loading = true;
      try {
        const result = await window.electronAPI.listPackages(this.version);
        if (result.success) {
          this.packages = result.packages;
        } else {
          this.showMessage(`获取包列表失败: ${result.message}`, true);
        }
      } catch (err) {
        this.showMessage(`获取包列表失败: ${err.message}`, true);
      } finally {
        this.loading = false;
      }
    },
    async installPackage() {
      if (!this.newPackageName.trim()) return;
      this.installing = true;
      try {
        const result = await window.electronAPI.installPackage(this.version, this.newPackageName.trim());
        if (result.success) {
          this.showMessage(`✅ ${result.message}`);
          this.newPackageName = '';
          await this.refreshPackages();
        } else {
          this.showMessage(`❌ 安装失败: ${result.message}`, true);
        }
      } catch (err) {
        this.showMessage(`❌ 安装失败: ${err.message}`, true);
      } finally {
        this.installing = false;
      }
    },
    async uninstallPackage(pkgName) {
      if (!confirm(`确定要卸载 ${pkgName} 吗？`)) return;
      this.uninstalling = pkgName;
      try {
        const result = await window.electronAPI.uninstallPackage(this.version, pkgName);
        if (result.success) {
          this.showMessage(`✅ ${result.message}`);
          await this.refreshPackages();
        } else {
          this.showMessage(`❌ 卸载失败: ${result.message}`, true);
        }
      } catch (err) {
        this.showMessage(`❌ 卸载失败: ${err.message}`, true);
      } finally {
        this.uninstalling = '';
      }
    },
    close() {
      this.$emit('close');
    }
  }
};
</script>

<style scoped>
.package-manager-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.package-manager {
  background: var(--bg-card);
  border-radius: 24px;
  width: 600px;
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
}

.pm-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-light);
}

.pm-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-secondary);
}

.pm-toolbar {
  display: flex;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-light);
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 20px;
  border: 1px solid var(--border-medium);
  background: var(--bg-input);
  color: var(--text-primary);
}

.refresh-btn {
  background: var(--info-bg);
  color: var(--info-text);
  border: none;
  padding: 6px 16px;
  border-radius: 20px;
  cursor: pointer;
}

.install-section {
  display: flex;
  gap: 12px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-light);
}

.install-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 20px;
  border: 1px solid var(--border-medium);
  background: var(--bg-input);
  color: var(--text-primary);
}

.install-pkg-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: 6px 20px;
  border-radius: 20px;
  cursor: pointer;
}

.package-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px;
}

.package-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.package-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: 12px;
}

.pkg-info {
  display: flex;
  gap: 12px;
  align-items: baseline;
}

.pkg-name {
  font-weight: 600;
  color: var(--text-primary);
}

.pkg-version {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.uninstall-btn {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: none;
  padding: 4px 12px;
  border-radius: 20px;
  cursor: pointer;
}

.loading, .empty {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

.status-message {
  margin: 12px 20px;
  padding: 8px;
  border-radius: 8px;
  text-align: center;
}

.status-message.success {
  background: var(--success-bg);
  color: var(--success-text);
}

.status-message.error {
  background: var(--danger-bg);
  color: var(--danger-text);
}
</style>