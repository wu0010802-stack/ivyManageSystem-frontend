# 考核與年終 V2 Phase 1 — Batch 12：寫入按鈕依週期狀態禁用（缺口2） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收斂 Phase 1 子項 ⑨「狀態矩陣」最後一個缺口（缺口2）：`YearEndConfigView.vue`（年終設定）與 `CycleDetailPanel.vue`（考核簽核工作區，含 List／Kanban 兩種檢視）的寫入按鈕，目前只依權限（`hasPermission`）控制，完全不管週期是否已鎖定／封存。**前置調查已釐清風險等級**：後端已對 5 個考核端點（`recompute`/`sign_supervisor`/`sign_accounting`/`finalize`）與全部 3 個年終設定端點做了 `cycle.status != OPEN` 守衛，本批次補的是「防呆」——使用者原本點下去會被後端 400 擋掉，只是體驗差；**唯一例外是 `reject`/`comment`（退簽／留言）兩個端點，後端原本完全沒守，屬於真正的安全缺口**，已在本批次動工前**另外開 ivy-backend worktree（分支 `fix/appraisal-reject-comment-cycle-guard`，commit `56115514`）補上與其餘端點一致的守衛並通過 TDD 驗證**——本前端計畫只處理前端 UX 補強，後端修復已完成、不在本計畫範圍內。

**Architecture:** 三個 task 都遵循同一個原則：新增一個「週期是否可寫入」的判斷（`cycle.status === 'OPEN'`），跟既有的權限判斷用 `&&` 合併進同一批 computed property，不改變既有權限語意、只疊加一個新的必要條件。父層工作區殼（`AppraisalWorkspaceView.vue`／`YearEndWorkspaceView.vue`）已有唯讀提示文案（Batch 3／Batch 9/10 已建立），本批次的按鈕隱藏是這個既有提示的自然延伸，不需要新增額外的說明文字。**Kanban 檢視有自己獨立的一套權限判斷**（`SummaryCard.vue` 內部直接呼叫 `hasPermission`，完全不透過 `CycleDetailPanel.vue` 既有傳給 `ListView.vue` 的 `can-*` props），這條鏈路目前完全沒有任何週期狀態的傳遞管道，需要新增一個 `canWriteCycle` prop 逐層往下傳（`CycleDetailPanel.vue` → `KanbanView.vue` → `KanbanColumn.vue` → `SummaryCard.vue`）。**不改動任何計算邏輯、API 呼叫語意、既有權限判斷語意，只疊加週期狀態這個新的必要條件。**

