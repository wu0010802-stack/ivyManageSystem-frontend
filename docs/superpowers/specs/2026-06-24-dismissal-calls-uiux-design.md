# 接送通知 UI/UX 優化設計（2026-06-24）

## 背景與痛點

接送通知（dismissal call）功能目前有三個 UI 面：

1. **管理端看板** `views/DismissalQueueView.vue`（admin/hr/supervisor，看板 + 歷史表格）
2. **教師 portal** `views/portal/PortalDismissalCallsView.vue`（老師手機接收 + 確認放學）
3. **共用接送卡片** `components/dismissal/DismissalCallCard.vue`（兩端共用呈現）

整套已相當成熟（等候升級色、FIFO 排序、姓名圓徽、WS 即時 + 重連 liveness、聲音/震動/瀏覽器推播、空狀態、連線 banner、reduced-motion、觸控尺寸、WCAG 對比）。

**唯一明確痛點：櫃台發起太麻煩。** 現況建立一筆通知需 5–6 個動作（點「建立通知」→ 載入 500 筆學生 →（可選）班級篩選 → 點學生下拉 → 打字/捲動找名字 → 選取 →（可選）備註 → 點建立），且**一個 Dialog 一個孩子**。放學尖峰多位家長同時到，櫃台得重複開關 Dialog。

優化重點（user 指定）：**資訊清晰一眼辨識 + 操作效率**。

## 目標

把櫃台發起從「彈窗逐筆」改成「點名單一點發起」（Approach A），並順帶提升看板/卡片/portal 的一眼辨識度。**前端 only，不動後端 schema / 端點。**

## 資料面前提（已確認）

- `DismissalCallOut` 含 `student_id` / `classroom_id`（`api/dismissal_calls.py:57-68`）→ 看板能以 `student_id` 交叉比對「哪些學生已在通知中」。
- `getStudents({ is_active: true, limit: 500 })` 回 `{ items: [{ id, name, classroom_id, ... }] }`，建立 Dialog 已在用。
- `createDismissalCall({ student_id, classroom_id, note? })` 一個學生一個 POST；同學生已有 pending/acknowledged 回 **409**。無批次端點，也不需要（一點即發 = 一個 POST）。
- `classroomStore.classrooms` 提供班級 id→name。

## 設計

### 1. 新 composable：`useDismissalRoster`（純邏輯，TDD）

把點名單的篩選/分組/標記抽成可單測的純函式，元件只負責渲染（對齊既有 `useDismissalUrgency` 的風格）。

純函式：

- `activeCallStudentIds(calls)`：回傳 status 為 `pending`/`acknowledged` 的 `student_id` `Set`。
- `matchStudent(name, query)`：trim + 不分大小寫的子字串比對；空 query 視為全中。
- `buildRoster(students, classrooms, calls, query)`：
  - 依班級分組（班級依 `classrooms` 給定順序；班級內學生依 `name` localeCompare 排序）。
  - 每位學生標 `notifying: boolean`（`student_id ∈ activeCallStudentIds`）。
  - 套用 `query` 後**略過沒有任何相符學生的班級**。
  - 未分班（classroom_id 無對應）歸入「未分班」群組殿後。
- 回傳形狀：`RosterGroup[] = [{ classroomId, classroomName, students: RosterStudent[] }]`，`RosterStudent = { id, name, classroomId, notifying }`。

`buildRoster` 不含 inFlight（建立中）狀態——inFlight 屬元件即時 UI 狀態，由元件層疊加，不入純函式（避免把瞬時互動狀態混進可測純邏輯）。

### 2. 管理端看板 `DismissalQueueView.vue`

`active` 視圖版面由上而下：頁首 → 搜尋框 → 待接送卡片（現有）→ 點名單。

- **掛載時載入學生**：`getStudents({ is_active: true, limit: 500 })` 提升到 `onMounted`（與 `fetchCalls`/`fetchClassrooms` 併入 `Promise.all`），存 `students` ref；建立 Dialog 改共用此 `students`，不再各自重載。
- **搜尋框** `rosterQuery`：即時篩點名單；roster 用 `buildRoster(students, classrooms, activePendingCalls, rosterQuery)`。
- **點名單**：分班顯示，每位學生一個 chip。
  - `notifying`（已在通知中）→ 灰底 + ✓「通知中」+ 停用（從源頭擋 409）。
  - `inFlight`（建立中）→ spinner +「建立中」+ 停用。
  - 其餘 → `⊕` 可點。
- **一鍵發起** `handleQuickCreate(student)`：
  1. 若 `notifying` 或 `inFlight` → 忽略。
  2. `inFlight.add(student.id)`（即時回饋）。
  3. `await createDismissalCall({ student_id, classroom_id })`（不帶 note）。
  4. 成功：`await fetchCalls()`（重抓列表，保證新通知入列、chip 轉 notifying），再 `inFlight.delete`。
  5. 409：`fetchCalls()` 補狀態 + `ElMessage.info`（多半是他人剛建立）；其他錯誤：`ElMessage.error` + `inFlight.delete`。
- **WS `dismissal_call_created` 加 id 去重**：`if (calls.value.some(c => c.id === payload.id)) return` 再 unshift。修既有隱患——自己建立時 `fetchCalls()` 已入列、WS echo 又 unshift 會雙加同一筆（管理端訂 `dismissal.admin` 會收到自己建立的廣播）。此去重同時讓 Dialog 路徑與一鍵路徑都安全。
- **備註路徑保留**：現有「建立通知」Dialog 收進右上次要按鈕（如「備註發起」），供少見的需備註情境；快速路徑（點 chip）不帶備註。
- 搜尋框與點名單**僅在 active 視圖**顯示（歷史表格視圖不顯示）。

### 3. 共用卡片 `DismissalCallCard.vue`（輕修）

- `critical`（等候 ≥ 8 分）的等候 chip 字級加大，強化「最久沒被接」的主視覺。
- 其餘維持，避免破壞既有無障礙與測試。

### 4. 教師 portal `PortalDismissalCallsView.vue`（輕修）

- 頁首標題旁加「待接送 N」即時計數（`activeCalls.length`），老師一眼知道還有幾位。
- 其餘（聲音/震動/推播/連線 banner/sticky/重連）維持。

## 明確不做（YAGNI）

- 不接 attendance「今日在校」資料源；v1 點名單 = 在籍 `is_active` 學生 + 搜尋已足夠，且純前端無後端依賴。
- 不做批次多選發起（一點即發已覆蓋尖峰節奏）。
- 不重寫卡片、不動 WS 連線/重連架構、不動後端 schema/端點。

## 測試策略

- `useDismissalRoster`：純函式單測（分組順序、姓名排序、notifying 標記、query 篩選略過空班、未分班殿後、邊界空輸入）。對齊 `__tests__/useDismissalUrgency.test.ts`。
- 元件層：沿用既有 vitest 慣例；至少覆蓋一鍵發起的 inFlight→notifying 流程與 WS id 去重（若既有 view 測試模式允許）。
- 既有 `useDismissalUrgency.test.ts`（21）須維持綠。

## 風險

- `getStudents` limit 500：若單園在籍 > 500 會截斷點名單。本園規模遠低於此；逾量再加分頁/班級分批載入（v1 不做）。
- 多櫃台併發對同學生：一端點完 chip 轉 notifying，另一端若在 WS 同步前點到，後端 409 已擋，前端友善處理。

## Git

- 於 `feat/dismissal-uiux-v1` worktree（off `origin/main`）開發；前端分開 commit；push 與否由 user 決定（push 前端 = 觸發 Zeabur 部署）。
