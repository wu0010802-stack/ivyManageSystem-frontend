<template>
  <div class="ivk-tab">
    <!-- ── Section 1：同步控制列 ── -->
    <div class="ivk-sync-bar" v-loading="loadingStatus">
      <div class="ivk-sync-info">
        <span class="ivk-sync-label">{{ syncStatus?.provider_label ?? '義華校官網' }}</span>
        <span class="ivk-sync-meta">
          <template v-if="syncStatus?.last_synced_at">
            上次同步：{{ lastSyncedDisplay }}
            <template v-if="syncStatus?.last_sync_counts">
              ·
              新增 {{ syncStatus.last_sync_counts.inserted ?? 0 }}
              更新 {{ syncStatus.last_sync_counts.updated ?? 0 }}
              略過 {{ syncStatus.last_sync_counts.skipped ?? 0 }}
            </template>
          </template>
          <template v-else>
            尚未執行過同步
          </template>
        </span>
      </div>
      <div class="ivk-sync-tags">
        <el-tag :type="syncStatusTagType" size="small" effect="light">
          {{ syncStatusLabel }}
        </el-tag>
        <el-tag v-if="syncStatus?.scheduler_enabled" type="info" size="small" effect="plain">
          自動同步 {{ syncStatus.sync_interval_minutes }}分
        </el-tag>
      </div>
      <div v-if="canWrite" class="ivk-sync-actions">
        <el-button type="primary" size="small" :loading="syncing" @click="handleSync">
          立即同步
        </el-button>
        <el-button type="danger" size="small" plain :loading="deleting" @click="handleDeleteAll">
          刪除全部資料
        </el-button>
      </div>
    </div>

    <!-- ── Section 2：KPI 卡片列 ── -->
    <div class="kpi-row" v-loading="loadingStats">
      <div class="kpi-card kpi-card--primary">
        <div class="kpi-label">總報名人數</div>
        <div class="kpi-value">{{ ivkStats.total_visit }}</div>
        <div class="kpi-sub">自 2024-05 起累計</div>
      </div>
      <div class="kpi-card kpi-card--green">
        <div class="kpi-label">預繳人數</div>
        <div class="kpi-value">{{ ivkStats.total_deposit }}</div>
        <div class="kpi-sub">有效預繳</div>
      </div>
      <div class="kpi-card kpi-card--indigo">
        <div class="kpi-label">已報到人數</div>
        <div class="kpi-value">{{ ivkStats.total_enrolled }}</div>
        <div class="kpi-sub">完成入學</div>
      </div>
      <div class="kpi-card kpi-card--amber">
        <div class="kpi-label">預繳率</div>
        <div class="kpi-value">{{ depositRate }}</div>
        <div class="kpi-sub">預繳 / 總報名</div>
      </div>
    </div>

    <!-- ── Section 3：圖表兩欄 ── -->
    <div class="chart-row">
      <el-card class="chart-card">
        <template #header>如何知道常春藤幼兒園（來源分佈）</template>
        <div class="chart-box-tall">
          <component
            :is="barComponent"
            v-if="showCharts && sourceBarData"
            :data="sourceBarData"
            :options="sourceChartOptions"
          />
          <el-empty v-else-if="!loadingStats && !ivkStats.by_source.length" description="尚無來源資料" />
        </div>
      </el-card>
      <el-card class="chart-card">
        <template #header>月份報名趨勢</template>
        <div class="chart-box-tall">
          <component
            :is="barComponent"
            v-if="showCharts && monthTrendData"
            :data="monthTrendData"
            :options="monthChartOptions"
          />
          <el-empty v-else-if="!loadingStats && !ivkStats.by_month.length" description="尚無月份資料" />
        </div>
      </el-card>
    </div>

    <!-- ── Section 4：來源統計表 ── -->
    <el-card class="source-table">
      <template #header>來源明細統計</template>
      <el-table :data="ivkStats.by_source" border stripe size="small" v-loading="loadingStats">
        <el-table-column type="index" label="#" width="50" align="center" />
        <el-table-column prop="source" label="如何知道常春藤幼兒園" min-width="160" />
        <el-table-column prop="visit" label="報名人數" align="center" width="100">
          <template #default="{ row }">
            <span class="num-cell">{{ row.visit }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="deposit" label="預繳人數" align="center" width="100">
          <template #default="{ row }">
            <span class="num-cell">{{ row.deposit }}</span>
          </template>
        </el-table-column>
        <el-table-column label="預繳率" align="center" width="90">
          <template #default="{ row }">
            <span :class="rateClass(row.deposit / row.visit * 100)">
              {{ row.visit ? (row.deposit / row.visit * 100).toFixed(1) + '%' : '—' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="佔比" align="center" width="90">
          <template #default="{ row }">
            {{ ivkStats.total_visit ? (row.visit / ivkStats.total_visit * 100).toFixed(1) + '%' : '—' }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- ── Section 5：篩選 + 明細表 ── -->
    <el-card>
      <template #header>
        <div class="records-header">
          <span>報名明細記錄</span>
          <span class="records-total">共 {{ recordsTotal }} 筆</span>
        </div>
      </template>

      <div class="filter-bar">
        <el-select
          v-model="filterSource"
          placeholder="篩選來源"
          clearable
          size="small"
          style="width: 180px"
          @change="onFilterChange"
        >
          <el-option
            v-for="s in sourceOptions"
            :key="s"
            :label="s || '（未填）'"
            :value="s"
          />
        </el-select>
        <el-select
          v-model="filterMonth"
          placeholder="篩選月份"
          clearable
          size="small"
          style="width: 140px"
          @change="onFilterChange"
        >
          <el-option
            v-for="m in monthOptions"
            :key="m"
            :label="m"
            :value="m"
          />
        </el-select>
        <el-button size="small" @click="onClearFilter">清除篩選</el-button>
      </div>

      <el-table
        :data="records"
        border
        stripe
        size="small"
        v-loading="loadingRecords"
        style="margin-bottom: 12px"
      >
        <el-table-column prop="visit_date" label="報名日期" width="130">
          <template #default="{ row }">{{ row.visit_date || row.month || '—' }}</template>
        </el-table-column>
        <el-table-column prop="child_name" label="幼生姓名" width="100" />
        <el-table-column label="電話" width="130">
          <template #default="{ row }">{{ maskPhone(row.phone) }}</template>
        </el-table-column>
        <el-table-column prop="source" label="如何知道" min-width="140" />
        <el-table-column label="官網狀態" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.external_status)" size="small" effect="light">
              {{ row.external_status || '—' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="預繳" width="70" align="center">
          <template #default="{ row }">
            <el-tag :type="row.has_deposit ? 'success' : 'info'" size="small" effect="plain">
              {{ row.has_deposit ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="month" label="月份" width="90" align="center" />
        <el-table-column label="官網建立時間" width="160">
          <template #default="{ row }">
            {{ row.external_created_at || '—' }}
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="recordsPage"
        v-model:page-size="recordsPageSize"
        :total="recordsTotal"
        :page-sizes="[20, 50, 100]"
        layout="prev, pager, next, sizes, total"
        background
        small
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getRecruitmentIvykidsBackendStatus,
  getRecruitmentIvykidsStats,
  getRecruitmentIvykidsRecords,
  syncRecruitmentIvykidsBackend,
  deleteRecruitmentIvykidsBackendRecords,
} from '@/api/recruitmentIvykids'
import { apiError } from '@/utils/error'

const props = defineProps({
  barComponent: { type: [Object, Function], required: true },
  showCharts:   { type: Boolean, required: true },
  canWrite:     { type: Boolean, default: false },
})

// ── 同步狀態 ──
const syncStatus         = ref(null)
const loadingStatus      = ref(false)
const syncing            = ref(false)
const deleting           = ref(false)

// ── 統計資料 ──
const ivkStats = ref({
  by_source:     [],
  by_month:      [],
  total_visit:   0,
  total_deposit: 0,
  total_enrolled: 0,
})
const loadingStats = ref(false)

// ── 分頁記錄 ──
const records       = ref([])
const recordsTotal  = ref(0)
const loadingRecords = ref(false)
const recordsPage    = ref(1)
const recordsPageSize = ref(50)

// ── 篩選 ──
const filterSource = ref(null)
const filterMonth  = ref(null)

// ── 衍生選單 ──
const sourceOptions = computed(() => ivkStats.value.by_source.map(d => d.source).filter(Boolean))
const monthOptions  = computed(() => ivkStats.value.by_month.map(d => d.month))

// ── 衍生 KPI ──
const depositRate = computed(() => {
  const { total_visit, total_deposit } = ivkStats.value
  if (!total_visit) return '—'
  return (total_deposit / total_visit * 100).toFixed(1) + '%'
})

// ── 同步狀態顯示 ──
const syncStatusTagType = computed(() => {
  if (!syncStatus.value) return 'info'
  if (syncStatus.value.sync_in_progress)                return 'warning'
  if (syncStatus.value.last_sync_status === 'success')  return 'success'
  if (syncStatus.value.last_sync_status === 'failed')   return 'danger'
  return 'info'
})
const syncStatusLabel = computed(() => {
  if (!syncStatus.value) return '未連線'
  if (syncStatus.value.sync_in_progress)                return '同步中…'
  if (syncStatus.value.last_sync_status === 'success')  return '同步成功'
  if (syncStatus.value.last_sync_status === 'failed')   return '同步失敗'
  return '尚未同步'
})
const lastSyncedDisplay = computed(() => {
  const t = syncStatus.value?.last_synced_at
  if (!t) return '尚未同步'
  return new Date(t).toLocaleString('zh-TW')
})

// ── Chart options ──
const sourceChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y',
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx) => ` ${ctx.parsed.x} 人`,
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: { precision: 0 },
      grid: { color: '#F1F5F9' },
    },
    y: {
      ticks: { font: { size: 11 } },
      grid: { display: false },
    },
  },
}

const monthChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: 'top' },
  },
  scales: {
    x: { grid: { color: '#F1F5F9' } },
    y: {
      beginAtZero: true,
      ticks: { precision: 0 },
      grid: { color: '#F1F5F9' },
    },
  },
}

