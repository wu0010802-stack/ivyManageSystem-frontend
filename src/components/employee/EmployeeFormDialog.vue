<!-- src/components/employee/EmployeeFormDialog.vue -->
<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import { useRouter } from 'vue-router'
import { createEmployee, updateEmployeeBasic, updateEmployeeSalary } from '@/api/employees'
import { getPositionSalary } from '@/api/config'
import { hasPermission, getUserInfo } from '@/utils/auth'
import { useIsMobile } from '@/composables/useIsMobile'
import { useEmployeeFormDirty } from '@/composables/useEmployeeFormDirty'
import { useFormDraft } from '@/composables/useFormDraft'
// 直接指向模組（非 barrel `@/composables`）：barrel 會連帶拉進 useDashboardSections 等
// 無關 composable，其間接依賴 @/stores/employee（getEmployees）在測試 mock 下會炸開。
import { useCrudDialog } from '@/composables/useCrudDialog'
import { BASIC_TAB_FIELDS, SALARY_TAB_FIELDS } from '@/constants/employeeFields'
import {
  OFFICIAL_JOB_TITLE_NAMES,
  TITLE_TO_GRADE,
  POSITION_SALARY_KEY,
} from '@/constants/employee'
import { detectRole } from '@/utils/employeeDisplay'
import { validateInsuranceVsBase, validateBaseSalary, validateHourlyRate } from '@/validators/employeeForm'
import { mapEmployeeError } from '@/utils/error'
import { useConfigStore } from '@/stores/config'
import { useClassroomStore } from '@/stores/classroom'
import EmployeeFormBasic, { type EmployeeFormBasicData } from '@/components/employee/EmployeeFormBasic.vue'
import EmployeeFormSalary from '@/components/employee/EmployeeFormSalary.vue'
import EmployeeChangesPreviewDialog from '@/components/employee/EmployeeChangesPreviewDialog.vue'

const emit = defineEmits<{ saved: [] }>()

const router = useRouter()
const configStore = useConfigStore()
const classroomStore = useClassroomStore()

// 手機版（≤767.98px）：Dialog 改為全螢幕
const { isMobile } = useIsMobile()

const formRef = ref<FormInstance | null>(null)
const basicFormRef = ref<{ applyValidationErrors: (p: string[]) => void } | null>(null)

// ── 權限 ──────────────────────────────────────────────
const canWriteSalary = computed(() => hasPermission('SALARY_WRITE'))

const rules: FormRules = {
  // 後端 EmployeeCreate 真正必填只有 name；employee_id 由後端自動配號，不再強制
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }],
  supervisor_role: [{ pattern: /^(園長|主任|組長|副組長)$/, message: '主管職不正確', trigger: 'change' }],
  bonus_grade: [{ pattern: /^[ABC]$/, message: '獎金等級僅接受 A / B / C', trigger: 'change' }],
  pension_self_rate: [{ type: 'number', min: 0, max: 0.06, message: '勞退自提率需介於 0–0.06', trigger: 'blur' }],
  extra_dependents_quarterly: [{ type: 'number', min: 0, max: 10, message: '加保眷屬數需介於 0–10', trigger: 'blur' }],
  insurance_salary_override_reason: [{ max: 200, message: '不可超過 200 字', trigger: 'blur' }],
  teacher_cert_no: [{ max: 50, message: '不可超過 50 字', trigger: 'blur' }],
  email: [{ type: 'email', message: 'Email 格式不正確', trigger: 'blur' }],
}

const positionSalaryConfig = ref<Record<string, number> | null>(null)
const suggestedSalary = ref<number | null>(null)

const titleToGrade = (jobTitleId: number | null | undefined) => {
  if (!jobTitleId || !configStore.jobTitles) return null
  const jt = (configStore.jobTitles as { id: number; name: string }[]).find(t => t.id === jobTitleId)
  if (!jt) return null
  return (TITLE_TO_GRADE as Record<string, string>)[jt.name] || null
}

