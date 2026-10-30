<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ChildContextHeader from '../components/ChildContextHeader.vue'
import DashboardHero from '../components/DashboardHero.vue'
import SectionHeader from '../components/SectionHeader.vue'
import FeeListGroup from '../components/fees/FeeListGroup.vue'
import FeeReceiptSheet from '../components/fees/FeeReceiptSheet.vue'
import { useChildrenStore } from '../stores/children'
import { useChildSelection } from '../composables/useChildSelection'
import {
  getFeesSummary,
  listFeeRecords,
  getFeePayments,
  type ParentFeePayment,
  type ParentFeeRecord,
  type ParentFeeRefund,
  type ParentFeesStudentSummary,
  type ParentFeesSummary,
} from '../api/fees'
import { toast } from '../utils/toast'
import { copyText as copyToClipboard } from '../utils/clipboard'
import { formatSemesterLabel } from '../utils/semesterLabel'
import { todayISO } from '@/utils/format'
import PullToRefresh from '../components/PullToRefresh.vue'
import SkeletonBlock from '../components/SkeletonBlock.vue'
import MobileErrorRetry from '@/components/common/MobileErrorRetry.vue'

// 欄位型別取自後端 response_model（schema.d.ts），不再手寫一份會漂移的 interface。
// student_name 不在後端回應內（buildReceiptText 一律退回「—」），保留宣告只為維持現況行為。
type FeeRecord = ParentFeeRecord & { student_name?: string }
type Payment = ParentFeePayment

interface FeeDetail {
  record: FeeRecord
  payments: Payment[]
  refunds: ParentFeeRefund[]
}

const childrenStore = useChildrenStore()
const { selectedId, ensureSelected } = useChildSelection()

const summary = ref<ParentFeesSummary | null>(null)
const records = ref<FeeRecord[]>([])
const loading = ref(false)
const loadError = ref(false)
const detail = ref<FeeDetail | null>(null)
// F18：收據彈窗請求序號。關閉或換開另一筆時遞增，A 的晚回應（付款、收據編號、退款
// 同一路徑）一律丟棄，不得寫進 B 或已關閉的彈窗。
let detailSeq = 0
const detailLoading = ref(false)
const detailError = ref(false)

const detailOpen = computed({
  get: () => detail.value !== null,
  set: (v: boolean) => {
    if (!v) {
      detailSeq += 1
      detail.value = null
    }
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
  const map = new Map<number, ParentFeesStudentSummary>()
  for (const item of summary.value?.by_student || []) map.set(item.student_id, item)
  return map
})

const myTotals = computed(() => childTotals.value.get(selectedId.value!) || null)

/** 還沒繳清的狀態（overdue 若出現也算待繳，不能被分到「已結清」） */
const PENDING_STATUSES = new Set(['unpaid', 'partial', 'overdue'])
const unpaidRecords = computed(() => records.value.filter((r) => PENDING_STATUSES.has(r.status)))
const unpaidCount = computed(() => unpaidRecords.value.length)

function finiteOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const familyOutstanding = computed(() => Number(summary.value?.totals?.outstanding ?? 0))
const familyOverdue = computed(() => Number(summary.value?.totals?.overdue ?? 0))

/**
 * 摘要口徑：頁面是「目前孩子」的帳單，hero 的金額／標題／狀態一律用同一位孩子的數字
 * （先前金額是全家合計、標題卻看目前孩子，會同時出現「繳費無欠款」與「NT$5,000」）。
 * 拿不到這位孩子的資料時才退回全家合計，並明確標「全家」。
 */
const heroScope = computed<'child' | 'family'>(() =>
  myTotals.value || records.value.length > 0 ? 'child' : 'family',
)
const childOutstanding = computed(() =>
  finiteOrNull(myTotals.value?.outstanding)
    ?? unpaidRecords.value.reduce((sum, r) => sum + Number(r.outstanding || 0), 0),
)
const childOverdue = computed(() => {
  const fromSummary = finiteOrNull(myTotals.value?.overdue)
  if (fromSummary !== null) return fromSummary
  const today = todayISO()
  return unpaidRecords.value
    .filter((r) => r.status === 'overdue' || (!!r.due_date && r.due_date < today))
    .reduce((sum, r) => sum + Number(r.outstanding || 0), 0)
})
const unpaidTotal = computed(() => (heroScope.value === 'child' ? childOutstanding.value : familyOutstanding.value))
const overdueAmount = computed(() => (heroScope.value === 'child' ? childOverdue.value : familyOverdue.value))
const hasUnpaid = computed(() => unpaidTotal.value > 0)

const childName = computed(() => {
  const c = ((childrenStore.items || []) as { student_id: number; name?: string }[]).find(
    (x) => x.student_id === selectedId.value,
  )
  return c?.name || ''
})
const heroEyebrow = computed(() => {
  if (heroScope.value === 'family') return '全家未繳合計'
  return childName.value ? `${childName.value}・未繳合計` : '未繳合計'
})
/** 多孩家庭且其他孩子也有欠款時，另外提一句全家合計，免得家長以為只剩這筆 */
const familyNote = computed(() => {
  if (heroScope.value !== 'child') return ''
  const children = summary.value?.by_student?.length ?? 0
  if (children < 2 || familyOutstanding.value <= childOutstanding.value) return ''
  return `全家未繳合計 $${formatNum(familyOutstanding.value)}`
})

// 列表分組：原本按 API 時間序混排、未繳散落中段要靠跳轉尋找；改為「待繳」
// （到期日近→遠）置頂、「已結清」隨後（維持原序），家長打開即見要處理的項目。
const pendingRecords = computed(() =>
  unpaidRecords.value
    .slice()
    .sort((a, b) => String(a.due_date ?? '9999').localeCompare(String(b.due_date ?? '9999'))),
)
const settledRecords = computed(() => records.value.filter((r) => !PENDING_STATUSES.has(r.status)))
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
  if (hasUnpaid.value) return 'warn'
  return 'ok'
})
const heroStatusLabel = computed(() => {
  if (overdueAmount.value > 0) return '有逾期款項'
  if (hasUnpaid.value) return '有待繳費用'
  return '繳費無欠款'
})

