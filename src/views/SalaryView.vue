<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { calculate, getFestivalBonus, getRecords, getSalaryFieldBreakdown, manualAdjustSalary, getFestivalBonusPeriodAccrual } from '@/api/salary'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search, InfoFilled, SuccessFilled, Picture, Loading } from '@element-plus/icons-vue'
import BonusConfigPanel from './salary/BonusConfigPanel.vue'
import SalaryHistoryPanel from './salary/SalaryHistoryPanel.vue'
import SalarySimulatePanel from './salary/SalarySimulatePanel.vue'
import SalaryLogicPanel from './salary/SalaryLogicPanel.vue'
import SalarySnapshotDialog from './salary/SalarySnapshotDialog.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { apiError } from '@/utils/error'
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
const bonusLoading = ref(false)
const hasCalculated = ref(false)
const lastCalculatedAt = ref(null)
const dbCalculatedAt = ref(null)
const salaryResults = ref([])
const bonusResults = ref([])
const showBonusDialog = ref(false)
const bonusDialogTab = ref('single')  // 'single' | 'accrual'
const periodAccrualLoading = ref(false)
const periodAccrualData = ref(null)
const periodAccrualKey = ref(null)   // cache key `${year}-${month}`
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
const showSnapshotDialog = ref(false)
const showEditDialog = ref(false)
const editLoading = ref(false)
const editingRow = ref(null)
const editingVersion = ref(null)
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
    lastCalculatedAt.value = new Date()
    if (errors && errors.length > 0) {
      const names = errors.map(e => `${e.employee_name}（${e.error}）`).join('、')
      ElMessage.warning(`部分員工薪資計算失敗，共 ${errors.length} 筆：${names}`)
    } else {
      ElMessage.success('薪資計算完成')
    }
    await fetchSalaryRecords()
  } catch (error) {
    ElMessage.error('計算失敗: ' + apiError(error, error.message))
  } finally {
    loading.value = false
  }
}

const fetchFestivalBonus = async () => {
  // 每次點按鈕重新開 dialog → 重置 accrual cache 與 tab（query 可能改變月份）
  periodAccrualKey.value = null
  periodAccrualData.value = null
  bonusDialogTab.value = 'single'

  bonusLoading.value = true
  try {
    const response = await getFestivalBonus(query.year, query.month)
    bonusResults.value = response.data
    showBonusDialog.value = true
  } catch (error) {
    ElMessage.error('取得獎金資料失敗: ' + apiError(error, error.message))
  } finally {
    bonusLoading.value = false
  }
}

const fetchPeriodAccrual = async () => {
  const key = `${query.year}-${query.month}`
  if (periodAccrualKey.value === key && periodAccrualData.value) return
  periodAccrualLoading.value = true
  try {
    const response = await getFestivalBonusPeriodAccrual(query.year, query.month)
    periodAccrualData.value = response.data
    periodAccrualKey.value = key
  } catch (error) {
    ElMessage.error('取得本期累積失敗: ' + apiError(error, error.message))
  } finally {
    periodAccrualLoading.value = false
  }
}

const onBonusTabChange = (tab) => {
  if (tab === 'accrual') fetchPeriodAccrual()
}

const formatAccrualMonthLabel = (m, currentYear) => {
  // 同年只顯示月份，跨年顯示「YYYY/MM」避免 1 月查詢時混淆
  return m.year === currentYear ? `${m.month} 月` : `${m.year}/${m.month}`
}

const findMonthlyEntry = (row, year, month) => {
  return row.monthly?.find(x => x.year === year && x.month === month)
}

// ---- Salary Records (for export) ----
const salaryRecords = ref([])

// O(1) lookup map: employee_id → record
const salaryRecordsMap = computed(() => {
  const map = new Map()
  for (const r of salaryRecords.value) {
    if (r.employee_id != null) map.set(r.employee_id, r)
  }
  return map
})

// O(1) lookup map: employee_name → record（fallback 用，避免 O(n) find）
const salaryRecordsByName = computed(() => {
  const map = new Map()
  for (const r of salaryRecords.value) {
    if (r.employee_name) map.set(r.employee_name, r)
  }
  return map
})

