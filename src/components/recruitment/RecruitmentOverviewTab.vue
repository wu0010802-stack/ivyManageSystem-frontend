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

    <!-- 漏斗快照 + 月比變化 -->
    <div class="funnel-section">
      <!-- 本月漏斗快照 -->
      <div class="funnel-panel">
        <div class="funnel-panel-title">本月漏斗快照</div>
        <div class="funnel-steps">
          <div class="funnel-step funnel-step--visit">
            <div class="funnel-step-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div class="funnel-step-body">
              <span class="funnel-step-label">參觀</span>
              <span class="funnel-step-value">{{ funnelSnapshot.visit ?? 0 }}</span>
            </div>
          </div>
          <div class="funnel-connector" aria-hidden="true">▾</div>
          <div class="funnel-step funnel-step--deposit">
            <div class="funnel-step-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            </div>
            <div class="funnel-step-body">
              <span class="funnel-step-label">預繳</span>
              <span class="funnel-step-value">{{ funnelSnapshot.deposit ?? 0 }}</span>
            </div>
          </div>
          <div class="funnel-connector" aria-hidden="true">▾</div>
          <div class="funnel-step funnel-step--enroll">
            <div class="funnel-step-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div class="funnel-step-body">
              <span class="funnel-step-label">註冊</span>
              <span class="funnel-step-value">{{ funnelSnapshot.enrolled ?? 0 }}</span>
            </div>
          </div>
          <div class="funnel-step funnel-step--pending">
            <div class="funnel-step-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="funnel-step-body">
              <span class="funnel-step-label">待轉換</span>
              <span class="funnel-step-value funnel-step-value--warn">{{ funnelSnapshot.pending_deposit ?? 0 }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 月比變化 -->
      <div class="funnel-panel">
        <div class="funnel-panel-title">月比變化</div>
        <div class="funnel-mom-grid">
          <div class="mom-item">
            <span class="mom-item-label">參觀→預繳率</span>
            <span class="mom-item-value" :class="deltaClass(monthOverMonth?.visit_to_deposit_rate?.delta)">
              {{ deltaArrow(monthOverMonth?.visit_to_deposit_rate?.delta) }}
              {{ formatDelta(monthOverMonth?.visit_to_deposit_rate?.delta) }}
            </span>
          </div>
          <div class="mom-item">
            <span class="mom-item-label">參觀→註冊率</span>
            <span class="mom-item-value" :class="deltaClass(monthOverMonth?.visit_to_enrolled_rate?.delta)">
              {{ deltaArrow(monthOverMonth?.visit_to_enrolled_rate?.delta) }}
              {{ formatDelta(monthOverMonth?.visit_to_enrolled_rate?.delta) }}
            </span>
          </div>
          <div class="mom-item">
            <span class="mom-item-label">有效預繳</span>
            <span class="mom-item-value mom-item-value--neutral">{{ funnelSnapshot.effective_deposit ?? 0 }}</span>
          </div>
          <div class="mom-item">
            <span class="mom-item-label">對比月份</span>
            <span class="mom-item-period">{{ monthOverMonth?.current_month || '—' }} / {{ monthOverMonth?.previous_month || '—' }}</span>
          </div>
        </div>
      </div>
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

const deltaClass = (value) => {
  const n = Number(value || 0)
  return n > 0 ? 'mom-item-value--up' : n < 0 ? 'mom-item-value--down' : 'mom-item-value--neutral'
}

const deltaArrow = (value) => {
  const n = Number(value || 0)
  return n > 0 ? '▲' : n < 0 ? '▼' : ''
}
</script>

<style scoped>
/* ── Funnel Section ── */
.funnel-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

@media (max-width: 768px) {
  .funnel-section { grid-template-columns: 1fr; }
}

.funnel-panel {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  padding: 16px;
}

.funnel-panel-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #64748B;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 14px;
}

/* ── Funnel Steps ── */
.funnel-steps {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.funnel-connector {
  text-align: center;
  color: #CBD5E1;
  font-size: 0.65rem;
  line-height: 1;
  padding: 1px 0;
}

.funnel-step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border-left: 3px solid transparent;
}

.funnel-step--visit   { background: #EFF6FF; border-left-color: #3B82F6; }
.funnel-step--deposit { background: #F0FDF4; border-left-color: #16A34A; }
.funnel-step--enroll  { background: #EEF2FF; border-left-color: #6366F1; }
.funnel-step--pending { background: #FFFBEB; border-left-color: #D97706; }

.funnel-step-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  flex-shrink: 0;
}
.funnel-step--visit   .funnel-step-icon { background: #DBEAFE; color: #1D4ED8; }
.funnel-step--deposit .funnel-step-icon { background: #DCFCE7; color: #15803D; }
.funnel-step--enroll  .funnel-step-icon { background: #E0E7FF; color: #4F46E5; }
.funnel-step--pending .funnel-step-icon { background: #FEF3C7; color: #B45309; }

.funnel-step-body {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex: 1;
  gap: 8px;
}

.funnel-step-label {
  font-size: 0.82rem;
  color: #475569;
  font-weight: 500;
}

.funnel-step-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 1.15rem;
  font-weight: 700;
  color: #1E293B;
  font-variant-numeric: tabular-nums;
}
.funnel-step-value--warn { color: #B45309; }

/* ── MoM Grid ── */
.funnel-mom-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mom-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: #F8FAFC;
  border-radius: 8px;
}

.mom-item-label {
  font-size: 0.72rem;
  color: #94A3B8;
}

.mom-item-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 1.05rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.mom-item-value--up      { color: #15803D; }
.mom-item-value--down    { color: #DC2626; }
.mom-item-value--neutral { color: #1E293B; }

.mom-item-period {
  font-size: 0.82rem;
  color: #475569;
  font-weight: 600;
}
</style>
