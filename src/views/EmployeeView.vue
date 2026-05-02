<script setup>
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue'
import { useDebounceFn, useMediaQuery } from '@vueuse/core'
import { Loading, User, Plus } from '@element-plus/icons-vue'
import {
  getEmployee, getEmployees, createEmployee, offboard, getFinalSalaryPreview,
  listEmployeeEducations, createEmployeeEducation, updateEmployeeEducation, deleteEmployeeEducation,
  listEmployeeCertificates, createEmployeeCertificate, updateEmployeeCertificate, deleteEmployeeCertificate,
  listEmployeeContracts, createEmployeeContract, updateEmployeeContract, deleteEmployeeContract,
  updateEmployeeBasic, updateEmployeeSalary,
} from '@/api/employees'
import { getRecords as getAttendanceRecords, uploadCsv, deleteEmployeeDateRecord } from '@/api/attendance'
import { getPositionSalary } from '@/api/config'
import { ElMessage, ElMessageBox } from 'element-plus'
import EmptyState from '@/components/common/EmptyState.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { useEmployeeStore } from '@/stores/employee'
import { todayISO, thisMonthISO } from '@/utils/format'
import { useClassroomStore } from '@/stores/classroom'
import { useConfigStore } from '@/stores/config'
import { useCrudDialog, useConfirmDelete } from '@/composables'
import { downloadFile } from '@/utils/download'
import { mapEmployeeError } from '@/utils/error'
import {
  POSITION_OPTIONS,
  SUPERVISOR_ROLE_OPTIONS,
  OFFICIAL_JOB_TITLE_NAMES,
  TITLE_TO_GRADE,
  POSITION_SALARY_KEY,
  DEGREE_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  EMPLOYEE_TYPE_OPTIONS,
} from '@/constants/employee'
import { hasPermission, getUserInfo } from '@/utils/auth'
import { useEmployeeFormDirty } from '@/composables/useEmployeeFormDirty'
import { BASIC_TAB_FIELDS, SALARY_TAB_FIELDS } from '@/constants/employeeFields'
import { validateInsuranceVsBase } from '@/validators/employeeForm'
import EmployeeFormBasic from '@/components/employee/EmployeeFormBasic.vue'
import EmployeeFormSalary from '@/components/employee/EmployeeFormSalary.vue'
import EmployeeChangesPreviewDialog from '@/components/employee/EmployeeChangesPreviewDialog.vue'

const employeeStore = useEmployeeStore()
const classroomStore = useClassroomStore()

// 手機版（≤767px）：詳情/編輯 Dialog 改為全螢幕，內部 grid 改單欄
const isMobile = useMediaQuery('(max-width: 767px)')
const configStore = useConfigStore()

const loading = ref(false)
const currentDetail = ref({})
const detailDialogVisible = ref(false)
const formRef = ref(null)

// ── 權限 ──────────────────────────────────────────────
const canWriteEmployees = computed(() => hasPermission('EMPLOYEES_WRITE'))
const canWriteSalary = computed(() => hasPermission('SALARY_WRITE'))

const rules = {
  employee_id: [{ required: true, message: '請輸入員工編號', trigger: 'blur' }],
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }]
}

const positionSalaryConfig = ref(null)
const suggestedSalary = ref(null)

const detectRole = (position) => {
  if (!position) return null
  if (position.includes('班導') && !position.includes('副')) return 'head'
  if (position.includes('副班導')) return 'assistant'
  return null
}

const titleToGrade = (jobTitleId) => {
  if (!jobTitleId || !configStore.jobTitles) return null
  const jt = configStore.jobTitles.find(t => t.id === jobTitleId)
  if (!jt) return null
  return TITLE_TO_GRADE[jt.name] || null
}

const form = reactive({
  id: null,
  employee_id: '',
  name: '',
  id_number: '',
  employee_type: 'regular',
  job_title_id: null,
  position: '',
  supervisor_role: null,
  bonus_grade: null,
  department: 'Teaching',
  phone: '',
  address: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  hire_date: '',
  probation_end_date: '',
  birthday: '',
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
  work_end_time: '17:00'
})

// ── 編輯 dialog tab + dirty tracking ─────────────────
const activeTab = ref('basic')
const { reset: resetDirty, basicDirty, salaryDirty } = useEmployeeFormDirty(form, BASIC_TAB_FIELDS, SALARY_TAB_FIELDS)

// ── 薪資變更預覽對話框 ────────────────────────────────
// 後端 finance_guards：底薪 / 時薪 / 投保級距變動需 adjustment_reason；
// 大額（合計 > 1000）還需 ACTIVITY_PAYMENT_APPROVE 權限。
const SALARY_AMOUNT_FIELDS = ['base_salary', 'hourly_rate', 'insurance_salary_level']
const previewDialog = reactive({
  visible: false, title: '', changes: {}, requireConfirm: false,
  requireReason: false, onConfirm: null,
})

// ── 自動建議薪資 ──────────────────────────────────────
const dismissedSuggestion = ref(false)
const insuranceError = computed(() =>
  validateInsuranceVsBase(form.insurance_salary_level, form.base_salary, form.employee_type)
)