const fetchSalaryRecords = async () => {
  try {
    const response = await getRecords(query.year, query.month)
    salaryRecords.value = response.data
    const timestamps = response.data.map(r => r.calculated_at).filter(Boolean)
    if (timestamps.length) {
      dbCalculatedAt.value = timestamps.sort().at(-1)
    }
    if (salaryResults.value.length > 0) {
      // 使用 Map 合併 remark，O(n) 取代 O(n²)
      const recordMap = new Map(response.data.map(r => [r.employee_id, r]))
      salaryResults.value = salaryResults.value.map((row) => {
        const record = recordMap.get(row.employee_id)
        return record ? { ...row, remark: record.remark || '' } : row
      })
    } else if (response.data.length > 0) {
      // 頁面重整後從 DB records 重建計算結果（records 已包含前端所需的欄位別名）
      salaryResults.value = response.data
      hasCalculated.value = true
    }
  } catch (error) {
    // silent - records may not exist yet
  }
}

const getRecordId = (employeeName) => {
  return salaryRecordsByName.value.get(employeeName)?.id ?? null
}

const getRecordForRow = (row) => {
  if (row?.employee_id != null) {
    return salaryRecordsMap.value.get(row.employee_id) || null
  }
  return salaryRecordsByName.value.get(row?.employee_name) || null
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
  editingVersion.value = record.version ?? null
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
    const response = await manualAdjustSalary(
      record.id,
      payload,
      editingVersion.value ?? record.version ?? null
    )
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
    editingVersion.value = updated.version ?? null
    ElMessage.success('薪資金額已更新')
    showEditDialog.value = false
  } catch (error) {
    if (error?.response?.status === 409) {
      ElMessageBox.alert(
        error.response.data?.detail || '此筆薪資已被他人修改，請重新整理後再編輯',
        '版本衝突',
        { confirmButtonText: '重新載入', type: 'warning' }
      ).then(() => {
        showEditDialog.value = false
        fetchSalaryRecords()
      }).catch(() => {})
    } else {
      ElMessage.error('儲存編輯失敗: ' + apiError(error, error.message))
    }
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
    ElMessage.error('載入欄位明細失敗: ' + apiError(error, error.message))
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

const formatDateTime = (value) => {
  if (!value) return ''
  const d = typeof value === 'string' ? new Date(value) : value
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
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
            <el-button type="primary" :loading="bonusLoading" @click="fetchFestivalBonus">節慶獎金明細</el-button>
            <el-button v-if="salaryRecords.length > 0" type="warning" @click="exportAllExcel">匯出全部 Excel</el-button>
            <el-button v-if="salaryRecords.length > 0" type="danger" @click="exportAllPdf">匯出全部 PDF</el-button>
            <el-tooltip content="查看該月快照（月底自動／封存／手動補拍）" placement="top">
              <el-button :icon="Picture" @click="showSnapshotDialog = true">月底快照</el-button>
            </el-tooltip>
          </div>
          <div v-if="dbCalculatedAt || lastCalculatedAt" class="calc-status">
            <span v-if="dbCalculatedAt" class="calc-status__item">
              <el-icon style="vertical-align: middle; margin-right: 4px;"><SuccessFilled /></el-icon>
              資料庫記錄：{{ formatDateTime(dbCalculatedAt) }}
            </span>
            <span v-if="lastCalculatedAt" class="calc-status__item calc-status__item--session">
              本次計算：{{ formatDateTime(lastCalculatedAt) }}
            </span>
          </div>
        </el-card>

        <div v-if="salaryResults.length > 0" class="results-section">
          <h3>計算結果</h3>
          <el-table :data="salaryResults" border style="width: 100%" v-loading="loading" stripe max-height="600">
            <el-table-column prop="employee_name" label="姓名" width="100" fixed />
            <el-table-column label="底薪" width="100">
              <template #default="scope">{{ money(scope.row.base_salary) }}</template>
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

      <!-- 薪資試算 -->
      <el-tab-pane label="薪資試算" name="simulate">
        <SalarySimulatePanel v-if="activeTab === 'simulate'" />
      </el-tab-pane>

      <!-- 薪資邏輯 -->
      <el-tab-pane label="薪資邏輯" name="logic">
        <SalaryLogicPanel v-if="activeTab === 'logic'" />
      </el-tab-pane>
    </el-tabs>

    <!-- Festival Bonus Dialog -->
    <el-dialog v-model="showBonusDialog" title="節慶獎金明細" width="1200px">
      <el-tabs v-model="bonusDialogTab" type="card" @tab-change="onBonusTabChange">
        <!-- 單月試算：原有內容 -->
        <el-tab-pane label="單月試算" name="single">
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
          <div class="bonus-total" style="margin-top: 12px;">
            獎金合計: <strong>{{ money(bonusTotal) }}</strong>
          </div>
        </el-tab-pane>

        <!-- 本期累積 -->
        <el-tab-pane label="本期累積" name="accrual">
          <div v-if="periodAccrualLoading" style="padding: 40px; text-align: center;">
            <el-icon class="is-loading"><Loading /></el-icon>
            <div style="margin-top: 8px; color: #666;">載入中...</div>
          </div>

          <el-alert
            v-else-if="periodAccrualData?.is_distribution_month"
            type="info"
            :closable="false"
            title="本月為發放月，實際發放金額請見左側薪資列表"
            style="margin-bottom: 12px;"
          />

          <template v-else-if="periodAccrualData">
            <div class="accrual-hint">
              <el-tooltip placement="top">
                <template #content>
                  預估不含「事病假 &gt; 40 小時歸零」規則（該規則僅在發放月當月檢查）。<br/>
                  離職員工不列入（與發放月實發條件一致）。
                </template>
                <span>
                  本期
                  {{ formatAccrualMonthLabel(
                    { year: periodAccrualData.period_start_year, month: periodAccrualData.period_start_month },
                    periodAccrualData.current_year
                  ) }}
                  ~ {{ periodAccrualData.current_month }} 月累積，預定於
                  {{ periodAccrualData.distribution_month }} 月發放
                  <el-icon :size="12"><InfoFilled /></el-icon>
                </span>
              </el-tooltip>
            </div>
            <el-table
              :data="periodAccrualData.rows"
              border
              stripe
              max-height="550"
            >
              <el-table-column prop="name" label="姓名" width="100" fixed />
              <el-table-column prop="category" label="類別" width="100" />
              <el-table-column
                v-for="m in periodAccrualData.rows?.[0]?.monthly || []"
                :key="`${m.year}-${m.month}`"
                :label="formatAccrualMonthLabel(m, periodAccrualData.current_year)"
                align="center"
              >
                <el-table-column label="節慶" width="90">
                  <template #default="scope">{{ money(findMonthlyEntry(scope.row, m.year, m.month)?.festival_bonus) }}</template>
                </el-table-column>
                <el-table-column label="超額" width="90">
                  <template #default="scope">{{ money(findMonthlyEntry(scope.row, m.year, m.month)?.overtime_bonus) }}</template>
                </el-table-column>
                <el-table-column label="扣款" width="90">
                  <template #default="scope">
                    <span :class="{ 'text-danger': (findMonthlyEntry(scope.row, m.year, m.month)?.meeting_absence_deduction || 0) > 0 }">
                      {{ money(findMonthlyEntry(scope.row, m.year, m.month)?.meeting_absence_deduction) }}
                    </span>
                  </template>
                </el-table-column>
              </el-table-column>
              <el-table-column label="本期小計" align="center">
                <el-table-column label="節慶" width="100">
                  <template #default="scope">{{ money(scope.row.totals.festival_bonus) }}</template>
                </el-table-column>
                <el-table-column label="超額" width="100">
                  <template #default="scope">{{ money(scope.row.totals.overtime_bonus) }}</template>
                </el-table-column>
                <el-table-column label="扣款" width="100">
                  <template #default="scope">
                    <span :class="{ 'text-danger': scope.row.totals.meeting_absence_deduction > 0 }">
                      {{ money(scope.row.totals.meeting_absence_deduction) }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="預估實發" width="120">
                  <template #default="scope">
                    <strong>{{ money(scope.row.totals.net_estimate) }}</strong>
                  </template>
                </el-table-column>
              </el-table-column>
            </el-table>
          </template>
        </el-tab-pane>
      </el-tabs>
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

    <SalarySnapshotDialog
      v-model="showSnapshotDialog"
      :year="query.year"
      :month="query.month"
      :can-write="canWriteSalary"
    />
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
.calc-status {
  margin-top: 10px;
  padding: 6px 10px;
  background: #f0f9eb;
  border-left: 3px solid #67c23a;
  border-radius: 4px;
  font-size: 13px;
  color: #529b2e;
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}
.calc-status__item {
  display: flex;
  align-items: center;
}
.calc-status__item--session {
  color: #409eff;
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
.accrual-hint {
  margin-bottom: 12px;
  color: #666;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 4px;
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
