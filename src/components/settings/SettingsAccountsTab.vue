<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick, watch, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { getUsers, getPermissions, createUser, updateUser, deleteUser, resetPassword } from '@/api/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { useEmployeeStore } from '@/stores/employee'
import { apiError } from '@/utils/error'
import { shouldSendPermissionNames } from '@/utils/auth'
import PermissionPicker from './PermissionPicker.vue'
import RoleManagerDrawer, { type RolesDefinition } from './RoleManagerDrawer.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'

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
const permissionDefinition = ref<RolesDefinition>({ permissions: {}, groups: [], roles: {} })

const roleDrawerVisible = ref<boolean>(false)
const onRolesChanged = () => { fetchPermissionDefinition() }

// 搜尋 / 角色篩選
const keyword = ref<string>('')
const roleFilter = ref<string>('')

const roleFilterOptions = computed(() =>
  Object.entries(permissionDefinition.value.roles).map(([code, r]) => ({ code, label: r.label || code })),
)

const filteredUsers = computed(() =>
  users.value.filter((u) => {
    const matchRole = !roleFilter.value || u.role === roleFilter.value
    const hay = `${(u.username as string) ?? ''}${(u.employee_name as string) ?? ''}`
    const matchKw = !keyword.value || hay.includes(keyword.value.trim())
    return matchRole && matchKw
  }),
)

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

const savingUser = ref(false)
const saveUser = async () => {
  if (!userForm.employee_id || !userForm.username || !userForm.password) {
    ElMessage.warning('請填寫所有欄位')
    return
  }
  if (savingUser.value) return  // 送出中防序列/併發重送（避免序列雙擊跳誤導性「建立失敗」toast）
  savingUser.value = true
  try {
    const payload: Record<string, unknown> = {
      employee_id: userForm.employee_id,
      username: userForm.username,
      password: userForm.password,
      role: userForm.role,
    }
    if (shouldSendPermissionNames(userForm.role, isUsingDefaultPermissions(userForm))) {
      payload.permission_names = userForm.permission_names
    }
    await createUser(payload)
    userDialogVisible.value = false
    createdCredentials.value = { username: userForm.username, password: userForm.password }
    credentialDialogVisible.value = true
    fetchUsers()
  } catch (error) {
    ElMessage.error(apiError(error, '建立失敗'))
  } finally {
    savingUser.value = false
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
    if (shouldSendPermissionNames(editUserForm.role, isUsingDefaultPermissions(editUserForm))) {
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

// 偏離時自動展開 expander（取代舊版寫在 togglePermission 內的展開邏輯）
watch(deviationCount, (n) => { if (n > 0) advancedExpanded.value = true })

function onRowCommand(cmd: string, row: Record<string, unknown>) {
  if (cmd === 'reset') handleResetPassword(row)
  else if (cmd === 'delete') handleDeleteUser(row)
}

const clearFilters = () => {
  keyword.value = ''
  roleFilter.value = ''
}

const { isMobile } = useIsMobile()

const accountCardColumns = [
  { label: '員工姓名', prop: 'employee_name' },
  { label: '角色', prop: '__role' },
  { label: '權限', prop: '__perm' },
  { label: '狀態', prop: '__status' },
  { label: '最後登入', prop: 'last_login' },
]

onMounted(() => {
  fetchUsers()
  fetchPermissionDefinition()
})

defineExpose({
  userForm, editUserForm, saveUser, saveEditUser, isUsingDefaultPermissions, deviationCount, restoreDefault,
  keyword, roleFilter, filteredUsers, clearFilters, onRowCommand, resetDialogVisible, handleResetPassword, handleDeleteUser,
})
</script>

<template>
  <div>
    <div class="accounts-toolbar">
      <div class="toolbar-left">
        <el-input v-model="keyword" placeholder="搜尋帳號 / 姓名" clearable style="width: 220px;" />
        <el-select v-model="roleFilter" placeholder="全部角色" clearable style="width: 160px;">
          <el-option v-for="r in roleFilterOptions" :key="r.code" :label="r.label" :value="r.code" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button @click="roleDrawerVisible = true">⚙ 管理角色</el-button>
        <el-button type="primary" @click="handleAddUser">新增帳號</el-button>
      </div>
    </div>
    <el-table v-if="!isMobile" :data="filteredUsers" v-loading="loadingUsers" style="width: 100%; margin-top: 20px;">
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
      <el-table-column label="操作" width="160">
        <template #default="{ row } = {}">
          <el-button v-if="row" link type="primary" @click="handleEditUser(row)">編輯</el-button>
          <el-dropdown v-if="row" trigger="click" @command="(cmd: string) => onRowCommand(cmd, row)">
            <el-button link type="primary">更多<el-icon class="el-icon--right"><arrow-down /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="reset">重設密碼</el-dropdown-item>
                <el-dropdown-item command="delete" divided>刪除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
      <template #empty>
        <div class="accounts-empty">
          <template v-if="keyword || roleFilter">
            <span>查無符合條件的帳號</span>
            <el-button link type="primary" data-testid="clear-filters" @click="clearFilters">清除篩選</el-button>
          </template>
          <span v-else>尚無帳號</span>
        </div>
      </template>
    </el-table>
    <AdminListCards
      v-else
      :items="filteredUsers"
      :columns="accountCardColumns"
      row-key="username"
      :loading="loadingUsers"
      empty-text="尚無帳號"
      style="margin-top: 20px;"
    >
      <template #title="{ item }">{{ item.username }}</template>
      <template #cell-__role="{ item }">
        <el-tag :type="getRoleTagType(item.role as string)">{{ item.role_label || item.role }}</el-tag>
      </template>
      <template #cell-__perm="{ item }">
        <template v-if="item.role !== 'teacher'">
          <el-tag v-if="Array.isArray(item.permission_names) && (item.permission_names as string[]).includes('*')" type="success" size="small">全部</el-tag>
          <el-tag v-else-if="isUsingRoleDefault(item)" type="info" size="small">預設</el-tag>
          <el-tag v-else type="warning" size="small">自訂</el-tag>
        </template>
        <span v-else style="color: var(--text-tertiary);">-</span>
      </template>
      <template #cell-__status="{ item }">
        <el-tag :type="item.is_active ? 'success' : 'info'" size="small">{{ item.is_active ? '啟用' : '停用' }}</el-tag>
      </template>
      <template #actions="{ item }">
        <el-button link type="primary" @click="handleEditUser(item)">編輯</el-button>
        <el-dropdown trigger="click" @command="(cmd: string) => onRowCommand(cmd, item)">
          <el-button link type="primary">更多<el-icon class="el-icon--right"><arrow-down /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="reset">重設密碼</el-dropdown-item>
              <el-dropdown-item command="delete" divided>刪除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </AdminListCards>

    <!-- 管理角色抽屜 -->
    <RoleManagerDrawer
      v-model:visible="roleDrawerVisible"
      :definition="permissionDefinition"
      :users="users"
      @roles-changed="onRolesChanged"
    />

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
              <PermissionPicker v-model="userForm.permission_names" :definition="permissionDefinition" />
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingUser" @click="saveUser">建立</el-button>
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
              <PermissionPicker v-model="editUserForm.permission_names" :definition="permissionDefinition" />
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
.accounts-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  flex-wrap: wrap;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 12px;
  align-items: center;
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

.accounts-empty {
  padding: 24px 0;
  color: var(--text-tertiary);
  font-size: 14px;
}
</style>
