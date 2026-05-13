<script setup>
/**
 * 費用紀錄列表（presentational）。
 *
 * Props:
 *  - records: 費用紀錄陣列
 *  - statusLabel: (status) => string
 *  - statusColor: (status) => { bg, color } | null
 *
 * Emits:
 *  - record-click(record): 卡片點擊
 *
 * 第一筆未繳/部分繳費的卡片會帶 data-unpaid-anchor，供 hero CTA scrollIntoView。
 */
const props = defineProps({
  records: { type: Array, required: true },
  statusLabel: { type: Function, required: true },
  statusColor: { type: Function, default: () => null },
})
const emit = defineEmits(['record-click'])

function fmt(n) { return Number(n).toLocaleString('en-US') }
function isUnpaidAnchor(r, idx) {
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
    @click="emit('record-click', r)"
  >
    <div class="record-row1">
      <span class="record-name">{{ r.fee_item_name }}</span>
      <span
        class="record-status"
        :data-status="r.status"
        :style="
          statusColor(r.status)
            ? { background: statusColor(r.status).bg, color: statusColor(r.status).color }
            : {}
        "
      >{{ statusLabel(r.status) }}</span>
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

.record-status {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

/* 童彩狀態 chip（prop statusColor 優先；以下為無 prop 時的 token 預設） */
.record-status[data-status="paid"]    { background: var(--pt-tint-calendar); color: var(--pt-tint-calendar-fg); }
.record-status[data-status="unpaid"]  { background: var(--pt-tint-money); color: var(--pt-tint-money-fg); }
.record-status[data-status="overdue"] { background: var(--pt-tint-announcement); color: var(--pt-tint-announcement-fg); }
.record-status[data-status="partial"] { background: var(--pt-tint-pickup); color: var(--pt-tint-pickup-fg); }

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
