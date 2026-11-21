<template>
  <div class="mcp-page">
    <div v-if="!available" class="mcp-offline pl-panel">
      <div class="mcp-offline-icon">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 2v6M15 2v6" />
          <path d="M7 8h10v4a5 5 0 0 1-10 0V8Z" />
          <path d="M12 17v5" />
        </svg>
      </div>
      <div>
        <h3>需要在桌面端使用</h3>
        <p>MCP 控制中枢要在环境盒的 Electron 主进程里启动一个本机服务，浏览器预览模式拿不到这个能力。</p>
      </div>
    </div>

    <template v-else>
      <!-- 状态区 -->
      <section class="mcp-hero">
        <div class="mcp-hero-top">
          <div class="mcp-state">
            <span class="mcp-ring" :class="{ live: status.running }">
              <span class="mcp-ring-core"></span>
            </span>
            <div class="mcp-state-text">
              <span class="mcp-kicker">MCP SERVER</span>
              <strong>{{ status.running ? '运行中' : '已停止' }}</strong>
              <small>{{ status.running ? '正在等待智能体连接' : '启动之后智能体才能调用' }}</small>
            </div>
          </div>

          <div class="mcp-endpoint">
            <span class="mcp-kicker">ENDPOINT</span>
            <button type="button" class="mcp-endpoint-chip" :title="'复制 ' + endpointUrl" @click="copy(endpointUrl, 'url')">
              <code>{{ endpointUrl }}</code>
              <svg v-if="copied !== 'url'" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V6a2 2 0 0 1 2-2h9" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m5 12 5 5L20 7" />
              </svg>
            </button>
          </div>

          <div class="mcp-hero-actions">
            <button class="pl-btn" :class="status.running ? 'danger' : 'primary'" :disabled="busy" :aria-busy="busy" @click="toggleServer">
              <span v-if="busy" class="pl-spin"></span>
              {{ busy ? '处理中' : (status.running ? '停止服务' : '启动服务') }}
            </button>
            <button class="pl-btn ghost small" :disabled="!status.running || busy" @click="runSelfTest">
              {{ selfTestBusy ? '握手…' : '自检握手' }}
            </button>
            <button class="mcp-icon-btn" type="button" aria-label="立即刷新" title="立即刷新" @click="refresh">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
          </div>
        </div>

        <div class="mcp-hero-metrics">
          <div class="mcp-metric">
            <span class="mcp-kicker">今日调用</span>
            <strong>{{ stats.calls }}</strong>
          </div>
          <div class="mcp-metric">
            <span class="mcp-kicker">成功率</span>
            <strong>{{ stats.calls ? stats.successRate + '%' : '—' }}</strong>
          </div>
          <div class="mcp-metric">
            <span class="mcp-kicker">运行时长</span>
            <strong>{{ uptimeText }}</strong>
          </div>
          <div class="mcp-metric">
            <span class="mcp-kicker">接入客户端</span>
            <strong>{{ stats.clients || 0 }}</strong>
          </div>
        </div>

        <div v-if="status.error" class="mcp-banner" role="alert">{{ status.error }}</div>
        <div v-else-if="selfTest" class="mcp-banner" :class="{ ok: selfTest.success }" role="status">
          {{ selfTest.message }}
          <span v-if="selfTest.tools && selfTest.tools.length" class="mcp-banner-tools">{{ selfTest.tools.join(' · ') }}</span>
        </div>
      </section>

      <!-- 接入配置 -->
      <section class="pl-panel mcp-connect">
        <button
          type="button"
          class="mcp-connect-head"
          :aria-expanded="showConnect ? 'true' : 'false'"
          @click="showConnect = !showConnect"
        >
          <div class="mcp-connect-title">
            <h3>接入配置</h3>
            <p>复制下面这段，贴进客户端就能用</p>
          </div>
          <span class="mcp-connect-toggle">
            {{ showConnect ? '收起' : '展开' }}
            <svg :class="{ flipped: showConnect }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>

        <div v-show="showConnect" class="mcp-connect-body">
          <div class="mcp-tabs" role="tablist">
            <button
              v-for="tab in connectTabs"
              :key="tab.id"
              type="button"
              role="tab"
              class="mcp-tab"
              :class="{ active: connectTab === tab.id }"
              :aria-selected="connectTab === tab.id ? 'true' : 'false'"
              @click="connectTab = tab.id"
            >
              {{ tab.label }}
            </button>
            <button type="button" class="pl-btn small mcp-copy-snippet" @click="copy(snippet, 'snippet')">
              <svg v-if="copied !== 'snippet'" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V6a2 2 0 0 1 2-2h9" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m5 12 5 5L20 7" />
              </svg>
              {{ copied === 'snippet' ? '已复制' : '复制' }}
            </button>
          </div>

          <pre class="mcp-code">{{ snippet }}</pre>
          <p class="mcp-connect-note">{{ connectNote }}</p>
        </div>
      </section>

      <!-- 统计 -->
      <section class="mcp-stats">
        <div class="mcp-stat pl-panel mcp-stat-wide">
          <div class="mcp-stat-head">
            <span class="mcp-kicker">{{ rangeLabel }}调用</span>
            <span v-if="deltaText" class="mcp-delta">{{ deltaText }}</span>
          </div>
          <strong class="mcp-big">{{ stats.calls }}</strong>
          <span class="mcp-sub">{{ stats.ok }} 成功 / {{ stats.fail }} 失败</span>
          <div class="mcp-spark" aria-hidden="true">
            <span
              v-for="day in weekSeries"
              :key="day.day"
              class="mcp-spark-bar"
              :class="{ today: day.today }"
              :style="{ height: sparkHeight(day.calls) }"
              :title="day.day + ' · ' + day.calls + ' 次'"
            ></span>
          </div>
        </div>
        <div class="mcp-stat pl-panel">
          <span class="mcp-kicker">终端命令</span>
          <strong class="mcp-big">{{ stats.commands }}</strong>
          <span class="mcp-sub">toolbox_run_command</span>
        </div>
        <div class="mcp-stat pl-panel">
          <span class="mcp-kicker">服务操作</span>
          <strong class="mcp-big">{{ stats.serviceOps }}</strong>
          <span class="mcp-sub">启动 / 停止 / 重启</span>
        </div>
        <div class="mcp-stat pl-panel">
          <span class="mcp-kicker">平均耗时</span>
          <strong class="mcp-big">{{ stats.avgMs }}<small>ms</small></strong>
          <span class="mcp-sub">{{ stats.clients || 0 }} 个客户端接入过</span>
        </div>
      </section>

      <!-- 流水 + 侧栏 -->
      <section class="mcp-body">
        <div class="mcp-stream pl-panel">
          <header class="mcp-panel-head">
            <div>
              <h3>调用流水</h3>
              <p>{{ paused ? '已暂停刷新，点击「继续」恢复' : '智能体每一次调用都会实时落在这里' }}</p>
            </div>
            <div class="mcp-head-actions">
              <button class="pl-btn ghost small" @click="paused = !paused">{{ paused ? '继续' : '暂停' }}</button>
              <button class="pl-btn ghost small" @click="clearCalls">清空</button>
            </div>
          </header>

          <div class="mcp-filter">
            <button
              type="button"
              class="mcp-chip"
              :class="{ active: feedFilter === 'all' }"
              @click="feedFilter = 'all'"
            >全部</button>
            <button
              type="button"
              class="mcp-chip"
              :class="{ active: feedFilter === 'fail' }"
              @click="feedFilter = 'fail'"
            >仅失败</button>
            <select v-model="feedTool" class="mcp-select" aria-label="按工具筛选">
              <option value="">所有工具</option>
              <option v-for="item in toolOptions" :key="item" :value="item">{{ shortTool(item) }}</option>
            </select>
            <span class="mcp-filter-count">{{ feedVisible.length }} 条</span>
          </div>

          <div v-if="!feedVisible.length" class="mcp-empty">
            <div class="mcp-empty-dot"></div>
            <p>还没有调用记录。把上面的配置填进 DSH，然后说一句「看看环境盒里有哪些 JDK」，这里就会亮起来。</p>
          </div>

          <ul v-else class="mcp-feed">
            <li v-for="item in feedVisible" :key="item.ts + '-' + item.tool + '-' + item.ms" class="mcp-feed-item" :class="{ fail: !item.ok }">
              <button type="button" class="mcp-feed-row" :aria-expanded="expandedKey === rowKey(item) ? 'true' : 'false'" @click="toggleRow(item)">
                <span class="mcp-feed-time">{{ timeOf(item.ts) }}</span>
                <span class="mcp-feed-tool">{{ shortTool(item.tool) }}</span>
                <span class="mcp-feed-summary">{{ item.summary || '—' }}</span>
                <span class="mcp-feed-ms">{{ item.ms }}ms</span>
                <span class="mcp-feed-client">{{ item.client || '未知' }}</span>
                <span class="mcp-feed-state">{{ item.ok ? 'OK' : 'FAIL' }}</span>
              </button>
              <div v-if="expandedKey === rowKey(item)" class="mcp-feed-detail">
                <div class="mcp-detail-row"><span>工具</span><code>{{ item.tool }}</code></div>
                <div class="mcp-detail-row"><span>摘要</span><code>{{ item.summary || '—' }}</code></div>
                <div v-if="item.error" class="mcp-detail-row"><span>错误</span><code class="danger">{{ item.error }}</code></div>
                <div class="mcp-detail-row"><span>时间</span><code>{{ fullTime(item.ts) }}</code></div>
              </div>
            </li>
          </ul>
        </div>

        <div class="mcp-side">
          <div class="pl-panel mcp-tools">
            <header class="mcp-panel-head compact">
              <div>
                <h3>可用能力</h3>
                <p>{{ toolList.length || 6 }} 个工具，点开看参数和示例</p>
              </div>
            </header>
            <ul class="mcp-tool-list">
              <li v-for="tool in toolList" :key="tool.name" class="mcp-tool" :class="{ open: openTool === tool.name }">
                <button type="button" class="mcp-tool-row" :aria-expanded="openTool === tool.name ? 'true' : 'false'" @click="openTool = openTool === tool.name ? '' : tool.name">
                  <span class="mcp-tool-name">{{ shortTool(tool.name) }}</span>
                  <span class="mcp-tool-risk" :class="riskOf(tool.name)">{{ riskOf(tool.name) === 'write' ? '会改动' : '只读' }}</span>
                  <svg class="mcp-tool-caret" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <div v-show="openTool === tool.name" class="mcp-tool-body">
                  <p class="mcp-tool-desc">{{ tool.description }}</p>
                  <div class="mcp-tool-params">
                    <span v-for="param in paramsOf(tool)" :key="param" class="mcp-tool-param">{{ param }}</span>
                    <span v-if="!paramsOf(tool).length" class="mcp-tool-param empty">无参数</span>
                  </div>
                  <button type="button" class="mcp-tool-example" @click="copy(promptOf(tool.name), 'prompt-' + tool.name)">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                    </svg>
                    {{ copied === 'prompt-' + tool.name ? '已复制，粘给智能体' : promptOf(tool.name) }}
                  </button>
                </div>
              </li>
              <li v-if="!toolList.length" class="mcp-muted">工具列表加载中…</li>
            </ul>
          </div>

          <div class="pl-panel mcp-token">
            <header class="mcp-panel-head compact">
              <div>
                <h3>访问令牌</h3>
                <p>没有它，谁都不能碰这台机器</p>
              </div>
            </header>
            <div class="mcp-token-row">
              <code class="mcp-token-value">{{ tokenVisible ? status.token : status.tokenMasked }}</code>
              <button class="mcp-icon-btn" type="button" :aria-label="tokenVisible ? '隐藏令牌' : '显示令牌'" :title="tokenVisible ? '隐藏' : '显示'" @click="tokenVisible = !tokenVisible">
                <svg v-if="!tokenVisible" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m3 3 18 18" />
                  <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.3 4.1" />
                  <path d="M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4.1-.8" />
                </svg>
              </button>
              <button class="mcp-icon-btn" type="button" aria-label="复制令牌" title="复制" @click="copy(status.token, 'token')">
                <svg v-if="copied !== 'token'" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V6a2 2 0 0 1 2-2h9" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m5 12 5 5L20 7" />
                </svg>
              </button>
            </div>
            <button class="pl-btn ghost small wide mcp-token-regen" :class="{ danger: confirmRegenerate }" @click="regenerateToken">
              {{ confirmRegenerate ? '再点一次，旧令牌立刻失效' : '重新生成令牌' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 设置 -->
      <section class="pl-panel mcp-settings">
        <button type="button" class="mcp-connect-head" :aria-expanded="showSettings ? 'true' : 'false'" @click="showSettings = !showSettings">
          <div class="mcp-connect-title">
            <h3>服务设置</h3>
            <p>端口 {{ status.port }} · {{ status.autoStart ? '随应用启动' : '手动启动' }} · {{ status.allowCommands ? '允许执行命令' : '禁止执行命令' }}</p>
          </div>
          <span class="mcp-connect-toggle">
            {{ showSettings ? '收起' : '展开' }}
            <svg :class="{ flipped: showSettings }" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>

        <div v-show="showSettings" class="mcp-setting-grid">
          <label class="mcp-setting">
            <span class="mcp-kicker">监听端口</span>
            <div class="mcp-inline">
              <input v-model="portDraft" class="mcp-input" type="number" min="1024" max="65535" />
              <button class="pl-btn ghost small" :disabled="busy || String(status.port) === String(portDraft)" @click="applyPort">应用</button>
            </div>
            <small>只监听 127.0.0.1，外部机器连不进来；改完要同步改客户端配置</small>
          </label>

          <div class="mcp-setting">
            <span class="mcp-kicker">随环境盒启动</span>
            <button class="mcp-switch" :class="{ on: status.autoStart }" @click="toggleAutoStart">
              <span></span>{{ status.autoStart ? '开启' : '关闭' }}
            </button>
            <small>打开环境盒后自动恢复 MCP 服务</small>
          </div>

          <div class="mcp-setting">
            <span class="mcp-kicker">允许执行终端命令</span>
            <button class="mcp-switch" :class="{ on: status.allowCommands }" @click="toggleAllowCommands">
              <span></span>{{ status.allowCommands ? '允许' : '禁止' }}
            </button>
            <small>关闭后 toolbox_run_command 会直接拒绝</small>
          </div>

          <label class="mcp-setting">
            <span class="mcp-kicker">命令超时</span>
            <div class="mcp-inline">
              <input v-model="timeoutDraft" class="mcp-input" type="number" min="1000" max="120000" step="1000" />
              <button class="pl-btn ghost small" :disabled="busy" @click="applyTimeout">应用</button>
            </div>
            <small>毫秒，默认 30000</small>
          </label>
        </div>
      </section>

      <p class="mcp-footnote">
        暴露 {{ toolList.length || status.tools || 6 }} 个工具 · 调用日志只存在本机，不会上传 · 服务重启后历史仍然保留
      </p>
    </template>
  </div>
</template>

<script>
const TOOL_META = {
  toolbox_overview: {
    risk: 'read',
    prompt: '看看环境盒里现在装了哪些开发工具，各自是什么版本'
  },
  toolbox_check_tool: {
    risk: 'read',
    prompt: '帮我查一下 JDK 装了哪些版本，当前用的是哪个'
  },
  toolbox_service: {
    risk: 'write',
    prompt: '把 MySQL 启动起来'
  },
  toolbox_run_command: {
    risk: 'write',
    prompt: '在沙箱里执行 mvn -v，看看 Maven 版本'
  },
  toolbox_check_port: {
    risk: 'read',
    prompt: '检查 3306 端口是不是被占用了'
  },
  toolbox_system_stats: {
    risk: 'read',
    prompt: '现在 CPU 和内存占用怎么样'
  }
};

export default {
  name: 'McpControlCenter',
  data() {
    return {
      available: Boolean(window.electronAPI && window.electronAPI.mcpGetStatus),
      status: {
        running: false,
        port: 15801,
        url: '',
        startedAt: 0,
        uptimeMs: 0,
        token: '',
        tokenMasked: '',
        autoStart: true,
        allowCommands: true,
        commandTimeout: 30000,
        error: '',
        tools: 0
      },
      stats: {calls: 0, ok: 0, fail: 0, avgMs: 0, successRate: 0, commands: 0, serviceOps: 0, clients: 0, byTool: [], series: []},
      week: {series: []},
      range: 'today',
      calls: [],
      live: [],
      paused: false,
      busy: false,
      selfTestBusy: false,
      selfTest: null,
      tokenVisible: false,
      confirmRegenerate: false,
      portDraft: '15801',
      timeoutDraft: '30000',
      draftsInit: false,
      copied: '',
      copyTimer: null,
      confirmTimer: null,
      timer: null,
      tickTimer: null,
      now: Date.now(),
      unsubscribe: null,
      showConnect: true,
      loadedOnce: false,
      showSettings: false,
      connectTab: 'dsh',
      connectTabs: [
        {id: 'dsh', label: 'DSH'},
        {id: 'codex', label: 'Codex / Claude'},
        {id: 'curl', label: 'curl 自检'}
      ],
      tools: [],
      openTool: '',
      expandedKey: '',
      feedFilter: 'all',
      feedTool: ''
    };
  },
  computed: {
    feed() {
      return this.live.slice(0, 60);
    },
    feedVisible() {
      return this.feed.filter((item) => {
        if (this.feedFilter === 'fail' && item.ok) return false;
        if (this.feedTool && item.tool !== this.feedTool) return false;
        return true;
      });
    },
    toolOptions() {
      const set = new Set(this.feed.map((item) => item.tool));
      return Array.from(set);
    },
    toolList() {
      return this.tools;
    },
    rangeLabel() {
      if (this.range === '7d') return '近 7 天';
      if (this.range === 'all') return '累计';
      return '今日';
    },
    endpointUrl() {
      return 'http://127.0.0.1:' + this.status.port + '/mcp';
    },
    uptimeText() {
      if (!this.status.running) return '—';
      const base = this.status.startedAt || (this.now - (this.status.uptimeMs || 0));
      const total = Math.max(0, Math.floor((this.now - base) / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h) return h + ' 小时 ' + m + ' 分';
      if (m) return m + ' 分 ' + s + ' 秒';
      return s + ' 秒';
    },
    weekSeries() {
      const series = (this.week && this.week.series) || [];
      return series.map((day, index) => Object.assign({}, day, {today: index === series.length - 1}));
    },
    deltaText() {
      const series = this.weekSeries;
      if (series.length < 2) return '';
      const today = series[series.length - 1].calls;
      const prev = series[series.length - 2].calls;
      if (!today && !prev) return '';
      if (!prev) return '昨日为 0';
      const diff = Math.round(((today - prev) / prev) * 100);
      if (diff === 0) return '与昨日持平';
      return (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff) + '% 较昨日';
    },
    snippet() {
      if (this.connectTab === 'dsh') {
        return [
          '- insert:',
          '    - id: mcp-muling-toolbox',
          '      name: "@deepseek-ai/dsh-mcp-client"',
          '      config:',
          '        serverName: muling',
          '        transport: streamable-http',
          '        url: ' + this.endpointUrl,
          '        headers:',
          '          Authorization: "Bearer ' + (this.status.token || '<token>') + '"',
          '        failOnStartupError: false'
        ].join('\n');
      }
      if (this.connectTab === 'codex') {
        return JSON.stringify({
          mcpServers: {
            'muling-toolbox': {
              type: 'http',
              url: this.endpointUrl,
              headers: {Authorization: 'Bearer ' + (this.status.token || '<token>')}
            }
          }
        }, null, 2);
      }
      return 'curl -s ' + this.endpointUrl + ' '
        + '-H "Authorization: Bearer ' + (this.status.token || '<token>') + '" '
        + '-H "Content-Type: application/json" '
        + '-d \'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\'';
    },
    connectNote() {
      if (this.connectTab === 'dsh') {
        return '追加到 ~/.dsh/profiles/desktop/cordis.patch.yml 末尾，重启 DSH 后工具会以 mcp__muling__<工具名> 出现。';
      }
      if (this.connectTab === 'codex') {
        return '贴进客户端的 mcpServers 配置；Codex、Claude Desktop 这类都认这个结构。';
      }
      return '在终端里跑一下，能返回工具列表就说明服务、令牌、网络三层都通。';
    }
  },
  mounted() {
    if (!this.available) return;
    this.refresh();
    this.loadStats();
    this.loadWeek();
    this.loadTools();
    this.timer = setInterval(() => {
      if (this.paused) return;
      this.loadStatus();
      this.loadStats();
    }, 6000);
    this.tickTimer = setInterval(() => {
      this.now = Date.now();
    }, 1000);
    this.weekTimer = setInterval(() => this.loadWeek(), 60000);
    if (window.electronAPI.onMcpActivity) {
      this.unsubscribe = window.electronAPI.onMcpActivity((entry) => this.onActivity(entry));
    }
  },
  beforeUnmount() {
    if (this.timer) clearInterval(this.timer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.weekTimer) clearInterval(this.weekTimer);
    if (this.copyTimer) clearTimeout(this.copyTimer);
    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    if (typeof this.unsubscribe === 'function') this.unsubscribe();
    this.unsubscribe = null;
  },
  methods: {
    async loadStatus() {
      if (!this.available) return;
      try {
        const status = await window.electronAPI.mcpGetStatus();
        if (!status) return;
        this.status = status;
        if (!this.draftsInit) {
          this.portDraft = String(status.port);
          this.timeoutDraft = String(status.commandTimeout);
          this.draftsInit = true;
        }
      } catch (err) {
        this.status.error = err.message;
      }
    },
    async loadStats() {
      if (!this.available) return;
      try {
        this.stats = await window.electronAPI.mcpGetStats(this.range);
        this.calls = await window.electronAPI.mcpGetCalls(60);
        if (!this.live.length) this.live = this.calls.slice();
        if (!this.loadedOnce) {
          this.loadedOnce = true;
          this.showConnect = this.stats.calls === 0;
        }
      } catch (err) {
        // 静默失败，界面保留上一次数据
      }
    },
    async loadWeek() {
      if (!this.available) return;
      try {
        const stats = await window.electronAPI.mcpGetStats('7d');
        this.week = stats || {series: []};
      } catch (err) {
        // 忽略
      }
    },
    async loadTools() {
      if (!this.available) return;
      try {
        const list = await window.electronAPI.mcpGetTools();
        this.tools = Array.isArray(list) ? list : [];
      } catch (err) {
        this.tools = [];
      }
    },
    async refresh() {
      await this.loadStatus();
      await this.loadStats();
      await this.loadWeek();
    },
    onActivity(entry) {
      if (this.paused) return;
      this.live.unshift(entry);
      if (this.live.length > 120) this.live.length = 120;
      this.stats.calls += 1;
      if (entry.ok) this.stats.ok += 1;
      else this.stats.fail += 1;
      if (entry.tool === 'toolbox_run_command') this.stats.commands += 1;
      if (entry.tool === 'toolbox_service') this.stats.serviceOps += 1;
      this.stats.successRate = this.stats.calls ? Math.round((this.stats.ok / this.stats.calls) * 100) : 0;
      const series = this.week.series;
      if (series && series.length) series[series.length - 1].calls += 1;
    },
    async toggleServer() {
      if (!this.available) return;
      this.busy = true;
      this.selfTest = null;
      try {
        const result = await (this.status.running ? window.electronAPI.mcpStop() : window.electronAPI.mcpStart());
        if (result && result.status) this.status = result.status;
        if (result && !result.success) this.toast(result.message || '操作失败', 'error');
        else this.toast(this.status.running ? 'MCP 服务已启动' : 'MCP 服务已停止', 'success');
      } catch (err) {
        this.toast(err.message, 'error');
      } finally {
        this.busy = false;
        this.loadStats();
      }
    },
    async runSelfTest() {
      this.selfTestBusy = true;
      try {
        this.selfTest = await window.electronAPI.mcpSelfTest();
      } catch (err) {
        this.selfTest = {success: false, message: err.message};
      } finally {
        this.selfTestBusy = false;
      }
    },
    async applyPort() {
      const port = Number(this.portDraft);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        this.toast('端口需要是 1024-65535 之间的整数', 'error');
        return;
      }
      this.busy = true;
      try {
        const result = await window.electronAPI.mcpUpdateConfig({port});
        if (result && result.status) this.status = result.status;
        this.toast(result.message || (result.success ? '端口已改为 ' + port : '修改失败'), result.success ? 'success' : 'error');
      } finally {
        this.busy = false;
      }
    },
    async applyTimeout() {
      const timeout = Number(this.timeoutDraft);
      const result = await window.electronAPI.mcpUpdateConfig({commandTimeout: timeout});
      if (result && result.status) this.status = result.status;
      this.toast(result.success ? '命令超时已更新' : result.message, result.success ? 'success' : 'error');
    },
    async toggleAutoStart() {
      const result = await window.electronAPI.mcpUpdateConfig({autoStart: !this.status.autoStart});
      if (result && result.status) this.status = result.status;
    },
    async toggleAllowCommands() {
      const result = await window.electronAPI.mcpUpdateConfig({allowCommands: !this.status.allowCommands});
      if (result && result.status) this.status = result.status;
    },
    async regenerateToken() {
      if (!this.confirmRegenerate) {
        this.confirmRegenerate = true;
        this.confirmTimer = setTimeout(() => {
          this.confirmRegenerate = false;
        }, 4000);
        return;
      }
      if (this.confirmTimer) clearTimeout(this.confirmTimer);
      this.confirmRegenerate = false;
      const result = await window.electronAPI.mcpRegenerateToken();
      if (result && result.success) {
        this.status.token = result.token;
        this.status.tokenMasked = result.masked;
        this.toast('已生成新令牌，旧配置需要同步更新', 'success');
      }
    },
    async clearCalls() {
      await window.electronAPI.mcpClearCalls();
      this.live = [];
      this.calls = [];
      this.stats = {calls: 0, ok: 0, fail: 0, avgMs: 0, successRate: 0, commands: 0, serviceOps: 0, clients: 0, byTool: [], series: []};
      this.toast('调用记录已清空', 'info');
    },
    async copy(text, key) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        const area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      this.copied = key;
      if (this.copyTimer) clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => {
        this.copied = '';
      }, 1500);
    },
    toast(message, type) {
      if (window.Lemon && typeof window.Lemon[type] === 'function') {
        window.Lemon[type](message);
      }
    },
    timeOf(ts) {
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, '0');
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    },
    fullTime(ts) {
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + this.timeOf(ts);
    },
    shortTool(tool) {
      return String(tool).replace(/^toolbox_/, '');
    },
    rowKey(item) {
      return item.ts + '-' + item.tool + '-' + item.ms;
    },
    toggleRow(item) {
      const key = this.rowKey(item);
      this.expandedKey = this.expandedKey === key ? '' : key;
    },
    riskOf(name) {
      return (TOOL_META[name] && TOOL_META[name].risk) || 'read';
    },
    promptOf(name) {
      return (TOOL_META[name] && TOOL_META[name].prompt) || '用 ' + name + ' 帮我操作环境盒';
    },
    paramsOf(tool) {
      const schema = (tool && tool.inputSchema) || {};
      return Object.keys(schema.properties || {});
    },
    sparkHeight(count) {
      const max = Math.max(1, ...this.weekSeries.map((item) => item.calls));
      return Math.max(3, Math.round((count / max) * 26)) + 'px';
    }
  }
};
</script>

