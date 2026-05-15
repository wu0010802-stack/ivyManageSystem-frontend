<script setup>
import { ref, computed } from 'vue'
import { getUserInfo } from '@/utils/auth'
import OverviewPanel from './reports/OverviewPanel.vue'
import FinanceSummaryPanel from './reports/FinanceSummaryPanel.vue'
import AttendancePanel from './reports/AttendancePanel.vue'
import SalaryPanel from './reports/SalaryPanel.vue'

const viewerName = computed(() => {
  const info = getUserInfo()
  return info?.display_name || info?.username || '管理員'
})

const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const activeTab = ref('overview')
</script>

<template>
  <div class="reports-page">
    <div class="page-header">
      <div class="page-title">
        <h2>報表統計</h2>
        <span class="viewer-tag">{{ viewerName }} 的報表統計</span>
      </div>
      <el-select v-model="selectedYear" style="width: 120px;">
        <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
      </el-select>
    </div>

    <el-tabs v-model="activeTab" type="card" class="reports-tabs">
      <el-tab-pane label="概況" name="overview">
        <OverviewPanel v-if="activeTab === 'overview'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="收支彙總" name="finance">
        <FinanceSummaryPanel v-if="activeTab === 'finance'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="出勤" name="attendance">
        <AttendancePanel v-if="activeTab === 'attendance'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="薪資" name="salary">
        <SalaryPanel v-if="activeTab === 'salary'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.reports-page { padding: 0; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
  gap: 12px;
}
.page-title {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}
.viewer-tag { font-size: 13px; color: var(--el-text-color-secondary); }
.reports-tabs :deep(.el-tabs__item) { font-weight: 600; }
</style>
