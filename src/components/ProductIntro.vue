<template>
  <div class="product-intro">
    <div class="container">
      <header class="hero">
        <div class="hero-text">
          <div class="overline"><span class="dot"></span>全栈沐柠</div>
          <h1>产品介绍</h1>
          <p class="lede">一个把开发环境装好的工具——不用记命令，不用配环境变量。</p>
        </div>
        <div class="art-plate"><img class="hero-art" src="/art/scene-splash-card.png" alt="小柠"/></div>
      </header>

      <div class="tiles">
        <button class="tile" data-tone="teal" @click="open('what')">
          <span class="tile-label">01</span>
          <h2>沐柠环境盒是什么</h2>
          <p>JDK、Python、MySQL、Redis 这些装起来最烦的部分，交给它。一键下载、安装、配置，全部落在沙箱里。</p>
          <span class="tile-more">查看详情 →</span>
        </button>

        <button class="tile" data-tone="lime" @click="open('how')">
          <span class="tile-label">02</span>
          <h2>工作原理</h2>
          <p>配置 → 下载 → 解压 → 配置环境 → 验证，五步走完。全程不需要管理员权限，也不碰系统环境变量。</p>
          <div class="mini-steps">
            <span>配置</span><i></i><span>下载</span><i></i><span>解压</span><i></i><span>配置</span><i></i><span>验证</span>
          </div>
          <span class="tile-more">查看详情 →</span>
        </button>

        <button class="tile" data-tone="violet" @click="open('stack')">
          <span class="tile-label">03</span>
          <h2>技术架构</h2>
          <p>Electron 桌面容器 + Vue 3 界面，主进程用 Node.js 管下载与解压，渲染进程通过 IPC 调用。</p>
          <div class="chips">
            <span>Vue 3</span><span>Electron</span><span>Node.js</span><span>IPC</span>
          </div>
          <span class="tile-more">查看详情 →</span>
        </button>

        <button class="tile" data-tone="amber" @click="open('safe')">
          <span class="tile-label">04</span>
          <h2>安全机制</h2>
          <p>所有工具装在用户目录，不改 PATH、不注册服务，删掉目录就等于卸载干净。</p>
          <div class="chips">
            <span>沙箱隔离</span><span>免管理员</span><span>端口检测</span><span>断网续传</span>
          </div>
          <span class="tile-more">查看详情 →</span>
        </button>
      </div>

      <div class="foot">
        <span class="tagline">沐柠相伴，万物可期</span>
      </div>
    </div>

    <transition name="fade">
      <div v-if="active" class="modal-mask" @click.self="close()">
        <div class="modal-card" role="dialog" aria-modal="true">
          <div class="modal-head">
            <div>
              <div class="modal-overline">{{ view.overline }}</div>
              <h3>{{ view.title }}</h3>
            </div>
            <button class="modal-close" @click="close()" aria-label="关闭">✕</button>
          </div>

          <div class="modal-body">
            <p class="modal-lead">{{ view.lead }}</p>

            <ol v-if="active === 'how'" class="timeline">
              <li v-for="(step, idx) in howSteps" :key="idx">
                <div class="step-body">
                  <h4>{{ step.title }}</h4>
                  <p>{{ step.text }}</p>
                </div>
              </li>
            </ol>

            <div v-else-if="active === 'stack'" class="tech-grid">
              <div v-for="tech in stackItems" :key="tech.name" class="tech-item">
                <span class="tech-name">{{ tech.name }}</span>
                <span class="tech-desc">{{ tech.desc }}</span>
              </div>
            </div>

            <ul v-else-if="active === 'safe'" class="check-list">
              <li v-for="(item, idx) in safeItems" :key="idx">{{ item }}</li>
            </ul>

            <ul v-else class="point-list">
              <li v-for="(item, idx) in whatPoints" :key="idx">{{ item }}</li>
            </ul>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
