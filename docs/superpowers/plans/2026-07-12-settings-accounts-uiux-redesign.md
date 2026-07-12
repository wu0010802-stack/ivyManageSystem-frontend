# 系統設定「帳號與權限」UI/UX 改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 帳號與權限分頁受眾分流（教職員/家長）、家長分頁化、最後登入格式化、停用/啟用操作、tab/view URL 同步、統計概覽、寬螢幕版面與 dark mode 修正。

**Architecture:** 全部純前端。`SettingsView.vue` 負責 tab ↔ URL；`SettingsAccountsTab.vue` 負責 audience 分流狀態與共用 toolbar/handler；新元件 `ParentAccountsList.vue`（受控 dumb 元件：吃已篩選 items、自管分頁、emit `toggle-active`）承載家長視圖。URL 同步沿用 `EmployeeHubView.vue` 的 `useRoute`/`router.replace` 範式。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus（`el-segmented`/`el-pagination`）、Vitest + @vue/test-utils。

**Spec:** `docs/superpowers/specs/2026-07-12-settings-accounts-uiux-redesign-design.md`

## Global Constraints

- 純前端：不動後端、不動 codegen、不動 RoleManagerDrawer 功能面。
- TS-only：新檔一律 `<script setup lang="ts">`；禁 `: any`/`as any`。
- 語言：commit message、UI 文案、測試描述一律繁體中文；Conventional Commits。
- **共用 checkout 有平行 session**：一律 path 限定 commit（`git commit -m "..." -- <files>`），絕不裸 `git commit` / `git commit -a`；commit 前先 `git status --porcelain` 目視，不可與 commit 串在同一 `&&` 鏈。
- 測試指令都在 `~/Desktop/ivy-frontend` 下跑；針對性跑法 `npx vitest run <path>`。
- **禁止執行 `start.sh`**（使用者自己前景跑）；瀏覽器驗證假設 dev server 已在 :5173。
- 分流判準：`role === 'parent'` 歸家長視圖，**其餘全部**（含 admin/自訂角色）歸教職員視圖。
- 家長視圖操作只有停用/啟用（業主裁定）；分頁 20 筆/頁。
- URL 同步一律 `router.replace`（不塞 history）。

---

### Task 1: SettingsView tab ↔ URL 同步

**Files:**
- Modify: `src/views/SettingsView.vue`
- Test: `src/views/__tests__/SettingsView.test.ts`

**Interfaces:**
- Consumes: 無（獨立）。
- Produces: `?tab=<name>` query 契約（`shifts|approval|accounts|line|observability|dsr-requests|policy-versions`）；離開 `accounts` 時清掉 `view` key（Task 5 的 `?view=` 依附於此契約）。

- [ ] **Step 1: 在測試檔頂部加 vue-router mock（既有測試不受影響），並寫 5 個失敗測試**

在 `src/views/__tests__/SettingsView.test.ts` 的 `vi.mock('@/utils/auth', ...)` 之後、`import SettingsView` 之前加：

```ts
const replace = vi.fn()
let mockQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace }),
}))
```

把 `globalConfig.stubs` 內 `'el-tabs'` stub 改為具名可 emit（供 findComponent 與 tab-change 測試）：

```ts
    'el-tabs': {
      name: 'ElTabs',
      template: '<div data-test="tabs"><slot /></div>',
      props: ['modelValue', 'type'],
      emits: ['update:modelValue', 'tab-change'],
    },
```

`beforeEach` 內加重置：

```ts
    mockQuery = {}
    replace.mockClear()
```

檔尾新增 describe：

```ts
describe('SettingsView tab ↔ URL 同步', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasPermission.mockReturnValue(false)
    mockQuery = {}
    replace.mockClear()
  })

  it('無 tab query → 預設 shifts 並 normalize URL', async () => {
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('shifts')
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'shifts' } })
  })

  it('deep link ?tab=accounts → 直接落在帳號分頁且不 replace', async () => {
    mockQuery = { tab: 'accounts' }
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('accounts')
    expect(replace).not.toHaveBeenCalled()
  })

  it('無權限者 deep link ?tab=dsr-requests → fallback shifts 並修正 URL', async () => {
    mockQuery = { tab: 'dsr-requests' }
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('shifts')
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'shifts' } })
  })

  it('有 DSR_MANAGE 權限時 ?tab=dsr-requests 合法', async () => {
    mockHasPermission.mockImplementation((perm: string) => perm === 'DSR_MANAGE')
    mockQuery = { tab: 'dsr-requests' }
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('dsr-requests')
  })

  it('切換 tab → replace 更新 ?tab=；離開 accounts 時清掉 view', async () => {
    mockQuery = { tab: 'accounts', view: 'parent' }
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    replace.mockClear()
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'shifts')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'shifts' } })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/views/__tests__/SettingsView.test.ts`
Expected: 新 describe 5 個測試 FAIL（modelValue 仍是寫死的 'shifts'、replace 未被呼叫）；既有測試 PASS。

