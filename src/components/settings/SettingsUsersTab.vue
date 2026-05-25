<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { getUsers, getPermissions, createUser, updateUser, deleteUser, resetPassword } from '@/api/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEmployeeStore } from '@/stores/employee'
import { apiError } from '@/utils/error'
import {
  permissionsAdd,
  permissionsCombine,
  permissionsHave,
  permissionsRemove,
} from '@/utils/auth'

const ROLE_ICONS: Record<string, string> = {
  admin: '👑',
  principal: '🏫',
  supervisor: '📋',
  hr: '💼',
  accountant: '💰',
  teacher: '📚',
  parent: '👨‍👩‍👧',
}

const ROLE_ORDER = ['admin', 'principal', 'supervisor', 'hr', 'accountant', 'teacher', 'parent']

const advancedExpanded = ref<boolean>(false)

interface EmployeeItem { id: number; name: string; employee_id: string }

const employeeStore = useEmployeeStore()
const { employees } = storeToRefs(employeeStore) as unknown as { employees: Ref<EmployeeItem[]> }

const users = ref<Record<string, unknown>[]>([])
const loadingUsers = ref<boolean>(false)
const userDialogVisible = ref<boolean>(false)
const userForm = reactive<{ employee_id: number | null; username: string; password: string; role: string; permission_names: string[] }>({ employee_id: null, username: '', password: '', role: 'teacher', permission_names: ['*'] })
const resetPasswordForm = reactive<{ user_id: number | null; username: string; new_password: string }>({ user_id: null, username: '', new_password: '' })
const resetDialogVisible = ref<boolean>(false)
const editUserDialogVisible = ref<boolean>(false)
const editUserForm = reactive<{ id: number | null; username: string; role: string; permission_names: string[] }>({ id: null, username: '', role: 'teacher', permission_names: ['*'] })
const credentialDialogVisible = ref<boolean>(false)
const createdCredentials = ref<{ username: string; password: string }>({ username: '', password: '' })
interface PermGroup {
  name: string
  permissions?: string[]
  split_permissions?: { module: string; read: string; write: string }[]
}

interface RoleConfig {
  label: string
  permissions: string[]
  description?: string
}

const permissionDefinition = ref<{ permissions: Record<string, { label: string; value: string }>; groups: PermGroup[]; roles: Record<string, RoleConfig> }>({ permissions: {}, groups: [], roles: {} })

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
  const empList = employees.value
  const existingIds = new Set(users.value.map(u => u.employee_id))
  return empList.filter(e => !existingIds.has(e.id))
}

const handleAddUser = () => {
  userForm.employee_id = null
  userForm.username = ''
  userForm.password = ''
  userForm.role = 'teacher'
  userForm.permission_names = ['*']
  advancedExpanded.value = false
  employeeStore.fetchEmployees()
  userDialogVisible.value = true
}

