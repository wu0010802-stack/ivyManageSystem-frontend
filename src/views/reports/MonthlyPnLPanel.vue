<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { getMonthlyPnL, monthlyPnlExportUrl } from '@/api/reports'
import { apiError } from '@/utils/error'
import { downloadFile } from '@/utils/download'
import { computeReportPeriod } from './useReportPeriod'

const props = defineProps<{
  year: number
}>()

const loading = ref(false)
const errorMsg = ref('')
const data = ref<{
  sections?: Array<{ key: string; label: string; rows?: Array<{ key: string; label: string; unit?: string; is_subtotal?: boolean; is_breakdown?: boolean; monthly?: (number | null)[]; total?: number | null }> }>
  totals?: {
    income_total?: { monthly: (number | null)[]; total: number | null }
    refund_total?: { monthly: (number | null)[]; total: number | null }
    expense_total?: { monthly: (number | null)[]; total: number | null }
    net_cashflow?: { monthly: (number | null)[]; total: number | null }
    cumulative_net?: { monthly: (number | null)[]; total: number | null }
  }
  pending_items?: string[]
} | null>(null)

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

// 千分位金額（無小數、無 $）。0 / null → '—'
const amountFormatter = new Intl.NumberFormat('zh-TW')
function formatCell(value: number | null | undefined, unit: string | undefined) {
  if (value == null) return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  if (unit === 'amount') {
    if (num === 0) return '—'
    return amountFormatter.format(num)
  }
  if (unit === 'person') return `${amountFormatter.format(num)} 人`
  if (unit === 'class') return `${amountFormatter.format(num)} 班`
  return amountFormatter.format(num)
}

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    data.value = await getMonthlyPnL(props.year)
    await nextTick()
    if (currentMonthIdx.value != null) scrollToCurrentMonth()
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

// 把 totals 物件展平成 5 條尾列，方便 template loop
// 注意：使用 amount 單位（千分位、0→—）
const totalRows = computed(() => {
  if (!totals.value) return []
  const rows = []
  if (totals.value.income_total) {
    rows.push({ key: 'income_total', label: '收入合計', kind: 'subtotal', monthly: totals.value.income_total.monthly, total: totals.value.income_total.total })
  }
  if (totals.value.refund_total) {
    rows.push({ key: 'refund_total', label: '退款合計', kind: 'subtotal', monthly: totals.value.refund_total.monthly, total: totals.value.refund_total.total })
  }
  if (totals.value.expense_total) {
    rows.push({ key: 'expense_total', label: '支出合計', kind: 'subtotal', monthly: totals.value.expense_total.monthly, total: totals.value.expense_total.total })
  }
  if (totals.value.net_cashflow) {
    rows.push({ key: 'net_cashflow', label: '結餘（淨現金流）', kind: 'net', monthly: totals.value.net_cashflow.monthly, total: totals.value.net_cashflow.total })
  }
  if (totals.value.cumulative_net) {
    // 累計淨現金＝結餘逐月累計（對齊園方 Excel「累計損益」列）；合計欄=年末累計值
    rows.push({ key: 'cumulative_net', label: '累計淨現金', kind: 'net', monthly: totals.value.cumulative_net.monthly, total: totals.value.cumulative_net.total })
  }
  return rows
})

const exporting = ref(false)
const exportXlsx = async () => {
  exporting.value = true
  try {
    await downloadFile(monthlyPnlExportUrl(props.year), `現金收支表_${props.year}.xlsx`)
  } catch (e) {
    ElMessage.error(apiError(e, '匯出失敗'))
  } finally {
    exporting.value = false
  }
}

function netCellClass(v: number | null | undefined) {
  if (v == null) return ''
  const num = Number(v)
  if (!Number.isFinite(num) || num === 0) return ''
  return num > 0 ? 'cell-positive' : 'cell-negative'
}

// 當月高亮／未來月淡化（spec §6）：cutoff 僅依年度與今天，不需 trend
const period = computed(() => computeReportPeriod(props.year))
const currentMonthIdx = computed(() =>
  period.value.isCurrentYear && period.value.cutoffMonth >= 1 ? period.value.cutoffMonth - 1 : null)

function monthColClass(idx: number): Record<string, boolean> {
  return {
    'col-current': currentMonthIdx.value === idx,
    'col-future': idx + 1 > period.value.cutoffMonth,
  }
}

// 結餘紅綠只給已發生月份；未來月（預登錄）中性
function netCellClassAt(v: number | null | undefined, idx: number): string {
  if (idx + 1 > period.value.cutoffMonth) return ''
  return netCellClass(v)
}

const pnlScrollRef = ref<HTMLElement | null>(null)
function scrollToCurrentMonth() {
  const el = pnlScrollRef.value?.querySelector<HTMLElement>('thead th.col-current')
  const stickyw = pnlScrollRef.value?.querySelector<HTMLElement>('thead th.col-label')?.offsetWidth ?? 0
  if (el && pnlScrollRef.value) {
    pnlScrollRef.value.scrollLeft = Math.max(0, el.offsetLeft - stickyw - 16)
  }
}
</script>

