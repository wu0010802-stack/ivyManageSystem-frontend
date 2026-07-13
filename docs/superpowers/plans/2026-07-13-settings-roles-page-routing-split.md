# 系統設定路由拆分＋角色設定頁（二期-b 前端）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地帳號/角色/權限重構 spec 的二期前端範圍：`/settings` 拆分為三條獨立路由（帳號/角色/一般設定）＋sidebar 二級選單、新增角色設定頁（master-detail＋身份 flag＋per doc_type 拖拉簽核關卡鏈）、帳號 dialog 改角色卡資料驅動＋另存自訂角色、工作台 super_admin 終核按鈕、認證路徑 flags 驅動，最後移除 `SettingsApprovalTab` 與 `RoleManagerDrawer`。

**Architecture:** 純前端。路由層在 `ROUTE_PERMISSION_RULES` 加兩條 exact 規則（`canAccessRoute` 為 default-deny＋最長匹配，exact 規則彼此獨立）；`SettingsAccountsTab.vue` 整檔搬宿主（新 view 殼），不改其內部（uiux plan 已重度改造它，避免二次攪動）；角色頁為新樹 `src/views/settings/SettingsRolesView.vue` + `src/components/settings/roles/*`（types / RoleDetailPanel / ApprovalChainEditor）；拖拉用既有依賴 `vuedraggable`；super_admin / portal_only 判斷以 `userInfo.flags` 優先、硬編碼 fallback（OR、只嚴不鬆），且**僅供 UI 顯示分流，授權權威在後端**。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、vuedraggable@4.1.0（既有依賴，`FunnelColumn.vue:31` 先例；底層 sortablejs 已在 bundle，**零新增依賴、零 bundle 影響**——這是選型理由，勿另裝 `@vueuse/integrations` 或其他 DnD 套件）、Vitest + @vue/test-utils。

**Spec:** `/Users/user/personal_project/ivy/ivyManageSystem-backend/docs/superpowers/specs/2026-07-12-account-role-permission-restructure-design.md`（§2 路由/IA、§6 前端頁面、§7 二期清單、§8 測試）
**前置 plan（假設其 9 tasks 已全部落地）:** `docs/superpowers/plans/2026-07-12-settings-accounts-uiux-redesign.md`

## Global Constraints

- **純前端**：不動後端、不動 codegen 產物（`schema.d.ts` 已由一期 regen，含 `flags`/`finalize_all`/`stage_approved`/`PolicyItem.doc_type`）。若 `npm run gen:api:check` 變紅，停下回報，不要手改 `_generated/`。
- **repo 路徑**：`/Users/user/personal_project/ivy/ivyManageSystem-frontend`（所有指令在此目錄下跑）。針對性測試：`npx vitest run <path>`。
- **TS-only**：新檔一律 `<script setup lang="ts">`；禁 `: any` / `as any`；用 `: unknown` + narrow。
- **語言**：commit message、UI 文案、測試描述一律繁體中文；Conventional Commits。
- **共用 checkout 可能有平行 session**：一律 path 限定 commit（`git commit -m "..." -- <files>`），絕不裸 `git commit` / `git commit -a`；commit 前先跑 `git status --porcelain` 目視，且不可與 commit 串在同一 `&&` 鏈。**不 push**。
- **禁止執行 `start.sh` / `npm run dev`**（使用者自己前景跑）；瀏覽器驗證假設 dev server 已在 :5173。
- **`?tab=` / `?view=` 契約沿 uiux plan Task 1/5**：URL 同步一律 `router.replace`（不塞 history）；`?view=staff|parent` 由 `SettingsAccountsTab` 自管，本 plan 只搬宿主不改該邏輯。
- **前置假設**：uiux plan 9 tasks 已全部落地（`SettingsView` 已有 tab↔URL 同步、`SettingsAccountsTab` 已有 audience 分流/統計/loadError、`ParentAccountsList` 已存在）。若動工時發現錨點缺失（例如 `SettingsAccountsTab` 沒有 `audience` ref），**停下回報**，不要自行補作 uiux plan 的內容。
- **flags 僅供 UI**：`isSuperAdmin()` / `isPortalOnlyUser()` 只控制按鈕可見性與分流；所有規則（super_admin 增減資格、parent flag 帳號數限制、finalize_all 資格、政策修改資格）後端已即時查 DB 強制，前端誤放行只會得到 4xx，交給 `apiError()` 顯示後端 detail。
- **反擴散（spec 非目標 m11）**：不動 `canAccessRoute` / `getAllowedRoutes` / `getPermissionScope` / `hasPortalPermission` 的 teacher 分支；§6.3 只改 spec 列的三處。

---

### Task 1: 路由拆分＋sidebar 二級選單＋帳號頁搬遷

**Files:**
- Modify: `src/constants/permissions.ts:122`（`/settings` 規則旁加兩條）
- Modify: `src/router/index.ts:266`（`/settings` 路由旁加兩條）
- Create: `src/views/settings/SettingsAccountsView.vue`
- Create: `src/views/settings/SettingsRolesView.vue`（本 task 為最小骨架，Task 2 全文重寫）
- Modify: `src/views/SettingsView.vue`（移除帳號分頁＋舊深連結 redirect）
- Modify: `src/components/layout/AdminSidebar.vue:223-232`（系統設定二級選單）＋`:336`（`hasVisibleSettingsItems`）
- Test: Create `src/constants/__tests__/settingsRoutePermissions.test.ts`
- Test: Modify `src/components/layout/__tests__/AdminSidebar.spec.ts`
- Test: Modify `src/views/__tests__/SettingsView.test.ts`

**Interfaces:**
- Consumes: `ROUTE_PERMISSION_RULES` 形狀 `{ path: string; permission: string; prefix?: boolean }`（`src/constants/permissions.ts:84`）；`canAccessRoute` 最長匹配＋default-deny（`src/utils/auth.ts:393`）；`SettingsAccountsTab.vue` 原封不動（其 `?view=` 分流讀 `route.query.view`，換宿主路由後依然成立）。
- Produces: 路由 `/settings/accounts`（USER_MANAGEMENT_READ）與 `/settings/roles`（ROLES_MANAGE）；view 檔 `src/views/settings/SettingsRolesView.vue`（Task 2 重寫其全文）；sidebar 子項 index 即路徑字串。

**⚠ 風險——sidebar/permission 回歸面**：`canAccessRoute` 是 default-deny，漏加規則＝所有人（含 super admin）被鎖在頁外；`getAllowedRoutes`（登入後導頁）與 sidebar `canView` 也吃同一組規則/權限。本 task 的三個測試檔就是回歸網，不可省略。

- [ ] **Step 1: 寫失敗測試——新檔 `src/constants/__tests__/settingsRoutePermissions.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { ROUTE_PERMISSION_RULES } from '@/constants/permissions'
import { canAccessRoute, setUserInfo } from '@/utils/auth'

// 規則形狀斷言 + canAccessRoute 實際行為（default-deny、最長匹配、exact 不外溢）
describe('系統設定路由拆分權限規則', () => {
  const rulesFor = (path: string) => ROUTE_PERMISSION_RULES.filter((r) => r.path === path)

  it('/settings/accounts 掛 USER_MANAGEMENT_READ（單條、非 prefix）', () => {
    const rules = rulesFor('/settings/accounts')
    expect(rules.map((r) => r.permission)).toEqual(['USER_MANAGEMENT_READ'])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })

  it('/settings/roles 掛 ROLES_MANAGE（單條、非 prefix）', () => {
    const rules = rulesFor('/settings/roles')
    expect(rules.map((r) => r.permission)).toEqual(['ROLES_MANAGE'])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })

  it('/settings 維持 SETTINGS_READ 且非 prefix（不可外溢到子路由）', () => {
    const rules = rulesFor('/settings')
    expect(rules.map((r) => r.permission)).toEqual(['SETTINGS_READ'])
    expect(rules.some((r) => 'prefix' in r && r.prefix)).toBe(false)
  })
})

describe('canAccessRoute 三路由獨立放行', () => {
  // hasPermission 內部呼叫模組自身 getUserInfo（ESM 內部綁定 mock 不到），
  // 比照 AdminSidebar.spec.ts 慣例：用真實 setUserInfo 灌狀態。
  beforeEach(() => setUserInfo(null))

  it('只有 USER_MANAGEMENT_READ：可進帳號頁，不可進一般設定/角色頁', () => {
    setUserInfo({ role: 'hr', permission_names: ['USER_MANAGEMENT_READ'] })
    expect(canAccessRoute('/settings/accounts')).toBe(true)
    expect(canAccessRoute('/settings')).toBe(false)
    expect(canAccessRoute('/settings/roles')).toBe(false)
  })

  it('只有 ROLES_MANAGE：可進角色頁，不可進帳號頁/一般設定', () => {
    setUserInfo({ role: 'hr', permission_names: ['ROLES_MANAGE'] })
    expect(canAccessRoute('/settings/roles')).toBe(true)
    expect(canAccessRoute('/settings/accounts')).toBe(false)
    expect(canAccessRoute('/settings')).toBe(false)
  })

  it('只有 SETTINGS_READ：可進一般設定，不可進帳號頁/角色頁', () => {
    setUserInfo({ role: 'supervisor', permission_names: ['SETTINGS_READ'] })
    expect(canAccessRoute('/settings')).toBe(true)
    expect(canAccessRoute('/settings/accounts')).toBe(false)
    expect(canAccessRoute('/settings/roles')).toBe(false)
  })

  it('wildcard：三頁全可進', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    expect(canAccessRoute('/settings')).toBe(true)
    expect(canAccessRoute('/settings/accounts')).toBe(true)
    expect(canAccessRoute('/settings/roles')).toBe(true)
  })
})
```

- [ ] **Step 2: 寫失敗測試——`AdminSidebar.spec.ts` 檔尾加 describe**

（沿用檔內既有 `mountWith` / `items` / `subs` helpers，見 `src/components/layout/__tests__/AdminSidebar.spec.ts:31-44`。）

```ts
describe('AdminSidebar 系統設定二級選單（路由拆分）', () => {
  it('wildcard：帳號設定/角色設定/一般設定三子項全可見', () => {
    const w = mountWith(['*'])
    const all = items(w)
    expect(all).toContain('/settings/accounts')
    expect(all).toContain('/settings/roles')
    expect(all).toContain('/settings')
  })

  it('只有 USER_MANAGEMENT_READ：群組顯示、僅帳號設定可見', () => {
    const w = mountWith(['USER_MANAGEMENT_READ'])
    expect(subs(w)).toContain('group-settings')
    const all = items(w)
    expect(all).toContain('/settings/accounts')
    expect(all).not.toContain('/settings/roles')
    expect(all).not.toContain('/settings')
  })

  it('只有 ROLES_MANAGE：群組顯示、僅角色設定可見', () => {
    const w = mountWith(['ROLES_MANAGE'])
    expect(subs(w)).toContain('group-settings')
    const all = items(w)
    expect(all).toContain('/settings/roles')
    expect(all).not.toContain('/settings/accounts')
    expect(all).not.toContain('/settings')
  })

  it('三權限皆無：系統設定群組整個不顯示', () => {
    const w = mountWith(['SALARY_READ'])
    expect(subs(w)).not.toContain('group-settings')
  })
})
```

- [ ] **Step 3: 改寫 `SettingsView.test.ts` 中受影響的既有測試＋加 redirect 測試**

既有「deep link ?tab=accounts → 直接落在帳號分頁」測試（uiux plan Task 1 產物）改為 redirect 斷言；「切換 tab → 離開 accounts 清掉 view」測試改為單純 tab 切換斷言；`globalConfig.stubs` 移除 `SettingsAccountsTab` key。新增/改寫：

```ts
  it('舊深連結 ?tab=accounts&view=parent → redirect /settings/accounts 並保留 view', async () => {
    mockQuery = { tab: 'accounts', view: 'parent' }
    shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ path: '/settings/accounts', query: { view: 'parent' } })
  })

  it('舊深連結 ?tab=accounts（無 view）→ redirect /settings/accounts', async () => {
    mockQuery = { tab: 'accounts' }
    shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ path: '/settings/accounts', query: {} })
  })

  it('切換 tab → replace 更新 ?tab=', async () => {
    mockQuery = { tab: 'line' }
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    replace.mockClear()
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'shifts')
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ query: { tab: 'shifts' } })
  })

  it('帳號分頁已自 /settings 移除', async () => {
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.find('[data-name="accounts"]').exists()).toBe(false)
  })
```

- [ ] **Step 4: 跑測試確認失敗**

Run: `npx vitest run src/constants/__tests__/settingsRoutePermissions.test.ts src/components/layout/__tests__/AdminSidebar.spec.ts src/views/__tests__/SettingsView.test.ts`
Expected: 新測試全 FAIL（規則不存在、sidebar 無子項、redirect 未實作）；既有未被改寫的測試 PASS。

- [ ] **Step 5: 實作——`src/constants/permissions.ts`**

`{ path: '/settings', permission: 'SETTINGS_READ' }`（:122）之後插入：

```ts
  // 系統設定路由拆分（spec §2.1）：三條 exact 獨立規則，權限對齊後端守衛——
  // list_users → USER_MANAGEMENT_READ、permissions_admin → ROLES_MANAGE。
  // /settings 不可改 prefix（子路由權限不同，外溢 = SETTINGS_READ 就能進帳號/角色頁）。
  { path: '/settings/accounts', permission: 'USER_MANAGEMENT_READ' },
  { path: '/settings/roles', permission: 'ROLES_MANAGE' },
```

- [ ] **Step 6: 實作——`src/router/index.ts`**

`/settings` 路由物件（:266-271）之後插入：

```ts
        {
            path: '/settings/accounts',
            name: 'settings-accounts',
            component: () => import('../views/settings/SettingsAccountsView.vue'),
            meta: { title: '帳號設定' }
        },
        {
            path: '/settings/roles',
            name: 'settings-roles',
            component: () => import('../views/settings/SettingsRolesView.vue'),
            meta: { title: '角色設定' }
        },
```

- [ ] **Step 7: 實作——新 view 殼**

`src/views/settings/SettingsAccountsView.vue` 全文：

```vue
<script setup lang="ts">
// 帳號設定獨立頁（spec §2.1 路由拆分）。內容整檔沿用 SettingsAccountsTab：
// uiux 改版（受眾分流/統計/loadError/?view= 同步）全部住在該元件內，僅換宿主。
// §2.2 的「帳號列表/dialog/重設密碼/憑證框各自成檔」拆分：本 plan 只拆出
// RoleCardsGrid（Task 4，兩個 dialog 共用、且是行為變更點）；列表/重設密碼/
// 憑證框與 users/fetchUsers 狀態交叉引用深，維持單檔可維護性優於硬拆。
import SettingsAccountsTab from '@/components/settings/SettingsAccountsTab.vue'
</script>

<template>
  <div class="settings-page">
    <h2>帳號設定</h2>
    <SettingsAccountsTab />
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
}
</style>
```

`src/views/settings/SettingsRolesView.vue` 全文（Task 2 重寫；此處僅讓路由可掛）：

```vue
<script setup lang="ts">
// 角色設定頁骨架：master-detail 主體由後續 task 填入
</script>

<template>
  <div class="settings-page">
    <h2>角色設定</h2>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
}
</style>
```

- [ ] **Step 8: 實作——`src/views/SettingsView.vue`**

script 三處修改：

1. 移除 `import SettingsAccountsTab from '@/components/settings/SettingsAccountsTab.vue'`。
2. `BASE_TABS` 改為（approval 分頁 Task 7 才移除，避免中間版本無處檢視審核鏈）：

```ts
const BASE_TABS = ['shifts', 'approval', 'line', 'observability']
```

3. `const activeTab = ...` 與其後的 normalize `if` 整段改為（redirect 分支優先，避免 accounts 被 resolveTab fallback 成 shifts 又多打一次 replace）：

```ts
const activeTab = ref(resolveTab(route.query.tab))

const rawTab = Array.isArray(route.query.tab) ? route.query.tab[0] : route.query.tab
if (rawTab === 'accounts') {
  // 舊深連結 ?tab=accounts → 新帳號設定頁（保留 ?view= 受眾分流參數）
  const next: LocationQueryRaw = {}
  if (route.query.view) next.view = route.query.view
  router.replace({ path: '/settings/accounts', query: next })
} else if (route.query.tab !== activeTab.value) {
  // 缺漏 / 不合法 tab → 修正 URL（與 EmployeeHubView 一致）
  router.replace({ query: { ...route.query, tab: activeTab.value } })
}
```

