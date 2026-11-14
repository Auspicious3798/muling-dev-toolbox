<template>
  <div class="about-lemon">
    <section class="poster">
      <div class="poster-art">
        <img src="/art/scene-about-card.png" alt="小柠"/>
      </div>

      <div class="poster-body">
        <div class="brand-line">
          <span class="brand-dot"></span>
          全栈沐柠
        </div>

        <h1>小柠</h1>
        <p class="subtitle">全栈沐柠的吉祥物</p>

        <p class="lead">
          全栈沐柠是一个独立接单做开发落地的品牌，接的是“从想法到跑起来”的活：环境搭建、后端服务、前端界面、部署上线。
        </p>
        <p class="lead">
          小柠就是这个品牌的脸。她不是什么科技符号，就是一个会陪你一起折腾环境、一起收拾烂摊子的搭子。
        </p>

        <div class="links">
          <a href="mailto:taxuexunmei3798@126.com">taxuexunmei3798@126.com</a>
          <a href="https://www.muling-download.site" target="_blank">沐柠下载站</a>
          <a href="https://github.com/Auspicious3798/muling-dev-toolbox" target="_blank">GitHub 仓库</a>
          <button type="button" class="support-pill" @click="showDonate = true">支持小柠</button>
        </div>

        <div class="poster-foot">
          <span class="tagline">沐柠相伴，万物可期</span>
        </div>
      </div>
    </section>

    <p class="disclaimer">
      沐柠环境盒仅供学习、研究和个人使用，使用前请备份重要数据；因使用本工具导致的数据丢失或系统异常，开发者不承担直接或间接责任。工具内安装的第三方软件版权归各自作者所有，请遵守相应开源协议。
    </p>

    <div v-if="showDonate" class="donate-mask" @click.self="showDonate = false">
      <div class="donate-card">
        <div class="donate-head">
          <h2>支持沐柠</h2>
          <button type="button" class="donate-close" @click="showDonate = false">✕</button>
        </div>

        <p class="donate-text">
          沐柠环境盒本身跑在你自己的电脑上，但它要下载的那些工具包都放在我的云存储里，账单走的是我自己的账户。我算过，平均一天三毛钱左右——不多，但它确实每天都在花。
        </p>
        <p class="donate-text">
          如果你觉得它帮你省了时间，可以请小柠喝杯柠檬水。这笔钱会用来继续维护、继续加工具。
        </p>

        <div class="donate-qr">
          <img v-if="!qrFailed" :src="qrSrc" alt="赞赏码" @error="qrFailed = true"/>
          <div v-else class="donate-qr-empty">赞赏码准备中</div>
        </div>

        <p class="donate-note">
          <span class="thanks">我代小柠谢谢您</span> —— 就算没有发电，沐柠也会自己掏钱维护，维护到我挺不下去那天。
        </p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AboutLemon',
  data() {
    return {
      showDonate: false,
      qrFailed: false,
      qrSrc: '/art/donate-qr.png',
    };
  },
};
</script>

<style scoped>
.about-lemon {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.poster {
  display: flex;
  min-height: 420px;
  border-radius: 24px;
  overflow: hidden;
  background: var(--bg-card);
  background-image: var(--glass-sheen);
  border: 1px solid var(--border-light);
  box-shadow: var(--glass-edge), var(--glass-shadow);
}

.poster-art {
  flex: 0 0 42%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--art-bg);
  padding: 18px;
}

.poster-art img {
  width: 100%;
  height: 100%;
  max-height: 480px;
  object-fit: contain;
  animation: heroFloat 7s ease-in-out infinite;
}

@keyframes heroFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.poster-body {
  flex: 1 1 auto;
  min-width: 0;
  padding: 34px 38px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.brand-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--text-muted);
}

.brand-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
}

h1 {
  margin: 0;
  font-size: 2.4rem;
  font-weight: 800;
  letter-spacing: 2px;
  line-height: 1.1;
  color: var(--text-primary);
}

.subtitle {
  margin: -6px 0 6px;
  font-size: 0.88rem;
  letter-spacing: 1px;
  color: var(--primary);
}

.lead {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.9;
  color: var(--text-secondary);
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
}

.links a {
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 0.76rem;
  color: var(--text-secondary);
  text-decoration: none;
  background: color-mix(in srgb, var(--text-primary) 5%, transparent);
  border: 1px solid var(--border-light);
  transition: all var(--transition-fast);
}

.links a:hover {
  color: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  transform: translateY(-1px);
}

.support-pill {
  padding: 7px 14px;
  border-radius: 999px;
  font-family: inherit;
  font-size: 0.76rem;
  cursor: pointer;
  color: #8a6d1f;
  background: color-mix(in srgb, #f5c518 22%, transparent);
  border: 1px solid color-mix(in srgb, #f5c518 55%, transparent);
  transition: all var(--transition-fast);
}

.support-pill:hover {
  color: #6b5312;
  background: color-mix(in srgb, #f5c518 34%, transparent);
  transform: translateY(-1px);
}

.donate-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 12, 20, 0.55);
  backdrop-filter: blur(6px);
}

.donate-card {
  width: min(420px, 100%);
  max-height: 100%;
  overflow: auto;
  padding: 24px;
  border-radius: 20px;
  background: var(--bg-card-strong, var(--bg-card));
  border: 1px solid var(--border-light);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
}

.donate-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.donate-head h2 {
  margin: 0;
  font-size: 1.15rem;
  color: var(--text-primary);
}

.donate-close {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
  font-size: 0.8rem;
}

.donate-text {
  margin: 0 0 10px;
  font-size: 0.82rem;
  line-height: 1.85;
  color: var(--text-secondary);
}

.donate-qr {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 16px 0 12px;
}

.donate-qr img {
  width: 240px;
  height: 240px;
  object-fit: contain;
  border-radius: 14px;
  background: #ffffff;
  padding: 8px;
}

.donate-qr-empty {
  width: 240px;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  font-size: 0.78rem;
  color: var(--text-muted);
  border: 1px dashed var(--border-light);
}

.donate-note .thanks {
  font-weight: 700;
  color: var(--primary);
}

.donate-note {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.8;
  text-align: center;
  color: var(--text-muted);
}

.poster-foot {
  margin-top: auto;
  padding-top: 10px;
}

.tagline {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
}

.disclaimer {
  margin: 0;
  padding: 0 6px;
  font-size: 0.72rem;
  line-height: 1.7;
  color: var(--text-muted);
}

@media (max-width: 900px) {
  .poster {
    flex-direction: column;
    min-height: 0;
  }

  .poster-art {
    flex: 0 0 auto;
    height: 240px;
    padding: 12px;
  }

  .poster-body {
    padding: 22px;
  }

  h1 {
    font-size: 1.9rem;
  }
}
</style>
