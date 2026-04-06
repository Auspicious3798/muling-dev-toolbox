<template>
  <div class="about-lemon">
    <div class="content-card">
      <div class="hero">
        <div class="lemon-icon">
          <img :src="lemonIcon" alt="沐柠" style="width: 100%; height: 100%;"/>
        </div>
        <h1>关于沐柠</h1>
        <div class="subtitle">Lemon · 数字世界的原创虚拟形象</div>
      </div>

      <div class="description">
        <p>
          沐柠（Lemon），诞生于数字世界，拥有专属社交账号，存在于虚拟，陪伴于日常。她是朋友，是陪伴，是依赖，更是一个完整的品牌。
        </p>

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

        <div class="contact">
          <p>联系沐柠：<a href="mailto:taxuexunmei3798@126.com">taxuexunmei3798@126.com</a></p>
          <p>GitHub 仓库：<a href="https://github.com/Auspicious3798/muling-dev-toolbox" target="_blank">https://github.com/Auspicious3798/muling-dev-toolbox</a></p>
        </div>

        <div class="disclaimer">
          <p><strong>免责声明</strong><br>
            沐柠环境盒（以下简称"本工具"）由沐柠团队开发并维护，在开发者环境中已经过充分测试。但由于不同用户的操作系统、网络环境、权限配置等因素存在差异，本工具在实际使用中可能会出现各种兼容性问题或未知 Bug。
          </p>
          <p style="margin-top: 12px;">
            <strong>请您知悉并同意：</strong><br>
            1. 本工具仅供学习、研究和个人使用，请谨慎操作；<br>
            2. 使用本工具前，请确保您已备份重要数据；<br>
            3. 如因使用本工具导致的数据丢失、系统异常或其他损失，沐柠团队不承担直接或间接责任；<br>
            4. 本工具提供的第三方软件（包括但不限于 JDK、Python、MySQL、Redis 等）均为各自版权方所有，用户应遵守相应开源协议或许可证条款；<br>
            5. 本工具不包含任何恶意代码，但无法完全保证第三方软件的完整性及安全性；<br>
            6. 用户应自行确保所下载及安装的软件来源合法、安全可用，并自行承担使用风险。
          </p>
          <p style="margin-top: 12px;">
            <strong>如果您在使用过程中遇到问题或发现 Bug：</strong><br>
            请及时通过邮箱 <a href="mailto:taxuexunmei3798@126.com">taxuexunmei3798@126.com</a> 联系沐柠，我们将尽快排查并修复。
          </p>
          <p style="margin-top: 12px;">
            使用本工具即表示您已阅读并同意本声明的全部内容。
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import lemonIcon from '../../public/icons/lemon.svg?url';
export default {
  name: 'AboutLemon',
  data() {
    return {
      lemonIcon,
    };
  },
};
</script>

<style scoped>
.about-lemon {
  background: var(--gradient-bg);
  border-radius: 28px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  height: 100%;
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
  background: linear-gradient(135deg, var(--text-primary), var(--text-secondary));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  letter-spacing: -0.3px;
}

.subtitle {
  font-size: 0.9rem;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  font-weight: 500;
}

.description p {
  font-size: 1rem;
  line-height: 1.7;
  color: var(--text-primary);
  margin-bottom: 20px;
  text-align: justify;
}

.future-block {
  background: var(--primary-light);
  border-radius: 20px;
  padding: 20px;
  margin: 24px 0;
  text-align: center;
}

.future-block h3 {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--primary);
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
  background: var(--bg-card);
  border-radius: 40px;
  padding: 6px 16px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--primary);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-light);
  transition: all 0.2s;
}

.badge:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--primary);
}

.tagline {
  text-align: center;
  margin-top: 32px;
  font-size: 1.3rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary), var(--primary-hover));
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

.contact {
  text-align: center;
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
  font-size: 0.9rem;
}

.contact a {
  color: var(--primary);
  text-decoration: none;
}

.contact a:hover {
  text-decoration: underline;
}

.disclaimer {
  margin-top: 32px;
  padding: 16px;
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border-radius: 16px;
  border-left: 3px solid var(--warning-text);
  text-align: left;
  line-height: 1.5;
}

.disclaimer p {
  margin: 0;
}
</style>