<template>
  <WebDbConsole kind="redis" />
</template>

<script>
import WebDbConsole from './WebDbConsole.vue';

export default {
  name: 'WebRedisPlugin',
  components: { WebDbConsole }
};
</script>