interface EmployeeForm {
  id: number | null
  employee_id: string
  name: string
  id_number: string
  employee_type: string
  job_title_id: number | null
  position: string
  supervisor_role: string | null
  bonus_grade: string | null
  phone: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  hire_date: string
  probation_end_date: string
  birthday: string
  gender: string
  email: string
  insurance_effective_date: string
  classroom_id: number | null
  base_salary: number
  hourly_rate: number
  insurance_salary_level: number
  pension_self_rate: number
  dependents: number
  bank_code: string
  bank_account: string
  bank_account_name: string
  work_start_time: string
  work_end_time: string
  no_employment_insurance: boolean
  health_exempt: boolean
  skip_payroll_bonuses: boolean
  skip_payroll_transfer: boolean
  unreported_for_tax: boolean
  extra_dependents_quarterly: number
  insurance_salary_override_reason: string
  bypass_standard_base: boolean
  labor_insured_salary: number | null
  health_insured_salary: number | null
  pension_insured_salary: number | null
  staff_role_category: string
  teacher_cert_no: string
  teacher_cert_type: string
}

const form = reactive<EmployeeForm>({
  id: null,
  employee_id: '',
  name: '',
  id_number: '',
  employee_type: 'regular',
  job_title_id: null,
  position: '',
  supervisor_role: null,
  bonus_grade: null,
  phone: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  hire_date: '',
  probation_end_date: '',
  birthday: '',
  gender: '',
  email: '',
  insurance_effective_date: '',
  classroom_id: null,
  base_salary: 0,
  hourly_rate: 0,
  insurance_salary_level: 0,
  pension_self_rate: 0,
  dependents: 0,
  bank_code: '',
  bank_account: '',
  bank_account_name: '',
  work_start_time: '08:00',
  work_end_time: '17:00',
  // 階段 2-C 特殊狀況旗標（預設 0/false，多數員工不需動）
  no_employment_insurance: false,
  health_exempt: false,
  skip_payroll_bonuses: false,
  skip_payroll_transfer: false,
  unreported_for_tax: false,
  extra_dependents_quarterly: 0,
  insurance_salary_override_reason: '',
  bypass_standard_base: false,
  // 議題 B 分項投保（null=沿用 insurance_salary_level）
  labor_insured_salary: null,
  health_insured_salary: null,
  pension_insured_salary: null,
  // 教保身分（政府申報用）
  staff_role_category: '',
  teacher_cert_no: '',
  teacher_cert_type: '',
})

// ── 表單 tab + dirty tracking ─────────────────────────
const activeTab = ref('basic')
const { reset: resetDirty, basicDirty, salaryDirty } = useEmployeeFormDirty(form as unknown as Record<string, unknown>, [...BASIC_TAB_FIELDS] as string[], [...SALARY_TAB_FIELDS] as string[])

// ── 薪資變更預覽對話框 ────────────────────────────────
// 後端 finance_guards：底薪 / 時薪 / 投保級距變動需 adjustment_reason；
// 大額（合計 > 1000）還需 ACTIVITY_PAYMENT_APPROVE 權限。
const SALARY_AMOUNT_FIELDS = ['base_salary', 'hourly_rate', 'insurance_salary_level']
interface ChangeEntry { before?: unknown; after?: unknown }
const previewDialog = reactive({
  visible: false, title: '', changes: {} as Record<string, ChangeEntry>, requireConfirm: false,
  requireReason: false, onConfirm: null as ((reason: string | null) => void) | null,
})

// ── 自動建議薪資 ──────────────────────────────────────
const dismissedSuggestion = ref(false)
const insuranceError = computed(() =>
  validateInsuranceVsBase(form.insurance_salary_level, form.base_salary, form.employee_type)
)

// 送出前最低工資 gate：正職底薪 / 兼職時薪 / 投保級距三項合規檢查。
// 於 saveCreate（新增）與 saveSalary（編輯薪資）送出前擋下，避免使用者提交後才收後端 422。
// 各 validator 對「不適用型別 / 值為 0（未填）」皆回 null，故新增時無薪資權限（base_salary=0）不會誤擋。
const salarySubmitError = computed(() =>
  validateBaseSalary(form.base_salary, form.employee_type)
  || validateHourlyRate(form.hourly_rate, form.employee_type)
  || insuranceError.value
)

