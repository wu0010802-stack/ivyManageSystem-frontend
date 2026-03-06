<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const isOffline = ref(!navigator.onLine)

const onOnline = () => { isOffline.value = false }
const onOffline = () => { isOffline.value = true }

onMounted(() => {
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
})

onUnmounted(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
})
</script>

<template>
  <div v-if="isOffline" class="offline-banner">
    ⚠️ 您目前離線，顯示最近快取資料
  </div>
</template>

<style scoped>
.offline-banner {
  background: #fef3c7;
  border-bottom: 1px solid #fcd34d;
  color: #92400e;
  font-size: 13px;
  padding: 8px 16px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
}
</style>
