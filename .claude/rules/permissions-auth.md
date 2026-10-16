---
paths:
  - "src/utils/auth.ts"
  - "src/utils/__tests__/auth*"
  - "src/constants/permissions.ts"
  - "src/constants/navigation/**"
  - "src/router/**"
  - "src/components/layout/AdminSidebar.vue"
  - "src/views/platform/**"
  - "src/api/platform.ts"
  - "src/api/auth.ts"
  - "src/composables/useActingTenant.ts"
  - "src/views/**/Role*"
  - "src/views/**/Permission*"
---

# 跨端權限與認證（str enum）＋權限／選單工作指針

> 自 CLAUDE.md 拆出（2026-09-03，path-scoped rule）：在本 repo 內開 session 且碰到 `paths` 內檔案時自動載入；從 workspace session（add-dir 不觸發 path rule）或 Codex（不讀 .claude/rules）動這些檔前請先讀本檔。

### 跨端權限與認證（2026-05-21 起，str enum）

2026-05-21 後端 Permission 從 IntFlag 改 `str Enum`（spec 代號 `permtxt01`），決策見 workspace `docs/adr/ADR-002_permission-intflag-to-str-enum.md`、介面 As-Is 見 `docs/spec/SPEC-002_permission-and-auth.md`。**無 64-bit 上限、無 BigInt 需求**。

**前端使用方式（`src/utils/auth.ts`）：**

```ts
import { hasPermission } from '@/utils/auth'

// 單一檢查
if (hasPermission('SALARY_READ')) { ... }

// 多項任一（route guard / sidebar）
const allowed = ['SALARY_READ', 'SALARY_WRITE'].some(p => hasPermission(p))
```

**`hasPermission` 比對順序（非純 `includes`）**：
1. `role === 'teacher'` 短路回 `false`（教師只走 Portal；**勿移除，否則提權**）。短路條件現為 `role === 'teacher' || flags 含 portal_only`（OR 語意只會更嚴不會更鬆；flags 缺失時 `'teacher'` 字面 fallback 仍生效）
2. wildcard：`permission_names` 含 `'*'` → true
3. bare：`includes(name)` → true
4. scope-qualified：`startsWith('<name>:')` → true（row-level scoping `<CODE>:own_class/all`，用 `getPermissionScope(name)` 取 scope，與後端 `resolve_grant` 對齊）。**僅對 `SCOPE_AWARE_CODES`（`src/utils/auth.ts`，15 碼白名單，需與後端 scope-aware 集合手動同步）生效**；非白名單 code 帶 scope 後綴一律 fail-closed

**教師專屬 Portal 功能**（如家園溝通收發）用 `hasPortalPermission`——跳過 teacher 短路、其餘比對相同；**僅限 Portal 端使用**，admin 端一律 `hasPermission`。

**資料來源**：
- `userInfo.permission_names: string[]`（透過 `getUserInfo()` 從 localStorage 讀；響應式於 refresh / setUserInfo 後更新）
- `null` 或 `undefined` 視為「無權限」，`hasPermission` 一律回 `false`（fail-safe）

**新增 Permission 的跨端 SOP**：
1. 後端 `utils/permissions.Permission` 加 enum 值（如 `Permission.NEW_FEATURE_READ = "NEW_FEATURE_READ"`）+ `PERMISSION_LABELS` 中文（僅供 alembic seed）
2. 前端 `src/constants/permissions.ts` 同步加常數（與後端 enum 名稱字面一致，CI 漂移將造成所有檢查 fail-safe 不通過）
3. 角色→權限映射以 **DB `roles` 表為單一來源**（`rolesdb01` 起，`GET /auth/permissions` 回傳、前端純渲染）；runtime 不得退回 in-code `ROLE_TEMPLATES`。session 或 DB seed 缺失時必須 fail-closed 並回報錯誤，新權限的角色授予要落在 DB seed
4. 兩端各自補測試

**禁止**：
- `: any` 或 `as any` 處理 permission（用 `string` 即可）
- 自建 BigInt / 位元運算 helper（舊 `permissionMaskHas` / `permissionMaskAdd` 等已移除）
- 直接讀 `userInfo.permission_names.includes(...)`（繞過 wildcard 與 fail-safe）；一律走 `hasPermission`

**家長端**（`role='parent'`）：`permission_names=[]`，所有資源存取由後端 `Guardian.user_id` 過濾；前端只需依 `role` 判斷可否進 `/portal/*` 路由（詳見 `docs/spec/SPEC-003_parent-pii-retention.md`）。

---

### 權限／選單工作指針（2026-07-31 manifest 化）

- 新增/移除後台頁面、選單項或頁面權限：Codex 先讀本 repo skill `.agents/skills/ivy-admin-page-change/SKILL.md`。
- 新增/刪除權限碼（跨 repo 含 seed migration）：Codex 先讀後端 `../ivy-backend/.agents/skills/ivy-permission-change/SKILL.md`。
- 權限模型 mental model（三層語意/scope/守衛選擇/防線地圖）：`../ivy-backend/docs/sop/permission-model.md`——跨 repo 權限工作先讀這份。
- 選單樹唯一事實來源 `src/constants/navigation/manifest.ts`：側邊欄、`ROUTE_PERMISSION_RULES`、權限編輯器樹皆由它衍生，勿再手寫。
- **`PLATFORM_*` 三碼（`PLATFORM_TENANTS_MANAGE` / `PLATFORM_REPORTS_VIEW` / `PLATFORM_AUDIT_VIEW`）已於 2026-08-04（4e）主屬 manifest 的「總部管理」群組**（分校管理／跨分校報表／跨分校稽核三頁；總覽與角色同步以 `sharedViews` 借道）——**不再是 `standalonePermissions` 孤兒，不要加回豁免表**。`src/constants/permissions.ts` 的 `PLATFORM_ONLY_CODES` 由後端 `tests/test_platform_admin_flag.py::TestFrontendParity` 以 regex 讀取比對，**改寫該宣告的格式（`new Set([...])` 內只放字面字串）會讓 parity 守衛靜默 skip**。
- **總部（platform）console**：頁面在 `src/views/platform/`，client 在 `src/api/platform.ts`，acting tenant 在 `src/composables/useActingTenant.ts`。三條守則：(1) acting tenant 只走 `tenant_id` 參數，**不得**新增任何 acting header（CT-A-06）；(2) 切換 acting tenant 必經 `setActingTenant()`（內含 `advanceAdminSession()`）；(3) 總部頁的 `useCachedAsync` key 一律用 `platformCacheKey()`（Host 租戶 + acting tenant 兩層），既有分校頁 call site 不動。選單可見性由 `AdminSidebar` 的雙向過濾把關（見 contracts §16 **DEV-20**）。