// ── 欄位標籤（預覽對話框用）──────────────────────────
const FIELD_LABELS = {
  name: '姓名', gender: '性別', email: 'Email', phone: '電話', address: '地址',
  insurance_effective_date: '加保生效日',
  base_salary: '底薪', hourly_rate: '時薪',
  insurance_salary_level: '投保級距', pension_self_rate: '勞退自提',
  bank_code: '銀行代碼', bank_account: '銀行帳號',
  bank_account_name: '戶名', birthday: '生日',
  job_title_id: '教育局職稱', position: '園內職務',
  classroom_id: '班級', hire_date: '到職日',
  employee_type: '員工類型', supervisor_role: '主管職務',
  bonus_grade: '獎金等級',
  emergency_contact_name: '緊急聯絡人',
  emergency_contact_phone: '緊急聯絡電話',
  dependents: '眷屬人數',
  probation_end_date: '試用期截止',
  work_start_time: '上班時間', work_end_time: '下班時間',
  id_number: '身分證字號',
}

const dirtyToPayload = (diff: Record<string, { after: unknown }>) =>
  Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.after]))

const showError = (err: unknown) => {
  const m = mapEmployeeError(err)
  if (m.type === 'success') ElMessage.success(m.message)
  else if (m.type === 'warning') ElMessage.warning(m.message)
  else ElMessage.error(m.message)
}

const bureauJobTitleOptions = computed(() => {
  const titles = (configStore.jobTitles || []) as { id: number; name: string }[]
  const titleMap = new Map(titles.map(item => [item.name, item]))
  const official = OFFICIAL_JOB_TITLE_NAMES
    .map(name => titleMap.get(name))
    .filter((item): item is { id: number; name: string } => Boolean(item))

  const current = titles.find(item => item.id === form.job_title_id)
  if (current && !official.some(item => item.id === current.id)) {
    official.push(current)
  }

  return official
})

// 根據職稱 + 職位 + bonus_grade 計算建議薪資（不再自動寫入 form，改由 banner 讓使用者手動套用）
watch([() => form.job_title_id, () => form.position, () => form.bonus_grade], () => {
  if (!positionSalaryConfig.value) { suggestedSalary.value = null; return }
  const role = detectRole(form.position)
  const grade = (form.bonus_grade || titleToGrade(form.job_title_id) || '').toLowerCase()
  let salary = null
  if (role && grade) {
    const key = `${role === 'head' ? 'head_teacher' : 'assistant_teacher'}_${grade}`
    salary = positionSalaryConfig.value[key] ?? null
  } else {
    const key = (POSITION_SALARY_KEY as Record<string, string>)[form.position]
    salary = key ? (positionSalaryConfig.value[key] ?? null) : null
  }
  suggestedSalary.value = salary
  // 職稱/職位/獎金等級變動時重置 dismiss 狀態，讓 banner 重新顯示
  dismissedSuggestion.value = false
})

// pendingSuggestion：建議薪資存在、未被 dismiss、且與目前 base_salary 不同
const pendingSuggestion = computed(() =>
  !dismissedSuggestion.value
  && suggestedSalary.value !== null
  && suggestedSalary.value !== form.base_salary
)

// 套用建議薪資（同時寫 base_salary + insurance_salary_level，避免不一致）
const applySuggestion = () => {
  if (suggestedSalary.value === null) return
  form.base_salary = suggestedSalary.value
  form.insurance_salary_level = suggestedSalary.value
  dismissedSuggestion.value = true
}
const dismissSuggestion = () => { dismissedSuggestion.value = true }
// 手動同步：將投保級距對齊目前底薪
const syncInsuranceToBase = () => {
  form.insurance_salary_level = form.base_salary
}

const resetForm = () => {
  const f = form as unknown as Record<string, unknown>
  Object.keys(f).forEach(key => {
    if (typeof f[key] === 'boolean') f[key] = false
    else if (typeof f[key] === 'number') f[key] = 0
    else f[key] = ''
  })
  form.id = null
  form.job_title_id = null
  form.supervisor_role = null
  form.classroom_id = null
  form.bonus_grade = null
  form.work_start_time = '08:00'
  form.work_end_time = '17:00'
  // 議題 B 分項投保 null（reset 預設 0 不適用，須 null 以走 fallback）
  form.labor_insured_salary = null
  form.health_insured_salary = null
  form.pension_insured_salary = null
  suggestedSalary.value = null
}

