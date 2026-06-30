# 中央待審工作台批次核准/駁回 設計

- 日期：2026-06-17
- 範圍：`WorkbenchApprovalsView`（審核工作台）三類待審——請假 / 加班 / 補打卡——加入多選批次核准/駁回
- 性質：前端為主 + 一個後端新端點（補打卡 batch-approve）；**無 schema 異動、無 migration**
- 來源：admin UX 盤點「批次操作」主題 bigBet（中央工作台 batch-approve）；批次操作主線子專案 #1
- 上游：[[2026-06-17-admin-list-experience-consistency-design]] 同一 admin UX 改善系列

---

## 1. 背景與問題

中央 `WorkbenchApprovalsView.vue`（764 行）彙整三類待審（`pendingLeaves` / `pendingOvertimes` / `pendingPunchCorrections`，各以 `useFetchPending` 載入、三張 `el-card` 區塊各一張 `el-table`），但**只能逐筆**核准/駁回（`approveLeave`/`approveOvertime`/`approveCorrection` 每筆開一次 confirm/prompt，走 `useApprovalOperation` 單筆 execute）。月底/月初待審爆量時，HR/主管逐筆點擊極耗時。

諷刺的是批次能力幾乎都現成：
- `useApprovalModule`（`src/composables/useApprovalModule.ts`）已封裝多選（`selectedItems`/`handleSelectionChange`）、批次核准確認（`showBatchApproveConfirm`）、批次駁回 dialog（`batchRejectVisible`/`batchRejectReason`/`openBatchReject`/`confirmBatchReject`）、審核資格判斷（`canApprove`，依 `role` + approval policy），**已被 LeaveView / OvertimeView 使用**。
- 後端 `POST /leaves/batch-approve`、`POST /overtimes/batch-approve` 已存在（兩階段原子、回 `{succeeded, failed}`）；FE `batchApproveLeaves` / `batchApproveOvertimes`（`api/leaves.ts:39`、`api/overtimes.ts:16`，皆 `api.post` 直連）已存在。

唯一缺口：**補打卡（punch correction）兩端都沒有 batch**（`api/punch_corrections.py` 僅單筆 `PUT /punch-corrections/{id}/approve`；FE `api/punchCorrections.ts` 僅 `approveCorrection`）。

## 2. 目標 / 非目標

**目標**
- 三類待審（請假/加班/補打卡）皆可多選後批次核准、批次駁回（駁回填一次共用原因）。
- 重用既有 `useApprovalModule` 與既有 leave/overtime batch 端點。
- 補一個後端 `POST /punch-corrections/batch-approve`，與 leaves/overtimes batch **同模式**（兩階段原子、per-item `failed[]`），核准成功項**完整複製單筆核准的副作用**（寫考勤 + 薪資 mark_stale + ApprovalLog）。
- 沒資格審的列不可被選取（`:selectable="canApprove"`），避免批次部分失敗。

**非目標（YAGNI）**
- 不做「跨 type 合併成一張表一鍵批次」（三端點不同、對齊度差、收益有限）——維持**每區塊各自批次**。
- 不改既有單筆核准流程（保留 `approveLeave`/`approveOvertime`/`approveCorrection`）。
- 不動 approval policy / 角色資格規則本身（沿用 `canApprove` 與後端 `_check_approval_eligibility`）。
- 不納入會議（meeting）——工作台目前不彙整會議審核。

## 3. 架構

### 3.1 後端：`POST /punch-corrections/batch-approve`（新，`api/punch_corrections.py`）

對齊 `batch_approve_leaves`（`api/leaves.py:1821`）的**兩階段原子**結構，避免 catch-all rollback 抹掉同批已通過條目（2026-05-11 P0-1 教訓）：

- 請求 schema `PunchCorrectionBatchApproveRequest { ids: list[int]; approved: bool; rejection_reason: str | None }`（比照 `LeaveBatchApproveRequest`）。
- 權限：`require_staff_permission(Permission.APPROVALS)`（與單筆一致）；rate limiter 比照 leave/overtime 的 `_batch_approve_limiter`。
- 駁回時 `rejection_reason` 必填（空 → 400）。
- **Pass 1 純驗證**（不 touch ORM dirty state）：逐 id 收集 `failed[]`——找不到（404 類）、非 pending（已審）、自我核准（`is_self_approval`）、角色無資格（`_check_approval_eligibility("punch_correction"/對應 docType, submitter_role, approver_role)`）。通過者收進 `changes`。
- **Pass 2 統一套用**：對通過項複製單筆 `approve_punch_correction` 的核准副作用——**抽共用內部函式** `_apply_correction_decision(session, correction, approved, reason, current_user)`（封裝：設 status/approved_by、駁回分支、核准時寫/改 attendance、取薪資鎖 + `mark_*_stale`、寫 ApprovalLog），單筆端點與 batch 端點**共用同一函式**（DRY，避免邏輯漂移）。薪資鎖：批次涉及多月份時，沿用單筆的「先取鎖再改 attendance 再 mark_stale」順序，逐項處理。
- 單一 `commit`（或依薪資鎖實作以最小一致性邊界 commit）；回 `{succeeded: [...], failed: [{id, reason}]}`（與 leaves 同形）。
- 不寫 `response_model` 強型別亦可（與 leaves batch 一致回 dict）；若補 `PunchCorrectionBatchApproveResultOut` 更佳但非必須。

