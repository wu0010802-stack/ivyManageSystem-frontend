# 招生漏斗 Phase B（前端 Kanban） — Design

- 日期：2026-05-22
- 範疇：前端（`ivy-frontend`）
- 依賴：Phase A 後端（spec `ivy-backend/docs/superpowers/specs/2026-05-22-recruitment-funnel-phase-a-design.md`）已完工
- 先決條件：Phase A 已 merge 入 BE main、OpenAPI codegen 跑過、`src/api/_generated/schema.d.ts` 含 `/recruitment/funnel/*` 與 `/academic-terms/*` 路徑

## 1. 背景與目標

Phase A 完成 4 階段 state machine + API + scheduler。Phase B 補上前端：

- Kanban 看板 4 欄拖拉 — 第 10 個 tab「招生漏斗」嵌進 `RecruitmentView.vue`
- 4 種推進 dialog（含 destructive reason 與 class dropdown）
- timeline drawer 顯示完整事件流
- `SettingsView` 新 sub-tab「學年/學期」維護 `academic_terms`

UX 原則：
- 拖拉**樂觀更新** + 失敗 revert（destructive 先彈 confirm 後才動）
- 預設過濾「當期學年/學期」，可切其他學期
- 權限不足時前端粗略 gate，BE 為最終守門人

## 2. 架構與檔案結構

### 新增依賴

`vuedraggable@next` + `sortablejs`（一次 install）。

### 新檔案

```
src/api/
  recruitmentFunnel.ts          # /recruitment/funnel/* wrapper
  academicTerms.ts              # /academic-terms wrapper

src/stores/
  recruitmentFunnel.ts          # Pinia store

src/components/recruitment/funnel/
  FunnelBoard.vue               # 頂層 Kanban + 學期切換 + summary bar
  FunnelColumn.vue              # 單欄 + draggable 容器
  FunnelCard.vue                # 單張卡片
  TransitionConfirmDialog.vue   # 三模式 confirm dialog（純 / dropdown / destructive）
  TimelineDrawer.vue            # 右側 drawer
  FunnelSummaryBar.vue          # 4 階段人數 + 轉換率

src/components/settings/
  SettingsAcademicTermsTab.vue  # 學年/學期 CRUD
```

### 修改現有

| 路徑 | 變動 |
|---|---|
| `src/views/RecruitmentView.vue` | 第 10 個 `el-tab-pane` 掛 `<FunnelBoard>` |
| `src/views/SettingsView.vue` | sub-tab「學年/學期」掛 `<SettingsAcademicTermsTab>` |
| `package.json` | `vuedraggable@next` + `sortablejs` |

### 元件邊界

- 每元件單一職責、≤ 200 行
- `FunnelBoard` 只做 layout + store 訂閱；不做拖拉邏輯
- `FunnelColumn` 只是 draggable 容器；不知道拖完該做什麼（emit 上去）
- `FunnelCard` 純顯示 + click 開 drawer
- dialog/drawer 自管 UX，不知道 store
- 一個 store 涵蓋 funnel 全狀態；academic_terms 設定頁無需 store

## 3. Pinia Store `useRecruitmentFunnelStore`

### State

```ts
interface State {
  board: {
    stages: Record<Stage, FunnelCard[]>
    summary: FunnelSummary
  } | null

  filter: {
    schoolYear: number | null   // null = 後端推導當期
    semester: 1 | 2 | null
  }

  timelines: Record<number, TimelineEvent[]>   // by visit_id

  loadingBoard: boolean
  loadingTimeline: Record<number, boolean>
  pendingTransitions: Set<number>              // visit_ids 拖拉中
}
```

### Getters

```ts
getStageCards(stage: Stage): FunnelCard[]
getCardByVisitId(visitId: number): FunnelCard | undefined
getTimelineByVisitId(visitId: number): TimelineEvent[] | undefined
isPending(visitId: number): boolean
```

### Actions

| action | 行為 |
|---|---|
| `loadBoard(opts?: { force?: boolean })` | GET `/funnel/board`；填 state.board |
| `setFilter(year, semester)` | 改 filter → 自動 loadBoard |
| `transition(visitId, toStage, { classroomId?, reason? })` | **optimistic** 移卡 + add to pending → POST → 成功更新；失敗 revert + throw |
| `loadTimeline(visitId, force=false)` | cache hit 直接回；否則 GET → 填 |
| `invalidateTimeline(visitId)` | 移除 cache entry |
| `$reset()` | 清空 state（離開 RecruitmentView 時呼叫） |

