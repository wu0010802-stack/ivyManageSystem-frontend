<script setup lang="ts">
import type { ChartData } from 'chart.js'
import { LazyBar, castChartOpts } from '@/components/recruitment/lazyChartComponents'

defineProps<{
  showCharts: boolean
  sourceBarData: ChartData<'bar'> | null
  sourceRateData: ChartData<'bar'> | null
  sourceClickBarOptions: Record<string, unknown>
  percentHorizBarOptions: Record<string, unknown>
  statsBySource: Record<string, unknown>[]
  fmtPct: (deposit: number, visit: number) => string
}>()
</script>

<template>
  <div class="chart-row">
    <el-card class="chart-card">
      <template #header>各來源參觀人數排名</template>
      <div class="chart-box chart-box-tall">
        <LazyBar v-if="showCharts && sourceBarData" :data="sourceBarData" :options="castChartOpts(sourceClickBarOptions)" />
        <div v-else-if="showCharts" class="chart-empty">此區間尚無來源資料</div>
      </div>
    </el-card>
    <el-card class="chart-card">
      <template #header>各來源預繳率</template>
      <div class="chart-box chart-box-tall">
        <LazyBar v-if="showCharts && sourceRateData" :data="sourceRateData" :options="castChartOpts(percentHorizBarOptions)" />
        <div v-else-if="showCharts" class="chart-empty">此區間尚無來源資料</div>
      </div>
    </el-card>
  </div>
  <el-card>
    <template #header>來源排名明細</template>
    <el-table :data="statsBySource" border stripe size="small">
      <el-table-column type="index" label="#" width="50" />
      <el-table-column label="來源" min-width="120">
        <template #default="{ row }">
          <span :class="{ 'cell-unfilled': !row.source }">{{ row.source || '未填寫' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="visit" label="參觀人數" align="center" min-width="100" />
      <el-table-column prop="deposit" label="預繳人數" align="center" min-width="100" />
      <el-table-column label="預繳率" align="center" min-width="100">
        <template #default="{ row }">{{ fmtPct(Number(row.deposit), Number(row.visit)) }}</template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<style scoped>
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
.chart-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  font-size: 0.85rem;
}
.cell-unfilled { color: var(--text-tertiary); }
</style>
