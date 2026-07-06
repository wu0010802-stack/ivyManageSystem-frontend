<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCachedAsync } from '@/composables/useCachedAsync'
import { getDashboard, getFinanceSummary } from '@/api/reports'
import { getMonthlyFixedCosts } from '@/api/monthlyFixedCost'
import { getVendorPaymentSummary } from '@/api/vendorPayment'
import { getMiscReceiptSummary } from '@/api/miscReceipt'
import { hasPermission } from '@/utils/auth'
import {
  Money, Coin, Wallet, TrendCharts, Calendar, Check, DataAnalysis,
  Warning, CircleCheck, Link as LinkIcon,
} from '@element-plus/icons-vue'
import { money } from '@/utils/format'
import { apiError } from '@/utils/error'
import { lastMonthWithData, pctChange, type FinanceTrendRow } from './financeTrend'

const props = defineProps<{
  year: number
}>()

// 註：ReportsView.vue 對每個 panel 都掛 `:key="selectedYear"`，年度切換時整個
// OverviewPanel 會被銷毀重掛（非同一 instance 內改 prop），下面幾個
// `reports/xxx:${props.year}` cache key 只需在 setup 當下算一次即可。
const dashboard = useCachedAsync(
  `reports/dashboard:${props.year}`,
  () => getDashboard({ year: props.year }).then(r => r.data),
  { ttl: 300_000 }
)
const finance = useCachedAsync(
  `reports/finance:${props.year}`,
  () => getFinanceSummary(props.year).then(r => r.data),
  { ttl: 300_000 }
)
// YoY：整年對比去年同期（金額指標）。與 finance 共用同一把 cache key 格式，
// 若使用者曾把年度切到去年，這裡會直接命中快取。
const prevYearFinance = useCachedAsync(
  `reports/finance:${props.year - 1}`,
  () => getFinanceSummary(props.year - 1).then(r => r.data),
  { ttl: 300_000 }
)

const loading = computed(() =>
  (dashboard.pending.value && !dashboard.data.value) ||
  (finance.pending.value && !finance.data.value)
)

// API 錯誤與「真零值」視覺區分（2026-07-05 稽核 P2）：只有在「真的沒有任何資料
// 可顯示」（含 stale cache 都沒有）時才視為不可用，顯示持久性錯誤區塊；
// 若已有（哪怕是稍舊的）快取資料，仍優先顯示資料本身。
const financeUnavailable = computed(() => !!finance.error.value && !finance.data.value)
const dashboardUnavailable = computed(() => !!dashboard.error.value && !dashboard.data.value)
const financeErrorText = computed(() => apiError(finance.error.value, '載入收支資料失敗'))
const dashboardErrorText = computed(() => apiError(dashboard.error.value, '載入出勤／薪資資料失敗'))

const summary = computed(() => finance.data.value?.summary || {
  total_revenue: 0,
  total_refund: 0,
  net_revenue: 0,
  total_expense: 0,
  net_cashflow: 0,
})

// MoM：錨定「所選年度內最後一個有資料的月份」，取代舊版錨定瀏覽器當下真實月份
// 的 bug（瀏覽非當年時「vs 上月」會跟「現在」脫鉤，見 financeTrend.ts 註解）。
const mom = computed(() => {
  const trend: FinanceTrendRow[] = finance.data.value?.monthly_trend || []
  const anchorMonth = lastMonthWithData(trend)
  if (anchorMonth == null) return null
  const curr = trend.find(r => r.month === anchorMonth)
  const prev = trend.find(r => r.month === anchorMonth - 1)
  if (!curr || !prev) return null
  return {
    revenue: pctChange(curr.revenue, prev.revenue),
    expense: pctChange(curr.expense, prev.expense),
    net: pctChange(curr.net, prev.net),
  }
})

