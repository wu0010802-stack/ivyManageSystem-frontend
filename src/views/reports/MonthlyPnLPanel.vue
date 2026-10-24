<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { getMonthlyPnL } from '@/api/reports'
import { apiError } from '@/utils/error'
import { formatAmount } from './reportFormat'
import { computeReportPeriod, monthState } from './useReportPeriod'
import { firstMonthWithData, type FinanceTrendRow } from './financeTrend'

const props = defineProps<{
  year: number
  /** 全模組共用的月份焦點（1–12）；改變時不重掛，表頭自行反應 */
  focusMonth: number
}>()

const emit = defineEmits<{
  'update:focusMonth': [month: number]
}>()

type Amount = number | null

interface PnLRow {
  key: string
  label: string
  unit?: string
  is_subtotal?: boolean
  is_breakdown?: boolean
  monthly?: Amount[]
  total?: Amount
}

interface PnLSection {
  key: string
  label: string
  rows?: PnLRow[]
}

interface PnLTotalLine {
  monthly: Amount[]
  total: Amount
}

interface PnLData {
  sections?: PnLSection[]
  totals?: {
    income_total?: PnLTotalLine
    refund_total?: PnLTotalLine
    expense_total?: PnLTotalLine
    net_cashflow?: PnLTotalLine
    cumulative_net?: PnLTotalLine
  }
  pending_items?: string[]
}

const loading = ref(false)
const errorMsg = ref('')
const data = ref<PnLData | null>(null)

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)
// 欄數：項目 + 12 個月 + 合計
const COLSPAN = MONTHS.length + 2

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    data.value = await getMonthlyPnL(props.year)
    await nextTick()
    ensureMonthVisible(props.focusMonth)
  } catch (e) {
    errorMsg.value = apiError(e, '載入月度現金收支表失敗')
    ElMessage.error(errorMsg.value)
    data.value = null
  } finally {
    loading.value = false
  }
}

watch(() => props.year, load, { immediate: true })

const sections = computed(() => data.value?.sections || [])
const totals = computed(() => data.value?.totals || null)
const pendingItems = computed(() => data.value?.pending_items || [])

// 空狀態：sections 全空或每個 section 的 rows 都空
const isEmpty = computed(() => {
  if (!data.value) return true
  const s = data.value.sections || []
  if (s.length === 0) return true
  return s.every(sec => !sec.rows || sec.rows.length === 0)
})

// ── 欄位狀態（過去／本月／未來／系統開始記帳前） ──────────────────────────
// 以 totals 組成月度 trend，供 computeReportPeriod 與 firstMonthWithData 共用
const trend = computed<FinanceTrendRow[]>(() => {
  const t = totals.value
  if (!t) return []
  return MONTHS.map((month, i) => ({
    month,
    revenue: t.income_total?.monthly?.[i] ?? 0,
    refund: t.refund_total?.monthly?.[i] ?? 0,
    expense: t.expense_total?.monthly?.[i] ?? 0,
    net: t.net_cashflow?.monthly?.[i] ?? 0,
  }))
})
const period = computed(() => computeReportPeriod(props.year, trend.value))
const firstDataMonth = computed(() => firstMonthWithData(trend.value))

interface ColumnInfo {
  month: number
  state: 'past' | 'current' | 'future'
  /** 年度第一個有收支的月份之前（金額格改顯示淡色「—」） */
  beforeData: boolean
}
const columns = computed<ColumnInfo[]>(() =>
  MONTHS.map(month => {
    const state = monthState(period.value, month)
    const first = firstDataMonth.value
    return { month, state, beforeData: state !== 'future' && first != null && month < first }
  }),
)

// monthly 若多於 12 格（契約外）不讓 template 因取不到欄位資訊而崩潰
function colAt(idx: number): ColumnInfo {
  return columns.value[idx] ?? { month: idx + 1, state: 'past', beforeData: false }
}

function colClass(idx: number): Record<string, boolean> {
  const c = colAt(idx)
  return {
    'col-current': c.state === 'current',
    'col-future': c.state === 'future',
    // 本月維持藍底，不疊灰底
    'col-nodata': c.beforeData && c.state === 'past',
  }
}

