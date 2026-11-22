<template>
  <div class="pm">
    <div class="pm-hero">
      <div class="pm-hero-main">
        <div class="pm-stat">
          <span class="pm-stat-value">{{ stats.total }}</span>
          <span class="pm-stat-label">监听端口</span>
        </div>
        <div class="pm-stat">
          <span class="pm-stat-value accent">{{ stats.sandbox }}</span>
          <span class="pm-stat-label">环境盒相关</span>
        </div>
        <div class="pm-stat">
          <span class="pm-stat-value">{{ stats.system }}</span>
          <span class="pm-stat-label">其他进程</span>
        </div>
        <div class="pm-stat wide">
          <span class="pm-stat-label">上次扫描</span>
          <span class="pm-stat-value small">{{ scannedText }}</span>
        </div>
      </div>
      <div class="pm-hero-actions">
        <label class="pm-auto">
          <input v-model="autoRefresh" type="checkbox" />
          <span>自动刷新 4s</span>
        </label>
        <button class="pm-btn" type="button" :disabled="loading" @click="refresh">
          {{ loading ? '扫描中…' : '立即刷新' }}
        </button>
      </div>
    </div>

    <div v-if="!hasApi" class="pm-empty">
      端口扫描需要在桌面端使用。
    </div>

    <template v-else>
      <div class="pm-toolbar">
        <div class="pm-chips">
          <button
            v-for="option in filters"
            :key="option.id"
            type="button"
            class="pm-chip"
            :class="{ 'is-active': filter === option.id }"
            @click="filter = option.id"
          >
            {{ option.label }}
          </button>
        </div>
        <input v-model.trim="keyword" class="pm-search" type="search" placeholder="搜端口 / 进程名 / PID" />
      </div>

      <div v-if="error" class="pm-error">{{ error }}</div>

      <div class="pm-table-wrap">
        <table class="pm-table">
          <thead>
            <tr>
              <th class="col-port">端口</th>
              <th>进程</th>
              <th class="col-pid">PID</th>
              <th class="col-addr">监听地址</th>
              <th class="col-mem">内存</th>
              <th class="col-scope">来源</th>
              <th class="col-act">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.port + '-' + row.pid" :class="{ 'is-sandbox': row.scope === 'sandbox' }">
              <td class="mono port">{{ row.port }}</td>
              <td>
                <div class="pm-proc">
                  <span class="pm-proc-name" :title="row.exe || row.process">{{ row.process }}</span>
                  <span v-if="row.common" class="pm-tag">常见端口</span>
                </div>
              </td>
              <td class="mono">{{ row.pid }}</td>
              <td class="mono addr" :title="row.address">{{ row.address }}</td>
              <td class="mono mem">{{ formatMemory(row.memory) }}</td>
              <td>
                <span class="pm-badge" :class="'scope-' + row.scope">{{ scopeLabel(row.scope) }}</span>
              </td>
              <td class="col-act">
                <span v-if="row.scope === 'self'" class="pm-self">环境盒</span>
                <span v-else-if="row.pid <= 4" class="pm-self">系统保留</span>
                <button
                  v-else
                  type="button"
                  class="pm-kill"
                  :class="{ 'is-armed': armedKey === row.pid + ':' + row.port }"
                  :disabled="killing === row.pid + ':' + row.port"
                  @click="requestKill(row)"
                >
                  {{ buttonText(row) }}
                </button>
              </td>
            </tr>
            <tr v-if="!rows.length && !loading">
              <td colspan="7" class="pm-none">{{ keyword ? '没匹配到端口，换个关键词试试' : '当前没有监听中的端口' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="pm-foot">
        只读取本机监听中的 TCP 端口（netstat 级别的信息），结束进程会用 <code>taskkill /T /F</code>；系统进程需要点两次确认。
        有些进程（例如系统服务）即使显示出来也可能因权限不足无法结束。
      </p>
    </template>
  </div>
</template>

<script>
const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'sandbox', label: '环境盒相关' },
  { id: 'common', label: '常见端口' },
  { id: 'system', label: '其他进程' }
];

