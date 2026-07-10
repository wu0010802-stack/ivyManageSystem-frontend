# 考核與年終模組 UI/UX 全面改版設計

日期：2026-07-10
範圍：ivy-frontend 為主，ivy-backend 一項小補強（結算 response 姓名欄位）
狀態：設計已經業主逐段確認（IA / 設計語言 / 硬傷修法三段皆核可）

## 背景與目標

考核與年終模組（`/appraisal-year-end`）由年終自動化批次 1–8 逐步長出，累積約 4,900 行 view 程式碼。業主確認四大痛點全部命中：導覽層級太深太亂、操作流程不順、資訊呈現不清楚、視覺風格粗糙；且四個使用情境（平時監看、學期末簽核、年底結算、規則與例外）皆為重點。

現況調查（2026-07-10 Explore）確認 15 條 UX 硬傷，包括：grid「展開」按鈕指向不存在的路由（404）、payout「已生成」分頁是空殼佔位文字、年終明細只顯示員工 ID、YearEndRulesPanel 深色卡片穿幫、同一組週期狀態在三處各自定義標籤等。

改版方向採「方案 A：三層全面改版」：① 資訊架構重整 ② 設計語言統一 ③ 15 條硬傷全修。

## 第 1 層：資訊架構重整

### 新導覽結構（5+1 區塊）

```
考核與年終（/appraisal-year-end，共用 shell layout：頂部模組導覽 + 麵包屑）
├─ 總覽        ← 新增，預設落地頁（工作台）
├─ 考核        當期總覽 / 歷史週期與簽核 / 活動出席 / 懲處記錄
├─ 年終        週期列表 → 明細 / 總表 / 參數設定（子路由，保留在外殼內）
│              └─ 考核年終發放（原頂層「考核年終」payout 區塊，歸入年終成為 tab）
├─ 規則設定    考核扣分規則 / 年終獎金率 / 扣分項目目錄 / 學年目標人數 / 年終規則
│              （合併原「考核管理 › 考核設定」四個子 tab 與頂層「年終規則」區塊）
└─ 例外中心    維持現狀（已是全模組品質最好的頁，含 skeleton 與深連結）
```

歸類理由：
- 原「考核年終」「年終獎金」「年終規則」三者都是年終的事卻平行並列，關係曖昧；payout 是年終發放流程的一環，歸入年終。
- 原「考核設定」藏在考核管理第 4 個 tab、「年終規則」卻在頂層，兩處設定合併為單一「規則設定」區塊。

### 路由：query 參數改真巢狀子路由

- 現況 `?section=x&tab=y&cycle=z&view=w` 全部改為真巢狀路由：
  - `/appraisal-year-end/overview`（預設 redirect 目標）
  - `/appraisal-year-end/appraisal/current | history | institution-events | disciplinary`
  - `/appraisal-year-end/appraisal/history?cycle=N&view=kanban|list`（cycle/view 維持 query，屬列表內狀態）
  - `/appraisal-year-end/year-end`（週期列表）
  - `/appraisal-year-end/year-end/cycles/:id`（明細）/ `:id/grid`（總表）/ `:id/config`（參數設定）
  - `/appraisal-year-end/year-end/payout?year=YYYY`
  - `/appraisal-year-end/rules/scoring | bonus-rates | catalog | enrollment-targets | year-end-rules`
  - `/appraisal-year-end/exceptions`
- 年終明細/總表/設定三頁不再脫離外殼：成為 shell 子路由，麵包屑顯示「年終 › 114 學年 › 總表」。
- **所有舊 URL 建 redirect 不斷鏈**：含 query 參數形式（`?section=…&tab=…`）、legacy `/appraisal-management`、`/appraisal/cycles(/:id)`、`/appraisal/settings`、`/year_end/cycles(/:id…)`、`/year-end/appraisal-payout`。例外中心深連結一併驗證（注意既知 `/year-end/` vs `/year_end/` 潛伏問題）。
- 選擇狀態一律持久化 URL：payout 的 `year`、例外中心與 config 的週期選擇補進 query（修硬傷 #15）。
- 權限模型不變、不新增 Permission 值，判斷掛 route meta 供 shell 導覽過濾：考核=APPRAISAL_READ、年終=YEAR_END_READ、payout=APPRAISAL_FINALIZE、例外=APPRAISAL_READ∨YEAR_END_READ。**規則設定區塊按子頁各自判**（考核扣分規則/獎金率/目錄/學年目標=APPRAISAL_READ，對齊其實際呼叫的 appraisal API；年終規則=SETTINGS_READ），區塊本身「任一子頁可見即顯示」，避免「看得到分頁卻 API 403」（頂層現有註解記載過的既往 bug 類型）。

