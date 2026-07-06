# 才藝報名管理 · 審核工作流整併進主列表 — 設計

- 日期：2026-07-04
- 範圍：**純前端**（`ivyManageSystem-frontend`）。後端已完整支援，無需改動。
- 目標頁面：`/activity/registrations`（`ActivityRegistrationView.vue`）

## 1. 背景與目標

目前才藝報名的「審核工作流」（家長公開報名比對不到在籍生 → 待審核 / 已拒絕）被隔離在獨立頁面
`ActivityPendingReviewView.vue`（路由 `/activity/registrations/pending`），主列表只能看到 `match_status`
標籤卻無法就地處理。本次要把審核能力整併進主列表，讓報名管理成為單一入口：

1. 主列表新增「**報名狀態**」（`match_status`）篩選欄。
2. 移除主列表的「待審核佇列」按鈕。
3. 把待審核頁的四個審核動作（手動匹配 / 重新比對 / 強行收件 / 拒絕）搬到主列表**操作欄**，
   僅在該列為「待審核」時 enabled，否則 disabled。
4. 批量勾選**限定同一審核狀態**的列。
5. 批量操作新增「**批量審核報名狀態**」（依所選群組狀態提供對應批量動作，含批量「通過」路徑）。
6. 額外提供「**逐筆審核精靈**」處理需逐列指定不同在校生的手動匹配。
7. **完整整併**：把已拒絕 / 復原也納入主列表，並刪除待審核佇列頁與其路由。

## 2. 現況（As-Is）

- 主列表 `ActivityRegistrationView.vue`：篩選（AcademicTermSelector / 搜尋 / 付款狀態 / 課程 / 班級）、
  表格（含 `type=selection` 勾選欄、`match_status` 標籤）、操作欄（詳情 / 刪除）、批量列（標記已繳費 / 取消）、
  詳情抽屜。篩選狀態封裝於 composable `useActivityRegistration.ts`（含 URL query 同步）。
- 待審核頁 `ActivityPendingReviewView.vue`：學年 / 學期 / 搜尋篩選、表格（狀態欄、每列四顆審核鈕 + 已拒列的復原鈕）、
  批量列（批次拒絕 / 批次復原）、手動匹配 dialog（學生搜尋 + 候選表）、重新比對 / 強行收件共用 dialog。
- 狀態語意集中於 `constants/activity.ts`：`MATCH_STATUS_LABEL_SHORT`、`MATCH_STATUS_TAG_TYPE`
  （`matched/manual/pending/rejected/unmatched/forced`）。

## 3. 需求對應決策（已與使用者確認）

| # | 決策 |
|---|---|
| 整併範圍 | **完整整併**：filter 含全部狀態（含已拒絕）；待審核列顯示四顆審核鈕、已拒絕列顯示「復原」鈕；刪除待審核佇列頁與路由。 |
| 操作欄呈現 | **四顆按鈕平鋪**（非待審核時 disabled，灰階顯示）。 |
| 批量審核 | 依所選群組狀態提供：待審核 → 批量重新比對 / 批量強行收件 / 批量拒絕；已拒絕 → 批量復原。 |
| 逐筆精靈 | **本次一起做**。 |

## 4. 資料與 API 契約（無後端改動，已驗證）

- `GET /activity/registrations` 已支援 query：`match_status`（`matched|pending|manual|rejected|unmatched|forced`）、
  `include_inactive`（bool，預設 false）。回應每列已含 `match_status / pending_review / is_active /
  reviewed_by / reviewed_at / paid_amount / total_amount / payment_status`。
- 前端 codegen 型別已是最新：`schema.d.ts` 中 registrations GET query 已含 `match_status` 與 `include_inactive`
  （行 30844-30846）；`ApiQuery<'/activity/registrations','get'>` 可直接使用，**不需 `npm run gen:api`**。
- 審核動作沿用既有 API（`src/api/activity.ts`）：`matchRegistration` / `rematchRegistration` /
  `forceAcceptRegistration` / `rejectRegistration` / `restoreRegistration` / `searchActivityStudents`。
- **後端狀態守衛（前端須對齊以避免 4xx）**：
  - `match`：僅接受 pending，否則 409。
  - `reject`：僅接受 pending 且 `paid_amount == 0`，否則 409。
  - `force-accept`：僅接受 pending，否則 400。
  - `rematch`：接受任何 `is_active=True`（比對失敗會降級回 pending）。
  - `restore`：僅接受 rejected，否則 400。
- **關鍵陷阱**：rejected 列為 `is_active=False`，主列表預設 `is_active=True` 會濾掉。
  → 篩選「已拒絕」時前端**必須同時帶 `include_inactive=true`**。

## 5. 設計細節

### A. 「報名狀態」篩選欄（`match_status`）