// ── Chart 資料 ──
const sourceBarData = computed(() => {
  const d = ivkStats.value.by_source
  if (!d.length) return null
  return {
    labels: d.map(r => r.source || '（未填）'),
    datasets: [{
      label: '報名人數',
      data: d.map(r => r.visit),
      backgroundColor: '#3B82F6',
      borderRadius: 4,
    }],
  }
})

const monthTrendData = computed(() => {
  const d = ivkStats.value.by_month
  if (!d.length) return null
  return {
    labels: d.map(r => r.month),
    datasets: [
      {
        label: '報名人數',
        data: d.map(r => r.visit),
        backgroundColor: '#60A5FA',
        borderRadius: 3,
      },
      {
        label: '預繳人數',
        data: d.map(r => r.deposit),
        backgroundColor: '#1D4ED8',
        borderRadius: 3,
      },
    ],
  }
})

// ── API 呼叫 ──
const fetchSyncStatus = async () => {
  loadingStatus.value = true
  try {
    const res = await getRecruitmentIvykidsBackendStatus()
    syncStatus.value = res.data
  } catch (e) {
    ElMessage.error(apiError(e, '載入同步狀態失敗'))
  } finally {
    loadingStatus.value = false
  }
}

const fetchIvykidsStats = async () => {
  loadingStats.value = true
  try {
    const res = await getRecruitmentIvykidsStats()
    const d = res.data || {}
    ivkStats.value = {
      by_source:      Array.isArray(d.by_source) ? d.by_source : [],
      by_month:       Array.isArray(d.by_month)  ? d.by_month  : [],
      total_visit:    d.total_visit    ?? 0,
      total_deposit:  d.total_deposit  ?? 0,
      total_enrolled: d.total_enrolled ?? 0,
    }
  } catch (e) {
    ElMessage.error(apiError(e, '載入官網報名統計失敗'))
  } finally {
    loadingStats.value = false
  }
}