### `transition()` 樂觀更新細節

```ts
async transition(visitId, toStage, { classroomId, reason }) {
  const before = this._snapshotCard(visitId)
  this._moveCardOptimistically(visitId, toStage)
  this.pendingTransitions.add(visitId)

  try {
    const result = await api.transitionVisit(visitId, { ... })
    this._applyServerResult(visitId, result)
    this.invalidateTimeline(visitId)
    return result
  } catch (err) {
    this._restoreCard(before)
    if (err.response?.status === 409) this.loadBoard({ force: true })
    throw err
  } finally {
    this.pendingTransitions.delete(visitId)
  }
}
```

### 不做

- WebSocket / SSE 即時推播
- Timeline 分頁
- Board 分頁

## 4. 元件職責

### `FunnelBoard.vue`（~120 行）

- 訂閱 store
- 學年/學期 `<el-select>` + 「重新整理」按鈕
- 首次 mount filter 為 `{ schoolYear: null, semester: null }`，BE 自動推導當期；user 切換後送顯式 year+sem
- layout：`<FunnelSummaryBar>` → 4 個 `<FunnelColumn>`
- mounted: `store.loadBoard()`
- beforeUnmount: 不 reset（保留切回 tab 時的 state）
- `beforeRouteLeave`（在 RecruitmentView）：`store.$reset()`

### `FunnelColumn.vue`（~150 行）

- props：`stage`、`cards`、`title`、`accentColor`
- emits：`@card-click(card)`、`@transition-attempt({ fromStage, toStage, visitId })`
- 內含 `<draggable>` group="funnel"
- onDragChange 解讀 added/removed，emit 上去
- 空狀態 placeholder

### `FunnelCard.vue`（~80 行）

- props: `card: FunnelCard`
- emits: `@click()`
- 顯示：child_name 粗體 + grade chip + phone 淡 + district 淡 + source tag + (有 student_id) student_id badge
- `isPending` 時 opacity 0.5
- 無權限時 `cursor: not-allowed` + tooltip

### `TransitionConfirmDialog.vue`（~120 行）

三模式 by `(fromStage, toStage)`：

- **dropdown 模式**（deposited → enrolled）：classroom dropdown 必選；reason optional
- **destructive 模式**（enrolled/active → 前段）：警告文字 + 必填 reason textarea；enrolled→deposited 額外提示會刪 student
- **單純 confirm**（visited↔deposited / enrolled↔active）：短訊息 + 確認/取消

emit `@confirm({ classroomId?, reason? })` 或 `@cancel()`。

### `TimelineDrawer.vue`（~100 行）

- props: `open`、`visitId`
- watch visitId → `store.loadTimeline(visitId)`
- 倒序列出 events：時間 / source badge / event_type 中文化 / from→to stage / actor / reason
- 不做「快速刪除訪視」（YAGNI）

### `FunnelSummaryBar.vue`（~50 行）

- props: `summary`
- 4 chip + 3 個轉換率百分比

### `SettingsAcademicTermsTab.vue`（~150 行）

- `<el-table>` 列表（year desc / sem desc）
- 「新增」按鈕 → modal 收 4 欄
- 「編輯」按鈕 → modal（**不用 inline edit**，避免 unique 衝突 UX 混亂）
- 「刪除」→ ElMessageBox confirm「會讓 scheduler 失去推進觸發點」→ DELETE
- Validation：year 100-200、semester 1|2、end_date > start_date、unique 衝突回 409 顯示「已存在」
- 權限 gate: `SETTINGS_WRITE`

## 5. 拖拉流程

```
user drag → vuedraggable @change → FunnelColumn emits 'transition-attempt'
    → FunnelBoard:
        ├── 純 toggle → store.transition()
        ├── deposited → enrolled → 開 dialog (dropdown) → confirm → store.transition({ classroomId })
        └── destructive → revert UI 先 → 開 dialog (destructive) → confirm → store.transition({ reason })
```

### Optimistic 行為矩陣

