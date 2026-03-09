<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { getTitles, createTitle, updateTitle, deleteTitle, getAttendancePolicy, updateAttendancePolicy, getInsuranceRates, updateInsuranceRates } from '@/api/config'
import { createShiftType, updateShiftType, deleteShiftType } from '@/api/shifts'
import { getUsers, getPermissions, createUser, updateUser, deleteUser, resetPassword } from '@/api/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useConfigStore } from '@/stores/config'
import { useEmployeeStore } from '@/stores/employee'
import { useShiftStore } from '@/stores/shift'

const configStore = useConfigStore()
const employeeStore = useEmployeeStore()
const shiftStore = useShiftStore()

const activeTab = ref('titles')
const loadingTitles = ref(false)
const titleDialogVisible = ref(false)
const titleForm = reactive({ id: null, name: '', rank: 0 })

// User Accounts
const users = ref([])
const employees = computed(() => employeeStore.employees)
const loadingUsers = ref(false)
const userDialogVisible = ref(false)
const userForm = reactive({ employee_id: null, username: '', password: '', role: 'teacher', permissions: -1 })
const resetPasswordForm = reactive({ user_id: null, username: '', new_password: '' })
const resetDialogVisible = ref(false)
const editUserDialogVisible = ref(false)
const editUserForm = reactive({ id: null, username: '', role: 'teacher', permissions: -1 })
const permissionDefinition = ref({ permissions: {}, groups: [], roles: {} })

// Attendance Config
const attendanceConfig = reactive({
  late_threshold: 2,
  festival_bonus_months: 3
})

// Shift Types（由 shiftStore 管理，computed 別名讓 template 不需改動）
const shiftTypes = computed(() => shiftStore.shiftTypes)
const loadingShifts = computed(() => shiftStore.loading)
const shiftDialogVisible = ref(false)
const shiftForm = reactive({ id: null, name: '', work_start: '08:00', work_end: '17:00', sort_order: 0 })

// Insurance Config
const insuranceConfig = reactive({
  rate_year: new Date().getFullYear(),
  labor_rate: 0,
  labor_employee_ratio: 0,
  labor_employer_ratio: 0,
  labor_government_ratio: 0,
  health_rate: 0,
  health_employee_ratio: 0,
  health_employer_ratio: 0,
  pension_employer_rate: 0,
  average_dependents: 0
})
const loadingInsurance = ref(false)

// ---- Job Titles ----
const fetchJobTitles = async () => {
  loadingTitles.value = true
  try {
    await configStore.fetchJobTitles(true)
  } catch (error) {
    ElMessage.error('載入職稱失敗')
  } finally {
    loadingTitles.value = false
  }
}

const handleAddTitle = () => {
  titleForm.id = null
  titleForm.name = ''
  titleForm.rank = configStore.jobTitles.length + 1
  titleDialogVisible.value = true
}

const handleEditTitle = (row) => {
  titleForm.id = row.id
  titleForm.name = row.name
  titleForm.rank = row.rank
  titleDialogVisible.value = true
}

const handleDeleteTitle = (row) => {
  ElMessageBox.confirm(`確定刪除職稱「${row.name}」？`, '警告', {
    type: 'warning'
  }).then(async () => {
    try {
      await deleteTitle(row.id)
      ElMessage.success('已刪除')
      fetchJobTitles()
    } catch (error) {
      ElMessage.error('刪除失敗')
    }
  })
}

const saveTitle = async () => {
  try {
    if (titleForm.id) {
      await updateTitle(titleForm.id, titleForm)
    } else {
      await createTitle(titleForm)
    }
    ElMessage.success('已儲存')
    titleDialogVisible.value = false
    fetchJobTitles()
  } catch (error) {
    ElMessage.error('儲存失敗')
  }
}

// ---- Attendance ----
const fetchAttendanceConfig = async () => {
  try {
    const response = await getAttendancePolicy()
    if (response.data && response.data.id) {
      Object.assign(attendanceConfig, response.data)
    }
  } catch (error) {
    ElMessage.error('載入考勤規則失敗')
  }
}

const saveAttendanceConfig = async () => {
  try {
    await updateAttendancePolicy(attendanceConfig)
    ElMessage.success('考勤規則已儲存')
  } catch (error) {
    ElMessage.error('儲存考勤規則失敗: ' + (error.response?.data?.detail || error.message))
  }
}