<style scoped>
.mcp-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-bottom: var(--space-6);
}

/* ── 离线态 ── */
.mcp-offline {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-6);
}

.mcp-offline-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  color: var(--primary);
  background: var(--primary-light);
  flex-shrink: 0;
}

.mcp-offline h3 {
  margin: 0 0 4px;
}

.mcp-offline p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

/* ── 通用小字 ── */
.mcp-kicker {
  display: block;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  margin-bottom: 4px;
}

/* ── 状态区 ── */
.mcp-hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-5) var(--space-6);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-light);
  background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--primary) 10%, transparent) 0%, transparent 55%),
    var(--bg-card);
  box-shadow: var(--shadow-sm);
}

.mcp-hero-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
}

.mcp-state {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 190px;
}

.mcp-ring {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  border: 1px solid var(--border-medium);
  flex-shrink: 0;
}

.mcp-ring-core {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: background var(--transition-fast);
}

.mcp-ring.live {
  border-color: color-mix(in srgb, var(--success) 45%, transparent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--success) 12%, transparent);
}

.mcp-ring.live::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--success) 55%, transparent);
  animation: mcp-pulse 2.2s ease-out infinite;
}

.mcp-ring.live .mcp-ring-core {
  background: var(--success);
}

@keyframes mcp-pulse {
  0% { transform: scale(0.85); opacity: 0.9; }
  70% { transform: scale(1.35); opacity: 0; }
  100% { transform: scale(1.35); opacity: 0; }
}

