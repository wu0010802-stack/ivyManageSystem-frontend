# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述
幼稚園考勤與薪資管理系統的前端（Vue 3 SPA），涵蓋管理端介面與教師入口（Portal）。
對應後端為獨立 repo：`ivy-backend`。

## 技術棧
- Vue 3 (Composition API), Vite, Vitest
- Element Plus, Pinia, Vue Router
- axios（API 呼叫統一透過 `src/api/` 下的模組）

---

## 開發指令

### 啟動前端（port 5173）
```bash
npm install
npm run dev
```

### 測試（Vitest）
```bash
npm run test           # 執行一次
npm run test:watch     # 監視模式（開發中使用）
npm run test:coverage  # 含覆蓋率報告
```

### CI/CD
`.github/workflows/ci.yml`：push/PR 到 main 時跑 `audit`（`npm audit`）/ `test`（含 coverage / typecheck / eslint / build）/ `openapi-drift` 三個 job，細節見下方對應章節。

---

## 環境變數（`.env.local`，repo 根目錄）

| 變數 | 說明 |
|------|------|
| `VITE_API_BASE_URL` | 後端 API 基底路徑，未設時預設 `/api` |
| `VITE_GOOGLE_MAPS_API_KEY` | 設定後招生熱點圖改走 Google Maps；未設定維持 Leaflet + OpenStreetMap fallback。前端 key 應於 Google Console 設定 HTTP referrer 限制與只開 `Maps JavaScript API` |
| `VITE_LIFF_ID` | LINE LIFF App ID。**多租戶後降為過渡 fallback**：改由 `GET /api/public/tenant-meta` 依 Host 回傳（`line_configs.liff_id`），`src/parent/services/liff.ts` 只在品牌 API 取不到時才讀這個變數。階段 3 刪除 |
| `VITE_LINE_BOT_FRIEND_URL` | 教師端 LINE Bot 加好友連結。**已改由後台「LINE 設定」提供**，此變數僅過渡期 fallback（Dockerfile 的預設值是 default tenant 的 OA，多租戶下必錯） |
| `VITE_TENANT_BASE_DOMAIN` | 多租戶 subdomain 樣板的 base domain（例 `ivy.tw` → `yihua.ivy.tw` 解出 slug）。**未設 = 單租戶模式**，全前端行為與改造前逐字相同 |
| `VITE_TENANT_DOMAIN_MAP` | 既有正式網域 → slug 的 JSON 對照（自訂網域租戶）。壞 JSON 視同未設定 |
| `VITE_TENANT_META_ENABLED` | 品牌 API 灰度開關。留空 = 跟隨上面兩者；`1` 強制開；`0` kill switch。⚠ 後端 tenant-meta 上線並通過煙霧測試後**應整個刪除**（見 `src/api/tenantMeta.ts` 的落日條件） |
| `VITE_SENTRY_DSN` | Sentry browser SDK DSN；缺值時 `src/utils/sentry.ts` 完全 no-op |
| `VITE_SENTRY_ENVIRONMENT` | Sentry environment tag，預設 fallback 到 `import.meta.env.MODE` |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | trace 抽樣率（0~1，預設 0.1） |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | build-time（非 VITE_）；三者齊備時 vite build 才產 hidden source map 並上傳，否則 plugin disable

---

## 架構重點

### 前端路由
使用 `createWebHashHistory`（hash 模式）。管理端與教師入口（portal）路由共用同一 `router/index.ts`，以 `/portal/` 前綴區分。

### 招生模組（前端整合）
⚠ **已棄用**：舊版「附近幼兒園三來源前端合併」架構（`composables/usePreschoolGovData.ts` 並行查詢 DB/kiang/Google Places 再前端合併）已下沉後端，改由 `nearby-kindergartens` API 一次回傳合併結果；`usePreschoolGovData.ts` 孤兒檔已於 2026-07-28 清理移除。現行入口為 `RecruitmentAddressHeatmap.vue` / `RecruitmentNearbySchoolList.vue` 兩支元件，直接呼叫 `recruitment.ts` 的 `getRecruitmentNearbyKindergartens`。

