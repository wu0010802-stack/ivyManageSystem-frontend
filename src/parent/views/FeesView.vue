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

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()

const summary = ref(null)
const records = ref([])
const loading = ref(false)
const detail = ref(null) // { record, payments, refunds }
const detailLoading = ref(false)

const STATUS_LABEL = {
  unpaid: '未繳',
  partial: '部分繳費',
  paid: '已繳清',
}
const STATUS_COLOR = {
  unpaid: { bg: '#fde8e8', color: '#a51c1c' },
  partial: { bg: '#fff4e6', color: '#a25e0a' },
  paid: { bg: '#e6f4ea', color: '#2d6a3a' },
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
    <div v-if="detail" class="modal-mask" @click.self="closeDetail">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">繳費收據</span>
          <button class="close" @click="closeDetail">✕</button>
        </div>
        <div class="modal-body">
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
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fees-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.totals-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.totals-title {
  margin: 0 0 8px;
  font-size: 13px;
  color: #888;
  font-weight: 500;
}

.total-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.total-cell .label {
  font-size: 12px;
  color: #888;
}

.total-cell .value {
  margin-top: 2px;
  font-size: 18px;
  font-weight: 600;
}

.value.danger { color: #c0392b; }
.value.warn { color: #d97706; }
.value.warn-mild { color: #b78a30; }
.value.ok { color: #3f7d48; }

.single-totals {
  font-size: 13px;
  color: #555;
  background: #fff;
  border-radius: 8px;
  padding: 8px 12px;
}

.empty {
  text-align: center;
  padding: 40px 16px;
  color: #888;
}

.record-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.record-row1 {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.record-name {
  font-weight: 600;
  color: #2c3e50;
  font-size: 15px;
}

.record-status {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.record-row2 {
  margin-top: 6px;
  color: #555;
  font-size: 13px;
}

.record-row3 {
  margin-top: 4px;
  color: #888;
  font-size: 12px;
  display: flex;
  gap: 12px;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.modal {
  background: #fff;
  border-radius: 12px;
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #eee;
}

.modal-title {
  flex: 1;
  font-weight: 600;
}

.close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
}

.modal-body {
  padding: 16px;
  overflow-y: auto;
}

.detail-name {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
}

.detail-period {
  color: #888;
  font-size: 13px;
  margin-top: 2px;
}

.detail-loading,
.section-empty {
  text-align: center;
  padding: 12px;
  color: #888;
  font-size: 13px;
}

.section-h {
  margin: 16px 0 6px;
  font-size: 13px;
  color: #888;
}

.pay-row {
  background: #f7f9f8;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 6px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px;
  font-size: 13px;
}

.pay-row.refund .pay-amount {
  color: #c0392b;
}

.pay-amount {
  font-weight: 600;
  color: #3f7d48;
}

.pay-receipt {
  grid-column: 1 / -1;
  color: #aaa;
  font-size: 11px;
  font-family: ui-monospace, monospace;
}
</style>
