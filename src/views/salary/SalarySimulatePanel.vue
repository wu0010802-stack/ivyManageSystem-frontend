<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { simulateSalary, getEmployeeSalaryDebug } from '@/api/salary'
import { useEmployeeStore } from '@/stores/employee'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { money } from '@/utils/format'

const employeeStore = useEmployeeStore()
const employees = computed(() =>
  employeeStore.employees.filter(e => e.is_active && e.employee_type !== 'hourly')
)
const loading = ref(false)
const result = ref(null)
const debugResult = ref(null)

const formatJson = (obj) => JSON.stringify(obj, null, 2)

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

const form = reactive({
  employee_id: null,
  year: currentYear,
  month: currentMonth,
  late_count: null,
  early_leave_count: null,
  missing_punch_count: null,
  total_late_minutes: null,
  total_early_minutes: null,
  work_days: null,
  extra_personal_leave_hours: 0,
  extra_sick_leave_hours: 0,
  enrollment_override: null,
  extra_overtime_pay: 0,
})

// ── 試算結果快取（sessionStorage）──────────────────────────────────────
// 避免重新整理頁面或切換 tab 時丟失上一次試算結果；
// 也能讓相同參數不再打 API（省 rate-limit + 後端 CPU）。
const STORAGE_KEY_LAST = 'salary_simulate_last_v1'
const STORAGE_KEY_CACHE = 'salary_simulate_cache_v1'
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 分鐘
const CACHE_MAX_ENTRIES = 20

const buildCacheKey = () => {
  const payload = {
    e: form.employee_id,
    y: form.year,
    m: form.month,
    lc: form.late_count,
    ec: form.early_leave_count,
    mc: form.missing_punch_count,
    lm: form.total_late_minutes,
    em: form.total_early_minutes,
    wd: form.work_days,
    pl: form.extra_personal_leave_hours || 0,
    sl: form.extra_sick_leave_hours || 0,
    en: form.enrollment_override,
    op: form.extra_overtime_pay || 0,
  }
  return JSON.stringify(payload)
}

const readCache = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY_CACHE) || '{}') || {}
  } catch {
    return {}
  }
}

const writeCache = (cache) => {
  try {
    sessionStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(cache))
  } catch {
    /* sessionStorage 滿/不可用時靜默忽略 */
  }
}

const pruneCache = (cache) => {
  const entries = Object.entries(cache)
  const fresh = entries.filter(([, v]) => v && v.ts && Date.now() - v.ts < CACHE_TTL_MS)
  fresh.sort(([, a], [, b]) => b.ts - a.ts)
  return Object.fromEntries(fresh.slice(0, CACHE_MAX_ENTRIES))
}

const runSimulate = async ({ useCache = true } = {}) => {
  if (!form.employee_id) {
    ElMessage.warning('請先選擇員工')
    return
  }

  const cacheKey = buildCacheKey()
  if (useCache) {
    const cache = pruneCache(readCache())
    const hit = cache[cacheKey]
    if (hit && hit.data) {
      result.value = hit.data
      persistLast(hit.data)
      ElMessage.success({ message: '已載入快取結果', duration: 1500 })
      return
    }
  }

  loading.value = true
  result.value = null
  debugResult.value = null
  try {
    const [simRes, dbgRes] = await Promise.all([
      simulateSalary({
        employee_id: form.employee_id,
        year: form.year,
        month: form.month,
        overrides: {
          late_count: form.late_count,
          early_leave_count: form.early_leave_count,
          missing_punch_count: form.missing_punch_count,
          total_late_minutes: form.total_late_minutes,
          total_early_minutes: form.total_early_minutes,
          work_days: form.work_days,
          extra_personal_leave_hours: form.extra_personal_leave_hours || 0,
          extra_sick_leave_hours: form.extra_sick_leave_hours || 0,
          enrollment_override: form.enrollment_override,
          extra_overtime_pay: form.extra_overtime_pay || 0,
        },
      }),
      getEmployeeSalaryDebug({
        employee_id: form.employee_id,
        year: form.year,
        month: form.month,
      }).catch(() => null),
    ])
    result.value = simRes.data
    debugResult.value = dbgRes?.data || null
    persistLast(simRes.data)
    const cache = pruneCache(readCache())
    cache[cacheKey] = { ts: Date.now(), data: simRes.data }
    writeCache(pruneCache(cache))
  } catch (e) {
    ElMessage.error('試算失敗: ' + (e.response?.data?.detail || e.message))
  } finally {
    loading.value = false
  }
}

