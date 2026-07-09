# 新學年預編班 — 工作台式 UI/UX 改版設計

- 日期：2026-07-09
- 範圍：**純前端**（`ivy-frontend`），後端 API、`useYearPlanWorkspace` 契約、schema 皆不動
- 相關：[[SPEC-012]]（`docs/spec/SPEC-012_classroom-year-plan.md`）、同日 spec `2026-07-09-year-plan-drag-move-design.md`（拖曳搬班，已落地）
- 主檔：`src/views/students/YearPlanWorkspaceView.vue` 與 `src/components/enrollment/planning/*`

## 背景與診斷（實測 dev 環境）

使用者反映頁面「太雜亂」。以 dev DB（198 筆未分班殘留資料）實測，雜亂來源依嚴重度排序：

1. **`PlanIssuesPanel` 是元凶**：207 筆阻擋 + 16 筆提醒逐筆平鋪成紅黃色長條，實測面板高度 **7090px**。進頁面先看到七千像素的「紅牆」，編班表與批次工具列全在畫面外。且內容高度重複——207 筆幾乎同一句話（`student_unassigned`），16 筆提醒只是「某班缺副班導/美語老師」×8 班，而這些資訊表格表頭的「待確認」徽章已表達過。
2. **表格底部「待分班（198）」收合區**：198 個名字單欄直列、預設展開，再吃數千像素。
3. **頁首五顆動作鈕常駐**（新增班級/重新產生建議/發布/撤回發布/作廢草稿），多數時候一半是灰的。
4. 編班表主體（年級跨欄試算表型）設計良好，**不是問題**，保留不動。

另發現**功能缺口**：「待分班」名單為純文字、無勾選框——未分班學生無法從 UI 批次分派（表格 checkbox 只涵蓋已分班學生，`studentsByClass` 只收 `plan_class_id != null` 者）。本次一併補上。

`onLocateIssue`（`YearPlanWorkspaceView.vue`）為空殼 stub，問題列點擊無反應；本次接線。

## 決策（brainstorm 已與使用者確認）

採**工作台式全面改版**（三方案中最大者）：主表 + 右側固定側欄、問題聚合、locate 接線、表頭凍結。純前端。

## 版面架構

雙欄 CSS grid：左側主區（自適應）+ 右側側欄（固定 320px）。兩欄各自獨立捲動（側欄 `position: sticky; top: 0; max-height` 對 `el-main` 捲動根），不再串成一條長頁。

```
┌ 頁首：標題 ─ 學年範圍 ─ 狀態badge ──── [動作鈕（依狀態）][更多⋯] ┐
├───────────────────────────────────┬──────────────────────────────┤
│ [已選 N 位 ─ 批次操作列]（勾選≥1 才浮出，sticky）│ ⛔ 阻擋 (207)     │
│ ┌─ 編班表 ────────────────────────┐│   ▸ 198 位學生尚未分派班級    │
│ │ 年級/班名/人數 三列表頭 sticky   ││   ▸ 8 個班尚未指派導師        │
│ │ 三師列不凍結                     ││   ▸ 1 班人數超過容量          │
│ │ …學生格（勾選、拖曳沿用）…       ││ ⚠ 提醒 (16)                  │
│ │                                 ││   ▸ 8 班缺副班導 ▸ 8 班缺美語 │
│ │                                 ││──────────────────────────── │
│ │                                 ││ 待分班 (198)〔搜尋/勾選/全選〕│
│ │                                 ││ ▸ 畢業名單 (52)（預設收合）   │
│ └─────────────────────────────────┘│ ▸ 排除名單 (3)（預設收合）    │
└───────────────────────────────────┴──────────────────────────────┘
```

視窗寬 < 1280px：側欄改為 `el-drawer` 抽屜，頁首放一顆帶計數 badge 的「問題與名單」開關鈕。

## 元件設計

### 1. `PlanIssuesSummary.vue`（重寫 `PlanIssuesPanel.vue`，同目錄替換）

