<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getMonthlyFixedCosts,
  batchUpsertMonthlyFixedCosts,
} from '@/api/monthlyFixedCost'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { useGridKeyboardNav } from '@/composables/useGridKeyboardNav'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { invalidateCachedAsync } from '@/composables/useCachedAsync'
import { computeReportPeriod } from './useReportPeriod'

const props = defineProps<{
  year: number
}>()

const emit = defineEmits<{ 'update:dirty': [boolean] }>()

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

// 8 個 category（次序即顯示順序）；defaultAmount 只做 placeholder 提示，不自動帶入
const CATEGORIES = [
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

// 當月高亮（spec §9）：cutoff 僅依年度與今天，不需 trend
const period = computed(() => computeReportPeriod(props.year))

const loading = ref(false)
const saving = ref(false)
const errorMsg = ref('')

// cellState：key = `${month}-${category}`，value = { original, current }
// original: 載入時 server 上的金額（null = 沒這筆 row）；current: 編輯中值（null 或 number）
// isDirty = original !== current（嚴格不等）；空字串、null 視為「未登錄」用 null 統一表示
const cellState = reactive(new Map())

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
  } catch (e) {
    // 403：分頁掛在 REPORTS 權限下，但底層 GET 端點要求獨立的 VENDOR_PAYMENT_READ，
    // 持有 REPORTS 但無該權限的角色會看到通用「載入失敗」誤導成頁面壞了
    // （2026-07-05 稽核 §0 / P3-11），改顯示明確的權限提示。
    if ((e as { response?: { status?: number } })?.response?.status === 403) {
      errorMsg.value = '需要廠商付款讀取權限（VENDOR_PAYMENT_READ）才能查看固定費用登錄'
    } else {
      errorMsg.value = apiError(e, '載入月度固定費用失敗')
    }
    ElMessage.error(errorMsg.value)
    buildEmptyState()
  } finally {
    loading.value = false
  }
}

watch(() => props.year, load, { immediate: true })

// 取得 cell 當下值（用於 input v-model）。注意：reactive Map 需透過 method 取，
// 直接 cellState.get() 在 template 不會自動追蹤；改用 computed wrapper。
function getCurrent(month: number, category: string) {
  return cellState.get(cellKey(month, category))?.current ?? null
}

function setCurrent(month: number, category: string, raw: string | number | null) {
  const key = cellKey(month, category)
  const entry = cellState.get(key)
  if (!entry) return
  let next = null
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
  const v = getCurrent(month, category)
  return v == null ? '' : amountFormatter.format(v)
}

function isDirty(month: number, category: string) {
  const e = cellState.get(cellKey(month, category))
  if (!e) return false
  return e.current !== e.original
}

