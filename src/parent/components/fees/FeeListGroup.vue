<script setup lang="ts">
/**
 * 費用紀錄列表（presentational）。
 *
 * Props:
 *  - records: 費用紀錄陣列
 *  - statusLabel: (status) => string
 *  - statusTone: (status) => 'ok'|'warn'|'danger'|'neutral' — 供 StatusPill 使用
 *
 * Emits:
 *  - record-click(record): 卡片點擊
 *
 * 第一筆未繳/部分繳費的卡片會帶 data-unpaid-anchor，供 hero CTA scrollIntoView。
 */
import StatusPill from '@/parent/components/StatusPill.vue'

interface FeeRecord {
  id: number
  fee_item_name: string
  status: string
  amount_due: number
  amount_paid: number
  outstanding: number
  due_date?: string
  period?: string
}

type ToneFn = (status: string) => 'ok' | 'warn' | 'danger' | 'neutral' | 'info'

const props = withDefaults(defineProps<{
  records: FeeRecord[]
  statusLabel: (status: string) => string
  statusTone?: ToneFn
}>(), {
  statusTone: () => ((_s: string): 'neutral' => 'neutral'),
})
const emit = defineEmits<{
  'record-click': [record: FeeRecord]
}>()

function fmt(n: number): string { return Number(n).toLocaleString('en-US') }
function isUnpaidAnchor(r: FeeRecord, idx: number): boolean {
  if (r.status !== 'unpaid' && r.status !== 'partial') return false
  return (
    props.records.findIndex((x) => x.status === 'unpaid' || x.status === 'partial') === idx
  )
}
</script>

<template>
  <div
    v-for="(r, idx) in records"
    :key="r.id"
    class="record-card"
    :data-unpaid-anchor="isUnpaidAnchor(r, idx) ? '' : null"
    role="button"
    tabindex="0"
    @click="emit('record-click', r)"
    @keydown.enter.space.prevent="emit('record-click', r)"
  >
    <div class="record-row1">
      <span class="record-name">{{ r.fee_item_name }}</span>
      <StatusPill
        :label="statusLabel(r.status)"
        :tone="statusTone(r.status)"
      />
    </div>
    <div class="record-row2">
      應繳 ${{ fmt(r.amount_due) }} ・ 已繳 ${{ fmt(r.amount_paid) }} ・ 未繳 ${{ fmt(r.outstanding) }}
    </div>
    <div class="record-row3">
      <span v-if="r.due_date" class="due">期限 {{ r.due_date }}</span>
      <span v-if="r.period" class="period">{{ r.period }}</span>
    </div>
  </div>
</template>

<style scoped>
.record-card {
  background: var(--m3-surface-container-low, var(--pt-surface-card));
  border: 1px solid var(--m3-outline-variant, var(--pt-border));
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  box-shadow: var(--m3-elev-1, var(--pt-shadow-card, var(--pt-elev-1)));
}

.record-row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record-name {
  font-weight: 800;
  color: var(--m3-on-surface, var(--pt-text-strong));
  font-size: 15px;
}

.record-row2 {
  margin-top: 6px;
  color: var(--pt-text-muted);
  font-size: 13px;
}

.record-row3 {
  margin-top: 4px;
  color: var(--pt-text-placeholder);
  font-size: 12px;
  display: flex;
  gap: 12px;
}

.fee-highlight {
  animation: feeHighlight 1s ease;
}

@keyframes feeHighlight {
  0% { background: var(--pt-tint-money, #fef3c7); }
  100% { background: transparent; }
}
</style>