const fetchRecords = async () => {
  loadingRecords.value = true
  try {
    const params = { page: recordsPage.value, page_size: recordsPageSize.value }
    if (filterSource.value) params.source = filterSource.value
    if (filterMonth.value)  params.month  = filterMonth.value
    const res = await getRecruitmentIvykidsRecords(params)
    records.value      = res.data.records || []
    recordsTotal.value = res.data.total   || 0
  } catch (e) {
    ElMessage.error(apiError(e, '載入報名記錄失敗'))
  } finally {
    loadingRecords.value = false
  }
}

// ── 操作 ──
const handleSync = async () => {
  syncing.value = true
  try {
    const res = await syncRecruitmentIvykidsBackend({})
    ElMessage.success(res.data?.message || '同步完成')
    await Promise.all([fetchSyncStatus(), fetchIvykidsStats()])
    recordsPage.value = 1
    await fetchRecords()
  } catch (e) {
    ElMessage.error(apiError(e, '同步失敗'))
  } finally {
    syncing.value = false
  }
}

const handleDeleteAll = async () => {
  try {
    await ElMessageBox.confirm(
      '確定要刪除所有義華官網同步的報名記錄並重置同步狀態嗎？此操作無法復原。',
      '警告',
      { type: 'warning', confirmButtonText: '確定刪除', cancelButtonText: '取消' },
    )
    deleting.value = true
    await deleteRecruitmentIvykidsBackendRecords()
    ElMessage.success('已刪除所有官網報名記錄')
    await Promise.all([fetchSyncStatus(), fetchIvykidsStats()])
    recordsPage.value = 1
    records.value = []
    recordsTotal.value = 0
    await fetchRecords()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(apiError(e, '刪除失敗'))
  } finally {
    deleting.value = false
  }
}

