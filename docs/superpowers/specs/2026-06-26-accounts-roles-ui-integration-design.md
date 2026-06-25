# 帳號管理 × 角色管理 UI/UX 整合設計

- 日期：2026-06-26
- 範圍：**純前端**（ivy-frontend），不動後端 API、不動路由/選單
- 目標：把「系統設定」內並排的兩個 tab（帳號管理、角色管理）整合成單一「帳號與權限」頁面，並消除兩邊重複的權限挑選 UI。

---

## 1. 背景與現況

「帳號管理」與「角色管理」目前是 `SettingsView.vue` 內兩個並排 `el-tab-pane`，側邊欄只有一個入口（`/settings` → 系統設定 > 一般設定）。兩者：

- **資料來源相同**：都呼叫 `getPermissions()`（`GET /auth/permissions`），回傳 `{ permissions, groups, roles }`。
- **天生主從關係**：角色是「權限模板」，帳號選一個角色、再可微調覆寫。`帳號有效權限 = 角色預設 ± 覆寫`。
- **重複造輪子**：權限勾選 UI 有兩套實作：
  - `SettingsUsersTab.vue` 的「進階微調」：分組 checkbox + split 檢視/編輯，**不支援 scope**。
  - `SettingsPermissionsTab.vue` 的權限編輯：分組 checkbox + split + **scope radio（僅自班/全園）**。
- **不一致**：帳號覆寫無法設 scope，角色可以。後端 `permission_names`（`ARRAY(Text)`）本來就支援 `CODE:scope` 字串，所以這是純前端把能力補上。

涉及檔案（現況）：

| 檔案 | 行數 | 職責 |
|------|------|------|
| `src/views/SettingsView.vue` | 68 | tab 容器 |
| `src/components/settings/SettingsUsersTab.vue` | 761 | 帳號 CRUD + 角色卡片 + 進階微調 |
| `src/components/settings/SettingsPermissionsTab.vue` | 321 | 角色 CRUD + scope-aware 權限編輯 |
| `src/components/settings/__tests__/SettingsUsersTab.test.ts` | — | 帳號測試 |
| `src/components/settings/__tests__/SettingsPermissionsTab.test.ts` | — | 角色測試 |
| `src/components/settings/__tests__/SettingsPermissionsTab.scope.test.ts` | — | scope 行為測試 |
| `src/api/auth.ts` | — | `getUsers / getPermissions / createUser / updateUser / deleteUser / resetPassword` |
| `src/api/permissions_admin.ts` | 35 | `createRole / updateRole / deleteRole` |
| `src/utils/auth.ts` | — | 權限集合運算 + `SCOPE_AWARE_CODES` + `shouldSendPermissionNames` |

---

## 2. 決策摘要（已與 user 確認）

1. **整合形式**：帳號為主、角色為輔的**單頁**。帳號清單為主畫面，角色模板管理收進「管理角色」抽屜。
2. **權限挑選元件**：抽成共用 `PermissionPicker.vue`，**帳號覆寫也支援 scope**（修掉現有不一致）。
3. **視覺幅度**：Element Plus 基礎上精緻化（保留全站一致性，提升此頁層次/間距/狀態/空狀態）。

---

## 3. 目標元件架構

把兩個 tab 收斂成**一個 tab「帳號與權限」**，底下三個元件：

| 元件 | 職責 | 來源 |
|------|------|------|
| `SettingsAccountsTab.vue`（**新檔名**，由 `SettingsUsersTab` 演進） | 主畫面：帳號清單 + 搜尋/角色篩選 + 新增/編輯帳號 dialog + 重設密碼 + 憑證 dialog + 「管理角色」按鈕（開抽屜） | 改寫現有 |
| `PermissionPicker.vue`（**新**） | 共用權限挑選：分組 checkbox + scope radio + split 檢視/編輯 + 全選/清除。`v-model` 綁定 `permission_names: string[]` | 抽自兩邊 |
| `RoleManagerDrawer.vue`（**新**，吃掉 `SettingsPermissionsTab`） | 右側 `el-drawer`：角色清單 CRUD，權限編輯用 `PermissionPicker` | 改寫現有 |

### 資料流

