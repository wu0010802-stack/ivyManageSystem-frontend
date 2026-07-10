# 報表統計（/#/reports）UI/UX 全面改版 — Design Spec

- 日期：2026-07-10
- 範圍：ivy-frontend `src/views/ReportsView.vue` + `src/views/reports/*`（純前端；不動後端計算與 API 契約）
- 狀態：設計定案（user 已核可），待實作

## 0. 決策紀錄（user 裁定）

| 決策點 | 裁定 |
|--------|------|
| 範圍 | 全面改版（含資訊架構），非只修痛點 |
| 主要使用者 | 業主/園長經營檢視為主（IA 以「儀表板→下鑽」為主軸） |
| 裝置 | 桌機最佳化；手機可讀即可（堆疊＋橫向捲動，不做卡片化重排） |
| 後端 | 以前端為主；必要時允許小幅加 BE 欄位（本設計最終未用到） |
| IA 方向 | 方向 A：儀表板式總覽＋分頁下鑽（保留 tab，不拆 sidebar 子頁、不做長卷軸） |
| KPI 口徑 | **截至目前實際發生**：KPI 主數字只加總到 cutoff 月；副行註明全年含預登錄口徑；Excel 匯出維持後端全年口徑不動 |

## 1. 背景與現況痛點

現況：6 個 tab（概況/收支彙總/月度現金收支表/固定支出登錄/出勤/薪資），2026-07-05 稽核後資料正確性已佳，但呈現層有系統性問題：

1. **未來月份「資料懸崖」**：收支趨勢線、出勤率線在資料截止月後掉到 0；月度明細 8–12 月顯示「收入 NT$0／支出 500,000／結餘 -500,000」整排紅字——把「尚未發生」畫成「巨額虧損」。
2. **MoM 錨點 bug（根因已定位）**：`financeTrend.lastMonthWithData()` 把「只有預登錄固定支出」的未來月當成「有資料」，錨點跑到 12 月 → 比較 12 月 vs 11 月（皆僅 50 萬固定支出）→ KPI 顯示「↑ 0.0% vs 上月」。
3. **KPI 口徑虛胖**：「本年總支出」含未來月預登錄固定支出（2026 年 7 月中看會多算 8–12 月共 NT$2,500,000）。
4. **圓餅圖極端傾斜**：收入分類學費占 ~95%，餅圖幾乎單色一整塊，長尾類別不可讀。
5. **出勤 tab 版面失衡**：請假趨勢圖只占左半、右半空白；班級長條的門檻配色（綠/橘/紅）無圖例；filter 提示寫「右下」但圖在右上。
6. **薪資圖編碼混亂**：長條（應發）＋三條虛線（實發/獎金/加班）交錯，無資料月與有資料月混雜難判讀。
7. **大表格可用性**：現金收支表 13 欄橫向捲動無 sticky 表頭/首欄、無當月高亮、無法快速對位。
8. 其他：tab/年度不進 URL（重整彈回概況）、`↑ 0.0%` 語意錯誤、概況 KPI 卡資訊密度低。

## 2. 共用基礎：`useReportPeriod` composable

新檔 `src/views/reports/useReportPeriod.ts`（或 `src/composables/`，實作時依既有慣例定）。**單一事實來源**，根治懸崖與錨點問題：

```ts
useReportPeriod(year: number, trend?: FinanceTrendRow[]) => {
  cutoffMonth,       // 檢視真實今年 → 當前真實月份；過去年 → 12；未來年 → 0
  lastActualMonth,   // min(cutoffMonth, lastMonthWithData(trend))：最後一個「實際發生」月
  lastCompleteMonth, // MoM 錨點：檢視今年時為 min(lastActualMonth, 當前真實月 - 1)；
                     // 過去年為 lastActualMonth。進行中的當月不做 MoM 錨點（部分月 vs 完整月會誤導）
  isCurrentYear,
}
```

- `OverviewPanel` 既有的 `cutoffMonth` 邏輯（REAL_TODAY 判斷）搬進此 composable，各 panel 統一引用。
- `lastMonthWithData` 保留於 `financeTrend.ts`（判「有任何數字」），但 MoM/圖表截斷一律改用 `useReportPeriod` 的欄位，不再直接拿 `lastMonthWithData` 當錨點。
- 圖表截斷規則：**m > cutoffMonth 的資料點一律塞 `null`**（chart.js 不畫）；今年進行中的當月照畫，但以空心點＋虛線段標示（見 §4）。

## 3. 資訊架構與導覽（ReportsView.vue）

### Tab 重組
順序與命名：**經營總覽｜收支彙總｜現金收支表｜出勤｜薪資｜固定支出登錄**

- 「概況」→「經營總覽」；「月度現金收支表」→ tab 標籤簡化為「現金收支表」（面板內主標題維持全名＋「現金收付實現制」badge）。
- 「固定支出登錄」tab label 前加登錄類 icon（如 `EditPen`），視覺區隔「閱讀報表」與「資料作業」。tab 位置移到最後。

