<template>
  <div class="product-intro">
    <div class="content-card">
      <div class="hero">
        <h1>产品介绍</h1>
        <div class="subtitle">Product Introduction</div>
      </div>

      <div class="description">
        <section class="intro-section">
          <h2>🎯 沐柠环境盒是什么？</h2>
          <p>
            沐柠环境盒是一款专为开发者设计的开发环境管理工具，提供 JDK、Python、MySQL、Redis、Maven、Nginx 等常用开发工具的<strong>一键下载、安装、配置</strong>功能。无论你是编程新手还是资深开发者，都能通过本工具快速搭建开发环境，节省大量配置时间。
          </p>
        </section>

        <section class="intro-section">
          <h2>⚙️ 工作原理</h2>
          
          <div class="workflow">
            <div class="workflow-step">
              <div class="step-icon">1️⃣</div>
              <div class="step-content">
                <h3>配置管理</h3>
                <p>工具内置配置文件（downloads.json），包含所有可用工具的下载源、版本信息、安装路径等。支持通过设置页面切换代理节点，加速 GitHub 资源下载。</p>
              </div>
            </div>

            <div class="workflow-step">
              <div class="step-icon">2️⃣</div>
              <div class="step-content">
                <h3>资源下载</h3>
                <p>用户选择工具版本后，工具根据当前代理配置动态拼接下载 URL，从 GitHub Releases 下载对应的软件包。支持实时速度监控，下载过慢时会提醒更换代理节点。</p>
              </div>
            </div>

            <div class="workflow-step">
              <div class="step-icon">3️⃣</div>
              <div class="step-content">
                <h3>自动安装</h3>
                <p>下载完成后，工具自动解压安装包到指定目录（默认：C:\Program Files\muling\muling-env-box），并根据工具类型执行相应的配置脚本。</p>
              </div>
            </div>

            <div class="workflow-step">
              <div class="step-icon">4️⃣</div>
              <div class="step-content">
                <h3>环境配置</h3>
                <p>安装完成后，工具自动配置环境变量（PATH、JAVA_HOME 等）、初始化数据库、创建服务配置文件，确保工具可以立即使用。</p>
              </div>
            </div>

            <div class="workflow-step">
              <div class="step-icon">5️⃣</div>
              <div class="step-content">
                <h3>验证与使用</h3>
                <p>工具提供验证功能，检查安装是否成功。用户可通过"站点管理"页面管理服务状态（启动/停止）、修改端口、密码等配置。</p>
              </div>
            </div>
          </div>
        </section>

        <section class="intro-section">
          <h2>🏗️ 技术架构</h2>
          <div class="tech-grid">
            <div class="tech-item">
              <div class="tech-name">Vue 3</div>
              <div class="tech-desc">前端界面框架</div>
            </div>
            <div class="tech-item">
              <div class="tech-name">Electron</div>
              <div class="tech-desc">桌面应用框架</div>
            </div>
            <div class="tech-item">
              <div class="tech-name">Node.js</div>
              <div class="tech-desc">后端逻辑处理</div>
            </div>
            <div class="tech-item">
              <div class="tech-name">IPC 通信</div>
              <div class="tech-desc">主进程与渲染进程交互</div>
            </div>
          </div>
        </section>

        <section class="intro-section">
          <h2>🔒 安全机制</h2>
          <ul class="feature-list">
            <li><strong>管理员权限检测：</strong>启动时自动检测，确保安装过程权限充足</li>
            <li><strong>下载速度监控：</strong>实时监测下载速度，低于 50 KB/s 时提醒更换代理</li>
            <li><strong>代理节点测速：</strong>自动测试各代理节点速度，选择最优节点</li>
            <li><strong>数据备份提醒：</strong>操作前提示用户备份重要数据</li>
            <li><strong>端口冲突检测：</strong>启动服务前自动验证端口是否可用</li>
          </ul>
        </section>

        <section class="intro-section">
          <h2>💡 核心优势</h2>
          <div class="advantage-grid">
            <div class="advantage-item">
              <div class="advantage-icon">🚀</div>
              <h3>快速部署</h3>
              <p>一键安装，无需手动配置环境变量</p>
            </div>
            <div class="advantage-item">
              <div class="advantage-icon">🔄</div>
              <h3>版本管理</h3>
              <p>支持多版本共存，随时切换</p>
            </div>
            <div class="advantage-item">
              <div class="advantage-icon">🎨</div>
              <h3>友好界面</h3>
              <p>现代化的 UI 设计，支持深色/浅色主题</p>
            </div>
            <div class="advantage-item">
              <div class="advantage-icon">🌐</div>
              <h3>加速下载</h3>
              <p>内置多个代理节点，智能测速选择</p>
            </div>
          </div>
        </section>

        <section class="intro-section">
          <h2>☁️ 备用下载方式</h2>
          <div class="cloud-download">
            <p>如果代理节点失效或下载速度过慢，您可以使用夸克网盘获取资源：</p>
            <div class="quarkpan-card">
              <div class="quarkpan-info">
                <span class="quarkpan-icon">☁️</span>
                <div class="quarkpan-text">
                  <strong>沐柠环境盒 - 夸克网盘</strong>
                  <p>点击下方按钮复制链接，打开「夸克APP」即可访问</p>
                </div>
              </div>
              <button @click="copyQuarkpanLink" class="quarkpan-link">
                {{ copied ? '✅ 已复制' : '📋 复制链接' }}
              </button>
            </div>
            <div class="quarkpan-url-box">
              <input type="text" readonly :value="quarkpanUrl" class="quarkpan-url-input" />
              <button @click="copyQuarkpanLink" class="copy-btn">{{ copied ? '已复制' : '复制' }}</button>
            </div>
            <p class="quarkpan-tip">💡 提示：夸克网盘下载速度更快更稳定</p>
          </div>
        </section>

        <div class="tagline">
          <span class="quote">✨</span> 沐柠相伴，万物可期 <span class="quote">✨</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ProductIntro',
  data() {
    return {
      quarkpanUrl: 'https://pan.quark.cn/s/93eb50a2e3e3',
      copied: false,
    };
  },
  methods: {
    copyQuarkpanLink() {
      navigator.clipboard.writeText(this.quarkpanUrl).then(() => {
        this.copied = true;
        setTimeout(() => {
          this.copied = false;
        }, 2000);
      }).catch(err => {
        console.error('复制失败:', err);
        // 降级方案
        const textArea = document.createElement('textarea');
        textArea.value = this.quarkpanUrl;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          this.copied = true;
          setTimeout(() => {
            this.copied = false;
          }, 2000);
        } catch (e) {
          alert('复制失败，请手动复制链接');
        }
        document.body.removeChild(textArea);
      });
    },
  },
};
</script>

