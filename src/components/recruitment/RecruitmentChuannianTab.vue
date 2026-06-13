<script setup lang="ts">
import { LazyBar, castChartOpts } from '@/components/recruitment/lazyChartComponents'

defineProps<{
  showCharts: boolean
  stats: Record<string, unknown>  // 用到 chuannian_visit / chuannian_deposit / total_visit
  chuannianNoDeposit: number
  chuannianExpectedBarData: Record<string, unknown> | null
  chuannianGradeBarData: Record<string, unknown> | null
  barOptions: Record<string, unknown>
  horizBarOptions: Record<string, unknown>
  chuannianByExpected: Record<string, unknown>[]
  chuannianByGrade: Record<string, unknown>[]
  fmtPct: (deposit: number, visit: number) => string
}>()
</script>

<template>
  <div class="kpi-row">
    <el-card class="kpi-card kpi-green" shadow="hover">
      <div class="kpi-value">{{ stats.chuannian_visit ?? 0 }}</div>
      <div class="kpi-label">童年綠地參觀總數</div>
      <div class="kpi-sub">含雅婷班導認列</div>
    </el-card>
    <el-card class="kpi-card kpi-green" shadow="hover">
      <div class="kpi-value">{{ stats.chuannian_deposit ?? 0 }}</div>
      <div class="kpi-label">其中已預繳</div>
    </el-card>
    <el-card class="kpi-card" shadow="hover">
      <div class="kpi-value">{{ chuannianNoDeposit }}</div>
      <div class="kpi-label">其中未預繳</div>
    </el-card>
    <el-card class="kpi-card kpi-blue" shadow="hover">
      <div class="kpi-value">{{ fmtPct(Number(stats.chuannian_deposit), Number(stats.chuannian_visit)) }}</div>
      <div class="kpi-label">童年綠地預繳率</div>
    </el-card>
    <el-card class="kpi-card" shadow="hover">
      <div class="kpi-value">{{ fmtPct(Number(stats.chuannian_visit), Number(stats.total_visit)) }}</div>
      <div class="kpi-label">佔總參觀比例</div>
    </el-card>
  </div>

  <div class="chart-row">
    <el-card class="chart-card">
      <template #header>預計就讀月份分佈（參觀 vs 預繳）</template>
      <div class="chart-box chart-box-tall">
        <LazyBar v-if="showCharts && chuannianExpectedBarData" :data="chuannianExpectedBarData" :options="castChartOpts(barOptions)" />
      </div>
    </el-card>
    <el-card class="chart-card">
      <template #header>童年綠地各班別分佈</template>
      <div class="chart-box chart-box-tall">
        <LazyBar v-if="showCharts && chuannianGradeBarData" :data="chuannianGradeBarData" :options="castChartOpts(horizBarOptions)" />
      </div>
    </el-card>
  </div>

  <div class="chart-row" style="margin-bottom:0">
    <el-card>
      <template #header>預計就讀月份明細</template>
      <el-table
        v-if="chuannianByExpected.length"
        :data="chuannianByExpected"
        border stripe size="small"
      >
        <el-table-column prop="expected_month" label="預計就讀月份" min-width="140" />
        <el-table-column prop="visit" label="人數" align="center" width="80" />
        <el-table-column prop="deposit" label="預繳" align="center" width="80" />
        <el-table-column label="未預繳" align="center" width="80">
          <template #default="{ row }">{{ row.visit - row.deposit }}</template>
        </el-table-column>
        <el-table-column label="預繳率" align="center" width="100">
          <template #default="{ row }">{{ fmtPct(row.deposit, row.visit) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-else description="暫無童年綠地資料" />
    </el-card>
    <el-card>
      <template #header>童年綠地各班別統計</template>
      <el-table
        v-if="chuannianByGrade.length"
        :data="chuannianByGrade"
        border stripe size="small"
      >
        <el-table-column prop="grade" label="班別" width="100" />
        <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
        <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
        <el-table-column label="預繳率" align="center" width="100">
          <template #default="{ row }">{{ fmtPct(row.deposit, row.visit) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
/* ── Design Tokens（KPI 選色依賴）── */
:root {
  --rv-primary: #1e40af;
}

.chart-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
.chart-card { overflow: hidden; }
.chart-box {
  height: 280px;
  position: relative;
}
.chart-box-tall { height: 360px; }

.kpi-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.kpi-card {
  flex: 1;
  min-width: 130px;
  border-left: 4px solid var(--rv-primary, #1e40af);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}
.kpi-card:hover {
  box-shadow: 0 4px 16px rgba(30, 64, 175, 0.10);
  transform: translateY(-1px);
}
.kpi-card.kpi-blue   { border-left-color: var(--color-info); }
.kpi-card.kpi-green  { border-left-color: var(--color-success-hover); }
.kpi-value {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--rv-primary, #1e3a8a);
  font-variant-numeric: tabular-nums;
}
.kpi-card.kpi-blue   .kpi-value { color: var(--color-info-darker); }
.kpi-card.kpi-green  .kpi-value { color: var(--color-success-darker); }
.kpi-label {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.kpi-sub { font-size: 0.78rem; color: var(--text-tertiary); }
</style>
