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
          icon: '📊',
          children: []
        },
        {
          id: 'java-group',
          label: 'Java 开发环境',
          icon: '☕',
          children: [
            {id: 'jdk', label: 'JDK', icon: '☕'},
            {id: 'maven', label: 'Maven', icon: '📦'},
            {id: 'gradle', label: 'Gradle', icon: '🔄'},
            {id: 'mysql', label: 'MySQL', icon: '🐬'},
            {id: 'redis', label: 'Redis', icon: '🔴'},
            {id: 'nacos', label: 'Nacos', icon: '⚙️'},
            {id: 'sentinel', label: 'Sentinel', icon: '🛡️'},
            {id: 'rabbitmq', label: 'RabbitMQ', icon: '🐇'}
          ]
        },
        {
          id: 'python-group',
          label: 'Python & AI 环境',
          icon: '🐍',
          children: [
            {id: 'python', label: 'Python', icon: '🐍'},
            {id: 'miniconda', label: 'Miniconda', icon: '📦'},
            {id: 'jupyter', label: 'Jupyter Lab', icon: '📓'},
            {id: 'ollama', label: 'Ollama', icon: '🦙'}
          ]
        },
        {
          id: 'go-group',
          label: 'Go 开发环境',
          icon: '🐹',
          children: [
            {id: 'go', label: 'Go', icon: '🐹'}
          ]
        },
        {
          id: 'cpp-group',
          label: 'C/C++ 环境',
          icon: '⚙️',
          children: [
            {id: 'mingw', label: 'MinGW', icon: '🔧'}
          ]
        },
        {
          id: 'middleware-group',
          label: '通用中间件',
          icon: '🔌',
          children: [
            {id: 'git', label: 'Git', icon: '📜'},
            {id: 'nginx', label: 'Nginx', icon: '🌐'},
            {id: 'minio', label: 'MinIO', icon: '💾'},
            {id: 'elasticsearch', label: 'Elasticsearch', icon: '🔍'},
            {id: 'kibana', label: 'Kibana', icon: '📊'},
            {id: 'redis-insight', label: 'Redis Insight', icon: '🔴'}
          ]
        },
        {
          id: 'ai-assistant',
          label: 'AI 智能助手',
          icon: '🤖',
          children: []
        },
        {
          id: 'settings',
          label: '工具箱设置',
          icon: '⚙️',
          children: []
        },
        {
          id: 'about',
          label: '关于沐柠',
          icon: 'ℹ️',
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
  background: #1e2a3a;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow-y: auto;
  user-select: none;
}

.nav-header {
  padding: 20px 16px;
  border-bottom: 1px solid #2d3e4e;
  margin-bottom: 12px;
}

.nav-header h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #f5b042;
  margin: 0;
}

.nav-items {
  flex: 1;
  overflow-y: auto;
}
</style>