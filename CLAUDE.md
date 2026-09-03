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

### 本地驗證範圍（lint / typecheck / test）
本地開發／改動後驗證，**只跑改動或相依範圍**，不要每次都跑全倉：
- lint：`npx eslint <改動的檔案或目錄>`（`npm run lint` = `eslint .` 是全倉，本地不建議常態跑）
- test：`npm run test -- --run <改動相關的測試檔或目錄>`（家長端改動仍要照上面「測試」段落跑滿三棵樹）
- typecheck：`vue-tsc --noEmit` 本身是全專案型別檢查，無法只測部分檔案，改動後照跑一次即可（成本遠低於全量 test/lint）

全倉 lint／全量 `npm run test -- --run`（無參數）留給 CI 或使用者明確要求「跑全部」時才做；PR 合併前 CI 的 blocking gate 仍會跑全套，本地沒必要重複跑一次全倉再等一次 CI。

### CI/CD
`.github/workflows/ci.yml`：push/PR 到 `main`、`staging`，以及 `release` 分支的相應事件時執行 audit、test、build 與 OpenAPI drift 等 gate；精確觸發條件與命令以 workflow 為準。

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

### 跨端權限與認證／權限與選單工作指針

`hasPermission` 四段比對（teacher 短路→wildcard→bare→scope-qualified 白名單）、`hasPortalPermission` 限 Portal、新增 Permission 跨端 SOP、選單樹單一來源 `src/constants/navigation/manifest.ts`、`PLATFORM_*` 三碼與總部 console 三守則，全文見 **`.claude/rules/permissions-auth.md`**（碰 `src/utils/auth.ts`／`src/constants/permissions.ts`／`navigation/**`／`router/**`／`views/platform/**` 時自動載入）。

常駐三條：① 權限檢查一律走 `@/utils/auth` 的 `hasPermission(name)`，禁止直接 `permission_names.includes` 或任何 BigInt／mask 寫法；② 新增／移除後台頁面先讀 `.agents/skills/ivy-admin-page-change/SKILL.md`（Claude 相容入口 `.claude/skills/admin-page-lifecycle`），新增／刪除權限碼先讀後端 `.agents/skills/ivy-permission-change/SKILL.md`；③ 家長端 `role='parent'` 的 `permission_names=[]`，資源存取由後端過濾。

---

### 多租戶（2026-08 起）

設計文件原在 `../multitenant-plan/`（`03-final/frontend-core.md`＋契約 `contracts.md`）——**該目錄已不在本機（2026-08-07 盤點確認）**。本檔沿用其契約代號（DEV-12／DEV-20／CT-A-06／CT-F-07 等）作為條文編號，關鍵不變式已內化為下方條文與測試守衛：**以本檔＋測試為準**，不要再花時間找原設計文件。

**灰度不變式（鐵則）**：未設 `VITE_TENANT_BASE_DOMAIN` / `VITE_TENANT_DOMAIN_MAP` 時 = **單租戶模式**，全前端行為必須與改造前逐字相同——storage key 不加前綴、API 不送 `X-Tenant-Slug`、boot 不掛遮罩。任何新程式碼都不得破壞這條。守衛：`src/utils/__tests__/tenant.spec.ts` / `tenantStorage.spec.ts` / `tenantBoot.spec.ts` 的「灰度不變式」describe 區塊。

