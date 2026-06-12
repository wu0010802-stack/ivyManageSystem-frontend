# Admin 後台 UI/UX 改造：全域視覺換膚 + 薪資月結流程重設計

- 日期：2026-06-12
- 狀態：設計已與使用者逐段確認
- 範圍：僅前端（ivy-frontend）；後端 API 零新增

## 1. 背景與痛點

使用者（園長/行政人員）對 Admin 後台的三個痛點：

1. **視覺老舊不美觀**：預設 Element Plus 樣式、缺乏品牌感
2. **操作效率低**：「每月結薪」實際上是一條有順序的流程（計算 → 覆核 → 調整 → 定案 → 匯出轉帳名冊），但目前被打散在 `SalaryView.vue`（1157 行）的 7 個平行 tab 與多層 dialog 之間，沒有流程引導
3. **資訊呈現不清楚**：表格擁擠、重點數字不突出、異常值（與上月差異大、手動調整過）不會自動浮出

優先優化對象：**薪資/結薪流程**。

## 2. 已確認的方向決策

| 決策點 | 結論 |
|---|---|
| 聚焦面向 | Admin 管理後台 |
| 改動深度 | 保留 Element Plus，深度美化 + 重整資訊架構（不換元件庫） |
| 視覺方向 | C・沉穩高密度：深色側欄（`#1e2a3a` 系）+ 淺色內容區 + 青藍主色（`#0284c7` 系）+ 緊湊間距，財務系統感 |
| 流程方案 | A+B 混合：月結嚮導（Stepper，可跳著點不強制線性）+ 結薪工作台（狀態卡入口） |

## 3. 整體架構（兩層）

### 3.1 第一層：全後台視覺改造

- 擴充 `src/assets/design-tokens.css`：深色側欄色板、青藍主色、語意色（成功/警告/危險）、緊湊間距與表格密度 token
  - 注意既有 spacing scale 非線性（1-6, 8, 10, 12，跳 7/9/11），新增 token 對齊既有命名
- 透過 Element Plus CSS 變數（`--el-color-primary` 等）整體換膚，**不改任何元件用法**——40+ 頁自動吃到新配色
- `AdminLayout.vue` 重做：深色側欄 + 淺色內容區、麵包屑、頁面標題列規範化
- 資訊呈現規範：金額一律 `font-variant-numeric: tabular-nums`、表格 hover/斑馬紋統一、狀態用語意色 chip

### 3.2 第二層：薪資功能資訊架構重組

從「7 個平行 tab」改為 5 個路由頁：

```
/admin/salary                ← 結薪工作台（B）：本月狀態卡、待辦、各入口
/admin/salary/settle         ← 月結嚮導（A）：5 步驟
/admin/salary/history        ← 查詢與歷史（含快照、明細回看）
/admin/salary/simulate       ← 薪資試算（人事談薪用，獨立於月結）
/admin/salary/settings       ← 設定（獎金設定、才藝老師、系統設定、薪資邏輯說明）
```

既有 8 個 panel 元件（BonusConfigPanel、ArtTeacherPayrollPanel、SystemSettingsPanel、SalaryHistoryPanel、SalarySimulatePanel、SalaryLogicPanel、SalarySnapshotDialog、SalaryBreakdown）大多直接搬家重用，不重寫。

## 4. 月結嚮導流程細節

### 4.1 月狀態推導（純前端，從 `getRecords(year, month)` 計算）

| 月狀態 | 判定 |
|---|---|
| 未計算 | 該月無 records |
| 需重算 | 任一筆 `needs_recalc = true` |
| 覆核中 | 已有 records，但未全部 `is_finalized` |
| 已定案 | 全部 `is_finalized = true` |

後端既有欄位/端點直接支撐：`SalaryRecord.is_finalized / finalized_at / finalized_by / needs_recalc`、`POST /salaries/finalize-month`、`DELETE /salaries/{id}/finalize`（退回）、`GET /salaries/{y}/{m}/transfer-roster`（僅匯出已定案）。**後端零修改。**

### 4.2 五步驟

步驟列永遠可見、可點擊跳轉（不強制線性）；已完成打勾、目前步驟高亮、未完成灰色可預覽。

1. **結算前檢查**：自動檢查該月未簽核假單/加班單/補打卡（用既有 leaves/overtimes/attendance list API 過濾 pending；實作 plan 階段逐一確認端點與查詢參數，若某類別無可用 list API，該檢查項降級為「前往該頁確認」的連結提示）；是否為節慶獎金發放月（2/6/9/12，顯示涵蓋區間）。有未簽核項目顯示警告卡 +「前往簽核」連結，**警告但不擋**（已與使用者確認）。
2. **計算**：一鍵 `calculate`；已定案月份禁用此鈕並提示「需先退回定案」；完成後自動跳步驟 3。
3. **覆核與調整**（核心）：全員表格，「需要注意的在前」排序。異常浮出規則（已確認）：
   - 與上月同欄位差異 ≥ 10% 或 ≥ $3,000（預設值為前端常數；調整值存 localStorage（per 裝置），維持後端零修改。若未來需全園共用門檻，屆時再評估後端設定）
   - 有 `manual_overrides` 標記
   - 本月新進/離職
   每列可展開三區明細（重用 SalaryBreakdown）；手動調整改為**列內側滑面板**（取代全螢幕 dialog），原因必填 + 樂觀鎖 version。
