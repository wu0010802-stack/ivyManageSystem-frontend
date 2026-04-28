<script setup>
import { ref, reactive, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { getUsers, getPermissions, createUser, updateUser, deleteUser, resetPassword } from '@/api/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEmployeeStore } from '@/stores/employee'
import { apiError } from '@/utils/error'
import {
  permissionMaskAdd,
  permissionMaskCombine,
  permissionMaskHas,
  permissionMaskRemove,
} from '@/utils/auth'

const employeeStore = useEmployeeStore()
const { employees } = storeToRefs(employeeStore)

const users = ref([])
const loadingUsers = ref(false)
const userDialogVisible = ref(false)
const userForm = reactive({ employee_id: null, username: '', password: '', role: 'teacher', permissions: -1 })
const resetPasswordForm = reactive({ user_id: null, username: '', new_password: '' })
const resetDialogVisible = ref(false)
const editUserDialogVisible = ref(false)
const editUserForm = reactive({ id: null, username: '', role: 'teacher', permissions: -1 })
const credentialDialogVisible = ref(false)
const createdCredentials = ref({ username: '', password: '' })
const permissionDefinition = ref({ permissions: {}, groups: [], roles: {} })

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
    userDialogVisible.value = false
    createdCredentials.value = { username: userForm.username, password: userForm.password }
    credentialDialogVisible.value = true
    fetchUsers()
  } catch (error) {
    ElMessage.error(apiError(error, '建立失敗'))
  }
}

const copyText = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已複製')
  })
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
    ElMessage.error(apiError(error, '重設失敗'))
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
    if (editUserForm.role !== 'teacher' && !isUsingDefaultPermissions(editUserForm)) {
      payload.permissions = editUserForm.permissions
    }
    await updateUser(editUserForm.id, payload)
    ElMessage.success('使用者已更新')
    editUserDialogVisible.value = false
    fetchUsers()
  } catch (error) {
    ElMessage.error(apiError(error, '更新失敗'))
  }
}

const isPermissionChecked = (form, permName) => {
  if (form.permissions === -1) return true
  const permValue = permissionDefinition.value.permissions[permName]?.value || 0
  return permissionMaskHas(form.permissions, permValue)
}

const togglePermission = (form, permName) => {
  const permValue = permissionDefinition.value.permissions[permName]?.value || 0
  if (form.permissions === -1) {
    const allPerms = permissionMaskCombine(
      Object.values(permissionDefinition.value.permissions).map((p) => p.value),
    )
    form.permissions = permissionMaskRemove(allPerms, permValue)
  } else if (permissionMaskHas(form.permissions, permValue)) {
    form.permissions = permissionMaskRemove(form.permissions, permValue)
  } else {
    form.permissions = permissionMaskAdd(form.permissions, permValue)
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
    teacher: 'info',
  }
  return types[role] ?? 'info'
}

const getRoleLabel = (role) => {
  return permissionDefinition.value.roles[role]?.label || role
}

const onRoleChange = (form) => {
  const roleConfig = permissionDefinition.value.roles[form.role]
  if (roleConfig) {
    form.permissions = roleConfig.permissions
  }
}

const isUsingDefaultPermissions = (form) => {
  const roleConfig = permissionDefinition.value.roles[form.role]
  return roleConfig && form.permissions === roleConfig.permissions
}

const isUsingRoleDefault = (row) => {
  const roleConfig = permissionDefinition.value.roles[row.role]
  return roleConfig && row.permissions === roleConfig.permissions
}

onMounted(() => {
  fetchUsers()
  fetchPermissionDefinition()
})
</script>

<template>
  <div>
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

    <!-- Credential Dialog -->
    <el-dialog v-model="credentialDialogVisible" title="帳號已建立" width="480px" @closed="createdCredentials = { username: '', password: '' }">
      <div style="margin-bottom: 16px; color: #67c23a; font-weight: 500;">✅ 帳號建立成功，請將以下資訊提供給員工：</div>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="帳號">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>{{ createdCredentials.username }}</span>
            <el-button size="small" @click="copyText(createdCredentials.username)">複製</el-button>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="初始密碼">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span>{{ createdCredentials.password }}</span>
            <el-button size="small" @click="copyText(createdCredentials.password)">複製</el-button>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="登入網址">
          <span>#/portal/login</span>
        </el-descriptions-item>
      </el-descriptions>
      <div style="margin-top: 16px; color: #909399; font-size: 13px;">員工首次登入後將被要求修改密碼。</div>
      <template #footer>
        <el-button type="primary" @click="credentialDialogVisible = false">關閉</el-button>
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