// YoY：呼叫 getFinanceSummary(year-1) 取整年加總對比。去年無資料（分母為 0）
// 時 pctChange 回 null，UI 顯示「無去年資料」而非 -100%/∞。
const yoy = computed(() => {
  const curr = finance.data.value?.summary
  const prev = prevYearFinance.data.value?.summary
  if (!curr || !prev) return null
  return {
    revenue: pctChange(curr.total_revenue, prev.total_revenue),
    expense: pctChange(curr.total_expense, prev.total_expense),
    net: pctChange(curr.net_cashflow, prev.net_cashflow),
  }
})

const netClass = computed(() => {
  const v = summary.value.net_cashflow || 0
  if (v > 0) return 'value-green'
  if (v < 0) return 'value-red'
  return ''
})

// 年度出勤率：加權平均（Σ(total_records×rate)/Σtotal_records，等價 Σnormal/Σtotal），
// 取代舊版「月度 rate 算術平均」（各月同權重，出勤紀錄筆數差異大時會失真，
// 2026-07-05 稽核 P2）。
const weightedAttendanceRate = computed(() => {
  const arr: Array<{ total_records?: number; rate?: number }> = dashboard.data.value?.attendance_monthly || []
  let weightedSum = 0
  let totalRecords = 0
  for (const d of arr) {
    const records = d.total_records || 0
    weightedSum += records * (d.rate || 0)
    totalRecords += records
  }
  if (!totalRecords) return null
  return (weightedSum / totalRecords).toFixed(1)
})

const formatPct = (v: number | null): string | null => {
  if (v == null || !Number.isFinite(v)) return null
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}

// ── 異常與待辦 ──────────────────────────────────────────────────────────
// 僅用現有可靠來源；無現成 API 的待辦（如廠商付款/雜項收款簽收清單）一律
// 顯示為連結導向 /finance-signoffs，不虛構數字（硬性原則：無可靠來源不顯示 0）。

const salaryPendingAlert = computed(() => {
  const rows: Array<{ month: number; employee_count_pending?: number }> = dashboard.data.value?.salary_monthly || []
  if (!rows.length) return null
  const last = rows[rows.length - 1]
  if (!last.employee_count_pending) return null
  return { month: last.month, count: last.employee_count_pending }
})

// 固定支出未登錄月份：直接呼叫 getMonthlyFixedCosts(year)（不走 useCachedAsync，
// 屬次要提示資訊，比照 FinanceSummaryPanel 選月下鑽的「直接 axios、不寫共用 cache」
// 策略）。底層端點要求 VENDOR_PAYMENT_READ（獨立於本頁 REPORTS 權限），無此權限
// 角色直接略過此項（不顯示錯誤，因為這只是次要提醒，非本頁核心資料）。
const fixedCostEntries = ref<Array<{ month: number; category: string; amount: number }>>([])
// 無權限／fetch 失敗都代表「查不到」，不等於「查到了、全部沒登錄」——否則
// missingFixedCostMonths 會把整年 12 個月都誤判成待辦，屬於「無可靠來源時
// 顯示假資料」的反例，必須用獨立旗標排除，不能只靠 fixedCostEntries 是否為空陣列判斷。
const canCheckFixedCost = hasPermission('VENDOR_PAYMENT_READ')
const fixedCostCheckFailed = ref(false)
if (canCheckFixedCost) {
  getMonthlyFixedCosts(props.year)
    .then((entries) => { fixedCostEntries.value = Array.isArray(entries) ? entries : [] })
    .catch(() => { fixedCostCheckFailed.value = true })
}

// 「當前月份」只在瀏覽真實今年時有意義；瀏覽過去年度全年皆已「過去」，
// 未來年度則尚無任何月份該登錄。
const REAL_TODAY = new Date()
const cutoffMonth = computed(() => {
  if (props.year < REAL_TODAY.getFullYear()) return 12
  if (props.year > REAL_TODAY.getFullYear()) return 0
  return REAL_TODAY.getMonth() + 1
})