### 總覽工作台（新首頁）

用既有 API 組裝，**不新增後端端點**（YAGNI）：

| 卡片 | 資料來源 | 內容 | CTA |
|------|---------|------|-----|
| 當期考核 | `getAppraisalCurrentCycle` + `getSignStatusSummary` | 學期名/狀態 tag、簽核進度條（草稿/主管簽/會計簽/已核定 counts） | 前往簽核 |
| 年終結算 | `listYearEndCycles`（最新週期）+ `getYearEndGrid`（counts） | 學年/狀態 tag、試算完成與否、待簽核筆數 | 前往總表 / 轉帳清冊 |
| 例外待辦 | `getAppraisalCycleExceptions` + `getYearEndCycleExceptions` | 兩側例外計數（severity 彙總） | 前往處理 |
| 考核年終發放 | `previewAppraisalPayout`（輕量，僅在 FINALIZE 權限時載） | 本年可發放筆數/合計 | 前往發放 |

- 卡片依權限顯示；有「進行中週期」的卡片動態排前（1 月年終在前、學期中考核在前）。
- 各卡獨立載入、獨立 skeleton、獨立錯誤降級（單卡失敗顯示重試，不拖垮整頁）。

## 第 2 層：設計語言統一

原則：**不發明新設計系統，收斂到既有共用件**（`PageHeader`、`StatCard`、`EmptyState`、`TableSkeleton`、`LoadingPanel`、`AdminListToolbar`、`utils/currency.ts`、`utils/format.ts`）。

1. **狀態與標籤單一來源**：新增 `src/constants/appraisalYearEnd.ts`（跨 `views/appraisal/` 與 `views/yearEnd/` 兩目錄，放 constants 層級；既有 `views/appraisal/labels.ts` 內容併入後移除），全模組引用：
   - 週期狀態 OPEN/LOCKED/CLOSED → 開放/已鎖定/已封存 + tag type（現況三處各自定義且文案不一）。
   - 結算/summary 簽核狀態 DRAFT/SUPERVISOR_SIGNED/ACCOUNTING_SIGNED/FINALIZED → 中文 + 統一 tag 顏色（現況 grid 與 detail 兩套顏色策略）。
   - 等第 OUTSTANDING… → 優/甲/乙/丙/丁 + 統一上色（修 SummaryCard 顯示 raw code）。
   - 例外類型 code → 中文（修硬傷 #13）。
2. **格式統一**：金額走 `utils/currency.ts`（NT$ 千分位整數）；時間走 `format.ts` `formatTimeTW`；百分比新增單一 `fmtPct(value, { isRatio })`（一位小數，顯式區分 ratio×100 與已是百分比的值，取代 `pctNum`/`pctRatio` 雙軌與各處 `.toFixed(1)`/`.toFixed(2)` 不一）。修 AppraisalPayoutView 大金額無千分位。
3. **版面統一**：頁首用共用 `PageHeader`（掛麵包屑）；工具列對齊 `AdminListToolbar` 慣例；KPI 用 `StatCard`；loading 用 `TableSkeleton`/skeleton 骨架（現只有例外中心有，其他頁切學期白閃）；空狀態用 `EmptyState`。「重新整理」「匯出」按鈕樣式統一（匯出統一 `el-button tag="a" :href`）。
4. **視覺修正**：YearEndRulesPanel 深色 `#2b303b` 卡改標準 el-card + token，並確認 html.dark 暗色模式下兩主題皆正確；全模組寫死 px/色碼改 `var(--space-*)` 與 element token。

## 第 3 層：15 條硬傷修法對照