```
SettingsAccountsTab
 ├─ getUsers()         → users（主表 + 角色篩選 + 角色用量統計）
 ├─ getPermissions()   → definition（{ permissions, groups, roles }），抓一次，往下傳
 ├─ <新增/編輯帳號 dialog>  → 內含角色卡片 grid + <PermissionPicker>（進階微調）
 └─ <RoleManagerDrawer :definition :users>  → 角色表 + 角色 dialog 內 <PermissionPicker>
        └─ emit('roles-changed')  → 父層重抓 getPermissions() → definition 更新 → 帳號表角色標籤/卡片即時刷新
```

- `definition` 由父層單一持有並下傳，避免三個元件各自 fetch 造成不同步。
- drawer 改動角色後 emit `roles-changed`，父層重抓 `getPermissions()`（角色 label/權限數變動會反映到帳號表的角色欄與帳號 dialog 的角色卡片）。

---

## 4. 主畫面 UX（`SettingsAccountsTab.vue`）

### 4.1 頁首列

```
┌─ 帳號與權限 ──────────────────────────────────────────┐
│ [搜尋帳號/姓名…]  [角色篩選 ▾]   [⚙ 管理角色] [+ 新增帳號] │
└───────────────────────────────────────────────────────┘
```

- **搜尋框**：即時過濾 `username` / `employee_name`（前端 filter，不打 API）。
- **角色篩選**：`el-select`，選項來自 `definition.roles`，可選「全部角色」。整合 ↔ 角色的價值：一鍵看「所有教師」。
- **`⚙ 管理角色`**：次要按鈕（`plain` / `default`），開 `RoleManagerDrawer`。
- **`+ 新增帳號`**：主要按鈕（`primary`）。

### 4.2 帳號表格（精緻化，沿用 `el-table`）

欄位維持 + 一致化：

| 欄位 | 呈現 |
|------|------|
| 帳號 `username` | 純文字 |
| 員工姓名 `employee_name` | 純文字 |
| 角色 `role` | `el-tag`（沿用 `getRoleTagType`）+ icon（沿用 `ROLE_ICONS`）+ `role_label` |
| 權限 | 維持「全部 / 預設 / 自訂」三態 tag（沿用 `isUsingRoleDefault`）；teacher 顯示 `-` |
| 狀態 `is_active` | 啟用/停用 tag |
| 最後登入 `last_login` | 格式化顯示 |
| 操作 | `編輯`（inline link）+ `⋯ 更多`（`el-dropdown`：重設密碼、刪除） |

- **操作收斂**：把 `重設密碼` / `刪除` 收進 `⋯ 更多` dropdown，降低三顆並排按鈕的雜訊；`刪除` 維持 danger 色。
- **空狀態**：`el-table` 套 `#empty` slot，搜尋無結果時顯示友善提示（含「清除篩選」捷徑）。

### 4.3 搜尋/篩選的計算

```ts
const filteredUsers = computed(() => users.value.filter(u =>
  (!roleFilter.value || u.role === roleFilter.value) &&
  (!keyword.value || `${u.username}${u.employee_name}`.includes(keyword.value.trim()))
))
```

（保持型別嚴謹：`users` row 為 `Record<string, unknown>`，取值處沿用現有 narrow 慣例。）

---

## 5. 新增 / 編輯帳號 dialog

- 維持現有 **角色卡片 grid**（`ROLE_ORDER` / `ROLE_ICONS` / `selectRoleCard`）、**偏離 badge**（`deviationCount`）、**還原預設**（`restoreDefault`）。
- 「進階微調」內部的權限勾選**換成共用 `<PermissionPicker>`**——帳號覆寫因此獲得 scope（自班/全園）。
- 送出邏輯**不變**：續用 `shouldSendPermissionNames(role, isUsingDefaultPermissions(form))`，teacher/parent 一律省略 `permission_names`（既有越權守衛，不可移除）。
- `isUsingDefaultPermissions` / `deviationCount` 與角色模板的比較**改為對 scoped key 也成立的集合比較**（見 §6.4）。

---

## 6. 共用 `PermissionPicker.vue`（最關鍵）

### 6.1 介面

