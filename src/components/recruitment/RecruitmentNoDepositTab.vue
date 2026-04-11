<template>
  <div>
    <div class="summary-row">
      <el-card class="summary-card" shadow="hover">
        <div class="summary-value">{{ summary.high_potential_count ?? 0 }}</div>
        <div class="summary-label">高潛力未預繳</div>
      </el-card>
      <el-card class="summary-card" shadow="hover">
        <div class="summary-value">{{ summary.overdue_followup_count ?? 0 }}</div>
        <div class="summary-label">逾 14 天待追</div>
      </el-card>
      <el-card class="summary-card" shadow="hover">
        <div class="summary-value">{{ summary.cold_count ?? 0 }}</div>
        <div class="summary-label">冷名單</div>
      </el-card>
    </div>

    <div class="chart-row">
      <el-card class="chart-card">
        <template #header>未預繳原因分佈</template>
        <div class="chart-box chart-box-tall">
          <component :is="barComponent" v-if="showCharts && noDepositReasonBarData" :data="noDepositReasonBarData" :options="horizBarOptions" />
        </div>
      </el-card>
      <el-card class="chart-card">
        <template #header>各年級未預繳原因</template>
        <div class="chart-box chart-box-tall">
          <component :is="barComponent" v-if="showCharts && noDepositGradeBarData" :data="noDepositGradeBarData" :options="noDepositGradeOptions" />
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
            <el-option label="全部潛力" :value="null" />
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
            inactive-text="全部"
            @change="$emit('update:overdue-days', $event ? 14 : null); $emit('filter-change')"
          />
          <el-switch
            :model-value="Boolean(coldOnly)"
            inline-prompt
            active-text="冷名單"
            inactive-text="全部"
            @change="$emit('update:cold-only', $event); $emit('filter-change')"
          />
          <span class="record-count">顯示 {{ records.length }} / {{ total }} 筆未預繳</span>
        </div>
      </template>
      <el-table :data="records" border stripe size="small" v-loading="loading">
        <el-table-column prop="month" label="月份" width="80" />
        <el-table-column prop="child_name" label="姓名" width="90" />
        <el-table-column prop="grade" label="班別" width="80" />
        <el-table-column prop="no_deposit_reason" label="原因分類" min-width="140" />
        <el-table-column label="轉換潛力" width="90" align="center">
          <template #default="{ row }">
            <el-tag
              v-if="getConvertibility(row.no_deposit_reason).type"
              :type="getConvertibility(row.no_deposit_reason).type"
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

<script setup>
const CONVERTIBILITY = {
  '時程未到／仍在觀望':        { label: '高', type: 'danger' },
  '課程／環境仍在評估':        { label: '高', type: 'danger' },
  '距離／地點因素':            { label: '中', type: 'warning' },
  '費用考量':                  { label: '中', type: 'warning' },
  '家庭照顧安排考量':          { label: '中', type: 'warning' },
  '已有其他就學選項／比較他校': { label: '低', type: 'info' },
  '特殊需求／名額限制':         { label: '低', type: 'info' },
  '未註明／待追蹤':             { label: '—', type: '' },
}
const getConvertibility = (reason) => CONVERTIBILITY[reason] ?? { label: '—', type: '' }
const daysSince = (isoStr) => {
  if (!isoStr) return null
  return Math.floor((Date.now() - new Date(isoStr)) / 86400000)
}

defineProps({
  showCharts: { type: Boolean, required: true },
  noDepositReasonBarData: { type: Object, default: null },
  noDepositGradeBarData: { type: Object, default: null },
  horizBarOptions: { type: Object, required: true },
  noDepositGradeOptions: { type: Object, required: true },
  barComponent: { type: [Object, Function], required: true },
  reasonOptions: { type: Array, required: true },
  grades: { type: Array, required: true },
  summary: { type: Object, default: () => ({}) },
  priority: { type: String, default: 'high' },
  reason: { type: String, default: null },
  grade: { type: String, default: null },
  overdueDays: { type: Number, default: null },
  coldOnly: { type: Boolean, default: false },
  page: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  total: { type: Number, required: true },
  records: { type: Array, required: true },
  loading: { type: Boolean, required: true },
})

defineEmits([
  'update:priority',
  'update:reason',
  'update:grade',
  'update:overdue-days',
  'update:cold-only',
  'filter-change',
  'page-change',
])
</script>

<style scoped>
.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.summary-card {
  border-left: 4px solid #dc2626;
}

.summary-value {
  font-size: 1.7rem;
  font-weight: 700;
  color: #991b1b;
}

.summary-label {
  color: #64748b;
  font-size: 0.85rem;
}
</style>
