<script setup lang="ts">
import type { ChartData } from 'chart.js'
import { LazyBar, castChartOpts } from '@/components/recruitment/lazyChartComponents'

defineProps<{
  showCharts: boolean
  classBarData: ChartData<'bar'> | null
  classRateData: ChartData<'bar'> | null
  classBarOptions: Record<string, unknown>
  percentHorizBarOptions: Record<string, unknown>
  statsByGrade: Record<string, unknown>[]
  monthGradeTableData: Record<string, unknown>[]
  gradesOrder: string[]
  fmtPct: (deposit: number, visit: number) => string
}>()
</script>

<template>
  <div class="chart-row">
    <el-card class="chart-card">
      <template #header>各班別參觀人數</template>
      <div class="chart-box">
        <LazyBar v-if="showCharts && classBarData" :data="classBarData" :options="castChartOpts(classBarOptions)" />
      </div>
    </el-card>
    <el-card class="chart-card">
      <template #header>各班別預繳率</template>
      <div class="chart-box">
        <LazyBar v-if="showCharts && classRateData" :data="classRateData" :options="castChartOpts(percentHorizBarOptions)" />
      </div>
    </el-card>
  </div>
  <el-card style="margin-bottom:16px">
    <template #header>班別統計</template>
    <el-table :data="statsByGrade" border stripe size="small">
      <el-table-column prop="grade" label="班別" width="100" />
      <el-table-column prop="visit" label="參觀人數" align="center" width="100" />
      <el-table-column prop="deposit" label="預繳人數" align="center" width="100" />
      <el-table-column label="預繳率" align="center" width="100">
        <template #default="{ row }">{{ fmtPct(Number(row.deposit), Number(row.visit)) }}</template>
      </el-table-column>
    </el-table>
  </el-card>
  <el-card>
    <template #header>月份 × 班別分布</template>
    <el-table :data="monthGradeTableData" border stripe size="small">
      <el-table-column prop="month" label="月份" width="90" fixed="left" />
      <el-table-column
        v-for="g in gradesOrder"
        :key="g"
        :label="g"
        :prop="g"
        align="center"
        width="80"
      />
      <el-table-column prop="合計" label="合計" align="center" width="80" />
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
</style>