// ---- Insurance ----
const fetchInsuranceRates = async () => {
  loadingInsurance.value = true
  try {
    const response = await getInsuranceRates()
    if (response.data && response.data.id) {
      Object.assign(insuranceConfig, response.data)
    }
  } catch (error) {
    ElMessage.error('載入勞健保費率失敗')
  } finally {
    loadingInsurance.value = false
  }
}

const saveInsuranceRates = async () => {
  loadingInsurance.value = true
  try {
    await updateInsuranceRates(insuranceConfig)
    ElMessage.success('勞健保費率已儲存')
  } catch (error) {
    ElMessage.error('儲存勞健保費率失敗')
  } finally {
    loadingInsurance.value = false
  }
}

// ---- Shift Types ----
const handleAddShift = () => {
  shiftForm.id = null
  shiftForm.name = ''
  shiftForm.work_start = '08:00'
  shiftForm.work_end = '17:00'
  shiftForm.sort_order = shiftTypes.value.length + 1
  shiftDialogVisible.value = true
}

const handleEditShift = (row) => {
  shiftForm.id = row.id
  shiftForm.name = row.name
  shiftForm.work_start = row.work_start
  shiftForm.work_end = row.work_end
  shiftForm.sort_order = row.sort_order
  shiftDialogVisible.value = true
}

const handleDeleteShift = (row) => {
  ElMessageBox.confirm(`確定刪除班別「${row.name}」？`, '警告', { type: 'warning' })
    .then(async () => {
      try {
        await deleteShiftType(row.id)
        ElMessage.success('已刪除')
        shiftStore.refresh()
      } catch (error) {
        ElMessage.error(error.response?.data?.detail || '刪除失敗')
      }
    })
}

const saveShift = async () => {
  if (!shiftForm.name) {
    ElMessage.warning('請填寫班別名稱')
    return
  }
  try {
    if (shiftForm.id) {
      await updateShiftType(shiftForm.id, shiftForm)
    } else {
      await createShiftType(shiftForm)
    }
    ElMessage.success('已儲存')
    shiftDialogVisible.value = false
    shiftStore.refresh()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '儲存失敗')
  }
}

// ---- User Accounts ----
const fetchUsers = async () => {
  loadingUsers.value = true
  try {
    const res = await getUsers()
    users.value = res.data
  } catch (error) {
    // Admin token may not be set - silently fail
  } finally {
    loadingUsers.value = false
  }
}

const fetchPermissionDefinition = async () => {
  try {
    const res = await getPermissions()
    permissionDefinition.value = res.data
  } catch (error) {
    console.error('載入權限定義失敗', error)
  }
}

const availableEmployees = () => {
  const existingIds = new Set(users.value.map(u => u.employee_id))
  return employees.value.filter(e => !existingIds.has(e.id))
}

const handleAddUser = () => {
  userForm.employee_id = null
  userForm.username = ''
  userForm.password = ''
  userForm.role = 'teacher'
  userForm.permissions = -1
  employeeStore.fetchEmployees()
  userDialogVisible.value = true
}

const saveUser = async () => {
  if (!userForm.employee_id || !userForm.username || !userForm.password) {
    ElMessage.warning('請填寫所有欄位')
    return
  }
  try {
    // 若使用預設權限則不傳 permissions，讓後端套用角色模板
    const payload = {
      employee_id: userForm.employee_id,
      username: userForm.username,
      password: userForm.password,
      role: userForm.role,
    }
    if (!isUsingDefaultPermissions(userForm)) {
      payload.permissions = userForm.permissions
    }
    await createUser(payload)
    ElMessage.success('帳號建立成功')
    userDialogVisible.value = false
    fetchUsers()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '建立失敗')
  }
}

const handleResetPassword = (user) => {
  resetPasswordForm.user_id = user.id
  resetPasswordForm.username = user.username
  resetPasswordForm.new_password = ''
  resetDialogVisible.value = true
}

const submitResetPassword = async () => {
  if (!resetPasswordForm.new_password) {
    ElMessage.warning('請輸入新密碼')
    return
  }
  try {
    await resetPassword(resetPasswordForm.user_id, resetPasswordForm.new_password)
    ElMessage.success('密碼重設成功')
    resetDialogVisible.value = false
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '重設失敗')
  }
}

