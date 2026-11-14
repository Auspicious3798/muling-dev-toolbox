<template>
  <div class="lemon-toast-stack">
    <TransitionGroup name="lemon-toast">
      <div
          v-for="toast in toasts"
          :key="toast.id"
          class="lemon-toast"
          :class="[`is-${toast.type}`, { 'is-leaving': toast.leaving }]"
          @click="Lemon.dismiss(toast.id)"
      >
        <div class="lemon-avatar">
          <img :src="avatarOf(toast.type)" alt="小柠"/>
        </div>
        <div class="lemon-body-text">
          <p class="lemon-title">{{ titles[toast.type] }}</p>
          <p class="lemon-text">{{ toast.text }}</p>
        </div>
        <span class="lemon-close" @click.stop="Lemon.dismiss(toast.id)">×</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script>
import Lemon, { toasts } from '@/utils/lemon';

export default {
  name: 'LemonToast',
  data() {
    return {
      Lemon,
      toasts,
      titles: {
        success: '搞定啦',
        error: '哎呀',
        info: '小柠提示',
      },
      avatars: {
        success: '/art/face-cheer-disc.png',
        error: '/art/face-sorry-disc.png',
        info: '/art/face-think-disc.png',
      },
      fallbackAvatar: '/art/xiaoning-portrait-disc.png',
    };
  },
  methods: {
    avatarOf(type) {
      return this.avatars[type] || this.fallbackAvatar;
    },
  },
};
</script>

<style scoped>
.lemon-toast-stack {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 900;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}

.lemon-toast {
  pointer-events: auto;
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 11px;
  width: min(378px, calc(100vw - 44px));
  padding: 12px 14px 12px 12px;
  border-radius: 16px;
  background-color: var(--glass-tint-strong);
  -webkit-backdrop-filter: blur(26px) saturate(170%);
  backdrop-filter: blur(26px) saturate(170%);
  border: 1px solid var(--glass-stroke);
  box-shadow:
    var(--glass-shadow-float),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
  cursor: pointer;
  overflow: hidden;
}

.lemon-toast::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  border-radius: 16px 0 0 16px;
  background: var(--toast-accent, var(--primary));
  opacity: 0.9;
}

.lemon-toast.is-success { --toast-accent: #10b981; }
.lemon-toast.is-error { --toast-accent: #f43f5e; }
.lemon-toast.is-info { --toast-accent: #0ea5e9; }

.lemon-avatar {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 2px solid color-mix(in srgb, var(--toast-accent) 55%, rgba(255, 255, 255, 0.4));
  box-shadow: 0 6px 16px color-mix(in srgb, var(--toast-accent) 34%, transparent);
  background: rgba(255, 255, 255, 0.12);
}

.lemon-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.lemon-body-text {
  flex: 1;
  min-width: 0;
  padding-top: 1px;
}

.lemon-title {
  margin: 0 0 2px;
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.2px;
  color: var(--toast-accent);
}

.lemon-text {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-primary);
  word-break: break-word;
}

.lemon-close {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  line-height: 16px;
  text-align: center;
  border-radius: 50%;
  font-size: 0.9rem;
  color: var(--text-muted);
  opacity: 0;
  transition: opacity var(--transition-fast), background-color var(--transition-fast);
}

.lemon-toast:hover .lemon-close {
  opacity: 1;
}

.lemon-close:hover {
  background-color: color-mix(in srgb, var(--text-primary) 10%, transparent);
  color: var(--text-primary);
}

.lemon-toast-enter-from,
.lemon-toast-leave-to {
  opacity: 0;
  transform: translateX(26px) scale(0.96);
}

.lemon-toast-enter-active {
  transition: opacity 220ms ease, transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.lemon-toast-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
  position: absolute;
  right: 0;
}

.lemon-toast-move {
  transition: transform 240ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .lemon-toast-enter-active,
  .lemon-toast-leave-active,
  .lemon-toast-move {
    transition: opacity 120ms linear;
  }

  .lemon-toast-enter-from,
  .lemon-toast-leave-to {
    transform: none;
  }
}
</style>
