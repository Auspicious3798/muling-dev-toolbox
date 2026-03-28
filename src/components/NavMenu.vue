<template>
  <div class="nav-menu">
    <ul>
      <li @click="handleClick('jdk')" :class="{ active: active === 'jdk', disabled: isBusy }">
        ☕ JDK
      </li>
      <li @click="handleClick('python')" :class="{ active: active === 'python', disabled: isBusy }">
        🐍 Python
      </li>
      <li @click="handleClick('mysql')" :class="{ active: active === 'mysql', disabled: isBusy }">
        🗄️ MySQL
      </li>
    </ul>
  </div>
</template>

<script>
import eventBus from '@/eventBus';

export default {
  name: 'NavMenu',
  props: ['active'],
  data() {
    return {
      isBusy: false
    };
  },
  mounted() {
    eventBus.on('install:start', () => {
      this.isBusy = true;
    });
    eventBus.on('install:end', () => {
      this.isBusy = false;
    });
  },
  beforeUnmount() {
    eventBus.off('install:start');
    eventBus.off('install:end');
  },
  methods: {
    handleClick(menu) {
      if (this.isBusy) return;
      this.$emit('select', menu);
    }
  }
};
</script>

<style scoped>
.nav-menu {
  width: 200px;
  background: #1e2a3a;
  height: 100vh;
  color: white;
  padding: 20px 0;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

li {
  padding: 12px 20px;
  cursor: pointer;
  transition: background 0.2s;
}

li:hover:not(.disabled) {
  background: #2c3e50;
}

li.active {
  background: #2c7a4d;
  border-left: 4px solid #f5b042;
}

li.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
</style>