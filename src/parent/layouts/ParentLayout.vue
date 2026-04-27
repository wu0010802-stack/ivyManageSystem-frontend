<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// 公開頁面（登入、綁定）不顯示 layout（無 header/tab bar）
const isPublic = computed(() => route.meta?.public === true)

const goBack = () => {
  if (window.history.length > 1) router.back()
  else router.replace('/home')
}
</script>

<template>
  <div class="parent-layout">
    <header v-if="!isPublic" class="parent-header">
      <span class="parent-header-title">{{ route.meta?.title || '常春藤家長' }}</span>
    </header>
    <main class="parent-main" :class="{ 'is-public': isPublic }">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.parent-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  width: 100%;
}

.parent-header {
  position: sticky;
  top: 0;
  z-index: 10;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #3f7d48;
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  padding-top: env(safe-area-inset-top, 0);
}

.parent-header-title {
  letter-spacing: 1px;
}

.parent-main {
  flex: 1;
  padding: 16px;
}

.parent-main.is-public {
  padding: 0;
}
</style>
