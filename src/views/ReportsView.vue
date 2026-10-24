<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowLeft, ArrowRight, Download, EditPen } from '@element-plus/icons-vue'
import { getFinanceSummary, financeSummaryExportUrl, monthlyPnlExportUrl } from '@/api/reports'
import { downloadFile } from '@/utils/download'
import { apiError } from '@/utils/error'
import { computeReportPeriod, defaultFocusMonth, monthState } from './reports/useReportPeriod'
import { useFixedCostStatus } from './reports/useFixedCostStatus'
import type { FinanceTrendRow } from './reports/financeTrend'
import OverviewPanel from './reports/OverviewPanel.vue'
import FinanceSummaryPanel from './reports/FinanceSummaryPanel.vue'
import MonthlyPnLPanel from './reports/MonthlyPnLPanel.vue'
import MonthlyFixedCostPanel from './reports/MonthlyFixedCostPanel.vue'
import AttendancePanel from './reports/AttendancePanel.vue'
import SalaryPanel from './reports/SalaryPanel.vue'
import ReportNotesDrawer from './reports/ReportNotesDrawer.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { PAGE_TERMS } from '@/constants/moduleTerms'

const route = useRoute()
const router = useRouter()

// tab key 沿用舊值（舊網址與書籤可用），只改顯示名稱與順序（2026-10-12 改版 Q2）
const VALID_TABS = ['overview', 'finance', 'monthly-pnl', 'salary', 'attendance', 'fixed-cost'] as const
const currentYear = new Date().getFullYear()
// 年度選單：往回 4 年、往後 1 年（舊版往後 3 年、往回 1 年，與實際使用相反）
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear + 1 - i)
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1)

// ── URL query 還原（無效值 fallback，不報錯） ──────────────────────────
function parseTab(raw: unknown): string {
  return typeof raw === 'string' && (VALID_TABS as readonly string[]).includes(raw) ? raw : 'overview'
}
function parseYear(raw: unknown): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 2000 && n <= 2999 ? n : currentYear
}
function parseMonth(raw: unknown): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null
}
const selectedYear = ref(parseYear(route.query.year))
const activeTab = ref(parseTab(route.query.tab))
// 使用者明確選過的月份；null＝跟著預設（最近完整月）。只有明確選過才寫進網址。
const selectedMonth = ref<number | null>(parseMonth(route.query.month))
const fixedCostDirty = ref(false)

watch([activeTab, selectedYear, selectedMonth], ([tab, year, month]) => {
  const query: Record<string, string> = {}
  for (const [k, v] of Object.entries(route.query)) {
    if (typeof v === 'string' && k !== 'month') query[k] = v
  }
  query.tab = tab
  query.year = String(year)
  if (month != null) query.month = String(month)
  router.replace({ query })
}, { immediate: true })

// ── 資料截止月：與 panel 共用同一端點（輕量 GET，5 分鐘內多為 server cache）
const badgeTrend = ref<FinanceTrendRow[]>([])
// 預設焦點月要等截止月算出來；之前就渲染分頁會先用「本月」打一輪 API、再跳回上個完整月
const periodReady = ref(false)
watch(selectedYear, async (y) => {
  badgeTrend.value = []
  periodReady.value = false
  let rows: FinanceTrendRow[] = []
  try {
    const res = await getFinanceSummary(y)
    rows = res.data?.monthly_trend || []
  } catch {
    rows = [] // 截止月屬輔助資訊，載入失敗不擋頁面
  }
  // stale guard：年度已再切換時丟棄晚到的舊 response
  if (y !== selectedYear.value) return
  badgeTrend.value = rows
  periodReady.value = true
}, { immediate: true })
// 網址已指定月份就不必等
const panelsReady = computed(() => periodReady.value || selectedMonth.value != null)

const period = computed(() => computeReportPeriod(selectedYear.value, badgeTrend.value))
const focusMonth = computed(() => selectedMonth.value ?? defaultFocusMonth(period.value))
const focusState = computed(() => monthState(period.value, focusMonth.value))
const cutoffText = computed(() => {
  const p = period.value
  if (!p.isCurrentYear && p.cutoffMonth === 12) return p.lastActualMonth ? '全年' : '尚無資料'
  if (p.cutoffMonth === 0 || p.lastActualMonth == null) return '尚無資料'
  return `資料截至 ${p.lastActualMonth} 月`
})

function setFocusMonth(m: number) {
  if (Number.isInteger(m) && m >= 1 && m <= 12) selectedMonth.value = m
}
function shiftMonth(delta: number) {
  setFocusMonth(Math.min(12, Math.max(1, focusMonth.value + delta)))
}

// ── 固定支出登錄狀態（分頁列未登錄數＋總覽／收支分析的結帳狀態共用）────────
const fixedCost = useFixedCostStatus(selectedYear)
const missingFixedCostCount = computed<number | null>(() => {
  const s = fixedCost.status.value
  if (s.state !== 'ok') return null
  const registered = new Set(s.registered)
  let n = 0
  for (let m = 1; m <= period.value.cutoffMonth; m++) if (!registered.has(m)) n++
  return n
})