export default {
  name: 'PortManager',
  data() {
    return {
      hasApi: Boolean(window.electronAPI && window.electronAPI.portmanList),
      ports: [],
      stats: { total: 0, sandbox: 0, system: 0, scannedAt: 0 },
      loading: false,
      error: '',
      filter: 'all',
      keyword: '',
      autoRefresh: true,
      armedKey: '',
      armedAt: 0,
      killing: '',
      timer: null,
      disposeArmed: null,
      filters: FILTERS
    };
  },
  computed: {
    rows() {
      const kw = this.keyword.toLowerCase();
      return this.ports.filter((item) => {
        if (this.filter === 'sandbox' && item.scope !== 'sandbox') return false;
        if (this.filter === 'system' && item.scope !== 'system') return false;
        if (this.filter === 'common' && !item.common) return false;
        if (!kw) return true;
        return String(item.port).includes(kw)
          || item.process.toLowerCase().includes(kw)
          || String(item.pid).includes(kw);
      });
    },
    scannedText() {
      if (!this.stats.scannedAt) return '—';
      const date = new Date(this.stats.scannedAt);
      const pad = (value) => String(value).padStart(2, '0');
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
  },
  mounted() {
    if (!this.hasApi) return;
    this.refresh();
    this.startTimer();
  },
  beforeUnmount() {
    this.stopTimer();
    if (this.disposeArmed) clearTimeout(this.disposeArmed);
  },
  methods: {
    scopeLabel(scope) {
      if (scope === 'sandbox') return '环境盒';
      if (scope === 'self') return '自身';
      return '系统';
    },
    formatMemory(bytes) {
      const value = Number(bytes) || 0;
      if (!value) return '—';
      if (value >= 1024 * 1024 * 1024) return (value / 1024 / 1024 / 1024).toFixed(1) + ' GB';
      if (value >= 1024 * 1024) return (value / 1024 / 1024).toFixed(0) + ' MB';
      return Math.max(1, Math.round(value / 1024)) + ' KB';
    },
    buttonText(row) {
      const key = row.pid + ':' + row.port;
      if (this.killing === key) return '结束中…';
      return this.armedKey === key ? '确认结束' : '结束进程';
    },
    async refresh() {
      if (!this.hasApi || this.loading) return;
      this.loading = true;
      this.error = '';
      try {
        const result = await window.electronAPI.portmanList();
        if (result && result.ok) {
          this.ports = Array.isArray(result.ports) ? result.ports : [];
          this.stats = result.stats || { total: this.ports.length, sandbox: 0, system: 0, scannedAt: Date.now() };
        } else {
          this.error = (result && result.message) || '扫描失败';
        }
      } catch (err) {
        this.error = err.message || String(err);
      } finally {
        this.loading = false;
      }
    },
    startTimer() {
      this.stopTimer();
      this.timer = setInterval(() => {
        if (this.autoRefresh && !this.killing) this.refresh();
      }, 4000);
    },
    stopTimer() {
      if (this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    },
    requestKill(row) {
      const key = row.pid + ':' + row.port;
      if (this.armedKey !== key) {
        this.armedKey = key;
        this.armedAt = Date.now();
        if (this.disposeArmed) clearTimeout(this.disposeArmed);
        this.disposeArmed = setTimeout(() => {
          this.armedKey = '';
        }, 3000);
        return;
      }
      this.disposeArmed && clearTimeout(this.disposeArmed);
      this.armedKey = '';
      this.kill(row, key);
    },
    async kill(row, key) {
      this.killing = key;
      try {
        const result = await window.electronAPI.portmanKill({
          pid: row.pid,
          allowSystem: row.scope === 'system'
        });
        const text = result && result.message ? result.message : '';
        if (result && result.ok) {
          window.Lemon && window.Lemon.success ? window.Lemon.success(`已结束 ${row.process}（PID ${row.pid}）`) : null;
        } else if (window.Lemon && window.Lemon.error) {
          window.Lemon.error(text || '结束进程失败');
        }
      } catch (err) {
        if (window.Lemon && window.Lemon.error) window.Lemon.error(err.message || String(err));
      } finally {
        this.killing = '';
        setTimeout(() => this.refresh(), 400);
      }
    }
  }
};
</script>

<style scoped>
.pm {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  color: var(--text-primary);
}

.pm-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
}

.pm-hero-main {
  display: flex;
  gap: var(--space-6);
  flex-wrap: wrap;
}

.pm-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 64px;
}

