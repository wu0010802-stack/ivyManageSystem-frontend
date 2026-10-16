<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  getMonthlyFixedCosts,
  batchUpsertMonthlyFixedCosts,
} from '@/api/monthlyFixedCost'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { useGridKeyboardNav } from '@/composables/useGridKeyboardNav'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'
import { formatAmount, monthRangeText } from './reportFormat'
import { computeReportPeriod } from './useReportPeriod'

const props = defineProps<{
  year: number
  highlightMonth?: number
}>()

// saved：儲存成功並重新載入後 emit，殼層用來重算「未登錄月數」
const emit = defineEmits<{ 'update:dirty': [boolean]; saved: [] }>()

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

interface FixedCostCategory {
  key: string
  label: string
  defaultAmount: number | null
}

// 8 個 category（次序即顯示順序）；defaultAmount 是「參考金額」：以 placeholder 呈現、
// 只能透過每列「帶入」填入空格，不會自動帶入
const CATEGORIES: FixedCostCategory[] = [
  { key: 'rent', label: '租金支出', defaultAmount: 500000 },
  { key: 'office_petty_cash', label: '辦公室零用金', defaultAmount: null },
  { key: 'kitchen_petty_cash', label: '廚房零用金', defaultAmount: null },
  { key: 'meals', label: '餐點採購', defaultAmount: 50000 },
  { key: 'water', label: '水費', defaultAmount: null },
  { key: 'electricity', label: '電費', defaultAmount: null },
  { key: 'phone', label: '電話費', defaultAmount: null },
  { key: 'old_pension_reserve', label: '舊制勞退準備金', defaultAmount: 10000 },
]

const canWrite = computed(() => hasPermission('VENDOR_PAYMENT_WRITE'))

// 資料截止月（今年＝當月、過去年＝12、未來年度＝0），僅依年度與今天，不需 trend
const period = computed(() => computeReportPeriod(props.year))
// 高亮欄：深連結指定的月份優先，否則今年標當月
const focusMonth = computed(
  () => props.highlightMonth ?? (period.value.isCurrentYear ? period.value.cutoffMonth : null),
)

const loading = ref(false)
const saving = ref(false)
const errorMsg = ref('')
// 最近一次成功載入的年度；用來決定副標要不要顯示「已登錄 X / Y 個月」（載入前或失敗時不顯示假的 0）
const loadedYear = ref<number | null>(null)

// cellState：key = `${month}-${category}`，value = { original, current }
// original: 載入時 server 上的金額（null = 沒這筆 row）；current: 編輯中值（null 或 number）
// isDirty = original !== current（嚴格不等）；空字串、null 視為「未登錄」用 null 統一表示
interface CellEntry {
  original: number | null
  current: number | null
}
const cellState = reactive(new Map<string, CellEntry>())

function cellKey(month: number, category: string) {
  return `${month}-${category}`
}

function buildEmptyState() {
  cellState.clear()
  for (const m of MONTHS) {
    for (const c of CATEGORIES) {
      cellState.set(cellKey(m, c.key), { original: null, current: null })
    }
  }
}

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const entries = await getMonthlyFixedCosts(props.year)
    buildEmptyState()
    if (Array.isArray(entries)) {
      for (const e of entries) {
        const k = cellKey(e.month, e.category)
        if (!cellState.has(k)) continue
        const amount = e.amount == null ? null : Number(e.amount)
        cellState.set(k, { original: amount, current: amount })
      }
    }
    loadedYear.value = props.year
  } catch (e) {
    // 403：分頁掛在 REPORTS 權限下，但底層 GET 端點要求獨立的 VENDOR_PAYMENT_READ，
    // 持有 REPORTS 但無該權限的角色會看到通用「載入失敗」誤導成頁面壞了
    // （2026-07-05 稽核 §0 / P3-11），改顯示明確的權限提示（文案不露出權限代碼）。
    if ((e as { response?: { status?: number } })?.response?.status === 403) {
      errorMsg.value = '需要廠商付款的讀取權限，請洽管理員開通。'
    } else {
      errorMsg.value = apiError(e, '載入固定支出失敗')
    }
    ElMessage.error(errorMsg.value)
    buildEmptyState()
  } finally {
    loading.value = false
  }
}

watch(() => props.year, load, { immediate: true })