const VIEWS = {
  what: {
    overline: '01 · 定位',
    title: '沐柠环境盒是什么',
    lead: '沐柠环境盒是「全栈沐柠」出品的开发环境管理工具，把常用开发工具的下载、安装、配置合成一步。',
  },
  how: {
    overline: '02 · 流程',
    title: '工作原理',
    lead: '从选中版本到命令行可用，只有五个步骤，全部在沙箱内完成。',
  },
  stack: {
    overline: '03 · 实现',
    title: '技术架构',
    lead: '一个 Electron 桌面应用，界面与主进程职责分离，重活都在主进程里做。',
  },
  safe: {
    overline: '04 · 边界',
    title: '安全机制',
    lead: '设计前提是「不动系统」：装在哪、改了什么、怎么卸载，都写得清楚。',
  },
};

export default {
  name: 'ProductIntro',
  data() {
    return {
      active: null,
      howSteps: [
        { title: '配置管理', text: '内置 downloads.json，记录每个工具的下载地址、版本与安装路径，统一走阿里云 OSS 直连。' },
        { title: '资源下载', text: '按直链下载，实时显示速度与剩余时间；断网自动续传重试，速度过低会提示检查网络。' },
        { title: '自动安装', text: '解压到沙箱目录（默认 %LOCALAPPDATA%\\Muling\\env），不需要管理员权限。' },
        { title: '环境配置', text: '只写沙箱内的配置（端口、密码、启动脚本）；需要命令行可用时打开「沐柠环境终端」或单独开启系统注入。' },
        { title: '验证与使用', text: '内置体检与验证，随时确认环境完好；服务启停、端口与密码都在「站点管理」里改。' },
      ],
      stackItems: [
        { name: 'Vue 3', desc: '前端界面，单文件组件 + Composition 风格' },
        { name: 'Electron', desc: '桌面容器，透明窗口与系统托盘' },
        { name: 'Node.js', desc: '主进程：下载、解压、注册服务、写配置' },
        { name: 'IPC', desc: '渲染进程与主进程之间的事件与调用' },
      ],
      safeItems: [
        '沙箱隔离：所有工具装在用户目录，不改系统 PATH、不注册 Windows 服务，删目录即卸载',
        '免管理员：不需要右键「以管理员身份运行」，双击即可使用',
        '端口检测：启动服务前自动检查端口占用，被占则自动顺延',
        '断网重试：下载中断自动续传，不留下损坏文件',
        '速度监控：低于 50 KB/s 时提示检查网络',
        '数据提醒：破坏性操作前提示备份',
      ],
      whatPoints: [
        '支持 JDK、Python、Node.js、MySQL、Redis、Maven、Gradle、Nginx、uv 九种环境',
        '同一工具多版本共存，点一下卡片就能切换默认版本',
        '已经装好的环境可以直接「接管」，不复制、不搬动，只登记进沐柠',
        '换电脑时导出配置包，另一台机器导入就还原整套环境',
        '下载与安装实时显示速度、剩余时间、解压进度与失败原因',
      ],
    };
  },
  computed: {
    view() {
      return this.active ? VIEWS[this.active] : VIEWS.what;
    },
  },
  mounted() {
    this.onKeydown = (event) => {
      if (event.key === 'Escape') this.close();
    };
    window.addEventListener('keydown', this.onKeydown);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeydown);
  },
  methods: {
    open(id) {
      this.active = id;
    },
    close() {
      this.active = null;
    },
  },
};
</script>

<style scoped>
.product-intro {
  background: var(--gradient-bg);
  border-radius: 28px;
  padding: 20px;
  box-shadow: var(--shadow-md);
  height: auto;
  overflow: visible;
}

.container {
  max-width: 940px;
  margin: 0 auto;
  padding: 8px 14px 4px;
}

.hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 26px;
  margin-bottom: 26px;
  flex-wrap: wrap;
}

.hero-text {
  flex: 1 1 280px;
  min-width: 0;
}

.art-plate {
  flex: 0 0 300px;
  width: min(34%, 300px);
  padding: 10px;
  border-radius: 22px;
  background: var(--art-bg);
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 14px 26px rgba(0, 0, 0, 0.12);
}

.hero-art {
  width: 100%;
  height: auto;
  border-radius: 18px;
  filter: drop-shadow(0 14px 26px rgba(0, 0, 0, 0.13));
}

.overline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--primary);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);
}

h1 {
  margin: 0 0 10px;
  font-size: 1.95rem;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--text-primary);
}