```ts
// Props
modelValue: string[]            // permission_names，可含 '*' / 'CODE' / 'CODE:scope'
definition: PermissionsResponse // { permissions, groups }（roles 不需要）
disabled?: boolean              // 核心角色唯讀時為 true

// Emits
'update:modelValue': (next: string[]) => void
```

- 元件**無內部 state**，純受控（受 `modelValue` 控、改動即 emit 新陣列）。所有運算回傳新陣列，不 in-place mutate。
- `disabled=true` 時顯示唯讀提示（取代核心角色「權限不可修改」文案），不渲染可勾選控制項。

### 6.2 渲染

- 依 `definition.groups` 分組；每組：
  - `group.permissions[]` → 每個一個 `el-checkbox`，label 取 `definition.permissions[code]?.label || code`。
  - 該 code 若 `scope_options` 非空且已勾選 → 顯示 `el-radio-group`（選項 `own_class` / `all`，label 用 `SCOPE_LABELS`），`data-perm-scope="<code>"` 維持給測試錨點。
  - `group.split_permissions[]` → 每列 `模組名 + 檢視 checkbox + 編輯 checkbox`。
- 頂部 `全選` / `清除` 兩顆按鈕（`disabled` 時隱藏）。

### 6.3 行為規則（toggle / display，需 spec 寫死 + 測試）

統一同時處理 **wildcard 與 scope**：

| 動作 | 行為 |
|------|------|
| 全選 | emit `['*']` |
| 清除 | emit `[]` |
| 在 `['*']` 狀態取消某 code | 先把 `'*'` 展開成**所有 bare code**（`Object.keys(definition.permissions)`，bare = 全園，對齊後端 `resolve_grant`），再移除該 code |
| 勾選一般 code | `permissionsAdd` |
| 勾選 scope-aware code | push `CODE:own_class`（最小權限預設，沿用現役角色編輯 `togglePerm`） |
| 取消任一 code | 移除所有 `splitPermKey(k).code === code` 的項（bare 與 scoped 都清） |
| 改 scope | 把該 code 的項換成 `CODE:<scope>` |
| split 檢視/編輯 | 直接增減 `sp.read` / `sp.write`（bare） |

顯示規則：

- `isPermChecked(code)`：`modelValue` 含 `'*'` → 全部勾；否則 `some(splitPermKey(k).code === code)`。
- `currentPermScope(code)`：找到的項若 bare → 顯示 `'all'`（bare = 全園，對齊後端語意）；scoped → 該 scope；`'*'` → `'all'`。
- 沿用 `splitPermKey` 的多冒號處理（`indexOf(':')` 取首冒號後全部），與 `utils/auth.getPermissionScope` 對齊（多冒號 token fail-closed，不放寬）。

> 上述 helper（`splitPermKey` / `scopeOptionsFor` / `isPermChecked` / `currentPermScope` / `togglePerm` / `setPermScope`）目前在 `SettingsPermissionsTab.vue`，整合時**搬進 `PermissionPicker.vue`** 並補上 wildcard 分支。

### 6.4 帳號 dialog 的偏離/預設判定相容性

- `isUsingDefaultPermissions(form)` 目前用 `_arraysEqualAsSet` 比 `form.permission_names` vs `roleConfig.permissions`。scoped key 是字串，集合比較對 `'CODE:own_class'` 仍成立——**前提是角色模板與帳號覆寫對同一權限用相同 scope 表示**。
- 風險：角色模板存 bare `CODE`（= all），帳號 picker 把它顯示成 `all` 但內部仍是 bare → 集合相等，OK。但若使用者把 scope 改成 `own_class`，集合不等 → 正確判為「偏離」。✅ 符合直覺。
- `deviationCount` 的 wildcard 分支維持（`'*'` vs 顯式清單）。scoped key 走一般集合差異計數，與現行邏輯相容。
- **驗收**：補測試覆蓋「帳號 dialog 勾 scope-aware 權限 → deviation 正確 +1 / 還原預設後歸 0」。

### 6.5 與 `utils/auth.ts` 的關係

- `PermissionPicker` 以 `definition.permissions[code].scope_options` 判斷是否 scope-aware（data-driven，與現役角色編輯一致），**不**硬編 `SCOPE_AWARE_CODES`（後者由 parity 測試守前後端同步，與 UI 渲染來源解耦）。
- 不改 `utils/auth.ts` 任何函式。