### URL 同步
- `#/reports?tab=finance&year=2026`：`tab` 與 `year` 進 router query；tab 切換用 `router.replace`（不塞 history），年度切換同。
- 進頁時從 query 還原；query 無值 → 預設 `tab=overview`、`year=當年`。
- 無效 query 值（未知 tab、非數字年）fallback 預設值，不報錯。
- 固定支出 dirty 離開保護維持既有 `confirmLoseFixedCost` 流程，URL 還原需配合（取消時 query 不變）。

### 頁首控制列
- 左：頁標題＋「{viewer} 的報表統計」。
- 右：年度選擇器＋**「資料截至 {lastActualMonth} 月」badge**（檢視今年且 lastActualMonth ≥ 1 時顯示；過去年顯示「全年」；未來年顯示「尚無資料」）。badge 全 tab 可見。

## 4. 經營總覽（OverviewPanel 重排）

版面（桌機兩欄、手機縱向堆疊）：

```
[KPI 帶：淨現金｜總收入｜總支出｜退款]（含 MoM/YoY，副標「截至 X 月」）
┌────────────────────────────┐ ┌──────────────┐
│ 年度收支趨勢主圖（新搬入）      │ │ 異常與待辦     │
└────────────────────────────┘ └──────────────┘
[出勤摘要卡 →] [薪資摘要卡 →] [淨營收・收支比卡]
[資料說明 collapse]
```

- **KPI 帶**：
  - 主數字改「截至實際發生」口徑：前端以 `monthly_trend` 加總 `m ≤ cutoffMonth` 的 revenue/refund/expense/net；副行小字「全年含預登錄：NT$X」（僅當兩口徑不同時顯示，通常只有支出/淨現金會不同）。
  - 卡片順序調整：**淨現金放第一**（業主最關心），其次收入、支出、退款。
  - MoM 錨定 `lastCompleteMonth`；|Δ| < 0.1% 顯示灰色「— 持平」（不上紅綠、無箭頭）；YoY 同規則。
  - 卡片壓縮：icon 縮小移到 label 行內，數字字級加大（22px → 26px），MoM/YoY 兩行合併為一行兩段。
- **年度收支趨勢主圖**：自收支彙總搬一份進總覽（收入/支出/淨現金三線，退款省略降噪——彙總 tab 保留四線完整版）。線切在 cutoff；今年進行中當月的點用空心點＋前段虛線，tooltip 註「本月進行中」。點擊資料點 → 切到收支彙總 tab 並選該月。
- **異常與待辦**：邏輯不動（現有四態簽收連結、固定支出未登錄、薪資未封存），移至主圖右側窄欄；項目數 0 時顯示綠勾「目前無異常待辦」。
- **出勤摘要卡**：加權出勤率大數字＋12 月出勤率 sparkline（cutoff 截斷）；整卡可點 → 出勤 tab。
- **薪資摘要卡**：園方人事成本（員工應發＋雇主負擔＝真實支出）三數字橫排；整卡可點 → 薪資 tab。
- **淨營收・收支比卡**：兩個次要指標併一張卡。
- 「含固定支出、廠商付款；不含年終獎金（另行轉帳）」註記保留於 KPI 帶下方。
- 資料說明 collapse 保留，新增「KPI 口徑：截至實際發生月；全年口徑見副行」說明。

## 5. 收支彙總（FinanceSummaryPanel）

- **圓餅圖 → 分類條列圖（bar list）**：每類一行「色塊＋類別名＋金額（右對齊）＋占比橫條＋百分比」，按金額降冪。收入/支出兩張並排（lg 12/12，xs 24）。極端傾斜（學費 95%）下所有類別都可讀。實作用純 HTML/CSS（div 寬度百分比），不用 chart.js，可測性更好。
- 趨勢圖：四線保留（含退款），cutoff 截斷同 §2；當月進行中標示同總覽。
- KPI 列：口徑與「持平」規則同 §4（整年檢視時）；選單月時維持現行「該月數字、無 MoM」。
- **月度明細表只列到 `lastActualMonth`**；未來月不再出現 0/-500,000 假紅字。表尾一行淡色說明：「{cutoff+1}–12 月已預登錄固定支出（每月 NT$X），於現金收支表檢視」（X 由 monthly_trend 未來月 expense 推得；若未來月無預登錄則不顯示）。
- 月份下鑽 dialog、Excel 匯出（全年口徑）維持不動。

## 6. 現金收支表（MonthlyPnLPanel）

- **sticky 表頭＋sticky「項目」首欄**（CSS `position: sticky`；既有自製 table 結構上加）。
- 檢視今年時**當前月份整欄高亮**（淡底色），並於載入後將橫向捲動預設定位到當月附近；表頭加「跳到本月」小按鈕。
- `m > cutoffMonth` 的月份**整欄淡化**（`opacity`/淡灰字；數值照顯示——預登錄是真實資料），該區間的「結餘（淨現金流）」列**不上紅綠色**（中性灰），表頭月份加「（預登錄）」tooltip。
- 區段標題列（統計指標/收入/固定支出/變動支出）加底色與加粗，強化掃讀。
- 底部 pending_items 說明區保留。

## 7. 出勤（AttendancePanel）

