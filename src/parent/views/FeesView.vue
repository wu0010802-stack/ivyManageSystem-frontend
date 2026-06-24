<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ChildContextHeader from '../components/ChildContextHeader.vue'
import DashboardHero from '../components/DashboardHero.vue'
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
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

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
const loadError = ref(false)
const detail = ref<FeeDetail | null>(null)
const detailLoading = ref(false)

const detailOpen = computed({
  get: () => detail.value !== null,
  set: (v: boolean) => {
    if (!v) detail.value = null
  },
})

// 狀態 → StatusPill tone 對應
const STATUS_TONE: Record<string, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  unpaid: 'warn',
  partial: 'warn',
  paid: 'ok',
  overdue: 'danger',
}
const STATUS_LABEL: Record<string, string> = {
  unpaid: '未繳',
  partial: '部分繳費',
  paid: '已繳清',
  overdue: '逾期',
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

// DashboardHero props
const heroValue = computed(() => `NT$ ${unpaidTotal.value.toLocaleString()}`)
const heroSub = computed(() => {
  if (overdueAmount.value > 0) return `逾期 NT$ ${overdueAmount.value.toLocaleString()}`
  if (nearestDueDate.value && unpaidCount.value > 0) return `最近到期：${nearestDueDate.value}（共 ${unpaidCount.value} 筆）`
  return ''
})
const heroStatusTone = computed<'danger' | 'warn' | 'ok'>(() => {
  if (overdueAmount.value > 0) return 'danger'
  if (unpaidCount.value > 0) return 'warn'
  return 'ok'
})
const heroStatusLabel = computed(() => {
  if (overdueAmount.value > 0) return '有逾期款項'
  if (unpaidCount.value > 0) return '有待繳費用'
  return '繳費無欠款'
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
    throw err
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
    throw err
  } finally {
    loading.value = false
  }
}

async function loadAll() {
  loadError.value = false
  try {
    await Promise.all([fetchSummary(), fetchRecords()])
  } catch {
    loadError.value = true
  }
}

async function retryLoad() {
  records.value = []
  summary.value = null
  await loadAll()
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
  await loadAll()
})

watch(selectedId, () => {
  loadError.value = false
  fetchRecords().catch(() => { loadError.value = true })
})

async function pullRefresh() {
  loadError.value = false
  await Promise.all([fetchSummary(), fetchRecords()])
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="fees-view">
    <!-- Hero：以 DashboardHero 取代 FeeHero，呈現本月應繳金額 + 到期/逾期資訊 -->
    <DashboardHero
      v-if="summary"
      eyebrow="本月應繳"
      :title="unpaidCount > 0 ? '有待繳費用' : '繳費無欠款'"
      :value="heroValue"
      :sub="heroSub"
      :status-label="heroStatusLabel"
      :status-tone="heroStatusTone"
    />
    <!-- 有未繳款時提供跳至應繳的快捷按鈕 -->
    <div v-if="summary && unpaidCount > 0" class="jump-unpaid-wrap">
      <button type="button" class="jump-unpaid-btn" @click="onJumpUnpaid">
        <span class="material-symbols-rounded" aria-hidden="true">arrow_downward</span>
        跳到應繳
      </button>
    </div>

    <ChildContextHeader variant="page" />

    <div v-if="myTotals" class="single-totals">
      <span class="material-symbols-rounded" aria-hidden="true">account_balance_wallet</span>
      <span class="totals-text">
        此學生：未繳 <strong>${{ formatNum(myTotals.outstanding as number) }}</strong>
        ・已繳 ${{ formatNum(myTotals.amount_paid as number) }}
      </span>
    </div>

    <!-- 載入中（三態 skeleton） -->
    <div v-if="loading && records.length === 0" class="skeleton-wrap">
      <SkeletonBlock variant="card" :count="3" />
    </div>

    <!-- 錯誤三態：fetch 失敗且沒有資料時顯示 inline error + retry -->
    <MobileErrorRetry
      v-else-if="loadError && records.length === 0"
      @retry="retryLoad"
    />

    <!-- 空狀態 -->
    <div v-else-if="!loading && !loadError && records.length === 0" class="pt-empty">
      <span class="material-symbols-rounded pt-empty-icon" aria-hidden="true">payments</span>
      <p class="pt-empty-title">尚無費用紀錄</p>
      <p class="pt-empty-note">園所開立帳單後會出現在這裡</p>
    </div>

    <!-- 費用列表：使用 StatusPill tone 取代舊 STATUS_COLOR map -->
    <FeeListGroup
      :records="records"
      :status-label="(s) => STATUS_LABEL[s] || s"
      :status-tone="(s) => STATUS_TONE[s] ?? 'neutral'"
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
  border: 1px solid var(--brand-primary-border, color-mix(in srgb, var(--brand-primary, #0d9053) 12%, transparent));
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

/* 空狀態圖示改用 token */
.pt-empty-icon {
  font-size: var(--text-5xl, 40px);
  color: var(--brand-primary, #0d9053);
}

/* 跳至應繳快捷列 */
.jump-unpaid-wrap {
  display: flex;
  justify-content: flex-end;
  padding: 0 16px;
}
.jump-unpaid-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--brand-primary, #0d9053);
  background: var(--brand-primary-soft, color-mix(in srgb, var(--brand-primary, #0d9053) 10%, transparent));
  border: 1px solid var(--brand-primary-border, color-mix(in srgb, var(--brand-primary, #0d9053) 20%, transparent));
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
}
.jump-unpaid-btn .material-symbols-rounded {
  font-size: 16px;
}
</style>
