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
`.github/workflows/ci.yml`：push/PR 到 main 時自動執行 `npm run test` + `npm run build`。

---

## 環境變數（`.env.local`，repo 根目錄）

| 變數 | 說明 |
|------|------|
| `VITE_API_BASE_URL` | 後端 API 基底路徑，未設時預設 `/api` |
| `VITE_GOOGLE_MAPS_API_KEY` | 設定後招生熱點圖改走 Google Maps；未設定維持 Leaflet + OpenStreetMap fallback。前端 key 應於 Google Console 設定 HTTP referrer 限制與只開 `Maps JavaScript API` |
| `VITE_LIFF_ID` | LINE LIFF App ID，家長入口（parent portal）需要；未設定家長端 LINE 綁定/登入流程會失效 |
| `VITE_SENTRY_DSN` | Sentry browser SDK DSN；缺值時 `src/utils/sentry.js` 完全 no-op |
| `VITE_SENTRY_ENVIRONMENT` | Sentry environment tag，預設 fallback 到 `import.meta.env.MODE` |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | trace 抽樣率（0~1，預設 0.1） |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_PROJECT` | build-time（非 VITE_）；三者齊備時 vite build 才產 hidden source map 並上傳，否則 plugin disable

---

## 架構重點

### 前端路由
使用 `createWebHashHistory`（hash 模式）。管理端與教師入口（portal）路由共用同一 `router/index.js`，以 `/portal/` 前綴區分。

### 招生模組（前端整合）
附近幼兒園詳細資料由三個來源合併，前端 composable 負責合併邏輯，**優先順序由高至低**：

| 優先 | 來源 | 提供欄位 |
|------|------|---------|
| 1 | `competitor_school` DB（後端教育部爬蟲快取） | 電話、住址、類型、核定人數、月費、裁罰 flag |
| 2 | kiang.github.io | 月費備援、裁罰詳情文字 |
| 3 | Google Places API | 名稱、座標、評分、Google Maps 連結 |

**比對流程（`composables/usePreschoolGovData.js`）：**
1. **並行查詢** Google Places 名稱 → DB（`findPreschoolFromDb`）與 kiang（`findPreschoolByName`，含 geo 距離加分）
2. **kiang 橋接**：DB 找不到時，用 kiang 的官方名稱（`p.title`）重試 DB 查詢
3. **合併**：DB 欄位展開覆蓋 kiang；月費、裁罰依上述規則決定

---

## 開發規範

### 測試（Vitest）

**哪些情境適合 TDD：**
- 純計算函式（格式化、驗證邏輯）
- Composable 的狀態邏輯

**哪些情境可以後補測試：**
- 元件渲染
- API 整合

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

---

### 程式碼品質規範

**通用：**
- 函式單一職責：超過 40 行考慮拆分
- 禁止魔法數字：常數統一定義在模組頂部
- 不重複邏輯：相同計算出現兩次就提取成函式

**前端：**
- API 呼叫統一透過 `src/api/` 下的模組，不在元件內直接 `fetch`/`axios`
- 狀態管理用 Pinia store，不在元件間傳遞複雜狀態
- 權限位元遮罩超過 32-bit（如 `FEES_WRITE = 1 << 32`）時必須用 `BigInt` 處理

---

## 重點頁面範例：經營分析

> `src/views/` 底下有 30+ 個 view（`portal/` / `salary/` / `leave/` / `activity/` / `parent-portal` 等），不一一列舉，依檔名語義即可定位。下面只記錄「跨多檔協作 + 跨權限 + 帶 composable」的代表性區塊作為新增類似功能時的範本。

### views/analytics/

經營分析頁面（路由 `/analytics`）。
- `AnalyticsView.vue` — tab 框架（招生漏斗 / 流失預警），與 `RouterView` 搭配
- `FunnelPanel.vue` — 6 階段漏斗 BarChart、no_deposit_reasons PieChart、依來源/班別切片
- `ChurnPanel.vue` — at-risk 學生列表（含嚴重度 tag、訊號 detail）、12 月流失趨勢 LineChart、原因分布 BarChart

支援 module：
- `src/api/analytics.js` — `fetchFunnel(params)`、`fetchAtRisk()`、`fetchChurnHistory(months)`
- `src/composables/useAnalyticsTimeRange.js` — 時間範圍 composable（本月/上月/本學期/上學期/本學年/自訂）

權限：`BUSINESS_ANALYTICS`（高位元 1 << 40，已加入 `src/constants/permissions.js`，sidebar `canView` 自動處理）。
依賴 `views/reports/chartSetup.js` 的 vue-chartjs 共用初始化。

---

## 開發注意事項
- 回應語言：一律使用**繁體中文**
- 權限位元運算：禁止 `mask & PERMISSION_VALUES.X` 直接寫法（≥ 1<<32 的位元會被 32-bit truncate）；改用 `@/utils/auth` 的 `hasPermission` / `permissionMaskHas` / `permissionMaskAdd` / `permissionMaskRemove` / `permissionMaskCombine`，這些 helper 內部以 BigInt 運算。
- 升級依賴後必須跑 `npm audit --production --audit-level=moderate`；CI 會 enforce。dev-only 套件的 transitive CVE（如 `vite-plugin-pwa`）需評估是否要 force 升級。

---

## 錯誤監控（Sentry）

`src/utils/sentry.js` 提供 `initSentry(app, { entry })` 與 `captureException(err, context)`。

- **啟用條件**：`VITE_SENTRY_DSN` 設定才生效；缺值時整支模組 no-op，三 entry boot 不受影響
- **三 entry 都接上**：`src/main.js`（admin）/ `src/parent/main.js` / `src/public/main.js`；每個 entry 用 `entry: 'admin'|'parent'|'public'` tag 區分
- **axios 攔截器**：`src/api/index.js` 對 `>=500` 與 network error 顯式上報；4xx（401/403/404/422 等）視為預期路徑由 UI errorHandler 處理，**不**送 Sentry
- **PII 過濾**：60+ 欄位 denylist + URL path id sanitize，與後端 `_PII_KEY_SUBSTRINGS` 對齊；新增欄位需同步前後端與測試（`tests/unit/utils/sentry.test.js`）
- **source map**：vite build 預設不產 .map（避免外洩程式結構）；需要 source map 給 Sentry 解 stack 時，在 build env 設 `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`，plugin 會用 `sourcemap: 'hidden'` 產 map → 上傳 Sentry → 從 dist 刪除
- **不要在元件 catch 內手動呼叫 `captureException`**：Vue errorHandler / global onerror / unhandledrejection 已被 SDK 自動 hook；axios 攔截器也已涵蓋。重複手動上報會雙報炸 quota
