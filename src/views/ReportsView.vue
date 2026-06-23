<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import { getUserInfo } from '@/utils/auth'
import OverviewPanel from './reports/OverviewPanel.vue'
import FinanceSummaryPanel from './reports/FinanceSummaryPanel.vue'
import MonthlyPnLPanel from './reports/MonthlyPnLPanel.vue'
import MonthlyFixedCostPanel from './reports/MonthlyFixedCostPanel.vue'
import AttendancePanel from './reports/AttendancePanel.vue'
import SalaryPanel from './reports/SalaryPanel.vue'

const viewerName = computed(() => {
  const info = getUserInfo()
  return info?.display_name || info?.username || '管理員'
})

const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const activeTab = ref('overview')
const fixedCostDirty = ref(false)

async function confirmLoseFixedCost(): Promise<boolean> {
  if (!(activeTab.value === 'fixed-cost' && fixedCostDirty.value)) return true
  try {
    await ElMessageBox.confirm('固定費用尚有未儲存變更，確定離開並捨棄？', '未儲存變更', {
      type: 'warning',
      confirmButtonText: '捨棄變更',
      cancelButtonText: '留在此頁',
    })
    return true
  } catch {
    return false
  }
}

async function onYearChange(y: number): Promise<void> {
  if (await confirmLoseFixedCost()) {
    selectedYear.value = y
  }
  // 取消則不 commit；el-select 受控於 :model-value 會自動還原顯示
}

async function onTabBeforeLeave(_activeName: string | number, oldName: string | number): Promise<boolean> {
  if (oldName === 'fixed-cost' && fixedCostDirty.value) {
    return confirmLoseFixedCost()
  }
  return true
}

defineExpose({
  selectedYear,
  activeTab,
  fixedCostDirty,
  onYearChange,
  onTabBeforeLeave,
})
</script>

<template>
  <div class="reports-page">
    <div class="page-header">
      <div class="page-title">
        <h2>報表統計</h2>
        <span class="viewer-tag">{{ viewerName }} 的報表統計</span>
      </div>
      <el-select :model-value="selectedYear" style="width: 120px;" @change="onYearChange">
        <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
      </el-select>
    </div>

    <el-tabs v-model="activeTab" type="card" class="reports-tabs" :before-leave="onTabBeforeLeave">
      <el-tab-pane label="概況" name="overview">
        <OverviewPanel v-if="activeTab === 'overview'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="收支彙總" name="finance">
        <FinanceSummaryPanel v-if="activeTab === 'finance'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="月度損益表" name="monthly-pnl">
        <MonthlyPnLPanel v-if="activeTab === 'monthly-pnl'" :key="selectedYear" :year="selectedYear" />
      </el-tab-pane>
      <el-tab-pane label="固定支出登錄" name="fixed-cost">
        <MonthlyFixedCostPanel
          v-if="activeTab === 'fixed-cost'"
          :key="selectedYear"
          :year="selectedYear"
          @update:dirty="fixedCostDirty = $event"
        />
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
