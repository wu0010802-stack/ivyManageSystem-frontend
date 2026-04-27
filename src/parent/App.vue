<script setup>
import { onMounted } from 'vue'
import ParentLayout from './layouts/ParentLayout.vue'
</script>

<template>
  <ParentLayout>
    <router-view />
  </ParentLayout>
</template>

<style>
/* App 級 reset，避免 LIFF webview 的預設 padding */
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  background: #f4f6f5;
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  color: #2c3e50;
}

* {
  box-sizing: border-box;
}
</style>
