<script setup lang="ts">
interface Overview {
  total_students: number
  by_age_group: Record<string, number>
  disadvantaged_pct: number
  disability_pct: number
  indigenous_pct: number
  foreign_pct: number
  total_expected_days: number
  total_actual_days: number
  total_attendance_rate_pct: number
}

defineProps<{
  overview: Overview
  snapshotDate: string | null
  generatedAt: string | null
  generatedBy: string | null
}>()
</script>

<template>
  <div class="summary-grid">
    <el-card shadow="never">
      <div class="kpi-label">總人數</div>
      <div class="kpi-value">{{ overview.total_students }}</div>
    </el-card>

    <el-card shadow="never">
      <div class="kpi-label">年齡層分布</div>
      <div class="age-list">
        <div v-for="ag in ['2-3', '3-4', '4-5', '5-6']" :key="ag">
          {{ ag }} 歲：<strong>{{ overview.by_age_group[ag] || 0 }}</strong>
        </div>
      </div>
    </el-card>

    <el-card shadow="never">
      <div class="kpi-label">特殊屬性占比</div>
      <div class="attr-list">
        <div>弱勢：<strong>{{ overview.disadvantaged_pct.toFixed(2) }}%</strong></div>
        <div>身障：<strong>{{ overview.disability_pct.toFixed(2) }}%</strong></div>
        <div>原住民：<strong>{{ overview.indigenous_pct.toFixed(2) }}%</strong></div>
        <div>外籍：<strong>{{ overview.foreign_pct.toFixed(2) }}%</strong></div>
      </div>
    </el-card>

    <el-card shadow="never">
      <div class="kpi-label">出席統計</div>
      <div class="att-list">
        <div>應到人日：<strong>{{ overview.total_expected_days.toLocaleString() }}</strong></div>
        <div>實到人日：<strong>{{ overview.total_actual_days.toLocaleString() }}</strong></div>
        <div>全園出席率：<strong>{{ overview.total_attendance_rate_pct.toFixed(2) }}%</strong></div>
      </div>
    </el-card>

    <el-card shadow="never" class="produce-info">
      <div class="kpi-label">產生資訊</div>
      <div>快照日：{{ snapshotDate || '-' }}</div>
      <div>產生時間：{{ generatedAt || '-' }}</div>
      <div>產生人：{{ generatedBy || '-' }}</div>
    </el-card>
  </div>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}
.kpi-label { font-size: 13px; color: #909399; margin-bottom: 8px; }
.kpi-value { font-size: 32px; font-weight: 600; color: #303133; }
.age-list, .attr-list, .att-list { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.produce-info { grid-column: 1 / -1; }
</style>
