<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { getMonthlyPnL } from '@/api/reports'
import { apiError } from '@/utils/error'

const props = defineProps({
  year: { type: Number, required: true },
})

const loading = ref(false)
const errorMsg = ref('')
const data = ref(null)

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

// 千分位金額（無小數、無 $）。0 / null → '—'
const amountFormatter = new Intl.NumberFormat('zh-TW')
function formatCell(value, unit) {
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
  } catch (e) {
    errorMsg.value = apiError(e, '載入月度損益表失敗')
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

// 把 totals 物件展平成 4 條尾列，方便 template loop
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
  return rows
})

function netCellClass(v) {
  if (v == null) return ''
  const num = Number(v)
  if (!Number.isFinite(num) || num === 0) return ''
  return num > 0 ? 'cell-positive' : 'cell-negative'
}
</script>

<template>
  <el-skeleton v-if="loading && !data" :rows="12" animated />
  <div v-else-if="errorMsg && !data" class="pnl-error">
    <el-empty :description="errorMsg" />
  </div>
  <div v-else-if="isEmpty" class="pnl-empty">
    <el-empty description="此年度尚無損益資料" />
  </div>
  <div v-else class="monthly-pnl">
    <div class="pnl-scroll">
      <table class="pnl-table">
        <thead>
          <tr>
            <th class="col-label sticky-col">項目</th>
            <th v-for="m in MONTHS" :key="m" class="col-month">{{ m }} 月</th>
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
              :class="row.kind === 'net' ? netCellClass(value) : ''"
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
          以下項目尚未自動整合，可至「廠商付款」模組（<router-link :to="{ name: 'vendor-payments' }">廠商付款簽收</router-link>）登錄
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

.pnl-scroll {
  overflow-x: auto;
  /* sticky 第一欄靠 overflow container 觸發 */
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: #fff;
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

/* === sticky 第一欄（thead 也吃這條 + top） === */
.sticky-col {
  position: sticky;
  left: 0;
  background: #fff;
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
