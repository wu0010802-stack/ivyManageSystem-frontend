<script setup>
import { ref, onMounted } from 'vue'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { countPending, OP_KINDS } from '@/utils/offlineQueue'

const { isOnline } = useOnlineStatus(async () => {
  // 重新連線時更新一下 badge，實際同步由點名頁自行觸發
  pendingCount.value = await countPending(OP_KINDS.CLASS_ATTENDANCE)
})

const pendingCount = ref(0)

onMounted(async () => {
  pendingCount.value = await countPending(OP_KINDS.CLASS_ATTENDANCE)
})
</script>

<template>
  <div v-if="!isOnline" class="offline-banner">
    ⚠️ 您目前離線，顯示最近快取的資料；寫入操作會暫存於本機，連線後自動同步
    <span v-if="pendingCount > 0" class="pending-chip">待同步 {{ pendingCount }} 筆</span>
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

.pending-chip {
  display: inline-block;
  margin-left: 10px;
  padding: 2px 8px;
  border-radius: 9999px;
  background: #f59e0b;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}
</style>
