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
/* 家長 app brand 與全域樣式由 src/parent/styles/globals.css 提供。
   這裡只放 webview 必要的 reset。 */
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  background: var(--pt-surface-app, #f4f6f5);
}

#app {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang TC', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  color: var(--pt-text-strong, #2c3e50);
}

* {
  box-sizing: border-box;
}
</style>
