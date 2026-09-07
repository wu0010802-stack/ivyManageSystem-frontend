<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FormDialog from '@/components/common/FormDialog.vue'
import { previewPayrollComparison } from '@/api/attendance'
import type { ApiResponse } from '@/api/_generated/typed'
import { hasPermission, hasFullSalaryView } from '@/utils/auth'
import { useErrorNotify } from '@/composables/useErrorNotify'

type PayrollResult = ApiResponse<'/attendance/payroll-comparison/preview-excel', 'post'>
type PayrollRow = PayrollResult['rows'][number]
const props = defineProps<{ modelValue: boolean; year: number; month: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const { notify } = useErrorNotify()
const allowed = computed(() => hasPermission('ATTENDANCE_READ') && hasPermission('SALARY_READ') && hasFullSalaryView())
const payrollFile = ref<File | null>(null)
const payrollResult = ref<PayrollResult | null>(null)
const worksheet = ref('')
const payrollMappings = ref<Record<number, number | undefined>>({})
const leaveScopeConfirmed = ref(false)
const blankDeductionsAsZero = ref(false)
const ready = ref(false)
const loading = ref(false)
const error = ref('')
const fileInputKey = ref(0)
let generation = 0
const salaryLabels: Record<PayrollRow['salary_state'], string> = {
  missing: '尚無系統薪資', stale: '資料已變更，需重新計算', draft: '草稿（尚未封存）', finalized: '已封存',
}
const matchLabels: Record<PayrollRow['match_status'], string> = {
  matched: '已對照', employee_not_found: '找不到員工', ambiguous_employee: '同名員工，請人工對照',
  duplicate_employee: '同一員工出現多列', invalid_row: '來源列無效',
}
const itemLabels = { matched: '金額一致', different: '原始值有差異', unverified: '待確認', not_comparable: '無法分項比較' }

/** 精確十進位字串只做千分位顯示，不轉成浮點數或自行進位。 */
function payrollMoney(value: string | null): string {
  if (value === null || !/^-?\d+(?:\.\d+)?$/.test(value)) return '—'
  const [whole, decimal = ''] = value.split('.')
  const fraction = decimal.replace(/0+$/, '')
  return `NT$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`
}

function invalidate() {
  generation++
  ready.value = false
  loading.value = false
  error.value = ''
}
function reset() {
  invalidate()
  payrollFile.value = null
  payrollResult.value = null
  worksheet.value = ''
  payrollMappings.value = {}
  leaveScopeConfirmed.value = false
  blankDeductionsAsZero.value = false
  fileInputKey.value++
}
watch(() => [props.modelValue, props.year, props.month, allowed.value], reset, { flush: 'sync' })
watch(worksheet, () => { payrollMappings.value = {}; invalidate() }, { flush: 'sync' })
watch([leaveScopeConfirmed, blankDeductionsAsZero], invalidate, { flush: 'sync' })

async function requestPreview(compare: boolean) {
  const file = payrollFile.value
  if (!allowed.value || !props.modelValue || !file || loading.value || (compare && worksheet.value !== '薪資表')) return
  const request = ++generation
  ready.value = false
  loading.value = true
  error.value = ''
  const form = new FormData()
  form.append('file', file)
  form.append('year', String(props.year))
  form.append('month', String(props.month))
  form.append('leave_scope_confirmed', String(leaveScopeConfirmed.value))
  form.append('blank_deductions_as_zero', String(blankDeductionsAsZero.value))
  form.append('employee_mappings', JSON.stringify(Object.entries(payrollMappings.value).flatMap(([sourceRow, employeeId]) =>
    employeeId ? [{ source_row: Number(sourceRow), employee_id: employeeId }] : [])))
  if (compare) form.append('worksheet', worksheet.value)
  try {
    const res = await previewPayrollComparison(form)
    if (request !== generation || !allowed.value) return
    payrollResult.value = res.data
    if (!compare) {
      worksheet.value = res.data.worksheets.includes('薪資表') ? '薪資表' : ''
    } else {
      ready.value = true
    }
  } catch (err) {
    if (request !== generation) return
    error.value = compare ? '核對失敗，請確認工作表與年月後重試' : '讀取工作表失敗，請重新選擇檔案'
    notify(err, 'PayrollComparisonDialog.preview', null, { prefix: error.value })
  } finally {
    if (request === generation) loading.value = false
  }
}
async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  reset()
  if (!file) return
  payrollFile.value = file
  await requestPreview(false)
}
</script>

