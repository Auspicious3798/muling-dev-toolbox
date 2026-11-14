<template>
  <div class="nav-menu">
    <div class="nav-header">
      <div class="nav-brand">
        <img src="/art/brand-128.png" class="brand-logo" alt="沐柠"/>
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
import PythonIcon from '/icons/Python.svg?url';
import RabbitmqIcon from '/icons/Rabbitmq.svg?url';
import RedisIcon from '/icons/Redis.svg?url';
import SentinelIcon from '/icons/sentinel.svg?url';
import DashboardIcon from '/icons/Dashboard.svg?url';
import NodejsIcon from '/icons/nodejs.svg?url';
import LemonIcon from '/icons/lemon.svg?url';
import SettingsIcon from '/icons/setting.svg?url';

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
        { id: 'frontend-group', label: '前端开发', icon: '/icons/cat-frontend.svg', children: [
            {id: 'nodejs', label: 'Node.js', icon: NodejsIcon},
            {id: 'nginx', label: 'Nginx', icon: NginxIcon}
        ]},
        { id: 'backend-group', label: '后端开发', icon: '/icons/cat-backend.svg', children: [
            {id: 'jdk', label: 'JDK', icon: JavaIcon},
            {id: 'maven', label: 'Maven', icon: MavenIcon},
            {id: 'gradle', label: 'Gradle', icon: GradleIcon},
            {id: 'go', label: 'Go', icon: GolangIcon},
            {id: 'python', label: 'Python', icon: PythonIcon},
            {id: 'uv', label: 'uv', icon: '/icons/uv.svg'},
            {id: 'miniconda', label: 'Miniconda', icon: MinicondaIcon},
            {id: 'jupyter', label: 'Jupyter Lab', icon: JupyterIcon}
        ]},
        { id: 'database-group', label: '数据库', icon: '/icons/cat-database.svg', children: [
            {id: 'mysql', label: 'MySQL', icon: MysqlIcon},
            {id: 'redis', label: 'Redis', icon: RedisIcon}
        ]},
        { id: 'middleware-group', label: '中间件', icon: '/icons/cat-middleware.svg', children: [
            {id: 'nacos', label: 'Nacos', icon: NacosIcon},
            {id: 'sentinel', label: 'Sentinel', icon: SentinelIcon},
            {id: 'rabbitmq', label: 'RabbitMQ', icon: RabbitmqIcon},
            {id: 'minio', label: 'MinIO', icon: MinioIcon},
            {id: 'elasticsearch', label: 'Elasticsearch', icon: ElasticsearchIcon},
            {id: 'kibana', label: 'Kibana', icon: KibanaIcon}
        ]},
        { id: 'toolchain-group', label: '编译工具', icon: '/icons/cat-toolchain.svg', children: [
            {id: 'mingw', label: 'MinGW', icon: CIcon}
        ]},
        { id: 'ai-assistant', label: 'AI 智能助手', icon: AIIcon, children: [] },
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
  background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0) 180px);
  backdrop-filter: blur(30px) saturate(160%);
  -webkit-backdrop-filter: blur(30px) saturate(160%);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  user-select: none;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: inset -1px 0 0 rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.06);
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

.brand-logo {
  width: 40px;
  height: 40px;
  object-fit: contain;
  background: transparent;
  border: none;
  filter: drop-shadow(0 4px 10px rgba(15, 118, 110, 0.28));
  transition: transform var(--transition-normal);
}

.brand:hover .brand-logo {
  transform: rotate(-4deg) scale(1.04);
}

.brand-text h2 {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-nav-hover);
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
