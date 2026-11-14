import { ref } from 'vue';

/**
 * 沙箱根目录：%LOCALAPPDATA%\Muling\env
 * 由主进程提供，前端只读缓存，避免每个安装器都单独请求。
 */
export const sandboxRoot = ref('');

let loading = null;

export function loadSandboxRoot() {
  if (sandboxRoot.value) return Promise.resolve(sandboxRoot.value);
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await window.electronAPI?.getSandboxInfo?.();
      if (res && res.success && res.data) sandboxRoot.value = res.data.root;
    } catch (err) {
      // 主进程不可用时保持占位文案
    }
    loading = null;
    return sandboxRoot.value;
  })();
  return loading;
}

/** 拼一个工具的沙箱安装路径，例如 sandboxPath('jdk','17.0.18') */
export function sandboxPath(tool, version) {
  const root = sandboxRoot.value || '%LOCALAPPDATA%\\Muling\\env';
  const dir = version ? `${tool}\\${tool}-${version}` : tool;
  return `${root}\\${dir}`;
}