const populateForm = (row: Record<string, unknown>) => {
  Object.assign(form, row)
  // #9 遮罩薪資（無薪資權限）時後端把金額欄回 null；不可用 Number(null)=0 轉型，否則唯讀端
  // fmtRO 收到 0 會顯示「NT$0」（把「看不到」誤呈現成「0 元」），且 0 帶進 dirty 快照有以 0
  // 覆寫真實薪資的風險。保留 null，唯讀端才會顯示「—」。
  const toAmountOrNull = (v: unknown) => (v == null || v === '' ? null : Number(v))
  form.base_salary = toAmountOrNull(row.base_salary)
  form.hourly_rate = toAmountOrNull(row.hourly_rate)
  // 投保級距若為 0 或與底薪不一致，開啟編輯時自動對齊底薪；但底薪為 null（遮罩）時保持 null 不塞 0
  if (form.base_salary != null && (!form.insurance_salary_level || form.insurance_salary_level !== form.base_salary)) {
    form.insurance_salary_level = form.base_salary
  }
  // 重置 tab + dirty 快照 + suggestion dismiss
  activeTab.value = 'basic'
  dismissedSuggestion.value = false
  nextTick(() => {
    resetDirty(form)
  })
}

const { dialogVisible, isEdit, openCreate: handleAdd, openEdit: handleEdit, closeDialog } = useCrudDialog({ resetForm, populateForm })

// 表單草稿暫存：身分證/教師證字號/薪資/投保/銀行/聯絡 PII 排除，草稿僅含姓名、性別、生日等基本欄位
const EMPLOYEE_DRAFT_EXCLUDE = [
  'id', 'id_number', 'phone', 'email', 'address',
  'emergency_contact_name', 'emergency_contact_phone',
  'base_salary', 'hourly_rate', 'insurance_salary_level', 'pension_self_rate',
  'labor_insured_salary', 'health_insured_salary', 'pension_insured_salary',
  'insurance_salary_override_reason', 'bypass_standard_base',
  'dependents', 'extra_dependents_quarterly',
  'bank_code', 'bank_account', 'bank_account_name',
  'teacher_cert_no',
]
const employeeDraft = useFormDraft({
  formId: 'employee',
  state: form,
  recordId: () => form.id,
  userScope: () => (getUserInfo()?.employee_id as string | number | null) || 'anon',
  exclude: EMPLOYEE_DRAFT_EXCLUDE,
  enabled: () => dialogVisible.value,
})

const openCreate = async () => {
  handleAdd()
  await nextTick()
  // 新增模式建立「空表單」dirty 快照，供離開保護判斷未儲存變更；
  // 否則 originalForm 保持 null（見 useEmployeeFormDirty），dirty 恒空、攔不到誤關。
  resetDirty(form)
  await employeeDraft.maybePromptRestore()
}
const openEdit = async (row: Record<string, unknown>) => {
  handleEdit(row)
  await nextTick()
  await employeeDraft.maybePromptRestore()
}