- 版面：上排「月度出勤率趨勢」＋「各班級出勤統計」各半；下排「請假趨勢分析」**拉滿全寬**。
- 出勤率趨勢：`m > cutoffMonth` 塞 `null`（消除摔 0 懸崖；後端補密 12 月填 0 的月份若 ≤ cutoff 屬真實 0，照畫）。遲到/早退/缺卡三條輔助線統一為細實線、靠顏色區分（去掉三種虛線樣式的噪音）。
- 班級長條圖卡 header 加**門檻色圖例**：`■ ≥95%（綠）　■ 90–95%（橘）　■ <90%（紅）`。
- filter 提示修正：「此篩選只影響『各班級出勤統計』圖」，並移到該圖卡 header 下的小字。
- 月份/班級點擊下鑽 dialog 維持。

## 8. 薪資（SalaryPanel）

- 圖表編碼重整：**長條＝應發總額**＋**單一實線＝實發總額**兩個系列；「獎金合計」「加班費」自圖面移除，改進 tooltip 逐項顯示（含既有「已計入應發總額」警語）。
- 無資料月維持 `null` 空缺；卡片 header 下加小字「僅顯示已封存薪資的月份（草稿／待重算不計入）」。
- 點擊長條開 top 5 contributors dialog 維持；園方人事成本卡維持。

## 9. 固定支出登錄（MonthlyFixedCostPanel，改動最小）

- 「儲存全部」按鈕改 sticky（表格區塊捲動時仍可見）。
- 檢視今年時當前月份欄高亮（與 §6 一致的樣式 token）。
- 輸入格顯示千分位（focus 時切回純數字編輯）；dirty 保護、defaultAmount 提示行為不動。

## 10. 橫切規範

- **語意色**：收入=綠、支出=紅、退款=橘、淨現金=藍（沿用既有 token）；「持平」=灰。金額色彩僅用於語意（正負/類別），不做裝飾。
- **百分比顯示**：一位小數；`pctChange` 分母 0 回 null → 顯示替代文案，規則不變。
- **RWD**：沿用 `el-col :xs` 堆疊；表格容器 `overflow-x: auto`；不做手機卡片化。
- **Dark mode**：chart 色與新 bar list 色需在 `html.dark` 下檢查對比（chartSetup 現有色票沿用，必要時提高透明度底色）。
- **可測性**：關鍵元素保留/新增 `data-test` 屬性（KPI 值、badge、持平標記、淡化欄、bar list 列）。

## 11. 資料契約（無後端變更）

全部沿用既有端點：`/reports/dashboard`、`/reports/finance-summary`（＋detail/export）、`/reports/monthly-pnl`、`/reports/attendance/detail`、`/reports/salary/contributors`、`monthly-fixed-costs`、vendor/misc summary。cutoff、雙口徑 KPI、截斷全由前端推導。**不改任何 Pydantic schema、不觸發 OpenAPI regen。**

## 12. 測試策略（TDD）

- `useReportPeriod`：純函式單測——今年/過去年/未來年 × trend 有無資料 × 預登錄未來月存在時 lastActualMonth 不被拉到 12 月（回歸 §1-2 bug）。
- KPI 口徑：monthly_trend 含未來月預登錄 → 主數字只加到 cutoff、副行顯示全年值；兩口徑相同時副行不出現。
- 「持平」規則：|Δ|<0.1% 顯示「— 持平」灰色、無箭頭。
- URL 同步：query 還原 tab/year、無效值 fallback、tab 切換 replace 不塞 history。
- 圖表截斷：datasets 中 m>cutoff 為 null（斷言 chart data，不 mount chart.js canvas）。
- 收支明細表：未來月不渲染列＋表尾預登錄說明列的有/無。
- PnL：未來月欄 class 淡化、結餘列中性色、當月高亮欄。
- 既有 `__tests__` 全數更新跑綠；**兩棵測試樹（若有 sibling 同名測試）都要掃**。
- mock 形狀一律抄真實後端契約（見 feedback_api_wrapper_mock_shape_false_green）。

## 13. 非目標

- 不動後端彙總邏輯、不新增端點（含 KPI 口徑——前端推導）。
- 不拆 sidebar 子頁面、不做長卷軸單頁。
- 不做手機卡片化重排。
- 年終獎金撥款的表內/表外口徑維持 2026-07-09 裁定不動。
- 固定支出登錄的資料模型與儲存流程不動。

## 14. 風險與緩解

- **共用 KPI 樣式漂移**：總覽與彙總兩處 KPI 卡樣式重複 → 抽共用 `ReportKpiCard.vue` 子元件（同檔案夾），一處維護。
- **`reports/finance:${year}` 共用 cache key**：Overview/Finance/Salary 三 panel 共用，改動時不可讓任一 panel 用月參數污染年度 cache（維持現行雙軌策略）。
- **chart.js 空心點/虛線段**：用 `pointStyle`/`segment.borderDash` 實作，若 segment API 在現版本不可用則降級為「當月點特殊色＋tooltip 註記」。
- **sticky 首欄與 el-table**:PnL 為自製 table（非 el-table），sticky 可直接上；若遇 z-index 疊層問題以 scoped token 解。
