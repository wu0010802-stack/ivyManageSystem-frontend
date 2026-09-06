<template>
  <div class="admissions-view">
    <PageHeader title="招生入學" subtitle="參觀 → 預繳 → 註冊 ｜ 退預繳／退註冊 · 統計分析">
      <template #icon>
        <div class="page-header-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
        </div>
      </template>
    </PageHeader>

    <el-tabs v-model="activeTab" class="admissions-tabs" @tab-change="onTabChange">
      <el-tab-pane label="漏斗看板" name="funnel">
        <FunnelBoard
          :dashboard="dashboard"
          @created="onFunnelVisitCreated"
          @show-unscoped="showUnscopedVisits"
        />
      </el-tab-pane>
      <el-tab-pane label="訪視明細" name="records" lazy>
        <AdmissionsRecordsPanel
          ref="recordsPanelRef"
          :dashboard="dashboard"
          :filter-patch="recordsFilterPatch"
          @changed="onRecordsChanged"
        />
      </el-tab-pane>
      <el-tab-pane label="名額規劃" name="intake" lazy>
        <IntakePlanPanel />
      </el-tab-pane>
      <el-tab-pane label="官網報名" name="ivykids" lazy>
        <RecruitmentIvykidsTab :bar-component="LazyBar" :show-charts="true" :can-write="canWrite" />
      </el-tab-pane>
      <el-tab-pane label="統計分析" name="stats" lazy>
        <RecruitmentStatsPanel
          ref="statsPanelRef"
          :dashboard="dashboard"
          @drill-records="drillToRecords"
        />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { hasPermission } from '@/utils/auth'
import { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import { useRecruitmentFunnelStore } from '@/stores/recruitmentFunnel'
import { LazyBar } from '@/components/recruitment/lazyChartComponents'
import FunnelBoard from '@/components/recruitment/funnel/FunnelBoard.vue'
import AdmissionsRecordsPanel from '@/components/recruitment/AdmissionsRecordsPanel.vue'
import IntakePlanPanel from '@/components/recruitment/IntakePlanPanel.vue'
import RecruitmentIvykidsTab from '@/components/recruitment/RecruitmentIvykidsTab.vue'
import RecruitmentStatsPanel from '@/components/recruitment/RecruitmentStatsPanel.vue'
import PageHeader from '@/components/common/PageHeader.vue'

const VALID_TABS = ['funnel', 'records', 'intake', 'ivykids', 'stats'] as const
type AdmissionsTab = (typeof VALID_TABS)[number]

const route = useRoute()
const initialTab = ((): AdmissionsTab => {
  const t = typeof route.query.tab === 'string' ? route.query.tab : ''
  return (VALID_TABS as readonly string[]).includes(t) ? (t as AdmissionsTab) : 'funnel'
})()
const activeTab = ref<AdmissionsTab>(initialTab)

const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))
const dashboard = useRecruitmentDashboard({ notifyError: (m: string) => ElMessage.error(m) })
const funnelStore = useRecruitmentFunnelStore()
// 注意：panel 為 lazy keep-mounted，patch 僅在 panel watch/onMounted 各讀一次；
// 若日後改 destroy-on-hide，殘留 patch 會在 remount 重套舊篩選
const recordsFilterPatch = ref<Record<string, unknown> | null>(null)
const recordsPanelRef = ref<InstanceType<typeof AdmissionsRecordsPanel> | null>(null)
const statsPanelRef = ref<InstanceType<typeof RecruitmentStatsPanel> | null>(null)

function drillToRecords(patch: Record<string, unknown>) {
  recordsFilterPatch.value = { ...patch }
  activeTab.value = 'records'
}

/**
 * 看板提示「有 N 筆沒有入學學期」時的去處（2026-09-06）：切到訪視明細並清掉
 * 學年學期篩選，讓那些訪視真的看得到——否則使用者切過去仍被同一組篩選擋住。
 */
function showUnscopedVisits() {
  drillToRecords({ school_year: null, semester: null })
}

function onTabChange(name: string | number) {
  // 漏斗推卡會改變訪視 enrolled 狀態；切回明細時重抓避免顯示過期資料
  if (name === 'records') void recordsPanelRef.value?.fetchDetail()
}

async function onRecordsChanged() {
  await dashboard.fetchStats()
  dashboard.invalidateOptions()
  void funnelStore.loadBoard({ force: true }) // 訪視 CRUD/轉化會改變漏斗卡片；force 避免 loadingBoard 靜默跳過
  statsPanelRef.value?.invalidateLazyTabs() // 訪視變更後統計 lazy tab 重載
}

// 看板直接新增訪視後：同步統計與選項（看板本身已由 FunnelBoard 重載，故此處不再 loadBoard）
async function onFunnelVisitCreated() {
  await dashboard.fetchStats()
  dashboard.invalidateOptions()
  statsPanelRef.value?.invalidateLazyTabs()
}

onMounted(() => {
  dashboard.loadDashboard()
  const kw = typeof route.query.keyword === 'string' ? route.query.keyword : ''
  if (kw) drillToRecords({ keyword: kw })
})
</script>

<style scoped>
/* 顏色一律走全域 admin brand token（design-tokens.css html.ivy-admin 青藍 #0284c7）。
 * 舊 --rv-* 海軍藍 local palette（#1e40af 系，抄自 RecruitmentView）已移除——與 admin
 * 品牌色相漂移，且 --rv-text/--rv-text-2 本檔並無消費者。 */
.admissions-view {
  padding: var(--space-2) 0;
}
/* 置於 PageHeader #icon slot（slot 內容持有本檔 scope id，樣式可達） */
.page-header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  /* 圖示屬 graphical object（WCAG 1.4.11 門檻 3:1）：
   * light #0284c7 on --brand-primary-soft #e0f2fe = 3.6:1 ✓
   * dark  #38bdf8 on rgba(56,189,248,.18) 疊 #0f172a（等效 ~#16354f）= 5.9:1 ✓ */
  background: var(--brand-primary-soft);
  color: var(--brand-primary);
  flex-shrink: 0;
}
</style>