function getCurrent(month: number, category: string): number | null {
  return cellState.get(cellKey(month, category))?.current ?? null
}

function getOriginal(month: number, category: string): number | null {
  return cellState.get(cellKey(month, category))?.original ?? null
}

function setCurrent(month: number, category: string, raw: string | number | null) {
  const key = cellKey(month, category)
  const entry = cellState.get(key)
  if (!entry) return
  let next: number | null = null
  // 千分位輸入（spec §9）：input 為 text，使用者可能貼入含逗號字串（如 "500,000"）
  const cleaned = raw == null ? raw : String(raw).replace(/,/g, '')
  if (cleaned !== '' && cleaned != null) {
    const num = Number(cleaned)
    if (Number.isFinite(num) && num >= 0) {
      // 整數金額（後端 Money 為整數型）
      next = Math.trunc(num)
    } else {
      // 無效輸入維持原值
      return
    }
  }
  cellState.set(key, { original: entry.original, current: next })
}

// 千分位輸入（spec §9）：focus 中顯示純數字方便編輯，未 focus 顯示千分位方便閱讀
const focusedKey = ref<string | null>(null)
function rawText(month: number, category: string): string {
  const v = getCurrent(month, category)
  return v == null ? '' : String(v)
}
function displayText(month: number, category: string): string {
  return formatAmount(getCurrent(month, category))
}
function originalText(month: number, category: string): string {
  const v = getOriginal(month, category)
  return v == null ? '未登錄' : formatAmount(v)
}

function isDirty(month: number, category: string) {
  const e = cellState.get(cellKey(month, category))
  if (!e) return false
  return e.current !== e.original
}

// 空格＝沒有已存值、也沒有編輯中的值（使用者清掉已存值的格子算「已編輯」，不算空格）
function isBlank(month: number, category: string) {
  const e = cellState.get(cellKey(month, category))
  return !!e && e.current == null && e.original == null
}

// 派生：所有 dirty entries（送 batch endpoint 用）
const dirtyEntries = computed(() => {
  const out: Array<{ month: number; category: string; amount: number }> = []
  for (const m of MONTHS) {
    for (const c of CATEGORIES) {
      const e = cellState.get(cellKey(m, c.key))
      if (!e) continue
      if (e.current !== e.original) {
        // 送 batch 時：null（清空）也要送，後端可決定 0 或 delete
        // 但為了不寫入污染稽核軌跡，null → 視為 amount=0
        out.push({
          month: m,
          category: c.key,
          amount: e.current == null ? 0 : e.current,
        })
      }
    }
  }
  return out
})

const dirtyCount = computed(() => dirtyEntries.value.length)

// emit dirty 狀態給父層（ReportsView／FinanceSignoffView 離開前攔截用）
watch(dirtyCount, (n) => emit('update:dirty', n > 0), { immediate: true })

// 容器 ref 供鍵盤導航使用
const gridRef = ref<HTMLElement | null>(null)
useGridKeyboardNav(gridRef)
useUnsavedChangesGuard(() => dirtyCount.value > 0)

// ── 合計：已儲存值＋編輯中的值（＝ current）──────────────────────
function sumValues(values: Array<number | null>): number {
  return values.reduce<number>((acc, v) => (v != null && Number.isFinite(v) ? acc + v : acc), 0)
}

const monthTotals = computed(() =>
  MONTHS.map((m) => sumValues(CATEGORIES.map((c) => getCurrent(m, c.key)))),
)
const categoryTotals = computed(() => {
  const out: Record<string, number> = {}
  for (const c of CATEGORIES) out[c.key] = sumValues(MONTHS.map((m) => getCurrent(m, c.key)))
  return out
})
const grandTotal = computed(() => sumValues(monthTotals.value))

// 含編輯中值的合計要標「未儲存」
const monthDirty = computed(() =>
  MONTHS.map((m) => CATEGORIES.some((c) => isDirty(m, c.key))),
)
const categoryDirty = computed(() => {
  const out: Record<string, boolean> = {}
  for (const c of CATEGORIES) out[c.key] = MONTHS.some((m) => isDirty(m, c.key))
  return out
})

// ── 登錄進度：只看「已儲存」的金額 ─────────────────────────────
const savedMonthTotals = computed(() =>
  MONTHS.map((m) => sumValues(CATEGORIES.map((c) => getOriginal(m, c.key)))),
)

