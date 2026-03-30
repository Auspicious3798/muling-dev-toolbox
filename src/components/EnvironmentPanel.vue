<template>
  <div class="environment-panel">
    <div class="panel-header">
      <div class="title-section">
        <span class="tool-icon">{{ toolIcon }}</span>
        <h3>{{ toolLabel }}</h3>
      </div>
      <button class="install-btn" @click="$emit('install')">
        <span class="plus-icon">+</span> 安装
      </button>
    </div>

    <div class="toolbar">
      <button @click="refresh" class="refresh-btn" :disabled="loading">
        <span class="refresh-icon">⟳</span> {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </div>

    <div v-if="versions.length === 0 && !loading" class="empty-state">
      <div class="empty-icon">📦</div>
      <p>未检测到已安装的 {{ toolLabel }}</p>
    </div>

    <div v-else class="versions-grid">
      <div v-for="v in versions" :key="v" class="version-card" :class="{ 'is-default': v === defaultVersion }">
        <div class="card-header">
          <span class="version-badge">{{ toolLabel }} {{ v }}</span>
          <span v-if="v === defaultVersion" class="default-tag">默认</span>
        </div>
        <div class="card-body">
          <div v-if="tool === 'mysql'" class="service-status-row">
            <span class="status-label">服务状态：</span>
            <span v-if="serviceStatus[v]" class="service-status" :class="serviceStatus[v]">
              <span class="status-dot"></span>
              {{ serviceStatus[v] === 'running' ? '运行中' : (serviceStatus[v] === 'stopped' ? '已停止' : '未知') }}
            </span>
          </div>
        </div>
        <div class="card-actions">
          <button v-if="v !== defaultVersion" @click="switchVersion(v)" class="action-switch" :disabled="actionLoading">
            <span class="action-icon">⇄</span> 切换
          </button>
          <button v-if="tool === 'mysql'" @click="startService(v)" class="action-start" :disabled="actionLoading">
            <span class="action-icon">▶</span> 启动
          </button>
          <button v-if="tool === 'mysql'" @click="stopService(v)" class="action-stop" :disabled="actionLoading">
            <span class="action-icon">■</span> 停止
          </button>
          <button @click="uninstallVersion(v)" class="action-delete" :disabled="actionLoading">
            <span class="action-icon">🗑</span> 卸载
          </button>
        </div>
      </div>
    </div>

    <div v-if="apiMissing" class="warning-message">
      <span class="warning-icon">⚠️</span> 当前工具暂未支持检测，敬请期待。
    </div>
  </div>
</template>

<script>
export default {
  name: 'EnvironmentPanel',
  props: {
    tool: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      loading: false,
      versions: [],
      defaultVersion: null,
      serviceStatus: {},
      actionLoading: false,
      apiMissing: false
    };
  },
  computed: {
    toolLabel() {
      const map = {
        jdk: 'JDK',
        python: 'Python',
        mysql: 'MySQL',
        maven: 'Maven',
        gradle: 'Gradle',
        redis: 'Redis',
        nacos: 'Nacos',
        sentinel: 'Sentinel',
        rabbitmq: 'RabbitMQ',
        miniconda: 'Miniconda',
        jupyter: 'Jupyter Lab',
        ollama: 'Ollama',
        go: 'Go',
        mingw: 'MinGW',
        git: 'Git',
        nginx: 'Nginx',
        minio: 'MinIO',
        elasticsearch: 'Elasticsearch',
        kibana: 'Kibana',
        'redis-insight': 'Redis Insight'
      };
      return map[this.tool] || this.tool.toUpperCase();
    },
    toolIcon() {
      const icons = {
        jdk: '☕',
        python: '🐍',
        mysql: '🐬',
        maven: '📦',
        gradle: '🔄',
        redis: '🔴',
        nacos: '⚙️',
        sentinel: '🛡️',
        rabbitmq: '🐇',
        miniconda: '📦',
        jupyter: '📓',
        ollama: '🦙',
        go: '🐹',
        mingw: '🔧',
        git: '📜',
        nginx: '🌐',
        minio: '💾',
        elasticsearch: '🔍',
        kibana: '📊',
        'redis-insight': '🔴'
      };
      return icons[this.tool] || '🛠️';
    },
    checkMethod() {
      const methodMap = {
        jdk: 'checkJDK',
        python: 'checkPython',
        mysql: 'checkMySQL'
      };
      return methodMap[this.tool];
    },
    switchMethod() {
      const methodMap = {
        jdk: 'switchJDK',
        python: 'switchPython',
        mysql: 'switchMySQL'
      };
      return methodMap[this.tool];
    },
    deleteMethod() {
      const methodMap = {
        jdk: 'deleteJDK',
        python: 'deletePython',
        mysql: 'deleteMySQL'
      };
      return methodMap[this.tool];
    }
  },
  watch: {
    tool: {
      immediate: true,
      handler() {
        this.refresh();
      }
    }
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onJDKChanged?.(() => {
        if (this.tool === 'jdk') this.refresh();
      });
      window.electronAPI.onPythonChanged?.(() => {
        if (this.tool === 'python') this.refresh();
      });
      window.electronAPI.onMySQLChanged?.(() => {
        if (this.tool === 'mysql') this.refresh();
      });
    }
  },
  methods: {
    async refresh() {
      if (this.loading) return;
      this.loading = true;
      this.apiMissing = false;
      try {
        const api = window.electronAPI[this.checkMethod];
        if (!api) {
          this.apiMissing = true;
          return;
        }
        const result = await api();
        this.versions = result.versions || [];
        this.defaultVersion = result.default || null;
        if (this.tool === 'mysql') {
          await this.refreshAllServiceStatus();
        }
      } catch (err) {
        console.error(`${this.toolLabel} 检测失败`, err);
        if (err.message && err.message.includes('is not a function')) {
          this.apiMissing = true;
        }
      } finally {
        this.loading = false;
      }
    },
    async refreshAllServiceStatus() {
      if (this.tool !== 'mysql') return;
      for (const v of this.versions) {
        try {
          const res = await window.electronAPI.getMySQLServiceStatus(v);
          if (res.success) {
            this.serviceStatus[v] = res.status;
          } else {
            this.serviceStatus[v] = 'unknown';
          }
        } catch {
          this.serviceStatus[v] = 'unknown';
        }
      }
    },
    async switchVersion(version) {
      if (this.actionLoading) return;
      this.actionLoading = true;
      try {
        const api = window.electronAPI[this.switchMethod];
        if (!api) {
          this.$emit('status', `❌ 切换功能暂未支持`);
          return;
        }
        const result = await api(version);
        if (result.success) {
          this.$emit('status', `✅ 已切换到 ${this.toolLabel} ${version}`);
          await this.refresh();
        } else {
          this.$emit('status', `❌ 切换失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 切换失败：${err.message}`);
      } finally {
        this.actionLoading = false;
      }
    },
    async uninstallVersion(version) {
      if (this.actionLoading) return;
      if (!confirm(`确定要卸载 ${this.toolLabel} ${version} 吗？此操作不可撤销。`)) return;
      this.actionLoading = true;
      try {
        const api = window.electronAPI[this.deleteMethod];
        if (!api) {
          this.$emit('status', `❌ 卸载功能暂未支持`);
          return;
        }
        const result = await api(version);
        if (result.success) {
          this.$emit('status', `✅ 已卸载 ${this.toolLabel} ${version}`);
          await this.refresh();
        } else {
          this.$emit('status', `❌ 卸载失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 卸载失败：${err.message}`);
      } finally {
        this.actionLoading = false;
      }
    },
    async startService(version) {
      if (this.actionLoading) return;
      this.actionLoading = true;
      try {
        const result = await window.electronAPI.startMySQLService(version);
        if (result.success) {
          this.$emit('status', `✅ ${result.message}`);
          await this.refreshAllServiceStatus();
        } else {
          this.$emit('status', `❌ 启动失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 启动失败：${err.message}`);
      } finally {
        this.actionLoading = false;
      }
    },
    async stopService(version) {
      if (this.actionLoading) return;
      this.actionLoading = true;
      try {
        const result = await window.electronAPI.stopMySQLService(version);
        if (result.success) {
          this.$emit('status', `✅ ${result.message}`);
          await this.refreshAllServiceStatus();
        } else {
          this.$emit('status', `❌ 停止失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 停止失败：${err.message}`);
      } finally {
        this.actionLoading = false;
      }
    }
  }
};
</script>

<style scoped>
.environment-panel {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 28px;
  padding: 24px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.02);
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.3s ease;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #eef2f6;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-icon {
  font-size: 2rem;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.panel-header h3 {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 0;
  background: linear-gradient(135deg, #1e293b, #2c3e50);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  letter-spacing: -0.5px;
}

.install-btn {
  background: linear-gradient(135deg, #2c7a4d, #1f5e3a);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 40px;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.install-btn .plus-icon {
  font-size: 1.3rem;
  font-weight: 700;
}

.install-btn:hover {
  transform: translateY(-2px);
  background: linear-gradient(135deg, #1f5e3a, #154e2f);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
}

.toolbar {
  margin-bottom: 20px;
}

.refresh-btn {
  background-color: #f1f5f9;
  color: #334155;
  border: 1px solid #e2e8f0;
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
  background-color: #e6edf4;
  border-color: #cbd5e1;
  transform: scale(0.98);
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  background: #fefefe;
  border-radius: 28px;
  margin-top: 20px;
  border: 1px dashed #cbd5e1;
}

.empty-icon {
  font-size: 3.5rem;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-state p {
  color: #64748b;
  font-size: 1rem;
}

.versions-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  overflow-y: auto;
  padding-right: 4px;
}

.version-card {
  background: white;
  border-radius: 24px;
  padding: 16px;
  border: 1px solid #eef2f6;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.version-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.version-card.is-default {
  background: linear-gradient(135deg, #f0f9ff, #e6f4ff);
  border-left: 4px solid #2c7a4d;
  border-color: #b9e0f0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.version-badge {
  font-weight: 700;
  font-size: 1rem;
  background: #eef2ff;
  padding: 6px 14px;
  border-radius: 40px;
  color: #1e293b;
}

.default-tag {
  font-size: 0.75rem;
  background-color: #2c7a4d;
  color: white;
  padding: 4px 12px;
  border-radius: 30px;
  font-weight: 600;
}

.card-body {
  font-size: 0.9rem;
}

.service-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-label {
  font-weight: 500;
  color: #475569;
}

.service-status {
  font-size: 0.85rem;
  padding: 4px 12px;
  border-radius: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.service-status.running {
  background-color: #dcfce7;
  color: #166534;
}

.service-status.running .status-dot {
  background-color: #16a34a;
}

.service-status.stopped {
  background-color: #fee2e2;
  color: #991b1b;
}

.service-status.stopped .status-dot {
  background-color: #dc2626;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.card-actions button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 6px 12px;
  border-radius: 40px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.action-icon {
  font-size: 0.9rem;
}

.action-switch {
  background-color: #eff6ff;
  color: #2563eb;
}

.action-switch:hover:not(:disabled) {
  background-color: #dbeafe;
  transform: scale(0.96);
}

.action-start {
  background-color: #dcfce7;
  color: #16a34a;
}

.action-start:hover:not(:disabled) {
  background-color: #bbf7d0;
  transform: scale(0.96);
}

.action-stop {
  background-color: #fee2e2;
  color: #dc2626;
}

.action-stop:hover:not(:disabled) {
  background-color: #fecaca;
  transform: scale(0.96);
}

.action-delete {
  background-color: #fee2e2;
  color: #dc2626;
}

.action-delete:hover:not(:disabled) {
  background-color: #fecaca;
  transform: scale(0.96);
}

.card-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.warning-message {
  margin-top: 20px;
  padding: 14px 18px;
  background-color: #fffbeb;
  border-left: 4px solid #f59e0b;
  border-radius: 20px;
  font-size: 0.9rem;
  color: #b45309;
  display: flex;
  align-items: center;
  gap: 10px;
}

.warning-icon {
  font-size: 1.1rem;
}
</style>