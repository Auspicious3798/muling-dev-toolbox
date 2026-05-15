<template>
  <div class="nav-menu">
    <div class="nav-header">
      <div class="nav-brand">
        <span class="brand-icon">⬡</span>
        <div class="brand-text">
          <h2>沐柠环境盒</h2>
          <span class="brand-version">Dev Toolbox</span>
        </div>
      </div>
    </div>
    <div class="nav-items">
      <NavMenuItem
          v-for="item in menuItems"
          :key="item.id"
          :item="item"
          :active-id="activeTool"
          @select="handleSelect"
      />
    </div>
    <div class="nav-footer">
      <div class="nav-footer-status">
        <span class="status-indicator"></span>
        <span>运行中</span>
      </div>
    </div>
  </div>
</template>

<script>
import NavMenuItem from './NavMenuItem.vue';
import AIIcon from '/icons/AI.svg?url';
import CIcon from '/icons/c.svg?url';
import ElasticsearchIcon from '/icons/elasticsearch.svg?url';
import GitIcon from '/icons/git.svg?url';
import GolangIcon from '/icons/Golang.svg?url';
import GradleIcon from '/icons/gradle.svg?url';
import JavaIcon from '/icons/java.svg?url';
import JupyterIcon from '/icons/Jupyter.svg?url';
import KibanaIcon from '/icons/kibana.svg?url';
import MavenIcon from '/icons/maven.svg?url';
import MinicondaIcon from '/icons/Miniconda.svg?url';
import MinioIcon from '/icons/minio.svg?url';
import MysqlIcon from '/icons/mysql.svg?url';
import NacosIcon from '/icons/nacos.svg?url';
import NginxIcon from '/icons/nginx.svg?url';
import OllamaIcon from '/icons/Ollama.svg?url';
import PythonIcon from '/icons/Python.svg?url';
import RabbitmqIcon from '/icons/Rabbitmq.svg?url';
import RedisIcon from '/icons/Redis.svg?url';
import SentinelIcon from '/icons/sentinel.svg?url';
import DashboardIcon from '/icons/Dashboard.svg?url';
import LemonIcon from '/icons/lemon.svg?url';
import SettingsIcon from '/icons/setting.svg?url';
import ProductIcon from '/icons/lemon.svg?url';

export default {
  name: 'NavMenu',
  components: {NavMenuItem},
  props: {
    activeTool: { type: String, default: 'jdk' }
  },
  data() {
    return {
      menuItems: [
        { id: 'dashboard', label: '仪表盘', icon: DashboardIcon, children: [] },
        { id: 'java-group', label: 'Java 开发环境', icon: JavaIcon, children: [
            {id: 'jdk', label: 'JDK', icon: JavaIcon},
            {id: 'maven', label: 'Maven', icon: MavenIcon},
            {id: 'gradle', label: 'Gradle', icon: GradleIcon},
            {id: 'mysql', label: 'MySQL', icon: MysqlIcon},
            {id: 'redis', label: 'Redis', icon: RedisIcon},
            {id: 'nacos', label: 'Nacos', icon: NacosIcon},
            {id: 'sentinel', label: 'Sentinel', icon: SentinelIcon},
            {id: 'rabbitmq', label: 'RabbitMQ', icon: RabbitmqIcon}
        ]},
        { id: 'python-group', label: 'Python & AI 环境', icon: PythonIcon, children: [
            {id: 'python', label: 'Python', icon: PythonIcon},
            {id: 'miniconda', label: 'Miniconda', icon: MinicondaIcon},
            {id: 'jupyter', label: 'Jupyter Lab', icon: JupyterIcon},
            {id: 'ollama', label: 'Ollama', icon: OllamaIcon}
        ]},
        { id: 'go-group', label: 'Go 开发环境', icon: GolangIcon, children: [
            {id: 'go', label: 'Go', icon: GolangIcon}
        ]},
        { id: 'cpp-group', label: 'C/C++ 环境', icon: CIcon, children: [
            {id: 'mingw', label: 'MinGW', icon: CIcon}
        ]},
        { id: 'middleware-group', label: '通用中间件', icon: NginxIcon, children: [
            {id: 'git', label: 'Git', icon: GitIcon},
            {id: 'nginx', label: 'Nginx', icon: NginxIcon},
            {id: 'minio', label: 'MinIO', icon: MinioIcon},
            {id: 'elasticsearch', label: 'Elasticsearch', icon: ElasticsearchIcon},
            {id: 'kibana', label: 'Kibana', icon: KibanaIcon},
            {id: 'redis-insight', label: 'Redis Insight', icon: RedisIcon}
        ]},
        { id: 'ai-assistant', label: 'AI 智能助手', icon: AIIcon, children: [] },
        { id: 'product', label: '产品介绍', icon: ProductIcon, children: [] },
        { id: 'settings', label: '工具箱设置', icon: SettingsIcon, children: [] },
        { id: 'about', label: '关于沐柠', icon: LemonIcon, children: [] }
      ]
    };
  },
  methods: {
    handleSelect(id) {
      if (id === this.activeTool) return;
      this.$emit('select-tool', id);
    }
  }
};
</script>

<style scoped>
.nav-menu {
  width: 260px;
  background: var(--bg-nav);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  user-select: none;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  -webkit-app-region: drag;
}

.nav-menu .nav-items,
.nav-menu .nav-footer {
  -webkit-app-region: no-drag;
}

/* ── Header ── */
.nav-header {
  padding: var(--space-5) var(--space-4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: var(--space-2);
  background: var(--gradient-sidebar-header);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.brand-icon {
  font-size: 1.6rem;
  color: var(--accent);
  filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.3));
}

.brand-text h2 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  letter-spacing: -0.2px;
  line-height: 1.2;
}

.brand-version {
  font-size: 0.7rem;
  color: var(--text-nav-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}

/* ── Items area ── */
.nav-items {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) var(--space-2);
}

/* ── Footer ── */
.nav-footer {
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.nav-footer-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.75rem;
  color: var(--text-nav-muted);
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}
</style>