function headerClass(idx: number): Record<string, boolean> {
  // 焦點月加粗＋底線；與本月相同時已有藍底，不再重複強調
  return { ...colClass(idx), 'col-focus': props.focusMonth === idx + 1 && colAt(idx).state !== 'current' }
}

// ── 儲存格文字 ───────────────────────────────────────────────────────────
function formatValue(value: Amount | undefined, unit: string | undefined): string {
  if (value == null) return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  if (unit === 'amount') return num === 0 ? '—' : formatAmount(num)
  if (unit === 'person') return `${formatAmount(num)} 人`
  if (unit === 'class') return `${formatAmount(num)} 班`
  return formatAmount(num)
}

/** 月欄儲存格：未來月金額留白、記帳前金額顯示淡色「—」；統計指標（人／班）照常顯示。 */
function monthCellText(value: Amount | undefined, unit: string | undefined, idx: number): string {
  if (unit === 'amount') {
    const c = colAt(idx)
    if (c.state === 'future') return ''
    if (c.beforeData) return '—'
  }
  return formatValue(value, unit)
}

function monthCellClass(unit: string | undefined, idx: number): Record<string, boolean> {
  return {
    ...colClass(idx),
    'cell-faint': unit === 'amount' && colAt(idx).beforeData,
  }
}

function netSignClass(v: Amount | undefined): string {
  if (v == null) return ''
  const num = Number(v)
  if (!Number.isFinite(num) || num === 0) return ''
  return num > 0 ? 'cell-positive' : 'cell-negative'
}

// 結餘紅綠只給已發生且有紀錄的月份；未來月留白、記帳前中性
function netClassAt(v: Amount | undefined, idx: number): string {
  const c = colAt(idx)
  if (c.state === 'future' || c.beforeData) return ''
  return netSignClass(v)
}

// ── 合計欄：只加到最後一個非未來月（與月欄「未來月留白」一致，預登錄不計入）──────
// 後端 total 是 12 個月加總（含未來月預登錄固定支出），今年直接顯示會與月欄對不起來。
const lastShownIdx = computed(() => {
  let last = -1
  for (let i = 0; i < 12; i++) if (colAt(i).state !== 'future') last = i
  return last
})
function totalThroughCutoff(monthly: Amount[] | undefined, backendTotal: Amount): Amount {
  if (lastShownIdx.value >= 11) return backendTotal // 過去年度：整年都已發生
  if (lastShownIdx.value < 0) return null // 未來年度：還沒有實際發生
  let sum = 0
  for (let i = 0; i <= lastShownIdx.value; i++) sum += Number(monthly?.[i] ?? 0) || 0
  return sum
}
function rowTotal(row: PnLRow): Amount {
  return row.unit === 'amount' ? totalThroughCutoff(row.monthly, row.total ?? null) : (row.total ?? null)
}

// ── 合計五列（tfoot） ────────────────────────────────────────────────────
interface TotalRow {
  key: string
  label: string
  kind: 'subtotal' | 'net'
  monthly: Amount[]
  total: Amount
}

const totalRows = computed<TotalRow[]>(() => {
  const t = totals.value
  if (!t) return []
  const rows: TotalRow[] = []
  const add = (key: keyof NonNullable<PnLData['totals']>, label: string, kind: TotalRow['kind']) => {
    const line = t[key]
    if (!line) return
    const monthly = line.monthly || []
    // 累計淨現金的合計欄＝截止月的累計值；其餘四列＝加到截止月
    const total = key === 'cumulative_net'
      ? (lastShownIdx.value >= 0 ? (monthly[lastShownIdx.value] ?? null) : null)
      : totalThroughCutoff(monthly, line.total)
    rows.push({ key, label, kind, monthly, total })
  }
  add('income_total', '收入合計', 'subtotal')
  add('refund_total', '退款合計', 'subtotal')
  add('expense_total', '支出合計', 'subtotal')
  add('net_cashflow', '結餘（淨現金流）', 'net')
  // 累計淨現金＝結餘逐月累計（對齊園方 Excel「累計損益」列）；合計欄＝截止月的累計值
  add('cumulative_net', '累計淨現金', 'net')
  return rows
})