- 位置：`ActivityRegistrationView.vue` 工具列，置於「付款狀態」下拉之後。
- 元件：`<el-select v-model="matchStatusFilter" placeholder="報名狀態" clearable @change="handleSearch">`，
  選項用 `MATCH_STATUS_LABEL_SHORT`：待審核 / 系統自動 / 人工指定 / 強行收件 / 未比對 / 已拒絕
  （空值＝全部）。
- composable `useActivityRegistration.ts` 增修：
  - 新增 `matchStatusFilter = ref('')`。
  - `fetchList`：帶 `match_status: matchStatusFilter.value || undefined`；
    並依規則帶 `include_inactive: matchStatusFilter.value === 'rejected' ? true : undefined`。
  - `initFromQuery` / `syncToQuery`：新增 `match_status` query 同步（F5 保留，沿用現有慣例）。
  - `resetFilters`：一併清空 `matchStatusFilter`。
  - `hasActiveFilters`：納入 `matchStatusFilter`。
- 行為：filter＝全部時，列表顯示所有 active 列（pending + matched + manual + forced + unmatched），
  與現狀一致；rejected 僅在明確篩「已拒絕」時出現。
- 學期切換 watch：`matchStatusFilter` 非學期專屬，**不重置**（與 `courseFilter` 不同）。

### B. 操作欄：就地審核動作（四顆平鋪 + 復原）

操作欄 `fixed="right"`，寬度加大（約 `width="440"` 以容納最寬情形）。渲染規則：

- **一律顯示**：`詳情`。
- **已拒絕列**（`match_status === 'rejected'`）：顯示 `復原`（`type=success`，`:disabled="!canWrite"`）。
  不顯示四顆審核鈕，也不顯示 `刪除`（該列已 `is_active=false`，再刪無意義）。
- **其餘所有列**（pending / matched / manual / forced / unmatched）：依序平鋪四顆審核鈕，
  每顆 `:disabled="!canWrite || row.match_status !== 'pending'"`：
  - `手動匹配`（`type=primary`）→ 開手動匹配 dialog
  - `重新比對`（`type=warning`）→ 開重新比對 dialog
  - `強行收件`（`type=danger` plain）→ 開強行收件 dialog
  - `拒絕`（`type=danger`）→ prompt 拒絕原因
    - 額外守衛：`row.paid_amount > 0` 時 disable 並加 tooltip「已有繳費，請先於詳情處理繳費再拒絕」
      （對齊後端 reject 的 paid_amount 守衛，避免必然 409）。
  - 之後顯示 `刪除`（`type=danger`，`v-if="canWrite"`，維持現有邏輯）。
- 非待審核列的四顆鈕以 disabled 灰階呈現（使用者決策：四顆平鋪、非待審核 disabled）。

### C. 批量勾選限同一審核狀態

在 `<el-table-column type="selection">` 加 `:selectable="isRowSelectable"`，並以「錨定狀態」約束：

```
const selectionStatus = ref<string | null>(null)   // 目前群組的 match_status；空選為 null
function isRowSelectable(row) {
  return selectionStatus.value === null || row.match_status === selectionStatus.value
}
function handleSelectionChange(rows) {
  if (rows.length === 0) { selectionStatus.value = null; selectedRows.value = []; return }
  const anchor = rows[0].match_status
  const sameGroup = rows.filter(r => r.match_status === anchor)
  if (sameGroup.length !== rows.length) {
    // 只可能來自表頭全選（逐一勾選時其他狀態已 disabled）→ 收斂到錨定群組
    selectionStatus.value = anchor
    selectedRows.value = sameGroup
    nextTick(() => {
      tableRef.value?.clearSelection()
      sameGroup.forEach(r => tableRef.value?.toggleRowSelection(r, true))
      ElMessage.info(`批量僅能勾選同一報名狀態，已保留「${matchLabel(anchor)}」${sameGroup.length} 筆`)
    })
  } else {
    selectionStatus.value = anchor
    selectedRows.value = sameGroup
  }
}
```

- 遞迴保護：`toggleRowSelection` 會再觸發 `selection-change`，但此時 rows 已全同狀態 → 不再收斂，收束穩定。
- `selectedRows` 取代原 `selectedIds`（需要 row 物件才能取 `match_status`）；批量 API 呼叫時再 `.map(r => r.id)`。
- 清空選取（取消鈕 / clearSelection）時 `selectionStatus = null`，全列恢復可勾。

### D. 狀態感知批量列 + 批量審核

批量浮動列（`selectedRows.length > 0` 顯示）依 `selectionStatus` 切換動作。
標頭：`已選 N 筆 · 狀態:{matchLabel(selectionStatus)}`。

