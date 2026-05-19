<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ChildSelector from '../components/ChildSelector.vue'
import FeeHero from '../components/fees/FeeHero.vue'
import FeeListGroup from '../components/fees/FeeListGroup.vue'
import FeeReceiptSheet from '../components/fees/FeeReceiptSheet.vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import {
  getFeesSummary,
  listFeeRecords,
  getFeePayments,
} from '../api/fees'
import { toast } from '../utils/toast'
import PullToRefresh from '../components/PullToRefresh.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'

interface FeeRecord {
  id: number
  status: string
  due_date?: string
  fee_item_name: string
  period?: string
  student_name?: string
  amount_due: number
  amount_paid: number
  outstanding: number
  [key: string]: unknown
}

interface Payment {
  payment_date?: string
  payment_method?: string
  amount?: number
  receipt_no?: string
}

interface FeeDetail {
  record: FeeRecord
  payments: Payment[]
  refunds: unknown[]
}

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()

const summary = ref<Record<string, unknown> | null>(null)
const records = ref<FeeRecord[]>([])
const loading = ref(false)
const detail = ref<FeeDetail | null>(null)
const detailLoading = ref(false)

const detailOpen = computed({
  get: () => detail.value !== null,
  set: (v: boolean) => {
    if (!v) detail.value = null
  },
})

const STATUS_LABEL: Record<string, string> = {
  unpaid: '未繳',
  partial: '部分繳費',
  paid: '已繳清',
}
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  unpaid: { bg: 'var(--color-danger-soft)', color: 'var(--m3-error, var(--color-danger))' },
  partial: { bg: 'var(--color-warning-soft)', color: 'var(--m3-tertiary, var(--pt-warning-text))' },
  paid: { bg: 'var(--brand-primary-soft)', color: 'var(--m3-primary, var(--pt-success-text))' },
}

const childTotals = computed(() => {
  const map = new Map<number, unknown>()
  for (const item of (summary.value?.by_student as { student_id: number }[]) || []) map.set(item.student_id, item)
  return map
})

const myTotals = computed(() => (childTotals.value.get(selectedId.value!) as Record<string, unknown> | undefined) || null)

// hero 用：以 summary.totals 與本學生未繳紀錄拼出 hero props
const unpaidTotal = computed(() => Number((summary.value?.totals as Record<string, unknown>)?.outstanding ?? 0))
const overdueAmount = computed(() => Number((summary.value?.totals as Record<string, unknown>)?.overdue ?? 0))
const unpaidRecords = computed(() =>
  records.value.filter((r) => r.status === 'unpaid' || r.status === 'partial'),
)
const unpaidCount = computed(() => unpaidRecords.value.length)
const nearestDueDate = computed(() => {
  const sorted = unpaidRecords.value
    .filter((r) => r.due_date)
    .slice()
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
  return sorted[0]?.due_date ?? ''
})

function onJumpUnpaid() {
  const el = document.querySelector('[data-unpaid-anchor]')
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('fee-highlight')
    setTimeout(() => el.classList.remove('fee-highlight'), 1000)
  }
}

async function fetchSummary() {
  try {
    const { data } = await getFeesSummary()
    summary.value = data as Record<string, unknown>
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  }
}

async function fetchRecords() {
  if (!selectedId.value) return
  loading.value = true
  try {
    const { data } = await listFeeRecords(selectedId.value)
    records.value = (data as { items?: FeeRecord[] })?.items || []
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    loading.value = false
  }
}

async function openDetail(record: FeeRecord) {
  detail.value = { record, payments: [], refunds: [] }
  detailLoading.value = true
  try {
    const { data } = await getFeePayments(record.id)
    detail.value!.payments = (data as { payments?: Payment[] })?.payments || []
    detail.value!.refunds = (data as { refunds?: unknown[] })?.refunds || []
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
  } finally {
    detailLoading.value = false
  }
}

const formatNum = (n: number | null | undefined) => (n ?? 0).toLocaleString()

async function copyText(text: string | null | undefined) {
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

function buildReceiptText(record: FeeRecord, payments: Payment[]) {
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

function onCopyInfo(record: FeeRecord, payments: Payment[]) {
  copyText(buildReceiptText(record, payments))
}
function onCopyNo(no: string | null | undefined) {
  copyText(no)
}

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items as { student_id: number }[])
  fetchSummary()
  fetchRecords()
})

watch(selectedId, fetchRecords)

async function pullRefresh() {
  await Promise.all([fetchSummary(), fetchRecords()])
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="fees-view">
    <FeeHero
      v-if="summary"
      :unpaid-total="unpaidTotal"
      :unpaid-count="unpaidCount"
      :nearest-due-date="nearestDueDate"
      :overdue-amount="overdueAmount"
      @jump-unpaid="onJumpUnpaid"
    />

    <ChildSelector />

    <div v-if="myTotals" class="single-totals">
      <span class="material-symbols-rounded" aria-hidden="true">account_balance_wallet</span>
      <span class="totals-text">
        此學生：未繳 <strong>${{ formatNum(myTotals.outstanding as number) }}</strong>
        ・已繳 ${{ formatNum(myTotals.amount_paid as number) }}
      </span>
    </div>

    <div v-if="loading && records.length === 0" class="skeleton-wrap">
      <SkeletonBlock variant="card" :count="3" />
    </div>

    <div v-else-if="!loading && records.length === 0" class="pt-empty">
      <span class="material-symbols-rounded" aria-hidden="true" style="font-size: 40px; color: var(--brand-primary);">payments</span>
      <p class="pt-empty-title">尚無費用紀錄</p>
      <p class="pt-empty-note">園所開立帳單後會出現在這裡</p>
    </div>

    <FeeListGroup
      :records="records"
      :status-label="(s) => STATUS_LABEL[s] || s"
      :status-color="(s) => STATUS_COLOR[s] || null"
      @record-click="(r) => { openDetail(r as FeeRecord) }"
    />

    <FeeReceiptSheet
      v-model="detailOpen"
      :record="detail?.record"
      :payments="detail?.payments || []"
      :refunds="(detail?.refunds || []) as never[]"
      :loading="detailLoading"
      @copy-info="(r, p) => onCopyInfo(r as FeeRecord, p as Payment[])"
      @copy-no="onCopyNo"
    />
  </PullToRefresh>
</template>

<style scoped>
.fees-view :deep(.ptr-content) {
  display: flex;
  flex-direction: column;
  gap: var(--pt-page-gap, 18px);
}

.single-totals {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 16px;
  font-size: 13px;
  color: var(--pt-text-body);
  background: var(--cream, #fffcf2);
  border: 1px solid rgba(13, 144, 83, 0.12);
  border-radius: 12px;
  padding: 12px 14px;
}
.single-totals .material-symbols-rounded {
  font-size: 22px;
  color: var(--brand-primary, #0d9053);
  font-variation-settings: 'FILL' 1, 'wght' 500;
  flex-shrink: 0;
}
.totals-text { flex: 1; }
.totals-text strong { color: var(--coral-700, #b14545); font-weight: 700; }

.skeleton-wrap {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}
</style>
