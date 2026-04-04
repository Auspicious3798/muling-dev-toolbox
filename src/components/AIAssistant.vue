<template>
  <div class="ai-assistant">
    <div class="coming-soon-card">
      <div class="icon">🤖</div>
      <h2>AI 智能助手</h2>
      <p class="subtitle">正在紧锣密鼓地开发中，敬请期待！</p>
      <div class="roadmap">
        <h3>未来将支持：</h3>
        <ul>
          <li>✨ 本地大模型一键部署（Ollama）</li>
          <li>💬 图形化对话界面</li>
          <li>📦 模型管理（下载/卸载/切换）</li>
          <li>⚡ 根据显卡显存智能推荐模型</li>
          <li>🛠️ 自定义安装目录与模型存储路径</li>
        </ul>
      </div>
      <div class="note">
        <p>注：AI 功能需要 NVIDIA 显卡（或 CPU 模式），我们正在努力优化兼容性。</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AIAssistant'
};
</script>

<style scoped>
.ai-assistant {
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

.coming-soon-card {
  max-width: 600px;
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
  font-size: 2rem;
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

.roadmap {
  text-align: left;
  background: #f8fafc;
  border-radius: 20px;
  padding: 20px;
  margin: 20px 0;
}

.roadmap h3 {
  font-size: 1.2rem;
  margin-bottom: 12px;
  color: #1e293b;
}

.roadmap ul {
  list-style: none;
  padding: 0;
}

.roadmap li {
  padding: 6px 0;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 8px;
}

.roadmap li::before {
  content: "✓";
  color: #2c7a4d;
  font-weight: bold;
}

.note {
  background: #fffbeb;
  border-left: 4px solid #f59e0b;
  border-radius: 16px;
  padding: 12px;
  font-size: 0.85rem;
  color: #b45309;
}
</style>