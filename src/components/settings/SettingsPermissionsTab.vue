<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPermissions } from '@/api/auth'
import {
  createPermissionDefinition,
  updatePermissionDefinition,
  deletePermissionDefinition,
  createRole,
  updateRole,
  deleteRole,
} from '@/api/permissions_admin'
import { apiError } from '@/utils/error'

interface RoleDef {
  label: string
  description: string
  permissions: string[]
  is_core: boolean
}

interface PermDef {
  value: string
  label: string
  is_core: boolean
  scope_options?: string[] | null
}

interface PermissionsResponse {
  permissions: Record<string, PermDef>
  groups: { name: string; permissions: string[]; split_permissions?: { module: string; read: string; write: string }[] }[]
  roles: Record<string, RoleDef>
}

const activeSubTab = ref<'roles' | 'definitions'>('roles')
const definition = ref<PermissionsResponse>({ permissions: {}, groups: [], roles: {} })
const loading = ref(false)

const roleRows = computed(() =>
  Object.entries(definition.value.roles).map(([code, r]) => ({
    code,
    label: r.label,
    description: r.description,
    permission_count: r.permissions.includes('*') ? '全部' : `${r.permissions.length} 條`,
    is_core: r.is_core,
    permissions: r.permissions,
  })),
)

const permissionRows = computed(() =>
  Object.entries(definition.value.permissions).map(([code, p]) => ({
    code,
    label: p.label,
    group_name: _findGroupName(code),
    is_core: p.is_core,
  })),
)

function _findGroupName(code: string): string {
  for (const g of definition.value.groups) {
    if ((g.permissions || []).includes(code)) return g.name
    for (const sp of g.split_permissions || []) {
      if (sp.read === code || sp.write === code) return g.name
    }
  }
  return '其他'
}

async function fetchDefinition() {
  loading.value = true
  try {
    const res = await getPermissions()
    definition.value = res.data
  } catch (e) {
    ElMessage.error('載入權限定義失敗')
  } finally {
    loading.value = false
  }
}

// Role dialog
const roleDialogVisible = ref(false)
const roleEditMode = ref<'create' | 'edit'>('create')
const roleForm = reactive<{ code: string; label: string; description: string; permissions: string[]; is_core: boolean }>({
  code: '',
  label: '',
  description: '',
  permissions: [],
  is_core: false,
})

function handleAddRole() {
  roleEditMode.value = 'create'
  Object.assign(roleForm, { code: '', label: '', description: '', permissions: [], is_core: false })
  roleDialogVisible.value = true
}

function handleEditRole(row: typeof roleRows.value[0]) {
  roleEditMode.value = 'edit'
  Object.assign(roleForm, {
    code: row.code,
    label: row.label,
    description: row.description,
    permissions: [...row.permissions],
    is_core: row.is_core,
  })
  roleDialogVisible.value = true
}

async function saveRole() {
  try {
    if (roleEditMode.value === 'create') {
      await createRole({
        code: roleForm.code,
        label: roleForm.label,
        description: roleForm.description || undefined,
        permissions: roleForm.permissions,
      })
      ElMessage.success('角色已新增')
    } else {
      const payload: Record<string, unknown> = { label: roleForm.label, description: roleForm.description }
      if (!roleForm.is_core) {
        payload.permissions = roleForm.permissions
      }
      await updateRole(roleForm.code, payload)
      ElMessage.success('角色已更新')
    }
    roleDialogVisible.value = false
    await fetchDefinition()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  }
}

function handleDeleteRole(row: typeof roleRows.value[0]) {
  ElMessageBox.confirm(`確定刪除角色「${row.label}」（code: ${row.code}）？`, '警告', { type: 'warning' })
    .then(async () => {
      try {
        await deleteRole(row.code)
        ElMessage.success('角色已刪除')
        await fetchDefinition()
      } catch (e) {
        ElMessage.error(apiError(e, '刪除失敗'))
      }
    })
    .catch(() => {})
}

// Permission dialog
const permDialogVisible = ref(false)
const permEditMode = ref<'create' | 'edit'>('create')
const permForm = reactive<{ code: string; label: string; description: string; group_name: string; is_core: boolean }>({
  code: '',
  label: '',
  description: '',
  group_name: '自訂',
  is_core: false,
})

const existingGroupNames = computed(() => Array.from(new Set(definition.value.groups.map((g) => g.name))))

function handleAddPermission() {
  permEditMode.value = 'create'
  Object.assign(permForm, { code: '', label: '', description: '', group_name: '自訂', is_core: false })
  permDialogVisible.value = true
}

function handleEditPermission(row: typeof permissionRows.value[0]) {
  permEditMode.value = 'edit'
  Object.assign(permForm, {
    code: row.code,
    label: row.label,
    description: '',
    group_name: row.group_name,
    is_core: row.is_core,
  })
  permDialogVisible.value = true
}

