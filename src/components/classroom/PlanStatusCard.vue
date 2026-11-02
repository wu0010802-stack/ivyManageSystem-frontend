<script setup lang="ts">
// 「新學年預編班」準備狀態橫幅：掛在 ClassroomView 統計列下方，mount 時打
// GET /classroom-year-plans/status 顯示五態（none/draft/published/applied）＋
// apply_overdue 疊加 warning 樣式。純顯示 + 導頁，不做任何寫入（草稿隔離鐵律）。
// 2026-08-24 改版：由 el-card + el-alert 收斂為單列輕量橫幅（一行講清楚狀態，
// 主動作只留導頁連結），狀態語意（info/warning/success/error）沿用不變。
// 2026-10-29（後台 IA 重整 S4）再收斂：橫幅是預編班的唯一入口所以保留在班級頁，但視覺重量降到
// 一般資訊列——桌機固定單行（訊息過長以刪節號收尾，全文放 title），間距與最小高度縮小；手機仍允許換行。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, Calendar } from '@element-plus/icons-vue'
import { getClassroomYearPlanStatus } from '@/api/classroomYearPlan'
import { hasPermission } from '@/utils/auth'
import { formatDateTimeTW, todayTaipeiISO } from '@/utils/format'
import { apiError } from '@/utils/error'
import type { Schema } from '@/api/_generated/typed'
import {
  daysBetweenISO,
  formatPlanDate,
  retainRiskPhase,
} from '@/components/enrollment/planning/planHelpers'

type StatusOut = Schema<'StatusOut'>

const router = useRouter()
const canWrite = computed(() => hasPermission('CLASSROOMS_WRITE'))

const loading = ref(true)
const loadError = ref('')
const status = ref<StatusOut | null>(null)
// 台北今天：算發布截止、畢業日倒數、是否已進入準備期
const today = todayTaipeiISO()

const state = computed(() => status.value?.state ?? 'none')
const applyOverdue = computed(() => status.value?.apply_overdue ?? false)
const blockingCount = computed(() => status.value?.blocking_count ?? 0)
const warningCount = computed(() => status.value?.warning_count ?? 0)
// 補救模式：目前已是目標學年上學期，發布後排程下一輪（約一小時內）就套用
const appliesImmediately = computed(() => status.value?.applies_immediately === true)
// 排程（自動產生／套用）未啟用時不能寫「自動套用」；欄位缺省（舊後端）視為啟用
const schedulerEnabled = computed(() => status.value?.scheduler_enabled !== false)
const applyFailure = computed(() => status.value?.apply_failure ?? null)
const beforePrep = computed(() => {
  const prep = status.value?.prep_start_date
  return state.value === 'none' && !appliesImmediately.value && !!prep && today < prep
})

// 已發布卻不會（順利）套用的三種情況：一律 error，這是使用者最容易誤以為沒事的狀態
const publishedProblem = computed<string | null>(() => {
  if (state.value !== 'published') return null
  if (!schedulerEnabled.value) return '已發布，但自動套用未啟用：請聯絡系統管理員開啟，否則不會套用'
  if (applyFailure.value) return `已發布，但套用失敗：${applyFailure.value}`
  if (blockingCount.value > 0) return `已發布但有 ${blockingCount.value} 項阻擋，套用會失敗`
  return null
})

// 草稿的畢業年級留級生：畢業日前 14 天內（含補跑期）提醒要先發布
const RETAIN_WARN_DAYS = 14
const retainNote = computed<{ text: string; urgent: boolean } | null>(() => {
  const st = status.value
  if (!st || state.value !== 'draft' || (st.retain_pending_count ?? 0) <= 0) return null
  // 自動畢業沒開：沒有畢業日風險，只提醒要在套用前發布
  if (st.auto_graduation_enabled === false) {
    return { text: `有 ${st.retain_pending_count} 位畢業年級留級生，留級要在套用前發布才會生效`, urgent: false }
  }
  const phase = retainRiskPhase(today, st.graduation_date)
  if (phase === 'before' && st.graduation_date) {
    return {
      text: `有 ${st.retain_pending_count} 位畢業年級留級生須在 ${formatPlanDate(st.graduation_date)} 前發布`,
      urgent: daysBetweenISO(today, st.graduation_date) <= RETAIN_WARN_DAYS,
    }
  }
  if (phase === 'catchup') {
    return { text: `已過畢業日，${st.retain_pending_count} 位留級生仍可能被自動畢業，請盡快發布`, urgent: true }
  }
  return null
})