**Tech Stack:** Vue 3、Element Plus、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/implementation-plan.md` Phase 1 子項 ⑨ 缺口2；後端風險分級查證見本 session scout 報告（`ivy-backend/api/appraisal/summaries.py`／`api/year_end/{cycles,class_targets}.py`／`services/year_end/cycle_guard.py` 逐端點核實）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫語意、既有權限判斷語意——本批次只新增「週期狀態」這一個額外必要條件，用 `&&` 疊加，不刪改任何既有的 `hasPermission(...)` 判斷式本身。
- **本批次刻意不處理**「留言」（comment）的前端 UI 隱藏——`ListView.vue`／`SummaryCard.vue` 的留言按鈕/選項目前完全沒有任何權限或狀態守衛（連 Batch 9 之前就是如此，非本批次引入），後端雖已補上守衛，但留言失敗的後果輕微（使用者會看到 toast，比照 Batch 11 對「動作類函式」的既有慣例，不需要額外的前端隱藏邏輯，維持現況）。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: `CycleDetailPanel.vue`（List 檢視）補週期狀態守衛

**Files:**
- Modify: `src/views/appraisal/CycleDetailPanel.vue`
- Modify test: `src/views/appraisal/__tests__/CycleDetailPanel.spec.js`

**Interfaces:**
- 不新增 props/emit；新增 `canWriteCycle` computed（`Ref<boolean>`），供 Task 2 的 `<KanbanView :can-write-cycle="canWriteCycle">` 消費（Task 2 依賴此 computed 已存在）。

**現況**（`CycleDetailPanel.vue:122-133`）：

```ts
// P0-A：依後端 APPRAISAL_* 細粒度 permission bit 守衛 UI 動作。
// `canBatchSign` 任一階段簽核權限即可顯示批次區（個別按鈕再各自守衛）。
const canRecompute = computed(() => hasPermission('APPRAISAL_EVENT_WRITE'))
const canSignSupervisor = computed(() => hasPermission('APPRAISAL_REVIEW'))
const canSignAccounting = computed(() => hasPermission('APPRAISAL_ACCOUNTING'))
const canFinalize = computed(() => hasPermission('APPRAISAL_FINALIZE'))
const canBatchSign = computed(
  () => canSignSupervisor.value || canSignAccounting.value || canFinalize.value,
)
// 退簽：後端 endpoint 入口僅要 APPRAISAL_READ 但依當前 stage 再 check 對應 sign
// 權限；UI 守衛保守用 OR 三個 sign 權限（任一即可顯示，後端會二次驗）。
const canReject = computed(() => canBatchSign.value)
```

`cycle`（`CycleDetailPanel.vue:63`）已在 `load()` 內載入，含 `.status` 欄位（`Cycle` 介面第 42 行已定義 `status?: string`）。

**1. 改為（取代原本第 122-133 行整段）**：

```ts
// P0-A：依後端 APPRAISAL_* 細粒度 permission bit 守衛 UI 動作。
// `canBatchSign` 任一階段簽核權限即可顯示批次區（個別按鈕再各自守衛）。
// Batch 12：後端 recompute/sign_supervisor/sign_accounting/finalize/reject 五個
// 端點皆守 cycle.status != OPEN 一律 400（reject 於 2026-08-17 補齊，
// ivy-backend fix/appraisal-reject-comment-cycle-guard 分支 commit 56115514）
// ——前端補齊同款判斷，避免顯示點了必失敗的按鈕；父層 AppraisalWorkspaceView.vue
// 的唯讀文案已說明「內容為唯讀」，此處純粹讓寫入 CTA 隨之隱藏。
const canWriteCycle = computed(() => cycle.value?.status === 'OPEN')
const canRecompute = computed(() => canWriteCycle.value && hasPermission('APPRAISAL_EVENT_WRITE'))
const canSignSupervisor = computed(() => canWriteCycle.value && hasPermission('APPRAISAL_REVIEW'))
const canSignAccounting = computed(() => canWriteCycle.value && hasPermission('APPRAISAL_ACCOUNTING'))
const canFinalize = computed(() => canWriteCycle.value && hasPermission('APPRAISAL_FINALIZE'))
const canBatchSign = computed(
  () => canSignSupervisor.value || canSignAccounting.value || canFinalize.value,
)
// 退簽：後端 endpoint 入口僅要 APPRAISAL_READ 但依當前 stage 再 check 對應 sign
// 權限；UI 守衛保守用 OR 三個 sign 權限（任一即可顯示，後端會二次驗）。
const canReject = computed(() => canBatchSign.value)
```

**2. template／`ListView.vue` 不需要任何改動**——`canRecompute`/`canSignSupervisor`/`canSignAccounting`/`canFinalize`/`canBatchSign`/`canReject` 這幾個既有名稱透過既有 `v-if`（`CycleDetailPanel.vue` 自己的 template）與既有 props 傳遞（`:can-sign-supervisor="canSignSupervisor"` 等，傳給 `ListView.vue`）已經涵蓋所有 List 檢視的寫入按鈕，本 task 只改 computed 定義本身，下游全部自動繼承新條件。

**3. 測試檔改動**：在既有 `describe('CycleDetailPanel', ...)` 區塊內新增（沿用既有 `mountPanel`/`flush` helper，覆寫 `listAppraisalCycles` 回傳的 `status`）：

```js
  it('cycle 非 OPEN 時隱藏重算按鈕（List 檢視）', async () => {
    listAppraisalCycles.mockResolvedValueOnce({
      data: [{ id: 5, academic_year: 114, semester: 'FIRST', base_score_calc_date: '2025-09-15', base_score: 75.6, status: 'LOCKED' }],
    })
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="recompute-btn"]').exists()).toBe(false)
  })

  it('cycle 為 OPEN 時仍依權限顯示重算按鈕（不受本次改動影響的既有行為）', async () => {
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="recompute-btn"]').exists()).toBe(true)
  })
