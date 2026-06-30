# vite-8 生態升級（聚合迁移）設計

- 日期：2026-06-30
- 範圍：前端 `ivy-frontend`
- 緣由：清掉 3 個卡在 peer 衝突的 dependabot backlog PR（#50 vue-core、#52 ts-tooling、#58 vite），同時把前端 build/狀態/路由生態升到 vite 8 世代。

---

## 1. 背景

2026-06-30 批次清理 dependabot PR 時，前端有 3 個 PR 因 peer 衝突無法自動 merge（CI `npm error code ERESOLVE`），被列為需專案遷移的 backlog：

- **#58** `vite 5.4.21 → 8.1.0`：`@vitejs/plugin-vue@5.2.4` peer 只支援 vite `^5||^6`，擋住 vite 8。
- **#50** vue-core group：`vue-router@5.1.0` peer 要 `vite ^7||^8`，與當前 vite 5 衝突。
- **#52** ts-tooling group：`typescript@6.0.3` 與 `openapi-typescript@7.13.0`（peer 要 ts `^5.x`）衝突。

這三者本質是**同一個 vite-8 生態升級**的不同切面，必須整套處理。

## 2. 範圍

### 2.1 升級（單一聚合 PR）

| 套件 | 從 → 到 | 性質 | 備註 |
|------|--------|------|------|
| `vite` | `^5.0.11 → ^8.1.0` | major×3 | 改用 Rolldown+Oxc 打包器取代 esbuild/Rollup |
| `@vitejs/plugin-vue` | `^5.0.3 → ^6.x` | major | **手動配套**：dependabot 沒提，但 vite 8 需要它升到支援 `vite ^7||^8` 的版本 |
| `vue-router` | `^4.2.5 → ^5.1.0` | major | "boring" 過渡版，未用 unplugin-vue-router → 零代碼改動 |
| `pinia` | `^2.1.7 → ^3.0.4` | major | "boring" 過渡版，grep 確認未用被移除的 `defineStore({})` / `PiniaStorePlugin` → 零代碼改動 |
| `vue` | `^3.4.15 → ^3.5.39` | minor | 安全 |

> `vite-plugin-pwa@1.3`、`unplugin-vue-components@32`、`jsdom@29`、`sass@1.101`、`@sentry/*`、`@line/liff`、`@material/material-color-utilities`、`@types/node@22.20` 已隨 2026-06-30 聚合 PR #66 merge 進 main。

### 2.2 明確不升（記入 backlog）