| 情境 | 結果 |
|---|---|
| 純 toggle 成功 | 不重畫 |
| 純 toggle 失敗 | revert + ElMessage.error |
| convert 成功 | dialog close + 卡片落新欄 + student badge |
| convert 失敗 | dialog close + revert + ElMessage.error |
| destructive 成功 | 卡片落目標欄 + ElMessage.success |
| destructive 失敗（白名單擋）| revert + ElMessageBox 解釋走退學流程 |

### 權限粗略 gate

`FunnelCard` 依該卡的 `current_stage` 決定可否被拖（最寬鬆規則 — 有任一相關權限即允許拖；BE 做精準 dispatch 檢查）：

| 卡所在 stage | 卡片可拖條件 |
|---|---|
| visited | 有 `RECRUITMENT_WRITE` |
| deposited | 有 `RECRUITMENT_WRITE` 或 `RECRUITMENT_CONVERT` |
| enrolled | 有 `STUDENTS_WRITE`（plural）|
| active | 有 `STUDENTS_WRITE` |

無權限 → vuedraggable disabled + cursor not-allowed + el-tooltip 顯示「無權限」。卡片仍可點開 timeline drawer（READ 權限）。BE 為嚴格守門 — 即便前端誤放行特定推進，BE 會回 403。

### vuedraggable 設定

```vue
<draggable
  v-model="localCards"
  group="funnel"
  item-key="visit_id"
  :animation="200"
  ghost-class="funnel-card-ghost"
  drag-class="funnel-card-drag"
  @change="onDragChange"
/>
```

## 6. 錯誤處理

| 錯誤 | UI |
|---|---|
| 400 CONVERT_NEED_CLASSROOM | dialog inline error（不該觸發） |
| 400 REASON_REQUIRED | dialog inline error |
| 400 REVERT_STUDENT_HAS_DATA | revert + ElMessageBox.alert |
| 403 | revert + ElMessage.warning |
| 404 VISIT_NOT_FOUND | revert + force reload board |
| 409 STAGE_ALREADY | revert + force reload（並發保護）|
| 5xx | revert + ElMessage.error + Sentry capture |

### 空 / Loading 狀態

- board 全空：`<el-empty>` 提示去原始明細新增
- 單欄空：column 內淡灰 placeholder
- 首次 loadBoard：board v-loading
- 學期切換：board v-loading
- transition pending：該卡 opacity 0.5

### 生命週期

- `RecruitmentView` route leave → `store.$reset()`
- tab 內切（10 個 tab 互切）→ 保留 state，加速

## 7. 測試

### Vitest 單元測試（~43 case）

| 檔 | case |
|---|---|
| `src/stores/__tests__/recruitmentFunnel.test.ts` | ~15 |
| `src/api/__tests__/recruitmentFunnel.test.ts` | ~6 |
| `src/components/recruitment/funnel/__tests__/FunnelCard.test.ts` | ~5 |
| `src/components/recruitment/funnel/__tests__/TransitionConfirmDialog.test.ts` | ~8 |
| `src/components/recruitment/funnel/__tests__/FunnelColumn.test.ts` | ~3 |
| `src/components/settings/__tests__/SettingsAcademicTermsTab.test.ts` | ~6 |

### 重點測試案例

`recruitmentFunnel.test.ts`：
- transition happy path / API 失敗 revert / 409 force reload
- loadTimeline cache hit/miss
- invalidateTimeline 後再 load 觸發 API
- setFilter → loadBoard

`TransitionConfirmDialog.test.ts`：
- 三模式 by (fromStage, toStage)
- validation
- confirm/cancel emit payload

### 型別

- 全部 `<script setup lang="ts">`
- 從 `_generated/typed` 拿 OpenAPI 型別
- `npm run typecheck` 0 error
- `npm run build` 0 error

### 不做

- Playwright E2E（defer follow-up；workspace `e2e/` 後續加 funnel smoke）
- vuedraggable 內部行為（信 lib）

### 整合驗證手測

- 4 種拖拉皆通
- 403 行為
- academic_terms CRUD

## 8. 不做（範疇外）

- WebSocket 即時推播
- Playwright E2E（follow-up）
- Mobile gesture 優化（vuedraggable 預設 mobile 支援即可）
- 鍵盤拖拉（a11y follow-up）
- 「批次推進」按鈕（YAGNI，scheduler 已處理批量）
- TimelineDrawer 內快速操作（YAGNI）
- AcademicTerm inline edit（modal 編輯避免 unique 衝突）
- 學期切換時 in-flight transition 取消（YAGNI）