- [ ] **Step 3: 實作 SettingsView URL 同步**

`src/views/SettingsView.vue` script 全文改為：

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useShiftStore } from '@/stores/shift'
import SettingsShiftTab from '@/components/settings/SettingsShiftTab.vue'
import SettingsAccountsTab from '@/components/settings/SettingsAccountsTab.vue'
import SettingsApprovalTab from '@/components/settings/SettingsApprovalTab.vue'
import SettingsLineTab from '@/components/settings/SettingsLineTab.vue'
import SettingsObservabilityTab from '@/components/settings/SettingsObservabilityTab.vue'
import DsrRequestsView from '@/views/DsrRequestsView.vue'
import PolicyVersionsView from '@/views/PolicyVersionsView.vue'
import { hasPermission } from '@/utils/auth'

const route = useRoute()
const router = useRouter()

const BASE_TABS = ['shifts', 'approval', 'accounts', 'line', 'observability']

const availableTabs = (): string[] =>
  hasPermission('DSR_MANAGE') ? [...BASE_TABS, 'dsr-requests', 'policy-versions'] : [...BASE_TABS]

const resolveTab = (raw: unknown): string => {
  const r = String(Array.isArray(raw) ? raw[0] : (raw ?? ''))
  return availableTabs().includes(r) ? r : 'shifts'
}

const activeTab = ref(resolveTab(route.query.tab))

// 缺漏 / 不合法 tab → 修正 URL（與 EmployeeHubView 一致）
if (route.query.tab !== activeTab.value) {
  router.replace({ query: { ...route.query, tab: activeTab.value } })
}

watch(
  () => route.query.tab,
  (next) => {
    const resolved = resolveTab(next)
    if (resolved !== activeTab.value) activeTab.value = resolved
  },
)

const onTabChange = (name: string | number) => {
  const next: Record<string, unknown> = { ...route.query, tab: String(name) }
  if (String(name) !== 'accounts') delete next.view
  router.replace({ query: next })
}

const shiftStore = useShiftStore()

onMounted(() => {
  shiftStore.fetchShiftTypes()
})
</script>
```

Template 只改一行：

```html
    <el-tabs v-model="activeTab" type="card" @tab-change="onTabChange">
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/views/__tests__/SettingsView.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit（path 限定）**

```bash
cd ~/Desktop/ivy-frontend && git status --porcelain
git add src/views/SettingsView.vue src/views/__tests__/SettingsView.test.ts
git commit -m "feat(settings): 系統設定 tab 同步 URL query（?tab=），重整不再跳回輪班別

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/SettingsView.vue src/views/__tests__/SettingsView.test.ts
```

---

### Task 2: 最後登入格式化＋「從未登入」

**Files:**
- Modify: `src/components/settings/SettingsAccountsTab.vue`
- Test: `src/components/settings/__tests__/SettingsAccountsTab.test.ts`

**Interfaces:**
- Consumes: `formatDateTimeTW(iso: unknown): string`（`src/utils/format.ts` 既有；null → `'—'`，合法 ISO → `'2026/7/10 17:35:14'` 型式）。
- Produces: `.never-logged-in` CSS class（Task 8 不需動它）；cards 欄 formatter 慣例。

- [ ] **Step 1: 更新 getUsers mock 加 last_login，寫失敗測試**

在 `SettingsAccountsTab.test.ts` 的 `getUsers` mock 三筆資料改為（wang01 加 last_login、其餘顯式 null）：

```ts
    getUsers: vi.fn().mockResolvedValue({
      data: [
        { id: 1, username: 'wang01', employee_name: '王小明', role: 'admin', permission_names: ['*'], is_active: true, last_login: '2026-07-10T17:35:14.324936' },
        { id: 2, username: 'lin02', employee_name: '林老師', role: 'teacher', permission_names: null, is_active: true, last_login: null },
        { id: 3, username: 'chen03', employee_name: '陳主任', role: 'supervisor', permission_names: ['DASHBOARD', 'EMPLOYEES_READ'], is_active: true, last_login: null },
      ],
    }),
```

檔尾新增測試：

```ts
  it('最後登入：ISO 字串格式化顯示、null 顯示「從未登入」', async () => {
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('2026/7/10')       // formatDateTimeTW 輸出
    expect(text).not.toContain('T17:35')      // 原始 ISO 不再直出
    expect(text).toContain('從未登入')
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/SettingsAccountsTab.test.ts`
Expected: 新測試 FAIL（表格直出 `2026-07-10T17:35:14.324936`）。

- [ ] **Step 3: 實作**

`SettingsAccountsTab.vue` script 加 import：

```ts
import { formatDateTimeTW } from '@/utils/format'
```

桌機表格欄（原 `<el-table-column prop="last_login" label="最後登入" width="180" />`）改為：

```html
      <el-table-column label="最後登入" min-width="170">
        <template #default="{ row } = {}">
          <span v-if="row?.last_login">{{ formatDateTimeTW(row.last_login) }}</span>
          <span v-else class="never-logged-in">從未登入</span>
        </template>
      </el-table-column>
```

