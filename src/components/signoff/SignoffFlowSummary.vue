<template>
  <div class="flow-summary" role="group" aria-label="流程摘要">
    <button
      v-for="item in visibleItems"
      :key="item.key"
      type="button"
      class="flow-chip"
      :class="{
        'flow-chip--active': active === item.key,
        'flow-chip--alert': item.key === 'exception',
      }"
      :aria-pressed="active === item.key"
      :data-test="`flow-chip-${item.key}`"
      @click="toggle(item.key)"
    >
      <span class="flow-chip__label">
        {{ item.label }}
        <span v-if="active === item.key" class="flow-chip__selected">✓ 篩選中</span>
      </span>
      <span class="flow-chip__count">{{ item.count }} 筆</span>
      <span class="flow-chip__amount">{{ formatCurrency(item.amount) }}</span>
    </button>
    <p class="flow-summary__period">{{ periodLabel }}・共 {{ summary.total_count }} 筆 {{ formatCurrency(summary.total_amount) }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatCurrency } from '@/utils/currency'
import type { SignoffSummary } from '@/constants/signoff'
import type { SignoffDirection } from '@/utils/financeSignoff'

/** 可點擊流程摘要 key（點擊即套用對應複合篩選） */
export type FlowFilterKey =
  | 'pending_approval'
  | 'approved_unsettled'
  | 'awaiting_evidence'
  | 'awaiting_reconcile'
  | 'exception'

const props = defineProps<{
  summary: SignoffSummary
  active: FlowFilterKey | null
  direction: SignoffDirection
  periodLabel: string
}>()

const emit = defineEmits<{
  select: [key: FlowFilterKey | null]
}>()

const visibleItems = computed(() => {
  const s = props.summary
  const settleLabel =
    props.direction === 'vendor' ? '已核准待付款' : '已核准待收款'
  const items: Array<{
    key: FlowFilterKey
    label: string
    count: number
    amount: number
  }> = [
    {
      key: 'pending_approval',
      label: '待核准',
      count: s.pending_approval_count,
      amount: s.pending_approval_amount,
    },
    {
      key: 'approved_unsettled',
      label: settleLabel,
      count: s.approved_unsettled_count,
      amount: s.approved_unsettled_amount,
    },
    {
      key: 'awaiting_evidence',
      label: '待補憑證',
      count: s.awaiting_evidence_count,
      amount: s.awaiting_evidence_amount,
    },
    {
      key: 'awaiting_reconcile',
      label: '待對帳',
      count: s.awaiting_reconcile_count,
      amount: s.awaiting_reconcile_amount,
    },
  ]
  // 異常佇列：有異常才顯示（平常不佔位，不做四張相同 KPI 卡）
  if (s.exception_count > 0 || props.active === 'exception') {
    items.push({
      key: 'exception',
      label: '異常待處理',
      count: s.exception_count,
      amount: s.exception_amount,
    })
  }
  return items
})

function toggle(key: FlowFilterKey) {
  emit('select', props.active === key ? null : key)
}
</script>

<style scoped>
.flow-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-4, 16px);
}
.flow-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 128px;
  min-height: var(--touch-target-min, 44px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md, 8px);
  background: var(--neutral-0);
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: border-color var(--transition-fast, 0.15s);
}
.flow-chip:hover {
  border-color: var(--brand-primary);
}
.flow-chip:focus-visible {
  outline: 2px solid var(--brand-primary);
  outline-offset: 1px;
}
.flow-chip--active {
  border-color: var(--brand-primary);
  background: var(--brand-primary-soft, var(--neutral-50));
}
.flow-chip__label {
  font-size: var(--text-xs, 12px);
  color: var(--text-secondary, var(--neutral-500));
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
}
.flow-chip__selected {
  color: var(--brand-primary);
  font-weight: var(--font-weight-medium, 500);
}
.flow-chip--alert .flow-chip__label {
  color: var(--color-danger-darker, var(--color-danger));
  font-weight: var(--font-weight-medium, 500);
}
.flow-chip__count {
  font-size: var(--text-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--text-primary, var(--neutral-800));
  font-variant-numeric: tabular-nums;
}
.flow-chip__amount {
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, var(--neutral-400));
  font-variant-numeric: tabular-nums;
}
.flow-summary__period {
  flex-basis: 100%;
  margin: 0;
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, var(--neutral-400));
  font-variant-numeric: tabular-nums;
}
</style>