const onFilterChange = () => {
  recordsPage.value = 1
  fetchRecords()
}

const onClearFilter = () => {
  filterSource.value = null
  filterMonth.value  = null
  recordsPage.value  = 1
  fetchRecords()
}

const onPageChange = (page) => {
  recordsPage.value = page
  fetchRecords()
}

const onSizeChange = (size) => {
  recordsPageSize.value = size
  recordsPage.value = 1
  fetchRecords()
}

// ── 顯示工具 ──
const maskPhone = (phone) => {
  if (!phone) return '—'
  const s = String(phone)
  if (s.length <= 6) return s
  return s.slice(0, 3) + '****' + s.slice(-3)
}

const statusTagType = (status) => {
  if (!status) return 'info'
  if (status.includes('已') || status.includes('確認')) return 'success'
  if (status.includes('待') || status.includes('未'))   return 'warning'
  if (status.includes('取消') || status.includes('拒')) return 'danger'
  return 'info'
}

const rateClass = (pct) => {
  if (pct >= 60) return 'rate-high'
  if (pct >= 30) return 'rate-mid'
  return 'rate-low'
}

onMounted(() => {
  Promise.all([fetchSyncStatus(), fetchIvykidsStats(), fetchRecords()])
})
</script>

<style scoped>
/* ── 同步控制列 ── */
.ivk-sync-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 14px 18px;
  margin-bottom: 16px;
  background: #FFFFFF;
  border: 1px solid #DBEAFE;
  border-left: 4px solid #1E40AF;
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(30, 64, 175, 0.06);
}

.ivk-sync-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 200px;
}

.ivk-sync-label {
  font-weight: 700;
  font-size: 0.97rem;
  color: #1E293B;
}

.ivk-sync-meta {
  font-size: 0.8rem;
  color: #64748B;
}

.ivk-sync-tags {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.ivk-sync-actions {
  display: flex;
  gap: 8px;
}

/* ── KPI 卡片 ── */
.kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.kpi-card {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-left: 3px solid transparent;
  border-radius: 12px;
  padding: 16px;
  transition: box-shadow 0.15s ease;
}

.kpi-card:hover {
  box-shadow: 0 2px 12px rgba(30, 64, 175, 0.08);
}

.kpi-card--primary { border-left-color: #1E40AF; }
.kpi-card--green   { border-left-color: #16A34A; }
.kpi-card--indigo  { border-left-color: #6366F1; }
.kpi-card--amber   { border-left-color: #D97706; }

.kpi-label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #94A3B8;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.kpi-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 2rem;
  font-weight: 700;
  color: #1E3A8A;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  margin-bottom: 4px;
}

.kpi-sub {
  font-size: 0.72rem;
  color: #94A3B8;
}

/* ── 圖表 ── */
.chart-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.chart-card :deep(.el-card__body) {
  padding: 12px 16px;
}

.chart-box-tall {
  height: 350px;
  position: relative;
}

/* ── 來源統計表 ── */
.source-table {
  margin-bottom: 16px;
}

.num-cell {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}

.rate-high { color: #15803D; font-weight: 600; }
.rate-mid  { color: #D97706; font-weight: 600; }
.rate-low  { color: #DC2626; font-weight: 600; }

/* ── 明細表 ── */
.records-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.records-total {
  font-size: 0.78rem;
  color: #94A3B8;
  font-weight: 400;
}

.filter-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

@media (max-width: 960px) {
  .chart-row { grid-template-columns: 1fr; }
}
</style>