// ── 離開編輯保護（finding #1）────────────────────────
// 有未儲存變更時攔截關閉；草稿刻意排除的敏感欄位（薪資/銀行/身分證）誤關即遺失，故補一道確認。
// basicDirty/salaryDirty 合計涵蓋所有 tab 欄位；新增模式由 openCreate 的 resetDirty 建立空快照後同樣生效。
const hasUnsavedChanges = computed(() =>
  Object.keys(basicDirty.value).length > 0 || Object.keys(salaryDirty.value).length > 0
)
const confirmDiscardIfDirty = (): Promise<boolean> => {
  if (!hasUnsavedChanges.value) return Promise.resolve(true)
  // #6 破壞性動作不持預設焦點：把安全的「繼續編輯」設為 confirm（primary＋預設焦點，Enter 走此路），
  // 破壞性的「捨棄變更並離開」改為 danger 樣式的 cancel；distinguishCancelAndClose 讓 Esc/X（close）
  // 與明確點「捨棄」（cancel）可分辨——只有後者才真正離開，Enter/Esc 皆不會誤丟未儲存資料。
  return ElMessageBox.confirm(
    '有未儲存的變更，離開將遺失未儲存內容（薪資、銀行、身分證等敏感欄位不會保留草稿）。',
    '尚未儲存',
    {
      confirmButtonText: '繼續編輯',
      cancelButtonText: '捨棄變更並離開',
      cancelButtonClass: 'el-button--danger',
      distinguishCancelAndClose: true,
      type: 'warning',
    },
  )
    .then(() => false) // 繼續編輯 → 不離開
    .catch((action) => action === 'cancel') // 捨棄變更並離開 → 離開；Esc/X（close）→ 不離開
}
// el-dialog before-close：攔截 X / Esc / 遮罩點擊
const handleBeforeClose = (done: () => void) => {
  confirmDiscardIfDirty().then((ok) => { if (ok) done() })
}
// footer「取消 / 關閉」按鈕：外部 set v-model 不觸發 before-close，需自行攔截
const attemptClose = () => {
  confirmDiscardIfDirty().then((ok) => { if (ok) closeDialog() })
}

defineExpose({ openCreate, openEdit })

// ── 薪資自我編輯保護（需在 isEdit 宣告後）────────────
const isSelfEdit = computed(() =>
  isEdit.value && form.id === getUserInfo()?.employee_id
)
const isSalaryReadonly = computed(() => isSelfEdit.value || !canWriteSalary.value)
const salaryReadonlyReason = computed(() => {
  if (isSelfEdit.value) return '本人不可修改自己的薪資/投保資料，請由 HR 處理'
  if (!canWriteSalary.value) return '無薪資編輯權限，僅可檢視'
  return ''
})

// ── 新增成功後的下一步引導（finding #5 後半）────────────
// createEmployee 回傳 EmployeeCreateResultOut（含 id）；有 id 才能提供「前往詳情頁」導頁按鈕。
// id 依契約為必填，此處 typeof 檢查是防禦性寫法：若未來 response 形狀異動，退化為純文案通知
// 而非硬導頁到 /employees/undefined。
const CREATE_GUIDANCE_MESSAGE = '員工已建立，後續可補：薪資/投保、證照與合約。'
async function showCreateGuidance(newEmployeeId: number | null) {
  if (newEmployeeId == null) {
    ElNotification({ title: '新增成功', message: CREATE_GUIDANCE_MESSAGE, type: 'success' })
    return
  }
  try {
    await ElMessageBox.confirm(CREATE_GUIDANCE_MESSAGE, '新增成功', {
      confirmButtonText: '前往詳情頁',
      cancelButtonText: '關閉',
      type: 'success',
    })
    // .catch()：導航被 guard 攔截或重複導航時 push 會 reject，吞掉避免 unhandled rejection 雜訊
    router.push({ name: 'employee-detail', params: { id: newEmployeeId } }).catch(() => {})
  } catch {
    // 使用者按「關閉」或 Esc：留在原頁，不導頁
  }
}

