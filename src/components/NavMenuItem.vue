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
        <span v-else>{{ item.icon || '📁' }}</span>
      </span>
      <span class="item-label">{{ item.label }}</span>
      <span v-if="hasChildren" class="item-arrow">{{ expanded ? '▼' : '▶' }}</span>
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
    item: {
      type: Object,
      required: true
    },
    activeId: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      expanded: false
    };
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
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-nav);
  gap: 10px;
}

.menu-item:hover {
  background-color: var(--bg-hover);
  color: var(--text-nav-hover);
}

.menu-item.active {
  background-color: var(--primary);
  color: white;
  border-left: 3px solid var(--accent);
}

.menu-item.has-children {
  font-weight: 500;
}

.item-icon {
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-icon {
  width: 20px;
  height: 20px;
  display: block;
  object-fit: contain;
}

.item-label {
  flex: 1;
  font-size: 0.9rem;
}

.item-arrow {
  font-size: 0.7rem;
  transition: transform 0.2s;
}

.children {
  margin-left: 20px;
}
</style>