| 群組（selectionStatus） | 批量動作 |
|---|---|
| `pending`（待審核） | `批量重新比對`、`批量強行收件`、`批量拒絕`、`逐筆審核`（開精靈，見 E） |
| `rejected`（已拒絕） | `批量復原` |
| `matched/manual/forced/unmatched`（已收件 / 未比對） | `標記已繳費`（沿用現有 `batchMarkPaid`） |

- 皆一律含 `取消`（清空選取）。
- **批量「通過」的定義**：`批量重新比對`（自動比對，配到即自動綁定＝通過）＋
  `批量強行收件`（當校外生直接收進正式報名＝通過）共同構成批量通過能力；
  手動指定學生的通過走「逐筆審核精靈」。
- 後端無這些批量端點 → 前端以 `Promise.allSettled` 逐筆並發彙總（沿用待審核頁的 `runBatch` 模式，
  抽到共用 composable，見 G）。
- 各批量 handler：
  - `handleBatchRematch`：確認 → 逐筆 `rematchRegistration(id)` → 彙總「自動綁定 A 筆（回應 `matched===true`）、
    仍待審核 B 筆、失敗 Z 筆」。需擴充彙總以讀取每筆回應的 `matched` flag（非只 ok/fail）。
  - `handleBatchForceAccept`：warning 確認（提示：整批標記 forced、視為校外生直接收件）→ 逐筆
    `forceAcceptRegistration(id)` → 彙總成功 / 失敗。
  - `handleBatchReject`：prompt 共用拒絕原因（≥2 字，≤200 字）→ 逐筆 `rejectRegistration(id, reason)`
    → 彙總；`paid_amount>0` 的列後端會 409 → 計入失敗並於訊息提示。（沿用待審核頁邏輯）
  - `handleBatchRestore`：確認 → 逐筆 `restoreRegistration(id)` → 彙總。（沿用待審核頁邏輯）
  - 各動作完成後 `clearSelection()` + `fetchList()`。

### E. 逐筆審核精靈（Guided Review Wizard）

- 進入點：待審核群組批量列的 `逐筆審核（N）`；以目前選取的**待審核**列為佇列。
- 元件：新增 `src/components/activity/RegistrationReviewWizard.vue`
  （`v-model` 開關、`:rows` 佇列；emit `finished`）。
- UI：
  - 進度：「第 k / N 筆」＋目前列家長填寫資訊（姓名 / 生日 / 家長手機 / 家長填寫班級）。
  - 內嵌學生搜尋（`searchActivityStudents`，seq 競態守衛）＋候選表（單選）。
  - 動作按鈕：`匹配並下一筆`（需選定學生 → `matchRegistration`）、`強行收件並下一筆`
    （`forceAcceptRegistration`）、`拒絕並下一筆`（prompt 原因 → `rejectRegistration`）、
    `略過`（不動作前進）、`上一筆`、`關閉`。
  - 每筆動作成功後自動前進；到底或關閉時彙總「已處理 X 筆（匹配 a / 強收 b / 拒絕 c / 略過 d）」。
- 錯誤處理：單筆 4xx（如已被他人處理 → 404 / 409 / 400）顯示該筆錯誤並允許略過，不中斷整個佇列。
- 收尾：`finished` → 主頁 `clearSelection()` + `fetchList()`。

### F. 待審核佇列頁退場

- 刪除 `src/views/activity/ActivityPendingReviewView.vue`。
- 移除路由 `router/index.ts:362-366`（name `activity-registrations-pending`）。
- 從 `ActivityRegistrationView.vue` 移除：待審核 badge 按鈕（template）、`goToPending`、`pendingCount`、
  `loadPendingCount`、`onMounted` 內 `loadPendingCount()`、以及未再使用的 `listPendingRegistrations` import。
- `src/api/activity.ts` 的 `listPendingRegistrations` export **保留**（端點仍有效、移除無益且會牽動測試 mock）。
- 刪除 `tests/unit/views/ActivityPendingReviewView.test.js`；其覆蓋的行為（時區顯示、批次拒絕 / 復原、
  匹配搜尋競態）以主列表 / wizard 的等價測試補回（見 7）。

### G. 元件與 composable 拆分（架構）

為避免 `ActivityRegistrationView.vue`（現已約 1100 行）進一步膨脹，並讓審核邏輯可測、可重用：

- 新增 composable `src/composables/useActivityReview.ts`：封裝
  - 手動匹配 dialog 狀態 + `runSearch`（含 seq 守衛）+ `confirmMatch`
  - 重新比對 / 強行收件共用 dialog 狀態 + `confirmEdit`
  - 單列 `handleReject` / `handleRestore`
  - 批量 `runBatch` + `handleBatchRematch` / `handleBatchForceAccept` / `handleBatchReject` / `handleBatchRestore`
  - 對外以 callback（如 `onChanged`）通知主頁 `fetchList()`。