// 派生：所有 dirty entries（送 batch endpoint 用）
const dirtyEntries = computed(() => {
  const out = []
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

// emit dirty 狀態給父層（Task 6 ReportsView 用）
watch(dirtyCount, (n) => emit('update:dirty', n > 0), { immediate: true })

// 原值 getter
function getOriginal(month: number, category: string): number | null {
  return cellState.get(cellKey(month, category))?.original ?? null
}

// 容器 ref 供鍵盤導航使用
const gridRef = ref<HTMLElement | null>(null)
useGridKeyboardNav(gridRef)
useUnsavedChangesGuard(() => dirtyCount.value > 0)

// 原值格式化
const amountFmt = new Intl.NumberFormat('zh-TW')
function originalText(month: number, category: string): string {
  const v = getOriginal(month, category)
  return v == null ? '—' : amountFmt.format(v)
}

// 套用到全年：輸入一個金額套用到該類別所有 12 個月
async function applyToYear(category: string, label: string) {
  if (!canWrite.value) return
  try {
    const result = await ElMessageBox.prompt(
      `輸入要套用到「${label}」全年 12 個月的金額`,
      '套用到全年',
      {
        inputPattern: /^\d+$/,
        inputErrorMessage: '請輸入非負整數',
        confirmButtonText: '套用',
        cancelButtonText: '取消',
      },
    )
    // prompt 確認時回傳 { value, action }；取消時 reject，不會到此行
    const inputValue = typeof result === 'object' && 'value' in result ? result.value : ''
    const amount = Math.trunc(Number(inputValue))
    for (const m of MONTHS) setCurrent(m, category, amount)
  } catch { /* 使用者取消 */ }
}

// 月度合計（read-only 顯示用，跨 8 category 加總）
function monthTotal(month: number) {
  let sum = 0
  let any = false
  for (const c of CATEGORIES) {
    const e = cellState.get(cellKey(month, c.key))
    const v = e?.current
    if (v != null && Number.isFinite(v)) {
      sum += v
      any = true
    }
  }
  return any ? sum : null
}

// category 合計（read-only 顯示用，跨 12 月加總）
function categoryTotal(category: string) {
  let sum = 0
  let any = false
  for (const m of MONTHS) {
    const e = cellState.get(cellKey(m, category))
    const v = e?.current
    if (v != null && Number.isFinite(v)) {
      sum += v
      any = true
    }
  }
  return any ? sum : null
}

const grandTotal = computed(() => {
  let sum = 0
  let any = false
  for (const c of CATEGORIES) {
    const v = categoryTotal(c.key)
    if (v != null) {
      sum += v
      any = true
    }
  }
  return any ? sum : null
})

const amountFormatter = new Intl.NumberFormat('zh-TW')
function formatTotal(v: number | null | undefined) {
  if (v == null || !Number.isFinite(Number(v))) return '—'
  return amountFormatter.format(Number(v))
}

const hasAnyEntry = computed(() => {
  for (const v of cellState.values()) {
    if (v.original != null) return true
  }
  return false
})

async function saveAll() {
  if (saving.value || dirtyCount.value === 0) return
  saving.value = true
  try {
    await batchUpsertMonthlyFixedCosts(props.year, dirtyEntries.value)
    ElMessage.success(`已儲存 ${dirtyEntries.value.length} 筆`)
    // 固定支出會併入收支彙總/概況/薪資頁的總支出（2026-07-05 後端修正），但那三頁
    // 走 useCachedAsync 的模組級全域 cache（TTL 5 分鐘），存檔前已開過的分頁在
    // TTL 內切回去會看到舊值。存檔成功後失效這兩個前綴，讓下次切頁強制重抓
    // （稽核 P1：全 repo 原本 0 處呼叫 invalidateCachedAsync）。
    invalidateCachedAsync('reports/finance:')
    invalidateCachedAsync('reports/dashboard:')
    // 成功後重抓 → rebuild map → dirty 自動清零
    await load()
  } catch (e) {
    const msg = apiError(e, '儲存固定費用失敗')
    ElMessage.error(msg)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="monthly-fixed-cost">
    <div class="panel-toolbar">
      <div class="toolbar-left">
        <h3 class="panel-title">固定費用登錄</h3>
        <span class="panel-hint">
          每格金額為當月實際支出；defaultAmount 提示僅供參考，不會自動帶入。
        </span>
      </div>
      <div class="toolbar-right">
        <el-alert
          v-if="!canWrite"
          type="warning"
          :closable="false"
          show-icon
          title="您只有查看權限，無法修改固定費用"
          class="readonly-alert"
        />
        <el-button
          v-if="canWrite"
          type="primary"
          :disabled="dirtyCount === 0 || saving"
          :loading="saving"
          data-test="save-all-btn"
          @click="saveAll"
        >
          儲存全部<span v-if="dirtyCount > 0"> ({{ dirtyCount }})</span>
        </el-button>
      </div>
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
          title="此年度尚未登錄任何固定費用，直接點 cell 即可輸入。"
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
              :class="{ 'col-current': period.isCurrentYear && m === period.cutoffMonth }"
            >{{ m }} 月</th>
            <th class="col-total">合計</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(c, ci) in CATEGORIES" :key="c.key" :data-category="c.key">
            <th class="sticky-col row-label">
              {{ c.label }}
              <el-button
                v-if="canWrite"
                link
                size="small"
                :data-test="`apply-year-${c.key}`"
                @click="applyToYear(c.key, c.label)"
              >套用全年</el-button>
            </th>
            <td
              v-for="(m, mi) in MONTHS"
              :key="m"
              class="cell-edit"
              :class="{
                'cell-dirty': isDirty(m, c.key),
                'col-current': period.isCurrentYear && m === period.cutoffMonth,
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
                :placeholder="c.defaultAmount != null ? amountFormatter.format(c.defaultAmount) : ''"
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
              {{ formatTotal(categoryTotal(c.key)) }}
            </td>
          </tr>
          <!-- 月度合計列 -->
          <tr class="row-grand-total" data-row="month-totals">
            <th class="sticky-col row-label">月度合計</th>
            <td
              v-for="m in MONTHS"
              :key="m"
              class="cell-num"
              :class="{ 'col-current': period.isCurrentYear && m === period.cutoffMonth }"
              :data-month-total="m"
            >
              {{ formatTotal(monthTotal(m)) }}
            </td>
            <td class="cell-num col-total" data-grand-total>
              {{ formatTotal(grandTotal) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.monthly-fixed-cost {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
}

.panel-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  position: sticky;
  top: 0;
  z-index: 4;
  background: var(--el-bg-color);
  padding: 8px 0;
}
.toolbar-left { display: flex; flex-direction: column; gap: 4px; }
.panel-title { margin: 0; font-size: 16px; font-weight: 600; }
.panel-hint { font-size: 12px; color: var(--el-text-color-secondary); }
.toolbar-right { display: flex; align-items: center; gap: 12px; }
.readonly-alert :deep(.el-alert) { padding: 6px 12px; }

.fc-scroll {
  overflow-x: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  background: var(--el-bg-color);
}
.empty-hint { padding: 12px 12px 0 12px; }

.fc-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
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
}

.cell-edit { padding: 2px 4px; }
.cell-input {
  width: 100%;
  min-width: 80px;
  padding: 4px 6px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 3px;
  font-size: 13px;
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
.cell-input::placeholder { color: var(--el-text-color-placeholder); }

/* dirty 視覺：細邊框 + 背景輕染 */
.cell-edit.cell-dirty .cell-input {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.cell-orig { display: block; font-size: 10px; color: var(--el-text-color-secondary); text-align: right; line-height: 1.2; }

.cell-num {
  text-align: right;
  white-space: nowrap;
  padding: 6px 10px;
}
.fc-table tbody td.col-total {
  border-left: 1px solid var(--el-border-color-lighter);
  font-weight: 600;
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
</style>