async function savePermission() {
  try {
    if (permEditMode.value === 'create') {
      await createPermissionDefinition({
        code: permForm.code,
        label: permForm.label,
        description: permForm.description || undefined,
        group_name: permForm.group_name,
      })
      ElMessage.success('權限已新增')
    } else {
      await updatePermissionDefinition(permForm.code, {
        label: permForm.label,
        description: permForm.description,
        group_name: permForm.group_name,
      })
      ElMessage.success('權限已更新')
    }
    permDialogVisible.value = false
    await fetchDefinition()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  }
}

function handleDeletePermission(row: typeof permissionRows.value[0]) {
  ElMessageBox.confirm(
    `確定刪除權限「${row.label}」（code: ${row.code}）？\n所有引用此權限的角色與帳號都會被清掉。`,
    '警告',
    { type: 'warning' },
  )
    .then(async () => {
      try {
        await deletePermissionDefinition(row.code)
        ElMessage.success('權限已刪除')
        await fetchDefinition()
      } catch (e) {
        ElMessage.error(apiError(e, '刪除失敗'))
      }
    })
    .catch(() => {})
}

onMounted(() => {
  fetchDefinition()
})

// ── Scope-aware permission helpers ──

/** Return scope_options array for a permission code, or [] if none. */
function scopeOptionsFor(code: string): string[] {
  return definition.value.permissions[code]?.scope_options ?? []
}

/** Split a complex key like "STUDENTS_READ:own_class" into code + scope. */
function splitPermKey(key: string): { code: string; scope: string | null } {
  const idx = key.indexOf(':')
  if (idx === -1) return { code: key, scope: null }
  return { code: key.slice(0, idx), scope: key.slice(idx + 1) }
}

/** Is this permission code checked (bare or any scoped form)? */
function isPermChecked(code: string): boolean {
  return roleForm.permissions.some((k) => splitPermKey(k).code === code)
}

/** Current scope for a checked permission, or null if bare/unchecked. */
function currentPermScope(code: string): string | null {
  const found = roleForm.permissions.find((k) => splitPermKey(k).code === code)
  if (!found) return null
  return splitPermKey(found).scope
}

/** Toggle a checkbox on/off. When enabling a scoped permission, default to 'own_class'. */
function togglePerm(code: string, checked: boolean) {
  const filtered = roleForm.permissions.filter((k) => splitPermKey(k).code !== code)
  if (checked) {
    const opts = scopeOptionsFor(code)
    if (opts.length > 0) {
      const dflt = opts.includes('own_class') ? 'own_class' : opts[0]
      filtered.push(`${code}:${dflt}`)
    } else {
      filtered.push(code)
    }
  }
  roleForm.permissions = filtered
}

/** Update the scope for an already-checked permission. */
function setPermScope(code: string, scope: string) {
  roleForm.permissions = roleForm.permissions.map((k) =>
    splitPermKey(k).code === code ? `${code}:${scope}` : k,
  )
}

const SCOPE_LABELS: Record<string, string> = {
  own_class: '僅自班',
  all: '全園',
}

defineExpose({ splitPermKey, isPermChecked, currentPermScope, togglePerm, setPermScope, roleForm, roleDialogVisible, roleEditMode })
</script>

