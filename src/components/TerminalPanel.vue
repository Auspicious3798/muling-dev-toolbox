<template>
  <transition name="terminal-slide">
    <section v-if="visible" class="terminal-panel" :style="{ height: heightPx + 'px' }">
      <div class="terminal-resize" @pointerdown="startResize">
        <span class="resize-grip"></span>
      </div>
      <header class="terminal-bar">
        <div class="terminal-lights">
          <button class="light red" title="关闭终端" @click="close"></button>
          <button class="light amber" title="清屏" @click="clearScreen"></button>
          <button class="light green" :class="{ off: !sessionId }" title="重启会话" @click="restart"></button>
        </div>
        <div class="terminal-status">
          <span class="status-dot" :class="{ inactive: !hasEnv }"></span>
          <span class="status-label">当前环境</span>
          <span v-if="!hasEnv" class="status-empty">{{ statusText }}</span>
          <span v-for="tag in envTags" :key="tag.label" class="env-tag" :class="tag.tone">
            <span class="env-tag-dot"></span>{{ tag.label }}
          </span>
        </div>
        <div class="terminal-meta">
          <span class="meta-item">{{ termSize }}</span>
          <span class="meta-sep">·</span>
          <span class="meta-item">沙箱终端</span>
        </div>
        <div class="terminal-actions">
          <button class="bar-btn" title="清屏" @click="clearScreen">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>
            清屏
          </button>
          <button class="bar-btn" title="重启终端" @click="restart">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            重启
          </button>
          <button class="bar-btn close" title="关闭" @click="close">✕</button>
        </div>
      </header>
      <div ref="host" class="terminal-host">
        <div class="terminal-glow" aria-hidden="true"></div>
      </div>
    </section>
  </transition>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import eventBus from '@/eventBus';

const props = defineProps({
  focus: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['close']);

const visible = ref(true);
const host = ref(null);
const heightPx = ref(Number(localStorage.getItem('terminal_height')) || 320);
const summary = ref([]);

const hasEnv = computed(() => summary.value.length > 0);
const statusText = computed(() => (summary.value.length ? summary.value.join('  |  ') : '沙箱内还没有激活的工具'));

const ENV_TONES = {
  JDK: 'amber',
  Java: 'amber',
  Python: 'blue',
  MySQL: 'teal',
  Redis: 'rose',
  Maven: 'violet',
  Nginx: 'green',
  Node: 'green',
};

const envTags = computed(() => summary.value.map((entry) => {
  const parts = String(entry).trim().split(/\s+/);
  const name = parts.shift() || '';
  const version = parts.join(' ');
  return {
    label: version ? `${name} ${version}` : name,
    tone: ENV_TONES[name] || 'slate',
  };
}));

const termSize = ref('');

let term = null;
let fitAddon = null;
let sessionId = null;
let offData = null;
let offExit = null;
let offChanged = null;
let onDataDisposable = null;
let observer = null;
let resizeFrame = 0;
let lastSize = { cols: 0, rows: 0 };

const api = () => window.electronAPI;

function fit() {
  if (!fitAddon || !term) return;
  try {
    fitAddon.fit();
  } catch (e) {
  }
  if (sessionId && term.cols && term.rows && (term.cols !== lastSize.cols || term.rows !== lastSize.rows)) {
    lastSize = { cols: term.cols, rows: term.rows };
    api().terminalResize(sessionId, term.cols, term.rows);
  }
  if (term.cols && term.rows) termSize.value = `${term.cols} × ${term.rows}`;
}

function scheduleFit() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0;
    fit();
  });
}

