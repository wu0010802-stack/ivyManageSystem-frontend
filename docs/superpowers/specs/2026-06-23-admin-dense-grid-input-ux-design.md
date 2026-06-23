# Admin 密集網格輸入體驗（第二批）設計

- 日期：2026-06-23
- 範圍：園方管理端（Admin/HR）兩個「密集數字矩陣 + 整批 dirty 儲存」網格的輸入體驗
- 性質：**100% 前端主導，無後端、無 schema 異動、無 migration、無 OpenAPI 漂移**（沿用既有端點）
- 來源：admin UX 盤點 workflow（`.scratch/admin-ux-survey-2026-06-17/REPORT.md`）主題 8「密集網格輸入無鍵盤導航與離開未存保護」、Top12 #7 與相關速贏
- 延續：第一批「列表體驗一致化」（`2026-06-17-admin-list-experience-consistency-design.md`）的「抽共用 primitive 再套 N 處」模式

---

## 1. 背景與問題

盤點主題 8 指出 admin 端高密度手打網格「無 enter/tab 跳格、無沿用上月、離開未存無攔截、無原值對照」，最容易填錯與「忘按儲存整批丟資料」。原盤點列了 4 個網格，**經探查員逐一核實，2 個前提是錯的**（與第一批「依真實資料模型收緊範圍」相同）：

| 網格 | 探查結論 | 是否納入 |
|------|---------|---------|
| **考核手填事件** `views/appraisal/components/ManualEventEntrySection.vue` | 14 個 `el-input-number` × N 員工列；整批「儲存變更(N)」按鈕 + dirty 追蹤（`counts` vs `original` 巢狀快照）。**無鍵盤導航、無離開未存攔截、原值不渲染、無沿用上週期** | ✅ 納入 |
| **月度固定費用** `views/reports/MonthlyFixedCostPanel.vue` | 8 類 × 12 月 = 96 個原生 `<input type="number">`；整批「儲存全部(N)」+ dirty 染色。**無鍵盤導航、無離開未存攔截（換年度 `:key` 重建還會靜默丟 state）、看不到原值數字、無套用全年** | ✅ 納入 |
| 批次評量 | ❌ **不存在**。學生評量全是單筆 Dialog（`StudentAssessmentView` / `AssessmentEditorDialog`），無批次網格。要做等於**新建功能頁**，非 UX 改善 | ❌ 排除（後續，新功能） |
| 考勤補登 | ❌ 補登**早已用 `el-time-picker`**（非純文字 HH:MM），且**逐筆即時 POST `/attendance/record`**（未存風險低）。逗號分隔 `HH:MM,HH:MM` 只屬「匯入」路徑。唯一缺口是看不到「排班應到時間」對照 → 後端資料題 | ❌ 排除（後續，屬「可信數字/breakdown」主線） |

**核實後真正符合「密集網格輸入體驗」的只有 2 個網格，且結構幾乎一致**（密集數字矩陣 + 整批 dirty 儲存），故抽共用 primitive 套兩處最划算。

### 既有資料模型（探查員已確認的識別子，實作直接採用）

**考核 `ManualEventEntrySection.vue` + `composables/useManualEventEntry.ts`**
- 14 欄來自 `MANUAL_ITEM_CODES`（`useManualEventEntry.ts:7-22`），每格 `el-input-number`（`ManualEventEntrySection.vue:64-74`），`:precision="0"` `:step="1"`
- 編輯資料：巢狀 map `counts = ref<Record<string, Record<string, number>>>`，key = `String(participant_id)` → `{ [item_code]: count }`；`original` 為載入時深拷貝快照（`useManualEventEntry.ts:41-62`）
- dirty：`dirtyEntries` computed（`:70-82`）攤平成 `{ participant_id, item_code, count }[]`；按鈕在 `dirtyEntries.length === 0` 時 disabled
- 存：`batchUpsertManualEventCounts(cycleId, { entries })` → `PUT /appraisal/cycles/{id}/manual_event_counts:batch`（`api/appraisal.ts:135`），存後 `await load()` 重置快照
- readonly：`CurrentSemesterOverview.vue:535` 傳 `:readonly="currentCycle.status !== 'OPEN'"`
- 列來源：props `participants`（含 `employee_name`、`participant_id`、`employee_id`）

