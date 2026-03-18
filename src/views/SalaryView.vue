<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { calculate, getFestivalBonus, getRecords, getSalaryFieldBreakdown, manualAdjustSalary } from '@/api/salary'
import { ElMessage } from 'element-plus'
import { Search, InfoFilled } from '@element-plus/icons-vue'
import BonusConfigPanel from './salary/BonusConfigPanel.vue'
import SalaryHistoryPanel from './salary/SalaryHistoryPanel.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { downloadFile } from '@/utils/download'
import { money } from '@/utils/format'
import { hasPermission } from '@/utils/auth'

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
const showFieldBreakdownDialog = ref(false)
const fieldBreakdownLoading = ref(false)
const fieldBreakdown = ref(null)
const activeTab = ref('calculate')
const canReadSalarySettings = hasPermission('SETTINGS_READ')
const canReadEmployees = hasPermission('EMPLOYEES_READ')
const canWriteSalary = hasPermission('SALARY_WRITE')
const MONEY_KEYS = new Set([
  'bonusBase',
  'result',
  'perPerson',
  'pay',
  'deduction',
  'dailySalary',
  'ruleAmount',
  'penalty',
])
const showEditDialog = ref(false)
const editLoading = ref(false)
const editingRow = ref(null)
const editForm = reactive({
  festival_bonus: 0,
  overtime_bonus: 0,
  overtime_pay: 0,
  supervisor_dividend: 0,
  meeting_overtime_pay: 0,
  birthday_bonus: 0,
  leave_deduction: 0,
  late_deduction: 0,
  early_leave_deduction: 0,
  meeting_absence_deduction: 0,
  absence_deduction: 0,
})
const editableFieldList = [
  { key: 'festival_bonus', label: '節慶獎金' },
  { key: 'overtime_bonus', label: '超額獎金' },
  { key: 'overtime_pay', label: '加班津貼' },
  { key: 'supervisor_dividend', label: '主管紅利' },
  { key: 'meeting_overtime_pay', label: '會議加班' },
  { key: 'birthday_bonus', label: '生日禮金' },
  { key: 'leave_deduction', label: '請假扣款' },
  { key: 'late_deduction', label: '遲到扣款' },
  { key: 'early_leave_deduction', label: '早退扣款' },
  { key: 'meeting_absence_deduction', label: '節慶獎金扣減' },
  { key: 'absence_deduction', label: '曠職扣款' },
]

// ---- Salary Calculation ----
const calculateSalary = async () => {
  loading.value = true
  try {
    const response = await calculate(query.year, query.month)
    const { results, errors } = response.data
    salaryResults.value = results
    hasCalculated.value = true
    if (errors && errors.length > 0) {
      const names = errors.map(e => `${e.employee_name}（${e.error}）`).join('、')
      ElMessage.warning(`部分員工薪資計算失敗，共 ${errors.length} 筆：${names}`)
    } else {
      ElMessage.success('薪資計算完成')
    }
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
    const response = await getFestivalBonus(query.year, query.month)
    bonusResults.value = response.data
    showBonusDialog.value = true
  } catch (error) {
    ElMessage.error('取得獎金資料失敗: ' + (error.response?.data?.detail || error.message))
  } finally {
    loading.value = false
  }
}

// ---- Salary Records (for export) ----
const salaryRecords = ref([])

const fetchSalaryRecords = async () => {
  try {
    const response = await getRecords(query.year, query.month)
    salaryRecords.value = response.data
    if (salaryResults.value.length > 0) {
      salaryResults.value = salaryResults.value.map((row) => {
        const record = response.data.find((item) => item.employee_id === row.employee_id)
        return record ? { ...row, remark: record.remark || '' } : row
      })
    }
  } catch (error) {
    // silent - records may not exist yet
  }
}

const getRecordId = (employeeName) => {
  const rec = salaryRecords.value.find(r => r.employee_name === employeeName)
  return rec ? rec.id : null
}

const getRecordForRow = (row) => {
  if (row?.employee_id) {
    const matched = salaryRecords.value.find(r => r.employee_id === row.employee_id)
    if (matched) return matched
  }
  return salaryRecords.value.find(r => r.employee_name === row?.employee_name) || null
}

const exportPdf = (row) => {
  const recordId = getRecordForRow(row)?.id || getRecordId(row.employee_name)
  if (!recordId) {
    ElMessage.warning('請先計算薪資後再匯出')
    return
  }
  downloadFile(`/salaries/${recordId}/export?format=pdf`, `薪資單_${row.employee_name}.pdf`)
}

const openEditDialog = (row) => {
  const record = getRecordForRow(row)
  if (!record?.id) {
    ElMessage.warning('請先計算薪資後再編輯')
    return
  }
  editingRow.value = row
  for (const field of editableFieldList) {
    editForm[field.key] = row[field.key] || 0
  }
  showEditDialog.value = true
}

