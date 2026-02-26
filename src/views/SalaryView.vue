<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '@/api'
import { ElMessage } from 'element-plus'
import { useEmployeeStore } from '@/stores/employee'
import { Search, InfoFilled } from '@element-plus/icons-vue'
import BonusConfigPanel from './salary/BonusConfigPanel.vue'
import SalaryHistoryPanel from './salary/SalaryHistoryPanel.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { downloadFile } from '@/utils/download'

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

const query = reactive({
  year: currentYear,
  month: currentMonth
})

const loading = ref(false)
const hasCalculated = ref(false)
const salaryResults = ref([])
const bonusResults = ref([])
const showBonusDialog = ref(false)
const activeTab = ref('calculate')

const employeeStore = useEmployeeStore()

// ---- Salary Calculation ----
const calculateSalary = async () => {
  loading.value = true
  try {
    const response = await api.post(`/salaries/calculate?year=${query.year}&month=${query.month}`)
    salaryResults.value = response.data
    hasCalculated.value = true
    ElMessage.success('薪資計算完成')
    await fetchSalaryRecords()
  } catch (error) {
    ElMessage.error('計算失敗: ' + (error.response?.data?.detail || error.message))
  } finally {
    loading.value = false
  }
}

const fetchFestivalBonus = async () => {
  loading.value = true
  try {
    const response = await api.get(`/salaries/festival-bonus?year=${query.year}&month=${query.month}`)
    bonusResults.value = response.data
    showBonusDialog.value = true
  } catch (error) {
    ElMessage.error('取得獎金資料失敗: ' + (error.response?.data?.detail || error.message))
  } finally {
    loading.value = false
  }
}

const bonusTotal = computed(() => {
  return bonusResults.value.reduce((sum, r) => sum + (r.festivalBonus || 0), 0)
})

// ---- Salary Records (for export) ----
const salaryRecords = ref([])

const fetchSalaryRecords = async () => {
  try {
    const response = await api.get(`/salaries/records?year=${query.year}&month=${query.month}`)
    salaryRecords.value = response.data
  } catch (error) {
    // silent - records may not exist yet
  }
}

const getRecordId = (employeeName) => {
  const rec = salaryRecords.value.find(r => r.employee_name === employeeName)
  return rec ? rec.id : null
}

const exportPdf = (row) => {
  const recordId = getRecordId(row.employee_name)
  if (!recordId) {
    ElMessage.warning('請先計算薪資後再匯出')
    return
  }
  downloadFile(`/salaries/${recordId}/export?format=pdf`, `薪資單_${row.employee_name}.pdf`)
}

const exportAllExcel = () => {
  downloadFile(`/salaries/export-all?year=${query.year}&month=${query.month}&format=xlsx`, `${query.year}年${query.month}月薪資總表.xlsx`)
}

const money = (val) => {
  if (!val && val !== 0) return '-'
  return '$' + Number(val).toLocaleString()
}

const pct = (val) => {
  if (!val && val !== 0) return '0.0%'
  return (val * 100).toFixed(1) + '%'
}

onMounted(() => {
  fetchSalaryRecords()
  employeeStore.fetchEmployees()
})
</script>