`accountCardColumns` 的最後登入欄改為：

```ts
  {
    label: '最後登入',
    prop: 'last_login',
    formatter: (item: Record<string, unknown>) => (item.last_login ? formatDateTimeTW(item.last_login) : '從未登入'),
  },
```

`<style scoped>` 加：

```css
.never-logged-in {
  color: var(--text-tertiary);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/SettingsAccountsTab.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend && git status --porcelain
git add src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts
git commit -m "feat(settings): 帳號最後登入格式化顯示，未登入過顯示「從未登入」

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts
```

---

### Task 3: 停用/啟用帳號操作

**Files:**
- Modify: `src/components/settings/SettingsAccountsTab.vue`
- Test: `src/components/settings/__tests__/SettingsAccountsTab.test.ts`

**Interfaces:**
- Consumes: `updateUser(id: number, payload: unknown)`（`@/api/auth` 既有，元件已 import）。
- Produces: `handleToggleActive(user: Record<string, unknown>): Promise<void>`（Task 5 的 ParentAccountsList `@toggle-active` 綁它）；dropdown command `'toggle-active'`。

- [ ] **Step 1: 寫失敗測試**

`SettingsAccountsTab.test.ts` 頂部 import 區把 `import { createUser } from '@/api/auth'` 改為：

```ts
import { createUser, updateUser } from '@/api/auth'
```

檔尾新增：

```ts
  describe('停用/啟用帳號', () => {
    async function mountPlain() {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      return wrapper.vm as unknown as { handleToggleActive: (u: Record<string, unknown>) => Promise<void> }
    }

    it('停用：confirm 後送 is_active:false', async () => {
      const vm = await mountPlain()
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
      await vm.handleToggleActive({ id: 3, username: 'chen03', is_active: true })
      expect(confirmSpy).toHaveBeenCalledWith(
        expect.stringContaining('chen03'),
        expect.any(String),
        expect.any(Object),
      )
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(3, { is_active: false })
      confirmSpy.mockRestore()
    })

    it('停用 confirm 取消 → 不送 API', async () => {
      const vm = await mountPlain()
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
      await vm.handleToggleActive({ id: 3, username: 'chen03', is_active: true })
      expect(vi.mocked(updateUser)).not.toHaveBeenCalled()
      confirmSpy.mockRestore()
    })

    it('啟用：不 confirm 直接送 is_active:true', async () => {
      const vm = await mountPlain()
      const confirmSpy = vi.spyOn(ElMessageBox, 'confirm')
      await vm.handleToggleActive({ id: 5, username: 'x', is_active: false })
      expect(confirmSpy).not.toHaveBeenCalled()
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(5, { is_active: true })
      confirmSpy.mockRestore()
    })

    it('onRowCommand toggle-active 導到 handleToggleActive', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { onRowCommand: (cmd: string, row: Record<string, unknown>) => void }
      vm.onRowCommand('toggle-active', { id: 7, username: 'y', is_active: false })
      await flushPromises()
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(7, { is_active: true })
    })
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/SettingsAccountsTab.test.ts`
Expected: 4 個新測試 FAIL（`handleToggleActive` 未定義）。

- [ ] **Step 3: 實作**

`SettingsAccountsTab.vue` 在 `handleDeleteUser` 之後加：

```ts
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
```

`onRowCommand` 改為：

```ts
function onRowCommand(cmd: string, row: Record<string, unknown>) {
  if (cmd === 'reset') handleResetPassword(row)
  else if (cmd === 'toggle-active') handleToggleActive(row)
  else if (cmd === 'delete') handleDeleteUser(row)
}
```

桌機表格與 AdminListCards 兩處的 dropdown menu（結構相同，兩處都改）在「重設密碼」與「刪除」之間插入：

```html
                <el-dropdown-item command="reset">重設密碼</el-dropdown-item>
                <el-dropdown-item command="toggle-active">{{ row?.is_active ? '停用帳號' : '啟用帳號' }}</el-dropdown-item>
                <el-dropdown-item command="delete" divided>刪除</el-dropdown-item>
```

（AdminListCards 那份把 `row?.is_active` 改成 `item.is_active`。）

`defineExpose` 加上 `handleToggleActive`。