4. `onTabChange` 內刪掉 accounts/view 特例（分頁已不存在）：

```ts
const onTabChange = (name: string | number) => {
  router.replace({ query: { ...route.query, tab: String(name) } })
}
```

Template：整段刪除 `<el-tab-pane label="帳號與權限" name="accounts">...</el-tab-pane>`。

- [ ] **Step 9: 實作——`src/components/layout/AdminSidebar.vue`**

「9. 系統設定」區塊（:222-232）改為：

```html
        <!-- 9. 系統設定（路由拆分：帳號/角色/一般 三子項各自依權限顯示） -->
        <el-sub-menu v-if="hasVisibleSettingsItems" index="group-settings">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系統設定</span>
          </template>
          <el-menu-item v-if="canView.USER_MANAGEMENT_READ" index="/settings/accounts">
            <el-icon><User /></el-icon>
            <template #title>帳號設定</template>
          </el-menu-item>
          <el-menu-item v-if="canView.ROLES_MANAGE" index="/settings/roles">
            <el-icon><Key /></el-icon>
            <template #title>角色設定</template>
          </el-menu-item>
          <el-menu-item v-if="canView.SETTINGS_READ" index="/settings">
            <el-icon><Setting /></el-icon>
            <template #title>一般設定</template>
          </el-menu-item>
        </el-sub-menu>
```

script：icons import 加 `Key`（`@element-plus/icons-vue` 既有 export）；`hasVisibleSettingsItems`（:336）改為：

```ts
const hasVisibleSettingsItems = computed(() =>
  canView.value.SETTINGS_READ || canView.value.USER_MANAGEMENT_READ || canView.value.ROLES_MANAGE
)
```

（`canView` 由 `PERMISSION_NAMES` 全量展開（:286-292），`USER_MANAGEMENT_READ` / `ROLES_MANAGE` 已在其中，不需加 key。`activeMenu`（:294）不用改——兩個新 index 都是 exact 路徑。）

- [ ] **Step 10: 跑測試確認通過**

Run: `cd /Users/user/personal_project/ivy/ivyManageSystem-frontend && npx vitest run src/constants/__tests__/settingsRoutePermissions.test.ts src/components/layout/__tests__/AdminSidebar.spec.ts src/views/__tests__/SettingsView.test.ts && npm run typecheck`
Expected: 全 PASS；typecheck 綠。

- [ ] **Step 11: Commit（path 限定）**

```bash
cd /Users/user/personal_project/ivy/ivyManageSystem-frontend && git status --porcelain
git add src/constants/permissions.ts src/router/index.ts src/views/settings/SettingsAccountsView.vue src/views/settings/SettingsRolesView.vue src/views/SettingsView.vue src/components/layout/AdminSidebar.vue src/constants/__tests__/settingsRoutePermissions.test.ts src/components/layout/__tests__/AdminSidebar.spec.ts src/views/__tests__/SettingsView.test.ts
git commit -m "feat(settings): 系統設定路由拆分——/settings/accounts、/settings/roles 獨立路由與 sidebar 二級選單

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/constants/permissions.ts src/router/index.ts src/views/settings/ src/views/SettingsView.vue src/components/layout/AdminSidebar.vue src/constants/__tests__/settingsRoutePermissions.test.ts src/components/layout/__tests__/AdminSidebar.spec.ts src/views/__tests__/SettingsView.test.ts
```

---

### Task 2: 角色設定頁 master-detail（清單、身份 flag、基本資料、權限、新增/刪除、儲存確認）

**Files:**
- Create: `src/components/settings/roles/types.ts`
- Create: `src/components/settings/roles/RoleDetailPanel.vue`
- Modify: `src/views/settings/SettingsRolesView.vue`（全文重寫 Task 1 的骨架）
- Modify: `src/api/permissions_admin.ts`（`RoleUpdate` 加 `flags`）
- Modify: `src/utils/auth.ts`（新增 `isSuperAdmin()`）
- Test: Create `src/utils/__tests__/isSuperAdmin.test.ts`
- Test: Create `src/components/settings/roles/__tests__/RoleDetailPanel.test.ts`
- Test: Create `src/views/settings/__tests__/SettingsRolesView.test.ts`

**Interfaces:**
- Consumes: `getPermissions()` → `GET /auth/permissions`（`src/api/auth.ts:29`；`data.roles[code] = { label, description, permissions, is_core, flags }`，一期起含 flags——後端 `utils/permissions.py:909-910` 已回傳）；`getUsers()` → `GET /auth/users`（需 USER_MANAGEMENT_READ，403 需容忍）；`createRole` / `updateRole` / `deleteRole`（`src/api/permissions_admin.ts`，dispatch path `/roles`、`/roles/{code}`；`DELETE` 在角色仍在審核鏈時回 409，detail 為中文說明）；`PermissionPicker.vue` props `{ modelValue: string[]; definition: PermissionPickerDefinition; disabled?: boolean }`（`src/components/settings/PermissionPicker.vue:10-14`，`disabled` 時顯示「核心角色的權限不可修改」）。
- Produces:
  - `src/components/settings/roles/types.ts`：`RoleDef`（含 `flags?: string[]`）、`RolesDefinition`、`FLAG_SUPER_ADMIN` / `FLAG_PARENT` / `FLAG_PORTAL_ONLY`、`DOC_TYPES` / `DocType` / `DOC_TYPE_LABELS`（Task 3/4 消費）。
  - `src/utils/auth.ts` 的 `isSuperAdmin(): boolean`（Task 3/4/5 消費）。
  - `SettingsRolesView` 右欄 detail 區塊結尾預留 Task 3 掛載點（`RoleDetailPanel` 之後、同一 `<template v-if="selectedRole">` 內）。
  - `RoleDetailPanel` props `{ code: string; role: RoleDef; definition: RolesDefinition; accountCount: number | null }`、emits `saved` / `delete-role`。

**行為規格——flag checkbox（spec §6.1 右欄 1）：**

| checkbox | disabled 條件 | tooltip 文案 |
|---|---|---|
| 超級管理員 | `!isSuperAdmin()` | 僅超級管理員可變更此身份 |
| 超級管理員 | `code === 'admin'`（核心 admin 不可移除，後端 409 兜底） | 核心 admin 角色的超級管理員身份不可移除 |
| 家長 | `code === 'parent'`（核心家長角色不可移除，後端 409 兜底） | 核心家長角色的家長身份不可移除 |
| 家長 | 未勾且 `accountCount > 0`（accountCount 為 null 時不擋，交後端 409） | 已有帳號的角色不可標記為家長身份 |

`portal_only` **不顯示 checkbox**（seed 管理）；儲存 payload 的 `flags` 必須保留原有 `portal_only`（後端 `apply_role_flags` 對 portal_only 增減一律 409，漏帶會被判定為「移除」而爆錯）。

- [ ] **Step 1: 寫失敗測試——`src/utils/__tests__/isSuperAdmin.test.ts`（新檔）**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { isSuperAdmin, setUserInfo } from '@/utils/auth'