| # | 硬傷 | 修法 |
|---|------|------|
| 1 | 年終深層跳轉脫離框架、無麵包屑 | IA 段已解：shell 子路由 + 麵包屑 |
| 2 | grid「展開」跳不存在路由（404） | 改 el-table 列內展開（expand row）就地顯示該員完整結算明細；不新增路由 |
| 3 | 表格幾乎全無排序 | ListView、年終明細三表、grid、懲處、活動出席之數值/狀態欄補 `sortable` |
| 4 | 年終明細只顯示員工 ID | 後端補姓名欄位（見後端章節），前端顯示姓名（ID 移 tooltip 或次要文字） |
| 5 | 簽核動作藏 dropdown | 看板 SummaryCard 把「當前 status 可簽的那一個動作」提為卡面主按鈕，退簽/留言/log 留 dropdown；「例外匯入 Excel」維持收在更多操作（低頻救援功能，本來就該收） |
| 6 | 無流程進度感 | 工作台進度條之外，CycleDetailPanel 與年終明細頁頂部加簽核進度列（用既有 `getSignStatusSummary` 與 grid counts）；`buildSettlements` 結果（built/skipped/unmatched）從彈一次 message 改為頁頂可展開摘要列 |
| 7 | payout「已生成」分頁空殼 | 接既有 `listAppraisalPayouts` 做真列表（員工/年度/上下學期額/合計/生成時間）；「清空本年」danger 動作移入此分頁 |
| 8 | loading 不一致、白閃 | 設計語言段已解：統一骨架屏 |
| 9 | 深色卡片穿幫 | 設計語言段已解 |
| 10 | 進頁自動重算/試算失敗靜默 | 失敗時顯示可關閉 warning banner「目前顯示 HH:mm 的舊資料，自動重算失敗」；成功維持低調時間戳 |
| 11 | 週期狀態機操作分散、封存無前置檢核 | 鎖定/封存/退回收斂到年終明細頁 header（列表頁保留檢視與跳轉）；按「封存」先查未 FINALIZED 筆數，非零則列出並阻擋 |
| 12 | 一格塞多值（遲0/早0/未0/假0/曠0） | 只顯示非零項 badge，全零顯示「—」；完整明細移 tooltip 與詳情 dialog |
| 13 | 例外類型顯示 raw code | 中文標籤入 labels 單一來源 |
| 14 | 批次簽核按鈕勾選後才出現 | 按鈕常駐、未勾選 disabled + tooltip「勾選列後可批次簽核」 |
| 15 | 年份/週期選擇不持久化 | IA 段已解：URL query 持久化 |

附帶清理（實作時順手、不擴scope）：
- `getAppraisalAggregatedStatus` 端點前端完全未引用（死碼候選），確認後移除前端 wrapper。
- ProvenanceDrawer 的 `DEDUCTION_KEYS` 寫死 4 個 key，改為渲染後端實際回傳的 keys（純前端動態化，無後端改動）。

## 後端改動（workspace 模式，僅一項）

年終結算相關 response 補姓名欄位：
- `GET /year_end/cycles/:id/settlements`（員工結算單）→ 補 `employee_name`
- 特別獎金列表 → 補 `employee_name`
- 班級經營績效（class targets）→ 補 `teacher_name`（班導/副班導）與 `classroom_name`

作法：Pydantic response schema 加欄位 + query join；補 pytest；跑 `dump_openapi.py` → `npm run gen:api` → `gen:api:check`。**不新增工作台彙總端點**（用既有 API 組裝即可，YAGNI）。

## 測試策略

- 前端：labels/formatter 純函式 Vitest；新 shell layout 與路由 redirect 回歸測試（全部舊 URL → 新 URL 對照表逐條驗，含例外中心深連結）；既有 view specs（AppraisalYearEndView.spec、yearEndAdminRouteMeta.spec、appraisalYearEndRoute.spec 等）隨結構更新；工作台卡片單卡失敗降級測試。
- 後端：姓名欄位 join 的 response schema pytest。
- 跨端：`gen:api:check` 防漂移；改完跑 cross-repo-parity-checker。
- 整合：起 start.sh（由使用者前景跑）實點一輪五大區塊 + 年終深層頁麵包屑返回。

## 實作階段建議（供 writing-plans 拆解）

1. **基座**：labels/formatter 單一來源 + shell layout + 巢狀路由 + redirect 全表（風險最集中，先立）。
2. **總覽工作台**：新首頁四卡。
3. **考核區**：當期總覽（多值欄拆解、silent-fail banner）、歷史週期（進度列、SummaryCard 主按鈕、批次常駐）。
4. **年終區**：列表瘦身、明細（BE 姓名欄位先行 + 狀態機收斂 + 封存檢核）、grid（展開列修復、進度摘要）、payout（已生成分頁接真資料）。
5. **規則設定區**：合併搬遷 + 深色卡修復。
6. **收尾**：全模組 token 化掃尾、排序補齊、死碼清理、e2e 實點。

每階段獨立可 commit、可驗證；BE 姓名欄位是第 4 階段前置，先行落地。

## 不做什麼（YAGNI）

- 不做 stepper 嚮導式流程頁（方案 C 已否決）。
- 不新增後端彙總/dashboard 端點。
- 不動權限模型、不加 Permission 值。
- 不動薪資引擎或任何計算邏輯——純呈現層改版；發現計算疑義記錄待辦不順手改（口徑變更屬 Level 2，需業主裁定）。
- 不做 org_achievement_rate 手動覆寫（現況標示「後續階段」維持）。