---

## 7. 管理角色抽屜（`RoleManagerDrawer.vue`）

- `el-drawer`，右側滑入，寬 ~640px，`v-model:visible`。
- 內容＝現役 `SettingsPermissionsTab` 的角色表 + 角色 dialog，差異：
  - 角色表新增「**使用此角色的帳號數**」欄（從 props `users` 算 `users.filter(u => u.role === code).length`）——整合加分，讓 admin 知道刪/改角色的影響面。
  - 角色 dialog 的權限編輯改用 `<PermissionPicker :disabled="roleForm.is_core">`。
- CRUD 續用 `permissions_admin.ts`（`createRole / updateRole / deleteRole`）；核心角色不送 `permissions`、不可刪（沿用現有守衛）。
- 任一 CRUD 成功 → `await fetchDefinition()`（drawer 內自己刷新表）+ `emit('roles-changed')`（通知父層刷新帳號表）。

---

## 8. `SettingsView.vue` 異動

- 移除 `accounts` 與 `permissions` 兩個 `el-tab-pane` 與對應 import。
- 新增單一 `el-tab-pane label="帳號與權限" name="accounts"` → `<SettingsAccountsTab>`。
- 其餘 tab（shifts / approval / line / observability / dsr-requests / policy-versions）不動。
- `activeTab` 預設值維持 `'shifts'`（不變）。

---

## 9. 測試計畫

純計算/行為邏輯必補測試（符合 workspace 規範）。

| 測試檔 | 內容 |
|--------|------|
| `PermissionPicker.test.ts`（新） | 全選→`['*']`；清除→`[]`；`'*'` 取消一項→展開 bare 再移除；勾 scope-aware→`:own_class`；改 scope；split 檢視/編輯；`disabled` 唯讀渲染。**遷移** `SettingsPermissionsTab.scope.test.ts` 的 scope 案例 |
| `RoleManagerDrawer.test.ts`（新，承接 `SettingsPermissionsTab.test.ts`） | 角色表渲染（含帳號數欄）、新增/編輯/刪除流程、核心角色刪除鈕 disabled、CRUD 後 emit `roles-changed` |
| `SettingsAccountsTab.test.ts`（由 `SettingsUsersTab.test.ts` 演進） | 帳號 CRUD、搜尋/角色篩選 filter、`shouldSendPermissionNames` 省略 teacher/parent、進階微調 scope deviation、空狀態 |

- 跑法：`npm run test -- --run src/components/settings`，全綠。
- typecheck：`npm run type-check`（CLAUDE.md TS-only，禁 `: any`，scoped key 等用 `: unknown` + narrow）。
- 注意 element-plus teleport（drawer/dialog 內容 mount 到 body）→ 測試錨點用穩定 `data-*`（沿用 `data-perm-scope`、`data-role`），不靠 CSS class。

---

## 10. 不做的事（YAGNI / out of scope）

- 不動路由與側邊欄選單（維持單一 `/settings` 入口）。
- 不動後端 API、不新增 `/roles` 的權限門檻（維持現況 tab 層 `SETTINGS_READ`）。
- 不改 `utils/auth.ts`、不改 OpenAPI 契約（無 schema 變動，免 codegen）。
- 不改其他 settings tab。
- 不修「bare scope-aware 顯示 all」以外的權限語意（顯示對齊後端，不動 resolve 行為）。

---

## 11. 風險與緩解

| 風險 | 緩解 |
|------|------|
| 共用 picker 的 wildcard×scope 行為回歸 | §6.3 規則寫死 + `PermissionPicker.test.ts` 全覆蓋；遷移既有 scope 測試 |
| 帳號偏離/預設判定對 scoped key 失準 | §6.4 集合比較相容性分析 + 補 deviation 測試 |
| teacher/parent 帳號殘留 `['*']` 越權 | 不動 `shouldSendPermissionNames` 守衛（既有 P0 修補），測試覆蓋省略路徑 |
| 元件改名造成 import/測試漂移 | 一次性更新 `SettingsView.vue` import + 測試檔；跑 `src/components/settings` 全套件 |
| element-plus teleport 測試盲區 | 用 `data-*` 錨點 + `attachTo` / `body` query 慣例 |
