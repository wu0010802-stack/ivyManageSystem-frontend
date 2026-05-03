<script setup>
/**
 * 繳費收據 BottomSheet（snap mid/full）。
 *
 * 父層注入 record/payments/refunds 與 loading；本元件負責呈現與 emit 動作。
 *
 * Emits:
 *  - update:modelValue
 *  - copy-info(record, payments): 父層自行組字串並呼叫 copyText
 *  - copy-no(receiptNo): 父層呼叫 copyText
 */
import { computed } from 'vue'
import ParentBottomSheet from '@/parent/components/ParentBottomSheet.vue'
import ParentIcon from '@/parent/components/ParentIcon.vue'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  record: { type: Object, default: null },
  payments: { type: Array, default: () => [] },
  refunds: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue', 'copy-info', 'copy-no'])

function fmt(n) { return Number(n).toLocaleString('en-US') }

const firstReceiptNo = computed(() => props.payments[0]?.receipt_no || '')
</script>

<template>
  <ParentBottomSheet
    :model-value="modelValue"
    title="繳費收據"
    :snap-points="['mid', 'full']"
    default-snap="mid"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="record">
      <div class="detail-name">{{ record.fee_item_name }}</div>
      <div class="detail-period">{{ record.period }}</div>
      <div v-if="loading" class="detail-loading">載入中...</div>
      <template v-else>
        <h4 class="section-h">繳費紀錄</h4>
        <div v-if="payments.length === 0" class="section-empty">尚無繳費</div>
        <div
          v-for="(p, i) in payments"
          :key="`p-${i}`"
          class="pay-row"
        >
          <div>{{ p.payment_date }} ・ {{ p.payment_method || '—' }}</div>
          <div class="pay-amount">+${{ fmt(p.amount) }}</div>
          <div v-if="p.receipt_no" class="pay-receipt">收據 {{ p.receipt_no }}</div>
        </div>
        <h4 v-if="refunds.length" class="section-h">退款紀錄</h4>
        <div
          v-for="(r, i) in refunds"
          :key="`r-${i}`"
          class="pay-row refund"
        >
          <div>{{ r.refunded_at?.slice(0, 10) }} ・ {{ r.reason }}</div>
          <div class="pay-amount">-${{ fmt(r.amount) }}</div>
        </div>
      </template>
    </template>

    <template v-if="record && !loading" #footer>
      <div class="receipt-actions">
        <button
          type="button"
          class="action-btn"
          @click="emit('copy-info', record, payments)"
        >
          <ParentIcon name="clipboard" size="sm" />
          複製收據資訊
        </button>
        <button
          v-if="firstReceiptNo"
          type="button"
          class="action-btn"
          @click="emit('copy-no', firstReceiptNo)"
        >
          # 複製收據編號
        </button>
      </div>
      <p class="receipt-hint">
        如需正本紙本收據或對帳資訊，請聯絡園所行政。
      </p>
    </template>
  </ParentBottomSheet>
</template>

<style scoped>
.detail-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--pt-text-strong);
}

.detail-period {
  color: var(--pt-text-placeholder);
  font-size: 13px;
  margin-top: 2px;
}

.detail-loading,
.section-empty {
  text-align: center;
  padding: 12px;
  color: var(--pt-text-placeholder);
  font-size: 13px;
}

.section-h {
  margin: 16px 0 6px;
  font-size: 13px;
  color: var(--pt-text-placeholder);
}

.pay-row {
  background: var(--pt-surface-thread-bg);
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 6px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px;
  font-size: 13px;
}

.pay-row.refund .pay-amount {
  color: var(--color-danger);
}

.pay-amount {
  font-weight: 600;
  color: var(--brand-primary);
}

.pay-receipt {
  grid-column: 1 / -1;
  color: var(--pt-text-disabled);
  font-size: 11px;
  font-family: ui-monospace, monospace;
}

.receipt-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-btn {
  flex: 1 1 140px;
  padding: 10px;
  background: var(--neutral-0);
  border: 1px solid var(--pt-border-strong);
  border-radius: 8px;
  font-size: 13px;
  color: var(--pt-text-strong);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.action-btn:active {
  background: var(--pt-surface-mute);
}

.receipt-hint {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--pt-text-placeholder);
  text-align: center;
}
</style>