.pm-stat.wide { min-width: 96px; }

.pm-stat-value {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.1;
}

.pm-stat-value.accent { color: var(--primary); }

.pm-stat-value.small { font-size: 14px; font-weight: 500; color: var(--text-secondary); }

.pm-stat-label {
  font-size: 12px;
  color: var(--text-muted);
}

.pm-hero-actions {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.pm-auto {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.pm-auto input { accent-color: var(--primary); cursor: pointer; }

.pm-btn {
  height: 32px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-medium);
  background: transparent;
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}

.pm-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--primary); }
.pm-btn:disabled { opacity: 0.6; cursor: default; }

.pm-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.pm-chips { display: flex; gap: 8px; flex-wrap: wrap; }

.pm-chip {
  height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: color var(--transition-fast), border-color var(--transition-fast), background var(--transition-fast);
}

.pm-chip:hover { color: var(--text-primary); border-color: var(--border-medium); }

.pm-chip.is-active {
  color: var(--text-inverse);
  background: var(--primary);
  border-color: var(--primary);
}

.pm-search {
  height: 32px;
  width: 260px;
  max-width: 100%;
  padding: 0 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-light);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.pm-search:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.pm-error {
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--danger-border);
  background: var(--danger-bg);
  color: var(--danger-text);
  font-size: 13px;
}

.pm-table-wrap {
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  overflow: auto;
}

.pm-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.pm-table th {
  text-align: left;
  font-weight: 500;
  font-size: 12px;
  color: var(--text-muted);
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  white-space: nowrap;
}

.pm-table td {
  padding: 9px 14px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}

.pm-table tbody tr:last-child td { border-bottom: none; }
.pm-table tbody tr:hover { background: var(--bg-hover); }
.pm-table tbody tr.is-sandbox:hover { background: var(--primary-light); }

.mono { font-family: var(--font-mono); font-size: 12px; }

.port { font-weight: 600; font-size: 13px; }

.addr, .mem { color: var(--text-secondary); }

.addr { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pm-proc { display: flex; align-items: center; gap: 8px; }

.pm-proc-name { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pm-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--bg-hover);
  color: var(--text-secondary);
  border: 1px solid var(--border-light);
  white-space: nowrap;
}

.pm-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-light);
  white-space: nowrap;
}

.pm-badge.scope-sandbox {
  color: var(--primary);
  border-color: var(--primary);
  background: var(--primary-light);
}

.pm-badge.scope-system { color: var(--text-secondary); }

.pm-badge.scope-self { color: var(--text-muted); }

.col-act { width: 120px; text-align: right; }

.pm-kill {
  height: 26px;
  padding: 0 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--danger-border);
  background: transparent;
  color: var(--danger-text);
  font-size: 12px;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}

.pm-kill:hover:not(:disabled) { background: var(--danger-bg); }

.pm-kill.is-armed {
  background: var(--danger);
  border-color: var(--danger);
  color: #fff;
}

.pm-kill:disabled { opacity: 0.6; cursor: default; }

.pm-self { font-size: 12px; color: var(--text-muted); }

.pm-none { text-align: center; color: var(--text-muted); padding: 28px 0 !important; }

.pm-foot { font-size: 12px; color: var(--text-muted); line-height: 1.7; }

.pm-foot code {
  font-family: var(--font-mono);
  background: var(--bg-hover);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}

.pm-empty {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border-medium);
  border-radius: var(--radius-lg);
}

@media (max-width: 960px) {
  .col-addr, .col-mem { display: none; }
  .pm-search { width: 100%; }
}
</style>