// ── 隱藏全年為 0 的列 ────────────────────────────────────────────────────
const hideZeroRows = ref(true)

function isAmountRow(row: PnLRow): boolean {
  return row.unit === 'amount'
}

function isZeroRow(row: PnLRow): boolean {
  const zero = (v: Amount | undefined) => v == null || Number(v) === 0
  return (row.monthly ?? []).every(zero) && zero(row.total)
}

type Entry =
  | { kind: 'row'; key: string; row: PnLRow }
  | { kind: 'hidden-note'; key: string; labels: string[] }
  | { kind: 'collapsed-note'; key: string; count: number }

interface DisplaySection {
  key: string
  label: string
  entries: Entry[]
  /** 本段被隱藏的列數（不含小計） */
  hiddenCount: number
}

function buildSection(section: PnLSection): DisplaySection {
  const rows = section.rows ?? []
  const asRow = (row: PnLRow): Entry => ({ kind: 'row', key: `${section.key}-${row.key}`, row })

  // 小計列不單獨隱藏；統計指標（人／班）永遠不隱藏
  const hidden = hideZeroRows.value
    ? rows.filter(r => isAmountRow(r) && !r.is_subtotal && isZeroRow(r))
    : []
  if (hidden.length === 0) {
    return { key: section.key, label: section.label, entries: rows.map(asRow), hiddenCount: 0 }
  }

  // 整段金額列全為 0：收成一行，連小計一起不顯示（統計指標列仍保留）
  if (rows.filter(isAmountRow).every(isZeroRow)) {
    return {
      key: section.key,
      label: section.label,
      entries: [
        { kind: 'collapsed-note', key: `${section.key}-collapsed`, count: hidden.length },
        ...rows.filter(r => !isAmountRow(r)).map(asRow),
      ],
      hiddenCount: hidden.length,
    }
  }

  const hiddenSet = new Set(hidden)
  const visible = rows.filter(r => !hiddenSet.has(r))
  const note: Entry = {
    kind: 'hidden-note',
    key: `${section.key}-hidden`,
    labels: hidden.map(r => r.label),
  }
  const entries = visible.map(asRow)
  // 提示列放在該段小計列之前；沒有小計就放段尾
  const subtotalAt = visible.findIndex(r => r.is_subtotal)
  entries.splice(subtotalAt === -1 ? entries.length : subtotalAt, 0, note)
  return { key: section.key, label: section.label, entries, hiddenCount: hidden.length }
}

const displaySections = computed(() => sections.value.map(buildSection))
const hiddenTotal = computed(() => displaySections.value.reduce((n, s) => n + s.hiddenCount, 0))

function showAllRows() {
  hideZeroRows.value = false
}

// ── 月份焦點與捲動 ───────────────────────────────────────────────────────
function selectMonth(month: number) {
  emit('update:focusMonth', month)
}

const pnlScrollRef = ref<HTMLElement | null>(null)

/** 只在焦點月欄被捲出可視區時才捲動，避免點表頭時畫面跳動。 */
function ensureMonthVisible(month: number) {
  const box = pnlScrollRef.value
  const th = box?.querySelector<HTMLElement>(`thead th[data-month="${month}"]`)
  if (!box || !th) return
  const stickyWidth = box.querySelector<HTMLElement>('thead th.col-label')?.offsetWidth ?? 0
  const margin = 16
  const left = th.offsetLeft
  const right = left + th.offsetWidth
  if (left < box.scrollLeft + stickyWidth) {
    box.scrollLeft = Math.max(0, left - stickyWidth - margin)
  } else if (right > box.scrollLeft + box.clientWidth) {
    box.scrollLeft = right - box.clientWidth + margin
  }
}

watch(() => props.focusMonth, month => ensureMonthVisible(month))
</script>

