<script setup lang="ts">
import type { ChartData } from 'chart.js'
import { LazyBar, castChartOpts } from '@/components/recruitment/lazyChartComponents'

interface ReferrerSourceCross {
  referrers?: Record<string, unknown>[]
  sources?: string[]
}

defineProps<{
  showCharts: boolean
  staffBarData: ChartData<'bar'> | null
  staffRateData: ChartData<'bar'> | null
  barOptions: Record<string, unknown>
  percentBarOptions: Record<string, unknown>
  statsByReferrer: Record<string, unknown>[]
  referrerSourceCross: ReferrerSourceCross
  gradesOrder: string[]
  fmtPct: (deposit: number, visit: number) => string
}>()
</script>

<template>
  <div class="chart-row">
    <el-card class="chart-card">
      <template #header>接待人員參觀量</template>
      <div class="chart-box">
        <LazyBar v-if="showCharts && staffBarData" :data="staffBarData" :options="castChartOpts(barOptions)" />
        <div v-else-if="showCharts" class="chart-empty">此區間尚無接待資料</div>
      </div>
    </el-card>
    <el-card class="chart-card">
      <template #header>接待人員預繳率</template>
      <div class="chart-box">
        <LazyBar v-if="showCharts && staffRateData" :data="staffRateData" :options="castChartOpts(percentBarOptions)" />
        <div v-else-if="showCharts" class="chart-empty">此區間尚無接待資料</div>
      </div>
    </el-card>
  </div>
  <el-card style="margin-bottom:16px">
    <template #header>接待人員統計</template>
    <el-table :data="statsByReferrer" border stripe size="small">
      <el-table-column label="接待人員" min-width="120">
        <template #default="{ row }">
          <span :class="{ 'cell-unfilled': !row.referrer }">{{ row.referrer || '未填寫' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="visit" label="參觀人數" align="center" min-width="100" />
      <el-table-column prop="deposit" label="預繳人數" align="center" min-width="100" />
      <el-table-column label="預繳率" align="center" min-width="100">
        <template #default="{ row }">{{ fmtPct(Number(row.deposit), Number(row.visit)) }}</template>
      </el-table-column>
    </el-table>
  </el-card>
  <el-card style="margin-bottom:16px">
    <template #header>接待人員 × 各年級預繳率</template>
    <el-table :data="statsByReferrer" border stripe size="small">
      <el-table-column label="接待人員" min-width="120" fixed="left">
        <template #default="{ row }">
          <span :class="{ 'cell-unfilled': !row.referrer }">{{ row.referrer || '未填寫' }}</span>
        </template>
      </el-table-column>
      <el-table-column
        v-for="g in gradesOrder"
        :key="g"
        :label="g"
        align="center"
        min-width="120"
      >
        <template #default="{ row }">
          <template v-if="row.by_grade && (row.by_grade as Record<string, Record<string, number>>)[g]">
            {{ (row.by_grade as Record<string, Record<string, number>>)[g].visit }}人 / {{ fmtPct((row.by_grade as Record<string, Record<string, number>>)[g].deposit, (row.by_grade as Record<string, Record<string, number>>)[g].visit) }}
          </template>
          <span v-else class="cell-unfilled">—</span>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
  <el-card v-if="referrerSourceCross.referrers && referrerSourceCross.referrers.length">
    <template #header>介紹者 × 來源 交叉分析</template>
    <el-table :data="referrerSourceCross.referrers" border stripe size="small" style="overflow-x:auto">
      <el-table-column label="介紹者" min-width="110" fixed="left">
        <template #default="{ row }">
          <span :class="{ 'cell-unfilled': !row.referrer }">{{ row.referrer || '未填寫' }}</span>
        </template>
      </el-table-column>
      <el-table-column
        v-for="src in referrerSourceCross.sources"
        :key="src"
        :label="src || '未填寫'"
        align="center"
        min-width="90"
      >
        <template #default="{ row }">
          {{ (row.sources as Record<string, number> | undefined)?.[src] ?? 0 }}
        </template>
      </el-table-column>
      <el-table-column label="合計" align="center" min-width="70">
        <template #default="{ row }">{{ row.total }}</template>
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