// 同模組內部呼叫 getUserInfo，mock 不到——用真實 setUserInfo 灌狀態（AdminSidebar.spec 慣例）
describe('isSuperAdmin（flags 優先、admin 字面 fallback）', () => {
  beforeEach(() => setUserInfo(null))

  it('未登入 → false', () => {
    expect(isSuperAdmin()).toBe(false)
  })

  it('flags 含 super_admin 的自訂角色 → true', () => {
    setUserInfo({ role: 'custom_boss', permission_names: ['*'], flags: ['super_admin'] })
    expect(isSuperAdmin()).toBe(true)
  })

  it('flags 缺失（舊 localStorage userInfo）但 role=admin → true（fallback）', () => {
    setUserInfo({ role: 'admin', permission_names: ['*'] })
    expect(isSuperAdmin()).toBe(true)
  })

  it('一般角色無 flag → false', () => {
    setUserInfo({ role: 'hr', permission_names: ['USER_MANAGEMENT_READ'], flags: [] })
    expect(isSuperAdmin()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/utils/__tests__/isSuperAdmin.test.ts`
Expected: FAIL（`isSuperAdmin` 未匯出）。

- [ ] **Step 3: 實作 `isSuperAdmin` 與型別檔、API 型別**

`src/utils/auth.ts` 在 `hasWritePermission` 之後加：

```ts
/**
 * 目前登入者是否為超級管理員——僅供 UI 顯示/分流（終核按鈕、flag checkbox、
 * 審核鏈編輯區的可見性）。授權判斷後端一律即時查 DB role_flags（spec §3.1 信任邊界），
 * 前端誤放行只會拿到 4xx。優先讀 userInfo.flags 的 'super_admin'；flags 缺失
 * （登入前、舊 localStorage userInfo、DB 未 seed）fallback role === 'admin'。
 */
export function isSuperAdmin(): boolean {
  const userInfo = getUserInfo()
  if (!userInfo) return false
  const flags = userInfo['flags']
  if (Array.isArray(flags) && (flags as unknown[]).includes('super_admin')) return true
  return userInfo['role'] === 'admin'
}
```

`src/components/settings/roles/types.ts` 全文：

```ts
import type { PermissionPickerDefinition } from '@/components/settings/PermissionPicker.vue'

// GET /auth/permissions 的 roles 定義（一期起含 flags：super_admin / parent / portal_only）。
// schema.d.ts 對此 endpoint 的 roles 是 { [key: string]: unknown }（後端未標 response_model
// 細型），故此為手動描形——欄位對齊 utils/permissions.py get_permission_definitions。
export interface RoleDef {
  label: string
  description: string
  permissions: string[]
  is_core: boolean
  flags?: string[]
}

export type RolesDefinition = PermissionPickerDefinition & { roles: Record<string, RoleDef> }

export const FLAG_SUPER_ADMIN = 'super_admin'
export const FLAG_PARENT = 'parent'
export const FLAG_PORTAL_ONLY = 'portal_only'

// 審核政策 doc_type（後端 VALID_POLICY_DOC_TYPES，api/approval_settings.py）
export const DOC_TYPES = ['all', 'leave', 'overtime', 'punch_correction'] as const
export type DocType = (typeof DOC_TYPES)[number]
export const DOC_TYPE_LABELS: Record<DocType, string> = {
  all: '共同設定',
  leave: '請假',
  overtime: '加班',
  punch_correction: '補打卡',
}
```

`src/api/permissions_admin.ts` 的 `RoleUpdate` 加欄位（對齊 schema.d.ts `RoleUpdate.flags`）：

```ts
export interface RoleUpdate {
  label?: string
  description?: string
  permissions?: string[]
  flags?: string[]
}
```

- [ ] **Step 4: 跑 isSuperAdmin 測試確認通過**

Run: `npx vitest run src/utils/__tests__/isSuperAdmin.test.ts`
Expected: 4 個測試 PASS。

- [ ] **Step 5: 寫失敗測試——`src/components/settings/roles/__tests__/RoleDetailPanel.test.ts`（新檔）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/permissions_admin', () => ({
  updateRole: vi.fn().mockResolvedValue({ data: {} }),
}))

// PermissionPicker 也 import '@/utils/auth' 的集合運算，需保留原始實作只覆寫 isSuperAdmin
const mockIsSuperAdmin = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, isSuperAdmin: () => mockIsSuperAdmin() }
})

import { updateRole } from '@/api/permissions_admin'
import RoleDetailPanel from '../RoleDetailPanel.vue'
import type { RolesDefinition } from '../types'

const definition: RolesDefinition = {
  permissions: { DASHBOARD: { value: 'DASHBOARD', label: '儀表板' } },
  groups: [{ name: '一般', permissions: ['DASHBOARD'] }],
  roles: {
    admin: { label: '管理員', description: '', permissions: ['*'], is_core: true, flags: ['super_admin'] },
    hr: { label: '人資', description: '', permissions: ['DASHBOARD'], is_core: true, flags: [] },
    parent: { label: '家長', description: '', permissions: [], is_core: true, flags: ['parent', 'portal_only'] },
    custom_x: { label: '自訂X', description: '', permissions: ['DASHBOARD'], is_core: false, flags: [] },
  },
}

const mountPanel = (code: string, accountCount: number | null = 0) =>
  mount(RoleDetailPanel, {
    props: { code, role: definition.roles[code], definition, accountCount },
    global: { plugins: [ElementPlus] },
  })

describe('RoleDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSuperAdmin.mockReturnValue(true)
  })

  it('非 super_admin：超級管理員 checkbox disabled', () => {
    mockIsSuperAdmin.mockReturnValue(false)
    const w = mountPanel('custom_x')
    const vm = w.vm as unknown as { superAdminDisabled: boolean; superAdminTooltip: string }
    expect(vm.superAdminDisabled).toBe(true)
    expect(vm.superAdminTooltip).toContain('僅超級管理員')
  })

  it('核心 admin：超級管理員 checkbox disabled（不可移除）', () => {
    const w = mountPanel('admin')
    const vm = w.vm as unknown as { superAdminDisabled: boolean; superAdminTooltip: string }
    expect(vm.superAdminDisabled).toBe(true)
    expect(vm.superAdminTooltip).toContain('不可移除')
  })

  it('家長 checkbox：帳號數 > 0 且未勾 → disabled；帳號數 null（無 USER_MANAGEMENT_READ）→ 不擋', () => {
    const withAccounts = mountPanel('custom_x', 3)
    expect((withAccounts.vm as unknown as { parentDisabled: boolean }).parentDisabled).toBe(true)
    const unknownCount = mountPanel('custom_x', null)
    expect((unknownCount.vm as unknown as { parentDisabled: boolean }).parentDisabled).toBe(false)
  })

  it('核心 parent：家長 checkbox disabled（不可移除）', () => {
    const w = mountPanel('parent')
    expect((w.vm as unknown as { parentDisabled: boolean }).parentDisabled).toBe(true)
  })

  it('儲存：confirm（含帳號數文案）→ updateRole payload 含 flags 且保留 portal_only；核心角色不送 permissions', async () => {
    const w = mountPanel('parent', 5)
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await (w.vm as unknown as { handleSave: () => Promise<void> }).handleSave()
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('5 個帳號'), expect.any(String), expect.any(Object))
    const payload = vi.mocked(updateRole).mock.calls[0][1] as { flags?: string[]; permissions?: string[] }
    expect(payload.flags).toContain('portal_only')
    expect(payload.flags).toContain('parent')
    expect(payload.permissions).toBeUndefined()
    confirmSpy.mockRestore()
  })

  it('儲存 confirm 取消 → 不送 API', async () => {
    const w = mountPanel('custom_x')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    await (w.vm as unknown as { handleSave: () => Promise<void> }).handleSave()
    expect(vi.mocked(updateRole)).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('自訂角色儲存：payload 含 permissions；成功 emit saved', async () => {
    const w = mountPanel('custom_x')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await (w.vm as unknown as { handleSave: () => Promise<void> }).handleSave()
    await flushPromises()
    const payload = vi.mocked(updateRole).mock.calls[0][1] as { permissions?: string[] }
    expect(payload.permissions).toEqual(['DASHBOARD'])
    expect(w.emitted('saved')).toBeTruthy()
    confirmSpy.mockRestore()
  })

  it('刪除保護：核心角色 deleteDisabled；自訂＋帳號數>0 也 disabled；自訂＋0 帳號可按並 emit', async () => {
    expect((mountPanel('hr').vm as unknown as { deleteDisabled: boolean }).deleteDisabled).toBe(true)
    expect((mountPanel('custom_x', 2).vm as unknown as { deleteDisabled: boolean }).deleteDisabled).toBe(true)
    const w = mountPanel('custom_x', 0)
    expect((w.vm as unknown as { deleteDisabled: boolean }).deleteDisabled).toBe(false)
    ;(w.vm as unknown as { requestDelete: () => void }).requestDelete()
    expect(w.emitted('delete-role')).toBeTruthy()
  })

  it('切換角色（props.code 變更）→ 表單重置為新角色資料', async () => {
    const w = mountPanel('custom_x')
    const vm = w.vm as unknown as { form: { label: string } }
    vm.form.label = '改過的名稱'
    await w.setProps({ code: 'hr', role: definition.roles.hr, accountCount: 0 })
    expect(vm.form.label).toBe('人資')
  })
})
```

- [ ] **Step 6: 跑測試確認失敗**

Run: `npx vitest run src/components/settings/roles/__tests__/RoleDetailPanel.test.ts`
Expected: FAIL（元件不存在）。

- [ ] **Step 7: 建立 `src/components/settings/roles/RoleDetailPanel.vue`（全文）**

```vue
<script setup lang="ts">
import { reactive, ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { updateRole, type RoleUpdate } from '@/api/permissions_admin'
import { apiError } from '@/utils/error'
import { isSuperAdmin } from '@/utils/auth'
import PermissionPicker from '@/components/settings/PermissionPicker.vue'
import { FLAG_SUPER_ADMIN, FLAG_PARENT, FLAG_PORTAL_ONLY, type RoleDef, type RolesDefinition } from './types'

const props = defineProps<{
  code: string
  role: RoleDef
  definition: RolesDefinition
  accountCount: number | null // null = 無 USER_MANAGEMENT_READ，帳號數功能降級
}>()
const emit = defineEmits<{ saved: []; 'delete-role': [] }>()

const form = reactive<{ label: string; description: string; permissions: string[]; flagSuperAdmin: boolean; flagParent: boolean }>({
  label: '', description: '', permissions: [], flagSuperAdmin: false, flagParent: false,
})

watch(
  () => props.code,
  () => {
    const flags = props.role.flags ?? []
    form.label = props.role.label
    form.description = props.role.description || ''
    form.permissions = [...props.role.permissions]
    form.flagSuperAdmin = flags.includes(FLAG_SUPER_ADMIN)
    form.flagParent = flags.includes(FLAG_PARENT)
  },
  { immediate: true },
)

// ── flag checkbox disabled 規則（後端 apply_role_flags 為權威，此處只是預檢 UX）──
const superAdminDisabled = computed(() => !isSuperAdmin() || props.code === 'admin')
const superAdminTooltip = computed(() => {
  if (!isSuperAdmin()) return '僅超級管理員可變更此身份'
  if (props.code === 'admin') return '核心 admin 角色的超級管理員身份不可移除'
  return ''
})

const parentDisabled = computed(() => {
  if (props.code === 'parent') return true
  // 帳號數 > 0 不可「加上」家長 flag（spec §5.3 M9）；已勾者（理論上帳號數必為 0）可取消
  if (!form.flagParent && props.accountCount !== null && props.accountCount > 0) return true
  return false
})
const parentTooltip = computed(() => {
  if (props.code === 'parent') return '核心家長角色的家長身份不可移除'
  if (!form.flagParent && props.accountCount !== null && props.accountCount > 0) return '已有帳號的角色不可標記為家長身份'
  return ''
})

// ── 儲存 ──
const saving = ref(false)

// portal_only 由 seed 管理不可經 UI 增減；payload 必須原樣保留，否則後端視為「移除」而 409
const buildFlags = (): string[] => {
  const flags: string[] = []
  if (form.flagSuperAdmin) flags.push(FLAG_SUPER_ADMIN)
  if (form.flagParent) flags.push(FLAG_PARENT)
  if ((props.role.flags ?? []).includes(FLAG_PORTAL_ONLY)) flags.push(FLAG_PORTAL_ONLY)
  return flags
}

const handleSave = async () => {
  const n = props.accountCount
  const msg = n === null
    ? '權限或身份變更後，該角色帳號需重新登入生效。確定儲存？'
    : `此角色下有 ${n} 個帳號，權限或身份變更後將重新登入生效。確定儲存？`
  try {
    await ElMessageBox.confirm(msg, '儲存角色', { type: 'warning', confirmButtonText: '儲存', cancelButtonText: '取消' })
  } catch {
    return
  }
  if (saving.value) return
  saving.value = true
  try {
    const payload: RoleUpdate = { label: form.label, description: form.description, flags: buildFlags() }
    if (!props.role.is_core) payload.permissions = [...form.permissions]
    await updateRole(props.code, payload)
    ElMessage.success('角色已更新')
    emit('saved')
  } catch (e) {
    // 409：防鎖死 / parent flag 帳號數限制 / 鏈殘留等，後端 detail 為完整中文說明
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

// ── 刪除保護（後端已有；此處預檢 + disabled 態，spec §6.1）──
const deleteDisabled = computed(() => props.role.is_core || (props.accountCount !== null && props.accountCount > 0))
const deleteTooltip = computed(() => {
  if (props.role.is_core) return '核心角色不可刪除'
  if (props.accountCount !== null && props.accountCount > 0) return '仍有帳號使用此角色，不可刪除'
  return ''
})
const requestDelete = () => emit('delete-role')

defineExpose({ form, superAdminDisabled, superAdminTooltip, parentDisabled, parentTooltip, deleteDisabled, deleteTooltip, handleSave, requestDelete, buildFlags, saving })
</script>

<template>
  <el-card shadow="never" class="role-detail">
    <template #header>
      <div class="detail-header">
        <span class="detail-title">{{ role.label }} <code class="detail-code">{{ code }}</code></span>
        <div class="detail-actions">
          <el-tooltip :content="deleteTooltip" :disabled="!deleteDisabled" placement="top">
            <span>
              <el-button type="danger" plain size="small" :disabled="deleteDisabled" data-testid="delete-role" @click="requestDelete">刪除角色</el-button>
            </span>
          </el-tooltip>
          <el-button type="primary" size="small" :loading="saving" data-testid="save-role" @click="handleSave">儲存</el-button>
        </div>
      </div>
    </template>

    <!-- 1. 身份 flag（最上方，spec §6.1） -->
    <section class="detail-section">
      <h4>身份</h4>
      <div class="flag-row">
        <el-tooltip :content="superAdminTooltip" :disabled="!superAdminDisabled" placement="top">
          <span>
            <el-checkbox v-model="form.flagSuperAdmin" :disabled="superAdminDisabled" data-testid="flag-super-admin">
              👑 超級管理員（任何關卡可代簽，並可終核整張）
            </el-checkbox>
          </span>
        </el-tooltip>
      </div>
      <div class="flag-row">
        <el-tooltip :content="parentTooltip" :disabled="!parentDisabled" placement="top">
          <span>
            <el-checkbox v-model="form.flagParent" :disabled="parentDisabled" data-testid="flag-parent">
              家長（分流到家長帳號區塊，不可指派給員工、不可進審核鏈）
            </el-checkbox>
          </span>
        </el-tooltip>
      </div>
    </section>

    <!-- 2. 基本資料 -->
    <section class="detail-section">
      <h4>基本資料</h4>
      <el-form label-width="80px">
        <el-form-item label="code">
          <el-input :model-value="code" disabled />
        </el-form-item>
        <el-form-item label="名稱">
          <el-input v-model="form.label" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
    </section>

    <!-- 3. 權限（核心角色由 PermissionPicker 自帶唯讀提示） -->
    <section class="detail-section">
      <h4>權限</h4>
      <PermissionPicker v-model="form.permissions" :definition="definition" :disabled="role.is_core" />
    </section>
  </el-card>
</template>

<style scoped>
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.detail-title {
  font-weight: 600;
}

.detail-code {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.detail-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.detail-section {
  margin-bottom: 20px;
}

.detail-section h4 {
  margin: 0 0 8px;
}

.flag-row {
  margin-bottom: 4px;
}
</style>
```

- [ ] **Step 8: 跑 RoleDetailPanel 測試確認通過**

Run: `npx vitest run src/components/settings/roles/__tests__/RoleDetailPanel.test.ts`
Expected: 全 PASS。

- [ ] **Step 9: 寫失敗測試——`src/views/settings/__tests__/SettingsRolesView.test.ts`（新檔）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/auth', () => ({
  getPermissions: vi.fn().mockResolvedValue({
    data: {
      permissions: { DASHBOARD: { value: 'DASHBOARD', label: '儀表板' } },
      groups: [{ name: '一般', permissions: ['DASHBOARD'] }],
      roles: {
        admin: { label: '管理員', description: '', permissions: ['*'], is_core: true, flags: ['super_admin'] },
        hr: { label: '人資', description: '', permissions: ['DASHBOARD'], is_core: true, flags: [] },
        parent: { label: '家長', description: '', permissions: [], is_core: true, flags: ['parent', 'portal_only'] },
        custom_x: { label: '自訂X', description: '', permissions: ['DASHBOARD'], is_core: false, flags: [] },
      },
    },
  }),
  getUsers: vi.fn().mockResolvedValue({
    data: [
      { id: 1, username: 'a', role: 'admin' },
      { id: 2, username: 'b', role: 'hr' },
      { id: 3, username: 'c', role: 'hr' },
    ],
  }),
}))

vi.mock('@/api/permissions_admin', () => ({
  createRole: vi.fn().mockResolvedValue({ data: {} }),
  deleteRole: vi.fn().mockResolvedValue({ data: { ok: true } }),
  updateRole: vi.fn().mockResolvedValue({ data: {} }),
}))

import { getUsers } from '@/api/auth'
import { createRole, deleteRole } from '@/api/permissions_admin'
import SettingsRolesView from '../SettingsRolesView.vue'

// RoleDetailPanel 另有自己的測試；此處 stub 掉聚焦 view 邏輯
const stubs = {
  RoleDetailPanel: { name: 'RoleDetailPanel', props: ['code', 'role', 'definition', 'accountCount'], template: '<div data-test="detail" :data-code="code" />' },
}

const mountView = async () => {
  const w = mount(SettingsRolesView, { global: { plugins: [ElementPlus], stubs } })
  await flushPromises()
  return w
}

describe('SettingsRolesView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('左欄列出角色：label/code/帳號數/核心自訂 tag/flag badge', async () => {
    const w = await mountView()
    const text = w.text()
    expect(text).toContain('管理員')
    expect(text).toContain('custom_x')
    expect(text).toContain('👑')
    const vm = w.vm as unknown as { roleRows: { code: string; accountCount: number | null }[] }
    expect(vm.roleRows.find((r) => r.code === 'hr')?.accountCount).toBe(2)
    expect(vm.roleRows.find((r) => r.code === 'custom_x')?.accountCount).toBe(0)
  })

  it('getUsers 403（僅 ROLES_MANAGE）→ accountCounts 為 null、帳號數顯示 —', async () => {
    vi.mocked(getUsers).mockRejectedValueOnce(new Error('403'))
    const w = await mountView()
    const vm = w.vm as unknown as { accountCounts: Record<string, number> | null }
    expect(vm.accountCounts).toBeNull()
    expect(w.text()).toContain('—')
  })

  it('預設選中第一個角色並渲染 detail；點選切換 selectedCode', async () => {
    const w = await mountView()
    const vm = w.vm as unknown as { selectedCode: string }
    expect(vm.selectedCode).toBe('admin')
    await w.find('[data-role-item="custom_x"]').trigger('click')
    expect(vm.selectedCode).toBe('custom_x')
  })

  it('新增角色：createRole payload {code,label,description,permissions:[]}，成功後選中新角色', async () => {
    const w = await mountView()
    const vm = w.vm as unknown as {
      createDialogVisible: boolean
      createForm: { code: string; label: string; description: string }
      handleCreateRole: () => Promise<void>
      selectedCode: string
    }
    vm.createForm.code = 'custom_y'
    vm.createForm.label = '自訂Y'
    await vm.handleCreateRole()
    await flushPromises()
    expect(vi.mocked(createRole)).toHaveBeenCalledWith({ code: 'custom_y', label: '自訂Y', description: undefined, permissions: [] })
    expect(vm.selectedCode).toBe('custom_y')
  })

  it('刪除角色：confirm 後呼叫 deleteRole；409（鏈殘留）顯示後端 detail', async () => {
    const w = await mountView()
    const vm = w.vm as unknown as { selectedCode: string; handleDeleteRole: () => Promise<void> }
    vm.selectedCode = 'custom_x'
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.handleDeleteRole()
    await flushPromises()
    expect(vi.mocked(deleteRole)).toHaveBeenCalledWith('custom_x')
    confirmSpy.mockRestore()
  })
})
```

- [ ] **Step 10: 跑測試確認失敗**

Run: `npx vitest run src/views/settings/__tests__/SettingsRolesView.test.ts`
Expected: FAIL（view 仍是 Task 1 骨架）。

- [ ] **Step 11: 重寫 `src/views/settings/SettingsRolesView.vue`（全文）**

```vue
<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getPermissions, getUsers } from '@/api/auth'
import { createRole, deleteRole } from '@/api/permissions_admin'
import { apiError } from '@/utils/error'
import RoleDetailPanel from '@/components/settings/roles/RoleDetailPanel.vue'
import { FLAG_SUPER_ADMIN, FLAG_PARENT, type RolesDefinition } from '@/components/settings/roles/types'

const definition = ref<RolesDefinition>({ permissions: {}, groups: [], roles: {} })
const loadingDef = ref(false)

// 帳號數：getUsers 需 USER_MANAGEMENT_READ；僅持 ROLES_MANAGE 者拿不到 → null，
// UI 顯示「—」並停用帳號數預檢（parent flag / 刪除保護交後端 409 兜底）。
const accountCounts = ref<Record<string, number> | null>(null)

const selectedCode = ref<string>('')

const fetchDefinition = async () => {
  loadingDef.value = true
  try {
    const res = await getPermissions()
    definition.value = res.data
    if (!selectedCode.value || !definition.value.roles[selectedCode.value]) {
      selectedCode.value = Object.keys(definition.value.roles)[0] ?? ''
    }
  } catch (e) {
    ElMessage.error(apiError(e, '載入角色定義失敗'))
  } finally {
    loadingDef.value = false
  }
}

const fetchAccountCounts = async () => {
  try {
    const res = await getUsers()
    const counts: Record<string, number> = {}
    for (const u of res.data as { role: string }[]) {
      counts[u.role] = (counts[u.role] ?? 0) + 1
    }
    accountCounts.value = counts
  } catch {
    accountCounts.value = null
  }
}

const roleRows = computed(() =>
  Object.entries(definition.value.roles).map(([code, r]) => ({
    code,
    label: r.label || code,
    is_core: r.is_core,
    flags: r.flags ?? [],
    accountCount: accountCounts.value ? (accountCounts.value[code] ?? 0) : null,
  })),
)

const selectedRole = computed(() => definition.value.roles[selectedCode.value] ?? null)
const selectedAccountCount = computed(() =>
  accountCounts.value ? (accountCounts.value[selectedCode.value] ?? 0) : null,
)

// ── 新增角色（先建 code/label，權限於右欄補設）──
const createDialogVisible = ref(false)
const createForm = reactive<{ code: string; label: string; description: string }>({ code: '', label: '', description: '' })
const creating = ref(false)

const openCreateDialog = () => {
  createForm.code = ''
  createForm.label = ''
  createForm.description = ''
  createDialogVisible.value = true
}

const handleCreateRole = async () => {
  const code = createForm.code.trim()
  const label = createForm.label.trim()
  if (!code || !label) {
    ElMessage.warning('請填寫 code 與名稱')
    return
  }
  if (creating.value) return
  creating.value = true
  try {
    await createRole({ code, label, description: createForm.description.trim() || undefined, permissions: [] })
    ElMessage.success('角色已新增，請於右側設定權限與審核鏈')
    createDialogVisible.value = false
    selectedCode.value = code
    await fetchDefinition()
  } catch (e) {
    ElMessage.error(apiError(e, '新增失敗'))
  } finally {
    creating.value = false
  }
}