- [ ] **Step 4: 跑測試確認通過**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/SettingsAccountsTab.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend && git status --porcelain
git add src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts
git commit -m "feat(settings): 帳號「更多」選單新增停用/啟用操作（停用需確認）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts
```

---

### Task 4: ParentAccountsList 元件（含分頁與手機卡片）

**Files:**
- Create: `src/components/settings/ParentAccountsList.vue`
- Test: `src/components/settings/__tests__/ParentAccountsList.test.ts`

**Interfaces:**
- Consumes: `AdminListCards`（`items/columns/rowKey/loading/emptyText` props + `title`/`cell-*`/`actions` slots）、`useIsMobile()`、`formatDateTimeTW`。
- Produces: 元件 props `{ items: Record<string, unknown>[]; loading?: boolean; emptyText?: string }`、emit `'toggle-active'` 帶整列 user 物件。Task 5 以 `<ParentAccountsList :items :loading :empty-text @toggle-active>` 接線。

- [ ] **Step 1: 寫失敗測試（新檔）**

`src/components/settings/__tests__/ParentAccountsList.test.ts` 全文：

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

import ParentAccountsList from '../ParentAccountsList.vue'

const makeItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    username: `parent${i + 1}`,
    is_active: true,
    last_login: null as string | null,
  }))

describe('ParentAccountsList', () => {
  it('超過 20 筆時分頁：第一頁 20 筆、翻頁換資料', async () => {
    mockIsMobile.value = false
    const w = mount(ParentAccountsList, {
      props: { items: makeItems(25), loading: false },
      global: { plugins: [ElementPlus] },
    })
    expect(w.findAll('.el-table__row').length).toBe(20)
    const vm = w.vm as unknown as { currentPage: number; pagedItems: { username: string }[] }
    vm.currentPage = 2
    await w.vm.$nextTick()
    expect(vm.pagedItems.length).toBe(5)
    expect(vm.pagedItems[0].username).toBe('parent21')
  })

  it('items 縮小時 currentPage 鉗回最後一頁', async () => {
    mockIsMobile.value = false
    const w = mount(ParentAccountsList, { props: { items: makeItems(25) }, global: { plugins: [ElementPlus] } })
    const vm = w.vm as unknown as { currentPage: number }
    vm.currentPage = 2
    await w.vm.$nextTick()
    await w.setProps({ items: makeItems(3) })
    await w.vm.$nextTick()
    expect(vm.currentPage).toBe(1)
  })

  it('停用/啟用按鈕 emit toggle-active 帶整列 user', async () => {
    mockIsMobile.value = false
    const items = [{ id: 1, username: 'p1', is_active: true, last_login: null }]
    const w = mount(ParentAccountsList, { props: { items }, global: { plugins: [ElementPlus] } })
    await w.find('.el-table__row .el-button').trigger('click')
    expect(w.emitted('toggle-active')?.[0]?.[0]).toMatchObject({ username: 'p1' })
  })

  it('空清單顯示 emptyText', () => {
    mockIsMobile.value = false
    const w = mount(ParentAccountsList, {
      props: { items: [], emptyText: '家長帳號由家長端 LINE 綁定自動產生，不在此新增' },
      global: { plugins: [ElementPlus] },
    })
    expect(w.text()).toContain('LINE 綁定自動產生')
  })

  it('手機用 AdminListCards 呈現分頁後資料', () => {
    mockIsMobile.value = true
    const w = mount(ParentAccountsList, { props: { items: makeItems(25) }, global: { plugins: [ElementPlus] } })
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)
    expect(w.findAll('.alc-card').length).toBe(20)
    mockIsMobile.value = false
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/ParentAccountsList.test.ts`
Expected: FAIL（元件檔不存在，import 錯誤）。

- [ ] **Step 3: 建立元件**

`src/components/settings/ParentAccountsList.vue` 全文：

