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
            <span class="mom-item-value" :class="deltaClass(typedMoM.visit_to_deposit_rate?.delta)">
              {{ deltaArrow(typedMoM.visit_to_deposit_rate?.delta) }}
              {{ formatDelta(typedMoM.visit_to_deposit_rate?.delta) }}
            </span>
          </div>
          <div class="mom-item">
            <span class="mom-item-label">參觀→註冊率</span>
            <span class="mom-item-value" :class="deltaClass(typedMoM.visit_to_enrolled_rate?.delta)">
              {{ deltaArrow(typedMoM.visit_to_enrolled_rate?.delta) }}
              {{ formatDelta(typedMoM.visit_to_enrolled_rate?.delta) }}
            </span>
          </div>
          <div class="mom-item">
            <span class="mom-item-label">有效預繳</span>
            <span class="mom-item-value mom-item-value--neutral">{{ funnelSnapshot.effective_deposit ?? 0 }}</span>
          </div>
          <div class="mom-item">
            <span class="mom-item-label">對比月份</span>
            <span class="mom-item-period">{{ typedMoM.current_month || '—' }} / {{ typedMoM.previous_month || '—' }}</span>
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
      <el-table :data="typedStats.by_year || []" border stripe size="small">
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

<script setup lang="ts">
import { computed } from 'vue'
import RecruitmentDecisionSummary from './RecruitmentDecisionSummary.vue'
import RecruitmentAlertPanel from './RecruitmentAlertPanel.vue'
import RecruitmentActionQueue from './RecruitmentActionQueue.vue'

const props = withDefaults(defineProps<{
  stats: Record<string, unknown>
  referenceMonth?: string | null
  decisionSummary: Record<string, unknown>
  funnelSnapshot: Record<string, unknown>
  monthOverMonth: Record<string, unknown>
  alerts?: Record<string, unknown>[]
  topActionQueue?: Record<string, unknown>[]
  showCharts: boolean
  monthlyTableData: Record<string, unknown>[]
  monthlyBarData?: Record<string, unknown> | null
  monthlyRateData?: Record<string, unknown> | null
  barOptions: Record<string, unknown>
  monthlyBarOptions: Record<string, unknown>
  lineOptions: Record<string, unknown>
  barComponent: Record<string, unknown> | ((...args: unknown[]) => unknown)
  lineComponent: Record<string, unknown> | ((...args: unknown[]) => unknown)
  fmtRate: (...args: unknown[]) => unknown
}>(), {
  referenceMonth: null,
  alerts: () => [],
  topActionQueue: () => [],
  monthlyBarData: null,
  monthlyRateData: null,
})

defineEmits<{ 'navigate': [tab: unknown] }>()

interface RateWithDelta { delta?: number }
interface MonthOverMonthTyped {
  visit_to_deposit_rate?: RateWithDelta
  visit_to_enrolled_rate?: RateWithDelta
  current_month?: string
  previous_month?: string
}

const typedMoM = computed((): MonthOverMonthTyped => (props.monthOverMonth as MonthOverMonthTyped) ?? {})
const typedStats = computed((): { by_year?: unknown[] } => (props.stats as { by_year?: unknown[] }) ?? {})

const formatDelta = (value: unknown) => {
  const num = Number(value || 0)
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(1)}pt`
}

const deltaClass = (value: unknown) => {
  const n = Number(value || 0)
  return n > 0 ? 'mom-item-value--up' : n < 0 ? 'mom-item-value--down' : 'mom-item-value--neutral'
}

const deltaArrow = (value: unknown) => {
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
  background: var(--neutral-0);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
}

.funnel-panel-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-secondary);
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
  color: var(--neutral-300);
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

.funnel-step--visit   { background: var(--color-info-soft); border-left-color: var(--color-info); }
.funnel-step--deposit { background: #f0fdf4; border-left-color: var(--color-success-hover); }
.funnel-step--enroll  { background: #eef2ff; border-left-color: #6366f1; }
.funnel-step--pending { background: var(--color-warning-soft); border-left-color: var(--color-warning-hover); }

.funnel-step-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  flex-shrink: 0;
}
.funnel-step--visit   .funnel-step-icon { background: var(--color-info-soft); color: var(--color-info-darker); }
.funnel-step--deposit .funnel-step-icon { background: var(--color-success-soft); color: var(--color-success-darker); }
.funnel-step--enroll  .funnel-step-icon { background: var(--brand-primary-soft); color: var(--brand-primary); }
.funnel-step--pending .funnel-step-icon { background: var(--color-warning-soft); color: var(--color-warning-darker); }

.funnel-step-body {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex: 1;
  gap: 8px;
}

.funnel-step-label {
  font-size: 0.82rem;
  color: var(--neutral-600);
  font-weight: 500;
}

.funnel-step-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.funnel-step-value--warn { color: var(--color-warning-darker); }

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
  background: var(--bg-color);
  border-radius: 8px;
}

.mom-item-label {
  font-size: 0.72rem;
  color: var(--text-tertiary);
}

.mom-item-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 1.05rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.mom-item-value--up      { color: var(--color-success-darker); }
.mom-item-value--down    { color: var(--color-danger-hover); }
.mom-item-value--neutral { color: var(--text-primary); }

.mom-item-period {
  font-size: 0.82rem;
  color: var(--neutral-600);
  font-weight: 600;
}
</style>