> 風險點（最需 TDD）：核准副作用（考勤寫入 + 薪資 stale）逐項複製的正確性與原子性。實作時務必先讀 `approve_punch_correction`（`api/punch_corrections.py:124+`）完整邏輯再抽函式，**單筆端點改為呼叫該共用函式**以確保一致。

### 3.2 前端 api：`batchApproveCorrections`（`src/api/punchCorrections.ts`）

```ts
export const batchApproveCorrections = (ids: number[], approved: boolean, rejection_reason: string) =>
  api.post('/punch-corrections/batch-approve', { ids, approved, rejection_reason })
```
比照 `batchApproveLeaves`（`api.post` 直連、payload 同形），**不走 OpenAPI 型別**（故不依賴 `schema.d.ts`）。

### 3.3 前端：`WorkbenchApprovalsView` 接上批次

- 對三類**各 new 一次** `useApprovalModule`：
  - leave：`{ docType:'leave', batchApproveFn: batchApproveLeaves, fetchFn: fetchPendingLeaves, recordLabel:'請假記錄' }`
  - overtime：`{ docType:'overtime', batchApproveFn: batchApproveOvertimes, fetchFn: fetchPendingOvertimes, recordLabel:'加班記錄' }`
  - correction：`{ docType:'punch_correction'（對齊後端 docType）, batchApproveFn: batchApproveCorrections, fetchFn: fetchPendingCorrections, recordLabel:'補打卡記錄' }`
  - 各取用 alias 解構（如 `selectedItems: selectedLeaves`、`showBatchApproveConfirm: approveLeavesBatch`、`canApprove: canApproveLeave`…），避免三組命名衝突（比照 LeaveView 的 alias 寫法）。
- 三張 `el-table` 各加：
  - `<el-table-column type="selection" :selectable="canApprove<type>" width="48" />`
  - `@selection-change="handleSelectionChange<type>"`
  - 區塊 header（或表格上方）一條批次動作列：「批次核准（N）」「批次駁回（N）」按鈕，`:disabled="selected<type>.length === 0"`、`:loading="batchLoading<type>"`。
  - 一個批次駁回 `el-dialog`（`v-model="batchRejectVisible<type>"` + reason textarea + `confirmBatchReject<type>`）。
- 單筆核准/駁回（`approveLeave` 等）保留不動。
- `canApprove` 同時可選擇性 gate 單筆按鈕（本批維持單筆現狀、僅用於 `:selectable`，避免行為擴張）。

## 4. 測試策略（TDD）

**後端**（`tests/test_punch_corrections*.py` 或新檔，沿用既有 client fixture + 建 PunchCorrectionRequest + admin login）：
- 批次核准 2 筆 pending → 兩筆 status=approved + **對應 attendance 已更新** + 薪資 mark_stale（斷言 needs_recalc/stale 旗標）。
- 批次含 1 筆非 pending / 1 筆自我核准 / 1 筆無資格 → 該筆進 `failed[]`、其餘成功（partial，且成功項確實落 DB＝原子性正確）。
- 批次駁回未填 reason → 400；填 reason → status=rejected、無考勤副作用。
- 權限：無 `APPROVALS` → 403。

**前端**（`src/views/workbench/__tests__/WorkbenchApprovalsView.*` 新；mount + mock 三組 api）：
- 選取請假列 → 點批次核准 → 斷言 `batchApproveLeaves` 帶 ids 被呼叫；補打卡同理斷言 `batchApproveCorrections`。
- 批次駁回 dialog：無 reason 擋下、有 reason 呼叫 batch fn（approved=false, reason）。
- `:selectable` 用 `canApprove`：mock 一筆 canApprove=false 的列不可選（或至少 canApprove 被當 selectable 傳入）。

## 5. 跨端同步 / 落地

- **新後端端點 → OpenAPI 變動**：但 FE `batchApproveCorrections` 走 `api.post` 直連、不引用 `schema.d.ts` 型別，故前端編譯不依賴重生；`gen:api` 重生收斂到既有的「BE push 同步」批次（與 [[2026-06-17-admin-list-experience-consistency-design]] 同樣的跨 repo desync 處置，不在本分支單獨重生）。
- **無 migration**（`PunchCorrectionRequest` model 不變）。
- 前後端各一支分支（worktree off `origin/main`），分開 commit；完成走 `finish-check.sh` 精神（push 與否依使用者）。

## 6. 實作順序（給 plan 參考）

1. 後端：`PunchCorrectionBatchApproveRequest` schema + 抽 `_apply_correction_decision` 共用函式（單筆端點改呼叫它）+ `batch_approve_punch_corrections` 端點 + pytest（先 RED）。
2. 前端 api：`batchApproveCorrections`。
3. 前端：`WorkbenchApprovalsView` 三類接 `useApprovalModule` + selection 欄 + 批次動作列 + 駁回 dialog + vitest。