| 要做的事 | 用什麼 |
|---|---|
| 取當前租戶 slug | `@/utils/tenant` 的 `tenantSlug()`（回 `string \| null`）。**module top-level 禁用 `requireTenantSlug()`**（會 throw，繞過 boot 遮罩變白畫面）。Host→slug 解析唯一實作＝`src/utils/tenant.ts`（`src/utils/resolveTenant.ts` 是純 re-export 相容別名，**勿在該檔加邏輯**） |
| 新的 localStorage 讀寫 | `@/utils/tenantStorage` 的 `tenantGetItem` / `tenantSetItem` / `tenantRemoveItem`，**禁止裸 `localStorage`**（`src/utils/__tests__/tenantStorageGuard.spec.ts` 會擋；`src/parent/**` 依 CT-F-07(4) 豁免） |
| 新的 HTTP 注入點 | `@/utils/tenant` 的 `tenantHeaders()` 展開進 headers。**WebSocket 顯式豁免**（瀏覽器 API 無法設 header，靠 Host + JWT claim 兩通道） |
| 新的 `caches.open()` | `tenantCacheName(base)`，並把 base 名加進 `src/utils/auth.ts::_PORTAL_USER_CACHES` |
| 總部（hq）頁的 `useCachedAsync` key | 必含 acting tenant（或走 `tenantCacheKey()`）；既有 call site 一律不改 |
| 年級/職稱/職等/薪資 key 字典 | 走 `@/composables/useTenantDictionaries`，**不要直接 import `src/constants/employee.ts` 的 `TITLE_TO_GRADE` / `POSITION_SALARY_KEY`**（已標 `@deprecated`，只是 API 失敗時的 fallback） |
| 租戶品牌／主題／文案 | 三層注入：L1＝`branding/tenants.json`（HTML head／PWA manifest 靜態 token，nginx `sub_filter`，map 由 `scripts/gen-tenant-brand-conf.mjs` 產生）；L2＝`useTenantBranding()`（`src/composables/useTenantBranding.ts`，runtime `GET /api/public/tenant-meta` 逐欄 fallback `BRANDING_DEFAULTS`）；L3＝per-tenant 靜態圖檔 `public/brand/<slug>/…`（nginx overlay，og 海報換檔要 bump 版號）。**勿新增寫死義華的品牌常數** |
| LIFF ID／LINE OA 連結 | `src/parent/services/liff.ts::resolveLiffId()`：tenant-meta 的 `liff_id`（後端來源 DB `line_configs`）優先，`VITE_LIFF_ID` 僅過渡 fallback（階段 3 刪除） |

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

後端 Pydantic 為契約唯一來源，前端型別由 `npm run gen:api` 產 `src/api/_generated/schema.d.ts`，**禁止手寫對應型別**；`ApiBody`／`ApiQuery`／`AxiosResp` helper 用法、dispatch path 不帶 `/api`、缺 `response_model=` 的過渡寫法、`gen:api:check` 漂移檢查見 **`.claude/rules/openapi-codegen.md`**（碰 `src/api/**` 時自動載入；跨 repo 流程另見 workspace `/openapi-sync`）。

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

`src/views/reports/` 各 panel 與共用 `chartSetup.ts`／`useReportPeriod.ts` 的協作範本，以及「經營分析」已於 2026-06-03 業主裁定移除（`Permission.BUSINESS_ANALYTICS` 刻意保留為孤兒）的說明，見 **`.claude/rules/reports.md`**（碰 `src/views/reports/**` 時自動載入）。

---

## 開發注意事項
- 回應語言：一律使用**繁體中文**
- 權限檢查：一律走 `@/utils/auth` 的 `hasPermission(name: string)`（**非純 `includes`**：teacher 短路 → wildcard `*` → bare includes → scope-qualified 前綴，詳見上方「跨端權限與認證」段）；**禁止**任何 `BigInt` / `mask & PERMISSION_VALUES.X` 寫法（2026-05-21 起 Permission 已改 str enum，舊 BigInt helper 已移除）。決策見 `../ivyManageSystem/docs/adr/ADR-002_permission-intflag-to-str-enum.md`。
- 升級依賴後必須跑 `node scripts/check-audit-allowlist.mjs`；這會依 CI 的同一套 allowlist 檢查完整 dependency tree（含 dev dependency）。不要另抄一份 audit 排除規則。
- **依賴版本釘選（升大版前先讀）**：`vite` 停在 7.x——vite 8 = Rolldown，不支援 `manualChunks`，升級需重寫成 `advancedChunks` 並對 baseline build 比對 chunk 產物；`vue-tsc` 停在 2.2.12——v3 對 composable + template ref 有 `noUnusedLocals` 誤報（上游 issue #1168）。

---

## 錯誤監控（Sentry）

`src/utils/sentry.ts`（`VITE_SENTRY_DSN` 缺即 no-op）：三 entry 皆接、axios 只報 ≥500／network error、PII denylist 與後端 `_PII_KEY_SUBSTRINGS` 必同步（後端 `tests/test_pii_denylist_parity.py` CI enforce）、source map 流程、勿在元件 catch 手動 `captureException`——細則見 **`.claude/rules/sentry.md`**（碰 `src/utils/sentry.ts`／`vite.config.js` 時自動載入）。