// ── 跨分頁導覽（總覽的結帳狀態動作、指標連結） ─────────────────────────
function onNavigate(payload: { tab: string; month?: number }) {
  if (payload.month != null) setFocusMonth(payload.month)
  if ((VALID_TABS as readonly string[]).includes(payload.tab)) activeTab.value = payload.tab
}

// ── 固定支出 dirty 離開保護 ─────────────────────────────────────────
async function confirmLoseFixedCost(): Promise<boolean> {
  if (!(activeTab.value === 'fixed-cost' && fixedCostDirty.value)) return true
  try {
    await ElMessageBox.confirm('固定費用尚有未儲存變更，確定離開並捨棄？', '未儲存變更', {
      type: 'warning',
      confirmButtonText: '捨棄變更',
      cancelButtonText: '留在此頁',
    })
    return true
  } catch {
    return false
  }
}

async function onYearChange(y: number): Promise<void> {
  if (await confirmLoseFixedCost()) {
    selectedYear.value = y
    selectedMonth.value = null // 換年度回到該年的預設月份
  }
  // 取消則不 commit；el-select 受控於 :model-value 會自動還原顯示
}

async function onTabBeforeLeave(_activeName: string | number, oldName: string | number): Promise<boolean> {
  if (oldName === 'fixed-cost' && fixedCostDirty.value) {
    return confirmLoseFixedCost()
  }
  return true
}

// ── 匯出（集中在頁首，取代各分頁各自的按鈕） ───────────────────────────
type ExportKind = 'finance-year' | 'finance-month' | 'pnl'
const exporting = ref(false)
async function onExport(kind: ExportKind) {
  const y = selectedYear.value
  const m = focusMonth.value
  const target = {
    'finance-year': { url: financeSummaryExportUrl(y), name: `收支彙總_${y}-全年.xlsx` },
    'finance-month': { url: financeSummaryExportUrl(y, m), name: `收支彙總_${y}-${String(m).padStart(2, '0')}.xlsx` },
    pnl: { url: monthlyPnlExportUrl(y), name: `現金收支表_${y}.xlsx` },
  }[kind]
  exporting.value = true
  try {
    await downloadFile(target.url, target.name)
  } catch (e) {
    ElMessage.error(apiError(e, '匯出失敗'))
  } finally {
    exporting.value = false
  }
}

const notesOpen = ref(false)

defineExpose({
  selectedYear,
  selectedMonth,
  focusMonth,
  activeTab,
  fixedCostDirty,
  onYearChange,
  onTabBeforeLeave,
  setFocusMonth,
  onExport,
})
</script>