const persistLast = (data) => {
  try {
    sessionStorage.setItem(
      STORAGE_KEY_LAST,
      JSON.stringify({ form: { ...form }, result: data, ts: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

const restoreLast = () => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_LAST)
    if (!raw) return
    const saved = JSON.parse(raw)
    if (!saved?.form || !saved?.result) return
    if (Date.now() - (saved.ts || 0) > CACHE_TTL_MS) return
    Object.assign(form, saved.form)
    result.value = saved.result
  } catch {
    /* ignore */
  }
}

const resetOverrides = () => {
  form.late_count = null
  form.early_leave_count = null
  form.missing_punch_count = null
  form.total_late_minutes = null
  form.total_early_minutes = null
  form.work_days = null
  form.extra_personal_leave_hours = 0
  form.extra_sick_leave_hours = 0
  form.enrollment_override = null
  form.extra_overtime_pay = 0
  result.value = null
  debugResult.value = null
  try {
    sessionStorage.removeItem(STORAGE_KEY_LAST)
  } catch {
    /* ignore */
  }
}

const hasActual = computed(() => result.value?.actual != null)

const COMPARE_FIELDS = [
  { key: 'base_salary', label: '底薪' },
  { key: 'festival_bonus', label: '節慶獎金' },
  { key: 'overtime_bonus', label: '超額獎金' },
  { key: 'overtime_pay', label: '加班津貼' },
  { key: 'supervisor_dividend', label: '主管紅利' },
  { key: 'meeting_overtime_pay', label: '會議加班' },
  { key: 'birthday_bonus', label: '生日禮金' },
  { key: 'labor_insurance', label: '勞保（扣）' },
  { key: 'health_insurance', label: '健保（扣）' },
  { key: 'pension_self', label: '勞退自提（扣）' },
  { key: 'late_deduction', label: '遲到扣款' },
  { key: 'early_leave_deduction', label: '早退扣款' },
  { key: 'missing_punch_deduction', label: '缺卡扣款' },
  { key: 'leave_deduction', label: '請假扣款' },
  { key: 'absence_deduction', label: '曠職扣款' },
  { key: 'meeting_absence_deduction', label: '節慶獎金扣減' },
  { key: 'gross_salary', label: '應發月薪', bold: true },
  { key: 'total_deductions', label: '總扣款', bold: true },
  { key: 'net_pay', label: '實領薪資', bold: true, highlight: true },
]

const diffColor = (key, val) => {
  if (val === 0) return ''
  // 扣款類：值增加 = 變差（紅），值減少 = 變好（綠）
  const isDeduction = ['total_deductions', 'late_deduction', 'early_leave_deduction',
    'leave_deduction', 'absence_deduction', 'missing_punch_deduction'].includes(key)
  const positive = isDeduction ? val < 0 : val > 0
  return positive ? 'diff-pos' : 'diff-neg'
}

const formatDiff = (val) => {
  if (val === 0) return '-'
  return (val > 0 ? '+' : '') + money(val)
}

onMounted(() => {
  employeeStore.fetchEmployees()
  restoreLast()
})
</script>

<template>
  <div class="simulate-panel">
    <div class="simulate-layout">

      <!-- 左欄：參數設定 -->
      <el-card class="param-card" shadow="never">
        <template #header>
          <span class="card-title">試算參數</span>
          <el-tooltip content="留空的考勤欄位會自動讀取 DB 實際資料，只填寫想覆蓋的部分即可" placement="right">
            <el-icon style="margin-left: 6px; color: var(--el-text-color-secondary); cursor: help;"><QuestionFilled /></el-icon>
          </el-tooltip>
        </template>

        <el-form label-width="100px" size="small" @submit.prevent="runSimulate()">
          <el-form-item label="員工">
            <el-select
              v-model="form.employee_id"
              filterable
              placeholder="選擇員工"
              style="width: 100%"
            >
              <el-option
                v-for="e in employees"
                :key="e.id"
                :label="`${e.name}（${e.title || e.job_title || '-'}）`"
                :value="e.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="年 / 月">
            <div class="year-month-row">
              <el-select v-model="form.year" style="width: 95px">
                <el-option v-for="y in 5" :key="y" :label="(currentYear - 2 + y) + ' 年'" :value="currentYear - 2 + y" />
              </el-select>
              <el-select v-model="form.month" style="width: 75px">
                <el-option v-for="m in 12" :key="m" :label="m + ' 月'" :value="m" />
              </el-select>
            </div>
          </el-form-item>

          <el-divider content-position="left">
            <span class="section-label">考勤覆蓋</span>
            <span class="hint">留空 = 使用實際資料</span>
          </el-divider>

          <el-form-item label="出勤天數">
            <el-input-number v-model="form.work_days" :min="0" :max="31" :precision="0" controls-position="right" placeholder="自動" style="width: 100%" />
          </el-form-item>
          <el-form-item label="遲到次數">
            <el-input-number v-model="form.late_count" :min="0" :max="31" :precision="0" controls-position="right" placeholder="自動" style="width: 100%" />
          </el-form-item>
          <el-form-item label="遲到分鐘">
            <el-input-number v-model="form.total_late_minutes" :min="0" controls-position="right" placeholder="自動" style="width: 100%" />
          </el-form-item>
          <el-form-item label="早退次數">
            <el-input-number v-model="form.early_leave_count" :min="0" :max="31" :precision="0" controls-position="right" placeholder="自動" style="width: 100%" />
          </el-form-item>
          <el-form-item label="早退分鐘">
            <el-input-number v-model="form.total_early_minutes" :min="0" controls-position="right" placeholder="自動" style="width: 100%" />
          </el-form-item>
          <el-form-item label="缺卡次數">
            <el-input-number v-model="form.missing_punch_count" :min="0" :max="31" :precision="0" controls-position="right" placeholder="自動" style="width: 100%" />
          </el-form-item>

          <el-divider content-position="left">
            <span class="section-label">額外請假</span>
            <span class="hint">疊加於 DB 現有</span>
          </el-divider>

          <el-form-item label="事假時數">
            <el-input-number v-model="form.extra_personal_leave_hours" :min="0" :step="1" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="病假時數">
            <el-input-number v-model="form.extra_sick_leave_hours" :min="0" :step="1" controls-position="right" style="width: 100%" />
          </el-form-item>

          <el-divider content-position="left">
            <span class="section-label">獎金調整</span>
          </el-divider>

          <el-form-item label="在籍人數">
            <el-input-number v-model="form.enrollment_override" :min="0" controls-position="right" placeholder="使用 DB 資料" style="width: 100%" />
          </el-form-item>
          <el-form-item label="加班費追加">
            <el-input-number v-model="form.extra_overtime_pay" :min="0" :step="100" controls-position="right" style="width: 100%" />
          </el-form-item>

          <div class="form-actions">
            <el-button type="primary" native-type="submit" :loading="loading" style="flex: 1">
              開始試算
            </el-button>
            <el-tooltip content="忽略快取、強制重新計算" placement="top">
              <el-button :disabled="loading" @click="runSimulate({ useCache: false })">
                重算
              </el-button>
            </el-tooltip>
            <el-button @click="resetOverrides">重置</el-button>
          </div>
        </el-form>
      </el-card>

      <!-- 右欄：結果 -->
      <div class="result-area">
        <el-empty
          v-if="!result && !loading"
          description="設定左側參數後點擊「開始試算」"
          :image-size="80"
          style="padding-top: 60px"
        />

        <div v-if="loading" v-loading="true" style="min-height: 200px;" />

        <template v-if="result && !loading">
          <!-- 員工 & 月份資訊列 -->
          <el-card class="info-bar" shadow="never" body-style="padding: 12px 16px;">
            <div class="info-row">
              <span class="emp-name">{{ result.employee.name }}</span>
              <el-tag size="small" type="">{{ result.employee.job_title }}</el-tag>
              <span class="period-text">{{ result.period.year }} 年 {{ result.period.month }} 月</span>
              <el-tag v-if="result.overrides_active.length" size="small" type="warning">
                已覆蓋 {{ result.overrides_active.length }} 項參數
              </el-tag>
              <el-tag v-if="!hasActual" size="small" type="info">尚無實際薪資記錄</el-tag>
              <el-tag v-else size="small" type="success">已與實際記錄對比</el-tag>
            </div>
          </el-card>

          <!-- 三大金額卡 -->
          <el-row :gutter="12" style="margin-top: 12px;">
            <el-col :span="8">
              <el-card class="summary-card" shadow="never" body-style="padding: 14px; text-align: center;">
                <div class="sum-label">應發月薪（試算）</div>
                <div class="sum-value text-blue">{{ money(result.simulated.gross_salary) }}</div>
                <div
                  v-if="hasActual && result.diff.gross_salary !== 0"
                  class="sum-diff"
                  :class="diffColor('gross_salary', result.diff.gross_salary)"
                >
                  {{ formatDiff(result.diff.gross_salary) }}
                </div>
              </el-card>
            </el-col>
            <el-col :span="8">
              <el-card class="summary-card" shadow="never" body-style="padding: 14px; text-align: center;">
                <div class="sum-label">總扣款（試算）</div>
                <div class="sum-value text-danger">{{ money(result.simulated.total_deductions) }}</div>
                <div
                  v-if="hasActual && result.diff.total_deductions !== 0"
                  class="sum-diff"
                  :class="diffColor('total_deductions', result.diff.total_deductions)"
                >
                  {{ formatDiff(result.diff.total_deductions) }}
                </div>
              </el-card>
            </el-col>
            <el-col :span="8">
              <el-card class="summary-card net-card" shadow="never" body-style="padding: 14px; text-align: center;">
                <div class="sum-label">實領薪資（試算）</div>
                <div class="sum-value text-green">{{ money(result.simulated.net_pay) }}</div>
                <div
                  v-if="hasActual && result.diff.net_pay !== 0"
                  class="sum-diff"
                  :class="diffColor('net_pay', result.diff.net_pay)"
                >
                  {{ formatDiff(result.diff.net_pay) }}
                </div>
              </el-card>
            </el-col>
          </el-row>

          <!-- 明細對照表 -->
          <el-card shadow="never" style="margin-top: 12px;">
            <template #header>
              <span>明細對照</span>
              <span v-if="hasActual" class="table-hint">差異 = 試算 − 實際（綠色有利、紅色不利）</span>
            </template>
            <el-table :data="COMPARE_FIELDS" border size="small" :show-header="true">
              <el-table-column label="項目" width="140">
                <template #default="{ row }">
                  <strong v-if="row.bold">{{ row.label }}</strong>
                  <span v-else>{{ row.label }}</span>
                </template>
              </el-table-column>

              <el-table-column label="試算結果" min-width="120">
                <template #default="{ row }">
                  <strong v-if="row.highlight" class="text-green">
                    {{ money(result.simulated[row.key] || 0) }}
                  </strong>
                  <strong v-else-if="row.bold">{{ money(result.simulated[row.key] || 0) }}</strong>
                  <span v-else>{{ money(result.simulated[row.key] || 0) }}</span>
                </template>
              </el-table-column>

              <el-table-column v-if="hasActual" label="實際記錄" min-width="120">
                <template #default="{ row }">
                  <strong v-if="row.highlight" class="text-blue">
                    {{ money(result.actual[row.key] || 0) }}
                  </strong>
                  <strong v-else-if="row.bold">{{ money(result.actual[row.key] || 0) }}</strong>
                  <span v-else>{{ money(result.actual[row.key] || 0) }}</span>
                </template>
              </el-table-column>

              <el-table-column v-if="hasActual" label="差異" width="110">
                <template #default="{ row }">
                  <span
                    v-if="result.diff && row.key in result.diff && result.diff[row.key] !== 0"
                    :class="diffColor(row.key, result.diff[row.key])"
                    class="diff-val"
                  >
                    {{ formatDiff(result.diff[row.key]) }}
                  </span>
                  <span v-else class="text-muted">-</span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <!-- 考勤統計 -->
          <el-card shadow="never" style="margin-top: 12px;">
            <template #header><span>考勤統計（試算輸入值）</span></template>
            <el-descriptions :column="3" border size="small">
              <el-descriptions-item label="出勤天數">{{ result.simulated.late_count !== undefined ? form.work_days ?? '自動' : '-' }}</el-descriptions-item>
              <el-descriptions-item label="遲到次數">{{ result.simulated.late_count }}</el-descriptions-item>
              <el-descriptions-item label="早退次數">{{ result.simulated.early_leave_count }}</el-descriptions-item>
              <el-descriptions-item label="缺卡次數">{{ result.simulated.missing_punch_count }}</el-descriptions-item>
              <el-descriptions-item label="遲到扣款">
                <span class="text-danger">{{ money(result.simulated.late_deduction) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="早退扣款">
                <span class="text-danger">{{ money(result.simulated.early_leave_deduction) }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 詳細診斷（由 /api/salaries/employee-salary-debug 提供，使用 DB 實際資料，不套用試算 override） -->
          <template v-if="debugResult">
            <el-divider content-position="left">
              <span class="section-label">詳細診斷（DB 實際資料）</span>
            </el-divider>

            <!-- 員工基本資料 -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>員工資料</strong></template>
              <el-descriptions :column="3" border size="small">
                <el-descriptions-item label="姓名">{{ debugResult.employee.name }}</el-descriptions-item>
                <el-descriptions-item label="工號">{{ debugResult.employee.employee_id }}</el-descriptions-item>
                <el-descriptions-item label="職稱">{{ debugResult.employee.title }}</el-descriptions-item>
                <el-descriptions-item label="職位">{{ debugResult.employee.position }}</el-descriptions-item>
                <el-descriptions-item label="主管職">{{ debugResult.employee.supervisor_role || '-' }}</el-descriptions-item>
                <el-descriptions-item label="底薪">{{ debugResult.employee.base_salary?.toLocaleString() }}</el-descriptions-item>
                <el-descriptions-item label="到職日">{{ debugResult.employee.hire_date }}</el-descriptions-item>
                <el-descriptions-item label="投保薪資">{{ debugResult.employee.insurance_salary_level?.toLocaleString() }}</el-descriptions-item>
                <el-descriptions-item label="眷屬數">{{ debugResult.employee.dependents }}</el-descriptions-item>
              </el-descriptions>
            </el-card>

            <!-- DB 出勤統計（含未打卡上/下、遲到明細） -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>出勤統計（DB）</strong></template>
              <el-descriptions :column="3" border size="small">
                <el-descriptions-item label="出勤記錄數">{{ debugResult.attendance_summary.total_records }}</el-descriptions-item>
                <el-descriptions-item label="遲到次數">{{ debugResult.attendance_summary.late_count }}</el-descriptions-item>
                <el-descriptions-item label="早退次數">{{ debugResult.attendance_summary.early_leave_count }}</el-descriptions-item>
                <el-descriptions-item label="遲到總分鐘">{{ debugResult.attendance_summary.total_late_minutes }}</el-descriptions-item>
                <el-descriptions-item label="早退總分鐘">{{ debugResult.attendance_summary.total_early_minutes }}</el-descriptions-item>
                <el-descriptions-item label="未打卡(上)">{{ debugResult.attendance_summary.missing_punch_in }}</el-descriptions-item>
                <el-descriptions-item label="未打卡(下)">{{ debugResult.attendance_summary.missing_punch_out }}</el-descriptions-item>
              </el-descriptions>
              <div v-if="debugResult.attendance_summary.late_details?.length" style="margin-top: 12px;">
                <strong>遲到明細 (分鐘):</strong>
                <el-tag
                  v-for="(m, i) in debugResult.attendance_summary.late_details"
                  :key="i"
                  size="small"
                  :type="m >= 120 ? 'danger' : 'warning'"
                  style="margin-left: 4px;"
                >
                  {{ m }}分
                </el-tag>
              </div>
            </el-card>

            <!-- 扣款逐筆 -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>考勤扣款計算</strong></template>
              <el-descriptions :column="2" border size="small">
                <el-descriptions-item label="日薪">{{ debugResult.deduction_calc.daily_salary }}</el-descriptions-item>
                <el-descriptions-item label="每分鐘費率">{{ debugResult.deduction_calc.per_minute_rate }}</el-descriptions-item>
                <el-descriptions-item label="遲到扣款">{{ debugResult.deduction_calc.late_deduction }}</el-descriptions-item>
                <el-descriptions-item label="早退扣款">{{ debugResult.deduction_calc.early_leave_deduction }}</el-descriptions-item>
              </el-descriptions>
              <div v-if="debugResult.deduction_calc.late_deduction_detail?.length" style="margin-top: 12px;">
                <strong>遲到扣款逐筆:</strong>
                <el-table :data="debugResult.deduction_calc.late_deduction_detail" border size="small" style="margin-top: 8px">
                  <el-table-column prop="minutes" label="分鐘" width="80" />
                  <el-table-column prop="type" label="類型" width="160" />
                  <el-table-column prop="deduction" label="扣款" width="100" />
                </el-table>
              </div>
            </el-card>

            <!-- 請假明細 -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>請假扣款（合計: {{ debugResult.leave_deduction_total }}）</strong></template>
              <el-table v-if="debugResult.leave_breakdown?.length" :data="debugResult.leave_breakdown" border size="small">
                <el-table-column prop="type" label="假別" width="100" />
                <el-table-column prop="start" label="開始" width="120" />
                <el-table-column prop="end" label="結束" width="120" />
                <el-table-column prop="hours" label="時數" width="80" />
                <el-table-column prop="ratio" label="扣薪比例" width="100" />
                <el-table-column prop="deduction" label="扣款" width="100" />
              </el-table>
              <el-empty v-else description="無請假記錄" />
            </el-card>

            <!-- 節慶獎金計算 -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>節慶獎金計算</strong></template>
              <template v-if="Object.keys(debugResult.festival_bonus_detail || {}).length">
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
                    <strong style="font-size: 16px; color: var(--el-color-primary);">
                      ${{ (debugResult.festival_bonus_detail.result || 0).toLocaleString() }}
                    </strong>
                  </el-descriptions-item>
                  <el-descriptions-item label="發放月份">
                    <el-tag :type="[2,6,9,12].includes(form.month) ? 'success' : 'info'" size="small">
                      {{ [2,6,9,12].includes(form.month) ? '本月發放' : '非發放月（2/6/9/12月發放）' }}
                    </el-tag>
                  </el-descriptions-item>
                </el-descriptions>
              </template>
              <el-empty v-else description="無節慶獎金" />
            </el-card>

            <!-- 園務會議 -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>園務會議</strong></template>
              <el-descriptions :column="2" border size="small">
                <el-descriptions-item label="出席">{{ debugResult.meeting.attended }} 次</el-descriptions-item>
                <el-descriptions-item label="缺席">{{ debugResult.meeting.absent }} 次</el-descriptions-item>
                <el-descriptions-item label="每次加班費">{{ debugResult.meeting.overtime_pay_per_session }}</el-descriptions-item>
                <el-descriptions-item label="每次缺席罰款">{{ debugResult.meeting.absence_penalty_per_session }}</el-descriptions-item>
              </el-descriptions>
            </el-card>

            <!-- 勞健保明細 -->
            <el-card shadow="never" style="margin-top: 12px;">
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
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>其他</strong></template>
              <el-descriptions :column="2" border size="small">
                <el-descriptions-item label="加班費">{{ debugResult.overtime_pay }}</el-descriptions-item>
                <el-descriptions-item label="主管紅利">{{ debugResult.supervisor_dividend }}</el-descriptions-item>
              </el-descriptions>
            </el-card>

            <!-- Raw JSON -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>完整 JSON (可複製)</strong></template>
              <pre class="json-block raw-json">{{ formatJson(debugResult) }}</pre>
            </el-card>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.simulate-panel {
  padding-top: 12px;
}

.simulate-layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 16px;
  align-items: start;
}

.param-card :deep(.el-card__body) {
  padding: 16px;
}

.card-title {
  font-weight: 600;
}

.year-month-row {
  display: flex;
  gap: 8px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
}

.hint {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-left: 6px;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.info-bar {
  margin-bottom: 0;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.emp-name {
  font-size: 15px;
  font-weight: 700;
}

.period-text {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.sum-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.sum-value {
  font-size: 20px;
  font-weight: 700;
}

.sum-diff {
  font-size: 12px;
  margin-top: 4px;
  font-weight: 600;
}

.net-card {
  border: 1.5px solid var(--el-color-success-light-5);
}

.table-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 8px;
}

.diff-val {
  font-weight: 600;
}

.diff-pos { color: var(--el-color-success); }
.diff-neg { color: var(--el-color-danger); }

.text-blue { color: #409EFF; }
.text-green { color: var(--el-color-success); }
.text-danger { color: var(--el-color-danger); }
.text-muted { color: var(--el-text-color-placeholder); }

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
</style>