<template>
  <el-skeleton v-if="loading && !data" :rows="12" animated />
  <div v-else-if="errorMsg && !data" class="pnl-error">
    <el-empty :description="errorMsg" />
  </div>
  <div v-else-if="isEmpty" class="pnl-empty">
    <el-empty description="此年度尚無現金收支資料" />
  </div>
  <div v-else class="monthly-pnl">
    <div class="pnl-header">
      <h3 class="panel-title" data-test="pnl-title">月度現金收支表</h3>
      <el-tag type="info" effect="plain" size="small" data-test="pnl-cashbasis-badge">現金收付實現制</el-tag>
      <el-button v-if="period.isCurrentYear" size="small" data-test="jump-to-current" @click="scrollToCurrentMonth">
        跳到本月
      </el-button>
      <el-button :icon="Download" :loading="exporting" size="small" data-test="pnl-export" @click="exportXlsx">
        匯出 Excel
      </el-button>
    </div>
    <div class="pnl-scroll" ref="pnlScrollRef">
      <table class="pnl-table">
        <thead>
          <tr>
            <th class="col-label sticky-col">項目</th>
            <th
              v-for="m in MONTHS"
              :key="m"
              class="col-month"
              :class="monthColClass(m - 1)"
              :title="m > period.cutoffMonth ? '預登錄（尚未發生）' : undefined"
            >{{ m }} 月</th>
            <th class="col-total">合計</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="section in sections" :key="section.key">
            <tr class="section-header-row">
              <th class="sticky-col section-header-label" :colspan="14">{{ section.label }}</th>
            </tr>
            <tr
              v-for="row in section.rows"
              :key="`${section.key}-${row.key}`"
              :class="{
                'row-subtotal': row.is_subtotal,
                'row-breakdown': row.is_breakdown,
              }"
              :data-row-key="row.key"
            >
              <th class="sticky-col row-label">{{ row.label }}</th>
              <td
                v-for="(value, idx) in (row.monthly || [])"
                :key="idx"
                class="cell-num"
                :class="monthColClass(idx)"
              >
                {{ formatCell(value, row.unit) }}
              </td>
              <td class="cell-num col-total">
                {{ row.total == null ? '—' : formatCell(row.total, row.unit) }}
              </td>
            </tr>
          </template>

          <!-- 4 條合計尾列 -->
          <tr
            v-for="row in totalRows"
            :key="row.key"
            class="row-grand-total"
            :class="{ 'row-net': row.kind === 'net' }"
            :data-row-key="row.key"
          >
            <th class="sticky-col row-label">{{ row.label }}</th>
            <td
              v-for="(value, idx) in (row.monthly || [])"
              :key="idx"
              class="cell-num"
              :class="[monthColClass(idx), row.kind === 'net' ? netCellClassAt(value, idx) : '']"
            >
              {{ formatCell(value, 'amount') }}
            </td>
            <td
              class="cell-num col-total"
              :class="row.kind === 'net' ? netCellClass(row.total) : ''"
            >
              {{ formatCell(row.total, 'amount') }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="pendingItems.length > 0" class="pnl-pending">
      <el-alert
        type="info"
        :closable="false"
        show-icon
      >
        <template #title>
          以下項目尚未自動整合，請至「收付款管理」登錄：收入類（如畢冊、預繳）至
          <router-link :to="{ path: '/finance-signoffs', query: { tab: 'misc' } }">雜項收款</router-link>
          分頁；支出類至
          <router-link :to="{ path: '/finance-signoffs', query: { tab: 'vendor' } }">廠商付款</router-link>
          分頁
        </template>
        <ul class="pending-list">
          <li v-for="(item, idx) in pendingItems" :key="idx">{{ item }}</li>
        </ul>
      </el-alert>
    </div>
  </div>
</template>

<style scoped>
.monthly-pnl {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.pnl-header {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pnl-header .panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.pnl-scroll {
  overflow-x: auto;
  /* sticky 第一欄靠 overflow container 觸發 */
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-bg-color);
}

.pnl-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
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
  padding: 8px 10px;
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

/* 當月高亮／未來月淡化（spec §6） */
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
  padding: 6px 10px;
  color: var(--el-text-color-regular);
  border-top: 1px solid var(--el-border-color-lighter);
  border-bottom: 1px solid var(--el-border-color-lighter);
  /* colspan 14 時不該 sticky；強制覆蓋 */
  position: static;
  z-index: auto;
}

/* === tbody 一般列 === */
.pnl-table tbody td,
.pnl-table tbody th {
  padding: 6px 10px;
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
  padding-left: 24px;
}

/* 4 條合計尾列 */
.row-grand-total td,
.row-grand-total th {
  font-weight: 600;
  background: var(--el-fill-color-light);
  border-top: 1px solid var(--el-border-color);
}
.row-grand-total .sticky-col {
  background: var(--el-fill-color-light);
}

/* 結餘列：正綠負紅 */
.row-net .cell-positive {
  color: var(--el-color-success);
}
.row-net .cell-negative {
  color: var(--el-color-danger);
}

/* === pending_items 附錄 === */
.pnl-pending {
  margin-top: 4px;
}
.pending-list {
  margin: 6px 0 0 0;
  padding-left: 20px;
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.7;
}
.pending-list li {
  margin: 2px 0;
}

.pnl-error,
.pnl-empty {
  padding: 32px 0;
}
</style>