```vue
<script setup lang="ts">
// 家長帳號清單（dumb 受控元件）：吃「已篩選」items，自管分頁，操作只有停用/啟用（emit 給父層）。
// 家長帳號由家長端 LIFF 綁定產生，不提供編輯/重設密碼/刪除。
import { ref, computed, watch } from 'vue'
import { formatDateTimeTW } from '@/utils/format'
import AdminListCards from '@/components/common/AdminListCards.vue'
import { useIsMobile } from '@/composables/useIsMobile'

const props = defineProps<{
  items: Record<string, unknown>[]
  loading?: boolean
  emptyText?: string
}>()
const emit = defineEmits<{ 'toggle-active': [user: Record<string, unknown>] }>()

const PAGE_SIZE = 20
const currentPage = ref(1)

const pagedItems = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  return props.items.slice(start, start + PAGE_SIZE)
})

// 篩選使總頁數縮小時鉗回最後一頁，避免停在空頁
watch(
  () => props.items.length,
  (n) => {
    const maxPage = Math.max(1, Math.ceil(n / PAGE_SIZE))
    if (currentPage.value > maxPage) currentPage.value = maxPage
  },
)

const { isMobile } = useIsMobile()

const cardColumns = [
  { label: '狀態', prop: '__status' },
  {
    label: '最後登入',
    prop: 'last_login',
    formatter: (item: Record<string, unknown>) => (item.last_login ? formatDateTimeTW(item.last_login) : '從未登入'),
  },
]

defineExpose({ currentPage, pagedItems })
</script>

<template>
  <div class="parent-accounts">
    <el-table v-if="!isMobile" :data="pagedItems" v-loading="loading" style="width: 100%;">
      <el-table-column prop="username" label="帳號" min-width="180" />
      <el-table-column label="狀態" width="90">
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
      <el-table-column label="操作" width="90">
        <template #default="{ row } = {}">
          <el-button
            v-if="row"
            link
            :type="row.is_active ? 'danger' : 'primary'"
            @click="emit('toggle-active', row)"
          >{{ row.is_active ? '停用' : '啟用' }}</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <div class="parent-empty">{{ emptyText || '尚無家長帳號' }}</div>
      </template>
    </el-table>
    <AdminListCards
      v-else
      :items="pagedItems"
      :columns="cardColumns"
      row-key="username"
      :loading="loading"
      :empty-text="emptyText || '尚無家長帳號'"
    >
      <template #title="{ item }">{{ item.username }}</template>
      <template #cell-__status="{ item }">
        <el-tag :type="item.is_active ? 'success' : 'info'" size="small">{{ item.is_active ? '啟用' : '停用' }}</el-tag>
      </template>
      <template #actions="{ item }">
        <el-button link :type="item.is_active ? 'danger' : 'primary'" @click="emit('toggle-active', item)">
          {{ item.is_active ? '停用' : '啟用' }}
        </el-button>
      </template>
    </AdminListCards>
    <el-pagination
      v-if="items.length > PAGE_SIZE"
      v-model:current-page="currentPage"
      :page-size="PAGE_SIZE"
      :total="items.length"
      layout="total, prev, pager, next"
      class="parent-pagination"
    />
  </div>
</template>

<style scoped>
.parent-pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
.never-logged-in {
  color: var(--text-tertiary);
}
.parent-empty {
  padding: 24px 0;
  color: var(--text-tertiary);
  font-size: 14px;
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/ParentAccountsList.test.ts`
Expected: 5 個測試全 PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend && git status --porcelain
git add src/components/settings/ParentAccountsList.vue src/components/settings/__tests__/ParentAccountsList.test.ts
git commit -m "feat(settings): 新增 ParentAccountsList 家長帳號清單元件（分頁 20 筆/頁＋手機卡片）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/components/settings/ParentAccountsList.vue src/components/settings/__tests__/ParentAccountsList.test.ts
```

---

### Task 5: 受眾分流 segmented ＋ view ↔ URL 接線

**Files:**
- Modify: `src/components/settings/SettingsAccountsTab.vue`
- Test: `src/components/settings/__tests__/SettingsAccountsTab.test.ts`
- Test: `src/components/settings/__tests__/SettingsAccountsTab.cardview.spec.ts`（僅加 router mock，避免爆）

**Interfaces:**
- Consumes: Task 4 的 `ParentAccountsList`（props/emit 見 Task 4）；Task 3 的 `handleToggleActive`；Task 1 的 `?tab=` 契約（本 task 只讀寫 `view` key，spread 保留其餘 query）。
- Produces: `audience: Ref<'staff' | 'parent'>`、`staffUsers`/`parentUsers`/`filteredParentUsers` computed（Task 6 統計用）。

- [ ] **Step 1: 兩個測試檔加 vue-router mock；主測試檔加 parent mock 資料與失敗測試**

兩檔（`SettingsAccountsTab.test.ts` 與 `SettingsAccountsTab.cardview.spec.ts`）都在最上面的 `vi.mock` 區加（cardview 那份只需要這段，不用新測試）：

```ts
const replace = vi.fn()
let mockQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace }),
}))
```

主測試檔 `beforeEach` 加：

```ts
    mockQuery = {}
    replace.mockClear()
```

主測試檔 `getUsers` mock 加第四筆家長帳號：

```ts
        { id: 4, username: 'parent1', employee_name: '', role: 'parent', permission_names: [], is_active: true, last_login: null },
```

檔尾新增 describe：

```ts
  describe('受眾分流（教職員/家長）', () => {
    it('預設 staff 視圖：filteredUsers 不含家長、normalize ?view=staff', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { audience: string; filteredUsers: { username: string }[] }
      expect(vm.audience).toBe('staff')
      expect(vm.filteredUsers.map((u) => u.username)).not.toContain('parent1')
      expect(replace).toHaveBeenCalledWith({ query: { view: 'staff' } })
    })

    it('deep link ?view=parent → 家長視圖，filteredParentUsers 只含家長', async () => {
      mockQuery = { view: 'parent' }
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { audience: string; filteredParentUsers: { username: string }[] }
      expect(vm.audience).toBe('parent')
      expect(vm.filteredParentUsers.map((u) => u.username)).toEqual(['parent1'])
      expect(replace).not.toHaveBeenCalled()
    })

    it('家長視圖 keyword 只比對帳號', async () => {
      mockQuery = { view: 'parent' }
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { keyword: string; filteredParentUsers: unknown[] }
      vm.keyword = 'zzz'
      await nextTick()
      expect(vm.filteredParentUsers.length).toBe(0)
    })

    it('onAudienceChange → replace 更新 ?view=', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      replace.mockClear()
      const vm = wrapper.vm as unknown as { onAudienceChange: (v: string) => void }
      vm.onAudienceChange('parent')
      expect(replace).toHaveBeenCalledWith({ query: { view: 'parent' } })
    })

    it('角色篩選選項排除家長', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as { roleFilterOptions: { code: string }[] }
      expect(vm.roleFilterOptions.map((r) => r.code)).not.toContain('parent')
    })
  })
