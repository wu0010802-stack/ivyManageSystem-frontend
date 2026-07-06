# 員工管理 UX 全面改版：詳情頁路由化 + 表單統一（設計 spec）

- 日期：2026-07-06
- 狀態：已與業主三段確認（方向 B：詳情頁路由化）
- 範圍：**純前端**（後端零改動；`EmployeeCreate` 已收薪資欄位、詳情所需 API 全數現成）
- 緣起：員工管理頁全面 UX 體檢（dev 實機走查）發現 12 項問題，詳見附錄 A

## 1. 目標與非目標

**目標**
1. 員工詳情從「8-tab 稀疏彈窗」升級為獨立路由頁 `/employees/:id`，可深連結
2. 新增/編輯表單架構統一（新增補上薪資 tab，結束「建完人再開編輯補薪資」的斷裂流程）
3. 離職/刪除雙入口語意收斂（改名+加強確認）
4. 修齊 12 項體檢發現（顯示正確性、locale、術語、a11y）
5. 順勢拆解 `EmployeeView.vue`（1670 行）

**非目標（YAGNI，明確不做）**
- 留職停薪/停職/復職生命週期中間態（另案）
- 清單卡片/表格雙模式、批次操作、進階多條件篩選
- 後端 schema/端點任何變更（含離職紀錄批次查詢端點——1-2 列規模不值得）
- legacy `title`/`is_office_staff` 欄位清理（另案）

## 2. 資訊架構與路由

```
/employees                 → EmployeeHubView（不變：員工管理/離職管理 segmented，?section= 承載）
/employees/:id(\d+)        → EmployeeDetailView（新，數字限定避免路由衝突）
```

- 詳情路由為**頂層獨立頁**，不巢狀於 Hub；左上「← 返回員工列表」（router.back()，無歷史時 fallback `/employees`）
- 權限：沿用 `canAccessRoute` path-prefix 規則，`/employees/:id` 繼承 EMPLOYEES_READ，**不改授權碼**；實作時驗證 prefix 比對含 :id 路徑
- 先例對齊：`/students/profile/:id`（admin 端詳情頁前例）、`/portal/students/:studentId`（props:true 樣板）
- 反例注記：`/appraisal/cycles/:id` 曾路由化又折回內嵌——那是工作流程上下文；員工是穩定實體，路由化語意正確

## 3. 詳情頁（EmployeeDetailView）

版面：左側 sticky 摘要欄 + 右側單頁捲動區塊（左欄錨點導覽）。

| 區塊 | 內容 | 資料策略 |
|------|------|---------|
| 基本資料 | 個人+聯絡+緊急聯絡 | 進頁 `GET /employees/:id` 一次載入 |
| 職務・班級 | 職稱/職位/主管職/教保身分 + 班級歷程 | 同上 + `GET /employees/:id/class-history` |
| 薪資・投保 | 底薪**或**時薪（依 employee_type 只顯示相關者）、投保三分項、特殊旗標 | 同上；遮罩處理見 §6 |
| 學歷・證照・合約 | 三子表 inline + 現有子對話框 CRUD 重用 | 進頁並行載入（3 支輕量 API） |
| 出勤紀錄 | 月選擇器 + 當月紀錄 | 進頁載當月（`GET /attendance/records`） |

- 左摘要欄：頭像 placeholder、姓名、編號、狀態 tag、快速操作（編輯→開統一表單彈窗、辦理離職→OffboardingModal）
- 深連結不依賴清單 store：`useEmployeeDetail` composable 獨立打 API
- 手機版：左欄變頂部卡片，錨點導覽變橫向 chip
- 8-tab 詳情彈窗退役刪除（重複 `tab-salary` id 的 a11y 問題隨之消失）

## 4. 表單統一（EmployeeFormDialog）

- 新增/編輯共用同一彈窗元件：「基本資料｜薪資・投保・銀行」兩 tab；新增模式掛上現成 `EmployeeFormSalary`（後端 `EmployeeCreate` 全收，純前端接線）
- 薪資 tab 權限分流：有 `SALARY_WRITE` → 新增時可直接填；無 → tab 顯示「儲存後由具薪資權限者補登」提示（維持兩段式但明確告知）
- create 不需 `adjustment_reason`（後端僅 update salary 要求）；編輯的 dirty-diff、`EmployeeChangesPreviewDialog` 變更預覽、調薪原因簽核、self-edit 守衛**全部保留不動**
- 彈窗工學：`max-height: calc(100vh - 120px)`、內容區內捲、footer sticky（tab 列與儲存鈕永遠可見；修「941px 彈窗超出 900px 視窗」問題）
- 修 bug：編輯模式員工編號顯示現有編號（現誤顯「儲存後自動配號」）
- 編輯彈窗 el-tabs 的 tab name 加前綴，避免與其他 el-tabs 實例撞 DOM id