**固定費用 `MonthlyFixedCostPanel.vue`**
- 8 類寫死 `CATEGORIES`（`:18-27`）× 12 月 `MONTHS`（`:15`）= 96 原生 `<input type="number">`（`:266-276`）
- 編輯資料：`cellState = reactive(new Map())`，key = `${month}-${category}`，value = `{ original: number|null, current: number|null }`（`:38-42`）；getter `getCurrent(m,c)`、setter `setCurrent(m,c,v)`（`:80-100`，含 `Number()`+`>=0`+`Math.trunc()` 校驗）
- dirty：`isDirty(m,c)`（`current !== original`）、`dirtyEntries`（`:109-127`）、`dirtyCount`（`:129`）；dirty 格套 `cell-dirty` 染色（`:263` + CSS `:413-416`），但**看不到原值數字**
- 存：`saveAll()` → `batchUpsertMonthlyFixedCosts(year, dirtyEntries)` → `PUT /monthly-fixed-costs/batch`（`api/monthlyFixedCost.ts:13`），存後 `await load()` rebuild
- 掛載：`ReportsView.vue:44` tab `fixed-cost`，`:key="selectedYear"`（**換年度整個元件重建 → 丟 state**）
- `defaultAmount` 僅 placeholder 提示、不自動帶入（`:17`、`:210`）

## 2. 目標 / 非目標

**目標**
- 抽 2 個共用 composable（鍵盤導航、未存攔截），套到 2 個密集網格，讓密集手打可用鍵盤連續輸入、且未按儲存就離開會被攔。
- 兩網格都把「原值」顯示出來，HR 對帳/覆核時看得到改了什麼、改前是多少。
- 各網格補一個「少打字」加值：固定費用「套用到全年/複製上月」、考核「沿用上一週期」。

**非目標（YAGNI）**
- 不新建「批次評量」網格（屬新功能，另案）。
- 不做考勤排班應到時間對照（需後端在 record payload 帶 scheduled time，屬「可信數字/breakdown」主線）。
- 不改考勤補登（已用 `el-time-picker` + 逐筆即時送，未存風險低）。
- 不做左右方向鍵接管游標（沿用瀏覽器原生 Tab 即可，避免跟數字框游標打架）。
- 不做整頁草稿持久化（`useFormDraft` 是另一回事，見 §3.2 註）。

## 3. 架構

### 3.1 `useGridKeyboardNav`（新，`src/composables/useGridKeyboardNav.ts`）

容器層鍵盤導航，pattern 無關、與 Element Plus 解耦。

**契約**
```ts
useGridKeyboardNav(container: Ref<HTMLElement | null>): void
```
- 在 `container` 掛一個 `keydown` listener（`onMounted` 加、`onScopeDispose` 移）。
- 每個可輸入格在 template 標 `data-grid-row="<rowIdx>"` `data-grid-col="<colIdx>"`（標在 `el-input-number` 或原生 `<input>` 的外層 wrapper，或直接標在原生 input 上）。
- **鍵位**：
  - `Enter` / `ArrowDown` → 移到下一列同欄（`row+1, col`）
  - `Shift+Enter` / `ArrowUp` → 上一列同欄（`row-1, col`）
  - 左右：不接管，交給瀏覽器原生 Tab（`ArrowLeft/Right` 維持游標在數字框內移動的原生行為）
- **找下一格**：`container.querySelector('[data-grid-row="r"][data-grid-col="c"]')`，再 `.querySelector('input') ?? el`（相容 `el-input-number` 內層 input 與原生 input），`.focus()` + `.select()`（全選方便覆寫）。
- **邊界**：目標列/欄不存在時不動（不繞回、不換欄）。
- **只在格內按鍵才處理**：`event.target` 需是 input（避免攔到非格子的 Enter）。`ArrowUp/Down` 在數字框會觸發 step，需 `preventDefault()` 後改為移焦點。