// 樣式：讀取失敗與「已發布卻不會套用」用 error；逾期 warning；applied success；
// draft 有阻擋、補救模式或留級生快到畢業日用 warning；其餘 info。
const alertType = computed<'info' | 'warning' | 'success' | 'error'>(() => {
  if (loadError.value) return 'error'
  if (publishedProblem.value) return 'error'
  if (applyOverdue.value) return 'warning'
  if (state.value === 'applied') return 'success'
  if (state.value === 'draft' && (blockingCount.value > 0 || appliesImmediately.value || retainNote.value?.urgent)) {
    return 'warning'
  }
  return 'info'
})

// 橫幅標題：帶目標學年，一眼知道在準備哪一年
const bannerTitle = computed(() => {
  const year = status.value?.target_school_year
  return year ? `新學年預編班（${year} 學年）` : '新學年預編班'
})

function draftMessage(): string {
  let base = '草稿編輯中'
  if (blockingCount.value > 0) {
    base = `草稿編輯中，有 ${blockingCount.value} 項阻擋`
    if (warningCount.value > 0) base += `（另 ${warningCount.value} 項提醒）`
  } else if (warningCount.value > 0) {
    base = `草稿編輯中，有 ${warningCount.value} 項提醒`
  }
  if (retainNote.value) return `${base}；${retainNote.value.text}`
  if (!schedulerEnabled.value) return `${base}；自動套用未啟用`
  if (appliesImmediately.value) return `${base}；已開學，發布後約一小時內套用`
  const apply = formatPlanDate(status.value?.apply_date)
  return apply ? `${base}；請在 ${apply} 前發布` : base
}

const displayMessage = computed(() => {
  if (loadError.value) return loadError.value
  if (publishedProblem.value) return publishedProblem.value
  if (applyOverdue.value) return '已發布但尚未套用，排程器重試中'
  switch (state.value) {
    case 'draft':
      return draftMessage()
    case 'published': {
      if (appliesImmediately.value) return '已發布，約一小時內套用'
      const date = formatPlanDate(status.value?.apply_date)
      return date ? `已發布，將於 ${date} 自動套用` : '已發布，等待學年切換後自動套用'
    }
    case 'applied':
      return `已於 ${formatDateTimeTW(status.value?.applied_at)} 套用`
    case 'none':
    default:
      if (beforePrep.value) {
        return `尚未產生新學年草稿，${formatPlanDate(status.value?.prep_start_date)} 起進入準備期`
      }
      return '尚未產生新學年草稿'
  }
})

// 已發布但有阻擋或套用失敗：連結改「前往處理」；none 態且已進入準備期、有寫入權限：「前往建立」；
// 其餘（含唯讀、準備期前）一律通用文案——同一個連結、同一個目的地。
const linkLabel = computed(() => {
  if (state.value === 'published' && (blockingCount.value > 0 || applyFailure.value)) return '前往處理'
  if (state.value === 'none' && canWrite.value && !beforePrep.value) return '前往建立'
  return '前往預編班'
})

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
    <p v-if="!loading" class="plan-banner__text" :title="`${bannerTitle}　${displayMessage}`">
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
  gap: var(--space-2);
  padding: 6px 12px;
  margin-bottom: var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  min-height: 36px;
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
  /* 桌機固定單行：標題不縮、訊息吃剩餘寬度並以刪節號收尾（全文在 title） */
  flex-wrap: nowrap;
  overflow: hidden;
}

.plan-banner__text strong {
  flex-shrink: 0;
  white-space: nowrap;
}

.plan-banner__message {
  color: var(--text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  .plan-banner {
    min-height: var(--touch-target-min);
  }
  /* 手機寬度不夠放單行：允許換行 */
  .plan-banner__text {
    flex-wrap: wrap;
  }
  .plan-banner__message {
    white-space: normal;
  }
  .plan-banner__link {
    min-height: var(--touch-target-min);
  }
}
</style>
