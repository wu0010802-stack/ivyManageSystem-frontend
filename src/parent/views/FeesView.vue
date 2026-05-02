<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import ChildSelector from '../components/ChildSelector.vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import {
  getFeesSummary,
  listFeeRecords,
  getFeePayments,
} from '../api/fees'
import { toast } from '../utils/toast'
import ParentIcon from '../components/ParentIcon.vue'
import AppModal from '../components/AppModal.vue'

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()

const summary = ref(null)
const records = ref([])
const loading = ref(false)
const detail = ref(null) // { record, payments, refunds }
const detailLoading = ref(false)

const detailOpen = computed({
  get: () => detail.value !== null,
  set: (v) => {
    if (!v) detail.value = null
  },
})

const STATUS_LABEL = {
  unpaid: '未繳',
  partial: '部分繳費',
  paid: '已繳清',
}
const STATUS_COLOR = {
  unpaid: { bg: 'var(--color-danger-soft)', color: 'var(--color-danger)' },
  partial: { bg: 'var(--color-warning-soft)', color: 'var(--pt-warning-text-soft)' },
  paid: { bg: 'var(--brand-primary-soft)', color: 'var(--pt-success-text)' },
}

const childTotals = computed(() => {
  const map = new Map()
  for (const item of summary.value?.by_student || []) map.set(item.student_id, item)
  return map
})

const myTotals = computed(() => childTotals.value.get(selectedId.value) || null)

async function fetchSummary() {
  try {
    const { data } = await getFeesSummary()
    summary.value = data
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  }
}

async function fetchRecords() {
  if (!selectedId.value) return
  loading.value = true
  try {
    const { data } = await listFeeRecords(selectedId.value)
    records.value = data?.items || []
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    loading.value = false
  }
}

async function openDetail(record) {
  detail.value = { record, payments: [], refunds: [] }
  detailLoading.value = true
  try {
    const { data } = await getFeePayments(record.id)
    detail.value.payments = data?.payments || []
    detail.value.refunds = data?.refunds || []
  } catch (err) {
    toast.error(err?.displayMessage || '載入失敗')
  } finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  detail.value = null
}

const formatNum = (n) => (n ?? 0).toLocaleString()

async function copyText(text) {
  if (!text) return
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      toast.success('已複製')
      return
    }
  } catch {
    /* ignore */
  }
  // fallback：建立暫時 textarea
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    toast.success('已複製')
  } catch {
    toast.warn('無法複製，請長按手動複製')
  }
}

function buildReceiptText(record, payments) {
  const lines = [
    `${record.fee_item_name}（${record.period}）`,
    `學生：${record.student_name || '—'}`,
    `應繳：$${formatNum(record.amount_due)}`,
    `已繳：$${formatNum(record.amount_paid)}`,
  ]
  if (payments?.length) {
    lines.push('— 繳費明細 —')
    for (const p of payments) {
      lines.push(
        `${p.payment_date} ${p.payment_method || ''} +$${formatNum(p.amount)}` +
          (p.receipt_no ? ` (收據 ${p.receipt_no})` : ''),
      )
    }
  }
  return lines.join('\n')
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items)
  fetchSummary()
  fetchRecords()
})

watch(selectedId, fetchRecords)
</script>