.mcp-state-text strong {
  display: block;
  font-size: 17px;
  line-height: 1.25;
  color: var(--text-primary);
}

.mcp-state-text small {
  font-size: 11px;
  color: var(--text-secondary);
}

.mcp-endpoint {
  min-width: 0;
  flex: 1 1 260px;
}

.mcp-endpoint-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--primary);
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}

.mcp-endpoint-chip:hover {
  border-color: color-mix(in srgb, var(--primary) 45%, transparent);
  background: var(--primary-light);
}

.mcp-endpoint-chip code {
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mcp-hero-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.mcp-icon-btn {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
}

.mcp-icon-btn:hover {
  color: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
}

.mcp-icon-btn:focus-visible,
.mcp-endpoint-chip:focus-visible,
.mcp-feed-row:focus-visible,
.mcp-tool-row:focus-visible,
.mcp-chip:focus-visible,
.mcp-tab:focus-visible,
.mcp-icon-btn:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.mcp-hero-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--border-light);
}

.mcp-metric strong {
  font-family: var(--font-mono);
  font-size: 15px;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.mcp-banner {
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background: var(--danger-bg);
  color: var(--danger-text);
  font-size: 12px;
  border: 1px solid var(--danger-border);
}

.mcp-banner.ok {
  background: var(--success-bg);
  color: var(--success-text);
  border-color: var(--success-border);
}

.mcp-banner-tools {
  margin-left: 8px;
  font-family: var(--font-mono);
  opacity: 0.8;
}

/* ── 接入配置 / 设置折叠头 ── */
.mcp-connect,
.mcp-settings {
  overflow: hidden;
}

.mcp-connect-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-4) var(--space-5);
  background: none;
  border: 0;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.mcp-connect-head:hover {
  background: var(--bg-hover);
}