```

- [ ] **Step 2: 跑兩個測試檔確認新測試失敗、既有不爆**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/SettingsAccountsTab.test.ts src/components/settings/__tests__/SettingsAccountsTab.cardview.spec.ts`
Expected: 新 describe 5 個 FAIL（audience 未定義）；既有測試 PASS。

- [ ] **Step 3: 實作分流**

`SettingsAccountsTab.vue` script 加 import：

```ts
import { useRoute, useRouter } from 'vue-router'
import ParentAccountsList from './ParentAccountsList.vue'
```

在 `const employeeStore = ...` 之前加：

```ts
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
```

在 `filteredUsers` 附近改寫／新增：

```ts
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
  keyword.value ? '查無符合條件的帳號' : '家長帳號由家長端 LINE 綁定自動產生，不在此新增',
)
```

（`roleFilterOptions` 是取代原本的定義，多 `.filter(([code]) => code !== 'parent')`；`filteredUsers` 是把來源 `users.value` 換成 `staffUsers.value`。）

Template：根 `<div>` 之下、`.accounts-toolbar` 之前插入 segmented；toolbar 的角色篩選加 `v-if`；既有 staff 表格/卡片包進 `<template v-if>`；家長視圖接上：

```html
  <div>
    <el-segmented
      :model-value="audience"
      :options="audienceOptions"
      class="audience-switcher"
      @change="onAudienceChange"
    />
    <div class="accounts-toolbar">
      <div class="toolbar-left">
        <el-input v-model="keyword" :placeholder="audience === 'staff' ? '搜尋帳號 / 姓名' : '搜尋帳號'" clearable style="width: 220px;" />
        <el-select v-if="audience === 'staff'" v-model="roleFilter" placeholder="全部角色" clearable style="width: 160px;">
          <el-option v-for="r in roleFilterOptions" :key="r.code" :label="r.label" :value="r.code" />
        </el-select>
      </div>
      <div class="toolbar-right">
        <el-button @click="roleDrawerVisible = true">⚙ 管理角色</el-button>
        <el-button type="primary" @click="handleAddUser">新增帳號</el-button>
      </div>
    </div>
    <template v-if="audience === 'staff'">
      <el-table v-if="!isMobile" ...（既有 staff 表格原封不動）... </el-table>
      <AdminListCards v-else ...（既有 staff 卡片原封不動）... </AdminListCards>
    </template>
    <ParentAccountsList
      v-else
      :items="filteredParentUsers"
      :loading="loadingUsers"
      :empty-text="parentEmptyText"
      style="margin-top: 20px;"
      @toggle-active="handleToggleActive"
    />
```

（`...原封不動...` 表示既有區塊整段搬進 `<template v-if>` 內，內容不改。）

`<style scoped>` 加：

```css
.audience-switcher {
  margin-bottom: 12px;
}
```

`defineExpose` 加上：`audience, staffUsers, parentUsers, filteredParentUsers, onAudienceChange, roleFilterOptions, parentEmptyText`。

- [ ] **Step 4: 跑測試確認通過**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/`
Expected: 全部 PASS（含 PermissionPicker、RoleManagerDrawer、cardview、ParentAccountsList）。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend && git status --porcelain
git add src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts src/components/settings/__tests__/SettingsAccountsTab.cardview.spec.ts
git commit -m "feat(settings): 帳號頁受眾分流——教職員/家長 segmented 視圖（?view= 同步 URL）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts src/components/settings/__tests__/SettingsAccountsTab.cardview.spec.ts
```

---

### Task 6: 統計概覽列

**Files:**
- Modify: `src/components/settings/SettingsAccountsTab.vue`
- Test: `src/components/settings/__tests__/SettingsAccountsTab.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `staffUsers`/`parentUsers`、既有 `isUsingRoleDefault(row)`。
- Produces: `staffStats`/`parentStats` computed（僅本 task 使用）。

- [ ] **Step 1: 調整 mock 資料製造非零統計，寫失敗測試**

主測試檔 `getUsers` mock 改兩筆（讓統計有變化；其餘測試不受影響——既有測試只斷言 username 篩選與角色）：

- `lin02`：`is_active: true` → `is_active: false`
- `chen03`：`permission_names: ['DASHBOARD', 'EMPLOYEES_READ']` → `permission_names: ['DASHBOARD']`（偏離 supervisor 預設 → 自訂）

改完的四筆：

```ts
      data: [
        { id: 1, username: 'wang01', employee_name: '王小明', role: 'admin', permission_names: ['*'], is_active: true, last_login: '2026-07-10T17:35:14.324936' },
        { id: 2, username: 'lin02', employee_name: '林老師', role: 'teacher', permission_names: null, is_active: false, last_login: null },
        { id: 3, username: 'chen03', employee_name: '陳主任', role: 'supervisor', permission_names: ['DASHBOARD'], is_active: true, last_login: null },
        { id: 4, username: 'parent1', employee_name: '', role: 'parent', permission_names: [], is_active: true, last_login: null },
      ],
