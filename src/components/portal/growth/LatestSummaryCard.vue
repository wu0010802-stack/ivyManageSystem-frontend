<script setup lang="ts">
import { computed, type Component } from 'vue'
import { CaretTop, CaretBottom, Minus } from '@element-plus/icons-vue'
import { gradeStyle, cycleLabel } from '@/composables/usePortalAppraisal'

interface SummaryItem {
  grade?: string
  academic_year?: number | string
  semester?: number | string
  total_score?: number | string
  bonus_amount?: number | string
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  item: SummaryItem
  delta?: number | null
}>(), {
  delta: null,
})

const style = computed(() => gradeStyle(props.item.grade ?? ''))
const label = computed(() =>
  cycleLabel(props.item.academic_year ?? '', String(props.item.semester ?? '')),
)

const deltaText = computed(() => {
  if (props.delta === null) return '無上期可比較'
  return `比上期 ${props.delta > 0 ? '+' : ''}${props.delta}`
})
// 升降用圖示表示（原本是 ▲▼◆ 字元，各平台字型不一致）
const deltaIcon = computed<Component | null>(() => {
  if (props.delta === null) return null
  return props.delta > 0 ? CaretTop : props.delta < 0 ? CaretBottom : Minus
})
const deltaClass = computed(() => {
  if (props.delta === null) return 'delta-none'
  return props.delta > 0
    ? 'delta-up'
    : props.delta < 0
      ? 'delta-down'
      : 'delta-flat'
})
</script>

<template>
  <section class="latest-card">
    <header>
      <span class="cycle">{{ label }}</span>
      <span class="status">最新一期</span>
    </header>
    <div class="score-row">
      <div class="score">{{ item.total_score }}</div>
      <div class="grade-chip" :style="{ background: style.color }">{{ style.label }}等</div>
    </div>
    <div class="meta">
      <span class="bonus">獎金 ${{ Number(item.bonus_amount).toLocaleString() }}</span>
      <span class="delta" :class="deltaClass"><el-icon v-if="deltaIcon" aria-hidden="true"><component :is="deltaIcon" /></el-icon>{{ deltaText }}</span>
    </div>
  </section>
</template>

<style scoped>
.latest-card {
  background: var(--pt-surface-card);
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  box-shadow: var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.06));
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}
header {
  display: flex;
  justify-content: space-between;
  color: var(--pt-text-muted, #6b7280);
  font-size: var(--text-sm, 13px);
}
.score-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-3, 12px);
}
.score {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--pt-text-strong, #111);
}
.grade-chip {
  padding: 4px 12px;
  border-radius: 999px;
  font-weight: 600;
  color: #fff;
}
.meta {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm, 13px);
}
.bonus { color: var(--pt-text-muted, #6b7280); }
.delta { display: inline-flex; align-items: center; gap: 2px; }
.delta-up { color: var(--color-success-darker); font-weight: 600; }
.delta-down { color: var(--color-danger-darker); font-weight: 600; }
.delta-flat, .delta-none { color: var(--pt-text-muted, #6b7280); }
</style>
