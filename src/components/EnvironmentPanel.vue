<template>
  <div class="environment-panel">
    <h3>🔍 环境检测 - {{ typeLabel }}</h3>
    <button @click="refresh" class="detect-btn" :disabled="checking">
      {{ checking ? '检测中...' : '刷新' }}
    </button>
    <div v-if="detectedVersions.length" class="detected-list">
      <div class="default-version" v-if="defaultVersion">
        <span>当前默认 {{ typeLabel }}：</span>
        <span class="version-badge">{{ defaultVersion }}</span>
      </div>
      <div v-for="v in detectedVersions" :key="v" class="version-card">
        <span class="version-number">{{ typeLabel }} {{ v }}</span>
        <div class="card-actions">
          <button @click="switchToVersion(v)" class="switch-btn" title="设为默认">🔄 切换</button>
          <button @click="deleteVersion(v)" class="delete-btn" title="卸载">🗑️ 卸载</button>
        </div>
      </div>
    </div>
    <div v-else-if="!checking" class="no-version">
      未检测到 {{ typeLabel }}
    </div>
    <div v-if="apiMissing" class="warning-message">
      ⚠️ 当前环境暂未支持 {{ typeLabel }} 检测，敬请期待。
    </div>
  </div>
</template>

<script>
export default {
  name: 'EnvironmentPanel',
  props: {
    type: {
      type: String,
      required: true,
      validator: (val) => ['jdk', 'python', 'mysql'].includes(val)
    }
  },
  data() {
    return {
      checking: false,
      detectedVersions: [],
      defaultVersion: null,
      switching: false,
      deleting: false,
      apiMissing: false
    };
  },
  computed: {
    typeLabel() {
      const map = {jdk: 'JDK', python: 'Python', mysql: 'MySQL'};
      return map[this.type] || this.type.toUpperCase();
    },
    checkMethod() {
      return `check${this.type.toUpperCase()}`;
    },
    switchMethod() {
      return `switch${this.type.toUpperCase()}`;
    },
    deleteMethod() {
      return `delete${this.type.toUpperCase()}`;
    }
  },
  watch: {
    type() {
      this.refresh();
    }
  },
  mounted() {
    this.refresh();
    if (window.electronAPI) {
      window.electronAPI.onJDKChanged(() => {
        if (this.type === 'jdk') this.refresh();
      });
    }
  },
  methods: {
    async refresh() {
      if (this.checking) return;
      this.checking = true;
      this.apiMissing = false;
      this.detectedVersions = [];
      this.defaultVersion = null;
      try {
        const api = window.electronAPI[this.checkMethod];
        if (!api) {
          this.apiMissing = true;
          return;
        }
        const result = await api();
        this.detectedVersions = result.versions;
        this.defaultVersion = result.default;
      } catch (err) {
        console.error(`${this.typeLabel} 检测失败`, err);
        if (err.message && err.message.includes('is not a function')) {
          this.apiMissing = true;
        }
      } finally {
        this.checking = false;
      }
    },
    async switchToVersion(version) {
      if (this.switching) return;
      this.switching = true;
      try {
        const api = window.electronAPI[this.switchMethod];
        if (!api) {
          this.$emit('status', `❌ ${this.typeLabel} 切换功能暂未支持`);
          return;
        }
        const result = await api(version);
        if (result.success) {
          this.$emit('status', `✅ 已切换到 ${this.typeLabel} ${version}`);
          this.refresh();
        } else {
          this.$emit('status', `❌ 切换失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 切换失败：${err.message}`);
      } finally {
        this.switching = false;
      }
    },
    async deleteVersion(version) {
      if (this.deleting) return;
      if (!confirm(`确定要卸载 ${this.typeLabel} ${version} 吗？此操作不可撤销。`)) return;
      this.deleting = true;
      try {
        const api = window.electronAPI[this.deleteMethod];
        if (!api) {
          this.$emit('status', `❌ ${this.typeLabel} 卸载功能暂未支持`);
          return;
        }
        const result = await api(version);
        if (result.success) {
          this.$emit('status', `✅ 已卸载 ${this.typeLabel} ${version}`);
          this.refresh();
        } else {
          this.$emit('status', `❌ 卸载失败：${result.message}`);
        }
      } catch (err) {
        this.$emit('status', `❌ 卸载失败：${err.message}`);
      } finally {
        this.deleting = false;
      }
    }
  }
};
</script>

<style scoped>
.environment-panel {
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
}

h3 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #1f2937;
}

.detect-btn {
  background-color: #3b82f6;
  color: white;
  border: none;
  padding: 0.4rem 1rem;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s ease, transform 0.1s ease;
  margin-bottom: 12px;
}

.detect-btn:hover:not(:disabled) {
  background-color: #2563eb;
  transform: scale(0.98);
}

.detect-btn:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
}

.detected-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 4px;
}

.default-version {
  background-color: #e0f2fe;
  border-radius: 12px;
  padding: 8px 12px;
  margin-bottom: 8px;
  font-size: 0.9rem;
  color: #0369a1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.version-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #f9fafb;
  border-radius: 12px;
  padding: 8px 12px;
  transition: all 0.2s ease;
  border: 1px solid #e5e7eb;
}

.version-card:hover {
  background-color: #f3f4f6;
  border-color: #d1d5db;
  transform: translateX(2px);
}

.version-number {
  font-weight: 600;
  font-size: 0.9rem;
  color: #1f2937;
  background: #e5e7eb;
  padding: 2px 8px;
  border-radius: 20px;
}

.card-actions {
  display: flex;
  gap: 8px;
}

.switch-btn, .delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 4px 8px;
  border-radius: 20px;
  transition: all 0.2s;
  font-weight: 500;
}

.switch-btn {
  color: #3b82f6;
  background-color: #eff6ff;
}

.switch-btn:hover {
  background-color: #dbeafe;
  transform: scale(0.95);
}

.delete-btn {
  color: #ef4444;
  background-color: #fee2e2;
}

.delete-btn:hover {
  background-color: #fecaca;
  transform: scale(0.95);
}

.no-version {
  color: #6b7280;
  font-size: 0.85rem;
  text-align: center;
  padding: 12px;
  background: #f9fafb;
  border-radius: 12px;
  margin-top: 8px;
}

.warning-message {
  margin-top: 12px;
  padding: 8px;
  background-color: #fef9e6;
  border-left: 4px solid #f5b042;
  border-radius: 8px;
  font-size: 0.8rem;
  color: #b16e0c;
}
</style>