> 為何容器層 + data 屬性而非每格綁 handler：兩網格一個用 `el-input-number`、一個用原生 input，容器層統一處理避免改動每格綁定，且 row/col 由 `v-for` index 自然產生。

### 3.2 `useUnsavedChangesGuard`（新，`src/composables/useUnsavedChangesGuard.ts`）

dirty 時攔截離開，與 vue-router 整合。

**契約**
```ts
useUnsavedChangesGuard(isDirty: () => boolean): {
  confirmDiscard: () => Promise<boolean>   // 元件內切換用（如換年度）：dirty 時跳確認，回 true=可丟棄
}
```
- `onBeforeRouteLeave`（從 `vue-router` import）：`isDirty()` 為真時 `await ElMessageBox.confirm('尚有未儲存的變更，確定離開並捨棄？', '未儲存變更', { type: 'warning' })`，使用者確認 → `next()`/return true，取消 → `return false`/`next(false)`。
- `beforeunload`（`window`，`onMounted` 加、`onScopeDispose` 移）：`isDirty()` 為真時 `e.preventDefault(); e.returnValue = ''`（觸發瀏覽器原生「離開網站？」）。
- `confirmDiscard()`：給元件內非路由切換用（固定費用換年度）；`isDirty()` 為假直接回 `true`，為真跳同一個 confirm。

> **註：勿與 `useFormDraft` 混淆。** `useFormDraft.ts`（`:241-243`）的 `beforeunload` 是去 `flush()` 把草稿**存進 localStorage**（持久化/可還原），**不是攔截導航**。本 composable 只負責「dirty 時警告/攔截」，不做持久化。兩者關注點不同，不互相取代。

### 3.3 原值對照（display，各網格自理）

- **考核**：`getCount(pid, code)` 與 `original[pid][code]` 不同時，在格下方顯示小灰字「原 {origN}」（`original` 快照已存在於 composable，目前未渲染 → 由 composable 多匯出一個 `getOriginal(pid, code)` getter，template 渲染）。
- **固定費用**：dirty 格（`isDirty`）在 input 下方/tooltip 顯示原值數字（`cellState.get(key).original`，`null` 顯示「—」）。目前只有染色，補上原值文字。

### 3.4 加值

**固定費用「套用到全年 / 複製上月」（`MonthlyFixedCostPanel.vue`，純前端）**
- 每個 category 列尾加一個「套用到全年」動作：把該列「當前選定參考月」（預設取該列第一個有值的月，或當前操作月）的 `current` 值，用 `setCurrent` 寫進該列 12 個月（標 dirty，不自動存）。覆蓋已有值前以 `ElMessageBox.confirm` 確認。
- 「複製上月」：每格（或每列）把 `m-1` 月的 `current` 帶到 `m` 月。
- 實作只透過既有 `setCurrent` → 自動進 dirty 流程，無新 API。

**考核「沿用上一週期」（`ManualEventEntrySection.vue` + `useManualEventEntry.ts`，純前端、用既有端點）**
- 按鈕「沿用上一週期」，僅 `readonly === false`（cycle `OPEN`）顯示/可用。
- 流程（composable 內新增 `inheritFromPreviousCycle()`）：
  1. `listAppraisalCycles()` 取全部週期，排序 `(academic_year, semester)` 升冪，找出當前 cycle 的**前一個** cycle（無前期 → toast「找不到上一週期」並 return）。
  2. `listAppraisalParticipants(prevCycleId)` 建 `prevParticipantId → employee_id` 映射；當期 participants（props）建 `employee_id → currentParticipantId` 映射。
  3. `getManualEventCounts(prevCycleId)` 取上一期手填值（`{ participant_id, item_code, count }[]` 或巢狀，依實際回傳）。
  4. 逐筆：用 `employee_id` 把上一期值對映到**當期** participant_id，`setCount(currentPid, code, count)`（標 dirty、不自動存）。對映不到的 employee（新進/離職）略過。
  5. 覆蓋當期非空格前以 `ElMessageBox.confirm` 提示（例如「將以上一週期數值覆蓋，已填寫的值會被取代」）。