const handleDeleteUser = (user) => {
  ElMessageBox.confirm(`確定刪除帳號 ${user.username}？`, '警告', { type: 'warning' })
    .then(async () => {
      try {
        await deleteUser(user.id)
        ElMessage.success('帳號已刪除')
        fetchUsers()
      } catch (error) {
        ElMessage.error('刪除失敗')
      }
    })
}

const autoFillUsername = () => {
  if (userForm.employee_id) {
    const emp = employees.value.find(e => e.id === userForm.employee_id)
    if (emp && !userForm.username) {
      userForm.username = emp.employee_id || emp.name
    }
  }
}

const handleEditUser = (user) => {
  editUserForm.id = user.id
  editUserForm.username = user.username
  editUserForm.role = user.role
  editUserForm.permissions = user.permissions ?? -1
  editUserDialogVisible.value = true
}

const saveEditUser = async () => {
  try {
    const payload = { role: editUserForm.role }
    // 只有非 teacher 角色且權限不是預設時才傳 permissions
    if (editUserForm.role !== 'teacher' && !isUsingDefaultPermissions(editUserForm)) {
      payload.permissions = editUserForm.permissions
    }
    await updateUser(editUserForm.id, payload)
    ElMessage.success('使用者已更新')
    editUserDialogVisible.value = false
    fetchUsers()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '更新失敗')
  }
}

// 權限 checkbox 相關
const isPermissionChecked = (form, permName) => {
  if (form.permissions === -1) return true
  const permValue = permissionDefinition.value.permissions[permName]?.value || 0
  return (form.permissions & permValue) === permValue
}

const togglePermission = (form, permName) => {
  const permValue = permissionDefinition.value.permissions[permName]?.value || 0
  if (form.permissions === -1) {
    // 從全部權限切換，先計算所有權限的值，然後關掉這個
    let allPerms = 0
    for (const p of Object.values(permissionDefinition.value.permissions)) {
      allPerms |= p.value
    }
    form.permissions = allPerms & ~permValue
  } else if ((form.permissions & permValue) === permValue) {
    // 已勾選，取消
    form.permissions = form.permissions & ~permValue
  } else {
    // 未勾選，勾選
    form.permissions = form.permissions | permValue
  }
}

const selectAllPermissions = (form) => {
  form.permissions = -1
}

const clearAllPermissions = (form) => {
  form.permissions = 0
}

const getPermissionLabel = (permName) => {
  return permissionDefinition.value.permissions[permName]?.label || permName
}

const getRoleTagType = (role) => {
  const types = {
    admin: 'danger',
    hr: 'warning',
    supervisor: 'success',
    teacher: '',
  }
  return types[role] || ''
}

const getRoleLabel = (role) => {
  return permissionDefinition.value.roles[role]?.label || role
}

// 角色變更時套用預設權限
const onRoleChange = (form) => {
  const roleConfig = permissionDefinition.value.roles[form.role]
  if (roleConfig) {
    form.permissions = roleConfig.permissions
  }
}

// 檢查是否使用預設權限
const isUsingDefaultPermissions = (form) => {
  const roleConfig = permissionDefinition.value.roles[form.role]
  return roleConfig && form.permissions === roleConfig.permissions
}

// 檢查用戶列表中的用戶是否使用角色預設權限
const isUsingRoleDefault = (row) => {
  const roleConfig = permissionDefinition.value.roles[row.role]
  return roleConfig && row.permissions === roleConfig.permissions
}

onMounted(() => {
  fetchJobTitles()
  fetchAttendanceConfig()
  fetchInsuranceRates()
  shiftStore.fetchShiftTypes()
  fetchUsers()
  fetchPermissionDefinition()
})
</script>

