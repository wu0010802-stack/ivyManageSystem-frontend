<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { simulateSalary, getEmployeeSalaryDebug } from '@/api/salary'
import { friendlyError } from '@/utils/errorMessages'
import { useEmployeeStore } from '@/stores/employee'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { money } from '@/utils/format'

interface EmployeeOption { id: number; name: string; title?: string; job_title?: string; is_active?: boolean; employee_type?: string }

interface SimRow {
  base_salary?: number
  festival_bonus?: number
  overtime_bonus?: number
  overtime_pay?: number
  supervisor_dividend?: number
  meeting_overtime_pay?: number
  birthday_bonus?: number
  labor_insurance?: number
  health_insurance?: number
  supplementary_health_employee?: number
  pension_self?: number
  late_deduction?: number
  early_leave_deduction?: number
  leave_deduction?: number
  absence_deduction?: number
  meeting_absence_deduction?: number
  gross_salary?: number
  total_deductions?: number
  net_pay?: number
  total_with_bonus?: number
  late_count?: number
  early_leave_count?: number
  [key: string]: number | undefined
}

const employeeStore = useEmployeeStore()
const employees = computed(() =>
  (employeeStore.employees as EmployeeOption[]).filter(e => e.is_active && e.employee_type !== 'hourly')
)
const loading = ref(false)
const result = ref<Record<string, unknown> | null>(null)
const debugResult = ref<Record<string, unknown> | null>(null)

const formatJson = (obj: unknown) => JSON.stringify(obj, null, 2)

const currentYear = new Date().getFullYear()
const currentMonth = new Date().getMonth() + 1

const form = reactive({
  employee_id: null,
  year: currentYear,
  month: currentMonth,
  late_count: null,
  early_leave_count: null,
  // missing_punch_count 已從表單移除：deduction.py:71 的 missing_punch_deduction
  // 永遠是 0，調整缺卡次數不影響任何計算結果（會誤導用戶以為有效）。
  total_late_minutes: null,
  total_early_minutes: null,
  // work_days 已移除：它只流向 AttendanceResult.total_days/normal_days，
  // 而那兩個欄位全 codebase 無 reader，改它對任何金額都沒有影響
  // （見 backend tests/test_salary_simulate_work_days_noop_2026_07_28.py）。
  extra_personal_leave_hours: 0,
  extra_sick_leave_hours: 0,
  enrollment_override: null,
  extra_overtime_pay: 0,
})

// ── 試算結果快取（sessionStorage）──────────────────────────────────────
// 避免重新整理頁面或切換 tab 時丟失上一次試算結果；
// 也能讓相同參數不再打 API（省 rate-limit + 後端 CPU）。
// v2: 移除 missing_punch_count 欄位（deprecated）
const STORAGE_KEY_LAST = 'salary_simulate_last_v2'
const STORAGE_KEY_CACHE = 'salary_simulate_cache_v2'
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 分鐘
const CACHE_MAX_ENTRIES = 20

const buildCacheKey = () => {
  const payload = {
    e: form.employee_id,
    y: form.year,
    m: form.month,
    lc: form.late_count,
    ec: form.early_leave_count,
    lm: form.total_late_minutes,
    em: form.total_early_minutes,
    pl: form.extra_personal_leave_hours || 0,
    sl: form.extra_sick_leave_hours || 0,
    en: form.enrollment_override,
    op: form.extra_overtime_pay || 0,
  }
  return JSON.stringify(payload)
}

const readCache = (): Record<string, { ts: number; data: unknown }> => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY_CACHE) || '{}') || {}
  } catch {
    return {}
  }
}

const writeCache = (cache: Record<string, { ts: number; data: unknown }>) => {
  try {
    sessionStorage.setItem(STORAGE_KEY_CACHE, JSON.stringify(cache))
  } catch {
    /* sessionStorage 滿/不可用時靜默忽略 */
  }
}

const pruneCache = (cache: Record<string, { ts: number; data: unknown }>) => {
  const entries = Object.entries(cache)
  const fresh = entries.filter(([, v]) => v && v.ts && Date.now() - v.ts < CACHE_TTL_MS)
  fresh.sort(([, a], [, b]) => b.ts - a.ts)
  return Object.fromEntries(fresh.slice(0, CACHE_MAX_ENTRIES))
}

