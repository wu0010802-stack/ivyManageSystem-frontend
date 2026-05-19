<script setup lang="ts">
/**
 * A2 公開頁 app shell。
 *
 * 不引入 admin layout / portal layout / parent layout — 只負責
 * 提供 router-view 與最低限度的容器樣式，讓 ActivityPublicView /
 * ActivityPublicQueryView 自己渲染完整頁面（既有設計）。
 */
</script>

<template>
  <div class="public-app">
    <router-view />
  </div>
</template>

<style scoped>
.public-app {
  min-height: 100vh;
}
</style>