<template>
  <FormDialog :model-value="modelValue" :title="`薪資扣項核對 · ${year} 年 ${month} 月`" size="wide" :enter-submit="false"
    @update:model-value="emit('update:modelValue', $event)">
    <p v-if="!allowed" role="alert">需要出勤讀取、薪資讀取及全員薪資檢視權限。</p>
    <section v-else class="payroll-comparison">
      <p>上傳外部薪資表，核對本月扣款差異。本功能僅供查核，不會寫入出勤或薪資。</p>
      <label>薪資 Excel 檔 <input :key="fileInputKey" type="file" accept=".xlsx" :disabled="loading" @change="onFileChange" /></label>
      <p v-if="loading" role="status">讀取與核對中…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template v-if="payrollResult">
        <label>工作表
          <select v-model="worksheet" aria-label="薪資工作表" :disabled="loading">
            <option value="">請選擇工作表</option>
            <option v-for="sheet in payrollResult.worksheets" :key="sheet" :value="sheet" :disabled="sheet !== '薪資表'">{{ sheet }}{{ sheet === '薪資表' ? '' : '（尚未支援）' }}</option>
          </select>
        </label>
        <p>目前支援「薪資表」的月薪扣項格式；才藝老師與鐘點薪資需另行核對。來源表年月必須與目前月份相符。</p>
        <label class="payroll-comparison__check"><input v-model="leaveScopeConfirmed" data-test="leave-scope" type="checkbox" :disabled="loading" />已確認來源表的事假與病假類扣款涵蓋本月全部請假扣款</label>
        <label class="payroll-comparison__check"><input v-model="blankDeductionsAsZero" data-test="blank-zero" type="checkbox" :disabled="loading" />已確認來源表的空白扣項代表0元</label>
        <p class="payroll-comparison__hint">未確認空白含義時不視為 0；公式缺少計算結果仍無法比較。系統僅有請假扣款合計，個別事假、病假金額不推算時數。</p>
        <el-button type="primary" :disabled="loading || worksheet !== '薪資表'" @click="requestPreview(true)">核對選定工作表</el-button>
        <p v-if="!ready && !loading" role="status">請重新核對，以目前對照與扣款口徑產生結果。</p>
        <template v-if="ready">
          <p role="status">金額一致 {{ payrollResult.summary.matched }} 人 · 有差異 {{ payrollResult.summary.different }} 人 · 待確認 {{ payrollResult.summary.unverified }} 人 · 問題 {{ payrollResult.summary.problems }} 人</p>
          <p>差額＝外部扣款 − 系統扣款；正值代表外部扣款較多。金額一致不代表薪資已核定，請一併查看薪資狀態。</p>
          <p v-for="warning in payrollResult.warnings" :key="warning" role="status">{{ warning }}</p>
        </template>
        <article v-for="row in payrollResult.rows" :key="row.source_row" class="payroll-comparison__row">
          <h3>來源列 {{ row.source_row }} · {{ row.source_name }}</h3>
          <label>對照本校員工
            <select v-model="payrollMappings[row.source_row]" :aria-label="`來源列 ${row.source_row} 員工對照`" :disabled="loading" @change="invalidate">
              <option :value="undefined">依來源姓名自動對照{{ row.employee_name ? `（目前：${row.employee_name}／${row.employee_number}）` : `（${matchLabels[row.match_status]}）` }}</option>
              <option v-for="employee in payrollResult.employees" :key="employee.id" :value="employee.id">{{ employee.name }}（{{ employee.employee_number }}）</option>
            </select>
          </label>
          <template v-if="ready">
            <p><strong>{{ salaryLabels[row.salary_state] }}</strong> · {{ matchLabels[row.match_status] }}</p>
            <p v-for="warning in row.warnings" :key="warning">{{ warning }}</p>
            <div class="payroll-comparison__table">
              <table><caption>扣項比較</caption><thead><tr><th>扣項</th><th>外部扣款</th><th>系統扣款</th><th>差額</th><th>判讀</th></tr></thead>
                <tbody><tr v-for="item in row.comparisons" :key="item.key"><th scope="row">{{ item.label }}</th><td>{{ payrollMoney(item.source_amount) }}</td><td>{{ payrollMoney(item.system_amount) }}</td><td>{{ payrollMoney(item.difference) }}</td><td>{{ itemLabels[item.status] }}<span v-if="item.reason">：{{ item.reason }}</span></td></tr></tbody>
              </table>
            </div>
            <details v-if="row.attendance"><summary>查看出勤佐證</summary><p>已有出勤紀錄 {{ row.attendance.recorded_days }} 日；遲到 {{ row.attendance.late_minutes }} 分鐘；早退 {{ row.attendance.early_leave_minutes }} 分鐘；缺卡 {{ row.attendance.missing_punch_days }} 日；待確認 {{ row.attendance.unconfirmed_days }} 日。</p><p>核准請假 {{ row.attendance.approved_leave_count }} 筆；核准加班 {{ row.attendance.approved_overtime_count }} 筆。筆數僅供查核，不換算扣款。</p></details>
          </template>
        </article>
      </template>
    </section>
    <template #footer><el-button @click="emit('update:modelValue', false)">關閉</el-button></template>
  </FormDialog>
</template>

<style scoped>
.payroll-comparison { display: flex; flex-direction: column; gap: 12px; }
.payroll-comparison p { margin: 0; }
.payroll-comparison__check { display: flex; gap: 8px; align-items: flex-start; }
.payroll-comparison__hint { color: var(--el-text-color-secondary); font-size: 13px; }
.payroll-comparison__row { padding-block: 16px; border-top: 1px solid var(--el-border-color); }
.payroll-comparison__row h3 { font-size: 16px; margin: 0 0 8px; }
.payroll-comparison__row p, .payroll-comparison__row details { margin-block: 8px; }
.payroll-comparison__table { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; margin-block: 12px; }
th, td { padding: 8px; text-align: left; border-bottom: 1px solid var(--el-border-color); }
select { padding: 6px; max-width: 100%; background: var(--el-bg-color); color: var(--el-text-color-primary); border: 1px solid var(--el-border-color); border-radius: 4px; }
</style>
