<script setup>
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { Loading, User } from '@element-plus/icons-vue'
import {
  getEmployee, getEmployees, createEmployee, updateEmployee, offboard, getFinalSalaryPreview,
  listEmployeeEducations, createEmployeeEducation, updateEmployeeEducation, deleteEmployeeEducation,
  listEmployeeCertificates, createEmployeeCertificate, updateEmployeeCertificate, deleteEmployeeCertificate,
  listEmployeeContracts, createEmployeeContract, updateEmployeeContract, deleteEmployeeContract,
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
import { apiError } from '@/utils/error'
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

const employeeStore = useEmployeeStore()
const classroomStore = useClassroomStore()
const configStore = useConfigStore()

const loading = ref(false)
const currentDetail = ref({})
const detailDialogVisible = ref(false)
const formRef = ref(null)

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

// 用於區分「載入舊資料」vs「使用者手動修改」，避免 populateForm 觸發連動
let _populatingForm = false
// 用於防止 Watch 1 改變 base_salary 時連動觸發 Watch 2
let _bulkUpdating = false

// 根據職稱 + 職位 + bonus_grade 計算並自動套用標準底薪
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
  if (salary !== null) {
    _bulkUpdating = true
    form.base_salary = salary
    nextTick(() => { _bulkUpdating = false })
  }
})

// 基本薪資變動時自動連動投保級距（排除 populateForm 載入與 Watch 1 的連動觸發）
watch(() => form.base_salary, (val) => {
  if (_bulkUpdating || _populatingForm) return
  form.insurance_salary_level = val
})

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
  _populatingForm = true
  Object.assign(form, row)
  form.base_salary = Number(row.base_salary)
  form.hourly_rate = Number(row.hourly_rate)
  // 投保級距若為 0 或與底薪不一致，開啟編輯時自動對齊底薪
  if (!form.insurance_salary_level || form.insurance_salary_level !== form.base_salary) {
    form.insurance_salary_level = form.base_salary
  }
  nextTick(() => { _populatingForm = false })
}

const { dialogVisible, isEdit, openCreate: handleAdd, openEdit: handleEdit, closeDialog } = useCrudDialog({ resetForm, populateForm })

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

