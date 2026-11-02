<template>
  <div class="plan-published-bar" :class="`is-${tone}`" role="status">
    <!-- 已發布：取代進度列。最重要的是「會不會套用、何時套用」：自動套用未啟用或上次
         失敗時用 error 樣式直接講，不讓使用者以為發布完就沒事 -->
    <el-icon class="bar-icon" aria-hidden="true">
      <WarningFilled v-if="tone !== 'info'" />
      <Clock v-else />
    </el-icon>
    <div class="bar-body">
      <p class="bar-headline">{{ headline }}</p>
      <p class="bar-details">{{ details.join('・') }}</p>
    </div>
    <div v-if="$slots.actions" class="bar-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Clock, WarningFilled } from '@element-plus/icons-vue'
import { daysBetweenISO, formatMonthDay, formatPlanDate } from './planHelpers'

const props = withDefaults(defineProps<{
  publishedAt?: string | null
  applyDate?: string | null
  appliesImmediately?: boolean
  schedulerEnabled: boolean
  applyFailure?: string | null
  applyOverdue?: boolean
  /** 今天（'YYYY-MM-DD'，台北）；由父層傳入，測試可固定 */
  today: string
  /** 已發布計畫的阻擋數（published 時只含會讓套用失敗的問題） */
  blockingCount?: number
}>(), {
  publishedAt: null,
  applyDate: null,
  appliesImmediately: false,
  applyFailure: null,
  applyOverdue: false,
  blockingCount: 0,
})

// 優先序與 PlanStatusCard 一致：排程未啟用 → 套用失敗 → 阻擋 → 逾期
const tone = computed<'info' | 'warning' | 'error'>(() => {
  if (!props.schedulerEnabled || props.applyFailure || props.blockingCount > 0) return 'error'
  if (props.applyOverdue) return 'warning'
  return 'info'
})

const applyCountdown = computed(() => {
  if (!props.applyDate || !props.today) return ''
  const days = daysBetweenISO(props.today, props.applyDate)
  return days <= 0 ? '（今天）' : `（還有 ${days} 天）`
})

const headline = computed(() => {
  if (!props.schedulerEnabled) return '自動套用未啟用，請聯絡系統管理員開啟，否則不會套用'
  if (props.applyFailure) return `套用失敗：${props.applyFailure}`
  if (props.blockingCount > 0) return `已發布的計畫有 ${props.blockingCount} 項阻擋，套用會失敗`
  if (props.applyOverdue) return '已超過預期時間仍未套用，排程器重試中'
  if (props.appliesImmediately) return '已發布，約一小時內套用到現行班級'
  if (!props.applyDate) return '已發布，將於新學年開學時自動套用'
  return `已發布，將於 ${formatPlanDate(props.applyDate)} 自動套用${applyCountdown.value}`
})

const details = computed(() => {
  const parts: string[] = []
  const published = formatMonthDay(props.publishedAt)
  if (published) parts.push(`已於 ${published} 發布`)
  if (!props.schedulerEnabled && props.applyFailure) parts.push(`上次套用失敗：${props.applyFailure}`)
  // 阻擋不是 headline 時（排程未啟用／已有失敗原因）列在說明裡，不被蓋掉
  const blockingIsHeadline = props.schedulerEnabled && !props.applyFailure && props.blockingCount > 0
  if (props.blockingCount > 0 && !blockingIsHeadline) parts.push(`另有 ${props.blockingCount} 項阻擋，處理前不會套用`)
  if (blockingIsHeadline) parts.push('處理方式寫在右側「阻擋套用」各項裡；多數要先撤回發布、重新產生建議再發布')
  else {
    if (props.schedulerEnabled && props.applyFailure) parts.push('處理好之後系統會自動重試')
    parts.push('要修改請先撤回發布')
  }
  return parts
})
</script>

<style scoped>
.plan-published-bar {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-md);
  background: var(--surface-color);
}

.bar-icon {
  flex: none;
  margin-top: 2px;
  font-size: var(--text-lg);
}

.bar-body {
  flex: 1 1 auto;
  min-width: 0;
}

.bar-actions {
  flex: none;
  align-self: center;
}

.bar-headline {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.bar-details {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.is-info .bar-icon {
  color: var(--color-info-darker);
}

.is-warning {
  border-color: var(--color-warning);
  background: var(--color-warning-soft);
}

.is-warning .bar-icon,
.is-warning .bar-headline {
  color: var(--color-warning-darker);
}

.is-error {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
}

.is-error .bar-icon,
.is-error .bar-headline {
  color: var(--color-danger-darker);
}
</style>
