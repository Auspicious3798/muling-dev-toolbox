<template>
  <div class="coming-soon">
    <div class="card">
      <div class="icon">🚧</div>
      <h2>功能开发中</h2>
      <p class="subtitle">{{ toolLabel }} 模块正在加紧建设中，敬请期待！</p>
      <div class="details">
        <p>未来将支持：</p>
        <ul>
          <li>一键安装与配置</li>
          <li>多版本管理</li>
          <li>环境变量自动配置</li>
          <li>命令行工具集成</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ComingSoon',
  props: {
    tool: {
      type: String,
      required: true
    }
  },
  computed: {
    toolLabel() {
      const map = {
        gradle: 'Gradle',
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
    }
  }
};
</script>

<style scoped>
.coming-soon {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border-radius: 28px;
  padding: 24px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.05), 0 2px 4px rgba(0, 0, 0, 0.02);
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

.card {
  max-width: 500px;
  text-align: center;
  padding: 40px 20px;
  background: white;
  border-radius: 32px;
  box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
}

.icon {
  font-size: 4rem;
  margin-bottom: 16px;
}

h2 {
  font-size: 1.8rem;
  font-weight: 700;
  margin-bottom: 8px;
  background: linear-gradient(135deg, #1e293b, #2c3e50);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.subtitle {
  color: #64748b;
  margin-bottom: 24px;
}

.details {
  text-align: left;
  background: #f8fafc;
  border-radius: 20px;
  padding: 20px;
  margin-top: 20px;
}

.details p {
  font-weight: 600;
  margin-bottom: 8px;
}

.details ul {
  list-style: none;
  padding: 0;
}

.details li {
  padding: 4px 0;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 8px;
}

.details li::before {
  content: "✓";
  color: #2c7a4d;
  font-weight: bold;
}
</style>