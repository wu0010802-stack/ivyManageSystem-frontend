<template>
  <div>
    <div class="summary-row">
      <el-card
        v-for="kpi in summaryKpis"
        :key="kpi.key"
        class="summary-card"
        shadow="never"
      >
        <div class="summary-label">{{ kpi.label }}</div>
        <div
          class="summary-value"
          :class="kpi.count > 0 ? `summary-value--${kpi.tone}` : 'summary-value--zero'"
        >{{ kpi.count }}</div>
      </el-card>
    </div>

    <div class="chart-row">
      <el-card class="chart-card">
        <template #header>未預繳原因分佈</template>
        <div class="chart-box chart-box-tall">
          <component :is="barComponent" v-if="showCharts && noDepositReasonBarData" :data="noDepositReasonBarData" :options="horizBarOptions" />
          <div v-else-if="showCharts" class="chart-empty">此區間尚無未預繳資料</div>
        </div>
      </el-card>
      <el-card class="chart-card">
        <template #header>各年級未預繳原因</template>
        <div class="chart-box chart-box-tall">
          <component :is="barComponent" v-if="showCharts && noDepositGradeBarData" :data="noDepositGradeBarData" :options="noDepositGradeOptions" />
          <div v-else-if="showCharts" class="chart-empty">此區間尚無各年級分布資料</div>
        </div>
      </el-card>
    </div>

    <el-card>
      <template #header>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <span>未預繳明細</span>
          <el-select
            :model-value="priority"
            placeholder="轉換潛力"
            size="small"
            style="width:140px"
            @update:model-value="$emit('update:priority', $event)"
            @change="$emit('filter-change')"
          >
            <el-option label="高潛力優先" value="high" />
            <el-option label="全部潛力" value="" />
            <el-option label="中潛力" value="medium" />
            <el-option label="低潛力" value="low" />
          </el-select>
          <el-select
            :model-value="reason"
            placeholder="篩選原因"
            clearable
            size="small"
            style="width:200px"
            @update:model-value="$emit('update:reason', $event)"
            @change="$emit('filter-change')"
          >
            <el-option v-for="item in reasonOptions" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select
            :model-value="grade"
            placeholder="班別"
            clearable
            size="small"
            style="width:100px"
            @update:model-value="$emit('update:grade', $event)"
            @change="$emit('filter-change')"
          >
            <el-option v-for="item in grades" :key="item" :label="item" :value="item" />
          </el-select>
          <el-switch
            :model-value="Boolean(overdueDays)"
            inline-prompt
            active-text="逾 14 天"
            inactive-text="不限"
            aria-label="只看逾 14 天待追"
            @change="onOverdueDaysChange"
          />
          <el-switch
            :model-value="Boolean(coldOnly)"
            inline-prompt
            active-text="冷名單"
            inactive-text="不限"
            aria-label="只看冷名單"
            @change="onColdOnlyChange"
          />
          <span class="record-count">顯示 {{ records.length }} / {{ total }} 筆未預繳</span>
        </div>
      </template>
      <el-table :data="records" border stripe size="small" v-loading="loading">
        <template #empty>
          <div class="nd-empty">
            <p class="nd-empty-text">
              {{ priority ? `目前「${priorityLabel}」篩選下沒有名單，上方圖表統計的是全部原因分布` : '目前篩選條件下沒有未預繳名單' }}
            </p>
            <el-button v-if="priority" size="small" @click="onShowAllPriority">改看全部潛力</el-button>
          </div>
        </template>
        <el-table-column prop="month" label="月份" width="80" />
        <el-table-column prop="child_name" label="姓名" width="90" />
        <el-table-column prop="grade" label="班別" width="80" />
        <el-table-column prop="no_deposit_reason" label="原因分類" min-width="140" />
        <el-table-column label="轉換潛力" width="90" align="center">
          <template #default="{ row }">
            <el-tag
              v-if="getConvertibility(row.no_deposit_reason).type"
              :type="(getConvertibility(row.no_deposit_reason).type as 'primary' | 'success' | 'warning' | 'info' | 'danger')"
              size="small"
            >{{ getConvertibility(row.no_deposit_reason).label }}</el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="冷名單" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="daysSince(row.created_at) >= 90" type="info" size="small">冷</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="no_deposit_reason_detail" label="說明" min-width="160" show-overflow-tooltip />
        <el-table-column prop="source" label="來源" width="100" />
        <el-table-column prop="referrer" label="介紹者" width="80" />
        <el-table-column prop="parent_response" label="電訪回應" min-width="120" show-overflow-tooltip />
      </el-table>
      <el-pagination
        v-if="total > pageSize"
        class="pagination"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="$emit('page-change', $event)"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface ConvertibilityEntry { label: string; type: string }