async function fetchSummary() {
  try {
    const { data } = await getFeesSummary()
    summary.value = data
  } catch (err) {
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
    throw err
  }
}

async function fetchRecords() {
  // race guard：切子女時捕捉當下 id，晚到的舊子女回應（selectedId 已變）一律丟棄，
  // 避免慢回應覆蓋新子女費用。樣板同 PortalActivityView 的 attendanceRequestSeq。
  const reqId = selectedId.value
  if (!reqId) return
  loading.value = true
  try {
    const { data } = await listFeeRecords(reqId)
    if (selectedId.value !== reqId) return
    records.value = data?.items || []
  } catch (err) {
    if (selectedId.value !== reqId) return
    const e = err as Record<string, unknown>
    toast.error(String(e?.displayMessage || '載入失敗'))
    throw err
  } finally {
    // 僅當仍是最新請求才關閉 loading，避免 stale 回應誤關新請求的 spinner
    if (selectedId.value === reqId) loading.value = false
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
  const seq = ++detailSeq
  const mine = { record, payments: [] as Payment[], refunds: [] as ParentFeeRefund[] }
  detail.value = mine
  detailError.value = false
  detailLoading.value = true
  try {
    const { data } = await getFeePayments(record.id)
    if (seq !== detailSeq) return
    mine.payments = data?.payments || []
    mine.refunds = data?.refunds || []
    detail.value = { ...mine }
  } catch {
    // 失敗改在收據彈窗內顯示可重試的錯誤態，不再只跳 toast（避免顯示「無付款紀錄」的假空態）
    if (seq === detailSeq) detailError.value = true
  } finally {
    if (seq === detailSeq) detailLoading.value = false
  }
}

const formatNum = (n: number | null | undefined) => (n ?? 0).toLocaleString()

async function copyText(text: string | null | undefined) {
  if (!text) return
  if (await copyToClipboard(text)) toast.success('已複製')
  else toast.warn('無法複製，請長按手動複製')
}

function buildReceiptText(record: FeeRecord, payments: Payment[]) {
  const lines = [
    `${record.fee_item_name}（${formatSemesterLabel(record.period)}）`,
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

defineExpose({ pullRefresh })

onMounted(async () => {
  await childrenStore.load()
  ensureSelected(childrenStore.items as { student_id: number }[])
  await loadAll()
})

watch(selectedId, () => {
  loadError.value = false
  // F19：換孩子先清掉前一位的帳單；新孩子載入失敗時才會落到持久錯誤＋重試，
  // 不會因為舊 records 非空而繼續顯示 A 的帳單、同時抑制錯誤提示。
  records.value = []
  fetchRecords().catch(() => { loadError.value = true })
})

async function pullRefresh() {
  loadError.value = false
  try {
    await Promise.all([fetchSummary(), fetchRecords()])
  } catch {
    loadError.value = true
  }
}
</script>

<template>
  <PullToRefresh :on-refresh="pullRefresh" class="fees-view">
    <!-- Hero：目前孩子的未繳合計（全部未繳，不只本月）+ 到期/逾期；金額、標題、狀態同一口徑 -->
    <DashboardHero
      v-if="summary || records.length > 0"
      :eyebrow="heroEyebrow"
      :title="hasUnpaid ? '有待繳費用' : '繳費無欠款'"
      :value="heroValue"
      :sub="heroSub"
      :status-label="heroStatusLabel"
      :status-tone="heroStatusTone"
    />
    <ChildContextHeader variant="page" :inset="false" />

    <div v-if="myTotals" class="single-totals" data-testid="fees-single-totals">
      <span class="material-symbols-rounded" aria-hidden="true">account_balance_wallet</span>
      <span class="totals-text">
        {{ childName || '此學生' }}已繳 ${{ formatNum(myTotals.amount_paid) }}
        <template v-if="familyNote">・{{ familyNote }}</template>
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

    <!-- 費用列表：待繳置頂、已結清隨後；全繳清時單一列表不加組標題 -->
    <template v-if="pendingRecords.length > 0">
      <SectionHeader :title="`待繳（${pendingRecords.length} 筆）`" class="fee-group-head" />
      <FeeListGroup
        :records="pendingRecords"
        :status-label="(s) => STATUS_LABEL[s] || s"
        :status-tone="(s) => STATUS_TONE[s] ?? 'neutral'"
        @record-click="(r) => { openDetail(r as FeeRecord) }"
      />
      <SectionHeader v-if="settledRecords.length > 0" title="已結清" class="fee-group-head" />
    </template>
    <FeeListGroup
      v-if="settledRecords.length > 0"
      :records="settledRecords"
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
      :error="detailError"
      @retry="detail && openDetail(detail.record)"
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
  /* 頁面左右留白由容器統一給（2026-09-26：原本卡片貼齊螢幕邊緣） */
  padding-inline: var(--space-4, 16px);
}

.single-totals {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
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

/* 分組標題：貼齊卡片左緣，與 hero/totals 拉開節奏 */
.fee-group-head {
  margin: 4px 0 -8px;
}
</style>