const runSimulate = async ({ useCache = true }: { useCache?: boolean } = {}) => {
  if (!form.employee_id) {
    ElMessage.warning('請先選擇員工')
    return
  }

  const cacheKey = buildCacheKey()
  if (useCache) {
    const cache = pruneCache(readCache())
    const hit = cache[cacheKey]
    if (hit && hit.data) {
      result.value = hit.data as Record<string, unknown>
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
          total_late_minutes: form.total_late_minutes,
          total_early_minutes: form.total_early_minutes,
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
    result.value = simRes.data as Record<string, unknown>
    debugResult.value = (dbgRes as { data?: unknown } | null)?.data as Record<string, unknown> || null
    persistLast(simRes.data)
    const cache = pruneCache(readCache())
    cache[cacheKey] = { ts: Date.now(), data: simRes.data }
    writeCache(pruneCache(cache))
  } catch (e) {
    // 錯誤訊息一律讀攔截器正規化後的 displayMessage（src/api/index.ts），
    // 不再自己解析 response.data.detail——detail 在後端 500 envelope 下是物件
    // （{code,message,request_id}），直接字串串接會顯示 [object Object]。
    ElMessage.error(friendlyError('試算失敗', e))
  } finally {
    loading.value = false
  }
}

const persistLast = (data: unknown) => {
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
  form.total_late_minutes = null
  form.total_early_minutes = null
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

// 「試算淨薪＋獨立獎金」= net_pay + festival_bonus + overtime_bonus。
// net_salary 的公式 = gross_salary - 扣款，而 gross_salary 不含 festival_bonus /
// overtime_bonus（engine.py:1764-1770），所以員工在發放月實際拿到的總額 = net_pay
// + festival + overtime（festival/overtime 走獨立轉帳名冊）。simulate 沒有 persisted
// unused_leave_payout，因此只能顯示「不含未休折現」的比較值，不宣稱是最終到手。
const computeTotalWithBonus = (obj: SimRow | undefined | null): number => {
  if (!obj) return 0
  return (obj.net_pay || 0) + (obj.festival_bonus || 0) + (obj.overtime_bonus || 0)
}

const augmentedSimulated = computed<SimRow | null>(() => {
  if (!result.value) return null
  return {
    ...(result.value.simulated as SimRow),
    total_with_bonus: computeTotalWithBonus(result.value.simulated as SimRow),
  }
})

const augmentedActual = computed<SimRow | null>(() => {
  if (!result.value?.actual) return null
  return {
    ...(result.value.actual as SimRow),
    total_with_bonus: computeTotalWithBonus(result.value.actual as SimRow),
  }
})

const augmentedDiff = computed<SimRow | null>(() => {
  if (!result.value?.diff) return null
  return {
    ...(result.value.diff as SimRow),
    total_with_bonus:
      computeTotalWithBonus(result.value.simulated as SimRow) -
      computeTotalWithBonus(result.value.actual as SimRow),
  }
})

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
  { key: 'supplementary_health_employee', label: '二代健保補充保費' },
  { key: 'pension_self', label: '勞退自提（扣）' },
  { key: 'late_deduction', label: '遲到扣款' },
  { key: 'early_leave_deduction', label: '早退扣款' },
  { key: 'leave_deduction', label: '請假扣款' },
  { key: 'absence_deduction', label: '曠職扣款' },
  { key: 'meeting_absence_deduction', label: '節慶獎金扣減' },
  { key: 'gross_salary', label: '應發月薪', bold: true },
  { key: 'total_deductions', label: '總扣款', bold: true },
  { key: 'net_pay', label: '實領薪資（主帳戶）', bold: true },
  { key: 'total_with_bonus', label: '含獎金實領', bold: true, highlight: true },
]

// 扣款類欄位集合：對員工而言「扣更多（差異 > 0）」= 變差（紅）、「扣更少」= 變好（綠）。
// 必須涵蓋 COMPARE_FIELDS 中所有扣款欄——含勞健保、二代健保補充保費、勞退自提、會議缺席
// 扣款；早期只列 total_deductions/遲到/早退/請假/曠職，漏掉的保險/勞退/節慶扣減欄會被當成
// 收入類（增加上綠、減少上紅），色碼與實際好壞相反，HR 對照談薪時易誤讀。
const DEDUCTION_KEYS = new Set<string>([
  'total_deductions',
  'labor_insurance',
  'health_insurance',
  'supplementary_health_employee',
  'pension_self',
  'late_deduction',
  'early_leave_deduction',
  'leave_deduction',
  'absence_deduction',
  'meeting_absence_deduction',
])

const diffColor = (key: string, val: number) => {
  if (val === 0) return ''
  // 扣款類：值增加 = 變差（紅），值減少 = 變好（綠）；收入類則相反。
  const isDeduction = DEDUCTION_KEYS.has(key)
  const positive = isDeduction ? val < 0 : val > 0
  return positive ? 'diff-pos' : 'diff-neg'
}

const formatDiff = (val: number) => {
  if (val === 0) return '-'
  return (val > 0 ? '+' : '') + money(val)
}

// Template helpers for typed access to result sub-objects
const resultEmployee = computed(() => (result.value?.employee as { name?: string; job_title?: string }) || {})
const resultPeriod = computed(() => (result.value?.period as { year?: number; month?: number }) || {})
const resultOverridesActive = computed(() => (result.value?.overrides_active as unknown[]) || [])

// Typed debug result sub-objects for template
const dbgEmployee = computed(() => (debugResult.value?.employee as Record<string, unknown>) || {})
const dbgAttendance = computed(() => (debugResult.value?.attendance_summary as Record<string, unknown>) || {})
const dbgDeductionCalc = computed(() => (debugResult.value?.deduction_calc as Record<string, unknown>) || {})
const dbgLeaveBreakdown = computed(() => (debugResult.value?.leave_breakdown as Record<string, unknown>[]) || [])
const dbgFestivalBonus = computed(() => (debugResult.value?.festival_bonus_detail as Record<string, unknown>) || {})
const dbgMeeting = computed(() => (debugResult.value?.meeting as Record<string, unknown>) || {})
const dbgInsurance = computed(() => (debugResult.value?.insurance as Record<string, unknown>) || {})
const dbgLeaveDeductionTotal = computed(() => debugResult.value?.leave_deduction_total)
const dbgOvertimePay = computed(() => debugResult.value?.overtime_pay)
const dbgSupervisorDividend = computed(() => debugResult.value?.supervisor_dividend)

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
            <el-tag size="small" type="info" effect="plain" round style="margin-left: 6px;">
              留空 = 自動帶入 DB
            </el-tag>
          </el-divider>

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

          <el-divider content-position="left">
            <span class="section-label">額外請假</span>
            <el-tag size="small" type="warning" effect="plain" round style="margin-left: 6px;">
              + 疊加於 DB 現有
            </el-tag>
          </el-divider>

          <el-form-item label="+ 事假時數">
            <el-input-number v-model="form.extra_personal_leave_hours" :min="0" :step="1" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="+ 病假時數">
            <el-input-number v-model="form.extra_sick_leave_hours" :min="0" :step="1" controls-position="right" style="width: 100%" />
          </el-form-item>

          <el-divider content-position="left">
            <span class="section-label">獎金調整</span>
          </el-divider>

          <el-form-item label="在籍人數">
            <template #label>
              <span>在籍人數</span>
              <el-tag size="small" type="info" effect="plain" round style="margin-left: 4px; transform: scale(0.85);">覆蓋</el-tag>
            </template>
            <el-input-number v-model="form.enrollment_override" :min="0" controls-position="right" placeholder="使用 DB 資料" style="width: 100%" />
          </el-form-item>
          <el-form-item>
            <template #label>
              <span>加班費追加</span>
              <el-tag size="small" type="warning" effect="plain" round style="margin-left: 4px; transform: scale(0.85);">+ 疊加</el-tag>
            </template>
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
              <span class="emp-name">{{ resultEmployee.name }}</span>
              <el-tag size="small">{{ resultEmployee.job_title }}</el-tag>
              <span class="period-text">{{ resultPeriod.year }} 年 {{ resultPeriod.month }} 月</span>
              <el-tag v-if="resultOverridesActive.length" size="small" type="warning">
                已覆蓋 {{ resultOverridesActive.length }} 項參數
              </el-tag>
              <el-tag v-if="!hasActual" size="small" type="info">尚無實際薪資記錄</el-tag>
              <el-tag v-else size="small" type="success">已與實際記錄對比</el-tag>
            </div>
          </el-card>

          <!-- 實際記錄可能含人工調整，差異不全來自引擎邏輯 -->
          <el-alert
            v-if="hasActual"
            type="info"
            :closable="false"
            show-icon
            style="margin-top: 12px;"
          >
            <template #title>
              <span style="font-size: 12px;">
                「實際記錄」可能包含薪資管理頁的人工調整（如手改節慶獎金、扣款備註等）。
                若某欄位「差異」不為零，可能來自引擎以外的人工輸入，並非試算錯誤。
              </span>
            </template>
          </el-alert>

          <!-- 事/病假 > 40h 清零獎金的 cliff 觸發提示 -->
          <!-- 三大金額卡：應發 / 扣款 / 試算淨薪＋獨立獎金（不含未休折現） -->
          <el-row :gutter="12" style="margin-top: 12px;">
            <el-col :span="8">
              <el-card class="summary-card" shadow="never" body-style="padding: 14px; text-align: center;">
                <div class="sum-label">應發月薪（試算）</div>
                <div class="sum-value text-blue">{{ money(augmentedSimulated?.gross_salary) }}</div>
                <div
                  v-if="hasActual && augmentedDiff?.gross_salary !== 0"
                  class="sum-diff"
                  :class="diffColor('gross_salary', augmentedDiff?.gross_salary ?? 0)"
                >
                  {{ formatDiff(augmentedDiff?.gross_salary ?? 0) }}
                </div>
              </el-card>
            </el-col>
            <el-col :span="8">
              <el-card class="summary-card" shadow="never" body-style="padding: 14px; text-align: center;">
                <div class="sum-label">總扣款（試算）</div>
                <div class="sum-value text-danger">{{ money(augmentedSimulated?.total_deductions) }}</div>
                <div
                  v-if="hasActual && augmentedDiff?.total_deductions !== 0"
                  class="sum-diff"
                  :class="diffColor('total_deductions', augmentedDiff?.total_deductions ?? 0)"
                >
                  {{ formatDiff(augmentedDiff?.total_deductions ?? 0) }}
                </div>
              </el-card>
            </el-col>
            <el-col :span="8">
              <el-card class="summary-card net-card" shadow="never" body-style="padding: 14px; text-align: center;">
                <el-tooltip
                  content="試算淨薪 + 節慶獎金 + 超額獎金；未休折現只存在已結算記錄，本試算不含未休折現"
                  placement="top"
                >
                  <div class="sum-label">試算淨薪＋獨立獎金（不含未休折現）</div>
                </el-tooltip>
                <div class="sum-value text-green">{{ money(augmentedSimulated?.total_with_bonus) }}</div>
                <div
                  v-if="hasActual && augmentedDiff?.total_with_bonus !== 0"
                  class="sum-diff"
                  :class="diffColor('total_with_bonus', augmentedDiff?.total_with_bonus ?? 0)"
                >
                  {{ formatDiff(augmentedDiff?.total_with_bonus ?? 0) }}
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
                    {{ money(augmentedSimulated?.[row.key] || 0) }}
                  </strong>
                  <strong v-else-if="row.bold">{{ money(augmentedSimulated?.[row.key] || 0) }}</strong>
                  <span v-else>{{ money(augmentedSimulated?.[row.key] || 0) }}</span>
                </template>
              </el-table-column>

              <el-table-column v-if="hasActual" label="實際記錄" min-width="120">
                <template #default="{ row }">
                  <strong v-if="row.highlight" class="text-blue">
                    {{ money(augmentedActual?.[row.key] || 0) }}
                  </strong>
                  <strong v-else-if="row.bold">{{ money(augmentedActual?.[row.key] || 0) }}</strong>
                  <span v-else>{{ money(augmentedActual?.[row.key] || 0) }}</span>
                </template>
              </el-table-column>

              <el-table-column v-if="hasActual" label="差異" width="110">
                <template #default="{ row }">
                  <span
                    v-if="augmentedDiff && row.key in augmentedDiff && augmentedDiff[row.key] !== 0"
                    :class="diffColor(row.key, augmentedDiff[row.key] ?? 0)"
                    class="diff-val"
                  >
                    {{ formatDiff(augmentedDiff[row.key] ?? 0) }}
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
              <el-descriptions-item label="遲到次數">{{ augmentedSimulated?.late_count }}</el-descriptions-item>
              <el-descriptions-item label="早退次數">{{ augmentedSimulated?.early_leave_count }}</el-descriptions-item>
              <el-descriptions-item label="遲到扣款">
                <span class="text-danger">{{ money(augmentedSimulated?.late_deduction) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="早退扣款">
                <span class="text-danger">{{ money(augmentedSimulated?.early_leave_deduction) }}</span>
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
                <el-descriptions-item label="姓名">{{ dbgEmployee.name }}</el-descriptions-item>
                <el-descriptions-item label="工號">{{ dbgEmployee.employee_id }}</el-descriptions-item>
                <el-descriptions-item label="職稱">{{ dbgEmployee.title }}</el-descriptions-item>
                <el-descriptions-item label="園內職務">{{ dbgEmployee.position }}</el-descriptions-item>
                <el-descriptions-item label="主管職">{{ dbgEmployee.supervisor_role || '-' }}</el-descriptions-item>
                <el-descriptions-item label="底薪">{{ (dbgEmployee.base_salary as number | undefined)?.toLocaleString() }}</el-descriptions-item>
                <el-descriptions-item label="到職日">{{ dbgEmployee.hire_date }}</el-descriptions-item>
                <el-descriptions-item label="投保薪資">{{ (dbgEmployee.insurance_salary_level as number | undefined)?.toLocaleString() }}</el-descriptions-item>
                <el-descriptions-item label="眷屬數">{{ dbgEmployee.dependents }}</el-descriptions-item>
              </el-descriptions>
            </el-card>

            <!-- DB 出勤統計（含未打卡上/下、遲到明細） -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>出勤統計（DB）</strong></template>
              <el-descriptions :column="3" border size="small">
                <el-descriptions-item label="出勤記錄數">{{ dbgAttendance.total_records }}</el-descriptions-item>
                <el-descriptions-item label="遲到次數">{{ dbgAttendance.late_count }}</el-descriptions-item>
                <el-descriptions-item label="早退次數">{{ dbgAttendance.early_leave_count }}</el-descriptions-item>
                <el-descriptions-item label="遲到總分鐘">{{ dbgAttendance.total_late_minutes }}</el-descriptions-item>
                <el-descriptions-item label="早退總分鐘">{{ dbgAttendance.total_early_minutes }}</el-descriptions-item>
                <el-descriptions-item label="未打卡(上)">{{ dbgAttendance.missing_punch_in }}</el-descriptions-item>
                <el-descriptions-item label="未打卡(下)">{{ dbgAttendance.missing_punch_out }}</el-descriptions-item>
              </el-descriptions>
              <div v-if="(dbgAttendance.late_details as unknown[] | undefined)?.length" style="margin-top: 12px;">
                <strong>遲到明細 (分鐘):</strong>
                <el-tag
                  v-for="(m, i) in (dbgAttendance.late_details as number[])"
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
                <el-descriptions-item label="日薪">{{ dbgDeductionCalc.daily_salary }}</el-descriptions-item>
                <el-descriptions-item label="每分鐘費率">{{ dbgDeductionCalc.per_minute_rate }}</el-descriptions-item>
                <el-descriptions-item label="遲到扣款">{{ dbgDeductionCalc.late_deduction }}</el-descriptions-item>
                <el-descriptions-item label="早退扣款">{{ dbgDeductionCalc.early_leave_deduction }}</el-descriptions-item>
              </el-descriptions>
              <div v-if="(dbgDeductionCalc.late_deduction_detail as unknown[] | undefined)?.length" style="margin-top: 12px;">
                <strong>遲到扣款逐筆:</strong>
                <el-table :data="dbgDeductionCalc.late_deduction_detail as Record<string, unknown>[]" border size="small" style="margin-top: 8px">
                  <el-table-column prop="minutes" label="分鐘" width="80" />
                  <el-table-column prop="type" label="類型" width="160" />
                  <el-table-column prop="deduction" label="扣款" width="100" />
                </el-table>
              </div>
            </el-card>

            <!-- 請假明細 -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>請假扣款（合計: {{ dbgLeaveDeductionTotal }}）</strong></template>
              <el-table v-if="dbgLeaveBreakdown.length" :data="dbgLeaveBreakdown" border size="small">
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
              <template v-if="Object.keys(dbgFestivalBonus).length">
                <el-descriptions :column="3" border size="small">
                  <el-descriptions-item label="類別">{{ dbgFestivalBonus.category || '-' }}</el-descriptions-item>
                  <el-descriptions-item label="獎金基數">{{ (dbgFestivalBonus.base as number | undefined)?.toLocaleString() || 0 }}</el-descriptions-item>
                  <el-descriptions-item label="在籍人數">{{ dbgFestivalBonus.enrollment || 0 }}</el-descriptions-item>
                  <el-descriptions-item label="目標人數">{{ dbgFestivalBonus.target || 0 }}</el-descriptions-item>
                  <el-descriptions-item label="達成率">{{ dbgFestivalBonus.ratio ? ((dbgFestivalBonus.ratio as number) * 100).toFixed(1) + '%' : '0%' }}</el-descriptions-item>
                  <el-descriptions-item label="符合資格">
                    <el-tag :type="dbgFestivalBonus.eligible ? 'success' : 'danger'" size="small">
                      {{ dbgFestivalBonus.eligible ? '是' : '否' }}
                    </el-tag>
                  </el-descriptions-item>
                  <el-descriptions-item label="節慶獎金">
                    <strong style="font-size: 16px; color: var(--el-color-primary);">
                      ${{ ((dbgFestivalBonus.result as number) || 0).toLocaleString() }}
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
                <el-descriptions-item label="出席">{{ dbgMeeting.attended }} 次</el-descriptions-item>
                <el-descriptions-item label="缺席">{{ dbgMeeting.absent }} 次</el-descriptions-item>
                <el-descriptions-item label="每次加班費">{{ dbgMeeting.overtime_pay_per_session }}</el-descriptions-item>
                <el-descriptions-item label="每次缺席罰款">{{ dbgMeeting.absence_penalty_per_session }}</el-descriptions-item>
              </el-descriptions>
            </el-card>

            <!-- 勞健保明細 -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>勞健保計算</strong></template>
              <el-descriptions :column="2" border size="small">
                <el-descriptions-item label="投保金額">{{ (dbgInsurance.insured_amount as number | undefined)?.toLocaleString() }}</el-descriptions-item>
                <el-descriptions-item label="勞保(員工)">{{ dbgInsurance.labor_employee }}</el-descriptions-item>
                <el-descriptions-item label="勞保(雇主)">{{ dbgInsurance.labor_employer }}</el-descriptions-item>
                <el-descriptions-item label="健保(員工)">{{ dbgInsurance.health_employee }}</el-descriptions-item>
                <el-descriptions-item label="健保(雇主)">{{ dbgInsurance.health_employer }}</el-descriptions-item>
                <el-descriptions-item label="勞退(員工)">{{ dbgInsurance.pension_employee }}</el-descriptions-item>
                <el-descriptions-item label="勞退(雇主)">{{ dbgInsurance.pension_employer }}</el-descriptions-item>
                <el-descriptions-item label="員工代扣合計">{{ dbgInsurance.total_employee_deduction }}</el-descriptions-item>
              </el-descriptions>
            </el-card>

            <!-- 其他 -->
            <el-card shadow="never" style="margin-top: 12px;">
              <template #header><strong>其他</strong></template>
              <el-descriptions :column="2" border size="small">
                <el-descriptions-item label="加班費">{{ dbgOvertimePay }}</el-descriptions-item>
                <el-descriptions-item label="主管紅利">{{ dbgSupervisorDividend }}</el-descriptions-item>
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

/* F-3：窄螢幕下固定寬度雙欄 grid 會把結果區擠出畫面外且無捲動提示，
   <768px 改單欄堆疊（左：參數設定，右：結果，依 DOM 順序垂直排列）。 */
@media (--to-sm) {
  .simulate-layout {
    grid-template-columns: 1fr;
  }
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
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 6px;
}

.cliff-note {
  font-size: 11px;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  border-left: 3px solid var(--el-color-warning);
  padding: 6px 10px;
  margin: 0 0 12px 0;
  border-radius: 2px;
  line-height: 1.5;
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

.text-blue { color: var(--color-info); }
.text-green { color: var(--el-color-success); }
.text-danger { color: var(--el-color-danger); }
.text-muted { color: var(--el-text-color-placeholder); }

.json-block {
  background: var(--text-primary);
  color: var(--border-color);
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