type MonthStatus = 'registered' | 'missing' | 'planned'
const STATUS_TEXT: Record<MonthStatus, string> = {
  registered: '已登錄',
  missing: '未登錄',
  planned: '預登錄',
}
function monthStatus(month: number): MonthStatus {
  if (savedMonthTotals.value[month - 1] > 0) return 'registered'
  return month <= period.value.cutoffMonth ? 'missing' : 'planned'
}

const registeredCount = computed(
  () => MONTHS.filter((m) => m <= period.value.cutoffMonth && savedMonthTotals.value[m - 1] > 0).length,
)

const ready = computed(() => loadedYear.value === props.year && !errorMsg.value)
const subtitle = computed(() => {
  const cutoff = period.value.cutoffMonth
  if (cutoff < 1) return `${props.year} 年 · 尚未開始，可先預登錄`
  const progress = ready.value
    ? ` · 已登錄 ${registeredCount.value} / ${cutoff} 個月${period.value.isCurrentYear ? '（含本月）' : ''}`
    : ''
  return `${props.year} 年${progress} · 每格填當月實際支出；虛線斜體是參考金額，不會自動帶入`
})

const hasAnyEntry = computed(() => {
  for (const v of cellState.values()) {
    if (v.original != null) return true
  }
  return false
})

// ── 每列「帶入」參考金額：只填空格 ──────────────────────────────
const fillUnfilledLabel = computed(() => {
  const cutoff = period.value.cutoffMonth
  if (cutoff < 1) return '帶入未登錄的月份'
  return `帶入未登錄的月份（${monthRangeText(MONTHS.filter((m) => m <= cutoff))}）`
})

function fillFromReference(category: string, scope: 'unfilled' | 'all') {
  const cat = CATEGORIES.find((c) => c.key === category)
  if (!cat || cat.defaultAmount == null || !canWrite.value || saving.value) return
  const lastMonth = scope === 'all' ? 12 : period.value.cutoffMonth
  for (let m = 1; m <= lastMonth; m++) {
    if (isBlank(m, category)) setCurrent(m, category, cat.defaultAmount)
  }
}

function onFillCommand(category: string, command: unknown) {
  if (command === 'unfilled' || command === 'all') fillFromReference(category, command)
}

// ── 底部儲存列 ────────────────────────────────────────────────
// 「租金支出 7–9 月、餐點採購 9 月」：讓使用者儲存前知道動了哪些格
const dirtySummary = computed(() => {
  const parts: string[] = []
  for (const c of CATEGORIES) {
    const months = MONTHS.filter((m) => isDirty(m, c.key))
    if (months.length) parts.push(`${c.label} ${monthRangeText(months)}`)
  }
  return parts.join('、')
})

function discardChanges() {
  if (saving.value) return
  for (const key of Array.from(cellState.keys())) {
    const e = cellState.get(key)
    if (e) cellState.set(key, { original: e.original, current: e.original })
  }
}