- 依 `IssueOut.code` 聚合為「類型摘要行」：嚴重度圖示 + 類型標題 + 計數，**預設全部收合**。
- 已知 code 與標題對照（與後端 `services/classroom_year_plan/issues.py` 對齊）：
  - blocking：`student_unassigned` 尚未分派班級／`retain_wrong_grade` 留級年級不符／`capacity_exceeded` 超過容量／`head_teacher_missing` 尚未指派導師／`teacher_duplicate` 教師重複指派／`student_missing_from_plan` 在籍生不在草稿
  - warnings：`plan_student_inactive` 已非在籍生／`assistant_teacher_missing` 缺副班導／`art_teacher_missing` 缺美語老師
  - **未知 code fallback**：以原始 `message` 首筆為組標題（前端不得因新增 code 而壞版）。
- 展開一組 → 逐筆列（沿用後端 `message`），逐筆列可點擊 → emit `locate-issue`（沿用既有事件名與 payload `IssueOut`）。
- 空狀態：「目前沒有偵測到問題」+ 成功色小圖示。

### 2. `PlanSidePanel.vue`（新增）

側欄容器，由上而下三段：

1. `PlanIssuesSummary`（上）
2. **待分班區**（中，僅在有未分班學生時顯示；正常流程本不應出現，沿用現有防呆語意）：
   - 每人一列：`el-checkbox` + 姓名 + 原班名（小字）。
   - 頂部：搜尋框（依姓名 filter）+ 全選（作用於 filter 後可見集合）+ 計數。
   - 勾選寫入**共用 selection**（見下），批次操作列一體適用。
   - 列可拖曳（`draggable`，僅 editable 時）→ 拖入表格班級欄，重用 `student-move`（`op:'assign'`）派發經路。側欄自身**不是拖放目標**（維持 drag-move spec 決策 2）。
   - **跨元件拖曳機制**：`PlanRosterTable` 的 `draggingStudent` 為內部 ref，側欄發起的拖曳不會設定它。處理：側欄 `dragstart` 以 `dataTransfer.setData('text/plain', String(studentId))` 攜帶 id（與表格內拖曳既有寫法一致）；表格 `onDrop` 在內部 state 為 null 時 fallback 讀 `dataTransfer.getData`（未分班學生 `planClassId=null`，任何班皆非同班、必派發）；`onDragOver` 高亮判斷放寬為「內部 state 存在**或** `event.dataTransfer.types` 含 `text/plain`」。jsdom 測試沿用既有慣例（程式化 dispatch 自帶 mock dataTransfer）。
3. **畢業/排除名單**（下，`el-collapse` 預設收合）：緊湊列表（姓名 + 原班 + 排除原因），唯讀。

清單長度防護：待分班/畢業/排除每段內容區 `max-height`（約 40vh）+ `overflow-y: auto`，超長清單在段內捲動，不撐爆側欄。

### 3. `PlanRosterTable.vue`（修改）

- **移除**底部 `el-collapse` 三段（搬去 `PlanSidePanel`）。
- **表頭 sticky**：年級列/班名列/人數列凍結（`thead` 前三列 `position: sticky` + 逐列 `top` 偏移，行高固定化以便計算）；三師列不凍結。左側 row-label/序號欄 sticky 沿用。角落格 z-index 提高避免交疊破版。
- **locate 高亮**：`defineExpose({ locateStudent(id), locateClass(planClassId) })`——捲動（垂直 + 水平）至目標格/班欄並加 `flash-highlight` class（CSS animation ~1.6s 後自動移除）。找不到目標（例如學生不在表內）回傳 `false` 讓呼叫端 fallback。
- 勾選/拖曳/容量徽章/「待確認」徽章行為不變。

### 4. `PlanBatchToolbar.vue`（修改）

- 改為**浮出式**：`selectedCount === 0` 時不渲染（`v-if` 由父層控制），勾選 ≥1 才出現，sticky 於主區頂端。
- 新增「清除選取」按鈕（emit `clear-selection`）。
- 操作項不變：移至班級/標記留級/排除/還原建議（含既有確認框行為）。