.mcp-connect-title h3 {
  margin: 0;
  font-size: 14px;
}

.mcp-connect-title p {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-secondary);
}

.mcp-connect-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.mcp-connect-toggle svg {
  transition: transform var(--transition-fast);
}

.mcp-connect-toggle svg.flipped {
  transform: rotate(180deg);
}

.mcp-connect-body {
  padding: 0 var(--space-5) var(--space-4);
}

.mcp-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: var(--space-3);
}

.mcp-tab {
  padding: 5px 12px;
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background: none;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mcp-tab:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.mcp-tab.active {
  color: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 35%, transparent);
  background: var(--primary-light);
}

.mcp-copy-snippet {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.mcp-code {
  margin: 0;
  padding: var(--space-3);
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.65;
  color: var(--text-secondary);
  max-height: 230px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.mcp-connect-note {
  margin: var(--space-3) 0 0;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.6;
}

/* ── 统计 ── */
.mcp-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
  gap: var(--space-3);
}

.mcp-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-4) var(--space-5);
}

.mcp-stat-wide {
  grid-column: span 1;
}

.mcp-stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mcp-delta {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  white-space: nowrap;
}

.mcp-big {
  font-family: var(--font-mono);
  font-size: 28px;
  line-height: 1.15;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.mcp-big small {
  font-size: 12px;
  color: var(--text-secondary);
  margin-left: 3px;
}

.mcp-sub {
  font-size: 11px;
  color: var(--text-secondary);
}

.mcp-spark {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 26px;
  margin: 2px 0 4px;
}

.mcp-spark-bar {
  flex: 1;
  min-width: 2px;
  border-radius: 2px 2px 1px 1px;
  background: color-mix(in srgb, var(--primary) 35%, transparent);
  transition: height var(--transition-normal);
}

.mcp-spark-bar.today {
  background: var(--primary);
}

/* ── 主体 ── */
.mcp-body {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr);
  gap: var(--space-4);
  align-items: start;
}