<style scoped>
.product-intro {
  background: var(--gradient-bg);
  border-radius: 28px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  height: 100%;
  overflow-y: auto;
}

.content-card {
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
  padding: 20px;
}

.hero {
  text-align: center;
  margin-bottom: 40px;
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

.intro-section {
  margin-bottom: 40px;
}

.intro-section h2 {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--text-primary);
  border-bottom: 2px solid var(--primary);
  padding-bottom: 8px;
  display: inline-block;
}

.description p {
  font-size: 1rem;
  line-height: 1.7;
  color: var(--text-primary);
  margin-bottom: 16px;
  text-align: justify;
}

.workflow {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 24px;
}

.workflow-step {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  background: var(--bg-card);
  padding: 20px;
  border-radius: 16px;
  border: 1px solid var(--border-light);
  transition: all 0.3s ease;
}

.workflow-step:hover {
  transform: translateX(8px);
  box-shadow: var(--shadow-md);
  border-color: var(--primary);
}

.step-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.step-content h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--primary);
}

.step-content p {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-secondary);
}

.tech-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 20px;
}

.tech-item {
  background: var(--bg-card);
  padding: 20px;
  border-radius: 16px;
  border: 1px solid var(--border-light);
  text-align: center;
  transition: all 0.3s ease;
}

.tech-item:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
  border-color: var(--primary);
}

.tech-name {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--primary);
  margin-bottom: 8px;
}

.tech-desc {
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.feature-list {
  list-style: none;
  padding: 0;
  margin-top: 16px;
}

.feature-list li {
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-primary);
}

.feature-list li:last-child {
  border-bottom: none;
}

.feature-list li strong {
  color: var(--primary);
}

.advantage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.advantage-item {
  background: var(--bg-card);
  padding: 24px;
  border-radius: 16px;
  border: 1px solid var(--border-light);
  text-align: center;
  transition: all 0.3s ease;
}

.advantage-item:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-md);
  border-color: var(--primary);
}

.advantage-icon {
  font-size: 2.5rem;
  margin-bottom: 12px;
}

.advantage-item h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text-primary);
}

.advantage-item p {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.tagline {
  text-align: center;
  margin-top: 48px;
  padding-top: 32px;
  border-top: 1px solid var(--border-light);
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

/* 夸克网盘下载卡片 */
.cloud-download {
  margin-top: 20px;
}

.cloud-download > p {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.quarkpan-card {
  background: linear-gradient(135deg, #007AFF 0%, #5856D6 100%);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  box-shadow: 0 4px 16px rgba(0, 122, 255, 0.3);
  transition: all 0.3s ease;
}

.quarkpan-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(0, 122, 255, 0.4);
}

.quarkpan-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.quarkpan-icon {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.quarkpan-text {
  flex: 1;
}

.quarkpan-text strong {
  display: block;
  font-size: 1.1rem;
  color: white;
  margin-bottom: 6px;
}

.quarkpan-text p {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.9);
  margin: 0;
  line-height: 1.5;
}

.quarkpan-link {
  background: white;
  color: #007AFF;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 0.95rem;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.quarkpan-link:hover {
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.quarkpan-url-box {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  align-items: center;
}

.quarkpan-url-input {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 0.85rem;
  color: var(--text-primary);
  font-family: 'Courier New', monospace;
  outline: none;
  transition: all 0.2s ease;
}

.quarkpan-url-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

.copy-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.copy-btn:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
}

.quarkpan-tip {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 12px;
  font-style: italic;
}
</style>