### 5. `YearPlanWorkspaceView.vue`（修改）

- **selection 上收**：`selectedStudentIds` 的單一事實來源移至本層（`Set<number>`），`PlanRosterTable` 與 `PlanSidePanel` 改為受控（props `selected-ids` + emit `toggle-student`）。plan.version 變更時清空 selection 的既有語意保留（watch 移到本層）。
- **頁首動作鈕依狀態顯示**：
  - `none`：空狀態內「產生草稿」CTA（現狀不變）。
  - `draft`：新增班級／重新產生建議／發布（primary）。
  - `published`：撤回發布。
  - `applied`：無寫入動作。
  - 「作廢草稿」（draft/published 皆可）收進「更多 ⋯」`el-dropdown`，維持 danger 樣式與既有二次確認文案。
  - `canWrite`（`CLASSROOMS_WRITE`）守衛全部沿用。
- **`onLocateIssue` 接線**：
  1. `issue.student_id` 存在且該生在表格（已分班）→ `rosterRef.locateStudent()`；
  2. `issue.student_id` 存在但未分班 → 展開側欄待分班區、捲動至該人並閃爍；
  3. 僅 `plan_class_id` → `rosterRef.locateClass()`；
  4. 皆無（理論不發生）→ no-op。
- 頁首的「阻擋 N/提醒 N」chips 移除（側欄摘要已承載），保留狀態 badge。
- dialogs（發布/班級編輯/重新產生）與 409 版本衝突處理完全不動。

## 資料流（不變項）

- 所有 mutation 仍走 `useYearPlanWorkspace` 單一狀態來源；成功後 `reload()`。
- `student-move`/`bulk-op` payload 契約不變；後端零改動。
- OpenAPI 型別沿用 `Schema<'IssueOut'>` 等 `_generated/typed`。

## 樣式規範

- 全部使用既有 design tokens（`--space-*`、`--color-*-soft/hover`、`--neutral-*`、`--radius-*`、`--text-*`），不引入新色票。
- 深淺色模式：admin 端已有 `html.dark`，新樣式一律以 token 表達（token 已雙模式），不寫死色值。
- 不新增第三方依賴。

## 測試計畫（Vitest，沿用既有測試慣例）

改寫既有四檔 + 新增：

1. `PlanIssuesSummary`：聚合計數正確（同 code 併組）、未知 code fallback、展開後逐筆點擊 emit `locate-issue`、空狀態。
2. `PlanSidePanel`：待分班搜尋 filter、全選只作用於可見集合、勾選 emit、畢業/排除收合渲染。
3. `PlanRosterTable`：移除底部收合區後既有勾選/拖曳測試調整；`locateStudent`/`locateClass` 回傳值與 class 附加（jsdom 無 scroll 行為，斷言 class 與呼叫）。
4. `PlanBatchToolbar`：selectedCount=0 不渲染、清除選取 emit。
5. `YearPlanWorkspaceView`：selection 上收後 version 變更清空、動作鈕依 state 顯隱、`onLocateIssue` 三分支派發、共用 selection 跨表格/側欄合併派發 bulk op。

## 明確不做（YAGNI）

- 虛擬捲動（207 筆聚合後無需求）。
- 側欄作為拖放目標（維持 drag-move spec 決策）。
- 觸控拖曳支援（admin 桌機限定，同 drag-move spec）。
- 後端 issues 聚合 API（前端聚合即可，資料量小）。
- 表格本體版面改動（試算表型保留）。

## 風險

- sticky 多列表頭在 `el-main` 捲動根下的偏移計算：以固定行高 + CSS 變數處理；若 Element Plus 版本樣式干擾，退階為只凍結班名列。
- 共用 selection 重構觸及既有測試較多：以行為保持測試先行（TDD），確保勾選→批次派發經路不回歸。
