<template>
  <div class="coming-soon">
    <div class="card">
      <div class="icon-wrap">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.4">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
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
  props: { tool: { type: String, required: true } },
  computed: {
    toolLabel() {
      const map = { gradle: 'Gradle', nacos: 'Nacos', sentinel: 'Sentinel', rabbitmq: 'RabbitMQ', miniconda: 'Miniconda', jupyter: 'Jupyter Lab', ollama: 'Ollama', go: 'Go', mingw: 'MinGW', git: 'Git', nginx: 'Nginx', minio: 'MinIO', elasticsearch: 'Elasticsearch', kibana: 'Kibana', 'redis-insight': 'Redis Insight' };
      return map[this.tool] || this.tool.toUpperCase();
    }
  }
};
</script>

<style scoped>
.coming-soon {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-y: auto;
}

.card {
  max-width: 460px;
  text-align: center;
  padding: var(--space-10) var(--space-8);
  background: var(--bg-card);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  border: 1px solid var(--border-light);
}

.icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px; height: 88px;
  margin: 0 auto var(--space-5);
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--primary);
  border: 2px dashed var(--border-light);
}

h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: var(--space-2);
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.subtitle {
  color: var(--text-secondary);
  margin-bottom: var(--space-6);
  font-size: 0.95rem;
}

.details {
  text-align: left;
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
}

.details p {
  font-weight: 600;
  margin-bottom: var(--space-2);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.details ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.details li {
  padding: 5px 0;
  color: var(--text-secondary);
  font-size: 0.88rem;
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.details li::before {
  content: "";
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--primary);
  flex-shrink: 0;
}
</style>