4. **定案**：摘要（總應發、人數、異常已確認數）→「整月定案」呼叫 `finalize-month`；個別退回 `unfinalize`（需理由）。
5. **匯出轉帳**：`transfer-roster` 匯出；完成後工作台狀態卡顯示「本月完成 ✓」。

### 4.3 工作台（B）

狀態卡顯示目前月狀態 + 下一步動作按鈕（例「3 筆待覆核 → 繼續」），點擊深連結到嚮導對應步驟（`?step=3`）。

## 5. 元件拆分與資料流

```
views/salary/
├── SalaryHubView.vue          ← 工作台
├── SalarySettleView.vue       ← 嚮導外殼（步驟列 + ?step=N 深連結）
├── settle/
│   ├── StepPrecheck.vue
│   ├── StepCalculate.vue
│   ├── StepReview.vue         ← 覆核表格 + 異常浮出 + 列內調整側滑
│   ├── StepFinalize.vue
│   └── StepExport.vue
├── SalaryHistoryView.vue      ← 搬 SalaryHistoryPanel + SnapshotDialog
├── SalarySimulateView.vue     ← 搬 SalarySimulatePanel
└── SalarySettingsView.vue     ← 收 BonusConfig / ArtTeacher / SystemSettings / Logic
```

- 共用狀態抽 `composables/useSalarySettlement.ts`：當月 records、上月 records（差異計算）、月狀態推導、異常清單——嚮導各步驟與工作台共用，單一資料來源
- API 層零新增，全部用既有 `src/api/salary.ts`
- router 加 5 條子路由 + `ROUTE_PERMISSION_RULES` 對應條目（**必加**：default-deny 會鎖死頁面，e2e 曾抓過此坑）
- 原 `SalaryView.vue` 與 `/salary` 舊路由：拆完後移除，舊路由 redirect 到 `/admin/salary`（保留書籤相容）

## 6. 錯誤處理與邊界

- 樂觀鎖 409（並發調整同一筆）：提示「資料已被他人更新」+ 重新載入該列
- 已定案後嘗試計算/調整：按鈕禁用 + tooltip 說明（非按了才報錯）
- `needs_recalc = true`：覆核/定案步驟頂部橫幅「考勤已變動，建議重算」
- 無 `SALARY_WRITE`：嚮導唯讀模式（可看不可按）；工作台仍可看狀態
- 上月無 records（如系統首月）：差異比較欄顯示「—」，不觸發異常規則

## 7. 測試策略

- `useSalarySettlement` 狀態推導與異常規則：純邏輯 Vitest 全覆蓋（門檻邊界、空月、混合定案狀態、上月缺資料）
- 各 Step 元件：關鍵互動測試（el-drawer/el-dialog 內容用 `stubs: { teleport: true }` 慣例）
- 既有 panel 搬家後：跑完整 vitest 套件（含 `src/**/__tests__` co-located）確認零回歸
- 視覺層：`lint:tokens` + 瀏覽器走查 40+ 頁（重用既有 QA 頁面渲染清單）
- `npm run typecheck` 零錯誤（TS-only、禁 any 慣例照舊）

## 8. 不做的事（YAGNI）

- 不換元件庫、不引入新 UI 依賴
- 不動後端（無新端點、無 schema 異動、無 migration）
- 不動教師 Portal 與家長端 LIFF
- 異常規則不做機器學習/複雜統計，只做門檻比較
- 暗色模式（內容區）不在本次範圍

## 9. 風險與緩解

| 風險 | 緩解 |
|---|---|
| 全域換膚影響 40+ 頁，可能有頁面樣式跑版 | 以 EP CSS 變數為主、避免覆寫元件內部 class；分階段走查 |
| `SalaryView.vue` 拆分量大（1157 行 + 8 panel） | panel 元件原樣搬家不重寫；拆完跑完整測試套件 |
| 路由變更影響既有書籤/e2e | 舊路由 redirect；e2e spec 同步更新 |
| 與進行中的其他前端分支衝突（SalaryView 有未提交 WIP） | 實作開獨立分支自 origin/main，落地前先確認 WIP 歸屬 |

## 10. 實作順序建議（給 implementation plan）

1. 視覺層 token + EP 換膚 + AdminLayout（獨立可先上，全頁受益）
2. 薪資 IA 拆分（路由 + 搬 panel，行為不變）
3. 工作台 + 嚮導外殼 + 狀態推導 composable
4. 覆核步驟（異常浮出 + 列內調整側滑）
5. 定案/匯出步驟 + 舊路由 redirect + 收尾測試
