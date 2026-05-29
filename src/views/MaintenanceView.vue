<script setup lang="ts">
/**
 * 管理端維護中頁面。
 *
 * 觸發路徑：axios interceptor 偵測到 503 + detail.code === 'MAINTENANCE_MODE' 時
 * router.replace 到 /maintenance?message=<後端訊息>。
 *
 * 「重新整理」按鈕直接打 /health/ready 探測：
 *   - 200 → 重整頁面（讓 router 重新跑、初始化資料）
 *   - 非 200（仍 503）→ ElMessage warning 提示「仍在維護中」
 *
 * 注意：本 view 自己呼叫 /health/ready 時若仍 503，會走 interceptor 的 503 path。
 * Interceptor 內 `router.currentRoute.value.path === '/maintenance'` guard
 * 避免無窮 redirect（仍會走 displayMessage 設定）。
 */
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '@/api'

interface Props {
  message?: string
}
const props = withDefaults(defineProps<Props>(), {
  message: '系統維護中，請稍後再試',
})

const route = useRoute()
const displayMessage = computed(() => {
  const q = route.query?.message
  if (typeof q === 'string' && q.trim()) return q
  return props.message
})

const refreshing = ref(false)

async function tryRefresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    const r = await api.get('/health/ready')
    if (r.status === 200) {
      window.location.reload()
      return
    }
    ElMessage.warning('仍在維護中，請稍後再試')
  } catch {
    ElMessage.warning('仍在維護中，請稍後再試')
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <div class="maintenance-view">
    <div class="maintenance-card">
      <h1>系統維護中</h1>
      <p>{{ displayMessage }}</p>
      <button type="button" class="refresh-btn" :disabled="refreshing" @click="tryRefresh">
        {{ refreshing ? '檢查中…' : '重新整理' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.maintenance-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #f5f7fa;
  padding: 24px;
}
.maintenance-card {
  text-align: center;
  padding: 48px 40px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  max-width: 440px;
}
h1 {
  font-size: 1.75rem;
  margin: 0 0 16px;
  color: #303133;
}
p {
  color: #606266;
  margin: 0 0 24px;
  line-height: 1.6;
}
.refresh-btn {
  background: #409eff;
  color: white;
  border: none;
  padding: 10px 28px;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}
.refresh-btn:hover:not(:disabled) {
  background: #66b1ff;
}
.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