<template>
  <el-skeleton v-if="loading && !data" :rows="12" animated />
  <div v-else-if="errorMsg && !data" class="pnl-error" data-test="pnl-error">
    <el-empty :description="errorMsg">
      <el-button type="primary" data-test="pnl-reload" @click="load">重新載入</el-button>
    </el-empty>
  </div>
  <div v-else-if="isEmpty" class="pnl-empty">
    <el-empty description="此年度尚無現金收支資料" />
  </div>
  <div v-else class="monthly-pnl">
    <div class="pnl-toolbar">
      <div class="toolbar-left">
        <el-switch
          v-model="hideZeroRows"
          size="small"
          aria-label="隱藏全年為 0 的列"
          data-test="hide-zero-switch"
        />
        <span class="toolbar-text">隱藏全年為 0 的列</span>
        <span
          v-if="hideZeroRows && hiddenTotal > 0"
          class="toolbar-hint"
          data-test="pnl-hidden-count"
        >（已隱藏 {{ hiddenTotal }} 列）</span>
      </div>
      <div class="toolbar-legend" data-test="pnl-legend">灰底＝系統開始記帳前　藍底＝本月（進行中）　空白＝未來月<template v-if="period.isCurrentYear">　合計只算到本月</template></div>
    </div>

    <div class="pnl-scroll" ref="pnlScrollRef">
      <table class="pnl-table" aria-label="月度現金收支表">
        <thead>
          <tr>
            <th class="col-label sticky-col">項目</th>
            <th
              v-for="m in MONTHS"
              :key="m"
              class="col-month"
              :class="headerClass(m - 1)"
              :data-month="m"
              :title="columns[m - 1].state === 'future' ? '預登錄（尚未發生）' : undefined"
            >
              <button
                type="button"
                class="month-btn"
                :aria-current="props.focusMonth === m ? 'true' : undefined"
                :data-test="`month-btn-${m}`"
                @click="selectMonth(m)"
              >{{ m }} 月</button>
            </th>
            <th class="col-total">合計</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="section in displaySections" :key="section.key">
            <tr class="section-header-row">
              <th class="section-header-label" :colspan="COLSPAN">{{ section.label }}</th>
            </tr>
            <template v-for="entry in section.entries" :key="entry.key">
              <tr
                v-if="entry.kind === 'row'"
                :class="{
                  'row-subtotal': entry.row.is_subtotal,
                  'row-breakdown': entry.row.is_breakdown,
                }"
                :data-row-key="entry.row.key"
              >
                <th class="sticky-col row-label">{{ entry.row.label }}</th>
                <td
                  v-for="(value, idx) in (entry.row.monthly || [])"
                  :key="idx"
                  class="cell-num"
                  :class="monthCellClass(entry.row.unit, idx)"
                >{{ monthCellText(value, entry.row.unit, idx) }}</td>
                <td class="cell-num col-total">
                  {{ entry.row.total == null ? '—' : formatValue(rowTotal(entry.row), entry.row.unit) }}
                </td>
              </tr>
              <tr
                v-else-if="entry.kind === 'hidden-note'"
                class="row-note"
                :data-test="`hidden-note-${section.key}`"
              >
                <td class="note-cell" :colspan="COLSPAN">
                  <div class="note-inner">
                    <span>已隱藏 {{ entry.labels.length }} 列全年為 0：{{ entry.labels.join('、') }}</span>
                    <button type="button" class="link-btn" data-test="show-hidden-rows" @click="showAllRows">顯示</button>
                  </div>
                </td>
              </tr>
              <tr v-else-if="entry.kind === 'collapsed-note'" class="row-note row-collapsed" :data-test="`section-collapsed-${section.key}`">
                <td class="note-cell" :colspan="COLSPAN">
                  <div class="note-inner">
                    <span>{{ entry.count }} 個科目全年為 0</span>
                    <button type="button" class="link-btn" data-test="expand-section" @click="showAllRows">展開</button>
                  </div>
                </td>
              </tr>
            </template>
          </template>
        </tbody>
        <!-- 合計五列：sticky 貼在捲動容器底部，捲到哪都看得到 -->
        <tfoot>
          <tr
            v-for="row in totalRows"
            :key="row.key"
            class="row-grand-total"
            :class="{ 'row-net': row.kind === 'net' }"
            :data-row-key="row.key"
          >
            <th class="sticky-col row-label">{{ row.label }}</th>
            <td
              v-for="(value, idx) in row.monthly"
              :key="idx"
              class="cell-num"
              :class="[monthCellClass('amount', idx), row.kind === 'net' ? netClassAt(value, idx) : '']"
            >{{ monthCellText(value, 'amount', idx) }}</td>
            <td
              class="cell-num col-total"
              :class="row.kind === 'net' ? netSignClass(row.total) : ''"
            >{{ formatValue(row.total, 'amount') }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <section v-if="pendingItems.length > 0" class="pnl-pending" data-test="pnl-pending">
      <h4 class="pending-title">還沒算進本表的項目</h4>
      <p class="pending-sub">要在「收付款管理」登錄後才會出現</p>
      <ul class="pending-list">
        <li v-for="(item, idx) in pendingItems" :key="idx">{{ item }}</li>
      </ul>
      <p class="pending-links">
        收入類（如畢冊、預繳）請至
        <router-link :to="{ path: '/finance-signoffs', query: { tab: 'misc' } }">雜項收款</router-link>
        分頁登錄；支出類請至
        <router-link :to="{ path: '/finance-signoffs', query: { tab: 'vendor' } }">廠商付款</router-link>
        分頁登錄。
      </p>
    </section>
  </div>
</template>

<style scoped>
.monthly-pnl {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  /* tfoot 每列固定高度，sticky bottom 才能逐列疊出正確偏移 */
  --pnl-foot-row-h: 36px;
}

/* === 工具列：左開關、右圖例 === */
.pnl-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2) var(--space-4);
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.toolbar-text {
  font-size: var(--text-sm);
  color: var(--el-text-color-regular);
}
.toolbar-hint,
.toolbar-legend {
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}

