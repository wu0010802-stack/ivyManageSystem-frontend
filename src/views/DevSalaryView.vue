<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { getSalaryLogic, getEmployeeSalaryDebug } from '@/api/dev'
import { getEmployees } from '@/api/employees'

const loading = ref(false)
const logicData = ref(null)

// Employee debug
const employees = ref([])
const debugForm = reactive({
  employee_id: null,
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
})
const debugLoading = ref(false)
const debugResult = ref(null)

const activeTab = ref('logic')

const fetchLogic = async () => {
  loading.value = true
  try {
    const res = await getSalaryLogic()
    logicData.value = res.data
  } catch (e) {
    ElMessage.error('載入失敗: ' + (e.response?.data?.detail || e.message))
  } finally {
    loading.value = false
  }
}

const fetchEmployees = async () => {
  try {
    const res = await getEmployees()
    employees.value = res.data.filter(e => e.is_active)
  } catch { /* ignore */ }
}

const runDebug = async () => {
  if (!debugForm.employee_id) {
    ElMessage.warning('請選擇員工')
    return
  }
  debugLoading.value = true
  debugResult.value = null
  try {
    const res = await getEmployeeSalaryDebug({
      employee_id: debugForm.employee_id,
      year: debugForm.year,
      month: debugForm.month,
    })
    debugResult.value = res.data
  } catch (e) {
    ElMessage.error('計算失敗: ' + (e.response?.data?.detail || e.message))
  } finally {
    debugLoading.value = false
  }
}

const formatJson = (obj) => {
  return JSON.stringify(obj, null, 2)
}

onMounted(() => {
  fetchLogic()
  fetchEmployees()
})
</script>

