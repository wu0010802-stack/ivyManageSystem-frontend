# 帳號 × 角色管理 UI/UX 整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「系統設定」內並排的「帳號管理」「角色管理」兩個 tab 整合成單一「帳號與權限」頁面，並抽出共用 `PermissionPicker` 消除重複的權限挑選 UI（帳號覆寫順帶獲得 scope 能力）。

**Architecture:** 帳號為主、角色為輔的單頁。`SettingsAccountsTab`（由 `SettingsUsersTab` 演進改名）為主畫面，持有 `definition` 與 `users` 並下傳；新增共用受控元件 `PermissionPicker`（同時處理 wildcard 與 scope）；角色 CRUD 收進 `RoleManagerDrawer`（右側抽屜，吃掉 `SettingsPermissionsTab`）。純前端，不動後端 API、路由、選單。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、Pinia、Vitest + @vue/test-utils。

## Global Constraints

- TS-only：所有新 SFC 一律 `<script setup lang="ts">`；禁 `: any` / `as any`，用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`。
- 繁體中文：對話、commit message、docstring、註解一律繁中。
- Commit：Conventional Commits；一個 commit 只做一件事；commit message 結尾加 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 測試：純邏輯/行為必補測試；修 bug 先補能重現的回歸測試。錨點用穩定 `data-*`（`data-perm-scope` / `data-role`），不靠 CSS class（element-plus teleport）。
- 不動後端：沿用既有 API（`@/api/auth`、`@/api/permissions_admin`）；無 OpenAPI schema 變動，免 codegen。
- 不動 `@/utils/auth.ts`；沿用 `shouldSendPermissionNames` 越權守衛（teacher/parent 省略 `permission_names`），**不可移除**。
- 針對性跑測試：`npm run test -- --run src/components/settings`；型別：`npm run type-check`。
- 共用 checkout 多 session：commit 前確認在 `main`、只 `git add` 本任務檔案，不夾帶他人 untracked / 自動產生的 `components.d.ts`。**不 push**（push 後端會觸發 Zeabur 部署；前端 push 由 user 決定）。

---

## File Structure

| 檔案 | 動作 | 職責 |
|------|------|------|
| `src/components/settings/PermissionPicker.vue` | Create | 共用受控權限挑選元件（wildcard + scope + split + 全選/清除） |
| `src/components/settings/__tests__/PermissionPicker.test.ts` | Create | picker 行為測試（遷移 scope 案例 + 新增 wildcard 展開） |
| `src/components/settings/RoleManagerDrawer.vue` | Create | 右側抽屜：角色清單 CRUD（含帳號數欄），權限編輯用 `PermissionPicker` |
| `src/components/settings/__tests__/RoleManagerDrawer.test.ts` | Create | 角色表/CRUD/emit 測試（承接 `SettingsPermissionsTab.test.ts`） |
| `src/components/settings/SettingsAccountsTab.vue` | Create（由 `SettingsUsersTab.vue` 演進） | 主畫面：帳號 CRUD + 搜尋/角色篩選 + 進階微調用 picker + 管理角色按鈕 |
| `src/components/settings/__tests__/SettingsAccountsTab.test.ts` | Create（由 `SettingsUsersTab.test.ts` 演進） | 帳號 CRUD + 篩選 + scope deviation + 空狀態 |
| `src/components/settings/SettingsPermissionsTab.vue` | Delete | 由 drawer + picker 取代 |
| `src/components/settings/SettingsUsersTab.vue` | Delete | 改名為 `SettingsAccountsTab.vue` |
| `src/components/settings/__tests__/SettingsPermissionsTab.test.ts` | Delete | 遷移到 `RoleManagerDrawer.test.ts` |
| `src/components/settings/__tests__/SettingsPermissionsTab.scope.test.ts` | Delete | 遷移到 `PermissionPicker.test.ts` |
| `src/components/settings/__tests__/SettingsUsersTab.test.ts` | Delete | 遷移到 `SettingsAccountsTab.test.ts` |
| `src/views/SettingsView.vue` | Modify | 兩 tab → 一 tab「帳號與權限」 |

> 註：Task 1/2 先建立新元件並各自綠燈，Task 3 再做改名與整併，Task 5 收尾刪舊檔與接線，過程中保持測試可跑。

---

## Task 1: PermissionPicker.vue（共用受控權限挑選元件）

**Files:**
- Create: `src/components/settings/PermissionPicker.vue`
- Test: `src/components/settings/__tests__/PermissionPicker.test.ts`

**Interfaces:**
- Consumes: `@/utils/auth` 的 `permissionsAdd`、`permissionsRemove`、`permissionsCombine`（既有）。
- Produces（供 Task 2、Task 3 使用）：
  - `export interface PermissionPickerDefinition { permissions: Record<string, { value: string; label: string; is_core?: boolean; scope_options?: string[] | null }>; groups: { name: string; permissions?: string[]; split_permissions?: { module: string; read: string; write: string }[] }[] }`
  - Props：`modelValue: string[]`、`definition: PermissionPickerDefinition`、`disabled?: boolean`
  - Emit：`'update:modelValue': [next: string[]]`（即 `v-model` 綁 `string[]`）
  - `defineExpose`：`{ toggle, setScope, toggleSplit, isChecked, currentScope, isSplitChecked, selectAll, clearAll }`

- [ ] **Step 1: 寫失敗測試**

`src/components/settings/__tests__/PermissionPicker.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PermissionPicker from '../PermissionPicker.vue'