/* === 捲動容器：縱橫皆捲，表頭／表尾／項目欄 sticky 都以它為基準 === */
.pnl-scroll {
  overflow: auto;
  max-height: max(360px, calc(100vh - 260px));
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-sm);
  background: var(--el-bg-color);
}

.pnl-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

/* === thead === */
.pnl-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--el-fill-color-light);
  font-weight: 600;
  text-align: right;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--el-border-color-lighter);
  white-space: nowrap;
}
.pnl-table thead th.col-label {
  text-align: left;
  z-index: 3;
}
.pnl-table thead th.col-month {
  min-width: 76px;
}
.pnl-table thead th.col-total {
  min-width: 96px;
  border-left: 1px solid var(--el-border-color-lighter);
}

/* 表頭月份按鈕：外觀同文字，鍵盤可聚焦 */
.month-btn {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.month-btn:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.month-btn:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* 當月高亮／未來月淡化／記帳前灰底 */
.pnl-table .col-current {
  background: var(--el-color-primary-light-9);
}
.pnl-table thead th.col-current {
  background: var(--el-color-primary-light-8);
}
/* dark mode：歷史上 html.ivy-admin（main.css）曾把 --el-color-primary-light-* 釘死成
   light hex 不隨 html.dark 翻轉，此處因而需要窄覆寫。根因已修（main.css 改
   html.ivy-admin:not(.dark) 限定 + a11y.css 的 html.dark.ivy-admin 補齊 dark 色階），
   selector 保留、值改回 token 與 base 規則等值。 */
html.dark .pnl-table .col-current {
  background: var(--el-color-primary-light-9);
}
html.dark .pnl-table thead th.col-current {
  background: var(--el-color-primary-light-8);
}
.pnl-table .col-future {
  color: var(--el-text-color-placeholder);
}
.pnl-table thead th.col-future {
  color: var(--el-text-color-placeholder);
  font-weight: 400;
}
/* 記帳前灰底：fill-color-light 在白底上幾乎看不出來，改用 neutral-100（表頭同色） */
.pnl-table .col-nodata,
.pnl-table thead th.col-nodata {
  background: var(--color-neutral-100);
}
.pnl-table .cell-faint {
  color: var(--el-text-color-placeholder);
}
/* 焦點月（與本月不同時）：加粗＋底線 */
.pnl-table thead th.col-focus .month-btn {
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* === sticky 第一欄（thead 也吃這條 + top） === */
.sticky-col {
  position: sticky;
  left: 0;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
  text-align: left;
  z-index: 1;
}
.pnl-table thead .sticky-col {
  background: var(--el-fill-color-light);
}

/* === section header 列 === */
.section-header-row .section-header-label {
  background: var(--el-fill-color-light);
  font-weight: 600;
  text-align: left;
  padding: var(--space-2) var(--space-3);
  color: var(--el-text-color-regular);
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
}

/* === tbody 一般列 === */
.pnl-table tbody td,
.pnl-table tbody th {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.pnl-table tbody .row-label {
  font-weight: normal;
  text-align: left;
  white-space: nowrap;
}
.cell-num {
  text-align: right;
  white-space: nowrap;
}
.pnl-table tbody td.col-total {
  border-left: 1px solid var(--el-border-color-lighter);
}

/* 小計列：粗體 + 淺底 */
.row-subtotal td,
.row-subtotal th {
  font-weight: 600;
  background: var(--el-fill-color-lighter);
}
.row-subtotal .sticky-col {
  background: var(--el-fill-color-lighter);
}

/* 切片資訊列：縮排 + 柔色，視覺降階以免被誤判為重複計算 */
.row-breakdown td,
.row-breakdown th {
  color: var(--el-text-color-secondary);
  font-style: italic;
}
.row-breakdown .row-label {
  padding-left: var(--space-6);
}

/* 「已隱藏 N 列」／「N 個科目全年為 0」提示列 */
.pnl-table tbody .note-cell {
  background: var(--el-bg-color);
  text-align: left;
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}
.note-inner {
  /* 跨欄提示文字固定在可視區左側，橫捲時不會被帶走 */
  position: sticky;
  left: var(--space-3);
  width: max-content;
  max-width: min(64ch, calc(100vw - 96px));
  white-space: normal;
}
.link-btn {
  margin-left: var(--space-2);
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--el-color-primary);
  cursor: pointer;
}
.link-btn:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.link-btn:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

/* === 合計五列（tfoot）：sticky 貼底，由下往上逐列疊出偏移 === */
.pnl-table tfoot td,
.pnl-table tfoot th {
  position: sticky;
  z-index: 2;
  box-sizing: border-box;
  height: var(--pnl-foot-row-h);
  padding: 0 var(--space-3);
  font-weight: 600;
  white-space: nowrap;
  background: var(--el-fill-color-light);
  border-top: 1px solid var(--el-border-color);
}
.pnl-table tfoot .sticky-col {
  z-index: 3;
}
.pnl-table tfoot tr:nth-last-child(1) > * { bottom: 0; }
.pnl-table tfoot tr:nth-last-child(2) > * { bottom: var(--pnl-foot-row-h); }
.pnl-table tfoot tr:nth-last-child(3) > * { bottom: calc(var(--pnl-foot-row-h) * 2); }
.pnl-table tfoot tr:nth-last-child(4) > * { bottom: calc(var(--pnl-foot-row-h) * 3); }
.pnl-table tfoot tr:nth-last-child(5) > * { bottom: calc(var(--pnl-foot-row-h) * 4); }
.pnl-table tfoot td.col-total {
  border-left: 1px solid var(--el-border-color-lighter);
}
/* tfoot 底色本身已是 fill-color-light，記帳前灰底要再深一階才看得出來 */
.pnl-table tfoot td.col-nodata {
  background: var(--color-neutral-200);
}

/* 結餘列：正綠負紅（負數另有「-」號，不只靠顏色） */
.row-net .cell-positive {
  color: var(--el-color-success);
}
.row-net .cell-negative {
  color: var(--el-color-danger);
}

/* === 註腳：還沒算進本表的項目 === */
.pnl-pending {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-sm);
  background: var(--el-fill-color-lighter);
}
.pending-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.pending-sub {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}
.pending-list {
  margin: var(--space-2) 0 0;
  padding-left: var(--space-5);
  color: var(--el-text-color-regular);
  font-size: var(--text-sm);
  line-height: 1.7;
}
.pending-list li {
  margin: var(--space-1) 0;
}
.pending-links {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}

.pnl-error,
.pnl-empty {
  padding: var(--space-8) 0;
}

@media (--to-sm) {
  .pnl-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