<template>
  <div class="settings-permissions-tab">
    <el-tabs v-model="activeSubTab" type="border-card">
      <el-tab-pane label="角色管理" name="roles">
        <div class="tab-header">
          <el-button class="add-role-btn" type="primary" @click="handleAddRole">新增角色</el-button>
        </div>
        <el-table :data="roleRows" v-loading="loading" class="roles-table">
          <el-table-column prop="code" label="code" width="180" />
          <el-table-column prop="label" label="名稱" width="180" />
          <el-table-column prop="description" label="說明" />
          <el-table-column prop="permission_count" label="權限數" width="100" />
          <el-table-column label="類型" width="80">
            <template #default="{ row }">
              <el-tag :type="row.is_core ? 'info' : 'warning'" size="small">
                {{ row.is_core ? '核心' : '自訂' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180">
            <template #default="{ row }">
              <el-button link type="primary" @click="handleEditRole(row)">編輯</el-button>
              <el-button
                class="delete-role-btn"
                link
                type="danger"
                :disabled="row.is_core"
                :title="row.is_core ? '核心角色不可刪除' : ''"
                @click="handleDeleteRole(row)"
              >
                刪除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="權限定義" name="definitions">
        <el-alert
          class="permission-warning-callout"
          type="warning"
          :closable="false"
          show-icon
          title="自訂權限的範圍限制"
          description="自訂權限僅可用於『角色組合』與『前端條件渲染』；後端 API 守衛仍是 hardcoded enum，新增權限不會自動為任何 endpoint 加守衛。若需後端守衛新模組，請開 issue 走開發流程。"
        />
        <div class="tab-header" style="margin-top: 12px;">
          <el-button class="add-permission-btn" type="primary" @click="handleAddPermission">新增權限</el-button>
        </div>
        <el-table :data="permissionRows" v-loading="loading" class="permissions-table">
          <el-table-column prop="code" label="code" width="220" />
          <el-table-column prop="label" label="名稱" width="180" />
          <el-table-column prop="group_name" label="分組" width="120" />
          <el-table-column label="類型" width="80">
            <template #default="{ row }">
              <el-tag :type="row.is_core ? 'info' : 'warning'" size="small">
                {{ row.is_core ? '核心' : '自訂' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180">
            <template #default="{ row }">
              <el-button link type="primary" @click="handleEditPermission(row)">編輯</el-button>
              <el-button
                class="delete-permission-btn"
                link
                type="danger"
                :disabled="row.is_core"
                :title="row.is_core ? '核心權限不可刪除' : ''"
                @click="handleDeletePermission(row)"
              >
                刪除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- Role Edit Dialog -->
    <el-dialog v-model="roleDialogVisible" :title="roleEditMode === 'create' ? '新增角色' : '編輯角色'" width="640px" class="role-edit-dialog">
      <el-form :model="roleForm" label-width="100px">
        <el-form-item label="code">
          <el-input v-model="roleForm.code" :disabled="roleEditMode === 'edit'" placeholder="例：custom_principal" />
        </el-form-item>
        <el-form-item label="名稱">
          <el-input v-model="roleForm.label" placeholder="例：兼會計園長" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="roleForm.description" type="textarea" :rows="2" placeholder="一句話描述適用對象" />
        </el-form-item>
        <el-form-item label="權限">
          <div v-if="roleForm.is_core" class="readonly-hint">核心角色的權限不可修改</div>
          <div v-else class="permission-checkboxes">
            <div v-for="group in definition.groups" :key="group.name" class="perm-group">
              <div class="perm-group-name">{{ group.name }}</div>
              <div v-for="code in group.permissions" :key="code" class="perm-row">
                <el-checkbox
                  :model-value="isPermChecked(code)"
                  @change="(v) => togglePerm(code, !!v)"
                >
                  {{ definition.permissions[code]?.label || code }}
                </el-checkbox>
                <div
                  v-if="isPermChecked(code) && scopeOptionsFor(code).length > 0"
                  :data-perm-scope="code"
                  class="perm-scope-row"
                >
                  <el-radio-group
                    :model-value="currentPermScope(code) ?? undefined"
                    size="small"
                    @update:model-value="(v) => setPermScope(code, String(v))"
                  >
                    <el-radio
                      v-for="opt in scopeOptionsFor(code)"
                      :key="opt"
                      :value="opt"
                    >
                      {{ SCOPE_LABELS[opt] || opt }}
                    </el-radio>
                  </el-radio-group>
                </div>
              </div>
              <div v-for="sp in group.split_permissions" :key="sp.read" class="split-row">
                <span>{{ sp.module }}</span>
                <el-checkbox
                  :model-value="roleForm.permissions.includes(sp.read)"
                  @change="(v) => v ? roleForm.permissions.push(sp.read) : roleForm.permissions.splice(roleForm.permissions.indexOf(sp.read), 1)"
                >檢視</el-checkbox>
                <el-checkbox
                  :model-value="roleForm.permissions.includes(sp.write)"
                  @change="(v) => v ? roleForm.permissions.push(sp.write) : roleForm.permissions.splice(roleForm.permissions.indexOf(sp.write), 1)"
                >編輯</el-checkbox>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRole">儲存</el-button>
      </template>
    </el-dialog>

    <!-- Permission Edit Dialog -->
    <el-dialog v-model="permDialogVisible" :title="permEditMode === 'create' ? '新增權限' : '編輯權限'" width="540px" class="permission-edit-dialog">
      <el-form :model="permForm" label-width="100px">
        <el-form-item label="code">
          <el-input v-model="permForm.code" data-field="code" :disabled="permEditMode === 'edit'" placeholder="例：PARENT_SURVEY_WRITE" />
        </el-form-item>
        <el-form-item label="名稱">
          <el-input v-model="permForm.label" placeholder="例：家長問卷編輯" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="permForm.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="分組">
          <el-select v-model="permForm.group_name" filterable allow-create>
            <el-option v-for="g in existingGroupNames" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="permDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="savePermission">儲存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.settings-permissions-tab {
  padding: 8px;
}
.tab-header {
  margin-bottom: 12px;
}
.permission-checkboxes {
  width: 100%;
}
.perm-group {
  margin-bottom: 12px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 4px;
}
.perm-group-name {
  font-weight: 600;
  margin-bottom: 6px;
}
.split-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 4px 0;
}
.readonly-hint {
  color: var(--text-tertiary);
  padding: 6px 0;
}
.perm-row {
  margin-bottom: 4px;
}
.perm-scope-row {
  margin-left: 24px;
  margin-top: 2px;
  margin-bottom: 6px;
}
</style>
