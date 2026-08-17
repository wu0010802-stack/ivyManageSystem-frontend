# AGENTS.md — Ivy Frontend（Codex）

本檔是 `ivy-frontend` 的精簡常駐指引。詳細 UI/業務不變式與歷史決策仍在 [`CLAUDE.md`](./CLAUDE.md)、`PRODUCT.md`、`DESIGN.md` 與 `docs/`；只在任務觸及該領域時讀相關章節。

## 專案定位

- Vue 3 + TypeScript + Vite + Element Plus + Pinia；Node 24。後端 sibling：`../ivy-backend`，跨端 workspace：`../ivyManageSystem`。
- `src/` 業務碼 TS-only；新 SFC 一律 `<script setup lang="ts">`。禁止新增顯式 `any`、裸 `@ts-ignore`/`@ts-nocheck` 或 `.js` 業務檔。
- dev/prod 可能含真實 PII/薪資資料。不得讀取、輸出或提交 `.env.local`、token、cookie、API response 中的真實個資。
- 回應、文件、註解與 commit message 使用繁體中文；程式識別字維持英文。

## 任務路由

- 一般/家長端變更驗證：`$ivy-frontend-verify`。
- 新增、刪除或改後台頁面/選單/路由：`$ivy-admin-page-change`。
- OpenAPI generated type：`$ivy-openapi-sync`。
- tenant storage/header/cache/branding/LIFF：`$ivy-frontend-tenant`。
- 跨端 endpoint/schema：從 workspace 使用 `$ivy-api-contract`；權限碼異動使用 workspace/backend `$ivy-permission-change`。
- 大幅 UI 重設計先讀 `PRODUCT.md`、`DESIGN.md` 與現有頁面；小修直接遵循既有 token/元件語言實作並驗證。

## 永久不變式

- API 呼叫只放 `src/api/*.ts`，不得在元件直接 `fetch`/`axios`；既有 axios wrapper 的 dedupe/refresh/error/PII 邏輯不得被繞過。
- OpenAPI 型別使用 `ApiBody`、`ApiQuery`、`AxiosResp` 等 generated helpers；`schema.d.ts` 不手改，dispatch path 不加 `/api`。
- 權限是字串集合。Admin 只用 `hasPermission`，教師 Portal 才用 `hasPortalPermission`；不得直接 `permission_names.includes`、BigInt 或 bitmask。
- navigation/route/permission editor 的事實來源是 `src/constants/navigation/manifest.ts`；不要平行手寫第二棵選單。
- 未設 tenant env 時維持單租戶灰度行為。storage 用 `tenantStorage`、HTTP 用 `tenantHeaders()`、Cache API 用 `tenantCacheName()`，platform cache key 包含 acting tenant；不得新增 acting header。
- 品牌、LIFF、LINE OA 走 tenant-meta 與既有 fallback，不新增寫死義華的常數。
- 台北 naive datetime 使用 `formatDateTimeTW`/`formatTimeTW`/`parseTaipeiDate` 等既有 helper，不把它當 UTC；不要新增 dayjs/date-fns-tz。
- 新 PII 欄位同步 `src/utils/sentry.ts` denylist/exempt、後端 scrubber 與測試；不把未 sanitize URL/error body 送 Sentry。

## TDD 與驗證

- 純函式、composable、store 修正先寫失敗 Vitest；元件/API 整合至少補可觀察行為測試。
- 一般變更：`npm run test -- <target>` → `npm run typecheck` → `npm run lint`。
- 家長端 markup/class/prop：`npm run test -- --run src/parent tests/unit/parent tests/parent`，再依範圍跑 `npm run lint:tokens`、`npm run parent:audit`、`npm run check:a11y`。
- Shared constants/permission/tenant：跑對應 guard/parity tests；Vite/config/assets/chunk 變更加 `npm run build`。
- `npm run gen:api:check` 會先重產 `schema.d.ts` 並改工作樹，不是純讀指令。執行前確認 backend checkout 正確，執行後逐行 review generated diff。
- `npm run lint:tokens -- --update`、`npm run check:a11y -- --update` 會改 baseline；不能用來消除紅燈，除非使用者已批准行為變更且 diff 已 review。
- UI/browser 測試需要服務時，`start.sh` 由使用者在自己的終端前景啟動；agent 不啟動長駐服務。

## 高風險邊界

沒有本次明確授權時，不得 push staging/main、deploy、改外部系統、讀寫真實資料或發通知。不得用前端隱藏取代後端授權，也不得自行改 business/finance 決策。

Auth/Permission、PII、tenant、跨端契約改動在機械 gate 綠後交 `ivy_cross_repo_reviewer` 嘗試反駁。

## Git 與交付

- 共用 checkout 留在 `main`；需要 branch 用 worktree。保留使用者與平行 session 的所有改動，不 switch/checkout、不用共享 stash。
- 不用 `git add .`/`-A`、`commit -a`；只 stage 明確 path。未經要求不 commit，絕不直接 push main。
- 交付列出使用者可見行為、檔案、實際 test/typecheck/lint/build 結果、未跑原因、截圖/browser 證據（若適用）與剩餘風險。