<template>
  <div class="dev-page">
    <h2>薪資計算邏輯檢視 (Dev)</h2>
    <p class="dev-hint">此頁面僅供開發除錯用，顯示目前系統的薪資計算邏輯與參數設定。</p>

    <el-tabs v-model="activeTab">
      <!-- Tab 1: 系統參數 -->
      <el-tab-pane label="系統參數總覽" name="logic">
        <div v-loading="loading">
          <template v-if="logicData">
            <!-- 薪資公式 -->
            <el-card class="section-card">
              <template #header><strong>薪資計算公式</strong></template>
              <el-descriptions :column="1" border size="small">
                <el-descriptions-item
                  v-for="(val, key) in logicData.salary_formula"
                  :key="key"
                  :label="key"
                >
                  <code>{{ val }}</code>
                </el-descriptions-item>
              </el-descriptions>
            </el-card>

            <!-- 考勤政策 -->
            <el-card class="section-card">
              <template #header><strong>考勤政策 (DB)</strong></template>
              <el-descriptions :column="2" border size="small" v-if="logicData.attendance_policy_db">
                <el-descriptions-item label="預設上班">{{ logicData.attendance_policy_db.default_work_start }}</el-descriptions-item>
                <el-descriptions-item label="預設下班">{{ logicData.attendance_policy_db.default_work_end }}</el-descriptions-item>
                <el-descriptions-item label="遲到閾值">{{ logicData.attendance_policy_db.late_threshold }}</el-descriptions-item>
                <el-descriptions-item label="節慶獎金入職月數">{{ logicData.attendance_policy_db.festival_bonus_months }}</el-descriptions-item>
              </el-descriptions>
              <el-empty v-else description="未設定" />
            </el-card>

            <!-- 請假扣薪 -->
            <el-card class="section-card">
              <template #header><strong>請假扣薪規則</strong></template>
              <el-table :data="Object.entries(logicData.leave_deduction_rules).map(([k,v]) => ({code:k,...v}))" border size="small">
                <el-table-column prop="code" label="代碼" width="100" />
                <el-table-column prop="label" label="假別" width="100" />
                <el-table-column prop="ratio" label="扣薪比例" width="100" />
                <el-table-column prop="note" label="說明" />
              </el-table>
            </el-card>

            <!-- 獎金設定 -->
            <el-card class="section-card">
              <template #header><strong>獎金設定 (DB)</strong></template>
              <pre v-if="logicData.bonus_config_db" class="json-block">{{ formatJson(logicData.bonus_config_db) }}</pre>
              <el-empty v-else description="未設定" />
            </el-card>

            <!-- 年級目標 -->
            <el-card class="section-card">
              <template #header><strong>年級目標人數 (DB)</strong></template>
              <el-table :data="logicData.grade_targets_db" border size="small" v-if="logicData.grade_targets_db.length">
                <el-table-column prop="grade_name" label="年級" width="80" />
                <el-table-column prop="festival_two_teachers" label="節慶(雙導)" width="100" />
                <el-table-column prop="festival_one_teacher" label="節慶(單導)" width="100" />
                <el-table-column prop="festival_shared" label="節慶(共用)" width="100" />
                <el-table-column prop="overtime_two_teachers" label="超額(雙導)" width="100" />
                <el-table-column prop="overtime_one_teacher" label="超額(單導)" width="100" />
                <el-table-column prop="overtime_shared" label="超額(共用)" width="100" />
              </el-table>
            </el-card>

            <!-- 勞健保費率 -->
            <el-card class="section-card">
              <template #header><strong>勞健保費率 (DB)</strong></template>
              <pre v-if="logicData.insurance_rate_db" class="json-block">{{ formatJson(logicData.insurance_rate_db) }}</pre>
              <el-empty v-else description="未設定" />
            </el-card>

            <!-- Engine 運行時參數 -->
            <el-card class="section-card">
              <template #header><strong>SalaryEngine 運行時參數</strong></template>
              <pre class="json-block">{{ formatJson(logicData.engine_runtime_config) }}</pre>
            </el-card>

            <!-- 班別 -->
            <el-card class="section-card">
              <template #header><strong>班別設定</strong></template>
              <el-table :data="logicData.shift_types" border size="small">
                <el-table-column prop="id" label="ID" width="60" />
                <el-table-column prop="name" label="名稱" width="140" />
                <el-table-column prop="work_start" label="上班" width="80" />
                <el-table-column prop="work_end" label="下班" width="80" />
                <el-table-column prop="is_active" label="啟用" width="60">
                  <template #default="{row}">{{ row.is_active ? 'Y' : 'N' }}</template>
                </el-table-column>
              </el-table>
            </el-card>
          </template>
        </div>
      </el-tab-pane>

      <!-- Tab 2: 員工薪資模擬 -->
      <el-tab-pane label="員工薪資模擬" name="debug">
        <el-card class="section-card">
          <template #header><strong>選擇員工與月份</strong></template>
          <div class="debug-controls">
            <el-select
              v-model="debugForm.employee_id"
              placeholder="選擇員工"
              filterable
              style="width: 220px"
            >
              <el-option
                v-for="emp in employees"
                :key="emp.id"
                :label="`${emp.employee_id} - ${emp.name}`"
                :value="emp.id"
              />
            </el-select>
            <el-input-number v-model="debugForm.year" :min="2020" :max="2030" style="width: 120px" />
            <el-input-number v-model="debugForm.month" :min="1" :max="12" style="width: 100px" />
            <el-button type="primary" @click="runDebug" :loading="debugLoading">計算</el-button>
          </div>
        </el-card>

        <template v-if="debugResult">
          <!-- 員工基本資料 -->
          <el-card class="section-card">
            <template #header><strong>員工資料</strong></template>
            <el-descriptions :column="3" border size="small">
              <el-descriptions-item label="姓名">{{ debugResult.employee.name }}</el-descriptions-item>
              <el-descriptions-item label="工號">{{ debugResult.employee.employee_id }}</el-descriptions-item>
              <el-descriptions-item label="職稱">{{ debugResult.employee.title }}</el-descriptions-item>
              <el-descriptions-item label="職位">{{ debugResult.employee.position }}</el-descriptions-item>
              <el-descriptions-item label="底薪">{{ debugResult.employee.base_salary?.toLocaleString() }}</el-descriptions-item>
              <el-descriptions-item label="到職日">{{ debugResult.employee.hire_date }}</el-descriptions-item>
              <el-descriptions-item label="辦公室人員">{{ debugResult.employee.is_office_staff ? 'Y' : 'N' }}</el-descriptions-item>
              <el-descriptions-item label="投保薪資">{{ debugResult.employee.insurance_salary_level?.toLocaleString() }}</el-descriptions-item>
              <el-descriptions-item label="眷屬數">{{ debugResult.employee.dependents }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 出勤統計 -->
          <el-card class="section-card">
            <template #header><strong>出勤統計 ({{ debugResult.period.year }}/{{ debugResult.period.month }})</strong></template>
            <el-descriptions :column="3" border size="small">
              <el-descriptions-item label="出勤記錄數">{{ debugResult.attendance_summary.total_records }}</el-descriptions-item>
              <el-descriptions-item label="遲到次數">{{ debugResult.attendance_summary.late_count }}</el-descriptions-item>
              <el-descriptions-item label="早退次數">{{ debugResult.attendance_summary.early_leave_count }}</el-descriptions-item>
              <el-descriptions-item label="遲到總分鐘">{{ debugResult.attendance_summary.total_late_minutes }}</el-descriptions-item>
              <el-descriptions-item label="早退總分鐘">{{ debugResult.attendance_summary.total_early_minutes }}</el-descriptions-item>
              <el-descriptions-item label="未打卡(上)">{{ debugResult.attendance_summary.missing_punch_in }}</el-descriptions-item>
              <el-descriptions-item label="未打卡(下)">{{ debugResult.attendance_summary.missing_punch_out }}</el-descriptions-item>
            </el-descriptions>
            <div v-if="debugResult.attendance_summary.late_details.length" class="mt-3">
              <strong>遲到明細 (分鐘):</strong>
              <el-tag v-for="(m, i) in debugResult.attendance_summary.late_details" :key="i" size="small"
                :type="m >= 120 ? 'danger' : 'warning'" class="ml-1">
                {{ m }}分
              </el-tag>
            </div>
          </el-card>

          <!-- 扣款計算 -->
          <el-card class="section-card">
            <template #header><strong>考勤扣款計算</strong></template>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="日薪">{{ debugResult.deduction_calc.daily_salary }}</el-descriptions-item>
              <el-descriptions-item label="每分鐘費率">{{ debugResult.deduction_calc.per_minute_rate }}</el-descriptions-item>
              <el-descriptions-item label="遲到扣款">{{ debugResult.deduction_calc.late_deduction }}</el-descriptions-item>
              <el-descriptions-item label="早退扣款">{{ debugResult.deduction_calc.early_leave_deduction }}</el-descriptions-item>
            </el-descriptions>
            <div v-if="debugResult.deduction_calc.late_deduction_detail.length" class="mt-3">
              <strong>遲到扣款逐筆:</strong>
              <el-table :data="debugResult.deduction_calc.late_deduction_detail" border size="small" style="margin-top: 8px">
                <el-table-column prop="minutes" label="分鐘" width="80" />
                <el-table-column prop="type" label="類型" width="160" />
                <el-table-column prop="deduction" label="扣款" width="100" />
              </el-table>
            </div>
          </el-card>

          <!-- 請假扣款 -->
          <el-card class="section-card">
            <template #header><strong>請假扣款 (合計: {{ debugResult.leave_deduction_total }})</strong></template>
            <el-table :data="debugResult.leave_breakdown" border size="small" v-if="debugResult.leave_breakdown.length">
              <el-table-column prop="type" label="假別" width="100" />
              <el-table-column prop="start" label="開始" width="120" />
              <el-table-column prop="end" label="結束" width="120" />
              <el-table-column prop="hours" label="時數" width="80" />
              <el-table-column prop="ratio" label="扣薪比例" width="100" />
              <el-table-column prop="deduction" label="扣款" width="100" />
            </el-table>
            <el-empty v-else description="無請假記錄" />
          </el-card>

          <!-- 節慶獎金 -->
          <el-card class="section-card">
            <template #header><strong>節慶獎金計算</strong></template>
            <template v-if="Object.keys(debugResult.festival_bonus_detail).length">
              <el-descriptions :column="3" border size="small">
                <el-descriptions-item label="類別">{{ debugResult.festival_bonus_detail.category || '-' }}</el-descriptions-item>
                <el-descriptions-item label="獎金基數">{{ debugResult.festival_bonus_detail.base?.toLocaleString() || 0 }}</el-descriptions-item>
                <el-descriptions-item label="在籍人數">{{ debugResult.festival_bonus_detail.enrollment || 0 }}</el-descriptions-item>
                <el-descriptions-item label="目標人數">{{ debugResult.festival_bonus_detail.target || 0 }}</el-descriptions-item>
                <el-descriptions-item label="達成率">{{ debugResult.festival_bonus_detail.ratio ? (debugResult.festival_bonus_detail.ratio * 100).toFixed(1) + '%' : '0%' }}</el-descriptions-item>
                <el-descriptions-item label="符合資格">
                  <el-tag :type="debugResult.festival_bonus_detail.eligible ? 'success' : 'danger'" size="small">
                    {{ debugResult.festival_bonus_detail.eligible ? '是' : '否' }}
                  </el-tag>
                </el-descriptions-item>
                <el-descriptions-item label="節慶獎金">
                  <strong style="font-size: 16px; color: var(--el-color-primary);">${{ (debugResult.festival_bonus_detail.result || 0).toLocaleString() }}</strong>
                </el-descriptions-item>
                <el-descriptions-item label="發放月份">
                  <el-tag :type="[2,6,9,12].includes(debugForm.month) ? 'success' : 'info'" size="small">
                    {{ [2,6,9,12].includes(debugForm.month) ? '本月發放' : '非發放月（2/6/9/12月發放）' }}
                  </el-tag>
                </el-descriptions-item>
              </el-descriptions>
            </template>
            <el-empty v-else description="無節慶獎金" />
          </el-card>

          <!-- 津貼 -->
          <el-card class="section-card" v-if="debugResult.allowances.length">
            <template #header><strong>津貼</strong></template>
            <el-table :data="debugResult.allowances" border size="small">
              <el-table-column prop="name" label="名稱" />
              <el-table-column prop="amount" label="金額" width="120" />
            </el-table>
          </el-card>

          <!-- 園務會議 -->
          <el-card class="section-card">
            <template #header><strong>園務會議</strong></template>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="出席">{{ debugResult.meeting.attended }} 次</el-descriptions-item>
              <el-descriptions-item label="缺席">{{ debugResult.meeting.absent }} 次</el-descriptions-item>
              <el-descriptions-item label="每次加班費">{{ debugResult.meeting.overtime_pay_per_session }}</el-descriptions-item>
              <el-descriptions-item label="每次缺席罰款">{{ debugResult.meeting.absence_penalty_per_session }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 勞健保 -->
          <el-card class="section-card">
            <template #header><strong>勞健保計算</strong></template>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="投保金額">{{ debugResult.insurance.insured_amount?.toLocaleString() }}</el-descriptions-item>
              <el-descriptions-item label="勞保(員工)">{{ debugResult.insurance.labor_employee }}</el-descriptions-item>
              <el-descriptions-item label="勞保(雇主)">{{ debugResult.insurance.labor_employer }}</el-descriptions-item>
              <el-descriptions-item label="健保(員工)">{{ debugResult.insurance.health_employee }}</el-descriptions-item>
              <el-descriptions-item label="健保(雇主)">{{ debugResult.insurance.health_employer }}</el-descriptions-item>
              <el-descriptions-item label="勞退(員工)">{{ debugResult.insurance.pension_employee }}</el-descriptions-item>
              <el-descriptions-item label="勞退(雇主)">{{ debugResult.insurance.pension_employer }}</el-descriptions-item>
              <el-descriptions-item label="員工代扣合計">{{ debugResult.insurance.total_employee_deduction }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 其他 -->
          <el-card class="section-card">
            <template #header><strong>其他</strong></template>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="加班費">{{ debugResult.overtime_pay }}</el-descriptions-item>
              <el-descriptions-item label="主管紅利">{{ debugResult.supervisor_dividend }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- Raw JSON -->
          <el-card class="section-card">
            <template #header><strong>完整 JSON (可複製)</strong></template>
            <pre class="json-block raw-json">{{ formatJson(debugResult) }}</pre>
          </el-card>
        </template>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.dev-page h2 {
  margin-bottom: var(--space-2);
}

.dev-hint {
  color: var(--text-secondary);
  font-size: var(--text-sm, 13px);
  margin-bottom: var(--space-4);
}

.section-card {
  margin-bottom: var(--space-4);
}

.json-block {
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 500px;
  overflow-y: auto;
}

.raw-json {
  max-height: 600px;
  font-size: 12px;
}

.debug-controls {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}

.mt-3 {
  margin-top: 12px;
}

.ml-1 {
  margin-left: 4px;
}
</style>