// ── 新增流程（CREATE）────────────────────────────────
const saving = ref(false)
const saveCreate = async () => {
  if (saving.value) return  // 送出中防序列/併發重送（name 非 unique，序列雙擊會真的建出重複員工）
  const formEl = formRef.value
  if (!formEl) return
  form.supervisor_role = form.supervisor_role || null
  form.bonus_grade = form.bonus_grade ? (form.bonus_grade as string).toUpperCase() : null
  if (form.bonus_grade && !['A', 'B', 'C'].includes(form.bonus_grade as string)) {
    ElMessage.error('獎金等級覆蓋僅接受 A / B / C')
    return
  }
  // 最低工資 gate：不合規直接擋，不進 el-form validate / createEmployee（saving 尚未設 true，安全 return）
  if (salarySubmitError.value) {
    ElMessage.error(salarySubmitError.value)
    return
  }
  // 同步設 saving（在 validate 前），否則 validate 的 async 間隙會讓第二次點擊穿過守衛。
  saving.value = true
  formEl.validate(async (valid, invalidFields) => {
    try {
      if (!valid) {
        const props = Object.keys(invalidFields ?? {})
        basicFormRef.value?.applyValidationErrors(props)
        await nextTick()
        if (props[0]) formEl.scrollToField(props[0])
        return
      }
      const res = await createEmployee(form)
      // 持久成功回饋（reviewer 裁定）：MessageBox 可被 Esc/點遮罩快速關閉，
      // toast 與引導框並存，確保成功訊息不因引導框被關而消失。
      ElMessage.success('員工已新增')
      employeeDraft.clear()
      closeDialog()
      emit('saved')
      // 引導對話框需等使用者互動，不 await——避免拖住 finally 的 saving 重置
      // （送出按鈕所屬 dialog 已 closeDialog，不會有殘留 loading 觀感問題）
      const newEmployeeId = typeof res.data.id === 'number' ? res.data.id : null
      void showCreateGuidance(newEmployeeId)
    } catch (err) {
      showError(err)
    } finally {
      saving.value = false
    }
  })
}

// ── 基本資料更新（只送 dirty fields）────────────────
const saveBasic = async () => {
  const payload = dirtyToPayload(basicDirty.value)
  if (Object.keys(payload).length === 0) {
    ElMessage.info('無變動')
    return
  }
  try {
    await updateEmployeeBasic(form.id!, payload)
    ElMessage.success(`基本資料已更新（${Object.keys(payload).length} 個欄位）`)
    emit('saved')
    resetDirty(form)
    employeeDraft.clear()
  } catch (err) {
    showError(err)
  }
}

// ── 薪資更新（強制預覽確認 modal）────────────────────
const submitSalary = async (adjustmentReason: string | null = null) => {
  const payload = dirtyToPayload(salaryDirty.value)
  if (Object.keys(payload).length === 0) {
    ElMessage.info('無變動')
    return
  }
  if (adjustmentReason) payload.adjustment_reason = adjustmentReason
  try {
    await updateEmployeeSalary(form.id!, payload)
    ElMessage.success(`薪資資料已更新（${Object.keys(payload).length} 個欄位）`)
    emit('saved')
    resetDirty(form)
  } catch (err) {
    showError(err)
  }
}

const saveSalary = () => {
  const diff = salaryDirty.value
  if (Object.keys(diff).length === 0) {
    ElMessage.info('無變動')
    return
  }
  // 最低工資 gate：不合規不開啟預覽確認框（同 saveCreate，避免提交後才收後端 422）
  if (salarySubmitError.value) {
    ElMessage.error(salarySubmitError.value)
    return
  }
  // 任一直接金額欄位（底薪/時薪/投保級距）有變動 → 後端會要求 adjustment_reason
  const needsReason = SALARY_AMOUNT_FIELDS.some((f) => f in diff)
  Object.assign(previewDialog, {
    visible: true,
    title: '薪資變更確認',
    changes: diff,
    requireConfirm: true,
    requireReason: needsReason,
    onConfirm: submitSalary,
  })
}

// ── 基本資料變更預覽（只看，不需 confirm）────────────
const showBasicPreview = () => {
  Object.assign(previewDialog, {
    visible: true,
    title: '基本資料變更預覽',
    changes: basicDirty.value,
    requireConfirm: false,
    onConfirm: null,
  })
}

const formAsBasicData = computed(() => form as unknown as EmployeeFormBasicData)
const classroomOptions = computed(() => classroomStore.classrooms as { id: number; name: string }[])

