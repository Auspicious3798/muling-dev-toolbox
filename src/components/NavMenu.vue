<template>
  <div class="nav-menu">
    <div class="nav-header">
      <h2>沐柠工具箱</h2>
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
  </div>
</template>

<script>
import NavMenuItem from './NavMenuItem.vue';
import AIIcon from '@/assets/icons/AI.svg?url';
import CIcon from '@/assets/icons/c.svg?url';
import ElasticsearchIcon from '@/assets/icons/elasticsearch.svg?url';
import GitIcon from '@/assets/icons/git.svg?url';
import GolangIcon from '@/assets/icons/Golang.svg?url';
import GradleIcon from '@/assets/icons/gradle.svg?url';
import JavaIcon from '@/assets/icons/java.svg?url';
import JupyterIcon from '@/assets/icons/Jupyter.svg?url';
import KibanaIcon from '@/assets/icons/kibana.svg?url';
import MavenIcon from '@/assets/icons/maven.svg?url';
import MinicondaIcon from '@/assets/icons/Miniconda.svg?url';
import MinioIcon from '@/assets/icons/minio.svg?url';
import MysqlIcon from '@/assets/icons/mysql.svg?url';
import NacosIcon from '@/assets/icons/nacos.svg?url';
import NginxIcon from '@/assets/icons/nginx.svg?url';
import OllamaIcon from '@/assets/icons/Ollama.svg?url';
import PythonIcon from '@/assets/icons/Python.svg?url';
import RabbitmqIcon from '@/assets/icons/Rabbitmq.svg?url';
import RedisIcon from '@/assets/icons/Redis.svg?url';
import SentinelIcon from '@/assets/icons/sentinel.svg?url';
import DashboardIcon from '@/assets/icons/Dashboard.svg?url';
import LemonIcon from '@/assets/icons/lemon.svg?url';
import SettingsIcon from '@/assets/icons/setting.svg?url';

export default {
  name: 'NavMenu',
  components: {NavMenuItem},
  props: {
    activeTool: {
      type: String,
      default: 'jdk'
    }
  },
  data() {
    return {
      menuItems: [
        {
          id: 'dashboard',
          label: '首页 / 仪表盘',
          icon: DashboardIcon,
          children: []
        },
        {
          id: 'java-group',
          label: 'Java 开发环境',
          icon: JavaIcon,
          children: [
            {id: 'jdk', label: 'JDK', icon: JavaIcon},
            {id: 'maven', label: 'Maven', icon: MavenIcon},
            {id: 'gradle', label: 'Gradle', icon: GradleIcon},
            {id: 'mysql', label: 'MySQL', icon: MysqlIcon},
            {id: 'redis', label: 'Redis', icon: RedisIcon},
            {id: 'nacos', label: 'Nacos', icon: NacosIcon},
            {id: 'sentinel', label: 'Sentinel', icon: SentinelIcon},
            {id: 'rabbitmq', label: 'RabbitMQ', icon: RabbitmqIcon}
          ]
        },
        {
          id: 'python-group',
          label: 'Python & AI 环境',
          icon: PythonIcon,
          children: [
            {id: 'python', label: 'Python', icon: PythonIcon},
            {id: 'miniconda', label: 'Miniconda', icon: MinicondaIcon},
            {id: 'jupyter', label: 'Jupyter Lab', icon: JupyterIcon},
            {id: 'ollama', label: 'Ollama', icon: OllamaIcon}
          ]
        },
        {
          id: 'go-group',
          label: 'Go 开发环境',
          icon: GolangIcon,
          children: [
            {id: 'go', label: 'Go', icon: GolangIcon}
          ]
        },
        {
          id: 'cpp-group',
          label: 'C/C++ 环境',
          icon: CIcon,
          children: [
            {id: 'mingw', label: 'MinGW', icon: CIcon}
          ]
        },
        {
          id: 'middleware-group',
          label: '通用中间件',
          icon: NginxIcon,
          children: [
            {id: 'git', label: 'Git', icon: GitIcon},
            {id: 'nginx', label: 'Nginx', icon: NginxIcon},
            {id: 'minio', label: 'MinIO', icon: MinioIcon},
            {id: 'elasticsearch', label: 'Elasticsearch', icon: ElasticsearchIcon},
            {id: 'kibana', label: 'Kibana', icon: KibanaIcon},
            {id: 'redis-insight', label: 'Redis Insight', icon: RedisIcon}
          ]
        },
        {
          id: 'ai-assistant',
          label: 'AI 智能助手',
          icon: AIIcon,
          children: []
        },
        {
          id: 'settings',
          label: '工具箱设置',
          icon: SettingsIcon,
          children: []
        },
        {
          id: 'about',
          label: '关于沐柠',
          icon: LemonIcon,
          children: []
        }
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
  color: var(--text-nav);
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow-y: auto;
  user-select: none;
}

.nav-header {
  padding: 20px 16px;
  border-bottom: 1px solid var(--border-light);
  margin-bottom: 12px;
}

.nav-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--accent);
  margin: 0;
}

.nav-items {
  flex: 1;
  overflow-y: auto;
}
</style>