```

（需在檔案頂部 import 區塊新增 `listAppraisalCycles`，比照既有 `import { listAppraisalParticipants } from '@/api/appraisal'` 那行新增 `listAppraisalCycles`，兩者可合併成同一行 `import { listAppraisalParticipants, listAppraisalCycles } from '@/api/appraisal'`；第二個測試依賴 `beforeEach` 未覆寫時 `listAppraisalCycles` 的預設 mock 值 `status: 'OPEN'`——已是 mock 工廠原本的預設值，不需改動工廠本身。`hasPermission` mock 在此檔案固定回傳 `true`，故重算按鈕原本必顯示，兩個測試合起來證明「純粹是 cycle 狀態新增的門檻，不是權限被誤改」。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js`
Expected: PASS

- [ ] **Step 2: 依上方 1-3 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js`
Expected: PASS（既有全數 + 2 個新增）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisal`
Expected: PASS，特別確認 `CycleDetailPanel.opt.test.ts` 未受影響（該檔獨立 mock，`listAppraisalCycles` 預設值也是 `status:'OPEN'` 或類似不受影響的固定值，若發現受影響請照實回報而非硬改到通過）。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/__tests__/CycleDetailPanel.spec.js
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/__tests__/CycleDetailPanel.spec.js
git commit -m "fix(appraisal): List 檢視寫入按鈕補週期狀態守衛

canRecompute/canSignSupervisor/canSignAccounting/canFinalize 新增
canWriteCycle（cycle.status === 'OPEN'）必要條件，與既有權限判斷用 &&
疊加；canBatchSign/canReject 透過既有依賴關係自動繼承。對齊後端五個端點
（recompute/sign_supervisor/sign_accounting/finalize/reject）皆已一致
的 cycle 非 OPEN 400 守衛，避免顯示點了必失敗的按鈕
（V2 IA 簡化 Phase 1 Batch 12 Task 1，Kanban 檢視見 Task 2）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Kanban 檢視補週期狀態守衛（`canWriteCycle` prop 逐層傳遞）

**Files:**
- Modify: `src/views/appraisal/CycleDetailPanel.vue`
- Modify: `src/views/appraisal/components/KanbanView.vue`
- Modify: `src/views/appraisal/components/KanbanColumn.vue`
- Modify: `src/views/appraisal/components/SummaryCard.vue`
- Modify test: `src/views/appraisal/components/__tests__/SummaryCard.spec.ts`

**⚠ 前置條件：Task 1 必須先完成並 commit（本 task 依賴 Task 1 建立的 `canWriteCycle` computed）。**

**Interfaces:**
- `KanbanView.vue` 新增 `canWriteCycle?: boolean` prop。
- `KanbanColumn.vue` 新增 `canWriteCycle?: boolean` prop。
- `SummaryCard.vue` 新增 `canWriteCycle?: boolean` prop，預設（未傳時）視為 `true`（不新增限制，向下相容其他未來可能的呼叫端）。

**現況**：`KanbanView.vue` 只接收 `cycleId`（`KanbanView.vue:20`），完全沒有任何週期狀態的資訊來源；`SummaryCard.vue` 的 `hasAnySignPerm`/`canSignSupervisor`/`canSignAccounting`/`canFinalizeStage`（`SummaryCard.vue:24-42`）全部只呼叫 `hasPermission(...)`，跟 `CycleDetailPanel.vue`／`ListView.vue` 那條鏈完全獨立、不共用任何 computed。

**1. `CycleDetailPanel.vue`：`<KanbanView>` 掛載處新增 prop**（`CycleDetailPanel.vue:409-415`，取代原本這幾行）：

```vue
    <KanbanView
      v-if="view === 'kanban'"
      ref="kanbanRef"
      :cycle-id="cycleId"
      :can-write-cycle="canWriteCycle"
      @action="onKanbanActionPayload"
      @selected-changed="(ids) => (selectedIds = ids)"
    />
```