const saveEmployee = async () => {
  if (!formRef.value) return
  form.supervisor_role = form.supervisor_role || null
  form.bonus_grade = form.bonus_grade ? form.bonus_grade.toUpperCase() : null
  if (form.bonus_grade && !['A', 'B', 'C'].includes(form.bonus_grade)) {
    ElMessage.error('獎金等級覆蓋僅接受 A / B / C')
    return
  }
  await formRef.value.validate(async (valid) => {
    if (valid) {
      try {
        if (isEdit.value) {
          await updateEmployee(form.id, form)
          ElMessage.success('員工資料已更新')
        } else {
          await createEmployee(form)
          ElMessage.success('員工已新增')
        }
        closeDialog()
        fetchEmployees()
      } catch (error) {
        ElMessage.error('操作失敗: ' + apiError(error, error.message))
      }
    }
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
        <el-table-column fixed="right" label="操作" width="240">
          <template #default="scope">
            <el-button link type="primary" size="small" @click="handleDetail(scope.row)">詳情</el-button>
            <el-button link type="primary" size="small" @click="handleEdit(scope.row)">編輯</el-button>
            <el-button v-if="scope.row.is_active" link type="warning" size="small" @click="openOffboard(scope.row)">辦理離職</el-button>
            <el-button link type="danger" size="small" @click="handleDelete(scope.row)" :loading="deleteLoading">刪除</el-button>
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
      width="800px"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-width="140px">
        <el-tabs type="border-card">
          <el-tab-pane label="基本資料">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="員工編號" prop="employee_id">
                  <el-input v-model="form.employee_id" placeholder="例: EMP001" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="姓名" prop="name">
                  <el-input v-model="form.name" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="教育局系統" prop="job_title_id">
                  <el-select v-model="form.job_title_id" placeholder="請選擇教育局系統職稱" style="width: 100%">
                    <el-option
                      v-for="item in bureauJobTitleOptions"
                      :key="item.id"
                      :label="item.name"
                      :value="item.id"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="職位" prop="position">
                  <el-select
                    v-model="form.position"
                    filterable
                    allow-create
                    default-first-option
                    placeholder="選擇或輸入職位"
                    style="width: 100%"
                  >
                    <el-option v-for="p in POSITION_OPTIONS" :key="p" :label="p" :value="p" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="獎金等級覆蓋">
                  <el-select v-model="form.bonus_grade" clearable filterable allow-create placeholder="自動（依教育局系統）" style="width: 100%">
                    <el-option label="A 級（幼兒園教師）" value="A" />
                    <el-option label="B 級（教保員）" value="B" />
                    <el-option label="C 級（助理教保員）" value="C" />
                  </el-select>
                  <div style="font-size:12px;color:#909399;margin-top:4px">保留手動覆蓋用於特例調整；請輸入或選擇 A / B / C，空白表示依教育局系統自動判斷</div>
                </el-form-item>
              </el-col>
              <el-col :span="12" v-if="suggestedSalary !== null">
                <el-form-item label="標準底薪">
                  <span style="font-size:14px;color:#909399">{{ suggestedSalary?.toLocaleString() }}（已自動套用）</span>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="部門">
                  <el-input v-model="form.department" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="員工類型">
                  <el-select v-model="form.employee_type" style="width: 100%">
                    <el-option
                      v-for="opt in EMPLOYEE_TYPE_OPTIONS"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="到職日期">
                  <el-date-picker v-model="form.hire_date" type="date" placeholder="選擇日期" style="width: 100%" value-format="YYYY-MM-DD" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="試用期結束">
                  <el-date-picker v-model="form.probation_end_date" type="date" placeholder="選擇日期" style="width: 100%" value-format="YYYY-MM-DD" clearable />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="生日">
                  <el-date-picker v-model="form.birthday" type="date" placeholder="選擇日期" style="width: 100%" value-format="YYYY-MM-DD" clearable />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="身分證字號">
                  <el-input v-model="form.id_number" placeholder="保留遮罩值將不會更新" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="主管職">
              <el-select v-model="form.supervisor_role" clearable placeholder="無主管職" style="width: 100%">
                <el-option v-for="item in SUPERVISOR_ROLE_OPTIONS" :key="item" :label="item" :value="item" />
              </el-select>
            </el-form-item>
            <el-form-item label="班級">
              <el-select v-model="form.classroom_id" placeholder="選擇班級" clearable style="width: 100%">
                <el-option
                  v-for="c in classroomStore.classrooms"
                  :key="c.id"
                  :label="`${c.name} (${c.grade_name || ''})`"
                  :value="c.id"
                />
              </el-select>
            </el-form-item>
            <el-divider content-position="left">聯絡與緊急聯絡</el-divider>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="聯絡電話">
                  <el-input v-model="form.phone" placeholder="例：0912-345-678" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="眷屬人數">
                  <el-input-number v-model="form.dependents" :min="0" :max="9" :step="1" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="通訊地址">
              <el-input v-model="form.address" type="textarea" :rows="2" />
            </el-form-item>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="緊急聯絡人">
                  <el-input v-model="form.emergency_contact_name" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="緊急聯絡電話">
                  <el-input v-model="form.emergency_contact_phone" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-tab-pane>

          <el-tab-pane label="薪資">
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="基本薪資">
                  <el-input-number v-model="form.base_salary" :min="0" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="時薪">
                  <el-input-number v-model="form.hourly_rate" :min="0" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="投保級距">
                  <el-input-number v-model="form.insurance_salary_level" :min="0" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="勞退自提">
                  <el-input-number
                    v-model="form.pension_self_rate"
                    :min="0" :max="0.06" :step="0.01" :precision="2"
                    style="width: 100%"
                  />
                  <div style="font-size:12px;color:#909399;margin-top:4px">最高 6%（0.06）</div>
                </el-form-item>
              </el-col>
            </el-row>
          </el-tab-pane>

          <el-tab-pane label="銀行與工作資訊">
             <el-row :gutter="20">
              <el-col :span="8">
                <el-form-item label="銀行代碼">
                  <el-input v-model="form.bank_code" />
                </el-form-item>
              </el-col>
              <el-col :span="16">
                <el-form-item label="帳號">
                  <el-input v-model="form.bank_account" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="戶名">
               <el-input v-model="form.bank_account_name" />
            </el-form-item>
            <el-divider />
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="上班時間">
                  <el-time-select v-model="form.work_start_time" start="06:00" step="00:30" end="22:00" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="下班時間">
                  <el-time-select v-model="form.work_end_time" start="06:00" step="00:30" end="22:00" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-tab-pane>
        </el-tabs>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="closeDialog">取消</el-button>
          <el-button type="primary" @click="saveEmployee">儲存</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Detail Dialog：左右欄位佈局 -->
    <el-dialog v-model="detailDialogVisible" title="員工詳情" width="1100px" top="5vh">
      <div class="detail-layout">
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
              <el-descriptions :column="2" border>
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
              <el-descriptions :column="2" border>
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
              <el-descriptions :column="2" border>
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