<template>
  <div class="settings-page">
    <h2>系統設定</h2>

    <el-tabs v-model="activeTab" type="card">
      <!-- Job Titles -->
      <el-tab-pane label="職稱管理" name="titles">
        <div class="tab-header">
          <el-button type="primary" @click="handleAddTitle">新增職稱</el-button>
        </div>
        <el-table :data="configStore.jobTitles" v-loading="loadingTitles" style="width: 100%; margin-top: 20px;">
          <el-table-column prop="rank" label="排序" width="80" sortable />
          <el-table-column prop="name" label="名稱" />
          <el-table-column label="操作" width="150">
            <template #default="scope">
              <el-button link type="primary" @click="handleEditTitle(scope.row)">編輯</el-button>
              <el-button link type="danger" @click="handleDeleteTitle(scope.row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Attendance Rules -->
      <el-tab-pane label="考勤規則" name="attendance">
        <el-alert
          title="考勤扣款說明"
          type="info"
          :closable="false"
          style="margin: 20px 0;"
        >
          <template #default>
            <p style="margin: 4px 0;">• 遲到 / 早退扣款按底薪比例逐分鐘計算：<strong>底薪 ÷ (30天 × 8小時 × 60分鐘)</strong></p>
            <p style="margin: 4px 0;">• 無寬限期，遲到或早退即開始計算扣款</p>
            <p style="margin: 4px 0;">• 遲到超過指定分鐘數，自動轉為事假半天扣款</p>
            <p style="margin: 4px 0;">• 未打卡僅記錄，不另外扣款</p>
          </template>
        </el-alert>
        <el-form label-width="220px" style="max-width: 600px;">
          <el-form-item label="自動轉事假門檻 (分鐘)">
            <el-input-number v-model="attendanceConfig.late_threshold" :min="0" :step="10" />
            <div style="color: #909399; font-size: 12px; margin-top: 4px;">遲到超過此分鐘數自動轉為事假半天</div>
          </el-form-item>
          <el-form-item label="獎金最低在職月數">
            <el-input-number v-model="attendanceConfig.festival_bonus_months" :min="0" />
            <div style="color: #909399; font-size: 12px; margin-top: 4px;">員工需在職滿此月數才能領取節慶獎金</div>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="saveAttendanceConfig">儲存考勤規則</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <!-- Insurance Rates -->
      <el-tab-pane label="勞健保費率" name="insurance">
        <div v-loading="loadingInsurance">
          <el-form label-width="220px" style="max-width: 700px; margin-top: 20px;">
            <el-form-item label="費率年度">
              <el-input-number v-model="insuranceConfig.rate_year" :min="2020" :max="2030" />
            </el-form-item>

            <el-divider content-position="left">勞保</el-divider>
            <el-form-item label="勞保費率 (%)">
              <el-input-number v-model="insuranceConfig.labor_rate" :min="0" :max="100" :precision="4" :step="0.01" />
            </el-form-item>
            <el-row :gutter="20">
              <el-col :span="8">
                <el-form-item label="員工 (%)">
                  <el-input-number v-model="insuranceConfig.labor_employee_ratio" :min="0" :max="100" :precision="2" :step="1" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="雇主 (%)">
                  <el-input-number v-model="insuranceConfig.labor_employer_ratio" :min="0" :max="100" :precision="2" :step="1" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="政府 (%)">
                  <el-input-number v-model="insuranceConfig.labor_government_ratio" :min="0" :max="100" :precision="2" :step="1" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-divider content-position="left">健保</el-divider>
            <el-form-item label="健保費率 (%)">
              <el-input-number v-model="insuranceConfig.health_rate" :min="0" :max="100" :precision="4" :step="0.01" />
            </el-form-item>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="員工 (%)">
                  <el-input-number v-model="insuranceConfig.health_employee_ratio" :min="0" :max="100" :precision="2" :step="1" style="width: 100%" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="雇主 (%)">
                  <el-input-number v-model="insuranceConfig.health_employer_ratio" :min="0" :max="100" :precision="2" :step="1" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>

            <el-divider content-position="left">勞退</el-divider>
            <el-form-item label="雇主提撥率 (%)">
              <el-input-number v-model="insuranceConfig.pension_employer_rate" :min="0" :max="100" :precision="2" :step="0.1" />
            </el-form-item>
            <el-form-item label="平均眷屬人數">
              <el-input-number v-model="insuranceConfig.average_dependents" :min="0" :precision="2" :step="0.1" />
            </el-form-item>

            <el-form-item>
              <el-button type="primary" @click="saveInsuranceRates">儲存勞健保費率</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>
      <!-- Shift Types -->
      <el-tab-pane label="輪班別管理" name="shifts">
        <div class="tab-header">
          <el-button type="primary" @click="handleAddShift">新增班別</el-button>
        </div>
        <el-table :data="shiftTypes" v-loading="loadingShifts" style="width: 100%; margin-top: 20px;">
          <el-table-column prop="sort_order" label="排序" width="80" sortable />
          <el-table-column prop="name" label="班別名稱" />
          <el-table-column prop="work_start" label="上班時間" width="120" />
          <el-table-column prop="work_end" label="下班時間" width="120" />
          <el-table-column prop="is_active" label="狀態" width="80">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? '啟用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="scope">
              <el-button link type="primary" @click="handleEditShift(scope.row)">編輯</el-button>
              <el-button link type="danger" @click="handleDeleteShift(scope.row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- User Accounts -->
      <el-tab-pane label="帳號管理" name="accounts">
        <div class="tab-header">
          <el-button type="primary" @click="handleAddUser">新增帳號</el-button>
        </div>
        <el-table :data="users" v-loading="loadingUsers" style="width: 100%; margin-top: 20px;">
          <el-table-column prop="username" label="帳號" width="150" />
          <el-table-column prop="employee_name" label="員工姓名" width="120" />
          <el-table-column prop="role" label="角色" width="120">
            <template #default="{ row }">
              <el-tag :type="getRoleTagType(row.role)">{{ row.role_label || row.role }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="權限" width="120">
            <template #default="{ row }">
              <template v-if="row.role !== 'teacher'">
                <el-tag v-if="row.permissions === -1" type="success" size="small">全部</el-tag>
                <el-tag v-else-if="isUsingRoleDefault(row)" type="info" size="small">預設</el-tag>
                <el-tag v-else type="warning" size="small">自訂</el-tag>
              </template>
              <span v-else style="color: #909399;">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="is_active" label="狀態" width="80">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? '啟用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="last_login" label="最後登入" width="180" />
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <el-button link type="primary" @click="handleEditUser(row)">編輯</el-button>
              <el-button link type="primary" @click="handleResetPassword(row)">重設密碼</el-button>
              <el-button link type="danger" @click="handleDeleteUser(row)">刪除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- Title Dialog -->
    <el-dialog v-model="titleDialogVisible" :title="titleForm.id ? '編輯職稱' : '新增職稱'" width="400px">
      <el-form :model="titleForm" label-width="80px">
        <el-form-item label="名稱">
          <el-input v-model="titleForm.name" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="titleForm.rank" :min="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="titleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTitle">儲存</el-button>
      </template>
    </el-dialog>
    <!-- Create User Dialog -->
    <el-dialog v-model="userDialogVisible" title="新增帳號" width="600px">
      <el-form :model="userForm" label-width="80px">
        <el-form-item label="員工">
          <el-select v-model="userForm.employee_id" placeholder="選擇員工" filterable style="width: 100%;" @change="autoFillUsername">
            <el-option v-for="emp in availableEmployees()" :key="emp.id" :label="`${emp.name} (${emp.employee_id})`" :value="emp.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="帳號">
          <el-input v-model="userForm.username" placeholder="登入帳號" />
        </el-form-item>
        <el-form-item label="密碼">
          <el-input v-model="userForm.password" type="password" placeholder="初始密碼" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="userForm.role" @change="onRoleChange(userForm)" style="width: 200px;">
            <el-option
              v-for="(config, role) in permissionDefinition.roles"
              :key="role"
              :label="config.label"
              :value="role"
            />
          </el-select>
          <span v-if="userForm.role === 'teacher'" style="color: #909399; margin-left: 12px;">僅限教師專區</span>
        </el-form-item>
        <el-form-item v-if="userForm.role !== 'teacher'" label="權限">
          <div class="permission-section">
            <div class="permission-actions">
              <el-button size="small" @click="selectAllPermissions(userForm)">全選</el-button>
              <el-button size="small" @click="clearAllPermissions(userForm)">清除</el-button>
            </div>
            <div v-for="group in permissionDefinition.groups" :key="group.name" class="permission-group">
              <div class="permission-group-title">{{ group.name }}</div>
              <div class="permission-checkboxes">
                <el-checkbox
                  v-for="perm in (group.permissions || [])"
                  :key="perm"
                  :model-value="isPermissionChecked(userForm, perm)"
                  @change="togglePermission(userForm, perm)"
                >
                  {{ getPermissionLabel(perm) }}
                </el-checkbox>
              </div>
              <div v-if="group.split_permissions" class="split-permission-list">
                <div v-for="sp in group.split_permissions" :key="sp.read" class="split-permission-row">
                  <span class="split-permission-label">{{ sp.module }}</span>
                  <el-checkbox
                    :model-value="isPermissionChecked(userForm, sp.read)"
                    @change="togglePermission(userForm, sp.read)"
                  >檢視</el-checkbox>
                  <el-checkbox
                    :model-value="isPermissionChecked(userForm, sp.write)"
                    @change="togglePermission(userForm, sp.write)"
                  >編輯</el-checkbox>
                </div>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveUser">建立</el-button>
      </template>
    </el-dialog>

    <!-- Shift Type Dialog -->
    <el-dialog v-model="shiftDialogVisible" :title="shiftForm.id ? '編輯班別' : '新增班別'" width="450px">
      <el-form :model="shiftForm" label-width="100px">
        <el-form-item label="班別名稱">
          <el-input v-model="shiftForm.name" placeholder="例如：早值" />
        </el-form-item>
        <el-form-item label="上班時間">
          <el-time-select v-model="shiftForm.work_start" start="06:00" step="00:30" end="12:00" placeholder="選擇上班時間" />
        </el-form-item>
        <el-form-item label="下班時間">
          <el-time-select v-model="shiftForm.work_end" start="14:00" step="00:30" end="22:00" placeholder="選擇下班時間" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="shiftForm.sort_order" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shiftDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveShift">儲存</el-button>
      </template>
    </el-dialog>

    <!-- Reset Password Dialog -->
    <el-dialog v-model="resetDialogVisible" title="重設密碼" width="400px">
      <p>帳號: <strong>{{ resetPasswordForm.username }}</strong></p>
      <el-form label-width="80px">
        <el-form-item label="新密碼">
          <el-input v-model="resetPasswordForm.new_password" type="password" placeholder="請輸入新密碼" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitResetPassword">確認重設</el-button>
      </template>
    </el-dialog>

    <!-- Edit User Dialog -->
    <el-dialog v-model="editUserDialogVisible" title="編輯使用者" width="600px">
      <el-form :model="editUserForm" label-width="80px">
        <el-form-item label="帳號">
          <el-input :model-value="editUserForm.username" disabled />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editUserForm.role" @change="onRoleChange(editUserForm)" style="width: 200px;">
            <el-option
              v-for="(config, role) in permissionDefinition.roles"
              :key="role"
              :label="config.label"
              :value="role"
            />
          </el-select>
          <span v-if="editUserForm.role === 'teacher'" style="color: #909399; margin-left: 12px;">僅限教師專區</span>
        </el-form-item>
        <el-form-item v-if="editUserForm.role !== 'teacher'" label="權限">
          <div class="permission-section">
            <div class="permission-actions">
              <el-button size="small" @click="selectAllPermissions(editUserForm)">全選</el-button>
              <el-button size="small" @click="clearAllPermissions(editUserForm)">清除</el-button>
            </div>
            <div v-for="group in permissionDefinition.groups" :key="group.name" class="permission-group">
              <div class="permission-group-title">{{ group.name }}</div>
              <div class="permission-checkboxes">
                <el-checkbox
                  v-for="perm in (group.permissions || [])"
                  :key="perm"
                  :model-value="isPermissionChecked(editUserForm, perm)"
                  @change="togglePermission(editUserForm, perm)"
                >
                  {{ getPermissionLabel(perm) }}
                </el-checkbox>
              </div>
              <div v-if="group.split_permissions" class="split-permission-list">
                <div v-for="sp in group.split_permissions" :key="sp.read" class="split-permission-row">
                  <span class="split-permission-label">{{ sp.module }}</span>
                  <el-checkbox
                    :model-value="isPermissionChecked(editUserForm, sp.read)"
                    @change="togglePermission(editUserForm, sp.read)"
                  >檢視</el-checkbox>
                  <el-checkbox
                    :model-value="isPermissionChecked(editUserForm, sp.write)"
                    @change="togglePermission(editUserForm, sp.write)"
                  >編輯</el-checkbox>
                </div>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editUserDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEditUser">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tab-header {
  margin-top: 10px;
}

.permission-section {
  width: 100%;
}

.permission-actions {
  margin-bottom: 12px;
}

.permission-group {
  margin-bottom: 16px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 6px;
}

.permission-group-title {
  font-weight: 600;
  margin-bottom: 8px;
  color: #303133;
}

.permission-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.permission-checkboxes .el-checkbox {
  margin-right: 0;
}

.split-permission-list {
  margin-top: 8px;
}

.split-permission-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.split-permission-label {
  min-width: 80px;
  font-size: 14px;
  color: #606266;
}

.split-permission-row .el-checkbox {
  margin-right: 0;
}
</style>
