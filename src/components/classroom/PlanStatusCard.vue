<script setup lang="ts">
// 「新學年預編班」準備狀態卡：掛在 ClassroomView 工具列下方，mount 時打
// GET /classroom-year-plans/status 顯示五態（none/draft/published/applied）＋
// apply_overdue 疊加 warning 樣式。純顯示 + 導頁，不做任何寫入（草稿隔離鐵律）。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getClassroomYearPlanStatus } from '@/api/classroomYearPlan'
import { hasPermission } from '@/utils/auth'
import { formatDateTimeTW } from '@/utils/format'
import { apiError } from '@/utils/error'
import type { Schema } from '@/api/_generated/typed'

type StatusOut = Schema<'StatusOut'>

const router = useRouter()
const canWrite = computed(() => hasPermission('CLASSROOMS_WRITE'))

const loading = ref(true)
const loadError = ref('')
const status = ref<StatusOut | null>(null)

const state = computed(() => status.value?.state ?? 'none')
const applyOverdue = computed(() => status.value?.apply_overdue ?? false)
const blockingCount = computed(() => status.value?.blocking_count ?? 0)

// 樣式：讀取失敗用 error；排程套用逾期用 warning 蓋過其他狀態；applied 用 success；
// draft 有待處理問題時用 warning；其餘（none / 無問題的 draft）用 info。
const alertType = computed<'info' | 'warning' | 'success' | 'error'>(() => {
  if (loadError.value) return 'error'
  if (applyOverdue.value) return 'warning'
  if (state.value === 'applied') return 'success'
  if (state.value === 'draft' && blockingCount.value > 0) return 'warning'
  return 'info'
})

const displayMessage = computed(() => {
  if (loadError.value) return loadError.value
  if (applyOverdue.value) return '計畫尚未套用，排程器重試中'
  switch (state.value) {
    case 'draft':
      return `草稿編輯中，尚有 ${blockingCount.value} 項問題`
    case 'published':
      return '已確認，等待學年切換（預計 8/1 套用）'
    case 'applied':
      return `已於 ${formatDateTimeTW(status.value?.applied_at)} 套用`
    case 'none':
    default:
      return '尚未產生新學年草稿'
  }
})

// none 態且有寫入權限時，連結文案改為更直接的行動呼籲；其餘情況（含唯讀使用者）
// 一律顯示通用導頁文案——同一個連結、同一個目的地，只是文案依情境調整。
const linkLabel = computed(() => (
  state.value === 'none' && canWrite.value ? '前往建立' : '前往新學年預編班'
))

const goWorkspace = () => {
  router.push('/students/year-plan')
}

const load = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const response = await getClassroomYearPlanStatus()
    status.value = response.data
  } catch (error) {
    loadError.value = apiError(error, '載入新學年準備狀態失敗')
  } finally {
    loading.value = false
  }
}

onMounted(load)

defineExpose({ reload: load })
</script>

<template>
  <el-card v-loading="loading" class="plan-status-card" shadow="never">
    <div class="plan-status-card__body">
      <el-alert
        v-if="!loading"
        class="plan-status-card__alert"
        :type="alertType"
        :title="displayMessage"
        :closable="false"
        show-icon
      />
      <div class="plan-status-card__actions">
        <el-link type="primary" :underline="false" @click="goWorkspace">
          {{ linkLabel }}
        </el-link>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.plan-status-card {
  margin-bottom: var(--space-5);
}

.plan-status-card__body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

.plan-status-card__alert {
  flex: 1 1 auto;
  min-width: 240px;
}

.plan-status-card__actions {
  flex-shrink: 0;
}
</style>
