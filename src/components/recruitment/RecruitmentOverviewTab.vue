<template>
  <div>
    <RecruitmentDecisionSummary
      :summary="decisionSummary"
      :reference-month="referenceMonth"
      :month-over-month="monthOverMonth"
      :fmt-rate="fmtRate"
    />

    <RecruitmentAlertPanel
      :alerts="alerts"
      @select="$emit('navigate', $event)"
    />

    <div class="chart-row">
      <el-card class="chart-card">
        <template #header>本月漏斗快照</template>
        <div class="funnel-grid">
          <div class="funnel-item">
            <div class="funnel-label">參觀</div>
            <div class="funnel-value">{{ funnelSnapshot.visit ?? 0 }}</div>
          </div>
          <div class="funnel-item">
            <div class="funnel-label">預繳</div>
            <div class="funnel-value">{{ funnelSnapshot.deposit ?? 0 }}</div>
          </div>
          <div class="funnel-item">
            <div class="funnel-label">註冊</div>
            <div class="funnel-value">{{ funnelSnapshot.enrolled ?? 0 }}</div>
          </div>
          <div class="funnel-item">
            <div class="funnel-label">待轉換</div>
            <div class="funnel-value">{{ funnelSnapshot.pending_deposit ?? 0 }}</div>
          </div>
        </div>
      </el-card>
      <el-card class="chart-card">
        <template #header>月比變化</template>
        <div class="funnel-grid">
          <div class="funnel-item">
            <div class="funnel-label">參觀→預繳率</div>
            <div class="funnel-value">{{ formatDelta(monthOverMonth?.visit_to_deposit_rate?.delta) }}</div>
          </div>
          <div class="funnel-item">
            <div class="funnel-label">參觀→註冊率</div>
            <div class="funnel-value">{{ formatDelta(monthOverMonth?.visit_to_enrolled_rate?.delta) }}</div>
          </div>
          <div class="funnel-item">
            <div class="funnel-label">本月 / 上月</div>
            <div class="funnel-meta">{{ monthOverMonth?.current_month || '—' }} / {{ monthOverMonth?.previous_month || '—' }}</div>
          </div>
          <div class="funnel-item">
            <div class="funnel-label">有效預繳</div>
            <div class="funnel-value">{{ funnelSnapshot.effective_deposit ?? 0 }}</div>
          </div>
        </div>
      </el-card>
    </div>

    <RecruitmentActionQueue
      :items="topActionQueue"
      @select="$emit('navigate', $event)"
    />

    <div class="chart-row">
      <el-card class="chart-card">
        <template #header>月度招生漏斗量體</template>
        <div class="chart-box">
          <component :is="barComponent" v-if="showCharts && monthlyBarData" :data="monthlyBarData" :options="monthlyBarOptions" />
        </div>
      </el-card>
      <el-card class="chart-card">
        <template #header>月度轉換率走勢</template>
        <div class="chart-box">
          <component :is="lineComponent" v-if="showCharts && monthlyRateData" :data="monthlyRateData" :options="lineOptions" />
        </div>
      </el-card>
    </div>

    <el-card>
      <template #header>月度明細表</template>
      <el-table :data="monthlyTableData" border stripe size="small">
        <el-table-column prop="month" label="月份" width="90" />
        <el-table-column prop="visit" label="參觀人數" align="center" width="90" />
        <el-table-column prop="deposit" label="預繳人數" align="center" width="90" />
        <el-table-column prop="enrolled" label="註冊人數" align="center" width="90" />
        <el-table-column prop="transfer_term" label="轉其他學期" align="center" width="100" />
        <el-table-column prop="effective_deposit" label="有效預繳" align="center" width="90" />
        <el-table-column prop="pending_deposit" label="預繳未註冊" align="center" width="100" />
        <el-table-column label="參觀→預繳率" align="center" width="100">
          <template #default="{ row }">{{ fmtRate(row.visit_to_deposit_rate) }}</template>
        </el-table-column>
        <el-table-column label="參觀→註冊率" align="center" width="100">
          <template #default="{ row }">{{ fmtRate(row.visit_to_enrolled_rate) }}</template>
        </el-table-column>
        <el-table-column label="排除轉期→註冊率" align="center" width="120">
          <template #default="{ row }">{{ fmtRate(row.effective_to_enrolled_rate) }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card style="margin-top:16px">
      <template #header>年度統計</template>
      <el-table :data="stats.by_year" border stripe size="small">
        <el-table-column label="年份" width="90">
          <template #default="{ row }">{{ row.year }}年</template>
        </el-table-column>
        <el-table-column prop="visit" label="參觀人數" align="center" width="90" />
        <el-table-column prop="deposit" label="預繳人數" align="center" width="90" />
        <el-table-column prop="enrolled" label="註冊人數" align="center" width="90" />
        <el-table-column prop="transfer_term" label="轉其他學期" align="center" width="100" />
        <el-table-column prop="pending_deposit" label="預繳未註冊" align="center" width="100" />
        <el-table-column label="參觀→預繳率" align="center" width="100">
          <template #default="{ row }">{{ fmtRate(row.visit_to_deposit_rate) }}</template>
        </el-table-column>
        <el-table-column label="參觀→註冊率" align="center" width="100">
          <template #default="{ row }">{{ fmtRate(row.visit_to_enrolled_rate) }}</template>
        </el-table-column>
        <el-table-column label="排除轉期→註冊率" align="center" width="120">
          <template #default="{ row }">{{ fmtRate(row.effective_to_enrolled_rate) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import RecruitmentDecisionSummary from './RecruitmentDecisionSummary.vue'
import RecruitmentAlertPanel from './RecruitmentAlertPanel.vue'
import RecruitmentActionQueue from './RecruitmentActionQueue.vue'

defineProps({
  stats: { type: Object, required: true },
  referenceMonth: { type: String, default: null },
  decisionSummary: { type: Object, required: true },
  funnelSnapshot: { type: Object, required: true },
  monthOverMonth: { type: Object, required: true },
  alerts: { type: Array, default: () => [] },
  topActionQueue: { type: Array, default: () => [] },
  showCharts: { type: Boolean, required: true },
  monthlyTableData: { type: Array, required: true },
  monthlyBarData: { type: Object, default: null },
  monthlyRateData: { type: Object, default: null },
  barOptions: { type: Object, required: true },
  monthlyBarOptions: { type: Object, required: true },
  lineOptions: { type: Object, required: true },
  barComponent: { type: [Object, Function], required: true },
  lineComponent: { type: [Object, Function], required: true },
  fmtRate: { type: Function, required: true },
})

defineEmits(['navigate'])

const formatDelta = (value) => {
  const num = Number(value || 0)
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(1)}pt`
}
</script>

<style scoped>
.funnel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.funnel-item {
  padding: 12px;
  border-radius: 12px;
  background: #f8fafc;
}

.funnel-label {
  font-size: 0.82rem;
  color: #64748b;
  margin-bottom: 6px;
}

.funnel-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
}

.funnel-meta {
  font-size: 0.9rem;
  color: #334155;
}
</style>