.lede {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.75;
  color: var(--text-secondary);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 20px 20px 18px;
  text-align: left;
  cursor: pointer;
  border-radius: 18px;
  border: 1px solid var(--border-light);
  background: var(--bg-card);
  background-image: var(--glass-sheen);
  box-shadow: var(--glass-edge), var(--glass-shadow);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast);
  overflow: hidden;
}

.tile::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--tile-accent, var(--primary));
  opacity: 0.85;
}

.tile[data-tone='teal'] { --tile-accent: #14b8a6; }
.tile[data-tone='lime'] { --tile-accent: #84cc16; }
.tile[data-tone='violet'] { --tile-accent: #8b5cf6; }
.tile[data-tone='amber'] { --tile-accent: #f59e0b; }

.tile:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--tile-accent) 45%, transparent);
  box-shadow: 0 16px 32px rgba(2, 44, 40, 0.14);
}

.tile:active {
  transform: translateY(-1px) scale(0.995);
}

.tile-label {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 2px;
  color: var(--tile-accent);
}

.tile h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-primary);
}

.tile p {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.8;
  color: var(--text-secondary);
}

.tile-more {
  margin-top: auto;
  padding-top: 6px;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--tile-accent);
}

.mini-steps {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 4px;
}

.mini-steps span {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 0.7rem;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--text-primary) 5%, transparent);
}

.mini-steps i {
  width: 10px;
  height: 1px;
  background: var(--border-light);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 2px 0 4px;
}

.chips span {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 0.7rem;
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
}

.foot {
  padding: 16px 0 8px;
}

.tagline {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 28%, transparent);
}

/* ---------- modal ---------- */
.modal-mask {
  position: fixed;
  inset: 0;
  z-index: 960;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(2, 12, 18, 0.48);
  backdrop-filter: blur(6px);
}

.modal-card {
  width: min(640px, 100%);
  max-height: min(78vh, 720px);
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  background: var(--bg-card);
  background-image: var(--glass-sheen);
  border: 1px solid var(--border-light);
  box-shadow: 0 28px 60px rgba(2, 12, 18, 0.36);
  overflow: hidden;
}

.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid var(--border-light);
}

.modal-overline {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--primary);
}

.modal-head h3 {
  margin: 6px 0 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--text-primary);
}

.modal-close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.modal-close:hover {
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 45%, transparent);
}

.modal-body {
  padding: 18px 22px 22px;
  overflow: auto;
}

.modal-lead {
  margin: 0 0 16px;
  font-size: 0.85rem;
  line-height: 1.85;
  color: var(--text-secondary);
}

.timeline {
  list-style: none;
  counter-reset: step;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.timeline li {
  counter-increment: step;
  position: relative;
  padding: 0 0 14px 40px;
}

.timeline li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--primary) 34%, transparent);
}

.timeline li::after {
  content: '';
  position: absolute;
  left: 11px;
  top: 24px;
  bottom: 2px;
  width: 1px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--primary) 34%, transparent), transparent);
}

.timeline li:last-child {
  padding-bottom: 0;
}

.timeline li:last-child::after {
  display: none;
}

.step-body h4 {
  margin: 1px 0 4px;
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--text-primary);
}

.step-body p {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.8;
  color: var(--text-secondary);
}

.tech-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}

.tech-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 13px 15px;
  border-radius: 13px;
  background: color-mix(in srgb, var(--text-primary) 4%, transparent);
  border: 1px solid var(--border-light);
}

.tech-name {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--text-primary);
}

.tech-desc {
  font-size: 0.74rem;
  line-height: 1.6;
  color: var(--text-muted);
}

.check-list,
.point-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.check-list li,
.point-list li {
  position: relative;
  padding-left: 20px;
  font-size: 0.81rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.check-list li::before,
.point-list li::before {
  position: absolute;
  left: 0;
  top: 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--primary);
}

.check-list li::before {
  content: '✓';
}

.point-list li::before {
  content: '·';
  font-size: 1rem;
  line-height: 1.35;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 180ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 900px) {
  .tiles {
    grid-template-columns: minmax(0, 1fr);
  }

  .hero {
    flex-direction: column-reverse;
    align-items: flex-start;
  }

  .art-plate {
    flex: 0 0 auto;
    width: min(100%, 260px);
  }

  h1 {
    font-size: 1.7rem;
  }
}
</style>
