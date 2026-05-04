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
  background: var(--neutral-0);
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  box-shadow: var(--pt-elev-1);
}

.record-row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record-name {
  font-weight: 600;
  color: var(--pt-text-strong);
  font-size: 15px;
}

.record-status {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
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