const DEFINITION = {
  permissions: {
    STUDENTS_READ: { value: 'STUDENTS_READ', label: '學生 (檢視)', scope_options: ['own_class', 'all'] },
    DASHBOARD: { value: 'DASHBOARD', label: '儀表板', scope_options: null },
    EMPLOYEES_READ: { value: 'EMPLOYEES_READ', label: '員工 (檢視)', scope_options: null },
  },
  groups: [
    { name: '學生', permissions: ['STUDENTS_READ'], split_permissions: [] },
    { name: '一般', permissions: ['DASHBOARD', 'EMPLOYEES_READ'], split_permissions: [] },
  ],
}

function mountPicker(modelValue: string[], disabled = false) {
  return mount(PermissionPicker, {
    attachTo: document.body,
    props: { modelValue, definition: DEFINITION, disabled },
    global: { plugins: [ElementPlus] },
  })
}

type Vm = {
  toggle: (code: string, checked: boolean) => void
  setScope: (code: string, scope: string) => void
  toggleSplit: (perm: string, checked: boolean) => void
  isChecked: (code: string) => boolean
  currentScope: (code: string) => string | null
  selectAll: () => void
  clearAll: () => void
}
const lastEmit = (w: ReturnType<typeof mountPicker>): string[] => {
  const ev = w.emitted('update:modelValue')
  return (ev?.[ev.length - 1]?.[0] ?? []) as string[]
}