async function saveAll() {
  if (saving.value || dirtyCount.value === 0) return
  saving.value = true
  try {
    const count = dirtyCount.value
    await batchUpsertMonthlyFixedCosts(props.year, dirtyEntries.value)
    ElMessage.success(`已儲存 ${count} 格`)
    // 固定支出會併入收支彙總/概況/薪資頁的總支出（2026-07-05 後端修正），但那三頁
    // 走 useCachedAsync 的模組級全域 cache（TTL 5 分鐘），存檔前已開過的分頁在
    // TTL 內切回去會看到舊值。存檔成功後失效這兩個前綴，讓下次切頁強制重抓
    // （稽核 P1：全 repo 原本 0 處呼叫 invalidateCachedAsync）。
    invalidateCachedAsync('reports/finance:')
    invalidateCachedAsync('reports/dashboard:')
    // 成功後重抓 → rebuild map → dirty 自動清零
    await load()
    emit('saved')
  } catch (e) {
    const msg = apiError(e, '儲存固定支出失敗')
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="monthly-fixed-cost">
    <div class="panel-header">
      <div class="header-text">
        <h3 class="panel-title">固定支出登錄</h3>
        <p class="panel-subtitle" data-test="subtitle">{{ subtitle }}</p>
        <p v-if="highlightMonth" class="panel-subtitle" role="status">目前核對 {{ year }} 年 {{ highlightMonth }} 月，對應月份已標示。</p>
      </div>
      <el-alert
        v-if="!canWrite"
        type="warning"
        :closable="false"
        show-icon
        title="您只有查看權限，無法修改固定支出"
        class="readonly-alert"
      />
    </div>

    <el-skeleton v-if="loading && !hasAnyEntry" :rows="8" animated />
    <div v-else-if="errorMsg && !hasAnyEntry" class="fixed-cost-error">
      <el-empty :description="errorMsg" />
    </div>
    <div v-else ref="gridRef" class="fc-scroll">
      <div v-if="!hasAnyEntry && !loading" class="empty-hint">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="此年度尚未登錄任何固定支出，直接點選儲存格即可輸入，或用各列的「帶入」填入參考金額。"
        />
      </div>
      <table class="fc-table">
        <thead>
          <tr>
            <th class="col-label sticky-col">類別</th>
            <th
              v-for="m in MONTHS"
              :key="m"
              class="col-month"
              :class="{ 'col-current': m === focusMonth }"
            >
              <span class="month-name">{{ m }} 月</span>
              <span
                class="month-status"
                :class="`month-status--${monthStatus(m)}`"
                :data-test="`month-status-${m}`"
              >{{ STATUS_TEXT[monthStatus(m)] }}</span>
            </th>
            <th class="col-total">合計</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, ci) in CATEGORIES" :key="c.key" :data-category="c.key">
            <th class="sticky-col row-label">
              <span class="row-label__name">{{ c.label }}</span>
              <span v-if="c.defaultAmount != null" class="row-label__ref">
                <span class="ref-text">參考 {{ formatAmount(c.defaultAmount) }}</span>
                <el-dropdown
                  v-if="canWrite"
                  trigger="click"
                  :disabled="saving"
                  @command="onFillCommand(c.key, $event)"
                >
                  <el-button
                    link
                    type="primary"
                    size="small"
                    :disabled="saving"
                    :aria-label="`${c.label}：帶入參考金額`"
                    :data-test="`fill-${c.key}`"
                  >帶入<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        command="unfilled"
                        :disabled="period.cutoffMonth < 1"
                        :data-test="`fill-unfilled-${c.key}`"
                      >{{ fillUnfilledLabel }}</el-dropdown-item>
                      <el-dropdown-item
                        command="all"
                        :data-test="`fill-all-${c.key}`"
                      >帶入全年（含預登錄）</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </span>
            </th>
            <td
              v-for="(m, mi) in MONTHS"
              :key="m"
              class="cell-edit"
              :class="{
                'cell-dirty': isDirty(m, c.key),
                'cell-empty': getCurrent(m, c.key) == null,
                'col-current': m === focusMonth,
              }"
              :data-cell-key="`${m}-${c.key}`"
            >
              <input
                type="text"
                inputmode="numeric"
                class="cell-input"
                :data-grid-row="ci"
                :data-grid-col="mi"
                :aria-label="`${m}月 ${c.label}`"
                :value="focusedKey === cellKey(m, c.key) ? rawText(m, c.key) : displayText(m, c.key)"
                :disabled="!canWrite || saving"
                :placeholder="c.defaultAmount != null ? formatAmount(c.defaultAmount) : ''"
                @input="setCurrent(m, c.key, ($event.target as HTMLInputElement).value)"
                @focus="focusedKey = cellKey(m, c.key)"
                @blur="focusedKey = null"
              />
              <span
                v-if="isDirty(m, c.key)"
                class="cell-orig"
                :data-test="`orig-${m}-${c.key}`"
              >原 {{ originalText(m, c.key) }}</span>
            </td>
            <td class="cell-num col-total" :data-row-total="c.key">
              <span v-if="categoryTotals[c.key] > 0">{{ formatAmount(categoryTotals[c.key]) }}</span>
              <span v-else-if="period.cutoffMonth >= 1" class="total-missing">未登錄</span>
              <span v-if="categoryDirty[c.key]" class="total-unsaved">未儲存</span>
            </td>
          </tr>
          <!-- 月度合計列 -->
          <tr class="row-grand-total" data-row="month-totals">
            <th class="sticky-col row-label">月度合計</th>
            <td
              v-for="m in MONTHS"
              :key="m"
              class="cell-num"
              :class="{ 'col-current': m === focusMonth }"
              :data-month-total="m"
            >
              <span v-if="monthTotals[m - 1] > 0">{{ formatAmount(monthTotals[m - 1]) }}</span>
              <span v-else-if="m <= period.cutoffMonth" class="total-missing">未登錄</span>
              <span v-if="monthDirty[m - 1]" class="total-unsaved" :data-test="`month-unsaved-${m}`">未儲存</span>
            </td>
            <td class="cell-num col-total" data-grand-total>
              <span v-if="grandTotal > 0">{{ formatAmount(grandTotal) }}</span>
              <span v-else-if="period.cutoffMonth >= 1" class="total-missing">未登錄</span>
              <span v-if="dirtyCount > 0" class="total-unsaved">未儲存</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 有修改才出現的底部儲存列 -->
    <div
      v-if="canWrite && dirtyCount > 0"
      class="save-bar"
      role="region"
      aria-label="未儲存的變更"
      data-test="save-bar"
    >
      <p class="save-bar__text" :title="dirtySummary">
        <span class="save-bar__count" data-test="dirty-count">{{ dirtyCount }} 格未儲存</span>
        <span class="save-bar__detail"> · {{ dirtySummary }}</span>
      </p>
      <div class="save-bar__actions">
        <el-button :disabled="saving" data-test="discard-btn" @click="discardChanges">放棄變更</el-button>
        <el-button
          type="primary"
          :disabled="saving"
          :loading="saving"
          data-test="save-all-btn"
          @click="saveAll"
        >儲存 {{ dirtyCount }} 格</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.monthly-fixed-cost {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4, 16px);
  flex-wrap: wrap;
}
.header-text { display: flex; flex-direction: column; gap: var(--space-1, 4px); min-width: 0; }
.panel-title { margin: 0; font-size: var(--text-lg); font-weight: 600; }
.panel-subtitle { margin: 0; font-size: var(--text-xs); color: var(--el-text-color-secondary); }
.readonly-alert { width: auto; }
.readonly-alert :deep(.el-alert) { padding: 6px 12px; }