onMounted(async () => {
  // 下拉資料：職稱（教育局職稱）與班級選項，供基本資料 tab 使用。
  // 清單頁與詳情頁兩個父頁掛載本 dialog 都能自載，父頁 onMounted 不需重複 fetch。
  configStore.fetchJobTitles()
  classroomStore.fetchClassrooms()
  try {
    const res = await getPositionSalary()
    positionSalaryConfig.value = res.data as Record<string, number>
  } catch {
    // 靜默失敗：職位薪資建議僅為 banner 提示，不影響主流程
  }
})
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="isEdit ? '編輯員工' : '新增員工'"
    :width="isMobile ? '100%' : '800px'"
    :top="isMobile ? '0' : '6vh'"
    :fullscreen="isMobile"
    class="employee-form-dialog"
    destroy-on-close
    :before-close="handleBeforeClose"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-position="top">
      <p v-if="!isEdit" class="required-legend"><span class="req">*</span> 為必填，其餘可日後補</p>
      <el-tabs type="border-card" v-model="activeTab">
        <el-tab-pane label="基本資料" name="basic">
          <EmployeeFormBasic
            ref="basicFormRef"
            :form="formAsBasicData"
            :bureau-job-title-options="bureauJobTitleOptions"
            :classroom-options="classroomOptions"
            :is-self-edit="isSelfEdit"
            :pending-suggestion="isEdit ? pendingSuggestion : false"
            :suggested-salary="isEdit ? suggestedSalary : null"
          />
        </el-tab-pane>
        <el-tab-pane :label="isEdit ? '薪資 / 投保 / 銀行' : '薪資 / 投保 / 銀行（選填）'" name="salary">
          <!-- 新增模式且無薪資權限：明確告知兩段式流程 -->
          <el-alert
            v-if="!isEdit && !canWriteSalary"
            type="info" show-icon :closable="false"
            title="你沒有薪資編輯權限"
            description="可先建立員工基本資料，薪資/投保/銀行由具薪資權限者（HR）事後補登。"
          />
          <EmployeeFormSalary
            v-else
            :form="form"
            :is-readonly="isEdit ? isSalaryReadonly : false"
            :readonly-reason="salaryReadonlyReason"
            :pending-suggestion="pendingSuggestion"
            :suggested-salary="suggestedSalary"
            :insurance-error="insuranceError"
            @apply-suggestion="applySuggestion"
            @dismiss-suggestion="dismissSuggestion"
            @sync-insurance="syncInsuranceToBase"
          />
        </el-tab-pane>
      </el-tabs>
    </el-form>
    <template #footer>
      <template v-if="!isEdit">
        <el-button @click="attemptClose">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCreate">儲存</el-button>
      </template>
      <template v-else>
        <el-button @click="attemptClose">關閉</el-button>
        <template v-if="activeTab === 'basic'">
          <el-button
            :disabled="Object.keys(basicDirty).length === 0"
            @click="showBasicPreview"
          >
            檢視變更 ({{ Object.keys(basicDirty).length }})
          </el-button>
          <el-button
            type="primary"
            :disabled="Object.keys(basicDirty).length === 0"
            @click="saveBasic"
          >
            儲存基本資料 ({{ Object.keys(basicDirty).length }})
          </el-button>
        </template>
        <template v-else-if="activeTab === 'salary' && !isSalaryReadonly">
          <el-button
            type="primary"
            :disabled="Object.keys(salaryDirty).length === 0"
            @click="saveSalary"
          >
            儲存薪資 ({{ Object.keys(salaryDirty).length }})
          </el-button>
        </template>
      </template>
    </template>
  </el-dialog>

  <!-- 員工資料變更預覽 / 薪資強制確認對話框 -->
  <EmployeeChangesPreviewDialog
    v-model="previewDialog.visible"
    :title="previewDialog.title"
    :changes="previewDialog.changes"
    :require-confirm="previewDialog.requireConfirm"
    :require-reason="previewDialog.requireReason"
    :field-labels="FIELD_LABELS"
    @confirm="previewDialog.onConfirm && previewDialog.onConfirm($event)"
  />
</template>

<style scoped>
.required-legend { font-size: 12px; color: var(--el-text-color-secondary); margin: 0 0 14px; }
.required-legend .req { color: var(--el-color-danger); }
</style>

<!-- dialog teleport 到 body，scoped 穿不透；用非 scoped 全域 fallback 供 dialog 內容套用 -->
<style>
/* 桌機：tabs 內容區內捲，tab 列與 dialog footer 永遠可見 */
.employee-form-dialog:not(.is-fullscreen) .el-tabs--border-card > .el-tabs__content {
  max-height: calc(100vh - 340px);
  overflow-y: auto;
}
</style>