| 套件 | 原本想升 | 不升理由 |
|------|---------|---------|
| `typescript` | `→ ^6.0.3` | `openapi-typescript@7.13.0` peer 要 ts `^5.x`，ts6 會 ERESOLVE。留 `^5.9.3`，待 openapi-typescript 出支援 ts6 的版本再升。 |
| `@types/node` | `→ ^26.0.1` | 運行環境是 Node 20/22（CI `node-version: "20"`、Zeabur 同級），types major 應匹配運行 major。留 `^22.x`。 |
| `vue-tsc` | `→ ^3.3.5` | vue-tsc3 對「composable 回傳 ref + template 綁定」有 `noUnusedLocals` false-positive（[language-tools#1168](https://github.com/vuejs/language-tools/issues/1168)）：本專案 9 處誤報但代碼類型正確。**vue-tsc 2.2.12 實測 typecheck 乾淨通過**，升 3 無收益只帶 workaround。留 `^2.2.12`。 |
| `@volar/typescript` | `→ 2.4.28` | 隨 vue-tsc 一併留舊。 |

> **#52 ts-tooling group 4 個更新全數暫緩**（2026-06-30 執行期決策 B）：typescript 卡 openapi-typescript@7、@types/node 卡運行環境 node 版本、vue-tsc/@volar 因 vue-tsc3 false-positive 不划算。整組待上游成熟後再評估。vite-8 生態核心（vite/plugin-vue/router/pinia/vue）不受影響、照升。

### 2.3 為何單一聚合 PR

vite8 ↔ @vitejs/plugin-vue ↔ vue-router/pinia 之間有 peer 耦合，且全部改同一份 `package-lock.json`。分階段 merge 會回到「合一個→其餘 lockfile 衝突→dependabot rebase 又漏 esbuild 平台條目」的循環（2026-06-30 backend/frontend 清理已驗證此痛點）。故一次聚合處理、本地 regen 完整 lockfile。

## 3. 執行方式

1. 從 `origin/main` 開隔離 worktree（主工作樹有 28 commit 未 push + 未提交 WIP，**不可用**）。
2. `npm install` 套用 §2.1 升級 + regen lockfile（vite8 改用 Rolldown，esbuild 不再是主 bundler，lockfile 平台條目會變動）。
3. 檢查 `vite.config.js`：
   - `build.rollupOptions` 由 vite8 兼容層自動轉 `rolldownOptions`，多數無需改。
   - 重點看 `manualChunks`（本專案有大量手動 chunk 分割：`plugin-vue:export-helper` / `vite/preload-helper` 固定到 `vue-core`、`src/utils/format.ts` 等共用工具的 chunk 歸屬，避免 admin/parent/public 三 entry 間循環依賴與 TDZ）在 Rolldown 下是否仍正確。

## 4. 驗證（完整）

依序執行，任一失敗即停下修正：

1. `npm install` 無 ERESOLVE。
2. `vue-tsc 2.2.12` typecheck 通過（實測乾淨無 error；vue-tsc 留舊版避開 #1168 false-positive，見 §2.2）。
3. `vite build` 成功（Rolldown）。
4. **人工比對三 entry（admin/parent/public）的 dist chunk 分割** vs 升級前：確認 `vue-core` / `parent-app` / `admin-core` 等關鍵 chunk 邊界沒亂、家長 bundle 沒被迫拉入 element-plus / activity-admin、無循環依賴/TDZ。
5. `vitest` 全綠（jsdom29 已升）。
6. workspace `e2e/` critical-path smoke（起 `start.sh` 兩端 + chromium）。
7. PR CI 全綠（`Tests & Build` / `OpenAPI Drift Check` / `依賴 CVE 掃描` / typecheck gate）。

## 5. 風險與回滾

- **主風險：Rolldown 的 `manualChunks` 行為差異** → chunk 分割回歸 → prod 白屏 / TDZ（`Cannot access 'X' before initialization`）。緩解＝§4.4 人工比對 + §4.6 e2e + §4.3 build 產物檢查。
- **vue-tsc 3 major**：typecheck 行為可能更嚴格 → 暴露現有 type 問題，於本 PR 一併修。
- **回滾**：單一 PR，`git revert` 即可；Zeabur build 失敗會保留舊版本、不部署壞版（前端純靜態 build、無 migration）。
- **上游卡關**：`typescript` / `@types/node` 留舊版，記入 backlog，待 `openapi-typescript` 支援 ts6 與運行環境升 node 後再評估。

## 6. 交付

1. 聚合 PR（分支 `chore/vite8-ecosystem-upgrade`），附 §4 驗證記錄。
2. CI 全綠後 merge（觸發前端 Zeabur prod 部署）。
3. dependabot 自動 close #50 #58；手動 `gh pr close #52` 並注明「整組暫緩，4 個更新全卡上游/false-positive（見 §2.2）」。
4. 清 worktree + 本地分支。

## 7. 非目標（YAGNI）

- 不升 typescript 6 / @types/node 26（§2.2）。
- 不導入 vue-router 5 的 file-based routing / data loaders（unplugin-vue-router 併入功能）——本次只做版本升級，不改路由架構。
- 不重構現有 `manualChunks` 策略——只驗證它在 Rolldown 下仍正確，除非 Rolldown 強制需要調整。
