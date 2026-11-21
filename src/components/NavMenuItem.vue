<template>
  <div class="nav-menu-item">
    <div
        class="menu-item"
        :class="{
        active: isActive,
        'has-children': hasChildren,
        expanded: expanded
      }"
        @click="toggleOrSelect"
    >
      <span class="item-icon">
        <img
            v-if="isImageIcon"
            :src="item.icon"
            class="nav-icon"
            alt=""
        />
        <span v-else class="nav-icon-fallback">{{ item.icon || '' }}</span>
      </span>
      <span class="item-label">{{ item.label }}</span>
      <span v-if="item.badge" class="item-badge">{{ item.badge }}</span>
      <span v-if="hasChildren" class="item-arrow">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 6 15 12 9 18"></polyline>
        </svg>
      </span>
    </div>
    <div v-if="hasChildren" class="children-wrap" :class="{ open: expanded }">
      <div class="children-inner">
        <div class="children">
          <NavMenuItem
              v-for="child in item.children"
              :key="child.id"
              :item="child"
              :active-id="activeId"
              @select="handleChildSelect"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'NavMenuItem',
  props: {
    item: { type: Object, required: true },
    activeId: { type: String, default: '' }
  },
  data() {
    return { expanded: false };
  },
  computed: {
    hasChildren() {
      return this.item.children && this.item.children.length > 0;
    },
    isActive() {
      return this.item.id === this.activeId;
    },
    isImageIcon() {
      const icon = this.item.icon;
      if (!icon) return false;
      if (typeof icon === 'string') {
        return icon.endsWith('.svg') || icon.endsWith('.png') || icon.startsWith('data:image') || icon.startsWith('/src/') || icon.startsWith('@/');
      }
      return false;
    }
  },
  watch: {
    activeId: {
      immediate: true,
      handler(newId) {
        if (this.hasChildren) {
          const childActive = this.item.children.some(child => child.id === newId);
          if (childActive && !this.expanded) {
            this.expanded = true;
          }
        }
      }
    }
  },
  methods: {
    toggleOrSelect() {
      if (this.hasChildren) {
        this.expanded = !this.expanded;
      } else {
        this.$emit('select', this.item.id);
      }
    },
    handleChildSelect(id) {
      this.$emit('select', id);
    }
  }
};
</script>

<style scoped>
.nav-menu-item {
  width: 100%;
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 9px 12px;
  margin: 2px 0;
  cursor: pointer;
  transition:
    background-color var(--transition-fast),
    color var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
  color: var(--text-nav);
  gap: 10px;
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  position: relative;
  overflow: hidden;
}

.menu-item:hover {
  background-color: color-mix(in srgb, var(--text-nav-hover) 8%, transparent);
  color: var(--text-nav-hover);
}

.menu-item:active {
  transform: scale(0.98);
}

.menu-item.active {
  background: linear-gradient(135deg, rgba(13, 148, 136, 0.22), rgba(13, 148, 136, 0.1));
  color: var(--nav-active-fg);
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.menu-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 60%;
  background: var(--primary);
  border-radius: 0 3px 3px 0;
  transform: translateY(-50%) scaleY(0);
  transform-origin: center;
  opacity: 0;
  transition: transform var(--transition-normal), opacity var(--transition-fast);
}

.menu-item.active::before {
  transform: translateY(-50%) scaleY(1);
  opacity: 1;
}

.menu-item.has-children {
  font-weight: 500;
  color: var(--text-nav);
}

.item-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-icon {
  width: 20px;
  height: 20px;
  display: block;
  object-fit: contain;
  opacity: 0.85;
  transition: transform var(--transition-normal), opacity var(--transition-normal);
}

.menu-item:hover .nav-icon {
  transform: scale(1.08);
  opacity: 1;
}

.menu-item.active .nav-icon {
  opacity: 1;
}

.nav-icon-fallback {
  font-size: 1rem;
  transition: transform var(--transition-normal);
}

.menu-item:hover .nav-icon-fallback {
  transform: scale(1.12);
}

.item-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: transform var(--transition-normal);
}

.menu-item:hover .item-label {
  transform: translateX(2px);
}

.item-badge {
  flex-shrink: 0;
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--text-nav-hover) 14%, transparent);
  color: var(--text-nav-muted);
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.7;
  text-align: center;
}

.item-arrow {
  display: flex;
  align-items: center;
  color: var(--text-nav-muted);
  transition: color var(--transition-fast), transform var(--transition-normal);
  flex-shrink: 0;
}

.item-arrow svg {
  transform: rotate(0deg);
  transition: transform var(--transition-normal);
}

.menu-item.expanded .item-arrow svg {
  transform: rotate(90deg);
}

.menu-item:hover .item-arrow {
  color: var(--text-nav);
}

.children-wrap {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition:
    grid-template-rows var(--transition-normal),
    opacity var(--transition-fast);
}

.children-wrap.open {
  grid-template-rows: 1fr;
  opacity: 1;
}

.children-inner {
  overflow: hidden;
  min-height: 0;
}

.children {
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid color-mix(in srgb, var(--text-nav-hover) 12%, transparent);
}
</style>