// ── 刪除（RoleDetailPanel 預檢 disabled；此處 confirm + 409 顯示後端 detail）──
const handleDeleteRole = async () => {
  const code = selectedCode.value
  const label = selectedRole.value?.label ?? code
  try {
    await ElMessageBox.confirm(`確定刪除角色「${label}」（code: ${code}）？`, '刪除角色', { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' })
  } catch {
    return
  }
  try {
    await deleteRole(code)
    ElMessage.success('角色已刪除')
    selectedCode.value = ''
    await fetchDefinition()
  } catch (e) {
    // 409：角色仍在審核鏈中（後端 detail 說明先移除鏈）
    ElMessage.error(apiError(e, '刪除失敗'))
  }
}

onMounted(() => {
  fetchDefinition()
  fetchAccountCounts()
})

defineExpose({ roleRows, selectedCode, selectedRole, accountCounts, createDialogVisible, createForm, openCreateDialog, handleCreateRole, handleDeleteRole, fetchDefinition })
</script>

<template>
  <div class="settings-page">
    <h2>角色設定</h2>
    <div v-loading="loadingDef" class="roles-layout">
      <!-- 左欄：角色清單 -->
      <aside class="roles-list">
        <el-button type="primary" class="add-role-btn" data-testid="add-role" @click="openCreateDialog">新增角色</el-button>
        <button
          v-for="row in roleRows"
          :key="row.code"
          type="button"
          class="role-item"
          :class="{ 'role-item--active': row.code === selectedCode }"
          :data-role-item="row.code"
          @click="selectedCode = row.code"
        >
          <div class="role-item__main">
            <span class="role-item__label">{{ row.label }}</span>
            <code class="role-item__code">{{ row.code }}</code>
          </div>
          <div class="role-item__meta">
            <el-tag size="small" :type="row.is_core ? 'info' : 'warning'">{{ row.is_core ? '核心' : '自訂' }}</el-tag>
            <el-tag v-if="row.flags.includes(FLAG_SUPER_ADMIN)" size="small" type="danger">👑 超級管理員</el-tag>
            <el-tag v-if="row.flags.includes(FLAG_PARENT)" size="small">家長</el-tag>
            <span class="role-item__count">帳號數 {{ row.accountCount === null ? '—' : row.accountCount }}</span>
          </div>
        </button>
      </aside>

      <!-- 右欄：選中角色詳情（Task 3 於 RoleDetailPanel 之後、同一 template 內追加 ApprovalChainEditor） -->
      <section class="roles-detail">
        <template v-if="selectedRole">
          <RoleDetailPanel
            :code="selectedCode"
            :role="selectedRole"
            :definition="definition"
            :account-count="selectedAccountCount"
            @saved="fetchDefinition"
            @delete-role="handleDeleteRole"
          />
        </template>
        <el-empty v-else description="請選擇左側角色" />
      </section>
    </div>

    <!-- 新增角色 dialog -->
    <el-dialog v-model="createDialogVisible" title="新增角色" width="480px">
      <el-form :model="createForm" label-width="80px">
        <el-form-item label="code">
          <el-input v-model="createForm.code" placeholder="例：custom_principal（建立後不可改）" />
        </el-form-item>
        <el-form-item label="名稱">
          <el-input v-model="createForm.label" placeholder="例：兼會計園長" />
        </el-form-item>
        <el-form-item label="說明">
          <el-input v-model="createForm.description" type="textarea" :rows="2" placeholder="一句話描述適用對象" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreateRole">建立</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.settings-page {
  padding: 24px;
}

.roles-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.roles-list {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.add-role-btn {
  align-self: flex-start;
  margin-bottom: 4px;
}

.role-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.role-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.role-item--active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.role-item__main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.role-item__label {
  font-weight: 600;
  color: var(--text-primary);
}

.role-item__code {
  font-size: 12px;
  color: var(--text-tertiary);
}

.role-item__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.role-item__count {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: auto;
}

.roles-detail {
  flex: 1;
  min-width: 0;
}

/* 手機：上下堆疊 */
@media (max-width: 768px) {
  .roles-layout {
    flex-direction: column;
  }

  .roles-list {
    flex: none;
    width: 100%;
  }
}
</style>
```

- [ ] **Step 12: 跑測試確認通過＋typecheck/lint**

Run: `npx vitest run src/views/settings/__tests__/ src/components/settings/roles/__tests__/ src/utils/__tests__/isSuperAdmin.test.ts && npm run typecheck && npm run lint`
Expected: 全綠。

- [ ] **Step 13: Commit（path 限定）**

```bash
git status --porcelain
git add src/components/settings/roles/ src/views/settings/SettingsRolesView.vue src/views/settings/__tests__/ src/api/permissions_admin.ts src/utils/auth.ts src/utils/__tests__/isSuperAdmin.test.ts
git commit -m "feat(roles): 角色設定頁 master-detail——清單、身份 flag、基本資料與權限編輯

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/components/settings/roles/ src/views/settings/ src/api/permissions_admin.ts src/utils/auth.ts src/utils/__tests__/isSuperAdmin.test.ts
```

---

### Task 3: 簽呈審核 per doc_type 拖拉關卡鏈（ApprovalChainEditor）

**Files:**
- Modify: `src/api/approvalSettings.ts`（typed 重寫；`updateApprovalPolicies` 死 client 復活）
- Create: `src/components/settings/roles/ApprovalChainEditor.vue`
- Modify: `src/views/settings/SettingsRolesView.vue`（右欄掛載編輯器）
- Test: Create `src/components/settings/roles/__tests__/ApprovalChainEditor.test.ts`

**Interfaces:**
- Consumes:
  - `GET /approval-settings/policies`（需 SETTINGS_READ；回傳 `{ id, doc_type, submitter_role, approver_roles, is_active }[]`，`approver_roles` 為 CSV、**順序即關卡鏈**）。
  - `PUT /approval-settings/policies`（需 SETTINGS_WRITE ＋ 後端即時查 DB 的 super_admin；body `{ policies: PolicyItem[] }`，**逐條 upsert**，key = `(submitter_role, doc_type)`；`doc_type` 僅接受 `all|leave|overtime|punch_correction`；`approver_roles` CSV 至少 1 個角色否則 422；**沒有 DELETE**——取消覆寫 = 送 `is_active: false`）。
  - Task 2 的 `types.ts`（`DOC_TYPES` / `DocType` / `DOC_TYPE_LABELS` / `FLAG_PARENT` / `RolesDefinition`）與 `isSuperAdmin()`（`@/utils/auth`）。
  - `vuedraggable`（default export `draggable`；用法先例 `src/components/recruitment/funnel/FunnelColumn.vue:31`）。
- Produces: `ApprovalChainEditor` props `{ submitterRole: string; definition: RolesDefinition; accountCounts: Record<string, number> | null }`（無 emits，自管 fetch/save）；`src/api/approvalSettings.ts` 的 `updateApprovalPolicies(policies: PolicyItem[])` 新簽名與 `ApprovalPolicyRow` 型別（Task 5 消費 `getApprovalPolicies` / `ApprovalPolicyRow`）。

**行為規格（spec §6.1 右欄 4，完整列舉）：**

1. **doc_type 切換**：`el-radio-button` 四選一（共同設定/請假/加班/補打卡），預設 `all`。
2. **鏈的視覺化**：ordered list，每關「⠿ 拖拉把手＋①②③ 序號＋角色 label＋移除鈕」；`chainDraft` 元素為 `{ uid, role }`（uid 遞增，容許同角色重複入鏈、也是 draggable 的 item-key）。
3. **拖拉調序**：`<draggable v-model="chainDraft" item-key="uid" handle=".stage-handle">`；儲存後 CSV 順序 = 拖後順序。
4. **增刪關卡**：下拉候選 = `definition.roles` **排除掛 parent flag 的角色**（後端對含 parent 角色的鏈回 400 兜底）；super_admin flag 角色**可**作為一般關卡（spec §4.1）。
5. **未覆寫的特定 doc_type**：顯示 `沿用共同設定（all）` tag ＋ all 鏈唯讀預覽＋「建立此類型的專屬關卡鏈」按鈕（按下複製 all 鏈為草稿進編輯）。
6. **連 all 都沒有**：顯示 fail-safe 文案「未設定審核鏈：此角色成員送出的簽呈僅超級管理員可核准」。
7. **super_admin 固定說明列**：常駐「👑 超級管理員：任何關卡皆可代簽，並可終核整張（無需列入關卡鏈）」。
8. **死鎖偵測（儲存前即時 warning，不阻擋）**：對草稿每一關角色 r——(a) `accountCounts` 可用且 `count(r)===0` → 「『r』目前沒有任何帳號，該關卡僅超級管理員可代簽」；(b) `r === submitterRole` 且 `count(r) <= 1` → 「『r』與申請人同角色且僅 N 個帳號：本人送單時無人可簽（自審死鎖），需超級管理員終核」。`accountCounts === null` 時不偵測。
9. **儲存**：confirm 列出完整鏈序 → `updateApprovalPolicies([{ submitter_role, doc_type, approver_roles: 'a,b,c', is_active: true }])` → 成功後 refetch。空鏈儲存直接 `ElMessage.warning('關卡鏈至少需要 1 個角色')` 不送。
10. **移除覆寫**（僅特定 doc_type 且有 active override 時顯示）：confirm → 送同 key、原 CSV、`is_active: false` → refetch。
11. **權限降級**：`!isSuperAdmin()` → 全區唯讀（隱藏把手/增刪/儲存，顯示 info alert「僅超級管理員可修改審核流程，以下為唯讀檢視」）；`GET` 失敗（無 SETTINGS_READ）→ warning alert「無法載入審核政策（需要一般設定讀取權限）」。

- [ ] **Step 1: 重寫 `src/api/approvalSettings.ts`（全文）**

```ts
import api from './index'
import type { AxiosResponse } from 'axios'
import type { ApiBody } from '@/api/_generated/typed'

// GET /approval-settings/policies 未標 response_model → 手動描形
// （對齊 api/approval_settings.py get_approval_policies 回傳 dict）
export interface ApprovalPolicyRow {
  id: number
  doc_type: string
  submitter_role: string
  approver_roles: string // CSV，順序即逐級簽核關卡鏈
  is_active: boolean
}

export type PolicyItem = ApiBody<'/approval-settings/policies', 'put'>['policies'][number]

export const getApprovalPolicies = () =>
  api.get('/approval-settings/policies') as Promise<AxiosResponse<ApprovalPolicyRow[]>> // TODO(ts-strict): waiting on backend response_model

// 逐條 upsert（key = submitter_role + doc_type）；取消 doc_type 覆寫 = is_active: false
export const updateApprovalPolicies = (policies: PolicyItem[]) => {
  const body: ApiBody<'/approval-settings/policies', 'put'> = { policies }
  return api.put('/approval-settings/policies', body)
}

export const getApprovalLogs = (docType: string, docId: number) =>
  api.get('/approval-settings/logs', { params: { doc_type: docType, doc_id: docId } })
```

（`SettingsApprovalTab.test.ts` 對本模組的 mock 是整模組替換，不受簽名變更影響；Task 7 會整檔移除該測試。）

- [ ] **Step 2: 寫失敗測試——`src/components/settings/roles/__tests__/ApprovalChainEditor.test.ts`（新檔）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/approvalSettings', () => ({
  getApprovalPolicies: vi.fn(),
  updateApprovalPolicies: vi.fn().mockResolvedValue({ data: {} }),
}))

const mockIsSuperAdmin = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, isSuperAdmin: () => mockIsSuperAdmin() }
})

// vuedraggable stub：渲染 item slot、v-model 直通（拖拉重排以直接改 chainDraft 模擬）
vi.mock('vuedraggable', () => ({
  default: {
    name: 'draggable',
    props: ['modelValue', 'itemKey', 'handle', 'disabled'],
    emits: ['update:modelValue'],
    template: `<div data-test="draggable"><template v-for="(el, i) in modelValue" :key="el.uid"><slot name="item" :element="el" :index="i" /></template></div>`,
  },
}))

import { getApprovalPolicies, updateApprovalPolicies } from '@/api/approvalSettings'
import ApprovalChainEditor from '../ApprovalChainEditor.vue'
import type { RolesDefinition } from '../types'

const definition: RolesDefinition = {
  permissions: {},
  groups: [],
  roles: {
    admin: { label: '管理員', description: '', permissions: ['*'], is_core: true, flags: ['super_admin'] },
    supervisor: { label: '主管', description: '', permissions: [], is_core: true, flags: [] },
    hr: { label: '人資', description: '', permissions: [], is_core: true, flags: [] },
    teacher: { label: '教師', description: '', permissions: [], is_core: true, flags: ['portal_only'] },
    parent: { label: '家長', description: '', permissions: [], is_core: true, flags: ['parent', 'portal_only'] },
  },
}

const basePolicies = [
  { id: 1, doc_type: 'all', submitter_role: 'teacher', approver_roles: 'supervisor,hr', is_active: true },
  { id: 2, doc_type: 'leave', submitter_role: 'teacher', approver_roles: 'supervisor', is_active: true },
  { id: 3, doc_type: 'all', submitter_role: 'hr', approver_roles: 'admin', is_active: true },
]

type Vm = {
  activeDocType: string
  chainDraft: { uid: number; role: string }[]
  overrideEditing: boolean
  startOverride: () => void
  stageToAdd: string
  addStage: () => void
  removeStage: (i: number) => void
  saveChain: () => Promise<void>
  removeOverride: () => Promise<void>
  warnings: string[]
  candidateRoles: { code: string }[]
}

const mountEditor = async (submitterRole = 'teacher', accountCounts: Record<string, number> | null = { teacher: 5, supervisor: 2, hr: 1, admin: 1 }) => {
  vi.mocked(getApprovalPolicies).mockResolvedValue({ data: basePolicies } as never)
  const w = mount(ApprovalChainEditor, {
    props: { submitterRole, definition, accountCounts },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return { w, vm: w.vm as unknown as Vm }
}

describe('ApprovalChainEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSuperAdmin.mockReturnValue(true)
  })

  it('all：草稿載入現有鏈序（supervisor→hr）並顯示 ①②', async () => {
    const { w, vm } = await mountEditor()
    expect(vm.chainDraft.map((s) => s.role)).toEqual(['supervisor', 'hr'])
    expect(w.text()).toContain('①')
    expect(w.text()).toContain('②')
  })

  it('切到 leave（有覆寫）→ 草稿載入覆寫鏈；切到 overtime（無覆寫）→ 顯示沿用 all 預覽與建立按鈕', async () => {
    const { w, vm } = await mountEditor()
    vm.activeDocType = 'leave'
    await flushPromises()
    expect(vm.chainDraft.map((s) => s.role)).toEqual(['supervisor'])
    vm.activeDocType = 'overtime'
    await flushPromises()
    expect(w.text()).toContain('沿用共同設定')
    expect(w.find('[data-testid="start-override"]').exists()).toBe(true)
  })

  it('建立覆寫：複製 all 鏈為草稿', async () => {
    const { vm } = await mountEditor()
    vm.activeDocType = 'overtime'
    await flushPromises()
    vm.startOverride()
    expect(vm.overrideEditing).toBe(true)
    expect(vm.chainDraft.map((s) => s.role)).toEqual(['supervisor', 'hr'])
  })

  it('候選角色排除 parent flag（teacher/portal_only 可入鏈、parent 不可）', async () => {
    const { vm } = await mountEditor()
    const codes = vm.candidateRoles.map((c) => c.code)
    expect(codes).toContain('teacher')
    expect(codes).toContain('admin')
    expect(codes).not.toContain('parent')
  })

  it('增刪＋調序後儲存：CSV 依草稿順序、confirm 先行', async () => {
    const { vm } = await mountEditor()
    vm.stageToAdd = 'admin'
    vm.addStage()
    // 模擬拖拉：hr 移到第一關
    const [a, b, c] = vm.chainDraft
    vm.chainDraft.splice(0, 3, b, a, c)
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.saveChain()
    await flushPromises()
    expect(vi.mocked(updateApprovalPolicies)).toHaveBeenCalledWith([
      { submitter_role: 'teacher', doc_type: 'all', approver_roles: 'hr,supervisor,admin', is_active: true },
    ])
    confirmSpy.mockRestore()
  })

  it('空鏈儲存：警告且不送 API', async () => {
    const { vm } = await mountEditor()
    vm.removeStage(0)
    vm.removeStage(0)
    await vm.saveChain()
    expect(vi.mocked(updateApprovalPolicies)).not.toHaveBeenCalled()
  })

  it('移除覆寫：送 is_active:false 原 CSV', async () => {
    const { vm } = await mountEditor()
    vm.activeDocType = 'leave'
    await flushPromises()
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.removeOverride()
    await flushPromises()
    expect(vi.mocked(updateApprovalPolicies)).toHaveBeenCalledWith([
      { submitter_role: 'teacher', doc_type: 'leave', approver_roles: 'supervisor', is_active: false },
    ])
    confirmSpy.mockRestore()
  })

  it('死鎖偵測：關卡角色 0 帳號、submitter 同角色單人 → 各出 warning', async () => {
    const { vm } = await mountEditor('hr', { hr: 1, admin: 0 })
    // hr 的 all 鏈 = admin（0 帳號）→ warning(a)；再加 hr 自己（1 帳號）→ warning(b)
    vm.stageToAdd = 'hr'
    vm.addStage()
    expect(vm.warnings.some((x) => x.includes('沒有任何帳號'))).toBe(true)
    expect(vm.warnings.some((x) => x.includes('自審死鎖'))).toBe(true)
  })

  it('accountCounts null：不出 warning', async () => {
    const { vm } = await mountEditor('hr', null)
    expect(vm.warnings).toEqual([])
  })

  it('非 super_admin：唯讀（無儲存鈕、有唯讀 alert）', async () => {
    mockIsSuperAdmin.mockReturnValue(false)
    const { w } = await mountEditor()
    expect(w.find('[data-testid="save-chain"]').exists()).toBe(false)
    expect(w.text()).toContain('僅超級管理員可修改審核流程')
  })

  it('GET 403：降級 alert', async () => {
    vi.mocked(getApprovalPolicies).mockRejectedValueOnce(new Error('403'))
    const w = mount(ApprovalChainEditor, {
      props: { submitterRole: 'teacher', definition, accountCounts: null },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).toContain('無法載入審核政策')
  })

  it('super_admin 固定說明列常駐', async () => {
    const { w } = await mountEditor()
    expect(w.text()).toContain('任何關卡皆可代簽')
  })

  it('連 all 都沒有：fail-safe 文案', async () => {
    vi.mocked(getApprovalPolicies).mockResolvedValue({ data: [] } as never)
    const w = mount(ApprovalChainEditor, {
      props: { submitterRole: 'supervisor', definition, accountCounts: null },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).toContain('僅超級管理員可核准')
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npx vitest run src/components/settings/roles/__tests__/ApprovalChainEditor.test.ts`
Expected: FAIL（元件不存在）。

- [ ] **Step 4: 建立 `src/components/settings/roles/ApprovalChainEditor.vue`（全文）**

```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import draggable from 'vuedraggable'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getApprovalPolicies, updateApprovalPolicies, type ApprovalPolicyRow } from '@/api/approvalSettings'
import { apiError } from '@/utils/error'
import { isSuperAdmin } from '@/utils/auth'
import { DOC_TYPES, DOC_TYPE_LABELS, FLAG_PARENT, type DocType, type RolesDefinition } from './types'

const props = defineProps<{
  submitterRole: string
  definition: RolesDefinition
  accountCounts: Record<string, number> | null
}>()

const CIRCLED_DIGITS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
const stageNo = (i: number) => CIRCLED_DIGITS[i] || `${i + 1}.`
const roleLabel = (code: string) => props.definition.roles[code]?.label || code

// PUT 後端限 SETTINGS_WRITE + super_admin（DB 即時查）；前端只控 UI 可見性
const canEdit = isSuperAdmin()

const policies = ref<ApprovalPolicyRow[]>([])
const loading = ref(false)
const loadError = ref(false)

const fetchPolicies = async () => {
  loading.value = true
  loadError.value = false
  try {
    const res = await getApprovalPolicies()
    policies.value = res.data
  } catch {
    loadError.value = true // 無 SETTINGS_READ 或網路錯誤：整區降級
  } finally {
    loading.value = false
  }
}

const activeDocType = ref<DocType>('all')

const findActivePolicy = (docType: string): ApprovalPolicyRow | undefined =>
  policies.value.find((p) => p.submitter_role === props.submitterRole && p.doc_type === docType && p.is_active)

const parseChain = (csv: string): string[] => csv.split(',').map((s) => s.trim()).filter(Boolean)

const currentPolicy = computed(() => findActivePolicy(activeDocType.value))
const fallbackAllPolicy = computed(() => findActivePolicy('all'))

// 草稿：uid 供 draggable item-key（同角色可重複入鏈）
interface StageItem { uid: number; role: string }
let uidSeq = 0
const chainDraft = ref<StageItem[]>([])
// 特定 doc_type 未覆寫時，按「建立專屬關卡鏈」才進入編輯
const overrideEditing = ref(false)

const syncDraft = () => {
  overrideEditing.value = false
  const p = currentPolicy.value
  chainDraft.value = p ? parseChain(p.approver_roles).map((role) => ({ uid: ++uidSeq, role })) : []
}
watch([activeDocType, () => props.submitterRole, policies], syncDraft, { immediate: true })

// 特定 doc_type：有覆寫或已按「建立覆寫」才顯示編輯區；all 恆為編輯區
const showChainArea = computed(() => activeDocType.value === 'all' || !!currentPolicy.value || overrideEditing.value)

const startOverride = () => {
  const base = fallbackAllPolicy.value ? parseChain(fallbackAllPolicy.value.approver_roles) : []
  chainDraft.value = base.map((role) => ({ uid: ++uidSeq, role }))
  overrideEditing.value = true
}

// 候選角色排除 parent flag（後端 400 兜底）；super_admin 角色可作一般關卡（spec §4.1）
const candidateRoles = computed(() =>
  Object.entries(props.definition.roles)
    .filter(([, r]) => !(r.flags ?? []).includes(FLAG_PARENT))
    .map(([code, r]) => ({ code, label: r.label || code })),
)

const stageToAdd = ref('')
const addStage = () => {
  if (!stageToAdd.value) return
  chainDraft.value.push({ uid: ++uidSeq, role: stageToAdd.value })
  stageToAdd.value = ''
}
const removeStage = (i: number) => {
  chainDraft.value.splice(i, 1)
}

// 死鎖偵測（spec §4.1 M10）：僅提示不阻擋——super_admin 終核可解套
const warnings = computed(() => {
  const counts = props.accountCounts
  if (!counts) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const s of chainDraft.value) {
    if (seen.has(s.role)) continue
    seen.add(s.role)
    const count = counts[s.role] ?? 0
    const label = roleLabel(s.role)
    if (count === 0) {
      out.push(`「${label}」目前沒有任何帳號，該關卡僅超級管理員可代簽`)
    }
    if (s.role === props.submitterRole && count <= 1) {
      out.push(`「${label}」與申請人同角色且僅 ${count} 個帳號：本人送單時無人可簽（自審死鎖），需超級管理員終核`)
    }
  }
  return out
})

const chainText = (roles: string[]) => roles.map((r, i) => `${stageNo(i)}${roleLabel(r)}`).join(' → ')

const saving = ref(false)
const saveChain = async () => {
  const roles = chainDraft.value.map((s) => s.role)
  if (roles.length === 0) {
    ElMessage.warning('關卡鏈至少需要 1 個角色')
    return
  }
  try {
    await ElMessageBox.confirm(
      `「${roleLabel(props.submitterRole)}」送出的「${DOC_TYPE_LABELS[activeDocType.value]}」簽呈將依以下順序逐級簽核：${chainText(roles)}。確定儲存？`,
      '儲存關卡鏈',
      { type: 'warning', confirmButtonText: '儲存', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  if (saving.value) return
  saving.value = true
  try {
    await updateApprovalPolicies([
      { submitter_role: props.submitterRole, doc_type: activeDocType.value, approver_roles: roles.join(','), is_active: true },
    ])
    ElMessage.success('審核鏈已更新')
    await fetchPolicies()
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

const removeOverride = async () => {
  const p = currentPolicy.value
  if (!p) return
  try {
    await ElMessageBox.confirm(
      `移除「${DOC_TYPE_LABELS[activeDocType.value]}」的專屬關卡鏈，改為沿用共同設定（all）？`,
      '移除覆寫',
      { type: 'warning', confirmButtonText: '移除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    // 政策無 DELETE 端點：is_active=false 即失效，引擎 fallback 到 all
    await updateApprovalPolicies([
      { submitter_role: p.submitter_role, doc_type: p.doc_type, approver_roles: p.approver_roles, is_active: false },
    ])
    ElMessage.success('已改為沿用共同設定')
    await fetchPolicies()
  } catch (e) {
    ElMessage.error(apiError(e, '移除失敗'))
  }
}

onMounted(fetchPolicies)

defineExpose({ policies, activeDocType, chainDraft, overrideEditing, startOverride, stageToAdd, addStage, removeStage, saveChain, removeOverride, warnings, candidateRoles, fetchPolicies })
</script>

<template>
  <el-card shadow="never" class="chain-editor" :body-style="{ paddingTop: '12px' }">
    <template #header>
      <div class="chain-header">
        <span class="chain-title">簽呈審核關卡鏈</span>
        <el-radio-group v-model="activeDocType" size="small">
          <el-radio-button v-for="dt in DOC_TYPES" :key="dt" :value="dt">{{ DOC_TYPE_LABELS[dt] }}</el-radio-button>
        </el-radio-group>
      </div>
    </template>

    <el-alert v-if="loadError" type="warning" :closable="false" title="無法載入審核政策（需要一般設定讀取權限）" />
    <div v-else v-loading="loading">
      <el-alert v-if="!canEdit" type="info" :closable="false" title="僅超級管理員可修改審核流程，以下為唯讀檢視" class="chain-alert" />
      <div class="superadmin-note">👑 超級管理員：任何關卡皆可代簽，並可終核整張（無需列入關卡鏈）</div>

      <!-- 未覆寫的特定 doc_type：沿用 all 預覽 -->
      <template v-if="!showChainArea">
        <div class="fallback-preview">
          <el-tag type="info" size="small">沿用共同設定（all）</el-tag>
          <span v-if="fallbackAllPolicy" class="chain-text">{{ chainText(parseChain(fallbackAllPolicy.approver_roles)) }}</span>
          <span v-else class="chain-text chain-text--failsafe">未設定審核鏈：此角色成員送出的簽呈僅超級管理員可核准（fail-safe）</span>
        </div>
        <el-button v-if="canEdit" size="small" data-testid="start-override" @click="startOverride">建立此類型的專屬關卡鏈</el-button>
      </template>

      <!-- 編輯區 -->
      <template v-else>
        <div v-if="chainDraft.length === 0" class="chain-empty">
          尚未設定關卡：此角色成員送出的簽呈僅超級管理員可核准（fail-safe）。
        </div>
        <draggable v-model="chainDraft" item-key="uid" handle=".stage-handle" :disabled="!canEdit" class="stage-list">
          <template #item="{ element, index }">
            <div class="stage-item" :data-stage-role="element.role">
              <span v-if="canEdit" class="stage-handle" aria-label="拖拉調整順序">⠿</span>
              <span class="stage-no">{{ stageNo(index) }}</span>
              <span class="stage-label">{{ roleLabel(element.role) }}</span>
              <el-button v-if="canEdit" link type="danger" class="stage-remove" @click="removeStage(index)">移除</el-button>
            </div>
          </template>
        </draggable>

        <div v-if="canEdit" class="stage-add">
          <el-select v-model="stageToAdd" placeholder="選擇要加入的關卡角色" size="small" style="width: 200px;">
            <el-option v-for="c in candidateRoles" :key="c.code" :label="c.label" :value="c.code" />
          </el-select>
          <el-button size="small" data-testid="add-stage" @click="addStage">加入關卡</el-button>
        </div>

        <el-alert v-for="(warning, i) in warnings" :key="i" type="warning" :closable="false" :title="warning" class="chain-alert" />

        <div v-if="canEdit" class="chain-actions">
          <el-button type="primary" size="small" :loading="saving" data-testid="save-chain" @click="saveChain">儲存關卡鏈</el-button>
          <el-button v-if="activeDocType !== 'all' && currentPolicy" size="small" data-testid="remove-override" @click="removeOverride">
            移除覆寫（沿用共同設定）
          </el-button>
        </div>
      </template>
    </div>
  </el-card>
</template>

<style scoped>
.chain-editor {
  margin-top: 16px;
}

.chain-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.chain-title {
  font-weight: 600;
}

.superadmin-note {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 12px;
}

.fallback-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.chain-text {
  font-size: 14px;
  color: var(--text-primary);
}

.chain-text--failsafe {
  color: var(--text-tertiary);
}

.chain-empty {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-bottom: 8px;
}

.stage-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color);
}

.stage-handle {
  cursor: grab;
  color: var(--text-tertiary);
  user-select: none;
}

.stage-no {
  font-weight: 600;
  color: var(--el-color-primary);
}

.stage-label {
  flex: 1;
}

.stage-add {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.chain-alert {
  margin-bottom: 8px;
}

.chain-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}
</style>
```

- [ ] **Step 5: 掛載到 `SettingsRolesView.vue`**

script imports 加：

```ts
import ApprovalChainEditor from '@/components/settings/roles/ApprovalChainEditor.vue'
```

Template 右欄 `<RoleDetailPanel ... />` 之後（同一 `<template v-if="selectedRole">` 內）加：

```html
          <!-- 4. 簽呈審核（spec §6.1 右欄 4）：per doc_type 拖拉關卡鏈 -->
          <ApprovalChainEditor
            :submitter-role="selectedCode"
            :definition="definition"
            :account-counts="accountCounts"
          />
```

`SettingsRolesView.test.ts` 的 `stubs` 加一行避免子元件打 API：

```ts
  ApprovalChainEditor: { name: 'ApprovalChainEditor', props: ['submitterRole', 'definition', 'accountCounts'], template: '<div data-test="chain-editor" />' },
```

- [ ] **Step 6: 跑測試確認通過＋typecheck/lint**

Run: `npx vitest run src/components/settings/roles/__tests__/ src/views/settings/__tests__/ && npm run typecheck && npm run lint`
Expected: 全綠。

- [ ] **Step 7: Commit（path 限定）**

```bash
git status --porcelain
git add src/api/approvalSettings.ts src/components/settings/roles/ApprovalChainEditor.vue src/components/settings/roles/__tests__/ApprovalChainEditor.test.ts src/views/settings/SettingsRolesView.vue src/views/settings/__tests__/SettingsRolesView.test.ts
git commit -m "feat(roles): 簽呈審核 per doc_type 拖拉關卡鏈編輯器（沿用/覆寫/死鎖提示）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/api/approvalSettings.ts src/components/settings/roles/ src/views/settings/
```

---

### Task 4: 帳號 dialog——角色卡資料驅動、移除進階微調、偏離唯讀摘要＋另存自訂角色

**Files:**
- Create: `src/components/settings/RoleCardsGrid.vue`
- Modify: `src/components/settings/SettingsAccountsTab.vue`
- Test: Create `src/components/settings/__tests__/RoleCardsGrid.test.ts`
- Test: Modify `src/components/settings/__tests__/SettingsAccountsTab.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `RolesDefinition` / `RoleDef`（`@/components/settings/roles/types`，含 `flags`）與 `isSuperAdmin()`；`createRole`（`@/api/permissions_admin`）；`updateUser`（`@/api/auth`，`PUT /auth/users/{id}`——**後端語意：payload 帶 `role` 而不帶 `permission_names` 時，permission_names 重置為新角色預設**，這是「另存自訂角色」與「換角色即脫離偏離」的基礎）。
- Produces: `RoleCardsGrid` props `{ modelValue: string; definition: RolesDefinition }`、emit `update:modelValue`（Task 7 不再動 dialog）；`SettingsAccountsTab` 新 expose：`editingDeviation`、`openSaveAsRole`、`submitSaveAsRole`、`saveAsRoleForm`、`saveAsRoleDialogVisible`。

**⚠ 風險——兩段式 API 失敗中間態（另存自訂角色）**：`createRole` 成功但 `updateUser` 失敗時，自訂角色已存在（code 已佔用）。錯誤處理必須（1）明講「角色已建立、指派失敗」，（2）refetch 角色定義讓新角色卡立即出現供使用者手動指派，（3）**不可**讓使用者重走「另存」流程（會撞 code 已存在）。實作見 Step 5 的 `submitSaveAsRole`。

**⚠ 風險——既有測試回歸面**：`SettingsAccountsTab.test.ts` 內凡斷言「進階微調 / restoreDefault / deviationCount / permission_names 進 payload / shouldSendPermissionNames」的測試都會紅。改寫原則：payload 斷言一律改為「**不含** `permission_names`」；進階微調 UI 斷言整段刪除。`shouldSendPermissionNames`（`src/utils/auth.ts:384`）本 task 只移除本檔的 import 與呼叫，函式本體與其單元測試留給 Task 7 的死碼清查。

**行為規格（spec §6.2）：**

1. **角色卡資料驅動**：卡片來源 = `definition.roles` 全量（含自訂角色），**排除掛 parent flag 的角色**；核心角色依 `admin, principal, supervisor, hr, accountant, teacher` 順序，自訂角色按 code 字母序附後。emoji icon 僅核心角色有映射，自訂角色用 `👤`，一律 `aria-hidden="true"`。
2. **鍵盤可達性**：卡片 `role="button"`、`tabindex="0"`、`aria-pressed`、Enter/Space 觸發選取。
3. **super_admin 角色卡**：掛 super_admin flag 的角色，非超級管理員呼叫者不可指派（後端 `_assert_can_manage_user` 拒絕）→ 卡片 disabled ＋ title「僅超級管理員可指派此角色」。
4. **移除進階微調**：兩個 dialog 的 PermissionPicker／展開器／還原預設全部刪除；create/edit payload 一律不送 `permission_names`。
5. **偏離帳號（編輯 dialog）**：`permission_names` 非 null 且 ≠ 角色預設 → 唯讀 alert 列「較預設多 / 少哪幾條」（wildcard `*` 先展開成全部 code 再比集合；scope-qualified code 取 `:` 前 code 查 label）＋提示「變更角色並儲存後，將以新角色的預設權限取代自訂權限」＋「另存為自訂角色」按鈕。
6. **另存為自訂角色**：小 dialog 輸入 code/label → `createRole({ code, label, permissions: 現值 })` → `updateUser(id, { role: code })`（不送 permission_names）→ 關閉兩層 dialog、refetch users ＋ definition。

- [ ] **Step 1: 寫失敗測試——`src/components/settings/__tests__/RoleCardsGrid.test.ts`（新檔）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockIsSuperAdmin = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, isSuperAdmin: () => mockIsSuperAdmin() }
})

import RoleCardsGrid from '../RoleCardsGrid.vue'
import type { RolesDefinition } from '../roles/types'

const definition: RolesDefinition = {
  permissions: {},
  groups: [],
  roles: {
    parent: { label: '家長', description: '', permissions: [], is_core: true, flags: ['parent', 'portal_only'] },
    admin: { label: '管理員', description: '', permissions: ['*'], is_core: true, flags: ['super_admin'] },
    teacher: { label: '教師', description: '', permissions: [], is_core: true, flags: ['portal_only'] },
    hr: { label: '人資', description: '', permissions: ['DASHBOARD'], is_core: true, flags: [] },
    custom_x: { label: '自訂X', description: '', permissions: ['DASHBOARD'], is_core: false, flags: [] },
  },
}

const mountGrid = (modelValue = 'teacher') =>
  mount(RoleCardsGrid, { props: { modelValue, definition } })

describe('RoleCardsGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSuperAdmin.mockReturnValue(true)
  })

  it('資料驅動：含自訂角色、排除 parent flag 角色；核心排前、自訂附後', () => {
    const w = mountGrid()
    const codes = w.findAll('[data-role]').map((n) => n.attributes('data-role'))
    expect(codes).toEqual(['admin', 'hr', 'teacher', 'custom_x'])
    expect(codes).not.toContain('parent')
  })

  it('點擊卡片 emit update:modelValue', async () => {
    const w = mountGrid()
    await w.find('[data-role="hr"]').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['hr'])
  })

  it('鍵盤可達性：role=button、tabindex、aria-pressed、Enter/Space 選取', async () => {
    const w = mountGrid('hr')
    const card = w.find('[data-role="custom_x"]')
    expect(card.attributes('role')).toBe('button')
    expect(card.attributes('tabindex')).toBe('0')
    expect(card.attributes('aria-pressed')).toBe('false')
    expect(w.find('[data-role="hr"]').attributes('aria-pressed')).toBe('true')
    await card.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['custom_x'])
    await card.trigger('keydown', { key: ' ' })
    expect(w.emitted('update:modelValue')?.[1]).toEqual(['custom_x'])
  })

  it('emoji aria-hidden', () => {
    const w = mountGrid()
    expect(w.find('[data-role="admin"] .role-card__icon').attributes('aria-hidden')).toBe('true')
  })

  it('非 super_admin：super_admin flag 角色卡 disabled、點擊不 emit', async () => {
    mockIsSuperAdmin.mockReturnValue(false)
    const w = mountGrid()
    const adminCard = w.find('[data-role="admin"]')
    expect(adminCard.classes()).toContain('is-disabled')
    await adminCard.trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/components/settings/__tests__/RoleCardsGrid.test.ts`
Expected: FAIL（元件不存在）。

- [ ] **Step 3: 建立 `src/components/settings/RoleCardsGrid.vue`（全文）**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { isSuperAdmin } from '@/utils/auth'
import { FLAG_SUPER_ADMIN, FLAG_PARENT, type RolesDefinition } from './roles/types'

// 核心角色的 emoji 與排序沿舊 UI；自訂角色一律 👤、code 字母序附後
const ROLE_ICONS: Record<string, string> = {
  admin: '👑',
  principal: '🏫',
  supervisor: '📋',
  hr: '💼',
  accountant: '💰',
  teacher: '📚',
}
const CORE_ORDER = ['admin', 'principal', 'supervisor', 'hr', 'accountant', 'teacher']

const props = defineProps<{
  modelValue: string
  definition: RolesDefinition
}>()
const emit = defineEmits<{ 'update:modelValue': [role: string] }>()

const roleOptions = computed(() => {
  const order = (code: string) => {
    const i = CORE_ORDER.indexOf(code)
    return i === -1 ? CORE_ORDER.length : i
  }
  return Object.entries(props.definition.roles)
    // 家長角色不可指派給員工帳號（spec §5.1；後端 assert_role_assignable 兜底）
    .filter(([, r]) => !(r.flags ?? []).includes(FLAG_PARENT))
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([code, r]) => ({
      code,
      label: r.label || code,
      description: r.description || '',
      permCount: r.permissions.includes('*') ? '全部' : `${r.permissions.length} 條`,
      // super_admin flag 角色：非超級管理員不可指派（後端 _assert_can_manage_user 兜底）
      locked: (r.flags ?? []).includes(FLAG_SUPER_ADMIN) && !isSuperAdmin(),
      isAdminLike: (r.flags ?? []).includes(FLAG_SUPER_ADMIN),
    }))
})

const select = (code: string, locked: boolean) => {
  if (locked) return
  emit('update:modelValue', code)
}

const onKeydown = (e: KeyboardEvent, code: string, locked: boolean) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    select(code, locked)
  }
}
</script>

