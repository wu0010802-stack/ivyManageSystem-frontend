# 後台 UI 缺口收尾包：公告指定學生 ＋ 費用範本管理復活

- 日期：2026-07-28
- 狀態：待審閱
- 範圍：**僅 ivy-frontend**，不動後端（兩個功能的後端 API 均已就緒）
- 分支：`feat/admin-ui-gap-closeout`，兩功能各自獨立 commit，互不相依

## 背景

全系統盤點後選定的兩個「後端已就緒、前端刻意延後」的行政後台缺口：

1. **公告精細發送對象**：後端 `PUT /announcements/{id}/parent-recipients` 自 2026-04-25 起即支援 `all / classroom / student / guardian` 四種 scope（commit `87e96dbe` 明言是為了前端勾選 UI 而設計），前端只做了 `off / all / classroom` 三種，`custom`（含 student/guardian scope）目前是 disabled radio ＋ 唯讀提示（`AnnouncementView.vue:663`）。
2. **費用範本編輯**：`FeeQuickEditDialog` 從未被實作（stash 只有引用、實體檔案遺失），2026-05-19 `cc5f6536` 還原費用總覽時拔掉入口留 TODO（`FeeTemplateTab.vue:14`）。更早的完整版 `FeeTemplateDialog.vue`（241 行）與 `FeeGenerateModal.vue`（129 行）在 2026-07-01 `ed33e51d` 被當零引用死元件刪除，完整內容可從 `ed33e51d^` 取回。目前範本 CRUD 與批次產單**完全沒有 UI 入口**，只能直接打 API。

## 功能一：公告「指定學生」發送對象

### UI 變更（集中在 `src/views/AnnouncementView.vue`）

- 家長端發送對象 radio 的 `custom` 選項從 disabled 改為可選，label 定為「指定學生」；`unchanged`（parent-recipients 讀取失敗時的保護 sentinel）維持現狀不動。
- 表單新增 `parent_target_student_ids: number[]`。
- 選 `custom` 時顯示學生多選器：`el-select multiple filterable`，選項**全量載入**、依班級 `el-option-group` 分組、本地過濾（仿同頁既有的員工多選器模式）。
  - 注意：`getStudents` 不帶參數只回前 50 筆，載入時必須帶足夠大的 `limit`（如 500）。
  - 不採 remote search：幼兒園在籍人數百人級，全量載入較簡單且支援班級分組瀏覽。

### 編輯既有公告（hydrate 與 guardian 保留）

- `openEdit()` 的 `custom` 分支：把回傳 items 中 `scope='student'` 的 `student_id` 填入 `parent_target_student_ids`；`scope='guardian'` 的 rows 存入 `preservedGuardianItems`，UI 以唯讀 tag 顯示「另含 N 筆監護人層級設定（儲存時將保留）」。
- `buildParentRecipients()` 的 `custom` 分支：回傳 student items ＋ `preservedGuardianItems` 原樣併入。**後端 PUT 是 replace-all 語意，不帶回 guardian rows 就會被洗掉**——這是本設計的關鍵不變量。
- 若使用者從 `custom` 主動切到 `all` / `classroom` / `off`，依既有語意覆蓋全部設定（含 guardian rows），與現況一致。

### 資料流

- 公告本體 POST/PUT 之後照既有流程呼叫 `replaceAnnouncementParentRecipients`；`custom` 不再回傳 `null`（現況 `null` = 跳過不呼叫，改後只有 `unchanged` 維持 `null`）。
- LINE 推播與家長端可見性由後端在 PUT 時觸發（`services/announcement_push.py`），前端不需任何配合改動。

### 錯誤處理

- PUT 回 422（scope↔id 對應錯誤）或 400（學生不存在／已刪）：以 ElMessage 顯示後端 `detail`。
- parent-recipients 讀取失敗：維持既有 `unchanged` sentinel 行為（不覆蓋）。

### 不在範圍

- 監護人層級的「編輯」UI（僅保留、不可增刪；後端缺跨學生監護人搜尋 API，且用例罕見）。
- 開放非管理角色使用：後端 F-045 對非 unrestricted 角色有範圍限制（不可 `scope='all'`、不可選出自己班級外對象），本頁為管理端專用，不處理教師端情境。

## 功能二：費用範本管理復活

### 元件

