<script setup>
import { computed } from 'vue'
import { Money, Coin, Wallet, TrendCharts, Calendar, Check, DataAnalysis } from '@element-plus/icons-vue'
import { money } from '@/utils/format'

const props = defineProps({
  finance: {
    type: Object,
    default: () => null,
  },
  dashboard: {
    type: Object,
    default: () => ({}),
  },
})

const summary = computed(() => props.finance?.summary || {
  total_revenue: 0,
  total_refund: 0,
  net_revenue: 0,
  total_expense: 0,
  net_cashflow: 0,
})

// MoM：從 monthly_trend 找當月（系統月份）與上月，算變化百分比
const currentMonth = new Date().getMonth() + 1
const mom = computed(() => {
  const trend = props.finance?.monthly_trend || []
  if (!trend.length) return null
  const curr = trend.find(r => r.month === currentMonth) || null
  const prev = trend.find(r => r.month === currentMonth - 1) || null
  if (!curr || !prev) return null
  const pct = (a, b) => {
    if (!b) return null
    return ((a - b) / b) * 100
  }
  return {
    revenue: pct(curr.revenue, prev.revenue),
    expense: pct(curr.expense, prev.expense),
    net: pct(curr.net, prev.net),
  }
})

const netClass = computed(() => {
  const v = summary.value.net_cashflow || 0
  if (v > 0) return 'value-green'
  if (v < 0) return 'value-red'
  return ''
})

const avgAttendanceRate = computed(() => {
  const data = props.dashboard?.attendance_monthly || []
  if (!data.length) return null
  return (data.reduce((s, d) => s + (d.rate || 0), 0) / data.length).toFixed(1)
})

const formatPct = (v) => {
  if (v == null || !Number.isFinite(v)) return null
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)}%`
}
</script>

<template>
  <div class="overview">
    <el-row :gutter="16" class="kpi-row">
      <el-col :xs="12" :sm="6">
        <el-card class="kpi-card kpi-card--blue" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><Coin /></el-icon></div>
          <div class="kpi-label">本年總收入</div>
          <div class="kpi-value value-blue">{{ money(summary.total_revenue) }}</div>
          <div v-if="mom?.revenue != null" class="kpi-trend" :class="mom.revenue >= 0 ? 'up' : 'down'">
            {{ mom.revenue >= 0 ? '↑' : '↓' }} {{ formatPct(mom.revenue) }}
            <span class="kpi-trend-label">vs 上月</span>
          </div>
          <div v-else class="kpi-sub">（未扣退款）</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="kpi-card kpi-card--orange" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><Wallet /></el-icon></div>
          <div class="kpi-label">本年退款</div>
          <div class="kpi-value value-orange">{{ money(summary.total_refund) }}</div>
          <div class="kpi-sub">學費+才藝</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="kpi-card kpi-card--red" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><Money /></el-icon></div>
          <div class="kpi-label">本年總支出</div>
          <div class="kpi-value value-red">{{ money(summary.total_expense) }}</div>
          <div v-if="mom?.expense != null" class="kpi-trend" :class="mom.expense >= 0 ? 'up-warn' : 'down-good'">
            {{ mom.expense >= 0 ? '↑' : '↓' }} {{ formatPct(mom.expense) }}
            <span class="kpi-trend-label">vs 上月</span>
          </div>
          <div v-else class="kpi-sub">薪資+雇主保費</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card class="kpi-card kpi-card--green" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><TrendCharts /></el-icon></div>
          <div class="kpi-label">本年淨現金</div>
          <div class="kpi-value" :class="netClass">{{ money(summary.net_cashflow) }}</div>
          <div v-if="mom?.net != null" class="kpi-trend" :class="mom.net >= 0 ? 'up' : 'down'">
            {{ mom.net >= 0 ? '↑' : '↓' }} {{ formatPct(mom.net) }}
            <span class="kpi-trend-label">vs 上月</span>
          </div>
          <div v-else class="kpi-sub">（收入-退款-支出）</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :sm="8">
        <el-card class="kpi-card" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><Check /></el-icon></div>
          <div class="kpi-label">年度出勤率</div>
          <div class="kpi-value">{{ avgAttendanceRate != null ? `${avgAttendanceRate}%` : '-' }}</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card class="kpi-card" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><DataAnalysis /></el-icon></div>
          <div class="kpi-label">淨營收</div>
          <div class="kpi-value">{{ money(summary.net_revenue) }}</div>
          <div class="kpi-sub">總收入 - 退款</div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="8">
        <el-card class="kpi-card" shadow="hover">
          <div class="kpi-icon"><el-icon :size="22"><Calendar /></el-icon></div>
          <div class="kpi-label">收支比</div>
          <div class="kpi-value">
            {{ summary.total_expense ? (summary.net_revenue / summary.total_expense).toFixed(2) : '-' }}
          </div>
          <div class="kpi-sub">淨營收 / 總支出</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.kpi-row { margin-bottom: var(--space-4); }
.kpi-card {
  text-align: center;
  padding: 16px 8px 12px;
  margin-bottom: var(--space-4);
  position: relative;
  border-top: 3px solid transparent;
}
.kpi-card--blue   { border-top-color: #409EFF; }
.kpi-card--orange { border-top-color: var(--color-warning); }
.kpi-card--red    { border-top-color: var(--color-danger); }
.kpi-card--green  { border-top-color: var(--color-success); }

.kpi-icon {
  opacity: 0.45;
  margin-bottom: 4px;
}
.kpi-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.kpi-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}
.kpi-sub {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}
.kpi-trend {
  font-size: 12px;
  font-weight: 600;
  margin-top: 4px;
}
.kpi-trend.up,
.kpi-trend.down-good { color: var(--color-success); }
.kpi-trend.down,
.kpi-trend.up-warn   { color: var(--color-danger); }
.kpi-trend-label {
  font-weight: normal;
  color: var(--text-secondary);
  margin-left: 4px;
}

.value-blue { color: #409EFF; }
.value-orange { color: var(--color-warning); }
.value-red { color: var(--color-danger); }
.value-green { color: var(--color-success); }
</style>