- 新增元件（`src/components/activity/`）：
  - `RegistrationMatchDialog.vue`：手動匹配（學生搜尋 + 候選表 + 確認）。
  - `RegistrationRematchForceDialog.vue`：重新比對 / 強行收件（`action` prop 決定）。
  - `RegistrationReviewWizard.vue`：逐筆審核精靈（E）。
  - 皆 `defineAsyncComponent` 動態載入（沿用主頁既有慣例，避免膨脹首載 chunk）。
- 主頁只保留：篩選欄綁定、表格欄位、操作欄按鈕的 open 呼叫、批量列的 handler 呼叫、掛載 dialog / wizard 元件。

## 6. 邊界情況與錯誤處理

- **rejected 列的 include_inactive**：僅在 `match_status==='rejected'` 帶 `include_inactive=true`；
  filter＝全部時**不帶**，維持只顯示 active（rejected 不混入）。
- **拒絕 paid_amount>0**：操作欄該顆 disable + tooltip；批量拒絕時該列會 409 → 計入失敗數並提示。
- **表頭全選跨狀態**：由 C 的收斂邏輯收束到第一列狀態群組並 toast 告知。
- **權限**：所有審核 / 批量動作 `canWrite = hasPermission('ACTIVITY_WRITE')`；無權時按鈕 disabled（比照現有 `刪除`）。
- **競態**：學生搜尋與精靈沿用既有 seq 守衛範式（`ActivityPendingReviewView` / drawerSeq）。
- **rematch 降級**：對 pending 執行 rematch 若仍比對不到，後端會保持 pending；批量彙總須據回應 `matched` 區分
  「自動綁定」與「仍待審核」。

## 7. 測試計畫（Vitest；維持 typecheck / lint / test 全綠）

- `tests/unit/composables/useActivityRegistration.test.js`（或新增檔）：
  - `match_status` 篩選帶入 query；`rejected` → 附 `include_inactive=true`、其餘不附。
  - `resetFilters` / `hasActiveFilters` / query 同步含 `match_status`。
- 新增 `useActivityReview` 測試：`runBatch` 彙總（含 rematch 的 matched 計數）、單列 handler 呼叫正確 API。
- `tests/unit/views/ActivityRegistrationView.test.js`（或新增）：
  - 操作欄四顆鈕 enable/disable 隨 `match_status`；rejected 列顯示復原。
  - 勾選同狀態約束（`isRowSelectable` / 表頭全選收斂）。
  - 批量列依 `selectionStatus` 顯示對應動作。
- Wizard 元件測試（可後補）：前進 / 略過 / 單筆錯誤不中斷。
- 刪除 `ActivityPendingReviewView.test.js`。
- 保留並確認 `ActivityRegistrationView.voidPermission.test.ts` 仍綠（其對 `listPendingRegistrations` 的 mock 變成未用但無害）。

## 8. 檔案異動清單

**修改**
- `src/composables/useActivityRegistration.ts`（filter + query 同步 + selectedRows 化）
- `src/views/activity/ActivityRegistrationView.vue`（filter 欄、操作欄、批量列、勾選約束、掛載新元件、移除 pending 入口）
- `src/router/index.ts`（移除 pending 路由）

**新增**
- `src/composables/useActivityReview.ts`
- `src/components/activity/RegistrationMatchDialog.vue`
- `src/components/activity/RegistrationRematchForceDialog.vue`
- `src/components/activity/RegistrationReviewWizard.vue`
- 對應測試檔

**刪除**
- `src/views/activity/ActivityPendingReviewView.vue`
- `tests/unit/views/ActivityPendingReviewView.test.js`

## 9. 風險與注意事項

- 遵守 repo 規範：TS-only、`<script setup lang="ts">`、禁 `any` / `as any`、type-based macros、
  API 型別走 `ApiQuery/ApiBody/AxiosResp/Schema`（禁手寫）、權限一律 `hasPermission`。
- 操作欄 6 顆按鈕於窄螢幕會較擠；`fixed="right"` + 表格水平捲動可容納，RWD 下沿用現有 `@media (--to-sm)` 疊放。
- `runBatch` 沿用「前端並發逐筆」語意；大量選取時仍是 N 個請求（與待審核頁現狀相同，不新增後端批量端點）。

## 10. 非目標（YAGNI）

- 不新增任何後端端點 / 不改後端。
- 不做批量「手動匹配到單一學生」（語意上不成立；以逐筆精靈取代）。
- 不改動詳情抽屜、繳費 / 課程 / 用品既有流程。
- 不改 `match_status` 的狀態機（後端 `MATCH_ALLOWED_TRANSITIONS` 未接線，維持現狀由端點手寫守衛）。
