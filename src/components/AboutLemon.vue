<template>
  <div class="about-lemon">
    <div class="content-card">
      <div class="hero">
        <div class="lemon-icon">
          <img :src="LemonIcon" alt="沐柠"/>
        </div>
        <h1>关于沐柠</h1>
        <div class="subtitle">Lemon · 数字世界的原创虚拟形象</div>
      </div>

      <div class="description">
        <p>
          沐柠（Lemon），诞生于数字世界，拥有专属社交账号，存在于虚拟，陪伴于日常。她是朋友，是陪伴，是依赖，更是一个完整的品牌。</p>

        <div class="future-block">
          <h3>未来延伸</h3>
          <div class="badge-group">
            <span class="badge">沐柠环境盒</span>
            <span class="badge">沐柠 Agent</span>
            <span class="badge">沐柠 AI</span>
            <span class="badge">沐柠框架</span>
          </div>
          <p>最终成长为真正的数字人，以虚拟或实体，伴你身旁。</p>
        </div>

        <p>她助力程序员，温暖每一个前行者，是一种精神，一种力量，一份长久的陪伴。</p>

        <div class="tagline">
          <span class="quote">✨</span> 沐柠相伴，万物可期 <span class="quote">✨</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import LemonIcon from '@/assets/icons/lemon.svg?url';

export default {
  name: 'AboutLemon',
  setup() {
    return {LemonIcon};
  }
};
</script>

<style scoped>
.about-lemon {
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

.content-card {
  max-width: 680px;
  width: 100%;
  margin: 0 auto;
  padding: 20px;
}

.hero {
  text-align: center;
  margin-bottom: 32px;
}

.lemon-icon {
  width: 96px;
  height: 96px;
  margin: 0 auto 16px;
}

.lemon-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.1));
  transition: transform 0.3s ease;
}

.lemon-icon img:hover {
  transform: scale(1.02);
}

h1 {
  font-size: 2.2rem;
  font-weight: 700;
  margin: 0 0 8px;
  background: linear-gradient(135deg, #1e293b, #2c3e50);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  letter-spacing: -0.3px;
}

.subtitle {
  font-size: 0.9rem;
  color: #64748b;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  font-weight: 500;
}

.description p {
  font-size: 1rem;
  line-height: 1.7;
  color: #334155;
  margin-bottom: 20px;
  text-align: justify;
}

.future-block {
  background: rgba(44, 122, 77, 0.05);
  border-radius: 20px;
  padding: 20px;
  margin: 24px 0;
  text-align: center;
}

.future-block h3 {
  font-size: 1.2rem;
  font-weight: 600;
  color: #2c7a4d;
  margin-bottom: 16px;
}

.badge-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-bottom: 20px;
}

.badge {
  background: white;
  border-radius: 40px;
  padding: 6px 16px;
  font-size: 0.85rem;
  font-weight: 500;
  color: #2c7a4d;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(44, 122, 77, 0.2);
  transition: all 0.2s;
}

.badge:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
  border-color: #2c7a4d;
}

.tagline {
  text-align: center;
  margin-top: 32px;
  font-size: 1.3rem;
  font-weight: 700;
  color: #2c7a4d;
  background: linear-gradient(135deg, #2c7a4d, #1f5e3a);
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.quote {
  font-size: 1.2rem;
  opacity: 0.7;
}
</style>