<template>
  <div class="salary-page">
    <h2>薪資計算</h2>

    <el-tabs v-model="activeTab" type="card">
      <!-- 計算薪資 -->
      <el-tab-pane label="計算薪資" name="calculate">
        <el-card class="control-panel">
          <div class="controls">
            <el-select v-model="query.year" style="width: 110px;">
              <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
            </el-select>
            <el-select v-model="query.month" style="width: 90px;">
              <el-option v-for="m in 12" :key="m" :label="m + ' 月'" :value="m" />
            </el-select>

            <el-button type="success" :loading="loading" @click="calculateSalary">計算薪資</el-button>
            <el-button type="primary" :loading="loading" @click="fetchFestivalBonus">節慶獎金明細</el-button>
            <el-button v-if="salaryRecords.length > 0" type="warning" @click="exportAllExcel">匯出全部 Excel</el-button>
          </div>
        </el-card>

        <div v-if="salaryResults.length > 0" class="results-section">
          <h3>計算結果</h3>
          <el-table :data="salaryResults" border style="width: 100%" v-loading="loading" stripe max-height="600">
            <el-table-column prop="employee_name" label="姓名" width="100" fixed />
            <el-table-column label="底薪" width="100">
              <template #default="scope">{{ money(scope.row.base_salary) }}</template>
            </el-table-column>
            <el-table-column label="津貼" width="100">
              <template #default="scope">{{ money(scope.row.total_allowances) }}</template>
            </el-table-column>
            <el-table-column label="節慶獎金" width="120">
              <template #header>
                <el-tooltip content="2月發(12-1月)、6月發(2-5月)、9月發(6-8月)、12月發(9-11月)" placement="top">
                  <span>節慶獎金 <el-icon :size="12"><InfoFilled /></el-icon></span>
                </el-tooltip>
              </template>
              <template #default="scope">{{ money(scope.row.festival_bonus) }}</template>
            </el-table-column>
            <el-table-column label="超額獎金" width="100">
              <template #default="scope">{{ money(scope.row.overtime_bonus) }}</template>
            </el-table-column>
            <el-table-column label="加班津貼" width="100">
              <template #default="scope">{{ money(scope.row.overtime_pay) }}</template>
            </el-table-column>
            <el-table-column label="主管紅利" width="100">
              <template #default="scope">{{ money(scope.row.supervisor_dividend) }}</template>
            </el-table-column>
            <el-table-column label="會議加班" width="100">
              <template #default="scope">{{ money(scope.row.meeting_overtime_pay) }}</template>
            </el-table-column>
            <el-table-column label="生日禮金" width="100">
              <template #default="scope">{{ money(scope.row.birthday_bonus) }}</template>
            </el-table-column>
            <el-table-column label="勞保" width="90">
              <template #default="scope">
                <span class="text-danger">{{ money(scope.row.labor_insurance) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="健保" width="90">
              <template #default="scope">
                <span class="text-danger">{{ money(scope.row.health_insurance) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="勞退自提" width="100">
              <template #default="scope">
                <span class="text-danger">{{ money(scope.row.pension_self) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="請假扣款" width="100">
              <template #default="scope">
                <span class="text-danger">{{ money(scope.row.leave_deduction) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="遲到扣款" width="100">
              <template #default="scope">
                <span class="text-danger">{{ money(scope.row.late_deduction) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="早退扣款" width="100">
              <template #default="scope">
                <span class="text-danger">{{ money(scope.row.early_leave_deduction) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="會議缺席" width="100">
              <template #default="scope">
                <span class="text-danger">{{ money(scope.row.meeting_absence_deduction) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="曠職扣款" width="100">
              <template #default="scope">
                <span class="text-danger">{{ money(scope.row.absence_deduction) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="總扣款" width="100">
              <template #default="scope">
                <span class="text-danger">{{ money(scope.row.total_deductions) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="實領" width="120">
              <template #default="scope">
                <strong>{{ money(scope.row.net_pay) }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="含獎金實領" width="130">
              <template #header>
                <el-tooltip content="實領 + 節慶獎金 + 超額獎金（獎金為獨立轉帳）" placement="top">
                  <span>含獎金實領 <el-icon :size="12"><InfoFilled /></el-icon></span>
                </el-tooltip>
              </template>
              <template #default="scope">
                <strong style="color: var(--el-color-success);">{{ money((scope.row.net_pay || 0) + (scope.row.festival_bonus || 0) + (scope.row.overtime_bonus || 0)) }}</strong>
              </template>
            </el-table-column>
            <el-table-column label="匯出" width="80" fixed="right">
              <template #default="scope">
                <el-button type="primary" size="small" link @click="exportPdf(scope.row)">PDF</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <EmptyState
          v-if="hasCalculated && !loading && salaryResults.length === 0"
          :icon="Search"
          title="查無薪資資料"
          :description="`${query.year} 年 ${query.month} 月尚無可計算的薪資記錄`"
        />
      </el-tab-pane>

      <!-- 獎金設定 -->
      <el-tab-pane label="獎金設定" name="bonus">
        <BonusConfigPanel />
      </el-tab-pane>

      <!-- 薪資歷史 -->
      <el-tab-pane label="薪資歷史" name="history">
        <SalaryHistoryPanel />
      </el-tab-pane>
    </el-tabs>

    <!-- Festival Bonus Dialog -->
    <el-dialog v-model="showBonusDialog" title="節慶獎金明細" width="950px">
      <el-table :data="bonusResults" border height="500" stripe>
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="category" label="類別" width="100" />
        <el-table-column label="獎金基數" width="100">
          <template #default="scope">{{ money(scope.row.bonusBase) }}</template>
        </el-table-column>
        <el-table-column label="目標人數" width="90">
          <template #default="scope">{{ scope.row.targetEnrollment || '-' }}</template>
        </el-table-column>
        <el-table-column label="在籍人數" width="90">
          <template #default="scope">{{ scope.row.currentEnrollment || '-' }}</template>
        </el-table-column>
        <el-table-column label="達成率" width="80">
          <template #default="scope">{{ pct(scope.row.ratio) }}</template>
        </el-table-column>
        <el-table-column label="獎金" width="100">
          <template #default="scope">{{ money(scope.row.festivalBonus) }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="備註" min-width="120" />
      </el-table>
      <template #footer>
        <div class="bonus-total">
          獎金合計: <strong>{{ money(bonusTotal) }}</strong>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.control-panel {
  margin-bottom: var(--space-5);
}
.controls {
  display: flex;
  gap: 15px;
  align-items: center;
}
.results-section {
  margin-top: var(--space-5);
}
.bonus-total {
  font-size: var(--text-lg);
  text-align: right;
}
</style>
