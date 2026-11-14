import { reactive } from 'vue';

const DEFAULT_DURATION = 3600;
const MAX_VISIBLE = 4;
const LEAVE_DURATION = 240;

export const toasts = reactive([]);

let seq = 0;
const timers = new Map();

function clearTimer(id) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

function dismiss(id) {
  const target = toasts.find((item) => item.id === id);
  if (!target || target.leaving) return;
  target.leaving = true;
  clearTimer(id);
  setTimeout(() => {
    const index = toasts.findIndex((item) => item.id === id);
    if (index > -1) toasts.splice(index, 1);
  }, LEAVE_DURATION);
}

function show(options) {
  const config = typeof options === 'string' ? { text: options } : (options || {});
  const text = config.text == null ? '' : String(config.text).trim();
  if (!text) return null;

  const type = ['success', 'error', 'info'].includes(config.type) ? config.type : 'info';
  const id = ++seq;

  toasts.push({ id, type, text, leaving: false });

  while (toasts.length > MAX_VISIBLE) {
    const oldest = toasts.find((item) => !item.leaving);
    if (!oldest) break;
    dismiss(oldest.id);
  }

  const duration = Number.isFinite(config.duration) ? config.duration : DEFAULT_DURATION;
  if (duration > 0) {
    timers.set(id, setTimeout(() => dismiss(id), duration));
  }

  return id;
}

function clear() {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  toasts.splice(0, toasts.length);
}

const Lemon = {
  show,
  success: (text, options) => show({ ...(options || {}), type: 'success', text }),
  error: (text, options) => show({ ...(options || {}), type: 'error', text }),
  info: (text, options) => show({ ...(options || {}), type: 'info', text }),
  dismiss,
  clear,
};

export default Lemon;