describe('PermissionPicker', () => {
  it('selectAll emits wildcard, clearAll emits empty', () => {
    const w = mountPicker([])
    ;(w.vm as unknown as Vm).selectAll()
    expect(lastEmit(w)).toEqual(['*'])
    ;(w.vm as unknown as Vm).clearAll()
    expect(lastEmit(w)).toEqual([])
  })

  it('toggle on scope-aware code defaults to own_class', () => {
    const w = mountPicker([])
    ;(w.vm as unknown as Vm).toggle('STUDENTS_READ', true)
    expect(lastEmit(w)).toContain('STUDENTS_READ:own_class')
  })

  it('toggle on non-scope code adds bare key', () => {
    const w = mountPicker([])
    ;(w.vm as unknown as Vm).toggle('DASHBOARD', true)
    expect(lastEmit(w)).toContain('DASHBOARD')
    expect(lastEmit(w).find((k) => k.startsWith('DASHBOARD:'))).toBeUndefined()
  })

  it('unchecking a code in wildcard state expands to all bare codes minus that one', () => {
    const w = mountPicker(['*'])
    ;(w.vm as unknown as Vm).toggle('DASHBOARD', false)
    const next = lastEmit(w)
    expect(next).not.toContain('*')
    expect(next).toContain('STUDENTS_READ')   // bare = 全園
    expect(next).toContain('EMPLOYEES_READ')
    expect(next).not.toContain('DASHBOARD')
  })

  it('setScope replaces an existing scoped entry', () => {
    const w = mountPicker(['STUDENTS_READ:own_class'])
    ;(w.vm as unknown as Vm).setScope('STUDENTS_READ', 'all')
    expect(lastEmit(w)).toContain('STUDENTS_READ:all')
    expect(lastEmit(w)).not.toContain('STUDENTS_READ:own_class')
  })

  it('currentScope: bare scope-aware shows all, scoped shows its scope, wildcard shows all', () => {
    expect((mountPicker(['STUDENTS_READ']).vm as unknown as Vm).currentScope('STUDENTS_READ')).toBe('all')
    expect((mountPicker(['STUDENTS_READ:own_class']).vm as unknown as Vm).currentScope('STUDENTS_READ')).toBe('own_class')
    expect((mountPicker(['*']).vm as unknown as Vm).currentScope('STUDENTS_READ')).toBe('all')
  })

  it('isChecked true for wildcard and for any scoped form', () => {
    expect((mountPicker(['*']).vm as unknown as Vm).isChecked('DASHBOARD')).toBe(true)
    expect((mountPicker(['STUDENTS_READ:all']).vm as unknown as Vm).isChecked('STUDENTS_READ')).toBe(true)
    expect((mountPicker([]).vm as unknown as Vm).isChecked('DASHBOARD')).toBe(false)
  })

  it('disabled renders readonly hint, no checkboxes', () => {
    const w = mountPicker(['DASHBOARD'], true)
    expect(w.find('.readonly-hint').exists()).toBe(true)
    expect(w.find('.el-checkbox').exists()).toBe(false)
  })

  it('scope radio row does not render for non-scope permission', () => {
    mountPicker(['DASHBOARD'])
    expect(document.querySelector('[data-perm-scope="DASHBOARD"]')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npm run test -- --run src/components/settings/__tests__/PermissionPicker.test.ts`
Expected: FAIL（找不到 `../PermissionPicker.vue`）

- [ ] **Step 3: 實作 PermissionPicker.vue**

`src/components/settings/PermissionPicker.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { permissionsAdd, permissionsRemove, permissionsCombine } from '@/utils/auth'

export interface PermissionPickerDefinition {
  permissions: Record<string, { value: string; label: string; is_core?: boolean; scope_options?: string[] | null }>
  groups: { name: string; permissions?: string[]; split_permissions?: { module: string; read: string; write: string }[] }[]
}

const props = defineProps<{
  modelValue: string[]
  definition: PermissionPickerDefinition
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [next: string[]] }>()

const SCOPE_LABELS: Record<string, string> = { own_class: '僅自班', all: '全園' }

const isWildcard = computed(() => props.modelValue.includes('*'))

function splitPermKey(key: string): { code: string; scope: string | null } {
  const idx = key.indexOf(':')
  if (idx === -1) return { code: key, scope: null }
  return { code: key.slice(0, idx), scope: key.slice(idx + 1) }
}

function scopeOptionsFor(code: string): string[] {
  return props.definition.permissions[code]?.scope_options ?? []
}

/** wildcard 展開成所有 bare code（bare = 全園，對齊後端 resolve_grant）。 */
function expandWildcard(): string[] {
  return permissionsCombine([Object.keys(props.definition.permissions)])
}

function isChecked(code: string): boolean {
  if (isWildcard.value) return true
  return props.modelValue.some((k) => splitPermKey(k).code === code)
}

/** bare scope-aware code → 顯示 'all'；scoped → 該 scope；wildcard → 'all'。 */
function currentScope(code: string): string | null {
  if (isWildcard.value) return 'all'
  const found = props.modelValue.find((k) => splitPermKey(k).code === code)
  if (!found) return null
  return splitPermKey(found).scope ?? 'all'
}

function isSplitChecked(perm: string): boolean {
  if (isWildcard.value) return true
  return props.modelValue.includes(perm)
}

function toggle(code: string, checked: boolean) {
  let base = isWildcard.value ? expandWildcard() : [...props.modelValue]
  base = base.filter((k) => splitPermKey(k).code !== code)
  if (checked) {
    const opts = scopeOptionsFor(code)
    if (opts.length > 0) {
      base.push(`${code}:${opts.includes('own_class') ? 'own_class' : opts[0]}`)
    } else {
      base.push(code)
    }
  }
  emit('update:modelValue', base)
}

function setScope(code: string, scope: string) {
  const base = isWildcard.value ? expandWildcard() : [...props.modelValue]
  emit('update:modelValue', base.map((k) => (splitPermKey(k).code === code ? `${code}:${scope}` : k)))
}

function toggleSplit(perm: string, checked: boolean) {
  const base = isWildcard.value ? expandWildcard() : [...props.modelValue]
  emit('update:modelValue', checked ? permissionsAdd(base, perm) : permissionsRemove(base, perm))
}

function selectAll() {
  emit('update:modelValue', ['*'])
}
function clearAll() {
  emit('update:modelValue', [])
}

function labelFor(code: string): string {
  return props.definition.permissions[code]?.label || code
}

defineExpose({ toggle, setScope, toggleSplit, isChecked, currentScope, isSplitChecked, selectAll, clearAll })
</script>

<template>
  <div class="permission-picker">
    <div v-if="disabled" class="readonly-hint">核心角色的權限不可修改</div>
    <template v-else>
      <div class="picker-actions">
        <el-button size="small" @click="selectAll">全選</el-button>
        <el-button size="small" @click="clearAll">清除</el-button>
      </div>
      <div v-for="group in definition.groups" :key="group.name" class="perm-group">
        <div class="perm-group-name">{{ group.name }}</div>
        <div v-for="code in (group.permissions || [])" :key="code" class="perm-row">
          <el-checkbox :model-value="isChecked(code)" @change="(v) => toggle(code, !!v)">
            {{ labelFor(code) }}
          </el-checkbox>
          <div
            v-if="isChecked(code) && scopeOptionsFor(code).length > 0"
            :data-perm-scope="code"
            class="perm-scope-row"
          >
            <el-radio-group
              :model-value="currentScope(code) ?? undefined"
              size="small"
              @update:model-value="(v) => setScope(code, String(v))"
            >
              <el-radio v-for="opt in scopeOptionsFor(code)" :key="opt" :value="opt">
                {{ SCOPE_LABELS[opt] || opt }}
              </el-radio>
            </el-radio-group>
          </div>
        </div>
        <div v-for="sp in (group.split_permissions || [])" :key="sp.read" class="split-row">
          <span class="split-label">{{ sp.module }}</span>
          <el-checkbox :model-value="isSplitChecked(sp.read)" @change="(v) => toggleSplit(sp.read, !!v)">檢視</el-checkbox>
          <el-checkbox :model-value="isSplitChecked(sp.write)" @change="(v) => toggleSplit(sp.write, !!v)">編輯</el-checkbox>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.picker-actions {
  margin-bottom: 12px;
}
.perm-group {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 6px;
}
.perm-group-name {
  font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-primary);
}
.perm-row {
  margin-bottom: 4px;
}
.perm-scope-row {
  margin-left: 24px;
  margin-top: 2px;
  margin-bottom: 6px;
}
.split-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 4px 0;
}
.split-label {
  min-width: 80px;
  font-size: 14px;
  color: var(--text-secondary);
}
.readonly-hint {
  color: var(--text-tertiary);
  padding: 6px 0;
}
</style>
```

- [ ] **Step 4: 跑測試確認 GREEN**

Run: `npm run test -- --run src/components/settings/__tests__/PermissionPicker.test.ts`
Expected: PASS（9 cases）

- [ ] **Step 5: 型別檢查**

Run: `npm run type-check`
Expected: 無新錯誤

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/PermissionPicker.vue src/components/settings/__tests__/PermissionPicker.test.ts
git commit -m "feat(settings): 新增共用 PermissionPicker 元件（wildcard + scope 統一處理）

$(cat <<'EOF'
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: RoleManagerDrawer.vue（角色管理抽屜）

**Files:**
- Create: `src/components/settings/RoleManagerDrawer.vue`
- Test: `src/components/settings/__tests__/RoleManagerDrawer.test.ts`
- 參考來源（複製/改寫）：`src/components/settings/SettingsPermissionsTab.vue`、`src/components/settings/__tests__/SettingsPermissionsTab.test.ts`

**Interfaces:**
- Consumes：Task 1 的 `PermissionPicker`（`v-model` 綁 `string[]`、`:definition`、`:disabled`）+ `PermissionPickerDefinition` 型別；`@/api/permissions_admin` 的 `createRole / updateRole / deleteRole`；`@/utils/error` 的 `apiError`。
- Produces（供 Task 3）：
  - Props：`visible: boolean`、`definition: RolesDefinition`、`users: Record<string, unknown>[]`
  - Emits：`'update:visible': [v: boolean]`、`'roles-changed': []`
  - 其中 `RolesDefinition = PermissionPickerDefinition & { roles: Record<string, { label: string; description: string; permissions: string[]; is_core: boolean }> }`
  - `defineExpose`：`{ roleRows, roleForm, roleDialogVisible, roleEditMode, handleAddRole, handleEditRole, saveRole, handleDeleteRole, accountCount }`

- [ ] **Step 1: 寫失敗測試**

`src/components/settings/__tests__/RoleManagerDrawer.test.ts`（承接 `SettingsPermissionsTab.test.ts` 的 CRUD 案例 + 新增帳號數欄 + emit）：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'

const createRole = vi.fn().mockResolvedValue({ data: {} })
const updateRole = vi.fn().mockResolvedValue({ data: {} })
const deleteRole = vi.fn().mockResolvedValue({ data: { ok: true } })
vi.mock('@/api/permissions_admin', () => ({ createRole, updateRole, deleteRole }))
vi.mock('@/utils/error', () => ({ apiError: vi.fn((_e: unknown, msg: string) => msg) }))

import RoleManagerDrawer from '../RoleManagerDrawer.vue'

const DEFINITION = {
  permissions: {
    STUDENTS_READ: { value: 'STUDENTS_READ', label: '學生 (檢視)', scope_options: ['own_class', 'all'] },
    DASHBOARD: { value: 'DASHBOARD', label: '儀表板', scope_options: null },
  },
  groups: [{ name: '一般', permissions: ['DASHBOARD', 'STUDENTS_READ'], split_permissions: [] }],
  roles: {
    admin: { label: '管理員', description: '全權', permissions: ['*'], is_core: true },
    custom_x: { label: '自訂X', description: '', permissions: ['DASHBOARD'], is_core: false },
  },
}
const USERS = [
  { id: 1, role: 'admin' }, { id: 2, role: 'custom_x' }, { id: 3, role: 'custom_x' },
]

function mountDrawer() {
  return mount(RoleManagerDrawer, {
    attachTo: document.body,
    props: { visible: true, definition: DEFINITION, users: USERS },
    global: { plugins: [ElementPlus] },
  })
}
type Vm = {
  accountCount: (code: string) => number
  handleAddRole: () => void
  handleEditRole: (row: { code: string; label: string; description: string; permissions: string[]; is_core: boolean }) => void
  saveRole: () => Promise<void>
  roleForm: { code: string; label: string; description: string; permissions: string[]; is_core: boolean }
  roleEditMode: string
}

describe('RoleManagerDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('accountCount counts users per role', () => {
    const vm = mountDrawer().vm as unknown as Vm
    expect(vm.accountCount('admin')).toBe(1)
    expect(vm.accountCount('custom_x')).toBe(2)
  })

  it('saveRole (create) calls createRole and emits roles-changed', async () => {
    const w = mountDrawer()
    const vm = w.vm as unknown as Vm
    vm.handleAddRole()
    Object.assign(vm.roleForm, { code: 'new_r', label: '新角色', description: '', permissions: ['DASHBOARD'] })
    await vm.saveRole()
    await flushPromises()
    expect(createRole).toHaveBeenCalledWith(expect.objectContaining({ code: 'new_r', label: '新角色', permissions: ['DASHBOARD'] }))
    expect(w.emitted('roles-changed')).toBeTruthy()
  })

  it('saveRole (edit core role) omits permissions', async () => {
    const w = mountDrawer()
    const vm = w.vm as unknown as Vm
    vm.handleEditRole({ code: 'admin', label: '管理員', description: '全權', permissions: ['*'], is_core: true })
    await vm.saveRole()
    await flushPromises()
    expect(updateRole).toHaveBeenCalledWith('admin', expect.not.objectContaining({ permissions: expect.anything() }))
  })

  it('renders 帳號數 column header', () => {
    const w = mountDrawer()
    expect(w.html()).toContain('帳號數')
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npm run test -- --run src/components/settings/__tests__/RoleManagerDrawer.test.ts`
Expected: FAIL（找不到 `../RoleManagerDrawer.vue`）

- [ ] **Step 3: 實作 RoleManagerDrawer.vue**

以 `SettingsPermissionsTab.vue` 為底改寫成抽屜。完整檔內容：

```vue
<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { createRole, updateRole, deleteRole } from '@/api/permissions_admin'
import { apiError } from '@/utils/error'
import PermissionPicker, { type PermissionPickerDefinition } from './PermissionPicker.vue'

interface RoleDef { label: string; description: string; permissions: string[]; is_core: boolean }
type RolesDefinition = PermissionPickerDefinition & { roles: Record<string, RoleDef> }

const props = defineProps<{
  visible: boolean
  definition: RolesDefinition
  users: Record<string, unknown>[]
}>()
const emit = defineEmits<{ 'update:visible': [v: boolean]; 'roles-changed': [] }>()

const drawerVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

function accountCount(code: string): number {
  return props.users.filter((u) => u.role === code).length
}

const roleRows = computed(() =>
  Object.entries(props.definition.roles).map(([code, r]) => ({
    code,
    label: r.label,
    description: r.description,
    permission_count: r.permissions.includes('*') ? '全部' : `${r.permissions.length} 條`,
    account_count: accountCount(code),
    is_core: r.is_core,
    permissions: r.permissions,
  })),
)

const roleDialogVisible = ref(false)
const roleEditMode = ref<'create' | 'edit'>('create')
const roleForm = reactive<{ code: string; label: string; description: string; permissions: string[]; is_core: boolean }>({
  code: '', label: '', description: '', permissions: [], is_core: false,
})

function handleAddRole() {
  roleEditMode.value = 'create'
  Object.assign(roleForm, { code: '', label: '', description: '', permissions: [], is_core: false })
  roleDialogVisible.value = true
}

function handleEditRole(row: typeof roleRows.value[0]) {
  roleEditMode.value = 'edit'
  Object.assign(roleForm, {
    code: row.code, label: row.label, description: row.description,
    permissions: [...row.permissions], is_core: row.is_core,
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
      if (!roleForm.is_core) payload.permissions = roleForm.permissions
      await updateRole(roleForm.code, payload)
      ElMessage.success('角色已更新')
    }
    roleDialogVisible.value = false
    emit('roles-changed')
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
        emit('roles-changed')
      } catch (e) {
        ElMessage.error(apiError(e, '刪除失敗'))
      }
    })
    .catch(() => {})
}

defineExpose({ roleRows, roleForm, roleDialogVisible, roleEditMode, handleAddRole, handleEditRole, saveRole, handleDeleteRole, accountCount })
</script>

<template>
  <el-drawer v-model="drawerVisible" title="管理角色" direction="rtl" size="680px">
    <div class="drawer-header">
      <el-button class="add-role-btn" type="primary" @click="handleAddRole">新增角色</el-button>
    </div>
    <el-table :data="roleRows" class="roles-table">
      <el-table-column prop="label" label="名稱" width="140" />
      <el-table-column prop="code" label="code" width="150" />
      <el-table-column prop="description" label="說明" />
      <el-table-column prop="permission_count" label="權限數" width="90" />
      <el-table-column prop="account_count" label="帳號數" width="80" />
      <el-table-column label="類型" width="70">
        <template #default="{ row }">
          <el-tag :type="row.is_core ? 'info' : 'warning'" size="small">{{ row.is_core ? '核心' : '自訂' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleEditRole(row)">編輯</el-button>
          <el-button
            class="delete-role-btn" link type="danger"
            :disabled="row.is_core"
            :title="row.is_core ? '核心角色不可刪除' : ''"
            @click="handleDeleteRole(row)"
          >刪除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="roleDialogVisible" :title="roleEditMode === 'create' ? '新增角色' : '編輯角色'" width="640px" append-to-body class="role-edit-dialog">
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
          <PermissionPicker v-model="roleForm.permissions" :definition="definition" :disabled="roleForm.is_core" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRole">儲存</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.drawer-header {
  margin-bottom: 12px;
}
</style>
```

- [ ] **Step 4: 跑測試確認 GREEN**

Run: `npm run test -- --run src/components/settings/__tests__/RoleManagerDrawer.test.ts`
Expected: PASS（4 cases）

- [ ] **Step 5: 型別檢查**

Run: `npm run type-check`
Expected: 無新錯誤

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/RoleManagerDrawer.vue src/components/settings/__tests__/RoleManagerDrawer.test.ts
git commit -m "feat(settings): 新增 RoleManagerDrawer 角色管理抽屜（含帳號數欄，權限編輯用 PermissionPicker）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: SettingsAccountsTab.vue（主畫面：改名 + 進階微調換 picker + 接抽屜）

**Files:**
- Create: `src/components/settings/SettingsAccountsTab.vue`（內容由 `SettingsUsersTab.vue` 改寫而來）
- Create: `src/components/settings/__tests__/SettingsAccountsTab.test.ts`（由 `SettingsUsersTab.test.ts` 改寫）
- 參考來源：`src/components/settings/SettingsUsersTab.vue`（761 行，整段為基底）

**Interfaces:**
- Consumes：Task 1 `PermissionPicker`、Task 2 `RoleManagerDrawer`；`@/api/auth`、`@/stores/employee`、`@/utils/auth`（`shouldSendPermissionNames` 等，皆既有）。
- Produces：作為 `SettingsView.vue` 的子元件（Task 5 接線）。`defineExpose` 沿用 `SettingsUsersTab` 現有暴露（若無則補：`{ userForm, editUserForm, saveUser, saveEditUser, isUsingDefaultPermissions, deviationCount }`）供測試。

本任務分三步改寫（同一個新檔 `SettingsAccountsTab.vue`，先整段複製 `SettingsUsersTab.vue` 再做下列三處改動）。

- [ ] **Step 1: 複製基底並改名**

把 `SettingsUsersTab.vue` 整段複製成新檔 `SettingsAccountsTab.vue`（內容先完全相同）。**先不刪舊檔**（Task 5 才刪），讓測試可逐步遷移。

- [ ] **Step 2: 進階微調換成 PermissionPicker（兩處 dialog）**

在 `SettingsAccountsTab.vue`：

1. 新增 import：
```ts
import PermissionPicker from './PermissionPicker.vue'
import RoleManagerDrawer from './RoleManagerDrawer.vue'
import { watch } from 'vue'
```

2. **新增帳號 dialog** 的「進階微調」內容區（原 `SettingsUsersTab.vue:420-457` 的 `<div v-show="advancedExpanded" class="advanced-tuning-content">…</div>` 整塊）替換為：
```html
<div v-show="advancedExpanded" class="advanced-tuning-content">
  <PermissionPicker v-model="userForm.permission_names" :definition="permissionDefinition" />
</div>
```

3. **編輯使用者 dialog** 的同一塊（原 `:541-578`）替換為：
```html
<div v-show="advancedExpanded" class="advanced-tuning-content">
  <PermissionPicker v-model="editUserForm.permission_names" :definition="permissionDefinition" />
</div>
```

4. 刪除原本只服務舊勾選 UI 的函式：`isPermissionChecked`、`togglePermission`、`selectAllPermissions`、`clearAllPermissions`、`getPermissionLabel`（這些已由 PermissionPicker 內部承擔）。**保留** `deviationCount`、`isUsingDefaultPermissions`、`restoreDefault`、`onRoleChange`、`selectRoleCard`、`_activeForm`、`advancedExpanded`、`_arraysEqualAsSet`、`isUsingRoleDefault`。

5. 還原「偏離時自動展開」行為（原本寫在 `togglePermission` 內，現改用 watch）：在 `onMounted` 前新增：
```ts
watch(deviationCount, (n) => { if (n > 0) advancedExpanded.value = true })
```

6. 移除不再使用的 import：`permissionsAdd`、`permissionsCombine`、`permissionsHave`、`permissionsRemove`（若改寫後無 caller）。保留 `shouldSendPermissionNames`。用 `npm run type-check` 的 `noUnusedLocals` 抓殘留。

- [ ] **Step 3: 接「管理角色」按鈕 + 抽屜**

1. script 新增狀態：
```ts
const roleDrawerVisible = ref<boolean>(false)
const onRolesChanged = () => { fetchPermissionDefinition() }
```

2. tab-header 區（原 `:316-318`）改為：
```html
<div class="tab-header">
  <el-button @click="roleDrawerVisible = true">⚙ 管理角色</el-button>
  <el-button type="primary" @click="handleAddUser">新增帳號</el-button>
</div>
```

3. template 根節點內（`el-table` 之後、各 dialog 之間任一處）加入抽屜：
```html
<RoleManagerDrawer
  v-model:visible="roleDrawerVisible"
  :definition="permissionDefinition"
  :users="users"
  @roles-changed="onRolesChanged"
/>
```

- [ ] **Step 4: 寫/遷移測試（先確認 RED 再讓 GREEN）**

`src/components/settings/__tests__/SettingsAccountsTab.test.ts`：複製 `SettingsUsersTab.test.ts` 全部既有案例，把 import 改為 `../SettingsAccountsTab.vue`；新增下列 scope deviation 案例：

```ts
it('帳號進階微調勾 scope-aware 權限後判為偏離，還原預設歸零', async () => {
  // 沿用既有 mountTab() 與 permission mock（STUDENTS_READ 帶 scope_options）
  const wrapper = await mountTab()
  const vm = wrapper.vm as unknown as {
    userForm: { role: string; permission_names: string[] }
    deviationCount: number
    restoreDefault: (f: { role: string; permission_names: string[] }) => void
    isUsingDefaultPermissions: (f: { role: string; permission_names: string[] }) => boolean
  }
  vm.userForm.role = 'supervisor'
  vm.userForm.permission_names = ['STUDENTS_READ:own_class']  // 與 supervisor 預設不同
  await nextTick()
  expect(vm.deviationCount).toBeGreaterThan(0)
  vm.restoreDefault(vm.userForm)
  await nextTick()
  expect(vm.isUsingDefaultPermissions(vm.userForm)).toBe(true)
})
```

> 注意：`mountTab()` 的 permission mock 需含一個非 wildcard、permissions 明確的角色（如 `supervisor`）。若既有 mock 沒有，沿用 `SettingsPermissionsTab.scope.test.ts` 的 mock 結構補上 `supervisor` role 與 `STUDENTS_READ` 的 `scope_options`。

Run（RED→實作上面 Step 2/3 後應 GREEN）：`npm run test -- --run src/components/settings/__tests__/SettingsAccountsTab.test.ts`
Expected: 全 PASS（既有案例 + 新 scope deviation 案例）

- [ ] **Step 5: 型別檢查**

Run: `npm run type-check`
Expected: 無新錯誤（含 `noUnusedLocals` 通過 → 確認殘留 import/函式已清）

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts
git commit -m "feat(settings): SettingsAccountsTab 進階微調改用 PermissionPicker（帳號覆寫支援 scope）並接管理角色抽屜

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: SettingsAccountsTab UX 精緻化（搜尋 / 角色篩選 / dropdown / 空狀態）

**Files:**
- Modify: `src/components/settings/SettingsAccountsTab.vue`
- Modify: `src/components/settings/__tests__/SettingsAccountsTab.test.ts`

**Interfaces:**
- Consumes：Task 3 完成的 `SettingsAccountsTab`。新增 reactive：`keyword`、`roleFilter`、computed `filteredUsers`、`roleFilterOptions`。

- [ ] **Step 1: 寫失敗測試（搜尋 + 篩選）**

於 `SettingsAccountsTab.test.ts` 新增：

```ts
it('filteredUsers 依關鍵字與角色篩選收斂', async () => {
  // mock getUsers 回三筆：wang01/王小明/admin、lin02/林老師/teacher、chen03/陳主任/supervisor
  const wrapper = await mountTab()
  const vm = wrapper.vm as unknown as {
    keyword: string; roleFilter: string
    filteredUsers: { username: string }[]
  }
  vm.keyword = '林'
  await nextTick()
  expect(vm.filteredUsers.map((u) => u.username)).toEqual(['lin02'])
  vm.keyword = ''
  vm.roleFilter = 'supervisor'
  await nextTick()
  expect(vm.filteredUsers.map((u) => u.username)).toEqual(['chen03'])
})
```

> 若既有 `mountTab()` 的 `getUsers` mock 筆數不足，補成上述三筆（含 `username` / `employee_name` / `role`）。

Run: `npm run test -- --run src/components/settings/__tests__/SettingsAccountsTab.test.ts -t filteredUsers`
Expected: FAIL（`filteredUsers` undefined）

- [ ] **Step 2: 實作搜尋 + 角色篩選**

script 新增：
```ts
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
```

把 `defineExpose` 補上 `keyword, roleFilter, filteredUsers`（若該檔已有 expose 則合併）。

template：頁首列改為（取代 Task 3 的 tab-header）：
```html
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
```

`el-table` 的 `:data` 由 `users` 改為 `filteredUsers`。

style 新增：
```css
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
```

Run: `npm run test -- --run src/components/settings/__tests__/SettingsAccountsTab.test.ts -t filteredUsers`
Expected: PASS

- [ ] **Step 3: 操作欄收進 ⋯ 更多 dropdown + 空狀態**

`el-table` 操作欄（原三顆 inline link）改為：
```html
<el-table-column label="操作" width="160">
  <template #default="{ row } = {}">
    <el-button v-if="row" link type="primary" @click="handleEditUser(row)">編輯</el-button>
    <el-dropdown v-if="row" trigger="click" @command="(cmd) => onRowCommand(cmd, row)">
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
```

`el-table` 加空狀態 slot：
```html
<template #empty>
  <div class="accounts-empty">
    <span v-if="keyword || roleFilter">查無符合條件的帳號</span>
    <span v-else>尚無帳號</span>
  </div>
</template>
```

script 新增 import 與 handler：
```ts
import { ArrowDown } from '@element-plus/icons-vue'

function onRowCommand(cmd: string, row: Record<string, unknown>) {
  if (cmd === 'reset') handleResetPassword(row)
  else if (cmd === 'delete') handleDeleteUser(row)
}
```

> 確認 `@element-plus/icons-vue` 已是相依（既有 admin 元件常用）；若 import 失敗，改用純文字 `更多 ▾` 取代 icon。

新增測試（dropdown command 路由）：
```ts
it('onRowCommand 把 reset/delete 導到對應 handler', async () => {
  const wrapper = await mountTab()
  const vm = wrapper.vm as unknown as {
    onRowCommand: (cmd: string, row: Record<string, unknown>) => void
    handleResetPassword: (row: Record<string, unknown>) => void
    handleDeleteUser: (row: Record<string, unknown>) => void
  }
  const resetSpy = vi.spyOn(vm, 'handleResetPassword')
  const delSpy = vi.spyOn(vm, 'handleDeleteUser')
  const row = { id: 9, username: 'x' }
  vm.onRowCommand('reset', row)
  expect(resetSpy).toHaveBeenCalledWith(row)
  vm.onRowCommand('delete', row)
  expect(delSpy).toHaveBeenCalledWith(row)
})
```

> `vi.spyOn(vm, ...)` 需 `handleResetPassword`/`handleDeleteUser` 在 `defineExpose` 中；若未暴露則補上。若 spy 受 setup 閉包限制無法攔截，改為斷言 `resetDialogVisible` / `ElMessageBox.confirm` 被觸發（mock `element-plus` 的 `ElMessageBox`）。

Run: `npm run test -- --run src/components/settings/__tests__/SettingsAccountsTab.test.ts`
Expected: 全 PASS

- [ ] **Step 4: 型別檢查**

Run: `npm run type-check`
Expected: 無新錯誤

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts
git commit -m "feat(settings): 帳號頁加搜尋/角色篩選/更多操作 dropdown/空狀態

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: SettingsView 接線 + 刪舊檔 + 全套件收尾

**Files:**
- Modify: `src/views/SettingsView.vue`
- Delete: `src/components/settings/SettingsUsersTab.vue`、`src/components/settings/SettingsPermissionsTab.vue`
- Delete: `src/components/settings/__tests__/SettingsUsersTab.test.ts`、`SettingsPermissionsTab.test.ts`、`SettingsPermissionsTab.scope.test.ts`

**Interfaces:**
- Consumes：Task 3/4 完成的 `SettingsAccountsTab`。

- [ ] **Step 1: 改 SettingsView.vue（兩 tab → 一 tab）**

1. import：把
```ts
import SettingsUsersTab from '@/components/settings/SettingsUsersTab.vue'
import SettingsPermissionsTab from '@/components/settings/SettingsPermissionsTab.vue'
```
改為
```ts
import SettingsAccountsTab from '@/components/settings/SettingsAccountsTab.vue'
```

2. template：把原本兩個 tab-pane（`accounts` + `permissions`，`SettingsView.vue:32-37`）合併為一個：
```html
<el-tab-pane label="帳號與權限" name="accounts">
  <SettingsAccountsTab v-if="activeTab === 'accounts'" />
</el-tab-pane>
```
（移除 `permissions` tab-pane 與其 `SettingsPermissionsTab` 用法。其餘 tab 不動。）

- [ ] **Step 2: 刪除舊元件與舊測試**

```bash
git rm src/components/settings/SettingsUsersTab.vue \
       src/components/settings/SettingsPermissionsTab.vue \
       src/components/settings/__tests__/SettingsUsersTab.test.ts \
       src/components/settings/__tests__/SettingsPermissionsTab.test.ts \
       src/components/settings/__tests__/SettingsPermissionsTab.scope.test.ts
```

- [ ] **Step 3: 全 settings 套件 + 型別 + 全域引用掃描**

確認沒有其他檔案還 import 已刪元件：
```bash
grep -rn "SettingsUsersTab\|SettingsPermissionsTab" src/ || echo "no stale refs"
```
Expected: `no stale refs`（若有殘留，更新該引用點為 `SettingsAccountsTab`）。

Run: `npm run test -- --run src/components/settings`
Expected: 全 PASS（`PermissionPicker` / `RoleManagerDrawer` / `SettingsAccountsTab` 三檔）

Run: `npm run type-check`
Expected: 無錯誤

- [ ] **Step 4: 全域回歸（保險）**

Run: `npm run test -- --run`
Expected: 全 PASS（確認改名/刪檔未波及他處；若紅燈為既有 flaky，依 `vitest flaky isolation` 慣例單獨重跑判定）

- [ ] **Step 5: Commit**

```bash
git add src/views/SettingsView.vue
git commit -m "refactor(settings): 帳號管理與角色管理整合為單一「帳號與權限」分頁，刪除舊 SettingsUsersTab / SettingsPermissionsTab

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: 整合驗證（手動，可選但建議）**

```bash
cd ~/Desktop/ivyManageSystem && ./start.sh    # 起前後端
# 瀏覽 http://localhost:5173 → 系統設定 → 帳號與權限
```
人工點一次：搜尋/角色篩選、新增帳號（角色卡片 + 進階微調 scope radio）、編輯、⋯ 更多 → 重設密碼/刪除、⚙ 管理角色 → 新增/編輯/刪除角色（含帳號數欄）。確認角色改動後帳號表角色標籤即時刷新。

---

## Self-Review（plan vs spec 覆蓋檢查）

- **spec §3 元件架構** → Task 1（PermissionPicker）、Task 2（RoleManagerDrawer）、Task 3（SettingsAccountsTab）、Task 5（SettingsView 接線）✅
- **spec §4 主畫面 UX**（搜尋/角色篩選/管理角色鈕/dropdown/空狀態）→ Task 4 ✅
- **spec §5 帳號 dialog 換 picker + 送出邏輯不變** → Task 3 Step 2（保留 `shouldSendPermissionNames` / `isUsingDefaultPermissions`）✅
- **spec §6 PermissionPicker 行為（wildcard×scope）** → Task 1 全碼 + 測試 ✅
- **spec §6.4 偏離/預設相容性** → Task 3 Step 4 scope deviation 測試 ✅
- **spec §7 抽屜（含帳號數欄、emit roles-changed、核心唯讀）** → Task 2 ✅
- **spec §8 SettingsView** → Task 5 ✅
- **spec §9 測試計畫** → 各 Task 測試步驟 + Task 5 全套件 ✅
- **spec §10 不做的事** → 計畫未涉及後端/路由/utils/auth，僅刪整合後的舊檔 ✅
- **spec §11 風險** → 對應測試（wildcard×scope、deviation、越權守衛、改名引用掃描、teleport data-* 錨點）✅
- **型別一致性**：`PermissionPickerDefinition`（Task 1 export）→ Task 2 `RolesDefinition` 擴充、Task 3 `:definition="permissionDefinition"` 沿用；`update:modelValue` / `v-model` 綁定一致；`roles-changed` / `update:visible` emit 名稱於 Task 2 定義、Task 3 Step 3 消費一致 ✅
- **Placeholder 掃描**：無 TBD/TODO；每個 code step 均含實際程式碼 ✅
```