@media (max-width: 1080px) {
  .mcp-body {
    grid-template-columns: 1fr;
  }
}

.mcp-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-light);
}

.mcp-panel-head h3 {
  margin: 0;
  font-size: 14px;
}

.mcp-panel-head p {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-secondary);
}

.mcp-panel-head.compact {
  padding: var(--space-3) var(--space-4);
}

.mcp-head-actions {
  display: flex;
  gap: 6px;
}

.mcp-stream {
  min-height: 360px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mcp-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--border-light);
}

.mcp-chip {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mcp-chip:hover {
  color: var(--text-primary);
}

.mcp-chip.active {
  color: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  background: var(--primary-light);
}

.mcp-select {
  margin-left: auto;
  background: var(--bg-input);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 3px 6px;
  font-size: 11px;
  outline: none;
  cursor: pointer;
}

.mcp-select:focus {
  border-color: var(--primary);
}

.mcp-filter-count {
  font-size: 10px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  min-width: 34px;
  text-align: right;
}

.mcp-feed {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  max-height: 480px;
}

.mcp-feed-item {
  border-bottom: 1px solid var(--border-light);
}

.mcp-feed-item:hover {
  background: var(--bg-hover);
}

.mcp-feed-row {
  display: grid;
  grid-template-columns: 62px minmax(100px, 1.1fr) minmax(0, 2fr) 58px 72px 38px;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
  padding: 8px var(--space-5);
  background: none;
  border: 0;
  text-align: left;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
}

.mcp-feed-time,
.mcp-feed-ms {
  font-family: var(--font-mono);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.mcp-feed-tool {
  font-family: var(--font-mono);
  color: var(--primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mcp-feed-summary {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mcp-feed-client {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.mcp-feed-state {
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--success-text);
  text-align: right;
}

.mcp-feed-item.fail .mcp-feed-state {
  color: var(--danger-text);
}

.mcp-feed-item.fail .mcp-feed-tool {
  color: var(--danger-text);
}

.mcp-feed-detail {
  padding: 2px var(--space-5) 10px 70px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mcp-detail-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.mcp-detail-row code {
  font-family: var(--font-mono);
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
}

.mcp-detail-row code.danger {
  color: var(--danger-text);
}

.mcp-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-8) var(--space-5);
  text-align: center;
}

.mcp-empty p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  max-width: 340px;
  line-height: 1.7;
}

.mcp-empty-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--border-medium);
  animation: mcp-blink 1.6s ease-in-out infinite;
}

@keyframes mcp-blink {
  0%, 100% { opacity: 0.2; }
  50% { opacity: 1; }
}

.mcp-side {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* ── 工具目录 ── */
.mcp-tool-list {
  list-style: none;
  margin: 0;
  padding: 6px var(--space-3) var(--space-3);
}

.mcp-tool + .mcp-tool {
  border-top: 1px solid var(--border-light);
}

.mcp-tool-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 6px;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: background var(--transition-fast);
}

.mcp-tool-row:hover {
  background: var(--bg-hover);
}

.mcp-tool-name {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-primary);
}

