<template>
  <WebDbConsole kind="mysql" />
</template>

<script>
import WebDbConsole from './WebDbConsole.vue';

export default {
  name: 'WebMysqlPlugin',
  components: { WebDbConsole }
};
</script>
