<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { getUsers, getPermissions, createUser, updateUser, deleteUser, resetPassword } from '@/api/auth'
import { createRole } from '@/api/permissions_admin'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown } from '@element-plus/icons-vue'
import { useEmployeeStore } from '@/stores/employee'
import { apiError } from '@/utils/error'
import { formatDateTimeTW } from '@/utils/format'
import RoleCardsGrid from './RoleCardsGrid.vue'
import type { RolesDefinition } from './roles/types'
import ParentAccountsList from './ParentAccountsList.vue'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'
import { hasPermission } from '@/utils/auth'

interface EmployeeItem { id: number; name: string; employee_id: string }

type Audience = 'staff' | 'parent'

const route = useRoute()
const router = useRouter()

const resolveAudience = (raw: unknown): Audience => {
  const r = Array.isArray(raw) ? raw[0] : raw
  return r === 'parent' ? 'parent' : 'staff'
}

const audience = ref<Audience>(resolveAudience(route.query.view))

// 缺漏 / 不合法 view → 修正 URL（與 EmployeeHubView 一致）
if (route.query.view !== audience.value) {
  router.replace({ query: { ...route.query, view: audience.value } })
}

watch(
  () => route.query.view,
  (next) => {
    const resolved = resolveAudience(next)
    if (resolved !== audience.value) audience.value = resolved
  },
)

const onAudienceChange = (v: string | number) => {
  router.replace({ query: { ...route.query, view: String(v) } })
}

const employeeStore = useEmployeeStore()
const { employees } = storeToRefs(employeeStore) as unknown as { employees: Ref<EmployeeItem[]> }

const users = ref<Record<string, unknown>[]>([])
const loadingUsers = ref<boolean>(false)
const userDialogVisible = ref<boolean>(false)
const userForm = reactive<{ employee_id: number | null; username: string; password: string; role: string }>({ employee_id: null, username: '', password: '', role: 'teacher' })
const resetPasswordForm = reactive<{ user_id: number | null; username: string; new_password: string }>({ user_id: null, username: '', new_password: '' })
const resetDialogVisible = ref<boolean>(false)
const editUserDialogVisible = ref<boolean>(false)
// editUserForm 保留 permission_names 欄位：僅供偏離摘要計算（唯讀），永不進 payload
const editUserForm = reactive<{ id: number | null; username: string; role: string; permission_names: string[] | null }>({ id: null, username: '', role: 'teacher', permission_names: null })
// 開 dialog 當下的角色快照：saveEditUser 判斷角色是否真的變更，避免 no-op 儲存把偏離權限靜默重置為角色預設
const editUserOriginalRole = ref<string>('')
const credentialDialogVisible = ref<boolean>(false)
const createdCredentials = ref<{ username: string; password: string }>({ username: '', password: '' })
const permissionDefinition = ref<RolesDefinition>({ permissions: {}, groups: [], roles: {} })

// 搜尋 / 角色篩選
const keyword = ref<string>('')
const roleFilter = ref<string>('')

const staffUsers = computed(() => users.value.filter((u) => u.role !== 'parent'))
const parentUsers = computed(() => users.value.filter((u) => u.role === 'parent'))

const audienceOptions = computed(() => [
  { label: `教職員（${staffUsers.value.length}）`, value: 'staff' },
  { label: `家長（${parentUsers.value.length}）`, value: 'parent' },
])

const roleFilterOptions = computed(() =>
  Object.entries(permissionDefinition.value.roles)
    .filter(([code]) => code !== 'parent')
    .map(([code, r]) => ({ code, label: r.label || code })),
)

const filteredUsers = computed(() =>
  staffUsers.value.filter((u) => {
    const matchRole = !roleFilter.value || u.role === roleFilter.value
    const hay = `${(u.username as string) ?? ''}${(u.employee_name as string) ?? ''}`
    const matchKw = !keyword.value || hay.includes(keyword.value.trim())
    return matchRole && matchKw
  }),
)

const filteredParentUsers = computed(() =>
  parentUsers.value.filter((u) => !keyword.value || String(u.username ?? '').includes(keyword.value.trim())),
)

const parentEmptyText = computed(() =>
  loadError.value
    ? '帳號載入失敗'
    : keyword.value
      ? '查無符合條件的帳號'
      : '家長帳號由家長端 LINE 綁定自動產生，不在此新增',
)

