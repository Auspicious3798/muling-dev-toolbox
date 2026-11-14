<template>
  <div class="ai-assistant">
    <div class="coming-soon-card">
      <div class="lemon-portrait">
        <img src="/art/xiaoning-portrait-disc.png" alt="小柠"/>
        <span class="lemon-badge">小柠</span>
      </div>
      <div class="speech">
        <p>嗨，我是小柠～ 现在还在偷偷学本领，等我学会了就来帮你装模型！</p>
      </div>
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
  background: var(--gradient-bg);
  border-radius: 28px;
  padding: 24px;
  box-shadow: var(--shadow-md);
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
  background: var(--bg-card);
  border-radius: 32px;
  box-shadow: var(--shadow-lg);
}

.icon {
  font-size: 4rem;
  margin-bottom: 16px;
}

.lemon-portrait {
  position: relative;
  width: 118px;
  height: 118px;
  margin: 0 auto 16px;
}

.lemon-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
  border: 2px solid var(--glass-stroke);
  box-shadow: var(--glass-shadow), 0 0 26px rgba(245, 158, 11, 0.24);
}

.lemon-badge {
  position: absolute;
  right: -4px;
  bottom: 6px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #0b1120;
  background: linear-gradient(135deg, #fde68a, #fbbf24);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.36);
}

.speech {
  position: relative;
  max-width: 420px;
  margin: 0 auto 22px;
  padding: 12px 16px;
  border-radius: 16px;
  background-color: var(--glass-tint-strong);
  border: 1px solid var(--glass-stroke);
  box-shadow: var(--glass-shadow);
}

.speech::before {
  content: '';
  position: absolute;
  top: -7px;
  left: 50%;
  width: 14px;
  height: 14px;
  transform: translateX(-50%) rotate(45deg);
  background-color: var(--glass-tint-strong);
  border-left: 1px solid var(--glass-stroke);
  border-top: 1px solid var(--glass-stroke);
}

.speech p {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

h2 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 8px;
  background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}

.subtitle {
  color: var(--text-secondary);
  margin-bottom: 24px;
}

.roadmap {
  text-align: left;
  background: var(--bg-secondary);
  border-radius: 20px;
  padding: 20px;
  margin: 20px 0;
}

.roadmap h3 {
  font-size: 1.2rem;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.roadmap ul {
  list-style: none;
  padding: 0;
}

.roadmap li {
  padding: 6px 0;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.roadmap li::before {
  content: "✓";
  color: var(--primary);
  font-weight: bold;
}

.note {
  background: var(--warning-bg);
  border-left: 4px solid #f59e0b;
  border-radius: 16px;
  padding: 12px;
  font-size: 0.85rem;
  color: var(--warning-text);
}
</style>