<template>
  <div class="fees-view">
    <div v-if="summary" class="totals-card">
      <h3 class="totals-title">所有子女費用總覽</h3>
      <div class="total-grid">
        <div class="total-cell">
          <div class="label">未繳合計</div>
          <div class="value warn">${{ formatNum(summary.totals.outstanding) }}</div>
        </div>
        <div class="total-cell">
          <div class="label">已逾期</div>
          <div class="value danger">${{ formatNum(summary.totals.overdue) }}</div>
        </div>
        <div class="total-cell">
          <div class="label">即將到期</div>
          <div class="value warn-mild">${{ formatNum(summary.totals.due_soon) }}</div>
        </div>
        <div class="total-cell">
          <div class="label">累計已繳</div>
          <div class="value ok">${{ formatNum(summary.totals.amount_paid) }}</div>
        </div>
      </div>
    </div>

    <ChildSelector />

    <div v-if="myTotals" class="single-totals">
      此學生：未繳 ${{ formatNum(myTotals.outstanding) }}・已繳 ${{ formatNum(myTotals.amount_paid) }}
    </div>

    <div v-if="!loading && records.length === 0" class="empty">尚無費用紀錄</div>

    <div
      v-for="r in records"
      :key="r.id"
      class="record-card"
      @click="openDetail(r)"
    >
      <div class="record-row1">
        <span class="record-name">{{ r.fee_item_name }}</span>
        <span
          class="record-status"
          :style="{
            background: STATUS_COLOR[r.status]?.bg,
            color: STATUS_COLOR[r.status]?.color,
          }"
        >{{ STATUS_LABEL[r.status] || r.status }}</span>
      </div>
      <div class="record-row2">
        應繳 ${{ formatNum(r.amount_due) }} ・ 已繳 ${{ formatNum(r.amount_paid) }} ・ 未繳 ${{ formatNum(r.outstanding) }}
      </div>
      <div class="record-row3">
        <span v-if="r.due_date" class="due">期限 {{ r.due_date }}</span>
        <span v-if="r.period" class="period">{{ r.period }}</span>
      </div>
    </div>

    <!-- 收據 modal -->
    <AppModal
      v-model:open="detailOpen"
      labelled-by="fee-detail-title"
    >
      <template v-if="detail">
        <div class="detail-header">
          <span id="fee-detail-title" class="detail-title">繳費收據</span>
          <button class="close" type="button" aria-label="關閉" @click="closeDetail">
            <ParentIcon name="close" size="sm" />
          </button>
        </div>
        <div class="detail-body">
          <div class="detail-name">{{ detail.record.fee_item_name }}</div>
          <div class="detail-period">{{ detail.record.period }}</div>
          <div v-if="detailLoading" class="detail-loading">載入中...</div>
          <template v-else>
            <h4 class="section-h">繳費紀錄</h4>
            <div v-if="detail.payments.length === 0" class="section-empty">尚無繳費</div>
            <div
              v-for="(p, i) in detail.payments"
              :key="i"
              class="pay-row"
            >
              <div>{{ p.payment_date }} ・ {{ p.payment_method || '—' }}</div>
              <div class="pay-amount">+${{ formatNum(p.amount) }}</div>
              <div v-if="p.receipt_no" class="pay-receipt">收據 {{ p.receipt_no }}</div>
            </div>
            <h4 class="section-h" v-if="detail.refunds.length">退款紀錄</h4>
            <div
              v-for="(r, i) in detail.refunds"
              :key="i"
              class="pay-row refund"
            >
              <div>{{ r.refunded_at?.slice(0, 10) }} ・ {{ r.reason }}</div>
              <div class="pay-amount">-${{ formatNum(r.amount) }}</div>
            </div>

            <!-- 收據動作 -->
            <div class="receipt-actions">
              <button
                class="action-btn"
                type="button"
                @click="copyText(buildReceiptText(detail.record, detail.payments))"
              >
                <ParentIcon name="clipboard" size="sm" />
                複製收據資訊
              </button>
              <button
                v-if="detail.payments[0]?.receipt_no"
                class="action-btn"
                type="button"
                @click="copyText(detail.payments[0].receipt_no)"
              >
                # 複製收據編號
              </button>
            </div>
            <p class="receipt-hint">
              如需正本紙本收據或對帳資訊，請聯絡園所行政。
            </p>
          </template>
        </div>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
.fees-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.totals-card {
  background: var(--neutral-0);
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: var(--pt-elev-1);
}

.totals-title {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--pt-text-placeholder);
  font-weight: 500;
}

.total-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.total-cell .label {
  font-size: 12px;
  color: var(--pt-text-placeholder);
}

.total-cell .value {
  margin-top: 2px;
  font-size: 18px;
  font-weight: 600;
}

.value.danger { color: var(--color-danger); }
.value.warn { color: var(--pt-warning-text-mid); }
.value.warn-mild { color: #b78a30; }
.value.ok { color: var(--brand-primary); }

.single-totals {
  font-size: 13px;
  color: var(--pt-text-muted);
  background: var(--neutral-0);
  border-radius: 8px;
  padding: 8px 12px;
}

.empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--pt-text-placeholder);
}

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

.detail-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--pt-border-light);
}

.detail-title {
  flex: 1;
  font-weight: 600;
}

.close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--pt-text-placeholder);
}

.detail-body {
  padding: 16px;
}

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

.receipt-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 14px;
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
.pay-receipt {
  grid-column: 1 / -1;
  color: var(--pt-text-disabled);
  font-size: 11px;
  font-family: ui-monospace, monospace;
}
</style>