- **employee_id 對映是關鍵**：手填值以 participant_id 為 key，但 participant 每週期一份，跨週期必須走 employee_id。若 `getManualEventCounts` 回傳已含 `employee_id` 則可省略步驟 2 的 prev 映射（實作時先確認回傳形狀）。

## 4. 後端觸點

**無。** 全部使用既有端點：`listAppraisalCycles` / `listAppraisalParticipants` / `getManualEventCounts` / `batchUpsertManualEventCounts` / `batchUpsertMonthlyFixedCosts`。無 router、無 Pydantic、無 migration、無 `schema.d.ts` 重生（不碰 OpenAPI drift gate）。

## 5. 測試策略（TDD，全 Vitest）

**composable 單測先行**
- `useGridKeyboardNav`：mount 一個 2×2 假網格（含 `data-grid-row/col` 的 input），按 Enter → 焦點移下一列同欄；Shift+Enter → 上一列；底列按 Enter 不動（邊界）；ArrowDown 等同 Enter 且 `preventDefault`（不觸發 number step）。
- `useUnsavedChangesGuard`：`isDirty()=false` → `onBeforeRouteLeave` 放行、`beforeunload` 不擋；`isDirty()=true` → confirm 被呼叫、確認則放行/取消則攔；`confirmDiscard()` 在 clean 直接回 true、dirty 跳 confirm。（`ElMessageBox.confirm` mock；vue-router guard 以掛載於假路由元件或直接測註冊的 guard fn。）

**網格整合測**
- 考核：原值對照——改一格後顯示「原 N」；沿用上一週期——mock 三個 api，斷言以 employee_id 對映且填入後 `dirtyEntries` 含對映筆數、對映不到的 employee 略過、覆蓋前 confirm。
- 固定費用：套用到全年——某列套用後 12 月 current 一致且全 dirty；複製上月；原值對照——dirty 格顯示原值；換年度時 dirty → `confirmDiscard` 被呼叫。

**既有測試不可回歸**：兩網格既有 vitest（若有）需維持綠。

## 6. 落地與收尾

- 前端 worktree，**off `origin/main`**：先驗證本批要動的檔（兩網格、兩 composable 新檔、`useManualEventEntry.ts`）在 `origin/main` 與 `local main` 一致（即那些未 push 的領先 commit 沒碰它們）→ off origin/main 既正確又乾淨；若有碰則 off local main。參考第一批 worktree 守則與記憶 [[feedback_worktree_off_local_main_dangerous]]。
- 分支：`feat/admin-dense-grid-input-2026-06-23-fe`。
- 驗證：`npm run typecheck` 0 error、新增/既有 vitest 全綠、`npm run lint`（no-explicit-any gate）。**無 `gen:api`/`gen:api:check`（未動契約）**。
- `--no-ff` 併入 `local main`，不動其他 WIP（user 既有 `schema.d.ts` / unit test 改動）。worktree 當天 `git worktree remove`，分支以 `--is-ancestor … main` 守衛後刪。
- 完成定義（CLAUDE.md DoD）：本批 merge local main 後仍**未 push**（與既有 40 commit 一致，push 屬另一個收尾決策）。

## 7. 風險與緩解

- **鍵盤導航與數字框 step 衝突**：ArrowUp/Down 在 `el-input-number`/原生 number 預設會加減值 → handler 必 `preventDefault()` 再移焦點。已在 §3.1 與測試涵蓋。
- **沿用上一週期覆蓋已填值**：必經 confirm；只標 dirty 不自動存，使用者仍可不按儲存而捨棄。
- **employee 對映遺漏**：新進/離職 employee 對映不到時略過（不報錯），並可在 toast 提示「N 位對映成功 / M 位略過」。
- **固定費用換年度丟 state**：`:key="selectedYear"` 重建是既有行為；本批加 `confirmDiscard()` 攔在換年度前，不改 `:key` 機制。
