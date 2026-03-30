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
      <span class="item-icon">{{ item.icon || '📁' }}</span>
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
  color: #cbd5e1;
  gap: 10px;
}

.menu-item:hover {
  background-color: #2d3e4e;
  color: white;
}

.menu-item.active {
  background-color: #2c7a4d;
  color: white;
  border-left: 3px solid #f5b042;
}

.menu-item.has-children {
  font-weight: 500;
}

.item-icon {
  width: 24px;
  font-size: 1.1rem;
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