const saveUser = async () => {
  if (!userForm.employee_id || !userForm.username || !userForm.password) {
    ElMessage.warning('請填寫所有欄位')
    return
  }
  try {
    const payload: Record<string, unknown> = {
      employee_id: userForm.employee_id,
      username: userForm.username,
      password: userForm.password,
      role: userForm.role,
    }
    if (!isUsingDefaultPermissions(userForm)) {
      payload.permission_names = userForm.permission_names
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

const copyText = (text: string) => {
  navigator.clipboard.writeText(text).then(() => {
    ElMessage.success('已複製')
  })
}

const handleResetPassword = (user: Record<string, unknown>) => {
  resetPasswordForm.user_id = user.id as number
  resetPasswordForm.username = user.username as string
  resetPasswordForm.new_password = ''
  resetDialogVisible.value = true
}

const submitResetPassword = async () => {
  if (!resetPasswordForm.new_password) {
    ElMessage.warning('請輸入新密碼')
    return
  }
  try {
    await resetPassword(resetPasswordForm.user_id!, resetPasswordForm.new_password)
    ElMessage.success('密碼重設成功')
    resetDialogVisible.value = false
  } catch (error) {
    ElMessage.error(apiError(error, '重設失敗'))
  }
}

const handleDeleteUser = (user: Record<string, unknown>) => {
  ElMessageBox.confirm(`確定刪除帳號 ${user.username}？`, '警告', { type: 'warning' })
    .then(async () => {
      try {
        await deleteUser(user.id as number)
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

const handleEditUser = (user: Record<string, unknown>) => {
  editUserForm.id = user.id as number
  editUserForm.username = user.username as string
  editUserForm.role = user.role as string
  editUserForm.permission_names = (user.permission_names as string[] | null) ?? ['*']
  editUserDialogVisible.value = true
  nextTick(() => _openEditExpander())
}

const saveEditUser = async () => {
  try {
    const payload: Record<string, unknown> = { role: editUserForm.role }
    if (editUserForm.role !== 'teacher' && !isUsingDefaultPermissions(editUserForm)) {
      payload.permission_names = editUserForm.permission_names
    }
    await updateUser(editUserForm.id!, payload)
    ElMessage.success('使用者已更新')
    editUserDialogVisible.value = false
    fetchUsers()
  } catch (error) {
    ElMessage.error(apiError(error, '更新失敗'))
  }
}

const isPermissionChecked = (form: { permission_names: string[]; role: string }, permName: string) => {
  return permissionsHave(form.permission_names, permName)
}

const togglePermission = (form: { permission_names: string[]; role: string }, permName: string) => {
  // 從 wildcard 切換成具體勾選：展開所有 perm 再扣掉這個
  if (form.permission_names.includes('*')) {
    const allPerms = permissionsCombine([Object.keys(permissionDefinition.value.permissions)])
    form.permission_names = permissionsRemove(allPerms, permName)
  } else if (form.permission_names.includes(permName)) {
    form.permission_names = permissionsRemove(form.permission_names, permName)
  } else {
    form.permission_names = permissionsAdd(form.permission_names, permName)
  }
  // 若新狀態為偏離，強制展開
  if (deviationCount.value > 0) {
    advancedExpanded.value = true
  }
}

const selectAllPermissions = (form: { permission_names: string[] }) => {
  form.permission_names = ['*']
}

const clearAllPermissions = (form: { permission_names: string[] }) => {
  form.permission_names = []
}

const getPermissionLabel = (permName: string) => {
  return permissionDefinition.value.permissions[permName]?.label || permName
}

const getRoleTagType = (role: string): 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined => {
  const types: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = {
    admin: 'danger',
    hr: 'warning',
    supervisor: 'success',
    teacher: 'info',
  }
  return types[role] ?? 'info'
}

const onRoleChange = (form: { role: string; permission_names: string[] }) => {
  const roleConfig = permissionDefinition.value.roles[form.role]
  if (roleConfig) {
    form.permission_names = [...roleConfig.permissions]
  }
}

const _arraysEqualAsSet = (a: string[] | null | undefined, b: string[] | null | undefined): boolean => {
  if (!a || !b) return a === b
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((x) => setA.has(x))
}

const isUsingDefaultPermissions = (form: { role: string; permission_names: string[] }) => {
  const roleConfig = permissionDefinition.value.roles[form.role]
  return !!roleConfig && _arraysEqualAsSet(form.permission_names, roleConfig.permissions)
}

const isUsingRoleDefault = (row: Record<string, unknown>) => {
  const roleConfig = permissionDefinition.value.roles[row.role as string]
  if (!roleConfig) return false
  // row.permission_names 為 null 代表後端 resolve 用角色預設 → 視為「預設」
  if (row.permission_names == null) return true
  return _arraysEqualAsSet(row.permission_names as string[], roleConfig.permissions)
}

const _activeForm = computed<{ role: string; permission_names: string[] } | null>(() => {
  if (userDialogVisible.value) return userForm
  if (editUserDialogVisible.value) return editUserForm
  return null
})

const deviationCount = computed<number>(() => {
  const form = _activeForm.value
  if (!form) return 0
  const roleConfig = permissionDefinition.value.roles[form.role]
  if (!roleConfig) return 0
  const tpl = roleConfig.permissions
  if (form.permission_names.includes('*')) {
    return tpl.includes('*') ? 0 : Object.keys(permissionDefinition.value.permissions).length
  }
  if (tpl.includes('*')) {
    // role 預設是 wildcard 但 form 是顯式清單
    return Object.keys(permissionDefinition.value.permissions).length - form.permission_names.length
  }
  const tplSet = new Set(tpl)
  const formSet = new Set(form.permission_names)
  let count = 0
  for (const p of form.permission_names) if (!tplSet.has(p)) count++
  for (const p of tpl) if (!formSet.has(p)) count++
  return count
})

const selectRoleCard = (form: { role: string; permission_names: string[] }, roleKey: string) => {
  if (roleKey === 'parent') return  // disabled
  form.role = roleKey
  onRoleChange(form)
  advancedExpanded.value = false
}

const restoreDefault = (form: { role: string; permission_names: string[] }) => {
  onRoleChange(form)
  advancedExpanded.value = false
}

// 開啟編輯 dialog 時依偏離狀態決定 expander 初始
const _openEditExpander = () => {
  advancedExpanded.value = deviationCount.value > 0
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
        <template #default="{ row } = {}">
          <el-tag :type="getRoleTagType(row?.role)">{{ row?.role_label || row?.role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="權限" width="120">
        <template #default="{ row } = {}">
          <template v-if="row?.role !== 'teacher'">
            <el-tag v-if="Array.isArray(row?.permission_names) && row?.permission_names.includes('*')" type="success" size="small">全部</el-tag>
            <el-tag v-else-if="row && isUsingRoleDefault(row)" type="info" size="small">預設</el-tag>
            <el-tag v-else type="warning" size="small">自訂</el-tag>
          </template>
          <span v-else style="color: var(--text-tertiary);">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="is_active" label="狀態" width="80">
        <template #default="{ row } = {}">
          <el-tag :type="row?.is_active ? 'success' : 'info'" size="small">{{ row?.is_active ? '啟用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="last_login" label="最後登入" width="180" />
      <el-table-column label="操作" width="220">
        <template #default="{ row } = {}">
          <el-button v-if="row" link type="primary" @click="handleEditUser(row)">編輯</el-button>
          <el-button v-if="row" link type="primary" @click="handleResetPassword(row)">重設密碼</el-button>
          <el-button v-if="row" link type="danger" @click="handleDeleteUser(row)">刪除</el-button>
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
          <div v-if="userDialogVisible" class="role-cards-grid">
            <div
              v-for="roleKey in ROLE_ORDER"
              :key="roleKey"
              class="role-card"
              :data-role="roleKey"
              :class="{
                'role-card--active': userForm.role === roleKey,
                'is-disabled': roleKey === 'parent',
              }"
              :title="roleKey === 'parent' ? '家長帳號請從家長端 LIFF 綁定' : ''"
              @click="selectRoleCard(userForm, roleKey)"
            >
              <div class="role-card__icon">{{ ROLE_ICONS[roleKey] || '👤' }}</div>
              <div class="role-card__label">{{ permissionDefinition.roles[roleKey]?.label || roleKey }}</div>
              <div class="role-card__desc">{{ permissionDefinition.roles[roleKey]?.description || '' }}</div>
              <div class="role-card__count">
                <el-tag size="small" :type="roleKey === 'admin' ? 'danger' : 'info'">
                  {{ permissionDefinition.roles[roleKey]?.permissions?.includes('*') ? '全部' : `${permissionDefinition.roles[roleKey]?.permissions?.length ?? 0} 條` }}
                </el-tag>
              </div>
            </div>
          </div>
        </el-form-item>

        <el-form-item v-if="userForm.role !== 'teacher' && userForm.role !== 'parent'" label="權限">
          <div class="advanced-tuning">
            <div class="advanced-tuning__header">
              <button
                type="button"
                class="advanced-tuning-toggle"
                @click="advancedExpanded = !advancedExpanded"
              >
                <span>{{ advancedExpanded ? '▼' : '▶' }} 進階微調</span>
                <el-tag
                  class="deviation-badge"
                  :type="deviationCount > 0 ? 'warning' : 'info'"
                  size="small"
                >
                  {{ deviationCount > 0 ? `已偏離 ${deviationCount} 項` : '預設' }}
                </el-tag>
              </button>
              <el-button
                v-if="deviationCount > 0"
                class="restore-default-btn"
                link
                type="primary"
                size="small"
                @click="restoreDefault(userForm)"
              >
                ↻ 還原預設
              </el-button>
            </div>
            <div v-show="advancedExpanded" class="advanced-tuning-content">
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
                      >
                        <span style="display:none">{{ sp.module }}</span>檢視
                      </el-checkbox>
                      <el-checkbox
                        :model-value="isPermissionChecked(userForm, sp.write)"
                        @change="togglePermission(userForm, sp.write)"
                      >
                        <span style="display:none">{{ sp.module }}</span>編輯
                      </el-checkbox>
                    </div>
                  </div>
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
          <div v-if="editUserDialogVisible" class="role-cards-grid">
            <div
              v-for="roleKey in ROLE_ORDER"
              :key="roleKey"
              class="role-card"
              :data-role="roleKey"
              :class="{
                'role-card--active': editUserForm.role === roleKey,
                'is-disabled': roleKey === 'parent',
              }"
              :title="roleKey === 'parent' ? '家長帳號請從家長端 LIFF 綁定' : ''"
              @click="selectRoleCard(editUserForm, roleKey)"
            >
              <div class="role-card__icon">{{ ROLE_ICONS[roleKey] || '👤' }}</div>
              <div class="role-card__label">{{ permissionDefinition.roles[roleKey]?.label || roleKey }}</div>
              <div class="role-card__desc">{{ permissionDefinition.roles[roleKey]?.description || '' }}</div>
              <div class="role-card__count">
                <el-tag size="small" :type="roleKey === 'admin' ? 'danger' : 'info'">
                  {{ permissionDefinition.roles[roleKey]?.permissions?.includes('*') ? '全部' : `${permissionDefinition.roles[roleKey]?.permissions?.length ?? 0} 條` }}
                </el-tag>
              </div>
            </div>
          </div>
        </el-form-item>

        <el-form-item v-if="editUserForm.role !== 'teacher' && editUserForm.role !== 'parent'" label="權限">
          <div class="advanced-tuning">
            <div class="advanced-tuning__header">
              <button
                type="button"
                class="advanced-tuning-toggle"
                @click="advancedExpanded = !advancedExpanded"
              >
                <span>{{ advancedExpanded ? '▼' : '▶' }} 進階微調</span>
                <el-tag
                  class="deviation-badge"
                  :type="deviationCount > 0 ? 'warning' : 'info'"
                  size="small"
                >
                  {{ deviationCount > 0 ? `已偏離 ${deviationCount} 項` : '預設' }}
                </el-tag>
              </button>
              <el-button
                v-if="deviationCount > 0"
                class="restore-default-btn"
                link
                type="primary"
                size="small"
                @click="restoreDefault(editUserForm)"
              >
                ↻ 還原預設
              </el-button>
            </div>
            <div v-show="advancedExpanded" class="advanced-tuning-content">
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
                      >
                        <span style="display:none">{{ sp.module }}</span>檢視
                      </el-checkbox>
                      <el-checkbox
                        :model-value="isPermissionChecked(editUserForm, sp.write)"
                        @change="togglePermission(editUserForm, sp.write)"
                      >
                        <span style="display:none">{{ sp.module }}</span>編輯
                      </el-checkbox>
                    </div>
                  </div>
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
      <div style="margin-top: 16px; color: var(--text-tertiary); font-size: 13px;">員工首次登入後將被要求修改密碼。</div>
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
  color: var(--text-primary);
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
  color: var(--text-secondary);
}

.split-permission-row .el-checkbox {
  margin-right: 0;
}

.role-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  width: 100%;
}

@media (max-width: 720px) {
  .role-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.role-card {
  padding: 12px;
  border: 2px solid var(--el-border-color-lighter);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #fff;
  text-align: center;
}

.role-card:hover:not(.is-disabled) {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.role-card--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.role-card.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.role-card__icon {
  font-size: 24px;
  margin-bottom: 4px;
}

.role-card__label {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.role-card__desc {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 6px 0 8px;
  min-height: 28px;
  line-height: 1.3;
}

.role-card__count {
  display: flex;
  justify-content: center;
}

.advanced-tuning {
  width: 100%;
}

.advanced-tuning__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.advanced-tuning-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary);
}

.advanced-tuning-toggle:hover {
  color: var(--el-color-primary);
}
</style>