**2. `KanbanView.vue`：新增 prop，往下傳給每個 `KanbanColumn`**（`KanbanView.vue:20` 與 `KanbanView.vue:84-93` 附近，取代對應行）：

```ts
const props = defineProps<{ cycleId: number; canWriteCycle?: boolean }>()
```

```vue
<template>
  <div class="kanban-view" v-loading="loading" data-test="kanban-view">
    <KanbanColumn
      v-for="col in COLUMN_DEFS" :key="col.status"
      :status="col.status" :label="col.label"
      :summaries="summariesByStatus(col.status)"
      :selected-ids="selectedIds"
      :collapsed-by-default="col.collapse"
      :can-write-cycle="canWriteCycle"
      @toggle-select="toggleSelect"
      @select-all="selectAll"
      @action="(payload) => emit('action', payload)"
    />
  </div>
</template>
```

**3. `KanbanColumn.vue`：新增 prop，往下傳給每張 `SummaryCard`**（`KanbanColumn.vue:7-13` 與 `:44-52`，取代對應段落）：

```ts
const props = defineProps<{
  status: string
  label: string
  summaries?: Summary[]
  selectedIds?: number[]
  collapsedByDefault?: boolean
  canWriteCycle?: boolean
}>()
```

```vue
      <SummaryCard
        v-for="summary in (summaries ?? [])"
        :key="summary.id"
        :summary="summary"
        :selected="(selectedIds ?? []).includes(summary.id)"
        :can-write-cycle="canWriteCycle"
        show-menu
        @update:selected="(v) => onCardSelectChange(summary.id, v as boolean)"
        @action="(payload) => emit('action', payload)"
      />
```

**4. `SummaryCard.vue`：接收 prop，疊加進既有四個權限 computed**（`SummaryCard.vue:9-12` 與 `:24-38`，取代對應段落）：

```ts
const props = defineProps<{
  summary: Summary
  selected?: boolean
  showMenu?: boolean
  canWriteCycle?: boolean
}>()
```

```ts
// P0-A：依 APPRAISAL_* permission bit 個別守衛 dropdown 動作。
// 簽核 / 退簽：任一 sign 權限即顯示（後端會依當前 stage 二次驗）。
// Batch 12：canWriteCycle 為 undefined 時視為 true（未傳入代表呼叫端還沒接上
// 這條新資訊，保守不新增限制——正常 app 內 KanbanColumn.vue 一律會傳，只有
// 缺省情境走這個 fallback）。
const canWriteCycle = computed(() => props.canWriteCycle ?? true)
const hasAnySignPerm = computed(
  () => canWriteCycle.value && (
    hasPermission('APPRAISAL_REVIEW')
    || hasPermission('APPRAISAL_ACCOUNTING')
    || hasPermission('APPRAISAL_FINALIZE')
  ),
)
// P1-8：FINALIZED 已是終態，沒有下一個 stage，「簽核」option 必須隱藏
// 否則點下去 CycleDetailPanel.onKanbanAction stage map 取不到值 silent
// no-op，使用者以為系統壞了。退簽 (REJECT) 仍允許（FINALIZED → ACCOUNTING_SIGNED）。
const canSign = computed(
  () => hasAnySignPerm.value && props.summary?.status !== 'FINALIZED',
)
const canReject = hasAnySignPerm

// Task 8：卡尾「當前一步」主按鈕——依 summary.status 與 per-stage 權限判斷
// 顯示哪一步；沿用既有單一 action 事件契約（{ action: 'sign', summary }），
// stage 推導交回 CycleDetailPanel.onKanbanAction（依 status 映射），不新造事件名。
const canSignSupervisor = computed(() => canWriteCycle.value && hasPermission('APPRAISAL_REVIEW'))
const canSignAccounting = computed(() => canWriteCycle.value && hasPermission('APPRAISAL_ACCOUNTING'))
const canFinalizeStage = computed(() => canWriteCycle.value && hasPermission('APPRAISAL_FINALIZE'))
```

（`primaryAction` computed 緊接在這段之後，邏輯不變，自動繼承新條件。）

