# 經營報表 UI/UX 改版（2026-10-12）實作計畫

> 依據：審查與 mockup https://claude.ai/artifact/5hDGkYgYjCWzBcX5rcFsqD （副本 `ivyManageSystem/.scratch/reports-uiux-2026-10-12/`）。
> 使用者 2026-10-12 核可四項裁定：Q1 加月份焦點、Q2 分頁改名、Q3 固定支出登錄只留在報表、Q4 代收手續費算進支出。
> 07-10 改版（`2026-07-10-reports-ui-ux-redesign-design.md`）的地基沿用：`useReportPeriod`、tab/年度進網址、現金收支表 sticky。

## 後端（ivy-backend `feat/reports-uiux-redesign`）

- `build_finance_summary` 納入永豐代收手續費（與 `build_monthly_pnl` 同 provider），`expense_by_category` 新增 `collection_fee`；下鑽新增 `collection_fee[]`（不回傳銷帳編號）；匯出加「代收手續費明細」頁。
- 月表列名去工程用語（「費別切片」→「其中：」、「口徑切片」→「參考：」、去 SPEC 編號）；`pending_items` 改白話。「變動支出」段名對齊園方 Excel，保留。
- 測試：`tests/test_finance_summary_collection_fee_2026_10_12.py`（逐月 expense／net 與月表相等）。

## 前端共用地基（主 session 實作）

| 檔案 | 內容 |
|------|------|
| `reportFormat.ts` | `formatAmount`（無前綴千分位）、`formatSignedAmount`、`formatWan`（軸用「萬」）、`monthRangeText`（`[1,2,3,5]`→`1–3、5 月`）、`methodLabel` |
| `useReportPeriod.ts` | 新增 `monthState(period, m)`（past／current／future）、`defaultFocusMonth(period)` |
| `financeTrend.ts` | 新增 `firstMonthWithData(trend)` |
| `closeStatus.ts` | 結帳狀態矩陣（收入／固定支出／薪資 × 12 月）與摘要文字；查不到一律 `unknown` |
| `useFixedCostStatus.ts` | 固定支出已登錄月份（殼層持有，儲存後 `reload()`） |
| `trendChart.ts` | `buildMonthlyMoneyChart`（長條＋淨現金折線、無紀錄月 null、tension 0）、`monthBandsPlugin`；保留 `resolveTrendPalette`／`withAlpha`／`readCssVar` |
| `ReportsView.vue` | 年度＋月份焦點（`?month=` 進網址）、分頁改名、固定支出登錄移到分頁列右側並顯示未登錄數、匯出集中到頁首、口徑說明抽屜 |

### 分頁契約（所有 panel 一致）

- props：`year: number`、`focusMonth: number`（1–12，全模組共用的月份焦點）
- emits：`update:focusMonth`（panel 內點某月時切換焦點）、`navigate`（`{ tab: string }`，跨分頁連結）
- 殼層以 `:key="year"` 重掛 panel；**月份焦點改變不重掛**，panel 必須自己對 `focusMonth` 反應
- 匯出按鈕一律移到頁首，panel 內不再放匯出

### 分頁名稱與順序

總覽（overview）→ 收支分析（finance）→ 現金收支表（monthly-pnl）→ 人事成本（salary）→ 教職員出勤（attendance）｜右側：✎ 固定支出登錄（fixed-cost，帶未登錄月數）。tab key 不變，舊網址可用。

## 各分頁

### 總覽（OverviewPanel，主 session）
收支等式（焦點月：收入 − 退款 − 支出 ＝ 淨現金，第二行年初至今）；比較基準不完整（上月無資料或為年度首個有資料的月份）不算百分比、寫原因；淨現金比較用金額差。支出缺項（`monthExpenseGaps`）時支出旁標「不完整」並列出缺項。每月收支圖（`buildMonthlyMoneyChart`，點月切焦點）。結帳狀態矩陣＋每列動作（固定支出→切登錄分頁；薪資→薪資結算；憑證→收付款管理）。三個指標：人事成本、教職員出勤率、收支比（支出不完整時不計算）。

### 收支分析（FinanceSummaryPanel＋FinanceDetailDrawer，主 session）
範圍切換「{m} 月／1–{m} 月累計」；收入來源、支出去向（0 元類別收成一行；支出不完整時說明＋兩條出路）；每月明細表（無紀錄月份收成一行、0 不做連結、焦點月高亮、累計欄、狀態欄、合計列）。下鑽改右側抽屜：小計、只列有資料的分類、搜尋、付款方式中文、含代收手續費。

### 人事成本（SalaryPanel，subagent）
見 dispatch 規格（無封存月份＝空狀態＋各月卡在哪個狀態；有資料＝每月應發長條、未封存月 null、焦點月應發／加班前 5 名內嵌；年度累計三數字統一叫「人事成本」；錯誤狀態；hex 改 token）。

### 教職員出勤（AttendancePanel，subagent）
副標講資料來源與歸屬；每月出勤率長條（無紀錄月 null、門檻色加文字）；異常次數表；依所屬班級表（樣本不足不算百分比）；請假無資料一行字；錯誤狀態；移除班級篩選。

### 現金收支表（MonthlyPnLPanel，subagent）
預設隱藏全年為 0 的列（可展開）、整段為 0 收成一行；合計五列 sticky 表底；未來月留白、累計不延伸；無紀錄月份灰底；焦點月表頭可點；白話註腳。

### 固定支出登錄（MonthlyFixedCostPanel，subagent）
參考金額虛線斜體；每列「帶入 ▾」只填空格；月份表頭標已登錄／未登錄／預登錄；合計只算已存與編輯中、空的寫「未登錄」；底部儲存列（放棄／儲存 N 格）；儲存成功 emit `saved`。`FinanceSignoffView` 固定支出分頁：有 REPORTS 權限者改顯示「已移到經營報表」連結，沒有的照舊顯示登錄表（避免無 REPORTS 的角色失去入口）。

## 驗證
各分頁 vitest；全庫 `vue-tsc --noEmit`、eslint、`npm run build`（含 check-entry-chunks，build 後還原 `components.d.ts`）；後端報表相關 pytest；OpenAPI codegen（worktree 用絕對路徑）。
