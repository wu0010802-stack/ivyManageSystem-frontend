<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import { getEmployee, createEmployee, updateEmployee, offboard, getFinalSalaryPreview } from '@/api/employees'
import { getRecords as getAttendanceRecords, uploadCsv, deleteEmployeeDateRecord } from '@/api/attendance'
import { ElMessage, ElMessageBox } from 'element-plus'
import EmptyState from '@/components/common/EmptyState.vue'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import { useEmployeeStore } from '@/stores/employee'
import { useClassroomStore } from '@/stores/classroom'
import { useConfigStore } from '@/stores/config'
import { useCrudDialog, useConfirmDelete } from '@/composables'
import { downloadFile } from '@/utils/download'

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

const form = reactive({
  id: null,
  employee_id: '',
  name: '',
  job_title_id: null,
  position: '',
  department: 'Teaching',
  phone: '',
  email: '',
  hire_date: '',
  probation_end_date: '',
  is_office_staff: false,
  classroom_id: null,
  base_salary: 0,
  hourly_rate: 0,
  insurance_salary_level: 0,
  supervisor_allowance: 0,
  teacher_allowance: 0,
  dependents: 0,
  meal_allowance: 0,
  transportation_allowance: 0,
  other_allowance: 0,
  bank_code: '',
  bank_account: '',
  bank_name: '',
  work_start_time: '08:00',
  work_end_time: '17:00'
})

// 當 hire_date 變動時，若 probation_end_date 尚未填寫，自動建議 hire_date + 3 個月
watch(() => form.hire_date, (val) => {
  if (val && !form.probation_end_date) {
    const d = new Date(val)
    d.setMonth(d.getMonth() + 3)
    form.probation_end_date = d.toISOString().slice(0, 10)
  }
})

// ── 辦理離職 ──────────────────────────────────────
const offboardVisible = ref(false)
const offboardTarget = ref(null)  // 目標員工資料
const offboardForm = reactive({ resign_date: '', resign_reason: '' })
const offboardLoading = ref(false)
const finalSalaryPreview = ref(null)
const finalSalaryLoading = ref(false)

const getEmployeeStatus = (emp) => {
  const today = new Date().toISOString().slice(0, 10)
  if (!emp.is_active) return { label: '已離職', type: 'info' }
  if (emp.resign_date && emp.resign_date > today) {
    return { label: `待離職・${emp.resign_date}`, type: 'warning' }
  }
  if (emp.probation_end_date && emp.probation_end_date >= today) {
    const diff = Math.ceil((new Date(emp.probation_end_date) - new Date(today)) / 86400000)
    return { label: `試用中・剩 ${diff} 天`, type: 'primary' }
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
let _searchTimer = null
watch(searchQuery, (val) => {
  clearTimeout(_searchTimer)
  _searchTimer = setTimeout(() => { debouncedSearch.value = val }, 300)
})

const filteredEmployees = computed(() => {
  if (!debouncedSearch.value) return employeeStore.employees
  const query = debouncedSearch.value.toLowerCase()
  return employeeStore.employees.filter(emp =>
    emp.name.toLowerCase().includes(query) ||
    emp.employee_id.toLowerCase().includes(query) ||
    (emp.title && emp.title.toLowerCase().includes(query))
  )
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
  form.classroom_id = null
  form.department = 'Teaching'
  form.work_start_time = '08:00'
  form.work_end_time = '17:00'
  form.probation_end_date = ''
}

const populateForm = (row) => {
  Object.assign(form, row)
  form.base_salary = Number(row.base_salary)
  form.hourly_rate = Number(row.hourly_rate)
}

const { dialogVisible, isEdit, openCreate: handleAdd, openEdit: handleEdit, closeDialog } = useCrudDialog({ resetForm, populateForm })

const { confirmDelete: handleDelete } = useConfirmDelete({
  endpoint: '/employees',
  onSuccess: fetchEmployees,
  successMsg: '刪除成功',
})

const attendanceRecords = ref([])
const attendanceMonth = ref(new Date().toISOString().slice(0, 7)) // YYYY-MM
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

const handleDetail = async (row) => {
  try {
    const response = await getEmployee(row.id)
    currentDetail.value = response.data
    // Default to current month or whatever is set
    attendanceMonth.value = new Date().toISOString().slice(0, 7)
    await fetchAttendance()
    detailDialogVisible.value = true
  } catch (error) {
    ElMessage.error('載入詳情失敗')
  }
}

const saveEmployee = async () => {
  if (!formRef.value) return
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
        ElMessage.error('操作失敗: ' + (error.response?.data?.detail || error.message))
      }
    }
  })
}