**5. 測試檔改動**（`SummaryCard.spec.ts`）：在既有 `describe('SummaryCard', ...)` 區塊內新增（沿用既有 `mountCard`/`permState` helper）：

```ts
  it('canWriteCycle=false 時即使有權限也不顯示主按鈕', () => {
    permState.granted.add('APPRAISAL_REVIEW')
    const wrapper = mountCard({ ...baseSummary, status: 'DRAFT' }, { canWriteCycle: false })
    expect(wrapper.find('[data-test="summary-primary-action"]').exists()).toBe(false)
  })

  it('canWriteCycle 未傳時預設不受限（沿用既有純權限行為）', () => {
    permState.granted.add('APPRAISAL_REVIEW')
    const wrapper = mountCard({ ...baseSummary, status: 'DRAFT' })
    expect(wrapper.find('[data-test="summary-primary-action"]').exists()).toBe(true)
  })
```

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/appraisal/components/__tests__/SummaryCard.spec.ts`
Expected: PASS

- [ ] **Step 2: 依上方 1-5 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/components/__tests__/SummaryCard.spec.ts`
Expected: PASS（既有全數 + 2 個新增）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisal`
Expected: PASS，特別確認 `CycleDetailPanel.spec.js`（Task 1 已改過的檔案，本 task 對 `KanbanView`/`KanbanColumn` 的改動不應波及 List 檢視相關斷言）與 `CycleDetailPanel.opt.test.ts` 皆綠。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/components/KanbanView.vue src/views/appraisal/components/KanbanColumn.vue src/views/appraisal/components/SummaryCard.vue src/views/appraisal/components/__tests__/SummaryCard.spec.ts
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/components/KanbanView.vue src/views/appraisal/components/KanbanColumn.vue src/views/appraisal/components/SummaryCard.vue src/views/appraisal/components/__tests__/SummaryCard.spec.ts
git commit -m "fix(appraisal): Kanban 檢視寫入按鈕補週期狀態守衛

SummaryCard.vue 的權限判斷完全獨立於 ListView.vue 那條鏈，原本沒有任何
週期狀態資訊來源。新增 canWriteCycle prop，從 CycleDetailPanel.vue 經
KanbanView.vue／KanbanColumn.vue 逐層傳入，與既有四個 hasPermission
判斷用 && 疊加；未傳入時預設 true（向下相容）。至此 List／Kanban 兩種
檢視的寫入按鈕皆已一致依週期狀態禁用
（V2 IA 簡化 Phase 1 Batch 12 Task 2，年終設定頁見 Task 3）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `YearEndConfigView.vue` 補週期狀態守衛

**Files:**
- Modify: `src/views/yearEnd/YearEndConfigView.vue`
- Modify test: `src/views/yearEnd/__tests__/YearEndConfigView.spec.ts`

**⚠ 前置條件：Task 1/2 完成後執行；本 task 程式碼與前兩者互不耦合，此依賴僅為執行順序約定。**

**Interfaces:**
- 不新增 props/emit；`canWrite` 既有名稱不變，改為額外依賴新增的 `cycleStatus` ref；`loadCycleTargets()` 既有簽名不變，新增 side effect（設定 `cycleStatus`）。

**現況**：本檔完全沒有週期狀態意識（全檔 grep `status` 零命中，除本次新增外）。`canWrite` 現況（`YearEndConfigView.vue:39`）：

```ts
const canWrite = computed(() => hasPermission('YEAR_END_WRITE'))
```

`loadCycleTargets()`（`YearEndConfigView.vue:168-187`）**已經**呼叫 `listYearEndCycles()` 並用 `.find((c) => c.id === cycleId)` 找到對應週期（是為了另一個目的——考核週期目標橋接對照），可以**重用同一次呼叫**取出 `.status`，不需要新增任何網路請求：

```ts
async function loadCycleTargets() {
  try {
    const { data: yearEndCycles } = await listYearEndCycles()
    const yearEndCycle = yearEndCycles.find((c) => c.id === cycleId)
    if (!yearEndCycle) {
      cycleTargets.value = {}
      return
    }
    const { data } = await getAppraisalCyclesByYear(yearEndCycle.academic_year)
    const appraisalCycles = (Array.isArray(data) ? data : []) as AppraisalCycleEntry[]
    const bridged: Record<string, number | null> = {}
    for (const semesterFirst of [true, false]) {
      const match = appraisalCycles.find((c) => c.semester === semesterCode(semesterFirst))
      bridged[String(semesterFirst)] = match?.enrollment_target ?? null
    }
    cycleTargets.value = bridged
  } catch {
    cycleTargets.value = {}
  }
}
```

**1. 新增 `cycleStatus` ref，`canWrite` 疊加週期狀態條件**（取代原本第 39 行）：

```ts
// Batch 12：後端 org_settings/class_targets 三個端點皆守 cycle.status != OPEN
// 一律 400（services/year_end/cycle_guard.py::assert_cycle_writable）。cycleStatus
// 借用 loadCycleTargets() 既有的 listYearEndCycles() 呼叫取得（不新增網路請求，
// 見下方 Step 2 改動）。fail-open：查無/失敗時 cycleStatus 維持 null，canWrite
// 視為「未知，不新增限制」——這裡純粹是 UX 提示，真正的寫入守衛在後端，寧可少擋
// 一次非必要按鈕也不要多擋一次原本允許的操作（比照既有測試多數不 mock
// listYearEndCycles 的現況，fail-open 才能保持這些既有測試不受影響）。
const cycleStatus = ref<string | null>(null)
const canWrite = computed(
  () => hasPermission('YEAR_END_WRITE') && (cycleStatus.value === null || cycleStatus.value === 'OPEN'),
)
```

**2. `loadCycleTargets()` 在找到 `yearEndCycle` 後多寫一行，取出 `.status`**（取代原本第 168-187 行整段）：

```ts
async function loadCycleTargets() {
  try {
    const { data: yearEndCycles } = await listYearEndCycles()
    const yearEndCycle = yearEndCycles.find((c) => c.id === cycleId)
    cycleStatus.value = yearEndCycle?.status ?? null
    if (!yearEndCycle) {
      cycleTargets.value = {}
      return
    }
    const { data } = await getAppraisalCyclesByYear(yearEndCycle.academic_year)
    const appraisalCycles = (Array.isArray(data) ? data : []) as AppraisalCycleEntry[]
    const bridged: Record<string, number | null> = {}
    for (const semesterFirst of [true, false]) {
      const match = appraisalCycles.find((c) => c.semester === semesterCode(semesterFirst))
      bridged[String(semesterFirst)] = match?.enrollment_target ?? null
    }
    cycleTargets.value = bridged
  } catch {
    cycleTargets.value = {}
  }
}
```

**3. template／`defineExpose` 不需要任何改動**——`canWrite` 這個既有名稱已在 5 個既有 `v-if` 位置使用（第 366/386/407/428/447 行），本 task 只改它的定義本身，下游全部自動繼承新條件；`canWrite` 本就已在 `defineExpose` 清單內（第 315 行），不需新增。

**4. 測試檔改動**：在既有 `describe('YearEndConfigView', ...)` 區塊內新增（沿用既有 `makeYearEndCycle`/`stubSupportApis`/`mountView` helper）：

```ts
  it('週期非 OPEN 時 canWrite 為 false（依 listYearEndCycles 帶回的 status）', async () => {
    stubSupportApis()
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({
      data: [makeYearEndCycle({ id: 5, status: 'LOCKED' })],
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { canWrite: boolean }
    expect(vm.canWrite).toBe(false)
  })

  it('週期為 OPEN 時 canWrite 依權限判斷（不受本次改動影響的既有行為）', async () => {
    stubSupportApis()
    vi.mocked(yearEndApi.getOrgSettings).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.getClassTargets).mockResolvedValue({ data: [] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({
      data: [makeYearEndCycle({ id: 5, status: 'OPEN' })],
    } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { canWrite: boolean }
    expect(vm.canWrite).toBe(true)
  })
```

（`mountView()` 用的 `props: { cycleId: 5 }`——確認 `makeYearEndCycle({ id: 5, ... })` 的 `id` 要跟這個 `cycleId` 對上才會被 `.find()` 命中，若該檔 `mountView()` 實際掛載的 `cycleId` 不是 5，請對照該檔既有測試用的實際值調整；此檔既有 `canWrite` 測試若原本都是預設 `hasPermission` 回傳 `true` 才顯示按鈕，本次新增的兩個測試改為直接斷言 `vm.canWrite` 布林值，比對照既有測試對 `hasPermission` mock 的預設狀態設定一致的權限。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndConfigView.spec.ts`
Expected: PASS

- [ ] **Step 2: 依上方 1-4 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndConfigView.spec.ts`
Expected: PASS（既有全數 + 2 個新增；**特別確認既有那些從未 mock `listYearEndCycles` 的測試依然全綠**——這是驗證 fail-open 設計正確的關鍵指標，若這些測試因本次改動變紅，代表 fail-open 邏輯寫錯，需要修正而非調整測試去遷就）。

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/yearEnd`
Expected: PASS。

- [ ] **Step 5: 全庫回歸掃描**

Run: `npm run test -- --run src` 導出結果、grep 摘要行確認除本批次範圍外無新增紅燈（已知既有 flaky：`PickupAuthorizationsView.test.ts` 的 `filters refetch on date/status change` 僅在全庫並行負載下偶發紅，與本批次無關，不算新增紅燈）。

- [ ] **Step 6: typecheck + lint + build**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint
npm run build
```
Expected: 三者皆綠。

- [ ] **Step 7: Commit**

```bash
git add -- src/views/yearEnd/YearEndConfigView.vue src/views/yearEnd/__tests__/YearEndConfigView.spec.ts
git commit -m "fix(year-end): 設定頁寫入按鈕補週期狀態守衛

canWrite 新增 cycleStatus 必要條件（僅 OPEN 或未知時允許），對齊後端
org_settings/class_targets 三端點皆守 cycle 非 OPEN 400。cycleStatus
借用既有 loadCycleTargets() 的 listYearEndCycles() 呼叫取得，不新增
網路請求；查無/失敗時 fail-open（不新增限制，真正的寫入守衛在後端）
（V2 IA 簡化 Phase 1 Batch 12 Task 3，收尾本批次，Phase 1 子項 ⑨
狀態矩陣全部 5 個 scout 缺口至此處理完畢）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 記錄

1. **Spec coverage**：缺口2 完整涵蓋——List 檢視（Task 1）、Kanban 檢視（Task 2，含原本完全獨立、遺漏的權限鏈）、年終設定頁（Task 3）。後端唯一的真安全缺口（`reject`/`comment` 無守衛）已在動工前於 ivy-backend 獨立修復並通過 TDD（commit `56115514`），本計畫範圍明確排除後端變更。`comment` 前端 UI 刻意不加隱藏邏輯，理由見 Global Constraints。
2. **Placeholder scan**：三個 task 皆為完整可執行程式碼；測試檔的「若實際掛載 cycleId 不是 5 請對照調整」屬必要的條件式指示，不是模糊佔位。
3. **Type consistency**：`canWriteCycle`（`Ref<boolean>`，Task 1/2 用）與 `cycleStatus`（`Ref<string|null>`，Task 3 用）刻意採用不同型別——前者是「布林旗標」語意（已有 `cycle.value` 物件可直接讀 `.status`），後者是「借用既有呼叫取值」語意（沒有現成的 cycle 物件 ref，只有一次性提取的 status 字串），兩者命名與型別選擇分別對應各自檔案的既有資料結構慣例，非不一致。`SummaryCard.vue` 新增 prop 為 optional（`canWriteCycle?: boolean`），預設 `true`，向下相容任何未更新的呼叫端。
4. **風險守則**：三個 task 皆只用 `&&` 疊加新條件，不刪改任何既有 `hasPermission(...)` 判斷式本身；Task 3 的 fail-open 設計經過明確論證（真正守衛在後端、避免因這條 UX 提示的資料來源暫時失效就連帶封鎖既有可用的寫入功能），並用「既有測試不 mock listYearEndCycles 仍全綠」作為可驗證的正確性指標。