.fc-scroll {
  overflow-x: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: var(--radius-sm);
  background: var(--el-bg-color);
}
.empty-hint { padding: 12px 12px 0 12px; }

.fc-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  color: var(--el-text-color-primary);
}

.fc-table thead th {
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
.fc-table thead th.col-label {
  text-align: left;
  z-index: 3;
}
.fc-table thead th.col-month { min-width: 92px; }
.fc-table thead th.col-total {
  min-width: 96px;
  border-left: 1px solid var(--el-border-color-lighter);
}

/* 月份表頭下方的登錄狀態：未登錄用琥珀色拉注意力，預登錄（未來月）淡灰 */
.month-name { display: block; }
.month-status {
  display: block;
  font-size: var(--text-xs);
  font-weight: 400;
  line-height: 1.3;
}
.month-status--registered { color: var(--color-success-darker); }
.month-status--missing { color: var(--color-warning-darker); font-weight: 600; }
.month-status--planned { color: var(--el-text-color-placeholder); }

/* 當月高亮（spec §9） */
.fc-table .col-current {
  background: var(--el-color-primary-light-9);
}
.fc-table thead th.col-current {
  background: var(--el-color-primary-light-8);
}
/* dark mode 窄覆寫（守衛測試：tests/unit/darkModeDarkerTokens.test.ts）：
   根因已修——main.css 的 light-N 釘值改 scope `html.ivy-admin:not(.dark)`，且
   a11y.css `html.dark.ivy-admin` 提供青藍深底色階（light-9 #13283f / light-8 #173853，
   對 EP dark 主文字對比 ≥ 10:1，驗算見該處註解）。本覆寫值已與 base 規則等值，
   保留作回歸防護錨點（防 main.css 釘值範圍再度外溢至 dark）。 */
html.dark .fc-table .col-current {
  background: var(--el-color-primary-light-9);
}
html.dark .fc-table thead th.col-current {
  background: var(--el-color-primary-light-8);
}

.sticky-col {
  position: sticky;
  left: 0;
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-lighter);
  text-align: left;
  z-index: 1;
}
.fc-table thead .sticky-col { background: var(--el-fill-color-light); }

