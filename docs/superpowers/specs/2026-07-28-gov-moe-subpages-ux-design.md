# 政府申報匯出（教育部類子頁）優化設計

日期：2026-07-28
分支：`feat/gov-moe-subpages-ux`（frontend）／`feat/gov-reports-hardening`（backend，`ivy-backend-fresh`）

## 背景

「政府申報匯出」實際涵蓋兩組互不相干的後端 router：

| 區塊 | 路由 | 後端 | 狀態 |
|------|------|------|------|
| 薪資類申報 | `/gov-reports` | `api/gov_reports.py` | 2026-07-27 已優化（`feat/gov-reports-ux`，待 push staging） |
| 教育部類 | `/admin/gov-reports/*` | `api/gov_moe/*` | 本次範圍 |

本次處理教育部類 4 子頁、跨頁共用重構、以及 `gov_reports.py` 的參數驗證與測試補洞。
**不觸碰** `feat/gov-reports-ux` / `staging-merge-gov-reports`。

## 一、共用層：用既有工具，不造新輪子

`src/utils/download.ts` 的 `saveBlobResponse` 已會解析後端 `Content-Disposition`
（後端以 `filename*=UTF-8''` 組好中文檔名）。4 子頁卻各自 `createObjectURL` +
硬編前端檔名，把後端給的正確檔名丟掉。

- 4 處匯出全改呼叫 `saveBlobResponse(resp, '後備檔名.xlsx')`
- 錯誤訊息改讀 `error.displayMessage`（axios interceptor 已正規化 blob 錯誤），
  不再各自剝 `response.data.detail`
- 標題 `<h2>` 改用 `components/common/PageHeader.vue`，與已優化的主頁對齊

學生／員工選擇沿用 `ChangeLogEditorDialog.vue` 既有的
`el-select filterable remote` + `getStudents({ search, limit })` 模式，
**不抽共用元件**：兩者是不同 API，抽出後須額外處理已選值回填，代價大於收益。

## 二、4 子頁

共通：匯出鈕補 `:loading`；`ElMessageBox.confirm` 取消時的 reject 需吃掉
（現況會變成 unhandled rejection）。

### MonthlyReportView
- `onMounted(() => { fetchReport() })` 對非 404 錯誤 rethrow → unhandled rejection，補 catch
- 「產生」與「讀取」共用同一 `loading`，按鈕轉圈時整頁同時被遮 → 拆成兩個狀態

### CertificatesView
- `load()` 只有 `try/finally` 無 `catch`：API 失敗僅 spinner 消失、畫面無提示
- 表格只顯示 `student_id` 數字 → 補姓名欄；查詢欄改 remote select
- 無空狀態 → 補 `el-empty`

### SubsidiesView
- `load()` 與 `onSubmit`/`onApprove`/`onMarkPaid`/`onReject`/`onExport` 六處全無 try/catch
- 統計卡是以「當前篩選結果」計算，標題卻寫「本期申請總額」→ 改標題誠實描述，
  不新增後端聚合端點
- 金額改用 `utils/currency.ts` 的 `formatCurrency`

### IepView（問題最多）
- `loadAll()` 完全無 try/catch 也無 loading，首次載入失敗畫面全白
- 七個 action 全無 catch
- **`onClone` 是 bug**：`ieps.find(i => i.student_id === ...)` 只抓該學生第一筆 IEP，
  非「上學期」。改為依 `school_year`/`semester` 明確往前推一期
  （semester 1 → 前一期為 `(year-1, 2)`；semester 2 → `(year, 1)`）
- **學年語意澄清**：後端 `models/gov_moe.py:73` 註明本欄位為**西元學年**，
  刻意與系統其他 `school_year`（民國）不同，router 驗證 `ge=2020`。
  故現行西元年用法正確，**不是** bug；真正的缺陷是預設值未按台灣學制 8 月起算
  （2026-07 應為 2025 學年第 2 學期，現況給 2026）。
  用 `utils/academic.ts` 的學制邏輯換算後轉回西元。
  **不可直接套 `AcademicTermSelector`** —— 它綁民國年的 `academicTerm` store，語意會錯亂。
- 學年選項由寫死 `[2024, 2025, 2026, 2027]` 改為動態產生
- 切換學生／學期會靜默丟棄未儲存編輯 → 補 dirty 確認
- `getStudents({})` 撈全部再前端 filter `disability_type`：後端無對應 filter 參數，
  本次保留並加註記，不擴大到改後端

## 三、側欄

`AdminSidebar.vue` 只掛「月度月報」與主頁兩項，Certificates／Subsidies／IEP
三頁僅能打網址進入 → 補三個 `el-menu-item`，權限用 `GOV_REPORTS_VIEW`
對齊 `permissions.ts:119` 的 route guard prefix 規則。

⚠ **只加新行，不動既有兩行的 `SALARY_READ`**：`feat/gov-reports-ux` 已將其改為
`GOV_REPORTS_EXPORT`，平行的 `fix/sidebar-permission-parity` 又改成 `REPORTS`，
三方已在同一行相撞，本分支不參戰。

## 四、後端 `api/gov_reports.py`

- `fmt: str = Query("xlsx")` 無 enum 驗證，傳 `fmt=csv` 會靜默 fallback 成 xlsx
  → 改 `Literal["xlsx", "txt"]`，非法值回 422
- 測試補洞（現況 74%，缺的都是高風險路徑）：
  - `force=true` 的 403（無簽核權限）／400（理由不足 10 字）兩分支完全未測 —— 這是
    繞過薪資封存守衛的後門
  - `_assert_salary_period_finalized` 的 409 組裝邏輯：現有測試一律 `patch` 掉它，
    守衛本身從未被驗證
  - 三處保險 fallback 與 xlsx 資料列渲染：smoke test 全用空員工列表，一行資料都沒跑過
- 效能（**排最後，做不完可擱置**）：`withholding` 年度全表撈收窄 select 欄位；
  `_ins_calc` 逐員工 service call 能批次的部分批次化

## 驗收

- 前端：`npm run typecheck` / `lint` / `test` 全綠。
  注意 `main` 上 `IntegrationsHealthCard.vue` 有 11 個**既有** typecheck error，
  須與本次新增區分。
- 後端：`pytest tests/test_gov_reports*.py --cov=api.gov_reports`，覆蓋率高於 74% 基線。