---

## 開發規範

### TypeScript（**全 codebase TS-only**）

`src/` 業務碼已 100% TypeScript（2026-05-19 完成 L0–L9 全遷移，spec: `docs/superpowers/specs/2026-05-18-frontend-js-to-ts-migration-design.md`）。**不允許新增 `.js` 業務檔**：

**強制規則（tsconfig + CI 已強制）：**
- `tsconfig.json` 未設 `allowJs`（TS 預設即 off）— 配合 `strict` 模式，`src/` 下新增 `.js` 會被 vue-tsc typecheck 拒絕
- `tsconfig.json` `strict: true` + `noUnusedLocals: true` + `noUnusedParameters: true`
- CI `Type check` step **blocking**（移除 `continue-on-error` 後 typecheck error 直接擋 PR）
- CI `ESLint` step **blocking**（`npm run lint` = `eslint .`，`eslint.config.js` flat config 極小集，2026-06-04 起）：強制 `@typescript-eslint/no-explicit-any` 與 `ban-ts-comment`

**新增程式碼規則：**
- **業務檔一律 `.ts`**：`src/api/<x>.ts` / `src/composables/<x>.ts` / `src/utils/<x>.ts` / `src/stores/<x>.ts` / `src/views/<x>.ts` / `src/components/<x>.ts`
- **新 SFC 一律 `<script setup lang="ts">`**：`src/**/*.vue` 全套件已 `lang="ts"`
- **禁顯式 `: any` / `as any`（ESLint `no-explicit-any` 強制、CI blocking）**：新碼用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>` 過渡。**遺留 any 以 inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 棘輪 grandfather**（2026-06-04 落地時 126 處）。`reportUnusedDisableDirectives: 'error'` 鎖死棘輪：**修掉一個 any 必須連同上方那行 disable 一起刪**，否則 unused directive 擋 CI。燃燒待辦：`grep -rn "eslint-disable-next-line @typescript-eslint/no-explicit-any" src`。裸 `@ts-ignore`/`@ts-nocheck` 被 `ban-ts-comment` 擋（用帶說明的 `@ts-expect-error`，或既有 leaflet 慣例 `eslint-disable-next-line @typescript-eslint/ban-ts-comment`）。spec: `docs/superpowers/specs/2026-06-04-frontend-eslint-no-explicit-any-design.md`
- **新增 type alias / interface 須節制**：spec 接受 pragmatic exception（同檔 3+ 處用 + inline 嚴重損 DX），但 single-use shape 應 inline
- **Vue 型別**：`defineProps<{ x: string }>()` / `defineEmits<{ change: [value: number] }>()` 用 type-based macros、`ref<T>(initial)` 顯式註型、預設值用 `withDefaults`
- **API 型別**：`src/api/*.ts` 用 `import type { ApiBody, ApiQuery, AxiosResp } from '@/api/_generated/typed'` 對應 OpenAPI schema（後端 `response_model=` 缺漏時 endpoint 回 `unknown`，可 `as Shape // TODO(ts-strict): waiting on backend response_model`）

**例外可保留 `.js`/`.mjs`**：
- 工具腳本：`vite.config.js`、`vitest.config.js`、`scripts/*.mjs`
- 測試：`tests/**/*.{test,spec}.js`（vitest 仍支援 .js test 與 .ts source 共存）

**檢驗：**
- 本地：`npm run typecheck` 必過、`npm run lint` 必過（0 error）、`npm test` 必綠
- CI：`Type check` 與 `ESLint` step 皆 blocking，PR 必過才能 merge

---

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
4. scope-qualified：`startsWith('<name>:')` → true（row-level scoping `<CODE>:own_class/all`，用 `getPermissionScope(name)` 取 scope，與後端 `resolve_grant` 對齊）。**僅對 `SCOPE_AWARE_CODES`（`src/utils/auth.ts`，13 碼白名單，需與後端 scope-aware 集合手動同步）生效**；非白名單 code 帶 scope 後綴一律 fail-closed

**教師專屬 Portal 功能**（如家園溝通收發）用 `hasPortalPermission`——跳過 teacher 短路、其餘比對相同；**僅限 Portal 端使用**，admin 端一律 `hasPermission`。

**資料來源**：
- `userInfo.permission_names: string[]`（透過 `getUserInfo()` 從 localStorage 讀；響應式於 refresh / setUserInfo 後更新）
- `null` 或 `undefined` 視為「無權限」，`hasPermission` 一律回 `false`（fail-safe）

**新增 Permission 的跨端 SOP**：
1. 後端 `utils/permissions.Permission` 加 enum 值（如 `Permission.NEW_FEATURE_READ = "NEW_FEATURE_READ"`）+ `PERMISSION_LABELS` 中文（僅供 alembic seed）
2. 前端 `src/constants/permissions.ts` 同步加常數（與後端 enum 名稱字面一致，CI 漂移將造成所有檢查 fail-safe 不通過）
3. 角色→權限映射以 **DB `roles` 表為單一來源**（`rolesdb01` 起，`GET /auth/permissions` 回傳、前端純渲染）；in-code `ROLE_TEMPLATES` 僅為無 session / DB 未 seed 時的 fallback，新權限的角色授予要落在 DB seed
4. 兩端各自補測試

**禁止**：
- `: any` 或 `as any` 處理 permission（用 `string` 即可）
- 自建 BigInt / 位元運算 helper（舊 `permissionMaskHas` / `permissionMaskAdd` 等已移除）
- 直接讀 `userInfo.permission_names.includes(...)`（繞過 wildcard 與 fail-safe）；一律走 `hasPermission`

**家長端**（`role='parent'`）：`permission_names=[]`，所有資源存取由後端 `Guardian.user_id` 過濾；前端只需依 `role` 判斷可否進 `/portal/*` 路由（詳見 `docs/spec/SPEC-003_parent-pii-retention.md`）。

---

### 權限／選單工作指針（2026-07-31 manifest 化）

- 新增/移除後台頁面、選單項或頁面權限：先跑本 repo skill `.claude/skills/admin-page-lifecycle/SKILL.md`。
- 新增/刪除權限碼（跨 repo 7 步含 seed migration）：先跑後端 `../ivyManageSystem-backend/.claude/skills/permission-code-lifecycle/SKILL.md`。
- 權限模型 mental model（三層語意/scope/守衛選擇/防線地圖）：`../ivyManageSystem-backend/docs/sop/permission-model.md`——跨 repo 權限工作先讀這份。
- 選單樹唯一事實來源 `src/constants/navigation/manifest.ts`：側邊欄、`ROUTE_PERMISSION_RULES`、權限編輯器樹皆由它衍生，勿再手寫。
- **`PLATFORM_*` 三碼（`PLATFORM_TENANTS_MANAGE` / `PLATFORM_REPORTS_VIEW` / `PLATFORM_AUDIT_VIEW`）已於 2026-08-04（4e）主屬 manifest 的「總部管理」群組**（分校管理／跨分校報表／跨分校稽核三頁；總覽與角色同步以 `sharedViews` 借道）——**不再是 `standalonePermissions` 孤兒，不要加回豁免表**。`src/constants/permissions.ts` 的 `PLATFORM_ONLY_CODES` 由後端 `tests/test_platform_admin_flag.py::TestFrontendParity` 以 regex 讀取比對，**改寫該宣告的格式（`new Set([...])` 內只放字面字串）會讓 parity 守衛靜默 skip**。
- **總部（platform）console**：頁面在 `src/views/platform/`，client 在 `src/api/platform.ts`，acting tenant 在 `src/composables/useActingTenant.ts`。三條守則：(1) acting tenant 只走 `tenant_id` 參數，**不得**新增任何 acting header（CT-A-06）；(2) 切換 acting tenant 必經 `setActingTenant()`（內含 `advanceAdminSession()`）；(3) 總部頁的 `useCachedAsync` key 一律用 `platformCacheKey()`（Host 租戶 + acting tenant 兩層），既有分校頁 call site 不動。選單可見性由 `AdminSidebar` 的雙向過濾把關（見 contracts §16 **DEV-20**）。

---

### 多租戶（2026-08 起）

設計文件：`../multitenant-plan/03-final/frontend-core.md`；契約與偏離記錄：同目錄 `contracts.md`（§16 **DEV-12** 是前端灰度不變式那條，改動前必讀）。

**灰度不變式（鐵則）**：未設 `VITE_TENANT_BASE_DOMAIN` / `VITE_TENANT_DOMAIN_MAP` 時 = **單租戶模式**，全前端行為必須與改造前逐字相同——storage key 不加前綴、API 不送 `X-Tenant-Slug`、boot 不掛遮罩。任何新程式碼都不得破壞這條。守衛：`src/utils/__tests__/tenant.spec.ts` / `tenantStorage.spec.ts` / `tenantBoot.spec.ts` 的「灰度不變式」describe 區塊。

| 要做的事 | 用什麼 |
|---|---|
| 取當前租戶 slug | `@/utils/tenant` 的 `tenantSlug()`（回 `string \| null`）。**module top-level 禁用 `requireTenantSlug()`**（會 throw，繞過 boot 遮罩變白畫面） |
| 新的 localStorage 讀寫 | `@/utils/tenantStorage` 的 `tenantGetItem` / `tenantSetItem` / `tenantRemoveItem`，**禁止裸 `localStorage`**（`src/utils/__tests__/tenantStorageGuard.spec.ts` 會擋；`src/parent/**` 依 CT-F-07(4) 豁免） |
| 新的 HTTP 注入點 | `@/utils/tenant` 的 `tenantHeaders()` 展開進 headers。**WebSocket 顯式豁免**（瀏覽器 API 無法設 header，靠 Host + JWT claim 兩通道） |
| 新的 `caches.open()` | `tenantCacheName(base)`，並把 base 名加進 `src/utils/auth.ts::_PORTAL_USER_CACHES` |
| 總部（hq）頁的 `useCachedAsync` key | 必含 acting tenant（或走 `tenantCacheKey()`）；既有 call site 一律不改 |
| 年級/職稱/職等/薪資 key 字典 | 走 `@/composables/useTenantDictionaries`，**不要直接 import `src/constants/employee.ts` 的 `TITLE_TO_GRADE` / `POSITION_SALARY_KEY`**（已標 `@deprecated`，只是 API 失敗時的 fallback） |

**dev 模擬多租戶**：`?tenant=<slug>`（僅 DEV 生效，寫進 sessionStorage 沿用）或 `VITE_DEV_TENANT_SLUG`。⚠ 家長端 localStorage 豁免 wrapper，dev 切租戶前請手動清 `parent_*` key。

---

### Datetime 與 Taipei TZ

後端 datetime 寫入契約由 `ivy-backend/docs/sop/datetime-contract.md` 統管；前端對應規範如下。

**接收後端 response**：
- 後端 ORM 既有 column 兩種類型：
  - **naive datetime**（無 tzinfo）：語意為「Asia/Taipei 牆上時間」
  - **aware datetime**（含 tzinfo）：通常為 UTC，後端序列化時帶 `+00:00` 或 `Z`
- 前端**禁止**對 naive 字串自行 `new Date()` 後當成 UTC（瀏覽器會誤判時區）；可用以下兩種做法：
  - 處理台北牆鐘字串請用既有原生工具，**不要新增 `dayjs`/`date-fns-tz` 依賴**：顯示格式化用 `src/utils/format.ts` 的 `formatDateTimeTW`/`formatTimeTW`；需要以台北時區解析/取小時（如排序、時段分桶）用 `src/utils/taipeiTime.ts` 的 `parseTaipeiDate`/`taipeiHour`
  - 若 endpoint 已被後端統一為 aware UTC，前端直接 `new Date(isoString)` 顯示即可（瀏覽器自動轉本地時區）

**送出 request body**：
- 純日期（`YYYY-MM-DD`，如請假起訖日）：直接送字串
- 帶時刻（如打卡時間）：建議送 **ISO 8601 含 `+08:00`**（明確時區），讓後端走 `utils/taipei_time` 三函數正規化；避免送 naive ISO 字串（`2026-05-28T09:00:00`，後端不知時區意圖）

**檢驗**：
- 後端 `ruff` 已啟用 `DTZ` rule 防 naive 操作；前端已於 2026-06-12（commit `c1815cc2`）補上部分等價 lint rule：`eslint.config.js` 的 `no-restricted-syntax` 擋 `toISOString().slice/split` 取日期反模式（訊息導向 `todayISO`/`dateToLocalISO`）——僅涵蓋該反模式，非後端 `DTZ` 規則的全面等價物，仍需搭配 code review
- 任何顯示「比實際晚 8 小時」的 bug，先檢查是否前端把 Asia/Taipei naive 當 UTC 解析

---

### OpenAPI codegen（跨端契約管道）

後端 FastAPI 的 Pydantic schema 是事實上的契約 single source of truth；前端 TS 型別由 codegen 自動衍生。**禁止手寫前端對應型別**（會與後端漂移）。

決策見 workspace `docs/adr/ADR-001_openapi-typescript-codegen.md`，運維手冊見 `docs/infra/INFRA-001_cross-repo-contract-sync.md`。

**跨端變更 SOP**（後端 schema 改動時）：

```bash
# 後端先行：改 router + Pydantic + pytest
cd ~/Desktop/ivy-backend
python scripts/dump_openapi.py       # 產 openapi.json（local-only，.gitignore 擋）

# 前端 codegen
cd ~/Desktop/ivy-frontend
npm run gen:api                       # 跑 openapi-typescript → src/api/_generated/schema.d.ts
# 只 commit schema.d.ts；不 commit openapi.json
```

**型別 helper**（`src/api/_generated/typed.d.ts`）：

```ts
import type { ApiBody, ApiQuery, AxiosResp, Schema } from '@/api/_generated/typed'

// Request body 型別
const body: ApiBody<'/employees', 'post'> = { ... }

// Query 型別
const params: ApiQuery<'/salaries/records', 'get'> = { year: 2026, month: 5 }

// Response 型別（注意：用 AxiosResp，因 axios wrapper 不解包 .data）
const resp: AxiosResp<'/employees', 'get'> = await api.get('/employees')
```

**重要慣例**：
- **dispatch path 不帶 `/api`**：`api.get('/employees')` 而非 `api.get('/api/employees')`；後端 `dump_openapi.py` 預設剝掉 `/api` prefix
- **`AxiosResp` 而非 `Schema`**：axios wrapper 不自動解包 `.data`，return type 必須含 `AxiosResp`；少數例外（如 `fees.ts` / `portalClassHub.ts` / `reports.ts` / `monthlyFixedCost.ts` 等內部自己解包）保留手動處理
- **缺 `response_model=` 過渡寫法**：後端 router 未標 `response_model=` 時前端會收到 `unknown`，用 `as Shape // TODO(ts-strict): waiting on backend response_model`；後端補上後型別自動下放
- **不換 `src/api/index.ts` axios wrapper**：dedupe / refresh / displayMessage / PII 過濾邏輯保留

**漂移檢查**：
- 本地：`npm run gen:api:check`（regen + porcelain check，含 untracked）
- CI：兩 repo 的 `openapi-drift` job 跑 dump + check；schema.d.ts 漂移即 fail（公開 repo 用 default `GITHUB_TOKEN`，若改 private 需建 PAT）

---

### 測試（Vitest）

**哪些情境適合 TDD：**
- 純計算函式（格式化、驗證邏輯）
- Composable 的狀態邏輯

**哪些情境可以後補測試：**
- 元件渲染
- API 整合

**家長端測試散在三個樹**：`src/parent/**/__tests__/`（co-located）、`tests/unit/parent/`（mirror）、`tests/parent/`。改家長端元件的 markup / CSS class / prop 後**必跑全三樹**：

```bash
npm run test -- --run src/parent tests/unit/parent tests/parent
```

別樹的 sibling 測試檔不在本次 diff 內，只跑自己那樹會漏紅（2026-06-24 Bento 改版兩度踩中）。滾動/查詢錨點用穩定 `data-*` 屬性，別綁會被 restyle 改掉的 CSS class。

---

### Git Commit 規範

使用 Conventional Commits 格式：

```
<type>: <簡短描述（繁體中文）>
```

| Type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修正 |
| `refactor` | 重構（不改行為） |
| `test` | 新增或修改測試 |
| `docs` | 文件更新 |
| `chore` | 維護性雜項 |

**原則：**
- 一個 commit 只做一件事
- Commit message 說明「為什麼」，程式碼本身說明「做了什麼」
- 不 commit `.env.local`、`node_modules/`、`dist/`
- **一律在 feature branch（worktree 內）上 commit，不直接 commit main**（2026-07-13 起零例外，含 docs 小修）；分支命名、worktree 用法（⚠ FE worktree 的 node_modules 問題見 memory `feedback_frontend_worktree_node_modules_symlink`）、收束方式（2026-07-20 起走 **staging 閘門 promotion**：feature→push staging 部署測試機驗證→升 main→push origin/main 上 prod）見 workspace CLAUDE.md「分支與 Worktree 規則」

---

### 程式碼品質規範

**通用：**
- 函式單一職責：超過 40 行考慮拆分
- 禁止魔法數字：常數統一定義在模組頂部
- 不重複邏輯：相同計算出現兩次就提取成函式

**前端：**
- API 呼叫統一透過 `src/api/` 下的模組，不在元件內直接 `fetch`/`axios`
- 狀態管理用 Pinia store，不在元件間傳遞複雜狀態
- 權限：用 `src/utils/auth.ts` 的 `hasPermission(name: string)`；2026-05-21 起 Permission 已改 str enum，**不再有 BigInt 需求**（見上方「跨端權限與認證」段）

---

## 重點頁面範例：報表模組

> `src/views/` 底下有 30+ 個 view（`portal/` / `salary/` / `leave/` / `activity/` 等），不一一列舉，依檔名語義即可定位；家長端為獨立 entry，見 `src/parent/views/`，非本目錄子集。下面只記錄「跨多檔協作 + 跨權限 + 帶 composable」的代表性區塊作為新增類似功能時的範本。

> ⚠ 舊版「經營分析」（`views/analytics/`、路由 `/analytics`）已於 2026-06-03（commit `4a3b4b29`）業主裁定整塊移除；`Permission.BUSINESS_ANALYTICS` 刻意保留為孤兒權限（角色管理 UI 仍列出但無對應功能），`src/composables/useAnalyticsTimeRange.ts` 孤兒檔已於 2026-07-28 清理移除。

### views/reports/

報表模組（路由 `/reports`，入口 `src/views/ReportsView.vue`）。`src/views/reports/` 下為分頁 panel：`OverviewPanel.vue`（總覽 KPI）、`AttendancePanel.vue`、`SalaryPanel.vue`、`FinanceSummaryPanel.vue`、`MonthlyPnLPanel.vue`、`MonthlyFixedCostPanel.vue` 等，共用 `chartSetup.ts`（vue-chartjs 初始化）與 `useReportPeriod.ts`（期間 composable）。

---

## 開發注意事項
- 回應語言：一律使用**繁體中文**
- 權限檢查：一律走 `@/utils/auth` 的 `hasPermission(name: string)`（**非純 `includes`**：teacher 短路 → wildcard `*` → bare includes → scope-qualified 前綴，詳見上方「跨端權限與認證」段）；**禁止**任何 `BigInt` / `mask & PERMISSION_VALUES.X` 寫法（2026-05-21 起 Permission 已改 str enum，舊 BigInt helper 已移除）。決策見 `../ivyManageSystem/docs/adr/ADR-002_permission-intflag-to-str-enum.md`。
- 升級依賴後必須跑 `npm audit --omit=dev --audit-level=moderate`（與 CI 一致）；CI 會 enforce。dev-only 套件的 transitive CVE（如 `vite-plugin-pwa`）需評估是否要 force 升級。
- **依賴版本釘選（升大版前先讀）**：`vite` 停在 7.x——vite 8 = Rolldown，不支援 `manualChunks`，升級需重寫成 `advancedChunks` 並對 baseline build 比對 chunk 產物；`vue-tsc` 停在 2.2.12——v3 對 composable + template ref 有 `noUnusedLocals` 誤報（上游 issue #1168）。

---

## 錯誤監控（Sentry）

`src/utils/sentry.ts` 提供 `initSentry(app, { entry })` 與 `captureException(err, context)`。

- **啟用條件**：`VITE_SENTRY_DSN` 設定才生效；缺值時整支模組 no-op，三 entry boot 不受影響
- **三 entry 都接上**：`src/main.ts`（admin）/ `src/parent/main.ts` / `src/public/main.ts`；每個 entry 用 `entry: 'admin'|'parent'|'public'` tag 區分
- **axios 攔截器**：`src/api/index.ts` 對 `>=500` 與 network error 顯式上報；4xx（401/403/404/422 等）視為預期路徑由 UI errorHandler 處理，**不**送 Sentry
- **PII 過濾**：55（現值，見 `PII_KEY_SUBSTRINGS`）欄位 denylist + URL path id sanitize + **query string PII 遮罩**（`?phone=0912 / ?email=x / ?id_number=A1` 等 value 自動 `[Filtered]`）+ **`event.user.id` FNV-1a hash**（擬個資去識別）；與後端 `_PII_KEY_SUBSTRINGS` 對齊。新增欄位同步前後端與測試（`tests/unit/utils/sentry.test.js`），backend 的 `tests/test_pii_denylist_parity.py` 在 CI enforce parity（讀前端 `sentry.ts` 比對 denylist + exempt list）
- **`captureException` 內部 cache `_SentryRef`**：避免每次呼叫重複 dynamic import；init 前呼叫 → no-op（不再讀 env，純看 ref 是否存在）
- **axios 攔截器使用 `sanitizeUrl(error.config?.url)` 才送 Sentry extra**：path id 去識別 + query PII 遮罩；不要直接送原始 url
- **source map**：vite build 預設不產 .map（避免外洩程式結構）；需要 source map 給 Sentry 解 stack 時，在 build env 設 `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`，plugin 會用 `sourcemap: 'hidden'` 產 map → 上傳 Sentry → 從 dist 刪除。**`postbuild` npm script 額外 `find dist -name '*.map' -delete` 兜底**，即便 Sentry upload 失敗 .map 也不會留在 dist 進 CDN
- **`sentryVitePlugin` 排在 plugins array 最末**（VitePWA 之後），避免 SW precache manifest 把 .map 收進去
- **不要在元件 catch 內手動呼叫 `captureException`**：Vue errorHandler / global onerror / unhandledrejection 已被 SDK 自動 hook；axios 攔截器也已涵蓋。重複手動上報會雙報炸 quota