## 5. 清單改善（EmployeeListView）

- 整列點擊進詳情頁；「詳情」按鈕移除，操作欄剩「編輯｜更多」
- 篩選列補「職稱」下拉（教育局系統職稱，選項資料現成）；狀態篩選保留
- 已離職/待離職列整列淡化（opacity）+ tag 保留
- 「更多」選單收斂（業主裁定：改名+加強確認）：
  - 「辦理離職」（主路徑，完整 offboarding 流程）
  - 「快速標記離職」（原「刪除」，仍呼叫 `DELETE /employees/:id`）：確認框明列後果——不產離職證明、不做假別快照、resign_date ≤ 今日即刻撤帳號——並引導優先走完整流程；誤建帳號也走這條
  - 「重置打卡 PIN」不變

## 6. 顯示正確性規範

- 薪資欄位 null（後端 role/self 遮罩，見 `services/finance/salary_access.py` 語意）→ 顯示「無檢視權限」，**嚴禁 `Number(null)` 變 0**
- 正職不顯示時薪列、時薪制不顯示底薪列；投保級距 0 →「未設定」
- Element Plus locale 在 el-config-provider 層級統一（空狀態「暫無資料」取代「No Data」，全站受益）
- 離職管理術語中文化：「無 record」→「未建立紀錄」、「Checklist 狀態」→「離職檢核」
- 離職管理逐列 404（無 offboarding record 屬常態流程）：前端已正常處理，維持現狀

## 7. 檔案結構（拆分後）

```
views/EmployeeHubView.vue          （不變）
views/EmployeeListView.vue         （清單+篩選+匯出，~400 行）
views/EmployeeDetailView.vue       （路由頁骨架+左摘要欄，~250 行）
components/employee/detail/
  BasicSection.vue / JobSection.vue / SalarySection.vue /
  CredentialsSection.vue（學歷/證照/合約）/ AttendanceSection.vue / ClassHistorySection.vue
components/employee/EmployeeFormDialog.vue （統一表單彈窗，dirty-diff 機制搬入）
composables/useEmployeeDetail.ts   （主資料+子資源並行載入、遮罩判定）
```

- `EmployeeView.vue` 拆完退役刪除；既有測試隨拆分搬家，**不可刪斷言**
- 全程 TS、`<script setup lang="ts">`、禁 any（repo 規範）
- 重用不動：`EmployeeFormBasic/FormSalary/ChangesPreviewDialog`、`useEmployeeFormDirty`、`stores/employee.ts`、`OffboardingModal`、學歷/證照/合約子對話框

## 8. 測試與驗證

**Vitest**
- `useEmployeeDetail`：載入成功/失敗、遮罩 null 判定、深連結（store 為空）情境
- 薪資顯示 helper：null/0/employee_type 分流
- 表單統一：create payload 含薪資欄位；**mock response 形狀必抄真實後端契約**（憑感覺 mock 過的裸陣列曾讓 unwrap bug 假綠）；el-select clearable 的 × 會把 model 設成 undefined、JSON.stringify 整欄丟棄——emit 處必 `?? null` 正規化且測試要走 undefined 路徑

**手動/e2e**
- dev 實走：新增（含薪資）→ 詳情深連結 → 編輯 → 快速標記離職確認框；Playwright 對照 12 項發現逐項覆核
- e2e smoke 若補詳情頁渲染條目，**必須改 `ivy-backend/e2e/` 那份**（CI 實際跑的副本）

**風險**
- 路由順序與 :id 數字限定已控；`canAccessRoute` prefix 比對需以 `/employees/123` 實測
- 詳情頁改動不觸碰 OpenAPI 契約（無後端變更，無 codegen 需求）

## 附錄 A：體檢 12 項發現（2026-07-06 dev 實機走查）

1. 詳情彈窗 8 tab 稀疏、無深連結（→§2/§3）
2. 新增表單 24 欄平鋪、不含薪資、與編輯架構不一致（→§4）
3. 編輯彈窗 941px 超出 900px 視窗、整窗捲動、footer 不固定（→§4）
4. 「辦理離職」「刪除」雙終止路徑語意混淆（→§5）
5. 編輯模式員工編號誤顯「儲存後自動配號」（→§4）
6. 詳情薪資顯示原始 0（投保級距 0、正職顯示時薪 0）（→§6）
7. 出勤空狀態英文「No Data」（→§6）
8. 離職管理中英夾雜「無 record」「Checklist 狀態」（→§6）
9. 清單篩選僅狀態、缺職稱（→§5）
10. 已離職列視覺區分弱（→§5）
11. 詳情彈窗關閉後留 DOM、重複 id `tab-salary` a11y 錯配（→§3 退役 + §4 前綴）
12. `EmployeeView.vue` 1670 行四職責集中（→§7）