```

檔尾新增：

```ts
  it('統計概覽：staff 與 parent 數字正確且渲染於 .accounts-stats', async () => {
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = wrapper.vm as unknown as {
      staffStats: { total: number; active: number; neverLoggedIn: number; custom: number }
      parentStats: { total: number; active: number }
    }
    // staff: wang01(admin,*,active,有登入)、lin02(teacher,停用,未登入)、chen03(supervisor,自訂,未登入)
    expect(vm.staffStats).toEqual({ total: 3, active: 2, neverLoggedIn: 2, custom: 1 })
    expect(vm.parentStats).toEqual({ total: 1, active: 1 })
    const stats = wrapper.find('.accounts-stats')
    expect(stats.exists()).toBe(true)
    expect(stats.text()).toContain('自訂權限 1')
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/SettingsAccountsTab.test.ts`
Expected: 新測試 FAIL（staffStats 未定義）；同時確認既有測試沒被 mock 調整弄壞。

- [ ] **Step 3: 實作**

`SettingsAccountsTab.vue` 在 `filteredParentUsers` 之後加：

```ts
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
```

Template：segmented 與 toolbar 之間插入：

```html
    <div v-if="audience === 'staff'" class="accounts-stats">
      教職員 <b>{{ staffStats.total }}</b>・啟用 <b>{{ staffStats.active }}</b>・從未登入 <b>{{ staffStats.neverLoggedIn }}</b>・自訂權限 <b>{{ staffStats.custom }}</b>
    </div>
    <div v-else class="accounts-stats">
      家長 <b>{{ parentStats.total }}</b>・啟用 <b>{{ parentStats.active }}</b>
    </div>
```

`<style scoped>` 加：

```css
.accounts-stats {
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.accounts-stats b {
  color: var(--text-primary);
  font-weight: 600;
}
```

`defineExpose` 加上 `staffStats, parentStats`。

- [ ] **Step 4: 跑測試確認通過**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/SettingsAccountsTab.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend && git status --porcelain
git add src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts
git commit -m "feat(settings): 帳號頁加輕量統計概覽列（啟用/從未登入/自訂權限）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts
```

---

### Task 7: fetchUsers 載入失敗狀態

**Files:**
- Modify: `src/components/settings/SettingsAccountsTab.vue`
- Test: `src/components/settings/__tests__/SettingsAccountsTab.test.ts`

**Interfaces:**
- Consumes: 既有 `fetchUsers`、Task 5 的 `parentEmptyText`。
- Produces: `loadError: Ref<boolean>`（僅本元件內使用）。

- [ ] **Step 1: 寫失敗測試**

主測試檔 import 區把 `import { createUser, updateUser } from '@/api/auth'` 改為：

```ts
import { createUser, updateUser, getUsers } from '@/api/auth'
```

檔尾新增：

```ts
  it('fetchUsers 失敗 → 空狀態顯示「帳號載入失敗」與重試；重試成功恢復資料', async () => {
    vi.mocked(getUsers).mockRejectedValueOnce(new Error('boom'))
    const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const retryBtn = wrapper.find('[data-testid="retry-fetch"]')
    expect(retryBtn.exists()).toBe(true)
    expect(wrapper.text()).toContain('帳號載入失敗')
    await retryBtn.trigger('click')
    await flushPromises()
    const vm = wrapper.vm as unknown as { filteredUsers: unknown[] }
    expect(vm.filteredUsers.length).toBeGreaterThan(0)
    expect(wrapper.find('[data-testid="retry-fetch"]').exists()).toBe(false)
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/SettingsAccountsTab.test.ts`
Expected: 新測試 FAIL（無 retry-fetch 元素）。

- [ ] **Step 3: 實作**

`fetchUsers` 改為：

```ts
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
```

staff 表格 `#empty` slot 改為三態：

```html
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
```

`parentEmptyText` 補 loadError 分支：

```ts
const parentEmptyText = computed(() =>
  loadError.value
    ? '帳號載入失敗'
    : keyword.value
      ? '查無符合條件的帳號'
      : '家長帳號由家長端 LINE 綁定自動產生，不在此新增',
)
```

`defineExpose` 加上 `loadError`。

- [ ] **Step 4: 跑測試確認通過**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/settings/__tests__/SettingsAccountsTab.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend && git status --porcelain
git add src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts
git commit -m "fix(settings): 帳號載入失敗不再靜默——空狀態顯示錯誤與重試按鈕

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.test.ts
```

---

### Task 8: 寬螢幕欄寬 ＋ dark mode 硬編碼底色修正

**Files:**
- Modify: `src/components/settings/SettingsAccountsTab.vue`
- Modify: `src/components/settings/PermissionPicker.vue`

**Interfaces:**
- Consumes: Element Plus 主題變數 `--el-bg-color`、`--el-fill-color-light`（隨 `html.dark` 自動切換）。
- Produces: 無（純樣式）。

- [ ] **Step 1: staff 表格彈性欄改 min-width**

`SettingsAccountsTab.vue` staff 表格：

- `<el-table-column prop="username" label="帳號" width="150" />` → `min-width="150"`
- `<el-table-column prop="employee_name" label="員工姓名" width="120" />` → `min-width="130"`

（`最後登入` 已在 Task 2 改 `min-width="170"`；角色/權限/狀態/操作維持固定 width。）

- [ ] **Step 2: dark mode 底色改 EP 主題變數**

`SettingsAccountsTab.vue`：

```css
.role-card {
  /* 原 background: #fff; 改為主題變數，dark mode 自動翻底 */
  background: var(--el-bg-color);
}
```

（只改 `background` 那一行，其餘 `.role-card` 屬性不動。）

`PermissionPicker.vue`：

```css
.perm-group {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}
```

- [ ] **Step 3: 跑 typecheck、lint、stylelint 與設定區測試**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm run typecheck
npm run lint
npm run lint:css
npx vitest run src/components/settings/__tests__/
```
Expected: 全綠。

- [ ] **Step 4: Commit**

```bash
cd ~/Desktop/ivy-frontend && git status --porcelain
git add src/components/settings/SettingsAccountsTab.vue src/components/settings/PermissionPicker.vue
git commit -m "fix(settings): 帳號表格彈性欄寬填滿寬螢幕；角色卡/權限群組底色改主題變數修 dark mode

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/components/settings/SettingsAccountsTab.vue src/components/settings/PermissionPicker.vue
```

---

### Task 9: 全套 gate ＋ 瀏覽器實測

**Files:**
- 無新增修改（驗證 task；若實測發現問題，回對應 task 修）。

**Interfaces:**
- Consumes: Task 1–8 全部產出。
- Produces: 驗證報告（回報給使用者）。

- [ ] **Step 1: 全套測試（兩棵測試樹 sibling sweep）**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run`
Expected: 全綠（若有紅測，先確認是否 pre-existing：單獨重跑該檔＋`git stash` 以外的方式核對 base，見 memory 紅測歸屬三步）。

- [ ] **Step 2: typecheck + lint**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm run typecheck
npm run lint
npm run lint:css
```
Expected: 全綠。

- [ ] **Step 3: 瀏覽器實測（dev server 已在 :5173，用 claude-in-chrome）**

檢查清單（桌機寬螢幕）：
1. `#/settings?tab=accounts` 直達帳號分頁；F5 後仍停留。
2. 預設教職員視圖：只見 31 筆教職員、統計列數字正確、表格填滿寬度。
3. 切「家長」segment：URL 變 `?view=parent`、分頁出現（20 筆/頁、總數 249）、欄位只有帳號/狀態/最後登入/操作。
4. 家長列「停用」→ confirm → 狀態變停用；再「啟用」還原（dev DB 可實際操作，測完還原）。
5. 教職員列「更多 → 停用帳號」同上驗證一輪並還原。
6. `最後登入` 顯示格式化時間或「從未登入」。
7. 搜尋/角色篩選只在教職員視圖出現角色下拉；家長視圖搜尋只比對帳號。
8. Dark mode：切深色主題，開「新增帳號」dialog 看角色卡底色、開「進階微調」看權限群組底色（不再白底）。
9. 手機視口（用 DevTools device emulation 或 resize；claude-in-chrome 對 <768 視口有既知限制，必要時以 `mcp__claude-in-chrome__resize_window` 或人工確認）：兩視圖都用卡片呈現。

- [ ] **Step 4: 回報**

整理：完成項目、測試結果（實際輸出）、瀏覽器驗證結果、未盡事項（如手機視口人工確認）。**不 push**（依 workspace 慣例，push 由使用者裁定；push origin/main 會觸發 Zeabur 部署）。

---

## Self-Review 紀錄

- Spec 覆蓋：§1 分流→Task 5；§2 教職員視圖（格式化 Task 2、停用啟用 Task 3、角色篩選排除 parent Task 5）；§3 家長視圖→Task 4+5；§4 停用互動→Task 3；§5 URL 同步→Task 1（tab）+ Task 5（view）；§6 統計→Task 6；§7 版面/dark→Task 8（`最後登入` min-width 在 Task 2）；§8 手機→Task 4（家長卡片）+ 既有 staff 卡片不動；錯誤處理→Task 7；測試策略→各 task + Task 9。無缺口。
- 無 placeholder；所有跨 task 引用（`handleToggleActive`、`ParentAccountsList` props、`staffUsers`）簽名一致。
- mock 資料變更（Task 2 加 last_login、Task 5 加 parent1、Task 6 改 lin02/chen03）均已核對不影響既有斷言（既有測試只斷言 username 集合與角色卡行為）。