<template>
  <div class="role-cards-grid">
    <div
      v-for="opt in roleOptions"
      :key="opt.code"
      class="role-card"
      role="button"
      :tabindex="0"
      :data-role="opt.code"
      :class="{ 'role-card--active': modelValue === opt.code, 'is-disabled': opt.locked }"
      :aria-pressed="modelValue === opt.code ? 'true' : 'false'"
      :aria-disabled="opt.locked ? 'true' : undefined"
      :title="opt.locked ? '僅超級管理員可指派此角色' : ''"
      @click="select(opt.code, opt.locked)"
      @keydown="onKeydown($event, opt.code, opt.locked)"
    >
      <div class="role-card__icon" aria-hidden="true">{{ ROLE_ICONS[opt.code] || '👤' }}</div>
      <div class="role-card__label">{{ opt.label }}</div>
      <div class="role-card__desc">{{ opt.description }}</div>
      <div class="role-card__count">
        <el-tag size="small" :type="opt.isAdminLike ? 'danger' : 'info'">{{ opt.permCount }}</el-tag>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 樣式自 SettingsAccountsTab 搬入（該檔同步移除） */
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
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
  background: var(--el-bg-color);
  text-align: center;
}

.role-card:hover:not(.is-disabled) {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.role-card:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
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
</style>
```

- [ ] **Step 4: 跑 RoleCardsGrid 測試確認通過**

Run: `npx vitest run src/components/settings/__tests__/RoleCardsGrid.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: 改造 `SettingsAccountsTab.vue`**

**script 刪除**：`ROLE_ICONS`、`ROLE_ORDER`、`advancedExpanded`、`import PermissionPicker`、`import { shouldSendPermissionNames }`、`onRoleChange`、`selectRoleCard`、`restoreDefault`、`_openEditExpander`、`watch(deviationCount, ...)`、`_activeForm`、`deviationCount`、`isUsingDefaultPermissions`（`isUsingRoleDefault` **保留**——列表「自訂」tag 與統計用）。

**script 修改**：

```ts
// import 區
import { getUsers, getPermissions, createUser, updateUser, deleteUser, resetPassword } from '@/api/auth'
import { createRole } from '@/api/permissions_admin'
import RoleCardsGrid from './RoleCardsGrid.vue'
import type { RolesDefinition } from './roles/types'
```

（原 `import RoleManagerDrawer, { type RolesDefinition } from './RoleManagerDrawer.vue'` 改為只留 default import：`import RoleManagerDrawer from './RoleManagerDrawer.vue'`——drawer 本體 Task 7 才移除。）

`userForm` / `editUserForm` 調整：

```ts
const userForm = reactive<{ employee_id: number | null; username: string; password: string; role: string }>({ employee_id: null, username: '', password: '', role: 'teacher' })
// editUserForm 保留 permission_names 欄位：僅供偏離摘要計算（唯讀），永不進 payload
const editUserForm = reactive<{ id: number | null; username: string; role: string; permission_names: string[] | null }>({ id: null, username: '', role: 'teacher', permission_names: null })
```

`handleAddUser` 刪掉 `userForm.permission_names = ['*']` 與 `advancedExpanded.value = false`。`handleEditUser` 改存 `editUserForm.permission_names = (user.permission_names as string[] | null) ?? null`，刪掉 `nextTick(() => _openEditExpander())`。

`saveUser` payload 收斂（帳號頁只指派角色，spec §1）：

```ts
    const payload: Record<string, unknown> = {
      employee_id: userForm.employee_id,
      username: userForm.username,
      password: userForm.password,
      role: userForm.role,
    }
    await createUser(payload)
```

`saveEditUser` payload 收斂：

```ts
const saveEditUser = async () => {
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
```

**新增——偏離唯讀摘要**：

```ts
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
```

**新增——另存為自訂角色（兩段式 API，中間態處理）**：

```ts
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
```

`defineExpose` 移除已刪符號、加上：`editingDeviation, openSaveAsRole, submitSaveAsRole, saveAsRoleForm, saveAsRoleDialogVisible`。

**Template 修改**（create 與 edit 兩個 dialog 同步）：

1. 兩處 `role-cards-grid` 區塊整段換成：

```html
        <el-form-item label="角色">
          <RoleCardsGrid v-model="userForm.role" :definition="permissionDefinition" />
        </el-form-item>
```

（edit dialog 用 `v-model="editUserForm.role"`。）

2. 兩處「權限／進階微調」`el-form-item` 整段刪除。
3. edit dialog 角色卡之後加偏離唯讀區：

```html
        <el-form-item v-if="editingDeviation" label="權限">
          <el-alert type="warning" :closable="false" class="deviation-alert" data-testid="deviation-alert">
            <template #title>此帳號的權限偏離角色預設（唯讀）</template>
            <div v-if="editingDeviation.extra.length">較預設多：{{ editingDeviation.extra.join('、') }}</div>
            <div v-if="editingDeviation.missing.length">較預設少：{{ editingDeviation.missing.join('、') }}</div>
            <div class="deviation-note">變更角色並儲存後，將以新角色的預設權限取代自訂權限。</div>
            <el-button size="small" data-testid="save-as-role" @click="openSaveAsRole">另存為自訂角色</el-button>
          </el-alert>
        </el-form-item>
```

4. 檔尾（Credential Dialog 之後）加另存 dialog：

```html
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
```

5. `<style scoped>` 刪除 `.role-cards-grid` / `.role-card*` / `.advanced-tuning*` 全部規則（已搬 RoleCardsGrid 或死碼），加：

```css
.deviation-alert {
  width: 100%;
}

.deviation-note {
  margin: 6px 0;
  color: var(--text-tertiary);
  font-size: 12px;
}
```

- [ ] **Step 6: 改寫/新增 `SettingsAccountsTab.test.ts`**

先跑一次鎖定紅測：`npx vitest run src/components/settings/__tests__/SettingsAccountsTab.test.ts`。改寫原則（逐條套用到紅掉的既有測試）：

- 斷言 `createUser` / `updateUser` payload 含 `permission_names` 的 → 改斷言 `expect.not.objectContaining({ permission_names: expect.anything() })` 或直接斷言完整 payload 無該 key。
- 進階微調／`restoreDefault`／`deviationCount`／`isUsingDefaultPermissions` 相關測試 → 整段刪除。
- 角色卡 DOM 斷言（`.role-card` 在本檔內）→ 改 `findComponent({ name: 'RoleCardsGrid' })` 存在性。

檔尾新增 describe：

```ts
  describe('偏離帳號唯讀摘要與另存自訂角色', () => {
    it('編輯偏離帳號：editingDeviation 列出多/少的權限 label', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        editingDeviation: { extra: string[]; missing: string[] } | null
      }
      // chen03 為 supervisor 但只有 DASHBOARD（缺 EMPLOYEES_READ 等預設）→ 偏離
      vm.handleEditUser({ id: 3, username: 'chen03', role: 'supervisor', permission_names: ['DASHBOARD'] })
      await nextTick()
      expect(vm.editingDeviation).not.toBeNull()
      expect(vm.editingDeviation!.missing.length).toBeGreaterThan(0)
    })

    it('permission_names 為 null（角色預設 resolve）→ 無偏離摘要', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        editingDeviation: unknown
      }
      vm.handleEditUser({ id: 2, username: 'lin02', role: 'teacher', permission_names: null })
      await nextTick()
      expect(vm.editingDeviation).toBeNull()
    })

    it('saveEditUser：payload 只有 role、不含 permission_names', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        saveEditUser: () => Promise<void>
      }
      vm.handleEditUser({ id: 3, username: 'chen03', role: 'supervisor', permission_names: ['DASHBOARD'] })
      await vm.saveEditUser()
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(3, { role: 'supervisor' })
    })

    it('另存自訂角色：createRole（permissions=現值）→ updateUser（role=新 code）', async () => {
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        openSaveAsRole: () => void
        saveAsRoleForm: { code: string; label: string }
        submitSaveAsRole: () => Promise<void>
      }
      vm.handleEditUser({ id: 3, username: 'chen03', role: 'supervisor', permission_names: ['DASHBOARD'] })
      vm.openSaveAsRole()
      vm.saveAsRoleForm.code = 'custom_chen'
      vm.saveAsRoleForm.label = '陳主任專用'
      await vm.submitSaveAsRole()
      await flushPromises()
      expect(vi.mocked(createRole)).toHaveBeenCalledWith({ code: 'custom_chen', label: '陳主任專用', permissions: ['DASHBOARD'] })
      expect(vi.mocked(updateUser)).toHaveBeenCalledWith(3, { role: 'custom_chen' })
    })

    it('另存中間態：createRole 成功、updateUser 失敗 → 錯誤訊息含「已建立」且 refetch 定義', async () => {
      vi.mocked(updateUser).mockRejectedValueOnce(new Error('boom'))
      const errorSpy = vi.spyOn(ElMessage, 'error')
      const wrapper = mount(SettingsAccountsTab, { attachTo: document.body, global: { plugins: [ElementPlus] } })
      await flushPromises()
      const vm = wrapper.vm as unknown as {
        handleEditUser: (u: Record<string, unknown>) => void
        openSaveAsRole: () => void
        saveAsRoleForm: { code: string; label: string }
        submitSaveAsRole: () => Promise<void>
      }
      vm.handleEditUser({ id: 3, username: 'chen03', role: 'supervisor', permission_names: ['DASHBOARD'] })
      vm.openSaveAsRole()
      vm.saveAsRoleForm.code = 'custom_chen'
      vm.saveAsRoleForm.label = '陳主任專用'
      await vm.submitSaveAsRole()
      await flushPromises()
      expect(errorSpy.mock.calls.some((c) => String(c[0]).includes('已建立'))).toBe(true)
      errorSpy.mockRestore()
    })
  })
```

（測試檔頂部需補 `vi.mock('@/api/permissions_admin', () => ({ createRole: vi.fn().mockResolvedValue({ data: {} }) }))` 與 `import { createRole } from '@/api/permissions_admin'`、`import { ElMessage } from 'element-plus'`；`getPermissions` 既有 mock 的 roles 需含 `supervisor` 的預設 permissions（多於 `['DASHBOARD']`）與 `flags` 欄位，例如 `supervisor: { label: '主管', description: '', permissions: ['DASHBOARD', 'EMPLOYEES_READ'], is_core: true, flags: [] }`。）

- [ ] **Step 7: 跑測試確認全綠＋typecheck/lint**

Run: `npx vitest run src/components/settings/__tests__/ && npm run typecheck && npm run lint`
Expected: 全綠（含 cardview spec、ParentAccountsList、PermissionPicker、RoleManagerDrawer 既有測試）。

- [ ] **Step 8: Commit（path 限定）**

```bash
git status --porcelain
git add src/components/settings/RoleCardsGrid.vue src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/RoleCardsGrid.test.ts src/components/settings/__tests__/SettingsAccountsTab.test.ts
git commit -m "feat(settings): 帳號 dialog 角色卡資料驅動；移除進階微調；偏離帳號唯讀摘要＋另存自訂角色

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/components/settings/RoleCardsGrid.vue src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/RoleCardsGrid.test.ts src/components/settings/__tests__/SettingsAccountsTab.test.ts
```

---

### Task 5: 工作台 super_admin「核准整張」終核按鈕

**Files:**
- Modify: `src/views/workbench/WorkbenchApprovalsView.vue`
- Test: Create `src/views/workbench/__tests__/WorkbenchApprovalsView.finalize.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `isSuperAdmin()`；Task 3 的 `getApprovalPolicies` / `ApprovalPolicyRow`（super_admin 必持 `*`，GET 的 SETTINGS_READ 守衛必過）；三個 approve API 的 request schema 已含 `finalize_all: boolean`（`api__leaves__ApproveRequest` / overtimes / punch_corrections，schema.d.ts:15726 等）；既有 `useApprovalOperation().execute(id, payload, successMsg)`（`WorkbenchApprovalsView.vue:94-96`）；列 row 均含 `submitter_role`（既有 `formatSubmitterRole` 在用）。
- Produces: 無跨 task 介面（終端功能）。

**行為規格（spec §6.2 末項＋§4.1 super_admin 語意 2）：**

1. 按鈕僅 `isSuperAdmin()` 為 true 時渲染；三個待審表格（請假/加班/補打卡）每列於既有 核准/駁回 圓鈕旁各加一顆（**不加到批次列**——spec 是「對待審單」逐張終核）。
2. 點擊 → confirm 框列出該單的**完整審核鏈**（依 `submitter_role` 查 policies：doc_type 專屬優先、fallback `all`、皆無則顯示 fail-safe 文案），說明「將跨過所有未完成關卡直接核准整張」。前端無單據當前關卡資訊（列表 API 未回傳 stage），故列完整鏈而非精確「剩餘關卡」——response 的 `stage_approved`/`chain_length` 是核准後才拿得到的欄位。
3. 確認 → 走既有 `execute*Approval(row.id, { approved: true, finalize_all: true }, '…已核准（整張終核）')`，成功後自動 refetch（`useApprovalOperation` 既有行為）。
4. policies 載入失敗不阻擋功能：confirm 內鏈序顯示「（無法取得審核鏈資訊）」。

- [ ] **Step 1: 寫失敗測試——`src/views/workbench/__tests__/WorkbenchApprovalsView.finalize.test.ts`（新檔）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { ElMessageBox } from 'element-plus'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

vi.mock('@/api/leaves', () => ({
  getLeaves: vi.fn().mockResolvedValue({ data: [] }),
  approveLeave: vi.fn().mockResolvedValue({ data: {} }),
  getLeaveAttachment: vi.fn(),
  batchApproveLeaves: vi.fn(),
}))
vi.mock('@/api/overtimes', () => ({
  getOvertimes: vi.fn().mockResolvedValue({ data: [] }),
  approveOvertime: vi.fn().mockResolvedValue({ data: {} }),
  batchApproveOvertimes: vi.fn(),
}))
vi.mock('@/api/punchCorrections', () => ({
  getCorrections: vi.fn().mockResolvedValue({ data: [] }),
  approveCorrection: vi.fn().mockResolvedValue({ data: {} }),
  batchApproveCorrections: vi.fn(),
}))
vi.mock('@/api/approvalSettings', () => ({
  getApprovalPolicies: vi.fn().mockResolvedValue({
    data: [
      { id: 1, doc_type: 'all', submitter_role: 'teacher', approver_roles: 'supervisor,hr', is_active: true },
      { id: 2, doc_type: 'leave', submitter_role: 'teacher', approver_roles: 'supervisor', is_active: true },
    ],
  }),
}))

const mockIsSuperAdmin = vi.fn().mockReturnValue(true)
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/auth')>()
  return { ...actual, isSuperAdmin: () => mockIsSuperAdmin() }
})

import { approveLeave } from '@/api/leaves'
import WorkbenchApprovalsView from '../WorkbenchApprovalsView.vue'

type Vm = {
  showFinalize: boolean
  chainTextFor: (submitterRole: string, docType: string) => string
  finalizeLeave: (row: Record<string, unknown>) => Promise<void>
}

const mountView = async () => {
  const w = shallowMount(WorkbenchApprovalsView)
  await flushPromises()
  return w.vm as unknown as Vm
}

describe('工作台核准整張（finalize_all）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSuperAdmin.mockReturnValue(true)
  })

  it('非 super_admin：showFinalize false', async () => {
    mockIsSuperAdmin.mockReturnValue(false)
    const vm = await mountView()
    expect(vm.showFinalize).toBe(false)
  })

  it('鏈序解析：doc_type 專屬優先、fallback all、皆無 → fail-safe 文案', async () => {
    const vm = await mountView()
    expect(vm.chainTextFor('teacher', 'leave')).toContain('主管')
    expect(vm.chainTextFor('teacher', 'leave')).not.toContain('②')
    expect(vm.chainTextFor('teacher', 'overtime')).toContain('②')
    expect(vm.chainTextFor('hr', 'leave')).toContain('未設定審核鏈')
  })

  it('finalizeLeave：confirm 內容含鏈序與「跨過」；確認後送 finalize_all payload', async () => {
    const vm = await mountView()
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await vm.finalizeLeave({ id: 9, submitter_role: 'teacher' })
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('跨過'), expect.any(String), expect.any(Object))
    expect(vi.mocked(approveLeave)).toHaveBeenCalledWith(9, { approved: true, finalize_all: true })
    confirmSpy.mockRestore()
  })

  it('confirm 取消 → 不送 API', async () => {
    const vm = await mountView()
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    await vm.finalizeLeave({ id: 9, submitter_role: 'teacher' })
    expect(vi.mocked(approveLeave)).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/workbench/__tests__/WorkbenchApprovalsView.finalize.test.ts`
Expected: FAIL（`showFinalize` 等未定義）。

- [ ] **Step 3: 實作 `WorkbenchApprovalsView.vue`**

script imports 加：

```ts
import { getApprovalPolicies, type ApprovalPolicyRow } from '@/api/approvalSettings'
import { isSuperAdmin } from '@/utils/auth'
```

`onMounted(fetchAll)` 之前加：

```ts
// ── super_admin 核准整張（spec §6.2）──
// 按鈕可見性走前端 flags（isSuperAdmin），資格權威在後端（finalize_all 非 super_admin 即 403）
const showFinalize = isSuperAdmin()

const CIRCLED_DIGITS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']
const approvalPolicies = ref<ApprovalPolicyRow[]>([])

const fetchPolicies = async () => {
  try {
    const res = await getApprovalPolicies()
    approvalPolicies.value = res.data
  } catch {
    approvalPolicies.value = [] // 拿不到鏈資訊不阻擋終核，confirm 顯示降級文案
  }
}

// doc_type 專屬優先、fallback all（對齊後端政策查詢優先序，spec §4.1 M6）
const chainTextFor = (submitterRole: string, docType: string): string => {
  const find = (dt: string) =>
    approvalPolicies.value.find((p) => p.submitter_role === submitterRole && p.doc_type === dt && p.is_active)
  const policy = find(docType) ?? find('all')
  if (!policy) {
    return approvalPolicies.value.length === 0
      ? '（無法取得審核鏈資訊）'
      : '未設定審核鏈（fail-safe：僅超級管理員可核准）'
  }
  return policy.approver_roles
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r, i) => `${CIRCLED_DIGITS[i] || `${i + 1}.`}${formatSubmitterRole(r)}`)
    .join(' → ')
}

const confirmFinalize = async (row: Record<string, unknown>, docType: string): Promise<boolean> => {
  try {
    await ElMessageBox.confirm(
      `將以超級管理員身份跨過所有未完成關卡，直接核准整張單據（逐關補記留痕）。完整審核鏈：${chainTextFor(String(row.submitter_role ?? ''), docType)}`,
      '核准整張（終核）',
      { type: 'warning', confirmButtonText: '核准整張', cancelButtonText: '取消' },
    )
    return true
  } catch {
    return false
  }
}

const finalizeLeave = async (row: Record<string, unknown>) => {
  if (!(await confirmFinalize(row, 'leave'))) return
  await executeLeaveApproval(row.id, { approved: true, finalize_all: true }, '請假已核准（整張終核）')
}
const finalizeOvertime = async (row: Record<string, unknown>) => {
  if (!(await confirmFinalize(row, 'overtime'))) return
  await executeOvertimeApproval(row.id, { approved: true, finalize_all: true }, '加班已核准（整張終核）')
}
const finalizeCorrection = async (row: Record<string, unknown>) => {
  if (!(await confirmFinalize(row, 'punch_correction'))) return
  await executeCorrectionApproval(row.id, { approved: true, finalize_all: true }, '補打卡已核准（整張終核），考勤已更新')
}

defineExpose({ showFinalize, chainTextFor, finalizeLeave, finalizeOvertime, finalizeCorrection, fetchPolicies })
```

`onMounted(fetchAll)` 改為：

```ts
onMounted(() => {
  fetchAll()
  if (showFinalize) fetchPolicies()
})
```

（`ref` 已在 import；`formatSubmitterRole` 既有 `:64`。）

Template：三處操作欄（`:390`、`:491`、`:568` 附近的核准/駁回圓鈕旁）各加一顆，以請假為例（加在「核准」與「駁回」之間；加班/補打卡同式換 handler 與 aria-label）：

```html
            <el-button
              v-if="showFinalize"
              aria-label="核准整張請假申請"
              type="warning"
              size="small"
              circle
              title="核准整張（跨過所有未完成關卡）"
              @click="finalizeLeave(row)"
            >👑</el-button>
```

- [ ] **Step 4: 跑測試確認通過＋typecheck/lint**

Run: `npx vitest run src/views/workbench/ && npm run typecheck && npm run lint`
Expected: 全綠。

- [ ] **Step 5: Commit（path 限定）**

```bash
git status --porcelain
git add src/views/workbench/WorkbenchApprovalsView.vue src/views/workbench/__tests__/WorkbenchApprovalsView.finalize.test.ts
git commit -m "feat(workbench): super_admin 待審單「核准整張」終核按鈕（確認框列完整審核鏈）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/views/workbench/WorkbenchApprovalsView.vue src/views/workbench/__tests__/WorkbenchApprovalsView.finalize.test.ts
```

---

### Task 6: 認證路徑 flags 驅動（§6.3）

**Files:**
- Modify: `src/utils/auth.ts:243-251`（`hasPermission` 短路）＋新增 `isPortalOnlyUser`
- Modify: `src/views/LoginView.vue:9`、`:57`（登入排除改走 helper）
- Test: Create `src/utils/__tests__/portalOnlyFlags.test.ts`

**Interfaces:**
- Consumes: `PORTAL_ONLY_ROLES = ['teacher', 'parent']`（`src/constants/permissions.ts:208`，**保留不刪**——fallback 常數）；`AuthUserOut.flags: string[]`（login/refresh payload 一期起回傳，`setUserInfo` 整包存入 localStorage）。
- Produces: `isPortalOnlyUser(info: Record<string, unknown> | null | undefined): boolean`（供 LoginView 與未來呼叫端）。

**⚠ 安全語意（spec §6.3，實作時逐字對照）**：fallback 是 **OR**——`role === 'teacher' || flags 含 portal_only`，**只會更嚴不會更鬆**。三個絕不：不移除 `hasPermission` 的 `'teacher'` 字面短路（flags 缺失場景：登入前、舊 localStorage userInfo、DB 未 seed）；不動 `canAccessRoute` / `getAllowedRoutes` / `getPermissionScope` / `hasPortalPermission`（反擴散，`hasPortalPermission` 加短路會直接弄壞教師 Portal）；不刪 `PORTAL_ONLY_ROLES`。

- [ ] **Step 1: 寫失敗測試——`src/utils/__tests__/portalOnlyFlags.test.ts`（新檔）**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { hasPermission, hasPortalPermission, isPortalOnlyUser, setUserInfo } from '@/utils/auth'

describe('isPortalOnlyUser（flags 優先、PORTAL_ONLY_ROLES fallback）', () => {
  it('flags 含 portal_only 的自訂角色 → true（即使 role 不在硬編碼清單）', () => {
    expect(isPortalOnlyUser({ role: 'custom_tutor', flags: ['portal_only'] })).toBe(true)
  })

  it('flags 缺失但 role=teacher / parent → true（fallback）', () => {
    expect(isPortalOnlyUser({ role: 'teacher' })).toBe(true)
    expect(isPortalOnlyUser({ role: 'parent' })).toBe(true)
  })

  it('一般管理端角色 → false；null → false', () => {
    expect(isPortalOnlyUser({ role: 'hr', flags: [] })).toBe(false)
    expect(isPortalOnlyUser(null)).toBe(false)
  })
})

describe('hasPermission portal_only 短路（OR、只嚴不鬆）', () => {
  beforeEach(() => setUserInfo(null))

  it('teacher（無 flags 舊資料）→ false（字面 fallback 仍在）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['*'] })
    expect(hasPermission('DASHBOARD')).toBe(false)
  })

  it('portal_only flag 的自訂角色 → false（即使持有權限）', () => {
    setUserInfo({ role: 'custom_tutor', permission_names: ['DASHBOARD'], flags: ['portal_only'] })
    expect(hasPermission('DASHBOARD')).toBe(false)
  })

  it('一般角色不受影響', () => {
    setUserInfo({ role: 'hr', permission_names: ['DASHBOARD'], flags: [] })
    expect(hasPermission('DASHBOARD')).toBe(true)
  })

  it('hasPortalPermission 不受短路影響（教師 Portal 專屬權限）', () => {
    setUserInfo({ role: 'teacher', permission_names: ['PARENT_MESSAGES_WRITE'], flags: ['portal_only'] })
    expect(hasPortalPermission('PARENT_MESSAGES_WRITE')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/utils/__tests__/portalOnlyFlags.test.ts`
Expected: FAIL（`isPortalOnlyUser` 未匯出；portal_only flag 短路未實作）。

- [ ] **Step 3: 實作 `src/utils/auth.ts`**

`hasPermission` 上方加：

```ts
/** userInfo.flags 是否含 portal_only（防禦式讀取：flags 缺失/型別錯 → false）。 */
function _hasPortalOnlyFlag(info: Record<string, unknown>): boolean {
  const flags = info['flags']
  return Array.isArray(flags) && (flags as unknown[]).includes('portal_only')
}

/**
 * 使用者是否僅能走 Portal（教師 /portal、家長 parent app），不可用管理端登入。
 * 優先讀 flags 的 portal_only（一期 seed：teacher/parent；自訂 portal_only 角色亦涵蓋），
 * PORTAL_ONLY_ROLES 硬編碼保留為 flags 缺失時的 fail-safe fallback（spec §6.3）。
 */
export function isPortalOnlyUser(info: Record<string, unknown> | null | undefined): boolean {
  if (!info) return false
  return _hasPortalOnlyFlag(info) || PORTAL_ONLY_ROLES.includes(info['role'] as string)
}
```

（檔頭 import 區把 `PORTAL_ONLY_ROLES` 加進 `from '@/constants/permissions'` 的具名清單。）

`hasPermission` 的 teacher 短路（:248）改為：

```ts
  // Portal-only 角色只能存取 Portal：優先讀 flags 的 portal_only，'teacher' 字面
  // fallback 保留（登入前、舊 localStorage userInfo 無 flags、DB 未 seed）。
  // OR 語意只會更嚴不會更鬆——勿移除任一邊（移除字面 fallback = flags 缺失時教師提權）。
  if (userInfo['role'] === 'teacher' || _hasPortalOnlyFlag(userInfo)) return false
```

- [ ] **Step 4: 實作 `LoginView.vue`**

`:9` 的 import 改為：

```ts
import { isPortalOnlyUser } from '@/utils/auth'
```

（原 `import { PORTAL_ONLY_ROLES } from '@/constants/permissions'` 刪除。）`:57` 判斷改為：

```ts
    const userData = res.data as { user: { role: string; name: string; flags?: string[] }; must_change_password?: boolean }
    if (isPortalOnlyUser(userData.user)) {
```

- [ ] **Step 5: 跑測試確認通過＋全量 utils/views 掃描**

Run: `npx vitest run src/utils/__tests__/ src/views/__tests__/LoginView.test.ts && npm run typecheck && npm run lint`
Expected: 全綠（LoginView 既有測試若 mock 了 `@/utils/auth`，需在 mock 物件補 `isPortalOnlyUser`——依實際紅測修）。

- [ ] **Step 6: Commit（path 限定）**

```bash
git status --porcelain
git add src/utils/auth.ts src/views/LoginView.vue src/utils/__tests__/portalOnlyFlags.test.ts src/views/__tests__/LoginView.test.ts
git commit -m "feat(auth): 認證路徑 flags 驅動——portal_only 優先、硬編碼 fallback（OR 只嚴不鬆）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/utils/auth.ts src/views/LoginView.vue src/utils/__tests__/portalOnlyFlags.test.ts src/views/__tests__/LoginView.test.ts
```

---

### Task 7: 移除 SettingsApprovalTab 與 RoleManagerDrawer＋殘留清理

**Files:**
- Delete: `src/components/settings/SettingsApprovalTab.vue`、`src/components/settings/__tests__/SettingsApprovalTab.test.ts`
- Delete: `src/components/settings/RoleManagerDrawer.vue`、`src/components/settings/__tests__/RoleManagerDrawer.test.ts`
- Modify: `src/views/SettingsView.vue`（移除審核流程分頁）
- Modify: `src/components/settings/SettingsAccountsTab.vue`（移除 drawer 接線；「管理角色」改導頁）
- Modify: `src/views/__tests__/SettingsView.test.ts`
- Modify: `src/utils/auth.ts`＋相關測試（`shouldSendPermissionNames` 死碼清查，見 Step 4）

**Interfaces:**
- Consumes: Task 1（`/settings/roles` 路由存在）、Task 3（角色頁已能檢視/編輯審核鏈——移除唯讀分頁的前提）、Task 4（`SettingsAccountsTab` 已改用 `roles/types` 的 `RolesDefinition`，對 `RoleManagerDrawer.vue` 僅剩 default import）。
- Produces: 無（清理終點）。`getApprovalLogs`（`src/api/approvalSettings.ts`）**保留**——與本次移除無關的簽核記錄查詢。

**⚠ 風險——殘留 import**：刪檔後必須全 repo grep 兩個元件名，任何殘留 import（含測試 stub key、`vi.mock` 路徑）都會讓 vitest/vue-tsc 直接紅。Step 3 的 grep 是硬性 gate，不是建議。

- [ ] **Step 1: 改 `SettingsView.vue`**

- 刪 `import SettingsApprovalTab from '@/components/settings/SettingsApprovalTab.vue'`。
- `BASE_TABS` 改為 `['shifts', 'line', 'observability']`。
- Template 刪除 `<el-tab-pane label="審核流程設定" name="approval">...</el-tab-pane>` 整段。
- `SettingsView.test.ts`：刪 `SettingsApprovalTab` stub key；凡引用 `tab: 'approval'` 的測試改用 `'line'`；加一則：

```ts
  it('審核流程分頁已移除（?tab=approval → fallback shifts）', async () => {
    mockQuery = { tab: 'approval' }
    const w = shallowMount(SettingsView, { global: globalConfig })
    await flushPromises()
    expect(w.findComponent({ name: 'ElTabs' }).props('modelValue')).toBe('shifts')
    expect(w.find('[data-name="approval"]').exists()).toBe(false)
  })
```

- [ ] **Step 2: 改 `SettingsAccountsTab.vue`**

- 刪 `import RoleManagerDrawer from './RoleManagerDrawer.vue'`、`roleDrawerVisible`、`onRolesChanged`，與 template 的 `<RoleManagerDrawer ... />` 整段。
- script import 補 `hasPermission`（自 `@/utils/auth`，與既有 import 併行）；toolbar 的「⚙ 管理角色」按鈕改為導頁（角色管理已由 `/settings/roles` 承接）：

```html
        <el-button v-if="hasPermission('ROLES_MANAGE')" data-testid="goto-roles" @click="router.push('/settings/roles')">⚙ 管理角色</el-button>
```

（`router` 為 uiux Task 5 已引入的 `useRouter()` 實例；若測試的 vue-router mock 缺 `push`，在 mock 補 `push: vi.fn()`。）
- `SettingsAccountsTab.test.ts`：刪除對 RoleManagerDrawer 的斷言/stub（若有）；加一則按鈕導頁測試：

```ts
    it('管理角色按鈕：有 ROLES_MANAGE 才顯示，點擊導向 /settings/roles', async () => {
      // 依測試檔既有 auth mock 模式覆寫 hasPermission 回 true 後 mount，
      // 斷言 [data-testid="goto-roles"] 存在且 click 後 push 被以 '/settings/roles' 呼叫
    })
```

（上註解為意圖說明，實作時依該檔既有 `vi.mock('@/utils/auth', ...)` 具體寫出——該 mock 需保留 `isSuperAdmin`/集合運算等原始匯出，用 `importOriginal` 模式。）

- [ ] **Step 3: 刪檔＋殘留 grep（硬性 gate）**

```bash
git rm src/components/settings/SettingsApprovalTab.vue src/components/settings/__tests__/SettingsApprovalTab.test.ts src/components/settings/RoleManagerDrawer.vue src/components/settings/__tests__/RoleManagerDrawer.test.ts
grep -rn "SettingsApprovalTab\|RoleManagerDrawer" src/ tests/ || echo "殘留清查通過"
```

Expected: grep 無輸出（顯示「殘留清查通過」）。有輸出就逐處清掉。

- [ ] **Step 4: `shouldSendPermissionNames` 死碼清查**

```bash
grep -rn "shouldSendPermissionNames\|ROLES_WITHOUT_PERMISSION_UI" src/ tests/ --include="*.ts" --include="*.vue" | grep -v __tests__ | grep -v "utils/auth.ts"
```

- 無輸出（Task 4 已移除唯一 runtime caller）→ 從 `src/utils/auth.ts` 刪除 `shouldSendPermissionNames` 與 `ROLES_WITHOUT_PERMISSION_UI`，並刪除/改寫其單元測試（先 grep `shouldSendPermissionNames` 找到測試檔再處理）。
- 有輸出（仍有 runtime caller）→ **保留**函式與測試，僅在本 plan 回報中註明。

- [ ] **Step 5: 全量測試＋typecheck/lint**

Run: `npx vitest run && npm run typecheck && npm run lint`
Expected: 全綠（刪檔最容易踩到跨樹殘留，這裡必須全量跑，不可只跑 settings 目錄）。

- [ ] **Step 6: Commit（path 限定）**

```bash
git status --porcelain
git add -A src/components/settings/ src/views/SettingsView.vue src/views/__tests__/SettingsView.test.ts src/utils/auth.ts src/utils/__tests__/
git commit -m "refactor(settings): 移除 SettingsApprovalTab 與 RoleManagerDrawer——功能由角色設定頁承接

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>" -- src/components/settings/ src/views/SettingsView.vue src/views/__tests__/SettingsView.test.ts src/utils/auth.ts src/utils/__tests__/
```

---

### Task 8: 全量 gate＋瀏覽器實測

**Files:**
- 無新增修改（驗證 task；發現問題回對應 task 修、補 commit）。

**Interfaces:**
- Consumes: Task 1–7 全部產出。
- Produces: 驗證報告（回報給控制端）。

- [ ] **Step 1: 全量測試（含家長端三棵樹）**

Run: `npx vitest run`
Expected: 全綠。紅測先判歸屬：單獨重跑該檔；若疑似 pre-existing，以 `git stash` 之外的方式（如 `git log --oneline -- <test>`）核對是否本 plan 引入。

- [ ] **Step 2: typecheck ＋ lint ＋ stylelint ＋ OpenAPI drift**

```bash
npm run typecheck
npm run lint
npm run lint:css
npm run gen:api:check
```

Expected: 全綠。`gen:api:check` 紅 = 後端 schema 又動了或有人手改 `_generated/`——停下回報，不要自行 regen commit。

- [ ] **Step 3: 瀏覽器實測（dev server 已在 :5173；hash 路由；用 Playwright MCP 或回報人工清單）**

以 super_admin（admin）帳號：

1. Sidebar「系統設定」展開為 帳號設定/角色設定/一般設定 三子項；逐一點擊落在 `#/settings/accounts`、`#/settings/roles`、`#/settings`，且對應選單項高亮。
2. `#/settings?tab=accounts&view=parent` 直開 → 自動轉址 `#/settings/accounts?view=parent` 且落在家長視圖。
3. `#/settings` 一般設定只剩 輪班別/LINE/排程觀測（＋DSR 兩分頁）；無「審核流程設定」「帳號與權限」。
4. 角色頁：左欄清單含 label/code/帳號數/核心自訂 tag/👑 badge；點選切換右欄。
5. 右欄：admin 的超管 checkbox disabled＋tooltip；有帳號的角色其家長 checkbox disabled；核心角色權限區顯示唯讀提示；儲存跳確認框（含帳號數）。
6. 簽呈審核區：`all` 顯示鏈、拖拉調序（實際拖一次）、加/刪關卡、切 `請假` 無覆寫時顯示「沿用共同設定」＋建立覆寫；儲存後重新整理仍在；移除覆寫回沿用態。候選下拉無「家長」。
7. 新增自訂角色 → 出現在左欄與帳號 dialog 角色卡 → 刪除（無帳號）成功；測完清掉測試角色。
8. 帳號頁 dialog：角色卡含自訂角色、無家長卡、無進階微調；Tab 鍵可聚焦角色卡、Enter 可選取。
9. 偏離帳號（dev DB 找一個「自訂」tag 帳號；沒有就先以舊資料製造或跳過並回報）：編輯 dialog 顯示唯讀偏離摘要；「另存為自訂角色」全流程走通後，把帳號改回原角色、刪掉測試角色還原。
10. 工作台：待審單每列多一顆 👑 終核鈕；confirm 列鏈序；（dev DB 有可核單才實測終核，測完狀態不可還原則跳過實際點擊、只驗 confirm 後取消）。
11. 受限帳號（若 dev DB 有僅 SETTINGS_READ 或僅 USER_MANAGEMENT_READ 的帳號）：sidebar 子項只出現有權限者；直接打無權限 URL 被 guard 擋。沒有此類帳號則以單元測試覆蓋為準並回報。
12. Dark mode：角色頁左欄卡片/鏈編輯器/角色卡底色正常（皆用 EP 主題變數）。

- [ ] **Step 4: 回報**

整理：完成項目、全量測試輸出摘要、瀏覽器逐項結果、未盡事項（如無受限測試帳號）。**不 push**（push origin/main 會觸發 Zeabur 部署，由使用者裁定）。

---

## Self-Review 紀錄

**Spec 覆蓋核對（§7 二期清單 − uiux plan 已涵蓋者）：**
- 二期 1（路由拆分＋sidebar 二級選單）→ Task 1；一般設定 tab URL 同步為 uiux Task 1 既有，本 plan 只調整 BASE_TABS 與 redirect。§2.1 三條 ROUTE_PERMISSION_RULES ✓、§2.2 搬遷（拆檔幅度已在 SettingsAccountsView 註解與 Task 1 說明：只拆 RoleCardsGrid，理由=狀態耦合）✓。
- 二期 2（角色頁）→ Task 2（左欄清單/flag checkbox/基本資料/PermissionPicker/儲存確認/刪除保護）＋ Task 3（per doc_type 拖拉鏈/候選排除 parent/super_admin 說明列/沿用 all/死鎖提示）。§6.1 逐項對得上。
- 二期 3（帳號頁）→ 員工/家長分流與錯誤態為 uiux plan 已涵蓋；本 plan Task 4 補 dialog 簡化＋角色卡資料驅動＋鍵盤可達性＋另存自訂角色。§6.2 末項（工作台終核）→ Task 5。
- 二期 4（移除舊元件）→ Task 7（含 `updateApprovalPolicies` 死 client 處置：Task 3 確認 per doc_type upsert 契約後**重寫復用**，非移除）。
- 二期 5（§6.3 flags 驅動）→ Task 6。
- §8 前端測試要求：拖拉鏈序 payload（Task 3 test）、flag checkbox disabled（Task 2 test）、另存自訂角色流程（Task 4 test）、`?tab=` 深連結（Task 1 test）；家長分流與 fetchUsers 錯誤態測試屬 uiux plan 範圍。

**發現並修正的問題：**
1. 初稿把「角色清單＋詳情」拆成兩個 task，詳情 task 會丟棄前一 task 的右欄唯讀摘要——合併為 Task 2，審核鏈獨立成 Task 3（可獨立驗收、也是最大的新元件）。
2. `updateRole` 的 flags payload 若只送 UI 兩個 checkbox 的值，會被後端視為「移除 portal_only」而 409——已在 `buildFlags()` 保留原 portal_only 並寫入行為規格與測試。
3. 「移除 doc_type 覆寫」原設想 DELETE——後端無此端點，改為送 `is_active: false`（upsert 語意），並確認引擎對 inactive 政策會 fallback `all`。
4. 角色頁的帳號數依賴 `getUsers`（USER_MANAGEMENT_READ），僅持 ROLES_MANAGE 者會 403——全鏈路設計為 `accountCounts: null` 降級（顯示「—」、跳過前端預檢、死鎖偵測停用），後端 409/400 兜底。
5. 工作台 confirm 原想列「將跨過的關卡」——列表 API 無單據當前 stage，`stage_approved`/`chain_length` 是核准後 response 才有；降為列「完整審核鏈」並於 Task 5 行為規格中言明理由。
6. `hasPermission` 短路若直接改用 `isPortalOnlyUser`（含 parent fallback）語意仍只嚴不鬆，但為貼 spec 原文（`role==='teacher' || flags.includes('portal_only')`）改用 `_hasPortalOnlyFlag` ＋ teacher 字面，`isPortalOnlyUser` 僅供 LoginView。
7. 與 uiux plan 相容性：本 plan 不動 `SettingsAccountsTab` 的 audience/統計/loadError 區塊與 `ParentAccountsList`；`?view=` 契約因整檔搬宿主而自然保留；uiux Task 1 的 `?tab=accounts` 深連結測試在 Task 1 改寫為 redirect 斷言（該測試的原語意「可直達帳號內容」由 redirect 延續）。
8. Task 7 移除審核分頁排在角色頁（Task 2/3）之後，避免中間版本出現「無處檢視審核鏈」的空窗。

**已知開放點（不阻擋執行）：**
- `SettingsAccountsTab.test.ts` 既有測試的具體紅點清單無法在 plan 期完全枚舉（該檔隨 uiux plan 演進中），Task 4 Step 6 給的是逐條改寫原則＋新測試全文。
- 瀏覽器實測第 9/10/11 項依賴 dev DB 資料狀態，允許「跳過並回報」。
