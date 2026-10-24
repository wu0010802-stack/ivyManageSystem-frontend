<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { countPending, OP_KINDS } from '@/utils/offlineQueue'
import { getUserInfo } from '@/utils/auth'
import { WarningFilled } from '@element-plus/icons-vue'

const pendingCount = ref<number>(0)

// 只計算「當前登入者」的待同步數，避免共享平板把其他老師的 pending 一起算進來（P2-5）。
const refreshPendingCount = async () => {
  const uid = (getUserInfo()?.id as string | number | undefined) ?? null
  if (uid == null) {
    pendingCount.value = 0
    return
  }
  pendingCount.value = await countPending(OP_KINDS.CLASS_ATTENDANCE, uid)
}

const { isOnline } = useOnlineStatus(async () => {
  // 重新連線時更新一下 badge，實際同步由點名頁自行觸發
  await refreshPendingCount()
})

onMounted(refreshPendingCount)
</script>

<template>
  <div v-if="!isOnline" class="offline-banner">
    <el-icon class="offline-banner__icon" aria-hidden="true"><WarningFilled /></el-icon>
    <span>您目前離線，顯示最近快取的資料；寫入操作會暫存於本機，連線後自動同步</span>
    <span v-if="pendingCount > 0" class="pending-chip">待同步 {{ pendingCount }} 筆</span>
  </div>
</template>

<style scoped>
.offline-banner {
  background: var(--color-warning-soft);
  border-bottom: 1px solid var(--color-warning);
  color: var(--color-warning-darker);
  font-size: 13px;
  padding: 8px 16px;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}
.offline-banner__icon {
  flex-shrink: 0;
}

.pending-chip {
  display: inline-block;
  margin-left: 10px;
  padding: 2px 8px;
  border-radius: 9999px;
  background: var(--color-warning);
  color: var(--el-color-white, #fff);
  font-size: 12px;
  font-weight: 600;
}
</style>