onMounted(() => {
  fetchEmployees()
  configStore.fetchJobTitles()
  classroomStore.fetchClassrooms()
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
        <el-table-column prop="title" label="職稱" width="150" sortable />
        <el-table-column prop="position" label="職位" width="120" />
        <el-table-column prop="hire_date" label="到職日" width="120" sortable />
        <el-table-column label="試用期至" width="130">
          <template #default="scope">
            <template v-if="scope.row.probation_end_date">
              <span v-if="scope.row.probation_end_date < new Date().toISOString().slice(0,10)" style="color:#999">已過試用</span>
              <span v-else>{{ scope.row.probation_end_date }}</span>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
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
            <el-button link type="danger" size="small" @click="handleDelete(scope.row)">刪除</el-button>
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
                <el-form-item label="職稱" prop="job_title_id">
                  <el-select v-model="form.job_title_id" placeholder="請選擇職稱" style="width: 100%">
                    <el-option
                      v-for="item in configStore.jobTitles"
                      :key="item.id"
                      :label="item.name"
                      :value="item.id"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="職位" prop="position">
                  <el-input v-model="form.position" placeholder="例: 教師" />
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
                <el-form-item label="到職日期">
                  <el-date-picker v-model="form.hire_date" type="date" placeholder="選擇日期" style="width: 100%" value-format="YYYY-MM-DD" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="試用期結束日">
                  <el-date-picker v-model="form.probation_end_date" type="date" placeholder="選擇日期（可自動建議）" style="width: 100%" value-format="YYYY-MM-DD" clearable />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="行政人員">
              <el-switch v-model="form.is_office_staff" active-text="是" inactive-text="否" />
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
          </el-tab-pane>

          <el-tab-pane label="薪資與津貼">
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
                <el-form-item label="眷屬人數">
                  <el-input-number v-model="form.dependents" :min="0" :max="3" :step="1" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-divider content-position="center">津貼</el-divider>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="主管加給">
                  <el-input-number v-model="form.supervisor_allowance" :min="0" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="教師加給">
                  <el-input-number v-model="form.teacher_allowance" :min="0" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="伙食津貼">
                  <el-input-number v-model="form.meal_allowance" :min="0" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="交通津貼">
                  <el-input-number v-model="form.transportation_allowance" :min="0" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
             <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="其他津貼">
                  <el-input-number v-model="form.other_allowance" :min="0" style="width: 100%" />
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
               <el-input v-model="form.bank_name" />
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

    <!-- Detail Dialog -->
    <el-dialog v-model="detailDialogVisible" title="員工詳情" width="800px">
      <el-tabs type="border-card">
        <el-tab-pane label="基本資料">
          <el-descriptions :title="currentDetail.name" :column="2" border>
            <el-descriptions-item label="編號">{{ currentDetail.employee_id }}</el-descriptions-item>
            <el-descriptions-item label="職稱">{{ currentDetail.job_title_name || currentDetail.title }}</el-descriptions-item>
            <el-descriptions-item label="職位">{{ currentDetail.position }}</el-descriptions-item>
            <el-descriptions-item label="到職日">{{ currentDetail.hire_date }}</el-descriptions-item>
            <el-descriptions-item label="試用期至">{{ currentDetail.probation_end_date || '-' }}</el-descriptions-item>
            <el-descriptions-item label="在職狀態">
              <el-tag :type="getEmployeeStatus(currentDetail).type" size="small">
                {{ getEmployeeStatus(currentDetail).label }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item v-if="currentDetail.resign_date" label="離職日">{{ currentDetail.resign_date }}</el-descriptions-item>
            <el-descriptions-item v-if="currentDetail.resign_reason" label="離職原因">{{ currentDetail.resign_reason }}</el-descriptions-item>
            <el-descriptions-item label="基本薪資">{{ currentDetail.base_salary }}</el-descriptions-item>
            <el-descriptions-item label="投保級距">{{ currentDetail.insurance_salary_level }}</el-descriptions-item>
            <el-descriptions-item label="行政人員">
              <el-tag size="small">{{ currentDetail.is_office_staff ? '是' : '否' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="班級">{{ currentDetail.classroom_name || '-' }}</el-descriptions-item>
            <el-descriptions-item label="銀行資訊">{{ currentDetail.bank_code }} - {{ currentDetail.bank_account }} ({{ currentDetail.bank_name }})</el-descriptions-item>
          </el-descriptions>
          <el-divider content-position="left">津貼</el-divider>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="主管加給">{{ currentDetail.supervisor_allowance }}</el-descriptions-item>
            <el-descriptions-item label="教師加給">{{ currentDetail.teacher_allowance }}</el-descriptions-item>
            <el-descriptions-item label="伙食津貼">{{ currentDetail.meal_allowance }}</el-descriptions-item>
            <el-descriptions-item label="交通津貼">{{ currentDetail.transportation_allowance }}</el-descriptions-item>
            <el-descriptions-item label="其他津貼">{{ currentDetail.other_allowance }}</el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>
        <el-tab-pane label="出勤紀錄">
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
            <el-descriptions-item label="各項津貼">NT${{ finalSalaryPreview.total_allowance?.toLocaleString() }}</el-descriptions-item>
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
</style>
