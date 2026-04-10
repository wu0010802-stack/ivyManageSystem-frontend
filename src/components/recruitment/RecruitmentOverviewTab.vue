<template>
  <div>
    <div class="kpi-row">
      <el-card class="kpi-card" shadow="hover">
        <div class="kpi-value">{{ stats.total_visit }}</div>
        <div class="kpi-label">總參觀紀錄</div>
      </el-card>
      <el-card class="kpi-card kpi-teal" shadow="hover">
        <div class="kpi-value">{{ stats.unique_visit ?? '—' }}</div>
        <div class="kpi-label">唯一幼生數</div>
      </el-card>
      <el-card class="kpi-card kpi-accent" shadow="hover">
        <div class="kpi-value">{{ stats.total_deposit }}</div>
        <div class="kpi-label">總預繳人數</div>
      </el-card>
      <el-card class="kpi-card kpi-blue" shadow="hover">
        <div class="kpi-value">{{ stats.total_enrolled ?? 0 }}</div>
        <div class="kpi-label">總註冊人數</div>
      </el-card>
      <el-card class="kpi-card kpi-blue" shadow="hover">
        <div class="kpi-value">{{ stats.total_transfer_term ?? 0 }}</div>
        <div class="kpi-label">轉其他學期</div>
      </el-card>
      <el-card class="kpi-card kpi-green" shadow="hover">
        <div class="kpi-value">{{ stats.total_pending_deposit ?? 0 }}</div>
        <div class="kpi-label">預繳未註冊</div>
      </el-card>
      <el-card class="kpi-card kpi-green" shadow="hover">
        <div class="kpi-value">{{ fmtRate(stats.visit_to_deposit_rate) }}</div>
        <div class="kpi-label">參觀→預繳率</div>
      </el-card>
      <el-card class="kpi-card" shadow="hover">
        <div class="kpi-value">{{ fmtRate(stats.visit_to_enrolled_rate) }}</div>
        <div class="kpi-label">參觀→註冊率</div>
      </el-card>
      <el-card class="kpi-card" shadow="hover">
        <div class="kpi-value">{{ fmtRate(stats.effective_to_enrolled_rate) }}</div>
        <div class="kpi-label">排除轉期→註冊率</div>
      </el-card>
    </div>

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
defineProps({
  stats: { type: Object, required: true },
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
</script>