const missingFixedCostMonths = computed(() => {
  if (!canCheckFixedCost || fixedCostCheckFailed.value) return []
  const cutoff = cutoffMonth.value
  if (cutoff <= 0) return []
  const sums: Record<number, number> = {}
  for (const e of fixedCostEntries.value) {
    sums[e.month] = (sums[e.month] || 0) + (Number(e.amount) || 0)
  }
  const out: number[] = []
  for (let m = 1; m <= cutoff; m++) {
    if (!sums[m]) out.push(m)
  }
  return out
})

// 待簽收數字（廠商付款/雜項收款）：summary 端點不吃年度參數——全期間、全狀態
// 拆桶（pending/signed），待辦語意本來就是「現在待處理」，故不傳 year；文案冠
// 「目前」避免被誤讀為所選年度的數字。null = 查不到（無權限/載入中/失敗/shape
// 不符），比照上方固定支出檢查模式：查不到就整項不顯示，絕不顯示 0 假資料。
interface PendingSignoff { count: number; amount: number }
const canCheckVendorSignoff = hasPermission('VENDOR_PAYMENT_READ')
const canCheckMiscSignoff = hasPermission('MISC_RECEIPT_READ')
const vendorSignoff = ref<PendingSignoff | null>(null)
const miscSignoff = ref<PendingSignoff | null>(null)

function toPendingSignoff(raw: unknown): PendingSignoff | null {
  const d = raw as { pending_count?: unknown; pending_amount?: unknown } | null
  if (!d || typeof d.pending_count !== 'number') return null
  return {
    count: d.pending_count,
    amount: typeof d.pending_amount === 'number' ? d.pending_amount : 0,
  }
}
if (canCheckVendorSignoff) {
  getVendorPaymentSummary()
    .then((res) => { vendorSignoff.value = toPendingSignoff(res.data) })
    .catch(() => { vendorSignoff.value = null })
}
if (canCheckMiscSignoff) {
  getMiscReceiptSummary()
    .then((res) => { miscSignoff.value = toPendingSignoff(res.data) })
    .catch(() => { miscSignoff.value = null })
}

// 簽收連結四態：hidden（兩權限皆無，連 /finance-signoffs 都進不去）/
// action（有待簽收，數字已列在待辦清單）/ omitted（兩來源皆確知 0 筆，無事可辦）/
// neutral（至少一來源查不到——無權限或失敗——不能宣稱「無待辦」，給中性導覽連結）。
const signoffLinkState = computed<'hidden' | 'action' | 'omitted' | 'neutral'>(() => {
  if (!canCheckVendorSignoff && !canCheckMiscSignoff) return 'hidden'
  const anyPending = (vendorSignoff.value?.count || 0) > 0 || (miscSignoff.value?.count || 0) > 0
  if (anyPending) return 'action'
  const bothKnownZero =
    canCheckVendorSignoff && vendorSignoff.value?.count === 0 &&
    canCheckMiscSignoff && miscSignoff.value?.count === 0
  return bothKnownZero ? 'omitted' : 'neutral'
})

interface TodoItem { key: string; text: string }
const todoItems = computed<TodoItem[]>(() => {
  const items: TodoItem[] = []
  if (salaryPendingAlert.value) {
    items.push({
      key: 'salary-pending',
      text: `${salaryPendingAlert.value.month} 月尚有 ${salaryPendingAlert.value.count} 筆薪資未封存`,
    })
  }
  for (const m of missingFixedCostMonths.value) {
    items.push({ key: `fixed-cost-${m}`, text: `${m} 月固定支出尚未登錄` })
  }
  if (vendorSignoff.value && vendorSignoff.value.count > 0) {
    items.push({
      key: 'vendor-pending',
      text: `目前 ${vendorSignoff.value.count} 筆廠商付款待簽收（${money(vendorSignoff.value.amount)}）`,
    })
  }
  if (miscSignoff.value && miscSignoff.value.count > 0) {
    items.push({
      key: 'misc-pending',
      text: `目前 ${miscSignoff.value.count} 筆雜項收款待簽收（${money(miscSignoff.value.amount)}）`,
    })
  }
  return items
})