| 元件 | 來源 | 職責 |
|---|---|---|
| `FeeTemplateDialog.vue` | 從 `ed33e51d^` 復活後依現行慣例整理 | 單筆範本新增／編輯。編輯時 `grade_id / school_year / semester / fee_type` 四欄 disabled（後端 `FeeTemplateUpdate` 無此四欄，識別鍵不可變）、只送可變欄位；`fee_type='monthly'` 顯示月費組成（學費／餐點費／交通費）並即時驗證總和＝`amount` |
| `FeeGenerateModal.vue` | 同上 | 批次產生費用單：先 `dry_run: true` 取得 created/skipped 預覽，確認後 `dry_run: false` 寫入 |
| `FeeTemplateManageDrawer.vue` | 新元件 | 範本管理容器：學年／學期篩選 ＋ `el-table` 範本列表 ＋ 新增／編輯／停用操作，內嵌 FeeTemplateDialog |

- `src/api/fees.ts` 的 `createFeeTemplate` / `updateFeeTemplate` / `deleteFeeTemplate` / `generateFeeRecords` 四個 wrapper 目前活著且有 API 層測試，直接沿用，不需新增 API 程式碼。

### 入口與資料流

- `FeeTemplateTab.vue`（費用總覽 tab）工具列新增「管理範本」（開 Drawer）與「產生費用單」（開 Modal）兩顆按鈕；Drawer 儲存或 Modal 產單完成後重跑 `loadOverview()`。
- Drawer 開啟時以總覽當前的 `filterYear` / `filterSemester` 為預設篩選。

### 快照語意警語（固定顯示）

Dialog 與 Drawer 內固定 `el-alert`：「範本修改僅影響**之後**產生的費用單；已產生的費用單不會回溯更新，請改用『折抵／調整』處理差額。」
（依據：`StudentFeeRecord.amount_due` 等欄位為產單當下快照，`/fees/generate` 冪等鍵 `(student_id, source_template_id, target_month)` 會擋掉重複產單，系統無自動差額路徑。）

### 大額防護（同步 403，非送簽流程）

- 後端 `require_finance_approve`：範本新值／舊值／|變動量| 任一 ≥ NT$50,000 且操作者無「金流簽核」權限（`ACTIVITY_PAYMENT_APPROVE`）→ 直接 403，`detail` 為完整中文說明。停用（軟刪除）大額範本同樣受檢。
- 前端處理：403 時以 ElMessage 顯示後端 `detail`；表單金額輸入 ≥ 50,000 時預先顯示提示文字「此金額達財務簽核門檻，需具備金流簽核權限者操作」。
- 停用操作需 `ElMessageBox.confirm` 二次確認。

### 錯誤處理

- POST 重複四欄唯一鍵 → 409：顯示後端 detail（「該年級／學年／學期／類型已有範本」語意）。
- 月費 breakdown 總和不符 → 前端先擋；仍被後端擋（422）則顯示 detail。

## 測試計畫（Vitest ＋ @vue/test-utils）

**公告：**
1. `custom` radio 可選、選取後顯示學生多選器。
2. 編輯含 student scope 的公告 → ids 正確 hydrate；含 guardian scope → 唯讀 tag 顯示且 `buildParentRecipients()` 輸出保留 guardian items。
3. `custom` 下送出的 payload 為 student items ＋ guardian items；切回 `all`／`classroom` 則覆蓋。
4. parent-recipients 讀取失敗 → 落 `unchanged`、送出時不呼叫 replace API（既有行為迴歸）。

**費用：**
1. Dialog：新增送全欄位、編輯只送可變欄位；月費組成總和不符時擋下送出。
2. Drawer：列表載入／篩選、停用需 confirm。
3. Modal：dry-run 預覽 → 確認寫入的兩段式流程。
4. 403 回應顯示後端 detail；金額 ≥ 50,000 顯示門檻提示。

## 驗收標準

- 行政人員可在公告表單直接選「指定學生」發送，該生所有已綁定家長收到推播並可在 LIFF 看到公告；既有監護人層級設定經編輯儲存後仍保留。
- 行政人員可在費用總覽頁完成範本新增／修改／停用與批次產單，全程不需打 API 工具。
- `npm run test`、`npm run type-check`、`npm run lint` 全綠（既有紅字不惡化）。
