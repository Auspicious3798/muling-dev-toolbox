<template>
  <div class="jdk-installer">
    <h3>☕ JDK</h3>
    <select v-model="selectedVersion">
      <option value="21">JDK 21 (LTS)</option>
      <option value="17">JDK 17 (LTS)</option>
    </select>
    <button @click="installJDK" :disabled="installing">
      {{ installing ? '安装中...' : '开始安装' }}
    </button>
    <div class="status">{{ status }}</div>
    <div class="progress-bar" v-if="showProgress">
      <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'JDKInstaller',
  data() {
    return {
      selectedVersion: '21',
      installing: false,
      status: '未安装',
      showProgress: false,
      progressPercent: 0
    };
  },
  mounted() {
    if (window.electronAPI) {
      window.electronAPI.onDownloadProgress((data) => {
        if (data.type === 'jdk' && data.version === this.selectedVersion) {
          this.progressPercent = data.progress * 100;
          if (data.progress === 1) {
            this.status = '下载完成，正在安装...';
          }
        }
      });
    } else {
      this.status = '错误：未连接到主进程';
    }
  },
  methods: {
    async installJDK() {
      if (this.installing) return;
      this.installing = true;
      this.showProgress = true;
      this.progressPercent = 0;
      this.status = '⏳ 正在下载安装...';

      try {
        const result = await window.electronAPI.installJDK(this.selectedVersion);
        if (result.success) {
          this.status = `✅ ${result.message}`;
          setTimeout(() => {
            this.showProgress = false;
          }, 2000);
        } else {
          this.status = `❌ 安装失败：${result.message}`;
          this.showProgress = false;
        }
      } catch (err) {
        this.status = `❌ 安装失败：${err.message}`;
        this.showProgress = false;
      } finally {
        this.installing = false;
      }
    }
  }
};
</script>

<style scoped>
.status {
  margin-top: 12px;
  font-size: 14px;
  color: #4a5568;
}
.progress-bar {
  width: 100%;
  background-color: #e2e8f0;
  border-radius: 999px;
  margin-top: 12px;
  overflow: hidden;
}
.progress-fill {
  height: 8px;
  background-color: #2c7a4d;
  width: 0%;
  transition: width 0.2s ease;
}
</style>