function createTerminal() {
  term = new Terminal({
    fontFamily: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.35,
    cursorBlink: true,
    allowTransparency: true,
    scrollback: 4000,
    theme: {
      background: 'rgba(0, 0, 0, 0)',
      foreground: '#dbe4f0',
      cursor: '#14b8a6',
      cursorAccent: 'rgba(0,0,0,0)',
      selectionBackground: 'rgba(20, 184, 166, 0.28)',
      black: '#0f172a',
      red: '#f87171',
      green: '#34d399',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#e2e8f0',
      brightBlack: '#64748b',
      brightRed: '#fca5a5',
      brightGreen: '#6ee7b7',
      brightYellow: '#fcd34d',
      brightBlue: '#93c5fd',
      brightMagenta: '#d8b4fe',
      brightCyan: '#67e8f9',
      brightWhite: '#f8fafc',
    },
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(host.value);
  fit();
}

async function startSession() {
  if (!term) return;
  const result = await api().terminalCreate({
    cols: term.cols || 100,
    rows: term.rows || 30,
    tool: props.focus && props.focus.tool ? props.focus.tool : undefined,
    version: props.focus && props.focus.version ? props.focus.version : undefined,
  });
  if (!result || !result.success) {
    term.writeln(`\x1b[31m终端启动失败：${(result && result.error) || '未知错误'}\x1b[0m`);
    return;
  }
  sessionId = result.id;
  summary.value = result.summary || [];
  onDataDisposable = term.onData(data => {
    if (sessionId) api().terminalWrite(sessionId, data);
  });
  offData = api().onTerminalData(payload => {
    if (payload && payload.id === sessionId) term.write(payload.data);
  });
  offExit = api().onTerminalExit(payload => {
    if (payload && payload.id === sessionId) {
      sessionId = null;
      term.writeln('\r\n\x1b[90m[终端进程已结束，点击「重启」重新打开]\x1b[0m');
    }
  });
  fit();
}

function disposeSession() {
  if (offData) offData();
  if (offExit) offExit();
  if (onDataDisposable) onDataDisposable.dispose();
  offData = null;
  offExit = null;
  onDataDisposable = null;
  if (sessionId) {
    api().terminalDispose(sessionId);
    sessionId = null;
  }
}

function close() {
  visible.value = false;
  disposeSession();
  emit('close');
  setTimeout(() => eventBus.emit('terminal:closed'), 180);
}

function restart() {
  disposeSession();
  if (term) {
    term.clear();
    term.reset();
  }
  startSession();
}

function clearScreen() {
  if (term) term.clear();
}

function startResize(event) {
  event.preventDefault();
  const startY = event.clientY;
  const startHeight = heightPx.value;
  const move = e => {
    const next = Math.min(Math.max(startHeight + (startY - e.clientY), 180), window.innerHeight - 140);
    heightPx.value = next;
    scheduleFit();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    localStorage.setItem('terminal_height', String(heightPx.value));
    fit();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

onMounted(async () => {
  createTerminal();
  await startSession();
  observer = new ResizeObserver(() => scheduleFit());
  if (host.value) observer.observe(host.value);
  window.addEventListener('resize', scheduleFit);
  offChanged = api().onSandboxChanged(async () => {
    const info = await api().terminalSummary();
    if (info) summary.value = info.summary || [];
  });
});

onBeforeUnmount(() => {
  disposeSession();
  if (offChanged) offChanged();
  if (observer) observer.disconnect();
  window.removeEventListener('resize', scheduleFit);
  if (resizeFrame) cancelAnimationFrame(resizeFrame);
  if (term) {
    term.dispose();
    term = null;
  }
  api().terminalDisposeAll();
});
</script>

<style scoped>
.terminal-panel {
  position: fixed;
  left: 260px;
  right: 0;
  bottom: 0;
  z-index: 240;
  display: flex;
  flex-direction: column;
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  overflow: hidden;
  background:
    radial-gradient(120% 90% at 12% 0%, rgba(20, 184, 166, 0.18) 0%, rgba(20, 184, 166, 0) 55%),
    radial-gradient(100% 80% at 92% 8%, rgba(139, 92, 246, 0.14) 0%, rgba(139, 92, 246, 0) 60%),
    rgba(9, 14, 26, 0.78);
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-bottom: none;
  box-shadow:
    0 -22px 56px rgba(2, 6, 23, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.terminal-panel::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, rgba(45, 212, 191, 0) 0%, rgba(45, 212, 191, 0.85) 22%, rgba(139, 92, 246, 0.7) 62%, rgba(139, 92, 246, 0) 100%);
  pointer-events: none;
}

:global(html.light) .terminal-panel {
  background:
    radial-gradient(120% 90% at 12% 0%, rgba(20, 184, 166, 0.16) 0%, rgba(20, 184, 166, 0) 55%),
    radial-gradient(100% 80% at 92% 8%, rgba(139, 92, 246, 0.1) 0%, rgba(139, 92, 246, 0) 60%),
    rgba(248, 250, 252, 0.82);
  border-color: rgba(15, 23, 42, 0.1);
  box-shadow: 0 -18px 48px rgba(15, 23, 42, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

/* ── Drag handle ── */
.terminal-resize {
  position: relative;
  height: 8px;
  flex: 0 0 auto;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
}

.terminal-resize:hover {
  background: linear-gradient(to bottom, rgba(45, 212, 191, 0.18), transparent);
}

.resize-grip {
  width: 46px;
  height: 3px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.35);
  transition: background 0.16s ease, width 0.16s ease;
}

.terminal-resize:hover .resize-grip {
  width: 66px;
  background: rgba(45, 212, 191, 0.8);
}

/* ── Bar ── */
.terminal-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 7px 14px;
  flex: 0 0 auto;
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.04), transparent);
}

:global(html.light) .terminal-bar {
  border-bottom-color: rgba(15, 23, 42, 0.08);
  background: linear-gradient(to bottom, rgba(15, 23, 42, 0.03), transparent);
}

.terminal-lights {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.light {
  width: 10px;
  height: 10px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.45), 0 1px 3px rgba(0, 0, 0, 0.35);
  transition: transform 0.14s ease, filter 0.14s ease;
}

.light:hover {
  transform: scale(1.18);
  filter: brightness(1.15);
}

.light:active {
  transform: scale(0.94);
}

.light.red { background: radial-gradient(circle at 35% 30%, #fca5a5, #ef4444 70%); }
.light.amber { background: radial-gradient(circle at 35% 30%, #fde68a, #f59e0b 70%); }
.light.green { background: radial-gradient(circle at 35% 30%, #6ee7b7, #10b981 70%); transition: opacity 0.2s ease; }

.light.green.off {
  background: radial-gradient(circle at 35% 30%, #94a3b8, #475569 70%);
  opacity: 0.55;
}

.terminal-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  font-size: 12px;
  overflow: hidden;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #14b8a6;
  box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.55);
  animation: dotPulse 2.4s ease-out infinite;
  flex: 0 0 auto;
}

.status-dot.inactive {
  background: #64748b;
  animation: none;
  box-shadow: none;
}

@keyframes dotPulse {
  0% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.5); }
  70% { box-shadow: 0 0 0 7px rgba(20, 184, 166, 0); }
  100% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0); }
}

.status-label {
  color: #94a3b8;
  flex: 0 0 auto;
  font-weight: 600;
  letter-spacing: 0.02em;
}

:global(html.light) .status-label {
  color: #64748b;
}

.status-empty {
  color: #cbd5e1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

:global(html.light) .status-empty {
  color: #334155;
}

/* ── Environment tags ── */
.env-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
  border: 1px solid transparent;
  font-variant-numeric: tabular-nums;
}

.env-tag-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}

.env-tag.amber { color: #fbbf24; background: rgba(251, 191, 36, 0.14); border-color: rgba(251, 191, 36, 0.32); }
.env-tag.blue { color: #60a5fa; background: rgba(96, 165, 250, 0.14); border-color: rgba(96, 165, 250, 0.32); }
.env-tag.teal { color: #2dd4bf; background: rgba(45, 212, 191, 0.14); border-color: rgba(45, 212, 191, 0.32); }
.env-tag.rose { color: #fb7185; background: rgba(251, 113, 133, 0.14); border-color: rgba(251, 113, 133, 0.32); }
.env-tag.violet { color: #c084fc; background: rgba(192, 132, 252, 0.14); border-color: rgba(192, 132, 252, 0.32); }
.env-tag.green { color: #34d399; background: rgba(52, 211, 153, 0.14); border-color: rgba(52, 211, 153, 0.32); }
.env-tag.slate { color: #94a3b8; background: rgba(148, 163, 184, 0.14); border-color: rgba(148, 163, 184, 0.28); }

/* ── Meta / actions ── */
.terminal-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #64748b;
}

:global(html.light) .terminal-meta {
  color: #94a3b8;
}

.meta-sep {
  opacity: 0.6;
}

.terminal-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.bar-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(148, 163, 184, 0.1);
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease, border-color 0.15s ease;
}

.bar-btn:hover {
  background: rgba(20, 184, 166, 0.18);
  border-color: rgba(45, 212, 191, 0.45);
  color: #5eead4;
}

.bar-btn:active {
  transform: scale(0.96);
}

.bar-btn.close {
  padding: 4px 8px;
}

.bar-btn.close:hover {
  background: rgba(248, 113, 113, 0.2);
  border-color: rgba(248, 113, 113, 0.45);
  color: #fca5a5;
}

:global(html.light) .bar-btn {
  color: #334155;
  border-color: rgba(15, 23, 42, 0.12);
  background: rgba(15, 23, 42, 0.04);
}

:global(html.light) .bar-btn:hover {
  color: #0d9488;
  border-color: rgba(13, 148, 136, 0.35);
  background: rgba(13, 148, 136, 0.1);
}

/* ── Terminal surface ── */
.terminal-host {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  padding: 10px 12px 12px;
  overflow: hidden;
}

.terminal-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.05) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: radial-gradient(120% 100% at 50% 0%, rgba(0, 0, 0, 0.5), transparent 72%);
  -webkit-mask-image: radial-gradient(120% 100% at 50% 0%, rgba(0, 0, 0, 0.5), transparent 72%);
  opacity: 0.7;
}

.terminal-host :deep(.xterm) {
  position: relative;
  height: 100%;
}

.terminal-host :deep(.xterm-viewport) {
  background-color: transparent !important;
  scrollbar-width: thin;
}

.terminal-host :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 8px;
}

.terminal-host :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: rgba(148, 163, 184, 0.35);
  border-radius: 8px;
}

.terminal-slide-enter-active,
.terminal-slide-leave-active {
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}

.terminal-slide-enter-from,
.terminal-slide-leave-to {
  transform: translateY(26px);
  opacity: 0;
}

@media (max-width: 720px) {
  .terminal-meta {
    display: none;
  }
}
</style>