const CONVERTIBILITY: Record<string, ConvertibilityEntry> = {
  '時程未到／仍在觀望':        { label: '高', type: 'danger' },
  '課程／環境仍在評估':        { label: '高', type: 'danger' },
  '距離／地點因素':            { label: '中', type: 'warning' },
  '費用考量':                  { label: '中', type: 'warning' },
  '家庭照顧安排考量':          { label: '中', type: 'warning' },
  '已有其他就學選項／比較他校': { label: '低', type: 'info' },
  '特殊需求／名額限制':         { label: '低', type: 'info' },
  '未註明／待追蹤':             { label: '—', type: '' },
}
const getConvertibility = (reason: unknown): ConvertibilityEntry =>
  CONVERTIBILITY[String(reason)] ?? { label: '—', type: '' }
const daysSince = (isoStr: unknown): number => {
  if (!isoStr) return 0
  return Math.floor((Date.now() - new Date(String(isoStr)).getTime()) / 86400000)
}

const emit = defineEmits<{
  'update:priority': [value: string]
  'update:reason': [value: string | null]
  'update:grade': [value: string | null]
  'update:overdue-days': [value: number | null]
  'update:cold-only': [value: boolean]
  'filter-change': []
  'page-change': [page: number]
}>()

const onOverdueDaysChange = (val: string | number | boolean) => {
  emit('update:overdue-days', val ? 14 : null)
  emit('filter-change')
}

const onShowAllPriority = () => {
  emit('update:priority', '')
  emit('filter-change')
}

const onColdOnlyChange = (val: string | number | boolean) => {
  emit('update:cold-only', Boolean(val))
  emit('filter-change')
}

const props = withDefaults(defineProps<{
  showCharts: boolean
  noDepositReasonBarData?: Record<string, unknown> | null
  noDepositGradeBarData?: Record<string, unknown> | null
  horizBarOptions: Record<string, unknown>
  noDepositGradeOptions: Record<string, unknown>
  barComponent: Record<string, unknown> | ((...args: unknown[]) => unknown)
  reasonOptions: string[]
  grades: string[]
  summary?: Record<string, unknown>
  priority?: string
  reason?: string | null
  grade?: string | null
  overdueDays?: number | null
  coldOnly?: boolean
  page: number
  pageSize: number
  total: number
  records: Record<string, unknown>[]
  loading: boolean
}>(), {
  noDepositReasonBarData: null,
  noDepositGradeBarData: null,
  summary: () => ({}),
  priority: 'high',
  reason: null,
  grade: null,
  overdueDays: null,
  coldOnly: false,
})

const PRIORITY_LABELS: Record<string, string> = { high: '高潛力優先', medium: '中潛力', low: '低潛力' }
const priorityLabel = computed(() => PRIORITY_LABELS[props.priority ?? ''] ?? '潛力')

/** KPI 三卡：>0 才給語意色（高潛力=可把握、逾期=需行動、冷名單=中性），全 0 不該滿版紅色警報 */
const summaryKpis = computed(() => ([
  { key: 'high', label: '高潛力未預繳', tone: 'warning', count: Number(props.summary?.high_potential_count ?? 0) },
  { key: 'overdue', label: '逾 14 天待追', tone: 'danger', count: Number(props.summary?.overdue_followup_count ?? 0) },
  { key: 'cold', label: '冷名單', tone: 'neutral', count: Number(props.summary?.cold_count ?? 0) },
]))
</script>

<style scoped>
.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.summary-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 1.7rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.summary-value--warning { color: var(--color-warning-darker); }
.summary-value--danger  { color: var(--color-danger-darker); }
.summary-value--neutral { color: var(--text-primary); }
.summary-value--zero    { color: var(--text-tertiary); font-weight: 500; }

.summary-label {
  color: var(--text-tertiary);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

.nd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}
.nd-empty-text {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.6;
}
</style>
