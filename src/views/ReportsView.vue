<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { EditPen } from '@element-plus/icons-vue'
import { getUserInfo } from '@/utils/auth'
import { getFinanceSummary } from '@/api/reports'
import { computeReportPeriod } from './reports/useReportPeriod'
import type { FinanceTrendRow } from './reports/financeTrend'
import OverviewPanel from './reports/OverviewPanel.vue'
import FinanceSummaryPanel from './reports/FinanceSummaryPanel.vue'
import MonthlyPnLPanel from './reports/MonthlyPnLPanel.vue'
import MonthlyFixedCostPanel from './reports/MonthlyFixedCostPanel.vue'
import AttendancePanel from './reports/AttendancePanel.vue'
import SalaryPanel from './reports/SalaryPanel.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { PAGE_TERMS } from '@/constants/moduleTerms'

const route = useRoute()
const router = useRouter()

const viewerName = computed(() => {
  const info = getUserInfo()
  return info?.display_name || info?.username || '管理員'
})

const VALID_TABS = ['overview', 'finance', 'monthly-pnl', 'attendance', 'salary', 'fixed-cost'] as const
const currentYear = new Date().getFullYear()

// ── URL query 還原（無效值 fallback，不報錯） ──────────────────────────
function parseTab(raw: unknown): string {
  return typeof raw === 'string' && (VALID_TABS as readonly string[]).includes(raw) ? raw : 'overview'
}
function parseYear(raw: unknown): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 2000 && n <= 2999 ? n : currentYear
}
const selectedYear = ref(parseYear(route.query.year))
const activeTab = ref(parseTab(route.query.tab))
const fixedCostDirty = ref(false)

// tab/年度 → query（replace 不塞 history）
watch([activeTab, selectedYear], ([tab, year]) => {
  router.replace({ query: { ...route.query, tab, year: String(year) } })
}, { immediate: true })

// ── 「資料截至 X 月」badge：與 panel 共用同一端點（輕量 GET，5 分鐘內多為 server cache）
const badgeTrend = ref<FinanceTrendRow[]>([])
watch(selectedYear, async (y) => {
  badgeTrend.value = []
  let rows: FinanceTrendRow[] = []
  try {
    const res = await getFinanceSummary(y)
    rows = res.data?.monthly_trend || []
  } catch {
    rows = [] // badge 屬輔助資訊，載入失敗時顯示「尚無資料」不擋頁面
  }
  // stale guard：年度已再切換時丟棄晚到的舊 response，避免覆蓋新年度的 badge
  if (y !== selectedYear.value) return
  badgeTrend.value = rows
}, { immediate: true })

const period = computed(() => computeReportPeriod(selectedYear.value, badgeTrend.value))
const cutoffBadgeText = computed(() => {
  const p = period.value
  if (!p.isCurrentYear && p.cutoffMonth === 12) return '全年'
  if (p.cutoffMonth === 0) return '尚無資料'
  if (p.lastActualMonth == null) return '尚無資料'
  return `資料截至 ${p.lastActualMonth} 月`
})

// ── OverviewPanel 下鑽轉發 ────────────────────────────────────────────
const financeInitialMonth = ref<number | null>(null)
function onNavigate(payload: { tab: string; month?: number }) {
  if ((VALID_TABS as readonly string[]).includes(payload.tab)) {
    financeInitialMonth.value = payload.tab === 'finance' ? (payload.month ?? null) : null
    activeTab.value = payload.tab
  }
}
watch(activeTab, (t) => { if (t !== 'finance') financeInitialMonth.value = null })

// ── 固定支出 dirty 離開保護（既有邏輯不動） ──────────────────────────
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
  }
  // 取消則不 commit；el-select 受控於 :model-value 會自動還原顯示
}

async function onTabBeforeLeave(_activeName: string | number, oldName: string | number): Promise<boolean> {
  if (oldName === 'fixed-cost' && fixedCostDirty.value) {
    return confirmLoseFixedCost()
  }
  return true
}

defineExpose({
  selectedYear,
  activeTab,
  fixedCostDirty,
  onYearChange,
  onTabBeforeLeave,
})
</script>

<template>
  <div class="reports-page">
    <PageHeader :title="PAGE_TERMS.reports">
      <template #title-extra>
        <span class="viewer-tag">{{ viewerName }} 的{{ PAGE_TERMS.reports }}</span>
      </template>
      <template #actions>
        <el-tag type="info" effect="plain" size="small" data-test="data-cutoff-badge">{{ cutoffBadgeText }}</el-tag>
        <el-select :model-value="selectedYear" style="width: 120px;" @change="onYearChange">
          <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
        </el-select>
      </template>
    </PageHeader>

    <el-tabs v-model="activeTab" type="card" class="reports-tabs" :before-leave="onTabBeforeLeave">
      <el-tab-pane label="經營總覽" name="overview">
        <OverviewPanel v-if="activeTab === 'overview'" :key="selectedYear" :year="selectedYear" @navigate="onNavigate" />
      </el-tab-pane>
      <el-tab-pane label="收支彙總" name="finance">
        <FinanceSummaryPanel v-if="activeTab === 'finance'" :key="selectedYear" :year="selectedYear" :initial-month="financeInitialMonth" />
      </el-tab-pane>
      <el-tab-pane label="現金收支表" name="monthly-pnl">
        <MonthlyPnLPanel v-if="activeTab === 'monthly-pnl'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="出勤" name="attendance">
        <AttendancePanel v-if="activeTab === 'attendance'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="薪資" name="salary">
        <SalaryPanel v-if="activeTab === 'salary'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane name="fixed-cost">
        <template #label>
          <span class="tab-entry-label"><el-icon :size="13"><EditPen /></el-icon> 固定支出登錄</span>
        </template>
        <MonthlyFixedCostPanel
          v-if="activeTab === 'fixed-cost'"
          :key="selectedYear"
          :year="selectedYear"
          @update:dirty="fixedCostDirty = $event"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.reports-page { padding: 0; }
.viewer-tag { font-size: 13px; color: var(--el-text-color-secondary); }
.tab-entry-label { display: inline-flex; align-items: center; gap: 4px; }
.reports-tabs :deep(.el-tabs__item) { font-weight: 600; }
</style>
