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
/* 家長 app 角色 brand：綠色（與公開報名/校園識別一致） */
:root {
  --brand-primary: #3f7d48;
  --brand-primary-hover: #336440;
  --brand-primary-soft: #e7f3e9;
}

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
