import { reactive } from 'vue';

const LABELS = {
  jdk: 'JDK',
  python: 'Python',
  mysql: 'MySQL',
  redis: 'Redis',
  maven: 'Maven',
  gradle: 'Gradle',
  uv: 'uv',
  nodejs: 'Node.js',
  nginx: 'Nginx',
};

export function toolLabel(tool) {
  return LABELS[tool] || String(tool || '').toUpperCase();
}

/**
 * 全局安装任务状态。
 * 抽屉关掉、甚至安装组件被卸载，这里的进度都不会丢：
 * 主进程的进度事件统一由 App 订阅后写进来。
 */
export const taskCenter = reactive({
  active: null,
});

export function startTask(tool) {
  taskCenter.active = {
    tool,
    label: toolLabel(tool),
    status: 'running',
    percent: 0,
    stage: '准备安装…',
    speed: 0,
    eta: null,
    startedAt: Date.now(),
    finishedAt: 0,
    message: '',
  };
  return taskCenter.active;
}

export function updateTask(tool, patch) {
  const active = taskCenter.active;
  if (!active || active.tool !== tool || active.status !== 'running') return;
  if (patch && typeof patch.percent === 'number') active.percent = Math.max(0, Math.min(100, patch.percent));
  if (patch && patch.stage) active.stage = patch.stage;
  if (patch && typeof patch.speed === 'number') active.speed = patch.speed;
  if (patch && patch.eta !== undefined) active.eta = patch.eta;
}

export function finishTask(status = 'done', message = '') {
  const active = taskCenter.active;
  if (!active || active.status !== 'running') return;
  active.status = status;
  active.message = message;
  active.finishedAt = Date.now();
  if (status === 'done') active.percent = 100;
}

export function clearTask() {
  taskCenter.active = null;
}

export function isRunning() {
  return !!(taskCenter.active && taskCenter.active.status === 'running');
}