// ── 資料說明 ────────────────────────────────────────────────────────────
// 資料更新時間：直接讀 useCachedAsync 的 fetchedAt（真實快取寫入時間，非推算值）。
const formatFetchedAt = (ts: number) => {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-Hant', { hour12: false, timeZone: 'Asia/Taipei' })
}
</script>

<template>
  <el-skeleton v-if="loading" :rows="10" animated />
  <div v-else class="overview">
    <!-- a. KPI 帶 -->
    <div v-if="financeUnavailable" class="section-error" data-test="finance-error">
      <el-empty :description="financeErrorText" />
    </div>
    <template v-else>
      <el-row :gutter="16" class="kpi-row">
        <el-col :xs="12" :sm="6">
          <el-card class="kpi-card kpi-card--blue" shadow="never">
            <div class="kpi-icon"><el-icon :size="22"><Coin /></el-icon></div>
            <div class="kpi-label">本年總收入</div>
            <div class="kpi-value" data-test="kpi-total-revenue">{{ money(summary.total_revenue) }}</div>
            <div v-if="mom?.revenue != null" class="kpi-trend" :class="mom.revenue >= 0 ? 'up' : 'down'" data-test="mom-revenue">
              {{ mom.revenue >= 0 ? '↑' : '↓' }} {{ formatPct(mom.revenue) }}
              <span class="kpi-trend-label">vs 上月</span>
            </div>
            <div class="kpi-trend" data-test="yoy-revenue">
              <template v-if="yoy?.revenue != null">
                <span :class="yoy.revenue >= 0 ? 'up' : 'down'">{{ yoy.revenue >= 0 ? '↑' : '↓' }} {{ formatPct(yoy.revenue) }}</span>
                <span class="kpi-trend-label">vs 去年</span>
              </template>
              <span v-else-if="yoy" class="kpi-trend-label">無去年資料</span>
            </div>
            <div class="kpi-sub">（未扣退款）</div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="6">
          <el-card class="kpi-card kpi-card--orange" shadow="never">
            <div class="kpi-icon"><el-icon :size="22"><Wallet /></el-icon></div>
            <div class="kpi-label">本年退款</div>
            <div class="kpi-value" data-test="kpi-total-refund">{{ money(summary.total_refund) }}</div>
            <div class="kpi-sub">學費+才藝</div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="6">
          <el-card class="kpi-card kpi-card--red" shadow="never">
            <div class="kpi-icon"><el-icon :size="22"><Money /></el-icon></div>
            <div class="kpi-label">本年總支出</div>
            <div class="kpi-value" data-test="kpi-total-expense">{{ money(summary.total_expense) }}</div>
            <div v-if="mom?.expense != null" class="kpi-trend" :class="mom.expense >= 0 ? 'up-warn' : 'down-good'" data-test="mom-expense">
              {{ mom.expense >= 0 ? '↑' : '↓' }} {{ formatPct(mom.expense) }}
              <span class="kpi-trend-label">vs 上月</span>
            </div>
            <div class="kpi-trend" data-test="yoy-expense">
              <template v-if="yoy?.expense != null">
                <span :class="yoy.expense >= 0 ? 'up-warn' : 'down-good'">{{ yoy.expense >= 0 ? '↑' : '↓' }} {{ formatPct(yoy.expense) }}</span>
                <span class="kpi-trend-label">vs 去年</span>
              </template>
              <span v-else-if="yoy" class="kpi-trend-label">無去年資料</span>
            </div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="6">
          <el-card class="kpi-card kpi-card--green" shadow="never">
            <div class="kpi-icon"><el-icon :size="22"><TrendCharts /></el-icon></div>
            <div class="kpi-label">本年淨現金</div>
            <div class="kpi-value" :class="netClass" data-test="kpi-net-cashflow">{{ money(summary.net_cashflow) }}</div>
            <div v-if="mom?.net != null" class="kpi-trend" :class="mom.net >= 0 ? 'up' : 'down'" data-test="mom-net">
              {{ mom.net >= 0 ? '↑' : '↓' }} {{ formatPct(mom.net) }}
              <span class="kpi-trend-label">vs 上月</span>
            </div>
            <div class="kpi-trend" data-test="yoy-net">
              <template v-if="yoy?.net != null">
                <span :class="yoy.net >= 0 ? 'up' : 'down'">{{ yoy.net >= 0 ? '↑' : '↓' }} {{ formatPct(yoy.net) }}</span>
                <span class="kpi-trend-label">vs 去年</span>
              </template>
              <span v-else-if="yoy" class="kpi-trend-label">無去年資料</span>
            </div>
            <div class="kpi-sub">（收入-退款-支出）</div>
          </el-card>
        </el-col>
      </el-row>
      <div class="kpi-band-note" data-test="kpi-band-note">
        含固定支出、廠商付款；不含年終獎金（另行轉帳）
      </div>
    </template>

    <!-- c. 異常與待辦 -->
    <el-card class="todo-card" shadow="never">
      <template #header><span class="chart-title">異常與待辦</span></template>
      <ul class="todo-list" data-test="todo-list">
        <li v-for="item in todoItems" :key="item.key" class="todo-item" :data-test="`todo-item-${item.key}`">
          <el-icon :size="14" class="todo-icon-warn"><Warning /></el-icon>
          <span>{{ item.text }}</span>
        </li>
        <li v-if="todoItems.length === 0" class="todo-item todo-empty" data-test="todo-empty">
          <el-icon :size="14" class="todo-icon-ok"><CircleCheck /></el-icon>
          <span>目前無異常待辦</span>
        </li>
      </ul>
      <router-link
        v-if="signoffLinkState === 'action' || signoffLinkState === 'neutral'"
        class="todo-link"
        :to="{ path: '/finance-signoffs' }"
        data-test="todo-signoff-link"
      >
        <el-icon :size="14"><LinkIcon /></el-icon>
        {{ signoffLinkState === 'action'
          ? '前往「收支簽收」處理待簽收項目'
          : '廠商付款／雜項收款簽收狀態請至「收支簽收」查看' }}
      </router-link>
    </el-card>

    <!-- d. 年度出勤率（加權）／淨營收／收支比 -->
    <el-row :gutter="16">
      <el-col :xs="24" :sm="8">
        <div v-if="dashboardUnavailable" class="section-error" data-test="attendance-rate-error">
          <el-empty :description="dashboardErrorText" :image-size="50" />
        </div>
        <el-card v-else class="kpi-card" shadow="never">
          <div class="kpi-icon"><el-icon :size="22"><Check /></el-icon></div>
          <div class="kpi-label">年度出勤率（加權平均）</div>
          <div class="kpi-value" data-test="attendance-rate">{{ weightedAttendanceRate != null ? `${weightedAttendanceRate}%` : '-' }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <div v-if="financeUnavailable" class="section-error" data-test="net-revenue-error">
          <el-empty :description="financeErrorText" :image-size="50" />
        </div>
        <el-card v-else class="kpi-card" shadow="never">
          <div class="kpi-icon"><el-icon :size="22"><DataAnalysis /></el-icon></div>
          <div class="kpi-label">淨營收</div>
          <div class="kpi-value">{{ money(summary.net_revenue) }}</div>
          <div class="kpi-sub">總收入 - 退款</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <div v-if="financeUnavailable" class="section-error" data-test="ratio-error">
          <el-empty :description="financeErrorText" :image-size="50" />
        </div>
        <el-card v-else class="kpi-card" shadow="never">
          <div class="kpi-icon"><el-icon :size="22"><Calendar /></el-icon></div>
          <div class="kpi-label">收支比</div>
          <div class="kpi-value">
            {{ summary.total_expense ? (summary.net_revenue / summary.total_expense).toFixed(2) : '-' }}
          </div>
          <div class="kpi-sub">淨營收 / 總支出</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- e. 資料說明 -->
    <el-collapse class="data-notes" data-test="data-notes">
      <el-collapse-item title="資料說明（口徑／來源／已知缺漏）" name="notes">
        <dl class="notes-dl">
          <dt>計算口徑</dt>
          <dd>
            現金收付實現制（非應計制）：收入/退款以實際收付款日認列，支出以薪資結算月／實際付款日認列。
            淨現金 = (總收入 − 總退款) − 總支出。
          </dd>
          <dt>資料來源</dt>
          <dd>
            學費實收/退款、才藝收入/退款、雜項收款（現金已收即認列）計入收入；
            員工應發薪資＋雇主保費勞退、廠商付款（現金已付即認列）、固定支出（租金／水電／電話／
            零用金／餐點／舊制勞退準備金 8 類登錄）計入支出。
          </dd>
          <dt>狀態篩選</dt>
          <dd>
            薪資僅計入已封存且不需重算的紀錄（草稿/待重算不計入，避免中間態影響管理層數字）；
            廠商付款與雜項收款「待簽收」與「已簽收」皆計入；才藝收支僅計入未作廢紀錄。
          </dd>
          <dt>已知缺漏（本次未納入）</dt>
          <dd>
            年終獎金 E 化撥款為表外獨立轉帳，未列入本頁任何數字（另行轉帳，非疏漏）；
            出勤率依員工「現行」班級回溯計算，班級異動員工的歷史月份會歸屬到現在班級；
            固定支出與廠商付款無結構性去重，兩表登錄紀律仰賴人工把關。
          </dd>
          <dt>資料更新時間</dt>
          <dd data-test="notes-fetched-at">
            收支：{{ formatFetchedAt(finance.fetchedAt.value) }}；出勤／薪資：{{ formatFetchedAt(dashboard.fetchedAt.value) }}
          </dd>
        </dl>
      </el-collapse-item>
    </el-collapse>
  </div>
</template>

<style scoped>
.overview { display: flex; flex-direction: column; gap: var(--space-4); }
.kpi-row { margin-bottom: 0; }
.kpi-card {
  text-align: center;
  padding: 16px 8px 12px;
  position: relative;
  border-top: 3px solid transparent;
  height: 100%;
}
.kpi-card--blue   { border-top-color: var(--color-info); }
.kpi-card--orange { border-top-color: var(--color-warning); }
.kpi-card--red    { border-top-color: var(--color-danger); }
.kpi-card--green  { border-top-color: var(--color-success); }

.kpi-icon {
  opacity: 0.45;
  margin-bottom: 4px;
}
.kpi-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.kpi-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}
.kpi-sub {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.kpi-trend {
  font-size: 12px;
  font-weight: 600;
  margin-top: 4px;
  min-height: 16px;
}
.kpi-trend .up,
.kpi-trend.up,
.kpi-trend .down-good,
.kpi-trend.down-good { color: var(--color-success); }
.kpi-trend .down,
.kpi-trend.down,
.kpi-trend .up-warn,
.kpi-trend.up-warn   { color: var(--color-danger); }
.kpi-trend-label {
  font-weight: normal;
  color: var(--text-secondary);
  margin-left: 4px;
}

.kpi-band-note {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  margin-top: -4px;
}

/* netClass 動態：正數綠／負數紅，提示營運盈虧；非裝飾性色，保留 */
.value-red { color: var(--color-danger); }
.value-green { color: var(--color-success); }

.section-error { padding: 16px 0; }

.todo-card :deep(.el-card__body) { display: flex; flex-direction: column; gap: 10px; }
.chart-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.todo-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.todo-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-primary); }
.todo-icon-warn { color: var(--color-warning); }
.todo-icon-ok { color: var(--color-success); }
.todo-link {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--el-color-primary);
  text-decoration: none;
  padding-top: 6px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.todo-link:hover { text-decoration: underline; }

.data-notes { border-top: none; }
.notes-dl { font-size: 13px; color: var(--text-secondary); line-height: 1.7; margin: 0; }
.notes-dl dt { font-weight: 600; color: var(--text-primary); margin-top: 10px; }
.notes-dl dt:first-child { margin-top: 0; }
.notes-dl dd { margin: 2px 0 0 0; }
</style>