const saveManualAdjust = async () => {
  const record = getRecordForRow(editingRow.value)
  if (!record?.id || !editingRow.value) return

  editLoading.value = true
  try {
    const payload = {}
    for (const field of editableFieldList) {
      payload[field.key] = Number(editForm[field.key] || 0)
    }
    const response = await manualAdjustSalary(record.id, payload)
    const updated = response.data.record
    Object.assign(editingRow.value, {
      festival_bonus: updated.festival_bonus,
      overtime_bonus: updated.overtime_bonus,
      overtime_pay: updated.overtime_pay,
      supervisor_dividend: updated.supervisor_dividend,
      meeting_overtime_pay: updated.meeting_overtime_pay,
      birthday_bonus: updated.birthday_bonus,
      leave_deduction: updated.leave_deduction,
      late_deduction: updated.late_deduction,
      early_leave_deduction: updated.early_leave_deduction,
      meeting_absence_deduction: updated.meeting_absence_deduction,
      absence_deduction: updated.absence_deduction,
      total_deductions: updated.total_deduction,
      net_pay: updated.net_salary,
      remark: updated.remark,
    })
    const recordIndex = salaryRecords.value.findIndex(item => item.id === record.id)
    if (recordIndex >= 0) {
      salaryRecords.value[recordIndex] = {
        ...salaryRecords.value[recordIndex],
        ...updated,
      }
    }
    ElMessage.success('薪資金額已更新')
    showEditDialog.value = false
  } catch (error) {
    ElMessage.error('儲存編輯失敗: ' + (error.response?.data?.detail || error.message))
  } finally {
    editLoading.value = false
  }
}

const openFieldBreakdown = async (row, field) => {
  const record = getRecordForRow(row)
  if (!record?.id) {
    ElMessage.warning('請先計算薪資後再查看明細')
    return
  }

  fieldBreakdownLoading.value = true
  try {
    const response = await getSalaryFieldBreakdown(record.id, field)
    fieldBreakdown.value = response.data
    showFieldBreakdownDialog.value = true
  } catch (error) {
    ElMessage.error('載入欄位明細失敗: ' + (error.response?.data?.detail || error.message))
  } finally {
    fieldBreakdownLoading.value = false
  }
}

const exportAllExcel = () => {
  downloadFile(`/salaries/export-all?year=${query.year}&month=${query.month}&format=xlsx`, `${query.year}年${query.month}月薪資總表.xlsx`)
}

const exportAllPdf = () => {
  downloadFile(`/salaries/export-all?year=${query.year}&month=${query.month}&format=pdf`, `${query.year}年${query.month}月薪資總表.pdf`)
}

const pct = (val) => {
  if (!val && val !== 0) return '0.0%'
  return (val * 100).toFixed(1) + '%'
}

const bonusTotal = computed(() =>
  bonusResults.value.reduce((sum, row) => sum + (row.festivalBonus || 0), 0)
)

const fieldBreakdownTitle = computed(() => {
  const employee = fieldBreakdown.value?.employee
  if (!employee || !fieldBreakdown.value?.title) return '薪資明細'
  return `${fieldBreakdown.value.title}｜${employee.employee_name}｜${employee.year} 年 ${employee.month} 月`
})

const renderFieldBreakdownValue = (row, column) => {
  const value = row?.[column.key]
  if (value === null || value === undefined || value === '') return '-'
  if (MONEY_KEYS.has(column.key)) return money(value)
  return value
}