const staffStats = computed(() => {
  const list = staffUsers.value
  return {
    total: list.length,
    active: list.filter((u) => !!u.is_active).length,
    neverLoggedIn: list.filter((u) => !u.last_login).length,
    custom: list.filter(
      (u) =>
        u.role !== 'teacher' &&
        Array.isArray(u.permission_names) &&
        !(u.permission_names as string[]).includes('*') &&
        !isUsingRoleDefault(u),
    ).length,
  }
})

const parentStats = computed(() => ({
  total: parentUsers.value.length,
  active: parentUsers.value.filter((u) => !!u.is_active).length,
}))

const loadError = ref(false)
const fetchUsers = async () => {
  loadingUsers.value = true
  loadError.value = false
  try {
    const res = await getUsers()
    users.value = res.data
  } catch (error) {
    loadError.value = true
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

const handleToggleActive = async (user: Record<string, unknown>) => {
  const isActive = !!user.is_active
  if (isActive) {
    try {
      await ElMessageBox.confirm(
        `停用後該帳號將立即無法登入，既有登入將被登出。確定停用 ${user.username}？`,
        '停用帳號',
        { type: 'warning', confirmButtonText: '停用', cancelButtonText: '取消' },
      )
    } catch {
      return
    }
  }
  try {
    await updateUser(user.id as number, { is_active: !isActive })
    ElMessage.success(isActive ? '帳號已停用' : '帳號已啟用')
    fetchUsers()
  } catch (error) {
    ElMessage.error(apiError(error, isActive ? '停用失敗' : '啟用失敗'))
  }
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
  editUserForm.permission_names = (user.permission_names as string[] | null) ?? null
  editUserOriginalRole.value = user.role as string
  editUserDialogVisible.value = true
}

const saveEditUser = async () => {
  if (editUserForm.role === editUserOriginalRole.value) {
    // 角色未變更：不呼叫 API。後端只要收到 role 就會把 permission_names 重置為角色預設，
    // no-op 儲存若照送會把偏離帳號的自訂權限靜默抹除（final review Critical-1）
    editUserDialogVisible.value = false
    return
  }
  try {
    // 只送 role：後端會把 permission_names 重置為新角色預設（偏離帳號換角色即脫離偏離）
    await updateUser(editUserForm.id!, { role: editUserForm.role })
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

const _arraysEqualAsSet = (a: string[] | null | undefined, b: string[] | null | undefined): boolean => {
  if (!a || !b) return a === b
  if (a.length !== b.length) return false
  const setA = new Set(a)
  return b.every((x) => setA.has(x))
}

const isUsingRoleDefault = (row: Record<string, unknown>) => {
  const roleConfig = permissionDefinition.value.roles[row.role as string]
  if (!roleConfig) return false
  // row.permission_names 為 null 代表後端 resolve 用角色預設 → 視為「預設」
  if (row.permission_names == null) return true
  return _arraysEqualAsSet(row.permission_names as string[], roleConfig.permissions)
}

const _splitCode = (key: string): string => {
  const i = key.indexOf(':')
  return i === -1 ? key : key.slice(0, i)
}
const _allCodes = () => Object.keys(permissionDefinition.value.permissions)
const _expand = (perms: string[]): string[] => (perms.includes('*') ? _allCodes() : perms)

// 編輯中帳號的偏離摘要（唯讀）：與角色預設比多/少哪幾條；scope-qualified 取 code 查 label
const editingDeviation = computed<{ extra: string[]; missing: string[] } | null>(() => {
  if (editUserForm.permission_names == null) return null // null = 後端以角色預設 resolve
  const roleConfig = permissionDefinition.value.roles[editUserForm.role]
  if (!roleConfig) return null
  const current = _expand(editUserForm.permission_names)
  const tpl = _expand(roleConfig.permissions)
  const curSet = new Set(current.map(_splitCode))
  const tplSet = new Set(tpl.map(_splitCode))
  const label = (code: string) => permissionDefinition.value.permissions[code]?.label || code
  const extra = [...curSet].filter((c) => !tplSet.has(c)).map(label)
  const missing = [...tplSet].filter((c) => !curSet.has(c)).map(label)
  if (extra.length === 0 && missing.length === 0) return null
  return { extra, missing }
})

const saveAsRoleDialogVisible = ref(false)
const saveAsRoleForm = reactive<{ code: string; label: string }>({ code: '', label: '' })
const savingAsRole = ref(false)

const openSaveAsRole = () => {
  saveAsRoleForm.code = ''
  saveAsRoleForm.label = ''
  saveAsRoleDialogVisible.value = true
}

const submitSaveAsRole = async () => {
  const code = saveAsRoleForm.code.trim()
  const label = saveAsRoleForm.label.trim()
  if (!code || !label) {
    ElMessage.warning('請填寫 code 與名稱')
    return
  }
  if (savingAsRole.value) return
  savingAsRole.value = true
  let roleCreated = false
  try {
    await createRole({ code, label, permissions: [...(editUserForm.permission_names ?? [])] })
    roleCreated = true
    // 只送 role：後端將 permission_names 重置為新角色預設（= 剛存進去的自訂集合）
    await updateUser(editUserForm.id!, { role: code })
    ElMessage.success('已建立自訂角色並指派給此帳號')
    saveAsRoleDialogVisible.value = false
    editUserDialogVisible.value = false
    fetchUsers()
    fetchPermissionDefinition()
  } catch (error) {
    if (roleCreated) {
      // 兩段式中間態：角色已存在（code 已佔用），不可重走另存流程；
      // refetch 讓新角色卡出現，引導使用者直接改選該角色儲存
      ElMessage.error(apiError(error, `角色「${code}」已建立，但指派失敗；請在編輯視窗直接選擇該角色後儲存`))
      saveAsRoleDialogVisible.value = false
      fetchPermissionDefinition()
    } else {
      ElMessage.error(apiError(error, '建立自訂角色失敗'))
    }
  } finally {
    savingAsRole.value = false
  }
}

function onRowCommand(cmd: string, row: Record<string, unknown>) {
  if (cmd === 'reset') handleResetPassword(row)
  else if (cmd === 'toggle-active') handleToggleActive(row)
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
  {
    label: '最後登入',
    prop: 'last_login',
    formatter: (item: Record<string, unknown>) => (item.last_login ? formatDateTimeTW(item.last_login) : '從未登入'),
  },
]

onMounted(() => {
  fetchUsers()
  fetchPermissionDefinition()
})

defineExpose({
  userForm, editUserForm, editUserDialogVisible, saveUser, saveEditUser, handleEditUser,
  editingDeviation, openSaveAsRole, submitSaveAsRole, saveAsRoleForm, saveAsRoleDialogVisible,
  keyword, roleFilter, filteredUsers, clearFilters, onRowCommand, resetDialogVisible, handleResetPassword, handleDeleteUser, handleToggleActive,
  audience, staffUsers, parentUsers, filteredParentUsers, onAudienceChange, roleFilterOptions, parentEmptyText,
  staffStats, parentStats, loadError,
})
</script>

<template>
  <div>
    <el-segmented
      :model-value="audience"
      :options="audienceOptions"
      class="audience-switcher"
      @change="onAudienceChange"
    />
    <div v-if="audience === 'staff'" class="accounts-stats">
      教職員 <b>{{ staffStats.total }}</b>・啟用 <b>{{ staffStats.active }}</b>・從未登入 <b>{{ staffStats.neverLoggedIn }}</b>・自訂權限 <b>{{ staffStats.custom }}</b>
    </div>
    <div v-else class="accounts-stats">
      家長 <b>{{ parentStats.total }}</b>・啟用 <b>{{ parentStats.active }}</b>
    </div>
    <div class="accounts-toolbar">
      <div class="toolbar-left">
        <el-input v-model="keyword" :placeholder="audience === 'staff' ? '搜尋帳號 / 姓名' : '搜尋帳號'" clearable style="width: 220px;" />
        <el-select v-if="audience === 'staff'" v-model="roleFilter" placeholder="全部角色" clearable style="width: 160px;">
          <el-option v-for="r in roleFilterOptions" :key="r.code" :label="r.label" :value="r.code" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button v-if="hasPermission('ROLES_MANAGE')" data-testid="goto-roles" @click="router.push('/settings/roles')">⚙ 管理角色</el-button>
        <el-button type="primary" @click="handleAddUser">新增帳號</el-button>
      </div>
    </div>
    <template v-if="audience === 'staff'">
    <el-table v-if="!isMobile" :data="filteredUsers" v-loading="loadingUsers" style="width: 100%; margin-top: 20px;">
      <el-table-column prop="username" label="帳號" min-width="150" />
      <el-table-column prop="employee_name" label="員工姓名" min-width="130" />
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
      <el-table-column label="最後登入" min-width="170">
        <template #default="{ row } = {}">
          <span v-if="row?.last_login">{{ formatDateTimeTW(row.last_login) }}</span>
          <span v-else class="never-logged-in">從未登入</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row } = {}">
          <el-button v-if="row" link type="primary" @click="handleEditUser(row)">編輯</el-button>
          <el-dropdown v-if="row" trigger="click" @command="(cmd: string) => onRowCommand(cmd, row)">
            <el-button link type="primary">更多<el-icon class="el-icon--right"><arrow-down /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="reset">重設密碼</el-dropdown-item>
                <el-dropdown-item command="toggle-active">{{ row?.is_active ? '停用帳號' : '啟用帳號' }}</el-dropdown-item>
                <el-dropdown-item command="delete" divided>刪除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </el-table-column>
      <template #empty>
        <div class="accounts-empty">
          <template v-if="loadError">
            <span>帳號載入失敗</span>
            <el-button link type="primary" data-testid="retry-fetch" @click="fetchUsers">重試</el-button>
          </template>
          <template v-else-if="keyword || roleFilter">
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
              <el-dropdown-item command="toggle-active">{{ item.is_active ? '停用帳號' : '啟用帳號' }}</el-dropdown-item>
              <el-dropdown-item command="delete" divided>刪除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </AdminListCards>
    </template>
    <ParentAccountsList
      v-else
      :items="filteredParentUsers"
      :loading="loadingUsers"
      :empty-text="parentEmptyText"
      style="margin-top: 20px;"
      @toggle-active="handleToggleActive"
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
          <RoleCardsGrid v-model="userForm.role" :definition="permissionDefinition" />
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
          <RoleCardsGrid v-model="editUserForm.role" :definition="permissionDefinition" />
        </el-form-item>

        <el-form-item v-if="editingDeviation" label="權限">
          <el-alert type="warning" :closable="false" class="deviation-alert" data-testid="deviation-alert">
            <template #title>此帳號的權限偏離角色預設（唯讀）</template>
            <div v-if="editingDeviation.extra.length">較預設多：{{ editingDeviation.extra.join('、') }}</div>
            <div v-if="editingDeviation.missing.length">較預設少：{{ editingDeviation.missing.join('、') }}</div>
            <div class="deviation-note">變更角色並儲存後，將以新角色的預設權限取代自訂權限。</div>
            <el-button size="small" data-testid="save-as-role" @click="openSaveAsRole">另存為自訂角色</el-button>
          </el-alert>
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

    <!-- 另存為自訂角色 -->
    <el-dialog v-model="saveAsRoleDialogVisible" title="另存為自訂角色" width="440px" append-to-body>
      <p style="margin: 0 0 12px; color: var(--text-tertiary); font-size: 13px;">
        以此帳號目前的權限集合建立新角色，並指派給此帳號。
      </p>
      <el-form :model="saveAsRoleForm" label-width="60px">
        <el-form-item label="code">
          <el-input v-model="saveAsRoleForm.code" placeholder="例：custom_hr_plus" />
        </el-form-item>
        <el-form-item label="名稱">
          <el-input v-model="saveAsRoleForm.label" placeholder="例：人資（含薪資）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveAsRoleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingAsRole" data-testid="submit-save-as-role" @click="submitSaveAsRole">建立並指派</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.audience-switcher {
  margin-bottom: 12px;
}

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

.deviation-alert {
  width: 100%;
}

.deviation-note {
  margin: 6px 0;
  color: var(--text-tertiary);
  font-size: 12px;
}

.accounts-empty {
  padding: 24px 0;
  color: var(--text-tertiary);
  font-size: 14px;
}

.never-logged-in {
  color: var(--text-tertiary);
}

.accounts-stats {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.accounts-stats b {
  color: var(--text-primary);
  font-weight: 600;
}
</style>