.mcp-tool-risk {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
}

.mcp-tool-risk.write {
  color: var(--warning-text);
  border-color: var(--warning-border);
  background: var(--warning-bg);
}

.mcp-tool-caret {
  margin-left: auto;
  color: var(--text-secondary);
  transition: transform var(--transition-fast);
}

.mcp-tool.open .mcp-tool-caret {
  transform: rotate(180deg);
}

.mcp-tool-body {
  padding: 0 6px 10px;
}

.mcp-tool-desc {
  margin: 0 0 8px;
  font-size: 11px;
  line-height: 1.65;
  color: var(--text-secondary);
}

.mcp-tool-params {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}

.mcp-tool-param {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  color: var(--text-secondary);
}

.mcp-tool-param.empty {
  color: var(--text-secondary);
}

.mcp-tool-example {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-md);
  border: 1px dashed var(--border-medium);
  background: none;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mcp-tool-example:hover {
  color: var(--primary);
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  background: var(--primary-light);
}

/* ── 令牌 ── */
.mcp-token {
  padding-bottom: var(--space-4);
}

.mcp-token-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: var(--space-3) var(--space-4) var(--space-2);
}

.mcp-token-value {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 6px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mcp-token-regen {
  margin: 0 var(--space-4);
  width: calc(100% - var(--space-8));
}

.mcp-token-regen.danger {
  color: var(--danger-text);
  border-color: var(--danger-border);
  background: var(--danger-bg);
}

/* ── 设置 ── */
.mcp-setting-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-4);
  padding: 0 var(--space-5) var(--space-4);
}

.mcp-setting {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mcp-setting small {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.mcp-inline {
  display: flex;
  gap: 6px;
}

.mcp-input {
  width: 100%;
  min-width: 0;
  background: var(--bg-input);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 6px 8px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
}

.mcp-input:focus {
  border-color: var(--primary);
}

.mcp-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-light);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mcp-switch span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
}

.mcp-switch.on {
  border-color: color-mix(in srgb, var(--primary) 45%, transparent);
  color: var(--primary);
  background: var(--primary-light);
}

.mcp-switch.on span {
  background: var(--primary);
}

.mcp-muted {
  padding: var(--space-4);
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.mcp-footnote {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
  text-align: center;
}

@media (max-width: 820px) {
  .mcp-hero-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: var(--space-3);
  }

  .mcp-feed-row {
    grid-template-columns: 54px minmax(0, 1.5fr) minmax(0, 1.1fr) 52px 34px;
  }

  .mcp-feed-client {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mcp-ring.live::after,
  .mcp-empty-dot {
    animation: none;
  }
}
</style>
