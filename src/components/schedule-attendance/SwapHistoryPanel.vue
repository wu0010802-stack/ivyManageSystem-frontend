<template>
  <section class="swap-history" aria-label="換班紀錄">
    <div class="swap-history__filters">
      <el-date-picker v-model="filter.start_date" type="date" placeholder="開始日期" value-format="YYYY-MM-DD" class="swap-history__date" aria-label="開始日期" />
      <el-date-picker v-model="filter.end_date" type="date" placeholder="結束日期" value-format="YYYY-MM-DD" class="swap-history__date" aria-label="結束日期" />
      <el-select v-model="filter.status" placeholder="狀態" clearable class="swap-history__status" aria-label="狀態">
        <el-option label="待回覆" value="pending" />
        <el-option label="已接受" value="accepted" />
        <el-option label="已拒絕" value="rejected" />
        <el-option label="已撤銷" value="cancelled" />
      </el-select>
      <el-button type="primary" data-test="swap-query" @click="fetchHistory">查詢</el-button>
    </div>

    <AdminListToolbar v-model:search="search" search-placeholder="搜尋發起人或對象姓名" :total="total" :shown="shown" />

    <el-table v-if="!isMobile" v-loading="loading" :data="filtered" :row-key="rowKey" stripe class="swap-history__table" data-test="swap-table">
      <template #empty>
        <el-empty :description="search ? '沒有符合搜尋條件的換班紀錄' : '尚無換班紀錄'" />
      </template>
      <el-table-column label="換班日期" width="120">
        <template #default="{ row }">
          {{ row.swap_date }}
          <el-tag v-if="isBackdated(row)" type="warning" size="small" effect="plain" data-test="swap-backdated-tag">補登</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="requester_name" label="發起人" width="100" />
      <el-table-column prop="requester_shift" label="發起人班別" width="110" />
      <el-table-column prop="target_name" label="對象" width="100" />
      <el-table-column prop="target_shift" label="對象班別" width="110" />
      <el-table-column prop="reason" label="原因" min-width="120" show-overflow-tooltip />
      <el-table-column label="狀態" width="90">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="target_responded_at" label="回覆時間" width="160" />
      <el-table-column prop="created_at" label="申請時間" width="160" />
    </el-table>
    <AdminListCards
      v-else
      :items="filtered"
      :columns="cardColumns"
      row-key="__key"
      :loading="loading"
      :empty-text="search ? '沒有符合搜尋條件的換班紀錄' : '尚無換班紀錄'"
    >
      <template #title="{ item }">
        {{ item.requester_name }} <el-icon><ArrowRight /></el-icon> {{ item.target_name }}
        <el-tag v-if="isBackdated(item)" type="warning" size="small" effect="plain" data-test="swap-backdated-tag">補登</el-tag>
      </template>
      <template #cell-__requester="{ item }">
        {{ item.requester_name }}<span v-if="item.requester_shift">（{{ item.requester_shift }}）</span>
      </template>
      <template #cell-__target="{ item }">
        {{ item.target_name }}<span v-if="item.target_shift">（{{ item.target_shift }}）</span>
      </template>
      <template #cell-__status="{ item }">
        <el-tag :type="statusType(item.status as string)" size="small">{{ statusLabel(item.status as string) }}</el-tag>
      </template>
    </AdminListCards>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowRight } from '@element-plus/icons-vue'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useClientTableFilter } from '@/composables'
import { useIsMobile } from '@/composables/useIsMobile'
import { getSwapHistory } from '@/api/shifts'
import { friendlyError } from '@/utils/errorMessages'

// 原屬排班頁「換班紀錄」頁籤（SPEC-027 §6.2 抽成可重用面板，行為不變）。
// SPEC-026 3-3：BE 另把行政已套用的老師自行補登併進來（source="backdated"，status 固定 "applied"）。
// 兩種來源的 id 各自編號、會撞號，列 key 一律用 `${source}-${id}`。
const cardColumns = [
  { label: '換班日期', prop: 'swap_date' },
  { label: '發起人', prop: '__requester' },
  { label: '對象', prop: '__target' },
  { label: '狀態', prop: '__status' },
  { label: '申請時間', prop: 'created_at' },
  { label: '回覆時間', prop: '__responded', formatter: (r: Record<string, unknown>) => (r.target_responded_at as string) || '—' },
  { label: '原因', prop: 'reason', block: true, formatter: (r: Record<string, unknown>) => (r.reason as string) || '—' },
]

type HistoryRow = Record<string, unknown>
const isBackdated = (r: HistoryRow) => r.source === 'backdated'
// 舊版後端沒有 source 欄位時視為一般申請
const rowKey = (r: HistoryRow) => `${(r.source as string | undefined) ?? 'request'}-${r.id}`

const { isMobile } = useIsMobile()
const history = ref<Record<string, unknown>[]>([])
const loading = ref(false)
const filter = reactive({ start_date: '', end_date: '', status: '' })

// 客端關鍵字過濾：查詢區間內資料已全載，發起人/對象姓名即打即濾，與日期/狀態（伺服器端）交集
const { searchQuery: search, filtered, total, shown } = useClientTableFilter<Record<string, unknown>>({
  source: () => history.value,
  searchFields: (r) => [r.requester_name as string | undefined, r.target_name as string | undefined],
})

async function fetchHistory(): Promise<void> {
  loading.value = true
  try {
    const params: Record<string, string> = {}
    if (filter.start_date) params.start_date = filter.start_date
    if (filter.end_date) params.end_date = filter.end_date
    if (filter.status) params.status = filter.status
    history.value = (await getSwapHistory(params)).data.map((r: HistoryRow) => ({ ...r, __key: rowKey(r) }))
  } catch (err) {
    ElMessage.error(friendlyError('載入換班紀錄失敗', err))
  } finally {
    loading.value = false
  }
}

const statusLabel = (status: string) =>
  ({ pending: '待回覆', accepted: '已接受', rejected: '已拒絕', cancelled: '已撤銷', applied: '已補登' } as Record<string, string>)[status] || status

type TagType = 'primary' | 'success' | 'warning' | 'info' | 'danger'
const statusType = (status: string): TagType =>
  ({ pending: 'warning', accepted: 'success', rejected: 'danger', cancelled: 'info', applied: 'success' } as Record<string, TagType>)[status] ?? 'info'

onMounted(fetchHistory)
</script>

<style scoped>
.swap-history__filters { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
.swap-history__date { width: 150px; }
.swap-history__status { width: 120px; }
.swap-history__table { width: 100%; margin-top: var(--space-3); }
</style>