.fc-table tbody td,
.fc-table tbody th {
  padding: 4px 6px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.fc-table tbody .row-label {
  font-weight: normal;
  text-align: left;
  white-space: nowrap;
  padding: 4px 10px;
  min-width: 132px;
}
.row-label__name { display: block; }
.row-label__ref {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}
.ref-text { font-style: italic; }
.row-label__ref :deep(.el-button) { padding: 0; height: auto; font-size: var(--text-xs); }

/* 儲存格：已存值＝實字；空格＝虛線框；編輯中＝琥珀底＋左上圓點 */
.cell-edit { padding: 2px 4px; position: relative; }
.cell-input {
  width: 100%;
  min-width: 80px;
  padding: 4px 6px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: var(--el-text-color-primary);
  font-family: inherit;
}
.cell-input:hover:not(:disabled) {
  border-color: var(--el-border-color-light);
}
/* 可見 focus 指示（沿用 a11y.css :focus-visible 全站規格；text input 在各主流瀏覽器
   任何 focus 途徑都匹配 :focus-visible，故鍵盤與滑鼠聚焦皆有 2px 外框）。
   背景用 --el-color-primary-light-9：light = #e6f3f9（main.css ivy-admin:not(.dark)），
   dark = #13283f（a11y.css html.dark.ivy-admin），皆與 --el-text-color-primary
   對比 ≥ 10:1（驗算見 a11y.css 色階註解）。 */
.cell-input:focus {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.cell-input:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}
.cell-input:disabled {
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  cursor: not-allowed;
}
/* 參考金額（placeholder）：斜體＋淡色，一眼分得出「還沒填」 */
.cell-input::placeholder {
  color: var(--el-text-color-placeholder);
  font-style: italic;
}
.cell-edit.cell-empty .cell-input {
  border-style: dashed;
  border-color: var(--el-border-color-lighter);
}
.cell-edit.cell-empty .cell-input:hover:not(:disabled) {
  border-color: var(--el-border-color);
}
.cell-edit.cell-empty .cell-input:focus {
  border-style: solid;
  border-color: var(--el-color-primary);
}

/* dirty 視覺：琥珀淡底＋細邊框；td 左上角一顆小圓點，掃表時一眼看到改了哪些格 */
.cell-edit.cell-dirty .cell-input {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}
.cell-edit.cell-dirty::before {
  content: '';
  position: absolute;
  top: 5px;
  left: 6px;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--el-color-warning);
  pointer-events: none;
}

.cell-orig {
  display: block;
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
  text-align: right;
  line-height: 1.2;
}

.cell-num {
  text-align: right;
  white-space: nowrap;
  padding: 6px 10px;
}
.fc-table tbody td.col-total {
  border-left: 1px solid var(--el-border-color-lighter);
  font-weight: 600;
}
.total-missing { font-weight: 400; color: var(--el-text-color-placeholder); }
.total-unsaved {
  display: block;
  font-size: var(--text-xs);
  font-weight: 400;
  line-height: 1.2;
  color: var(--color-warning-darker);
}

.row-grand-total td,
.row-grand-total th {
  font-weight: 600;
  background: var(--el-fill-color-light);
  border-top: 1px solid var(--el-border-color);
}
.row-grand-total .sticky-col {
  background: var(--el-fill-color-light);
}

.fixed-cost-error { padding: 32px 0; }

/* 底部儲存列：有修改才出現，貼在可視區底部 */
.save-bar {
  position: sticky;
  bottom: var(--space-2, 8px);
  z-index: var(--z-sticky, 10);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px)
    calc(var(--space-3, 12px) + env(safe-area-inset-bottom, 0px));
  background: var(--el-bg-color);
  border: 1px solid var(--el-color-warning-light-5);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}
.save-bar__text {
  margin: 0;
  min-width: 0;
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}
.save-bar__count { font-weight: 600; }
.save-bar__detail { color: var(--el-text-color-secondary); }
.save-bar__actions { display: flex; gap: var(--space-2, 8px); flex-shrink: 0; }

@media (--to-sm) {
  .fc-table { font-size: var(--text-xs); }
  .save-bar { flex-direction: column; align-items: stretch; }
  .save-bar__actions { justify-content: flex-end; }
  .save-bar__actions :deep(.el-button) { min-height: var(--touch-target-min, 44px); }
}
</style>