// ── 欄位標籤（預覽對話框用）──────────────────────────
const FIELD_LABELS = {
  name: '姓名', phone: '電話', address: '地址',
  base_salary: '底薪', hourly_rate: '時薪',
  insurance_salary_level: '投保級距', pension_self_rate: '勞退自提',
  bank_code: '銀行代碼', bank_account: '銀行帳號',
  bank_account_name: '戶名', birthday: '生日',
  job_title_id: '教育局系統', position: '職位',
  classroom_id: '班級', hire_date: '到職日',
  employee_type: '員工類型', supervisor_role: '主管職務',
  bonus_grade: '獎金等級',
  emergency_contact_name: '緊急聯絡人',
  emergency_contact_phone: '緊急聯絡電話',
  department: '部門', dependents: '眷屬人數',
  probation_end_date: '試用期截止',
  work_start_time: '上班時間', work_end_time: '下班時間',
  id_number: '身分證字號',
}

const dirtyToPayload = (diff) =>
  Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.after]))

const showError = (err) => {
  const m = mapEmployeeError(err)
  ElMessage({ type: m.type || 'error', message: m.message, duration: 5000 })
}

const bureauJobTitleOptions = computed(() => {
  const titles = configStore.jobTitles || []
  const titleMap = new Map(titles.map(item => [item.name, item]))
  const official = OFFICIAL_JOB_TITLE_NAMES
    .map(name => titleMap.get(name))
    .filter(Boolean)

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
    const key = POSITION_SALARY_KEY[form.position]
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

// 查詢某員工對應的標準薪俸（詳情頁用）
const standardSalaryFor = (emp) => {
  if (!positionSalaryConfig.value || !emp) return null
  const cfg = positionSalaryConfig.value
  const pos = emp.position || ''
  const role = detectRole(pos)
  if (role) {
    const titleName = emp.job_title_name || emp.title || ''
    const grade = (emp.bonus_grade || TITLE_TO_GRADE[titleName] || '').toLowerCase()
    if (grade) {
      const key = `${role === 'head' ? 'head_teacher' : 'assistant_teacher'}_${grade}`
      return cfg[key] ?? null
    }
    return null
  }
  const key = POSITION_SALARY_KEY[pos]
  return key ? (cfg[key] ?? null) : null
}

// ── 辦理離職 ──────────────────────────────────────
const offboardVisible = ref(false)
const offboardTarget = ref(null)  // 目標員工資料
const offboardForm = reactive({ resign_date: '', resign_reason: '' })
const offboardLoading = ref(false)
const finalSalaryPreview = ref(null)
const finalSalaryLoading = ref(false)

const getEmployeeStatus = (emp) => {
  const today = todayISO()
  if (!emp.is_active) return { label: '已離職', type: 'info' }
  if (emp.resign_date && emp.resign_date > today) {
    return { label: `待離職・${emp.resign_date}`, type: 'warning' }
  }
  return { label: '在職', type: 'success' }
}

const openOffboard = (emp) => {
  offboardTarget.value = emp
  offboardForm.resign_date = ''
  offboardForm.resign_reason = ''
  finalSalaryPreview.value = null
  offboardVisible.value = true
}

const fetchFinalSalary = async () => {
  if (!offboardTarget.value || !offboardForm.resign_date) return
  const [year, month] = offboardForm.resign_date.split('-')
  finalSalaryLoading.value = true
  try {
    const res = await getFinalSalaryPreview(offboardTarget.value.id, { year: parseInt(year), month: parseInt(month) })
    finalSalaryPreview.value = res.data
  } catch {
    finalSalaryPreview.value = null
  } finally {
    finalSalaryLoading.value = false
  }
}

watch(() => offboardForm.resign_date, (val) => {
  if (val) fetchFinalSalary()
  else finalSalaryPreview.value = null
})

const submitOffboard = async () => {
  if (!offboardForm.resign_date) {
    ElMessage.warning('請選擇離職日期')
    return
  }
  offboardLoading.value = true
  try {
    await offboard(offboardTarget.value.id, offboardForm)
    ElMessage.success('離職資料已更新')
    offboardVisible.value = false
    fetchEmployees()
  } catch (err) {
    ElMessage.error('辦理離職失敗: ' + (err.response?.data?.detail || err.message))
  } finally {
    offboardLoading.value = false
  }
}

const searchQuery = ref('')
const debouncedSearch = ref('')
const updateSearch = useDebounceFn((val) => { debouncedSearch.value = val }, 300)
watch(searchQuery, updateSearch)

const searchResults = ref(null) // null = 用 store；有值 = 搜尋結果

const filteredEmployees = computed(() =>
  searchResults.value !== null ? searchResults.value : employeeStore.employees
)

watch(debouncedSearch, async (val) => {
  if (!val) {
    searchResults.value = null
    return
  }
  try {
    const res = await getEmployees({ search: val })
    searchResults.value = res.data
  } catch {
    ElMessage.error('搜尋員工失敗')
  }
})

const exportEmployees = () => {
  downloadFile('/exports/employees', '員工名冊.xlsx')
}

const fetchEmployees = async () => {
  loading.value = true
  try {
    await employeeStore.fetchEmployees(true)
  } catch (error) {
    ElMessage.error('載入員工資料失敗')
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  Object.keys(form).forEach(key => {
    if (typeof form[key] === 'boolean') form[key] = false
    else if (typeof form[key] === 'number') form[key] = 0
    else form[key] = ''
  })
  form.id = null
  form.job_title_id = null
  form.supervisor_role = null
  form.classroom_id = null
  form.bonus_grade = null
  form.department = 'Teaching'
  form.work_start_time = '08:00'
  form.work_end_time = '17:00'
  suggestedSalary.value = null
}

const populateForm = (row) => {
  Object.assign(form, row)
  form.base_salary = Number(row.base_salary)
  form.hourly_rate = Number(row.hourly_rate)
  // 投保級距若為 0 或與底薪不一致，開啟編輯時自動對齊底薪
  if (!form.insurance_salary_level || form.insurance_salary_level !== form.base_salary) {
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

const { confirmDelete: handleDelete, deleting: deleteLoading } = useConfirmDelete({
  endpoint: '/employees',
  onSuccess: fetchEmployees,
  successMsg: '刪除成功',
})

const attendanceRecords = ref([])
const attendanceMonth = ref(thisMonthISO()) // YYYY-MM
// ... existing variables

const fetchAttendance = async () => {
  if (!currentDetail.value.id || !attendanceMonth.value) return
  const [year, month] = attendanceMonth.value.split('-')
  try {
    const response = await getAttendanceRecords({
      employee_id: currentDetail.value.id,
      year: parseInt(year),
      month: parseInt(month)
    })
    attendanceRecords.value = response.data
  } catch (error) {
    ElMessage.error('載入出勤紀錄失敗')
  }
}

const getAttendanceStatusType = (status) => {
  if (status === 'normal') return 'success'
  if (status.includes('late') || status.includes('early')) return 'warning'
  return 'danger'
}

const editAttendance = (row) => {
  ElMessageBox.prompt('請輸入新的上/下班時間 (格式: HH:MM,HH:MM)', '編輯出勤', {
    confirmButtonText: '確定',
    cancelButtonText: '取消',
    inputValue: `${row.punch_in || ''},${row.punch_out || ''}`,
    inputPattern: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9],([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    inputErrorMessage: '時間格式不正確'
  }).then(async ({ value }) => {
     const [inTime, outTime] = value.split(',')
     // Call API to save (using existing upload-csv endpoint logic w/ wrapper or new endpoint if we made one?)
     // Reusing the logic from app.js: wrap in upload payload
     const payload = {
        year: parseInt(attendanceMonth.value.split('-')[0]),
        month: parseInt(attendanceMonth.value.split('-')[1]),
        records: [{
           department: "Manual",
           employee_number: currentDetail.value.employee_id,
           name: currentDetail.value.name,
           date: row.date.replace(/-/g, '/'),
           weekday: "",
           punch_in: inTime,
           punch_out: outTime
        }]
     }
     try {
        await uploadCsv(payload)
        ElMessage.success('出勤已更新')
        fetchAttendance()
     } catch (err) {
        ElMessage.error('更新失敗')
     }
  }).catch(() => {})
}

const deleteAttendance = (row) => {
   ElMessageBox.confirm(`確定要刪除 ${row.date} 的出勤紀錄嗎？`, '警告', {
      type: 'warning'
   }).then(async () => {
      try {
         await deleteEmployeeDateRecord(currentDetail.value.id, row.date)
         ElMessage.success('已刪除')
         fetchAttendance()
      } catch (err) {
         ElMessage.error('刪除失敗')
      }
   })
}

// ── 詳情對話框 tab 切換 / lazy loading ──────────────
const activeDetailTab = ref('personal')
const loadedTabs = ref(new Set())
const educations = ref([])
const certificates = ref([])
const contracts = ref([])

const employeeTypeLabel = (v) => {
  const opt = EMPLOYEE_TYPE_OPTIONS.find(o => o.value === v)
  return opt ? opt.label : (v || '-')
}

const fetchEducations = async () => {
  if (!currentDetail.value.id) return
  const res = await listEmployeeEducations(currentDetail.value.id)
  educations.value = res.data
}
const fetchCertificates = async () => {
  if (!currentDetail.value.id) return
  const res = await listEmployeeCertificates(currentDetail.value.id)
  certificates.value = res.data
}
const fetchContracts = async () => {
  if (!currentDetail.value.id) return
  const res = await listEmployeeContracts(currentDetail.value.id)
  contracts.value = res.data
}

const onDetailTabChange = async (name) => {
  if (loadedTabs.value.has(name)) return
  try {
    if (name === 'education') await fetchEducations()
    else if (name === 'certificate') await fetchCertificates()
    else if (name === 'contract') await fetchContracts()
    else if (name === 'attendance') await fetchAttendance()
    loadedTabs.value.add(name)
  } catch {
    ElMessage.error('載入失敗')
  }
}

// ── 學歷 / 證照 / 合約 共用子對話框 ──────────────────
const subDialog = reactive({
  visible: false,
  isEdit: false,
  kind: null, // 'education' | 'certificate' | 'contract'
  form: {},
})
const subDialogTitle = computed(() => {
  const kindLabel = { education: '學歷', certificate: '證照', contract: '合約' }[subDialog.kind] || ''
  return `${subDialog.isEdit ? '編輯' : '新增'}${kindLabel}`
})

const openEduCreate = () => {
  subDialog.kind = 'education'; subDialog.isEdit = false
  subDialog.form = {
    school_name: '', major: '', degree: '學士',
    graduation_date: '', is_highest: false, remark: '',
  }
  subDialog.visible = true
}
const openEduEdit = (row) => {
  subDialog.kind = 'education'; subDialog.isEdit = true
  subDialog.form = { ...row }
  subDialog.visible = true
}
const openCertCreate = () => {
  subDialog.kind = 'certificate'; subDialog.isEdit = false
  subDialog.form = {
    certificate_name: '', issuer: '', certificate_number: '',
    issued_date: '', expiry_date: '', remark: '',
  }
  subDialog.visible = true
}
const openCertEdit = (row) => {
  subDialog.kind = 'certificate'; subDialog.isEdit = true
  subDialog.form = { ...row }
  subDialog.visible = true
}
const openContractCreate = () => {
  subDialog.kind = 'contract'; subDialog.isEdit = false
  subDialog.form = {
    contract_type: '正式', start_date: '', end_date: '',
    salary_at_contract: null, remark: '',
  }
  subDialog.visible = true
}
const openContractEdit = (row) => {
  subDialog.kind = 'contract'; subDialog.isEdit = true
  subDialog.form = { ...row }
  subDialog.visible = true
}

const submitSub = async () => {
  const id = currentDetail.value.id
  if (!id) return
  const payload = { ...subDialog.form }
  try {
    if (subDialog.kind === 'education') {
      if (!payload.school_name) return ElMessage.warning('請輸入學校名稱')
      if (subDialog.isEdit) await updateEmployeeEducation(id, payload.id, payload)
      else await createEmployeeEducation(id, payload)
      await fetchEducations()
    } else if (subDialog.kind === 'certificate') {
      if (!payload.certificate_name) return ElMessage.warning('請輸入證照名稱')
      if (subDialog.isEdit) await updateEmployeeCertificate(id, payload.id, payload)
      else await createEmployeeCertificate(id, payload)
      await fetchCertificates()
    } else if (subDialog.kind === 'contract') {
      if (!payload.contract_type) return ElMessage.warning('請選擇合約類型')
      if (!payload.start_date) return ElMessage.warning('請選擇合約起始日')
      if (subDialog.isEdit) await updateEmployeeContract(id, payload.id, payload)
      else await createEmployeeContract(id, payload)
      await fetchContracts()
    }
    subDialog.visible = false
    ElMessage.success('儲存成功')
  } catch (err) {
    ElMessage.error('儲存失敗：' + (err.response?.data?.detail || err.message))
  }
}

const confirmDeleteSub = (kind, row) => {
  ElMessageBox.confirm('確定刪除此筆記錄？', '警告', { type: 'warning' }).then(async () => {
    const id = currentDetail.value.id
    try {
      if (kind === 'education') { await deleteEmployeeEducation(id, row.id); await fetchEducations() }
      else if (kind === 'certificate') { await deleteEmployeeCertificate(id, row.id); await fetchCertificates() }
      else if (kind === 'contract') { await deleteEmployeeContract(id, row.id); await fetchContracts() }
      ElMessage.success('已刪除')
    } catch (err) {
      ElMessage.error('刪除失敗：' + (err.response?.data?.detail || err.message))
    }
  }).catch(() => {})
}

const handleDetail = async (row) => {
  try {
    const response = await getEmployee(row.id)
    currentDetail.value = response.data
    // 重置 lazy loading 狀態；個人/職務/薪資直接從 currentDetail 讀取，不需 fetch
    loadedTabs.value = new Set(['personal', 'job', 'salary'])
    activeDetailTab.value = 'personal'
    educations.value = []
    certificates.value = []
    contracts.value = []
    attendanceMonth.value = thisMonthISO()
    attendanceRecords.value = []
    detailDialogVisible.value = true
  } catch (error) {
    ElMessage.error('載入詳情失敗')
  }
}

// ── 新增流程（CREATE）────────────────────────────────
const saveCreate = async () => {
  if (!formRef.value) return
  form.supervisor_role = form.supervisor_role || null
  form.bonus_grade = form.bonus_grade ? form.bonus_grade.toUpperCase() : null
  if (form.bonus_grade && !['A', 'B', 'C'].includes(form.bonus_grade)) {
    ElMessage.error('獎金等級覆蓋僅接受 A / B / C')
    return
  }
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    try {
      await createEmployee(form)
      ElMessage.success('員工已新增')
      closeDialog()
      await fetchEmployees()
    } catch (err) {
      showError(err)
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
    await updateEmployeeBasic(form.id, payload)
    ElMessage.success(`基本資料已更新（${Object.keys(payload).length} 個欄位）`)
    await fetchEmployees()
    resetDirty(form)
  } catch (err) {
    showError(err)
  }
}

// ── 薪資更新（強制預覽確認 modal）────────────────────
const submitSalary = async (adjustmentReason = null) => {
  const payload = dirtyToPayload(salaryDirty.value)
  if (Object.keys(payload).length === 0) {
    ElMessage.info('無變動')
    return
  }
  if (adjustmentReason) payload.adjustment_reason = adjustmentReason
  try {
    await updateEmployeeSalary(form.id, payload)
    ElMessage.success(`薪資資料已更新（${Object.keys(payload).length} 個欄位）`)
    await fetchEmployees()
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

onMounted(async () => {
  fetchEmployees()
  configStore.fetchJobTitles()
  classroomStore.fetchClassrooms()
  try {
    const res = await getPositionSalary()
    positionSalaryConfig.value = res.data
  } catch {}
})
</script>

<template>
  <div class="employees-page">
    <div class="page-header">
      <h2>員工管理</h2>
      <div class="header-actions">
        <el-input v-model="searchQuery" placeholder="搜尋姓名或編號" style="width: 200px; margin-right: 10px;" prefix-icon="Search" />
        <el-button type="success" @click="exportEmployees">匯出 Excel</el-button>
        <el-button type="primary" @click="handleAdd">
          <el-icon><Plus /></el-icon> 新增員工
        </el-button>
      </div>
    </div>

    <TableSkeleton v-if="loading && !employeeStore.employees.length" :columns="7" />
    <el-card v-else class="no-hover">
      <el-table :data="filteredEmployees" v-loading="loading" stripe style="width: 100%" max-height="600">
        <el-table-column prop="employee_id" label="編號" width="100" sortable />
        <el-table-column prop="name" label="姓名" width="120" sortable />
        <el-table-column prop="title" label="教育局系統" width="150" sortable />
        <el-table-column prop="position" label="職位" width="120" />
        <el-table-column prop="hire_date" label="到職日" width="120" sortable />
        <el-table-column label="狀態" width="160">
          <template #default="scope">
            <el-tag :type="getEmployeeStatus(scope.row).type" size="small">
              {{ getEmployeeStatus(scope.row).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column fixed="right" label="操作" width="280">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="handleDetail(scope.row)">詳情</el-button>
            <el-tooltip
              v-if="!canWriteEmployees"
              content="需要員工管理編輯權限"
              placement="top"
            >
              <span>
                <el-button link type="primary" size="small" disabled>編輯</el-button>
              </span>
            </el-tooltip>
            <el-button v-else link type="primary" size="small" @click="handleEdit(scope.row)">編輯</el-button>
            <el-button v-if="canWriteEmployees && scope.row.is_active" link type="warning" size="small" @click="openOffboard(scope.row)">辦理離職</el-button>
            <el-button v-if="canWriteEmployees" link type="danger" size="small" @click="handleDelete(scope.row)" :loading="deleteLoading">刪除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <EmptyState title="尚無員工資料" description="點擊「新增員工」開始建立" />
        </template>
      </el-table>
    </el-card>

    <!-- Add/Edit Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '編輯員工' : '新增員工'"
      :width="isMobile ? '100%' : '800px'"
      :top="isMobile ? '0' : '15vh'"
      :fullscreen="isMobile"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="140px">
        <el-tabs type="border-card" v-model="activeTab">
          <el-tab-pane label="基本資料" name="basic">
            <EmployeeFormBasic
              :form="form"
              :bureau-job-title-options="bureauJobTitleOptions"
              :classroom-options="classroomStore.classrooms"
              :is-self-edit="isSelfEdit"
              :pending-suggestion="pendingSuggestion"
              :suggested-salary="suggestedSalary"
            />
          </el-tab-pane>
          <el-tab-pane label="薪資 / 投保 / 銀行" name="salary">
            <EmployeeFormSalary
              :form="form"
              :is-readonly="isSalaryReadonly"
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
          <el-button @click="closeDialog">取消</el-button>
          <el-button type="primary" @click="saveCreate">儲存</el-button>
        </template>
        <template v-else>
          <el-button @click="closeDialog">關閉</el-button>
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
      @confirm="previewDialog.onConfirm?.($event)"
    />

    <!-- Detail Dialog：桌機左右欄、手機全螢幕單欄 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="員工詳情"
      :width="isMobile ? '100%' : '1100px'"
      :top="isMobile ? '0' : '5vh'"
      :fullscreen="isMobile"
    >
      <div class="detail-layout" :class="{ 'is-mobile': isMobile }">
        <!-- 左欄：員工身份摘要 -->
        <aside class="detail-aside">
          <div class="avatar-placeholder">
            <el-icon :size="64" color="#909399"><User /></el-icon>
          </div>
          <h3 class="emp-name">{{ currentDetail.name || '-' }}</h3>
          <div class="emp-meta">
            <div><span class="meta-label">編號</span>{{ currentDetail.employee_id || '-' }}</div>
            <div><span class="meta-label">職稱</span>{{ currentDetail.job_title_name || currentDetail.title || '-' }}</div>
            <div v-if="currentDetail.position"><span class="meta-label">職位</span>{{ currentDetail.position }}</div>
            <div v-if="currentDetail.classroom_name"><span class="meta-label">班級</span>{{ currentDetail.classroom_name }}</div>
            <div style="margin-top:12px">
              <el-tag :type="getEmployeeStatus(currentDetail).type" size="small">
                {{ getEmployeeStatus(currentDetail).label }}
              </el-tag>
              <el-tag v-if="currentDetail.supervisor_role" size="small" type="warning" style="margin-left:6px">
                {{ currentDetail.supervisor_role }}
              </el-tag>
            </div>
          </div>
        </aside>

        <!-- 右欄：分頁內容 -->
        <section class="detail-main">
          <el-tabs
            v-model="activeDetailTab"
            type="border-card"
            @tab-change="onDetailTabChange"
          >
            <!-- 個人資料 -->
            <el-tab-pane label="個人資料" name="personal">
              <el-descriptions :column="isMobile ? 1 : 2" border>
                <el-descriptions-item label="聯絡電話">{{ currentDetail.phone || '-' }}</el-descriptions-item>
                <el-descriptions-item label="生日">{{ currentDetail.birthday || '-' }}</el-descriptions-item>
                <el-descriptions-item label="身分證">{{ currentDetail.id_number || '-' }}</el-descriptions-item>
                <el-descriptions-item label="眷屬人數">{{ currentDetail.dependents ?? '-' }}</el-descriptions-item>
                <el-descriptions-item label="通訊地址" :span="2">{{ currentDetail.address || '-' }}</el-descriptions-item>
                <el-descriptions-item label="緊急聯絡人">{{ currentDetail.emergency_contact_name || '-' }}</el-descriptions-item>
                <el-descriptions-item label="緊急聯絡電話">{{ currentDetail.emergency_contact_phone || '-' }}</el-descriptions-item>
              </el-descriptions>
            </el-tab-pane>

            <!-- 職務資料 -->
            <el-tab-pane label="職務資料" name="job">
              <el-descriptions :column="isMobile ? 1 : 2" border>
                <el-descriptions-item label="員工類型">{{ employeeTypeLabel(currentDetail.employee_type) }}</el-descriptions-item>
                <el-descriptions-item label="職位">{{ currentDetail.position || '-' }}</el-descriptions-item>
                <el-descriptions-item label="到職日">{{ currentDetail.hire_date || '-' }}</el-descriptions-item>
                <el-descriptions-item label="試用期結束">{{ currentDetail.probation_end_date || '-' }}</el-descriptions-item>
                <el-descriptions-item label="主管職">
                  <el-tag v-if="currentDetail.supervisor_role" size="small">{{ currentDetail.supervisor_role }}</el-tag>
                  <span v-else>-</span>
                </el-descriptions-item>
                <el-descriptions-item label="班級">{{ currentDetail.classroom_name || '-' }}</el-descriptions-item>
                <el-descriptions-item v-if="currentDetail.resign_date" label="離職日">{{ currentDetail.resign_date }}</el-descriptions-item>
                <el-descriptions-item v-if="currentDetail.resign_reason" label="離職原因">{{ currentDetail.resign_reason }}</el-descriptions-item>
              </el-descriptions>
            </el-tab-pane>

            <!-- 薪資 -->
            <el-tab-pane label="薪資" name="salary">
              <el-descriptions :column="isMobile ? 1 : 2" border>
                <el-descriptions-item label="基本薪資">
                  <span>{{ Number(currentDetail.base_salary).toLocaleString() }}</span>
                  <template v-if="standardSalaryFor(currentDetail) !== null">
                    <span style="color:#909399;font-size:12px;margin-left:8px">
                      標準：{{ standardSalaryFor(currentDetail).toLocaleString() }}
                    </span>
                    <el-tag
                      v-if="Number(currentDetail.base_salary) !== standardSalaryFor(currentDetail)"
                      size="small"
                      :type="Number(currentDetail.base_salary) > standardSalaryFor(currentDetail) ? 'success' : 'warning'"
                      style="margin-left:6px"
                    >
                      {{ Number(currentDetail.base_salary) > standardSalaryFor(currentDetail) ? '↑ 高於標準' : '↓ 低於標準' }}
                    </el-tag>
                    <el-tag v-else size="small" type="info" style="margin-left:6px">符合標準</el-tag>
                  </template>
                </el-descriptions-item>
                <el-descriptions-item label="投保級距">{{ currentDetail.insurance_salary_level }}</el-descriptions-item>
                <el-descriptions-item label="時薪">{{ currentDetail.hourly_rate }}</el-descriptions-item>
                <el-descriptions-item label="勞退自提">{{ ((currentDetail.pension_self_rate || 0) * 100).toFixed(1) }}%</el-descriptions-item>
                <el-descriptions-item label="銀行資訊" :span="2">
                  {{ currentDetail.bank_code }} - {{ currentDetail.bank_account }}
                  <span v-if="currentDetail.bank_account_name">（{{ currentDetail.bank_account_name }}）</span>
                </el-descriptions-item>
              </el-descriptions>
            </el-tab-pane>

            <!-- 學歷 -->
            <el-tab-pane label="學歷" name="education">
              <div style="margin-bottom:10px;text-align:right">
                <el-button type="primary" size="small" @click="openEduCreate">
                  <el-icon><Plus /></el-icon> 新增學歷
                </el-button>
              </div>
              <el-table :data="educations" border size="small">
                <el-table-column prop="school_name" label="學校" min-width="140" />
                <el-table-column prop="major" label="科系" min-width="120" />
                <el-table-column prop="degree" label="學位" width="90" />
                <el-table-column prop="graduation_date" label="畢業日期" width="130" />
                <el-table-column label="最高學歷" width="90">
                  <template #default="scope">
                    <el-tag v-if="scope.row.is_highest" type="success" size="small">最高</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="remark" label="備註" min-width="120" show-overflow-tooltip />
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="scope">
                    <el-button link size="small" type="primary" @click="openEduEdit(scope.row)">編輯</el-button>
                    <el-button link size="small" type="danger" @click="confirmDeleteSub('education', scope.row)">刪除</el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <EmptyState title="尚無學歷資料" description="點擊上方「新增學歷」開始建立" />
                </template>
              </el-table>
            </el-tab-pane>

            <!-- 證照 -->
            <el-tab-pane label="證照" name="certificate">
              <div style="margin-bottom:10px;text-align:right">
                <el-button type="primary" size="small" @click="openCertCreate">
                  <el-icon><Plus /></el-icon> 新增證照
                </el-button>
              </div>
              <el-table :data="certificates" border size="small">
                <el-table-column prop="certificate_name" label="證照名稱" min-width="160" />
                <el-table-column prop="issuer" label="頒發機構" min-width="140" />
                <el-table-column prop="certificate_number" label="證照編號" min-width="140" />
                <el-table-column prop="issued_date" label="取得日期" width="130" />
                <el-table-column label="到期日" width="130">
                  <template #default="scope">
                    <span v-if="scope.row.expiry_date">{{ scope.row.expiry_date }}</span>
                    <el-tag v-else size="small" type="info">永久</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="remark" label="備註" min-width="120" show-overflow-tooltip />
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="scope">
                    <el-button link size="small" type="primary" @click="openCertEdit(scope.row)">編輯</el-button>
                    <el-button link size="small" type="danger" @click="confirmDeleteSub('certificate', scope.row)">刪除</el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <EmptyState title="尚無證照資料" description="點擊上方「新增證照」開始建立" />
                </template>
              </el-table>
            </el-tab-pane>

            <!-- 合約 -->
            <el-tab-pane label="合約" name="contract">
              <div style="margin-bottom:10px;text-align:right">
                <el-button type="primary" size="small" @click="openContractCreate">
                  <el-icon><Plus /></el-icon> 新增合約
                </el-button>
              </div>
              <el-table :data="contracts" border size="small">
                <el-table-column prop="contract_type" label="類型" width="90" />
                <el-table-column prop="start_date" label="起始日" width="130" />
                <el-table-column label="結束日" width="130">
                  <template #default="scope">
                    <span v-if="scope.row.end_date">{{ scope.row.end_date }}</span>
                    <el-tag v-else size="small" type="info">未定</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="簽約薪資" width="120">
                  <template #default="scope">
                    <span v-if="scope.row.salary_at_contract != null">{{ Number(scope.row.salary_at_contract).toLocaleString() }}</span>
                    <span v-else>-</span>
                  </template>
                </el-table-column>
                <el-table-column prop="remark" label="備註" min-width="140" show-overflow-tooltip />
                <el-table-column label="操作" width="120" fixed="right">
                  <template #default="scope">
                    <el-button link size="small" type="primary" @click="openContractEdit(scope.row)">編輯</el-button>
                    <el-button link size="small" type="danger" @click="confirmDeleteSub('contract', scope.row)">刪除</el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <EmptyState title="尚無合約資料" description="點擊上方「新增合約」開始建立" />
                </template>
              </el-table>
            </el-tab-pane>

            <!-- 出勤紀錄 -->
            <el-tab-pane label="出勤紀錄" name="attendance">
              <div class="attendance-filter">
                <el-date-picker
                  v-model="attendanceMonth"
                  type="month"
                  placeholder="選擇月份"
                  format="YYYY-MM"
                  value-format="YYYY-MM"
                  @change="fetchAttendance"
                />
              </div>
              <el-table :data="attendanceRecords" height="400" style="width: 100%; margin-top: 10px;">
                <el-table-column prop="date" label="日期" width="120" />
                <el-table-column prop="weekday" label="星期" width="80" />
                <el-table-column prop="punch_in" label="上班" />
                <el-table-column prop="punch_out" label="下班" />
                <el-table-column prop="status" label="狀態">
                  <template #default="scope">
                    <el-tag :type="getAttendanceStatusType(scope.row.status)">{{ scope.row.status }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="150">
                   <template #default="scope">
                      <el-button link type="primary" @click="editAttendance(scope.row)">編輯</el-button>
                      <el-button link type="danger" @click="deleteAttendance(scope.row)">刪除</el-button>
                   </template>
                </el-table-column>
              </el-table>
            </el-tab-pane>
          </el-tabs>
        </section>
      </div>
    </el-dialog>

    <!-- 學歷 / 證照 / 合約 共用子對話框 -->
    <el-dialog
      v-model="subDialog.visible"
      :title="subDialogTitle"
      width="560px"
      append-to-body
    >
      <!-- 學歷 -->
      <el-form v-if="subDialog.kind === 'education'" label-width="110px">
        <el-form-item label="學校名稱" required>
          <el-input v-model="subDialog.form.school_name" />
        </el-form-item>
        <el-form-item label="科系">
          <el-input v-model="subDialog.form.major" />
        </el-form-item>
        <el-form-item label="學位" required>
          <el-select v-model="subDialog.form.degree" style="width:100%">
            <el-option v-for="d in DEGREE_OPTIONS" :key="d" :label="d" :value="d" />
          </el-select>
        </el-form-item>
        <el-form-item label="畢業日期">
          <el-date-picker
            v-model="subDialog.form.graduation_date"
            type="date" value-format="YYYY-MM-DD" style="width:100%" clearable
          />
        </el-form-item>
        <el-form-item label="最高學歷">
          <el-switch v-model="subDialog.form.is_highest" />
          <span style="margin-left:10px;font-size:12px;color:#909399">
            標記後，該員工其他學歷的「最高」會自動取消
          </span>
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="subDialog.form.remark" type="textarea" :rows="2" maxlength="255" />
        </el-form-item>
      </el-form>

      <!-- 證照 -->
      <el-form v-else-if="subDialog.kind === 'certificate'" label-width="110px">
        <el-form-item label="證照名稱" required>
          <el-input v-model="subDialog.form.certificate_name" />
        </el-form-item>
        <el-form-item label="頒發機構">
          <el-input v-model="subDialog.form.issuer" />
        </el-form-item>
        <el-form-item label="證照編號">
          <el-input v-model="subDialog.form.certificate_number" />
        </el-form-item>
        <el-form-item label="取得日期">
          <el-date-picker
            v-model="subDialog.form.issued_date"
            type="date" value-format="YYYY-MM-DD" style="width:100%" clearable
          />
        </el-form-item>
        <el-form-item label="到期日">
          <el-date-picker
            v-model="subDialog.form.expiry_date"
            type="date" value-format="YYYY-MM-DD" style="width:100%" clearable
            placeholder="空值表示永久有效"
          />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="subDialog.form.remark" type="textarea" :rows="2" maxlength="255" />
        </el-form-item>
      </el-form>

      <!-- 合約 -->
      <el-form v-else-if="subDialog.kind === 'contract'" label-width="110px">
        <el-form-item label="合約類型" required>
          <el-select v-model="subDialog.form.contract_type" style="width:100%">
            <el-option v-for="t in CONTRACT_TYPE_OPTIONS" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="起始日" required>
          <el-date-picker
            v-model="subDialog.form.start_date"
            type="date" value-format="YYYY-MM-DD" style="width:100%"
          />
        </el-form-item>
        <el-form-item label="結束日">
          <el-date-picker
            v-model="subDialog.form.end_date"
            type="date" value-format="YYYY-MM-DD" style="width:100%" clearable
            placeholder="空值表示未定"
          />
        </el-form-item>
        <el-form-item label="簽約薪資">
          <el-input-number
            v-model="subDialog.form.salary_at_contract"
            :min="0" style="width:100%"
          />
        </el-form-item>
        <el-form-item label="備註">
          <el-input v-model="subDialog.form.remark" type="textarea" :rows="2" maxlength="255" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="subDialog.visible = false">取消</el-button>
        <el-button type="primary" @click="submitSub">儲存</el-button>
      </template>
    </el-dialog>
    <!-- Offboard Dialog -->
    <el-dialog v-model="offboardVisible" title="辦理離職" width="560px">
      <el-form label-width="100px">
        <el-form-item label="員工">
          <strong>{{ offboardTarget?.name }}</strong>（{{ offboardTarget?.employee_id }}）
        </el-form-item>
        <el-form-item label="離職日期" required>
          <el-date-picker
            v-model="offboardForm.resign_date"
            type="date"
            placeholder="選擇離職日期（可為未來日期）"
            style="width: 100%"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        <el-form-item label="離職原因">
          <el-input
            v-model="offboardForm.resign_reason"
            type="textarea"
            :rows="3"
            placeholder="選填"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>

        <!-- 最終薪資預覽 -->
        <el-divider content-position="left">最終薪資預覽</el-divider>
        <div v-if="finalSalaryLoading" style="text-align:center;padding:12px">
          <el-icon class="is-loading"><Loading /></el-icon> 計算中...
        </div>
        <template v-else-if="finalSalaryPreview">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="底薪">
              NT${{ finalSalaryPreview.base_salary?.toLocaleString() }}
              <span v-if="finalSalaryPreview.proration_note" style="color:#e6a23c;font-size:12px;margin-left:6px">
                （{{ finalSalaryPreview.proration_note }}）
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="應發合計">NT${{ finalSalaryPreview.gross_salary?.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="各項扣款">NT${{ finalSalaryPreview.total_deduction?.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="預估實發" :span="2">
              <strong style="color:#67c23a;font-size:16px">NT${{ finalSalaryPreview.net_salary?.toLocaleString() }}</strong>
            </el-descriptions-item>
          </el-descriptions>
        </template>
        <div v-else-if="offboardForm.resign_date" style="color:#999;font-size:13px;padding:8px 0">
          薪資預覽無法取得（請確認薪資引擎已啟用）
        </div>
        <div v-else style="color:#bbb;font-size:13px;padding:8px 0">請先選擇離職日期以顯示薪資預覽</div>
      </el-form>
      <template #footer>
        <el-button @click="offboardVisible = false">取消</el-button>
        <el-button type="danger" :loading="offboardLoading" @click="submitOffboard">確認辦理離職</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dialog-footer {
  display: flex;
  justify-content: flex-end;
}

.detail-layout {
  display: flex;
  gap: 16px;
  min-height: 500px;
}
.detail-aside {
  flex: 0 0 28%;
  border-right: 1px solid var(--el-border-color-lighter);
  padding-right: 16px;
  text-align: center;
}
.detail-main {
  flex: 1 1 72%;
  min-width: 0;
}

/* 手機版：詳情 dialog 改單欄堆疊 */
.detail-layout.is-mobile {
  flex-direction: column;
  min-height: 0;
  gap: 12px;
}
.detail-layout.is-mobile .detail-aside {
  flex: 0 0 auto;
  border-right: none;
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding-right: 0;
  padding-bottom: 12px;
}
.detail-layout.is-mobile .detail-main {
  flex: 1 1 auto;
}
.detail-layout.is-mobile .avatar-placeholder {
  width: 80px;
  height: 80px;
  margin: 4px auto 8px;
}
.detail-layout.is-mobile .emp-name {
  font-size: 16px;
}

/* 手機版：el-descriptions 內部調整由 :column="1" 處理；
   表單 grid（el-row/el-col）的響應式落在全域 main.css，避免逐視圖重寫 */
.avatar-placeholder {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: var(--el-color-info-light-9);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px auto 16px;
}
.emp-name {
  margin: 0 0 12px;
  font-size: 18px;
}
.emp-meta {
  text-align: left;
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.9;
  padding: 0 4px;
}
.emp-meta .meta-label {
  display: inline-block;
  width: 48px;
  color: var(--el-text-color-secondary);
}
</style>

<!-- 手機版表單欄位響應式：dialog 內容被 teleport 到 body，scoped 規則無法穿透，
     用非 scoped block 提供全域 fallback，但僅針對含 .responsive-form-dialog 的 dialog -->
<style>
@media (max-width: 767px) {
  .el-overlay-dialog .el-dialog.is-fullscreen .el-row .el-col {
    width: 100% !important;
    max-width: 100% !important;
    flex: 0 0 100% !important;
  }
  .el-overlay-dialog .el-dialog.is-fullscreen .el-form .el-form-item__label {
    width: auto !important;
    text-align: left !important;
    line-height: 1.4 !important;
    padding: 0 0 4px !important;
  }
  .el-overlay-dialog .el-dialog.is-fullscreen .el-form .el-form-item__content {
    margin-left: 0 !important;
  }
  .el-overlay-dialog .el-dialog.is-fullscreen .el-tabs--border-card > .el-tabs__content {
    padding: 12px;
  }
  .el-overlay-dialog .el-dialog.is-fullscreen .el-descriptions__cell {
    padding: 8px 10px !important;
  }
}
</style>
