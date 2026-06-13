<template>
  <div class="admissions-view">
    <div class="page-header">
      <div class="page-header-left">
        <div class="page-header-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>
          </svg>
        </div>
        <div>
          <h2 class="page-title">招生入學</h2>
          <p class="page-subtitle">參觀 → 預繳 → 報到 → 開學 · 統計分析</p>
        </div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="admissions-tabs" @tab-change="onTabChange">
      <el-tab-pane label="漏斗看板" name="funnel">
        <FunnelBoard />
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

function drillToRecords(patch: Record<string, unknown>) {
  recordsFilterPatch.value = { ...patch }
  activeTab.value = 'records'
}

function onTabChange(name: string | number) {
  // 漏斗推卡會改變訪視 enrolled 狀態；切回明細時重抓避免顯示過期資料
  if (name === 'records') void recordsPanelRef.value?.fetchDetail()
}

async function onRecordsChanged() {
  await dashboard.fetchStats()
  dashboard.invalidateOptions()
  void funnelStore.loadBoard({ force: true }) // 訪視 CRUD/轉化會改變漏斗卡片；force 避免 loadingBoard 靜默跳過
}

onMounted(() => {
  dashboard.loadDashboard()
  const kw = typeof route.query.keyword === 'string' ? route.query.keyword : ''
  if (kw) drillToRecords({ keyword: kw })
})
</script>

<style scoped>
/* ── Design Tokens（對齊 RecruitmentView）── */
.admissions-view {
  --rv-primary:    #1e40af;
  --rv-primary-lt: #dbeafe;
  --rv-text:       #1e293b;
  --rv-text-2:     #64748b;
  padding: 8px 0;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4, 16px);
}
.page-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.page-header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--rv-primary-lt);
  color: var(--rv-primary);
  flex-shrink: 0;
}
.page-title {
  margin: 0;
  font-size: 18px;
}
.page-subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