onMounted(() => {
  fetchSalaryRecords()
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
            <el-button v-if="salaryRecords.length > 0" type="danger" @click="exportAllPdf">匯出全部 PDF</el-button>
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
              <template #default="scope">
                <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'festival_bonus')">
                  {{ money(scope.row.festival_bonus) }}
                </button>
              </template>
            </el-table-column>
            <el-table-column label="超額獎金" width="100">
              <template #default="scope">
                <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'overtime_bonus')">
                  {{ money(scope.row.overtime_bonus) }}
                </button>
              </template>
            </el-table-column>
            <el-table-column label="加班津貼" width="100">
              <template #default="scope">
                <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'overtime_pay')">
                  {{ money(scope.row.overtime_pay) }}
                </button>
              </template>
            </el-table-column>
            <el-table-column label="主管紅利" width="100">
              <template #default="scope">
                <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'supervisor_dividend')">
                  {{ money(scope.row.supervisor_dividend) }}
                </button>
              </template>
            </el-table-column>
            <el-table-column label="會議加班" width="100">
              <template #default="scope">
                <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'meeting_overtime_pay')">
                  {{ money(scope.row.meeting_overtime_pay) }}
                </button>
              </template>
            </el-table-column>
            <el-table-column label="生日禮金" width="100">
              <template #default="scope">
                <button type="button" class="cell-link text-link-primary" @click="openFieldBreakdown(scope.row, 'birthday_bonus')">
                  {{ money(scope.row.birthday_bonus) }}
                </button>
              </template>
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
                <button type="button" class="cell-link text-link-danger" @click="openFieldBreakdown(scope.row, 'leave_deduction')">
                  {{ money(scope.row.leave_deduction) }}
                </button>
              </template>
            </el-table-column>
            <el-table-column label="遲到扣款" width="100">
              <template #default="scope">
                <button type="button" class="cell-link text-link-danger" @click="openFieldBreakdown(scope.row, 'late_deduction')">
                  {{ money(scope.row.late_deduction) }}
                </button>
              </template>
            </el-table-column>
            <el-table-column label="早退扣款" width="100">
              <template #default="scope">
                <button type="button" class="cell-link text-link-danger" @click="openFieldBreakdown(scope.row, 'early_leave_deduction')">
                  {{ money(scope.row.early_leave_deduction) }}
                </button>
              </template>
            </el-table-column>
            <el-table-column width="128">
              <template #header>
                <el-tooltip content="僅從節慶獎金扣減，不計入總扣款與實領月薪" placement="top">
                  <span>節慶獎金扣減 <el-icon :size="12"><InfoFilled /></el-icon></span>
                </el-tooltip>
              </template>
              <template #default="scope">
                <button type="button" class="cell-link text-link-warning" @click="openFieldBreakdown(scope.row, 'meeting_absence_deduction')">
                  {{ money(scope.row.meeting_absence_deduction) }}
                </button>
              </template>
            </el-table-column>
            <el-table-column label="曠職扣款" width="100">
              <template #default="scope">
                <button type="button" class="cell-link text-link-danger" @click="openFieldBreakdown(scope.row, 'absence_deduction')">
                  {{ money(scope.row.absence_deduction) }}
                </button>
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
            <el-table-column label="編輯紀錄" min-width="220">
              <template #default="scope">
                <span class="remark-text">{{ scope.row.remark || '-' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="scope">
                <el-button v-if="canWriteSalary" type="primary" size="small" link @click="openEditDialog(scope.row)">編輯</el-button>
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

      <!-- 薪資設定 -->
      <el-tab-pane v-if="canReadSalarySettings" label="薪資設定" name="bonus">
        <BonusConfigPanel v-if="activeTab === 'bonus'" />
      </el-tab-pane>

      <!-- 薪資歷史 -->
      <el-tab-pane v-if="canReadEmployees" label="薪資歷史" name="history">
        <SalaryHistoryPanel v-if="activeTab === 'history'" />
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

    <el-dialog v-model="showFieldBreakdownDialog" :title="fieldBreakdownTitle" width="960px">
      <div v-loading="fieldBreakdownLoading">
        <template v-if="fieldBreakdown">
          <el-descriptions :column="2" border class="breakdown-meta">
            <el-descriptions-item label="姓名">{{ fieldBreakdown.employee.employee_name }}</el-descriptions-item>
            <el-descriptions-item label="員工編號">{{ fieldBreakdown.employee.employee_code }}</el-descriptions-item>
            <el-descriptions-item label="職稱">{{ fieldBreakdown.employee.job_title || '-' }}</el-descriptions-item>
            <el-descriptions-item label="月份">{{ fieldBreakdown.employee.year }} 年 {{ fieldBreakdown.employee.month }} 月</el-descriptions-item>
          </el-descriptions>

          <el-table :data="fieldBreakdown.rows" border max-height="480" stripe class="field-breakdown-table">
            <el-table-column
              v-for="column in fieldBreakdown.columns"
              :key="column.key"
              :prop="column.key"
              :label="column.label"
              min-width="120"
            >
              <template #default="scope">
                {{ renderFieldBreakdownValue(scope.row, column) }}
              </template>
            </el-table-column>
          </el-table>

          <el-alert
            v-if="fieldBreakdown.note"
            :title="fieldBreakdown.note"
            type="info"
            :closable="false"
            class="breakdown-alert"
          />
        </template>
      </div>
      <template #footer>
        <div class="breakdown-footer" v-if="fieldBreakdown">
          明細合計：<strong>{{ money(fieldBreakdown.summary?.amount || 0) }}</strong>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="showEditDialog"
      :title="editingRow ? `手動編輯｜${editingRow.employee_name}` : '手動編輯'"
      width="780px"
    >
      <el-form label-width="120px" class="salary-edit-form">
        <div class="salary-edit-grid">
          <el-form-item v-for="field in editableFieldList" :key="field.key" :label="field.label">
            <el-input-number v-model="editForm[field.key]" :min="0" :step="100" controls-position="right" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="showEditDialog = false">取消</el-button>
        <el-button type="primary" :loading="editLoading" @click="saveManualAdjust">儲存</el-button>
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
.salary-edit-form {
  margin-top: 8px;
}
.salary-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 20px;
}
.bonus-total {
  font-size: var(--text-lg);
  text-align: right;
}
.breakdown-meta {
  margin-bottom: 16px;
}
.breakdown-alert {
  margin-bottom: 16px;
}
.field-breakdown-table {
  margin-bottom: 16px;
}
.breakdown-footer {
  font-size: var(--text-lg);
  text-align: right;
}
.cell-link {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.text-link-primary {
  color: var(--el-color-primary);
}
.text-link-danger {
  color: var(--el-color-danger);
  font-weight: 600;
}
.text-link-warning {
  color: var(--el-color-warning);
  font-weight: 600;
}
.remark-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.text-warning {
  color: var(--el-color-warning);
  font-weight: 600;
}
</style>