<template>
  <div class="reports-page">
    <PageHeader :title="PAGE_TERMS.reports">
      <p class="reports-sub">
        現金收付實現制 · 含薪資、固定支出、廠商付款、年終撥款與代收手續費 ·
        <span data-test="data-cutoff-badge">{{ cutoffText }}</span> ·
        <button type="button" class="notes-link" data-test="open-notes" @click="notesOpen = true">口徑說明</button>
      </p>
      <template #actions>
        <div class="period" data-test="period-controls">
          <el-select
            :model-value="selectedYear"
            class="period__year"
            aria-label="年度"
            data-test="year-select"
            @change="onYearChange"
          >
            <el-option v-for="y in YEAR_OPTIONS" :key="y" :label="`${y} 年`" :value="y" />
          </el-select>
          <div class="monthnav" role="group" aria-label="月份焦點">
            <el-button
              class="monthnav__step" :icon="ArrowLeft" text aria-label="上個月"
              :disabled="focusMonth <= 1" data-test="month-prev" @click="shiftMonth(-1)"
            />
            <el-select
              :model-value="focusMonth"
              class="monthnav__select"
              aria-label="月份"
              data-test="month-select"
              @change="setFocusMonth"
            >
              <el-option v-for="m in MONTH_OPTIONS" :key="m" :label="`${m} 月`" :value="m" />
            </el-select>
            <span v-if="focusState !== 'past'" class="monthnav__state" data-test="month-state">
              {{ focusState === 'current' ? '進行中' : '未來月' }}
            </span>
            <el-button
              class="monthnav__step" :icon="ArrowRight" text aria-label="下個月"
              :disabled="focusMonth >= 12" data-test="month-next" @click="shiftMonth(1)"
            />
          </div>
          <el-dropdown trigger="click" @command="onExport">
            <el-button :icon="Download" :loading="exporting" data-test="export-button">
              匯出 Excel<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="finance-month">收支彙總：{{ selectedYear }} 年 {{ focusMonth }} 月（含明細）</el-dropdown-item>
                <el-dropdown-item command="finance-year">收支彙總：{{ selectedYear }} 年全年</el-dropdown-item>
                <el-dropdown-item command="pnl">現金收支表：{{ selectedYear }} 年</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </template>
    </PageHeader>

    <el-tabs v-model="activeTab" class="reports-tabs" :before-leave="onTabBeforeLeave">
      <el-tab-pane label="總覽" name="overview">
        <OverviewPanel
          v-if="activeTab === 'overview' && panelsReady"
          :key="selectedYear"
          :year="selectedYear"
          :focus-month="focusMonth"
          :fixed-cost="fixedCost.status.value"
          @update:focus-month="setFocusMonth"
          @navigate="onNavigate"
        />
      </el-tab-pane>
      <el-tab-pane label="收支分析" name="finance">
        <FinanceSummaryPanel
          v-if="activeTab === 'finance' && panelsReady"
          :key="selectedYear"
          :year="selectedYear"
          :focus-month="focusMonth"
          :fixed-cost="fixedCost.status.value"
          @update:focus-month="setFocusMonth"
          @navigate="onNavigate"
        />
      </el-tab-pane>
      <el-tab-pane label="現金收支表" name="monthly-pnl">
        <MonthlyPnLPanel
          v-if="activeTab === 'monthly-pnl' && panelsReady"
          :key="selectedYear"
          :year="selectedYear"
          :focus-month="focusMonth"
          @update:focus-month="setFocusMonth"
        />
      </el-tab-pane>
      <el-tab-pane label="人事成本" name="salary">
        <SalaryPanel
          v-if="activeTab === 'salary' && panelsReady"
          :key="selectedYear"
          :year="selectedYear"
          :focus-month="focusMonth"
          @update:focus-month="setFocusMonth"
          @navigate="onNavigate"
        />
      </el-tab-pane>
      <el-tab-pane label="教職員出勤" name="attendance">
        <AttendancePanel
          v-if="activeTab === 'attendance' && panelsReady"
          :key="selectedYear"
          :year="selectedYear"
          :focus-month="focusMonth"
          @update:focus-month="setFocusMonth"
        />
      </el-tab-pane>
      <el-tab-pane name="fixed-cost">
        <template #label>
          <span class="tab-entry" data-test="fixed-cost-tab-label">
            <el-icon :size="13"><EditPen /></el-icon>
            固定支出登錄
            <span
              v-if="missingFixedCostCount"
              class="tab-entry__count"
              data-test="fixed-cost-missing-count"
              :aria-label="`${missingFixedCostCount} 個月未登錄`"
            >{{ missingFixedCostCount }}</span>
          </span>
        </template>
        <MonthlyFixedCostPanel
          v-if="activeTab === 'fixed-cost'"
          :key="selectedYear"
          :year="selectedYear"
          :highlight-month="selectedMonth ?? undefined"
          @update:dirty="fixedCostDirty = $event"
          @saved="fixedCost.reload()"
        />
      </el-tab-pane>
    </el-tabs>

    <el-skeleton v-if="!panelsReady && activeTab !== 'fixed-cost'" :rows="8" animated data-test="period-loading" />

    <ReportNotesDrawer v-model="notesOpen" />
  </div>
</template>

<style scoped>
.reports-page { padding: 0; }
.reports-sub {
  margin: 4px 0 0;
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}
.notes-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--el-color-primary);
  cursor: pointer;
  border-bottom: 1px dashed currentColor;
}
.notes-link:focus-visible { outline: 2px solid var(--el-color-primary); outline-offset: 2px; }

.period { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; justify-content: flex-end; }
.period__year { width: 112px; }
.monthnav {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--el-border-color);
  border-radius: var(--radius-md);
  background: var(--el-bg-color);
  height: 32px;
}
.monthnav__step { height: 30px; padding: 0 6px; }
.monthnav__select { width: 82px; }
.monthnav__select :deep(.el-select__wrapper) { box-shadow: none; background: transparent; }
.monthnav__state {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border-radius: var(--radius-sm);
  padding: 0 6px;
  white-space: nowrap;
}

/* 分頁：底線式；固定支出登錄靠右，和「看報表」的分頁分開（它是唯一會寫資料的地方） */
.reports-tabs :deep(.el-tabs__item) { font-weight: 600; }
.reports-tabs :deep(.el-tabs__nav) { width: 100%; }
.reports-tabs :deep(#tab-fixed-cost) { margin-left: auto; }
.tab-entry { display: inline-flex; align-items: center; gap: 4px; }
.tab-entry__count {
  /* warning-darker 底＋白字過 AA（同舊版待辦計數稽核 M5） */
  background: var(--color-warning-darker);
  color: var(--el-color-white);
  font-size: var(--text-xs);
  font-weight: 700;
  line-height: 18px;
  min-width: 18px;
  text-align: center;
  border-radius: var(--radius-full);
  padding: 0 6px;
}
@media (--to-sm) {
  .reports-tabs :deep(.el-tabs__nav) { width: auto; }
  .reports-tabs :deep(#tab-fixed-cost) { margin-left: 0; }
  .period { justify-content: flex-start; }
}
</style>
