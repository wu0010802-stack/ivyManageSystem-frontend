<script setup lang="ts">
// 「新學年預編班」準備狀態橫幅：掛在 ClassroomView 統計列下方，mount 時打
// GET /classroom-year-plans/status 顯示五態（none/draft/published/applied）＋
// apply_overdue 疊加 warning 樣式。純顯示 + 導頁，不做任何寫入（草稿隔離鐵律）。
// 2026-08-24 改版：由 el-card + el-alert 收斂為單列輕量橫幅（一行講清楚狀態，
// 主動作只留導頁連結），狀態語意（info/warning/success/error）沿用不變。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Calendar } from '@element-plus/icons-vue'
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
const warningCount = computed(() => status.value?.warning_count ?? 0)

// 樣式：讀取失敗用 error；排程套用逾期用 warning 蓋過其他狀態；applied 用 success；
// draft 有待處理問題時用 warning；其餘（none / 無問題的 draft）用 info。
const alertType = computed<'info' | 'warning' | 'success' | 'error'>(() => {
  if (loadError.value) return 'error'
  if (applyOverdue.value) return 'warning'
  if (state.value === 'applied') return 'success'
  if (state.value === 'draft' && blockingCount.value > 0) return 'warning'
  return 'info'
})

// 橫幅標題：帶目標學年，一眼知道在準備哪一年
const bannerTitle = computed(() => {
  const year = status.value?.target_school_year
  return year ? `新學年預編班（${year} 學年）` : '新學年預編班'
})

const displayMessage = computed(() => {
  if (loadError.value) return loadError.value
  if (applyOverdue.value) return '計畫尚未套用，排程器重試中'
  switch (state.value) {
    case 'draft': {
      if (blockingCount.value > 0) {
        const base = `草稿編輯中，尚有 ${blockingCount.value} 項問題`
        return warningCount.value > 0 ? `${base}（另 ${warningCount.value} 項提醒）` : base
      }
      if (warningCount.value > 0) return `草稿編輯中，有 ${warningCount.value} 項提醒`
      return '草稿編輯中'
    }
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
  state.value === 'none' && canWrite.value ? '前往建立' : '前往預編班'
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
</script>

<template>
  <div
    v-loading="loading"
    class="plan-banner"
    :class="`plan-banner--${alertType}`"
    role="status"
  >
    <el-icon class="plan-banner__icon" aria-hidden="true"><Calendar /></el-icon>
    <p v-if="!loading" class="plan-banner__text">
      <strong>{{ bannerTitle }}</strong>
      <span class="plan-banner__message">{{ displayMessage }}</span>
    </p>
    <el-button
      class="plan-banner__link"
      link
      @click="goWorkspace"
    >
      {{ linkLabel }}
      <el-icon><ArrowRight /></el-icon>
    </el-button>
  </div>
</template>

<style scoped>
.plan-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 10px 16px;
  margin-bottom: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  min-height: 44px;
}

.plan-banner__icon {
  flex-shrink: 0;
}

.plan-banner__text {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-size: var(--text-sm);
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.plan-banner__message {
  color: var(--text-secondary);
}

.plan-banner__link {
  flex-shrink: 0;
  font-weight: 600;
}

/* 狀態語意：沿用 Element Plus 語意色的 soft 底＋darker 文字（AA 對比） */
.plan-banner--info {
  background: var(--el-color-info-light-9);
  border-color: var(--el-color-info-light-7);
}
.plan-banner--info .plan-banner__icon,
.plan-banner--info strong {
  color: var(--color-info-darker);
}

.plan-banner--warning {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-7);
}
.plan-banner--warning .plan-banner__icon,
.plan-banner--warning strong {
  color: var(--color-warning-darker);
}
.plan-banner--warning .plan-banner__message {
  color: var(--color-warning-darker);
}

.plan-banner--success {
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-7);
}
.plan-banner--success .plan-banner__icon,
.plan-banner--success strong {
  color: var(--color-success-darker);
}

.plan-banner--error {
  background: var(--el-color-danger-light-9);
  border-color: var(--el-color-danger-light-7);
}
.plan-banner--error .plan-banner__icon,
.plan-banner--error strong,
.plan-banner--error .plan-banner__message {
  color: var(--color-danger-darker);
}

@media (--to-sm) {
  .plan-banner__link {
    min-height: var(--touch-target-min);
  }
}
</style>
