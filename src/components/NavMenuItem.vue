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
      <span v-if="hasChildren" class="item-arrow">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline :points="expanded ? '6 15 12 9 18 15' : '9 6 15 12 9 18'"></polyline>
        </svg>
      </span>
    </div>
    <div v-if="hasChildren && expanded" class="children">
      <NavMenuItem
          v-for="child in item.children"
          :key="child.id"
          :item="child"
          :active-id="activeId"
          @select="handleChildSelect"
      />
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
  transition: all var(--transition-fast);
  color: var(--text-nav);
  gap: 10px;
  border-radius: var(--radius-md);
  font-size: 0.88rem;
  position: relative;
}

.menu-item:hover {
  background-color: rgba(255, 255, 255, 0.06);
  color: var(--text-nav-hover);
}

.menu-item.active {
  background: linear-gradient(135deg, rgba(13, 148, 136, 0.2), rgba(13, 148, 136, 0.1));
  color: #5eead4;
  font-weight: 600;
}

.menu-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 60%;
  background: var(--primary);
  border-radius: 0 3px 3px 0;
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
}

.menu-item.active .nav-icon {
  opacity: 1;
}

.nav-icon-fallback {
  font-size: 1rem;
}

.item-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-arrow {
  display: flex;
  align-items: center;
  color: var(--text-nav-muted);
  transition: color var(--transition-fast);
  flex-shrink: 0;
}

.menu-item:hover .item-arrow {
  color: var(--text-nav);
}

.children {
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}
</style>
