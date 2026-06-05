# 前端 ESLint 接上 no-explicit-any（極小集 + inline disable 棘輪）

日期：2026-06-04
狀態：已實作（branch `feat/eslint-no-explicit-any-2026-06-04-fe`，未 merge / 未 push）

## 背景與問題

CLAUDE.md（workspace §規範共通項 + frontend §TypeScript）明訂「禁 `: any` / `as any`」，但**全 codebase 沒有 ESLint config**（只有 stylelint 管 CSS、`lint:tokens`）。`tsconfig` 的 `noImplicitAny` 只擋**隱式** any，不擋顯式 `any`。因此「禁 any」一直是**靠人工自律、無工具強制**——這是 TS-strict 承諾與實際強制力之間最大的落差。系統設計審查（`.scratch/system-design-review-2026-06-04.md` 主題 A）將此列為前端 P2。

實測：`src/` 業務碼有 117 處顯式 `any`（已 grep 確認），且 codebase **早已散落 117 個 inline `// eslint-disable-next-line @typescript-eslint/no-explicit-any`**（過去某次 ESLint 嘗試的遺留，在沒有 config 時為 no-op）。

## 目標

把「禁 no-explicit-any」從自律變成 **CI 工具強制**，且：
1. 馬上落地、不改既有執行期行為（純 lint 基建 + 註解）。
2. 新增的 `any` 一律被 CI 擋下。
3. 遺留 any 以棘輪 grandfather，逐一修掉、只減不增。

非目標：開啟完整 typescript-eslint / eslint-plugin-vue recommended 規則集（會一次冒出數百個無關問題，變成大工程）。

## 設計決策

- **規則集極小**：只開兩條與 TS-strict 直接相關的規則
  - `@typescript-eslint/no-explicit-any: 'error'`
  - `@typescript-eslint/ban-ts-comment: 'error'`（`ts-expect-error` allow-with-description，對齊 CLAUDE.md `// @ts-expect-error TODO(ts-strict)` 過渡慣例；禁裸 `@ts-ignore`/`@ts-nocheck`）
  - 不開任何 recommended preset；不需 type-aware linting（no-explicit-any 是語法規則）→ lint 快、無 `parserOptions.project`。
- **Grandfather = inline disable（非 bulk-suppressions）**：原本規劃用 ESLint 9.24+ 原生 `eslint-suppressions.json` 以降低 churn，但發現 codebase **已既定使用 inline disable 慣例**（117 個既有）。改用 bulk-suppressions 會造成「117 inline + N 在獨立檔」的不一致，churn 反而更高。故回到 inline disable，與現有碼一致、greppable。
- **棘輪鎖死**：`linterOptions.reportUnusedDisableDirectives: 'error'`。修掉一個 any 卻忘了刪上方 disable → unused directive → CI 報錯逼你清掉。grep `eslint-disable-next-line @typescript-eslint/no-explicit-any` 即得完整燃燒待辦清單。
- **測試/設定/腳本豁免**：`**/__tests__/**`、`*.test.*`、`*.spec.*`、`tests/**`、`scripts/**`、`*.config.*` 不套 any 禁令（對齊 CLAUDE.md「測試可寬鬆、可 .js」）。9 個測試檔 any 不必 grandfather。
- **不掃**：`dist/`、`dist-debug/`、`src/api/_generated/`（schema.d.ts 50k 行 codegen）、`auto-imports.d.ts`、`components.d.ts`、vite timestamp 檔、`public/`。

## 實作內容

- 新增 `eslint.config.js`（flat config，ESM）。
- `package.json`：+5 devDeps（eslint ^10.4.1、@eslint/js、typescript-eslint ^8.60、eslint-plugin-vue ^10.9、globals）；新增 `"lint": "eslint ."`。
- 既有 117 個 no-explicit-any inline disable 中，**107 個有效留存**；對 ESLint 後仍未覆蓋的 **19 個 no-explicit-any** 補 inline disable（→ 共 126 個）；**1 個 leaflet `@ts-ignore`**（RecruitmentAddressHeatmap markercluster）補 `eslint-disable-next-line ban-ts-comment`，與同檔既有第一個 leaflet `@ts-ignore`（line 908）的處理一致。
- `eslint --fix` 清掉 **14 個失效的舊 disable 指令**（指向已無違規的行；其中 10 個是 no-explicit-any、4 個是其他規則的遺留），讓 baseline 乾淨。
- CI（`.github/workflows/ci.yml` test job）：typecheck 後新增 blocking 的 `npm run lint`。

## 驗收（已通過）

- `npm run lint`（`eslint .`）→ exit 0（0 error / 0 warning）。
- `npm run typecheck`（`vue-tsc --noEmit`）→ exit 0（註解插入零型別影響，無回歸）。
- 棘輪測試：新增一個 `any` → `eslint` exit 1；移除後 → exit 0。
- `package-lock.json` 經 packages-array diff 驗證：**0 個既有套件被移除**，僅 +74 個 eslint 工具鏈套件（巨大 line-diff 為 npm 重排 key 的 cosmetic noise）。

## 燃燒（後續）

`grep -rn "eslint-disable-next-line @typescript-eslint/no-explicit-any" src` 列出全部待修點（落地時 126 個 = 107 留存〔117 既有 − 10 個經 `--fix` 清掉的失效 disable〕+ 19 新補）。修掉一個 any 即刪一行 disable；`reportUnusedDisableDirectives: 'error'` 保證只減不增。

## 風險與備註

- eslint v10 需 node `^20.19 || ^22.13 || >=24`；CI `node-version: "20"` 解析為最新 20.x（≥20.19）滿足。
- 本分支從 local `main`（756016e7）切出，純前端、無 migration、未 push。
- 落地前可由 user 目視 spot-check 幾個補 disable 的點（如 `WorkbenchHighRiskView.vue`、`GuardianManager.vue`）。
