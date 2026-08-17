# 考核與年終 V2 Phase 1 — Batch 6：考核簽核階段補「員工詳情」入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 考核工作區「簽核完成」階段（`CycleDetailPanel.vue` 內嵌的 List/Kanban 兩種檢視）目前**完全沒有任何管道能看到員工的出缺勤/留校率/才藝/懲處明細**——唯一能看到這些資料的 `AggregatedStatusDetailDialog.vue` 只掛在「準備資料」階段（`CurrentSemesterOverview.vue`）。HR 在簽核時只能看到總分/等第/獎金/狀態，看不到「為什麼是這個分數」，要簽核就得切回準備資料階段自己找同一個人。本批次把既有、已審查過的 `AggregatedStatusDetailDialog.vue`**原封不動**接到簽核階段的 List 與 Kanban 兩側，補上這個入口缺口。

**Architecture:** `AggregatedStatusDetailDialog.vue` 吃的資料（`participant: {attendance/retention/activity/disciplinary/...}`）來自 `getAppraisalAllEmployeesStatus(cycleId)`，是與 `CycleDetailPanel.vue` 現有的 `listAppraisalParticipants`/`listAppraisalSummaries`（只有彙總後的 total_score/grade/bonus_amount）**不同的資料源**。`CycleDetailPanel.vue` 新增一次額外的並行 API 呼叫拿到這份明細資料，用 `employee_id` 對應（List 側 `Participant.employee_id`、Kanban 側 `SignStatusSummaryItem.employee_id` 皆有此欄位，已核實），開啟同一個 dialog 實例。**不修改 `AggregatedStatusDetailDialog.vue` 本身、不修改 `CurrentSemesterOverview.vue`**——純粹多一個掛載點+多一個資料源。UI 入口採「員工姓名本身可點擊」樣式（List 側原本純文字的員工姓名欄改成連結按鈕；Kanban 側卡片頭的姓名同樣改成可點擊），不新增欄位、不佔用本就緊繃的操作欄空間。

**Tech Stack:** Vue 3、Element Plus、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/ux-spec.md` §3.4（員工明細抽屜，本批次先補「有得看」，尚未做成統一 drawer 殼與人工調整/計算軌跡/異動紀錄——那是規模更大的後續工作，見 Self-Review）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫既有語意、權限判斷語意。
- **`AggregatedStatusDetailDialog.vue`、`CurrentSemesterOverview.vue` 一律不修改**——只多一個消費端。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: `CycleDetailPanel.vue` 掛載詳情 dialog＋List 側入口

**Files:**
- Modify: `src/views/appraisal/CycleDetailPanel.vue`（現況見上一輪對話已讀取的完整內容，383 行）
- Modify: `src/views/appraisal/components/ListView.vue`（現況見上一輪對話已讀取的完整內容，189 行）
- Modify test: `src/views/appraisal/__tests__/CycleDetailPanel.spec.js`（200 行，mock 需擴充）

**Interfaces:**
- Consumes：`getAppraisalAllEmployeesStatus(cycleId): AxiosResp<'/appraisal/cycles/{cycle_id}/all_employees_status','get'>`（既有）、`listScoringRules(baseScoreCalcDate): AxiosResp<...>`（既有，簽名沿用 `CurrentSemesterOverview.vue:166` 已驗證過的呼叫方式）、`AggregatedStatusDetailDialog.vue` 既有 props（`visible`/`participant`/`cycle`/`rules`）。
- Produces：`CycleDetailPanel.vue` 新增 `openDetail(employeeId?: number)` 函式（Task 2 會呼叫）；`ListView.vue` 新增 `open-detail: [participant: Participant]` emit。

**1. `CycleDetailPanel.vue` 改動**

Import 區塊（第 14-37 行）新增：
```ts
import {
  listAppraisalParticipants,
  listAppraisalSummaries,
  listAppraisalCatalog,
  recomputeAppraisalSummaries,
  signSupervisorAppraisalSummary,
  signAccountingAppraisalSummary,
  finalizeAppraisalSummary,
  listAppraisalCycles,
  exportAppraisalCycleXlsxUrl,
  exportAppraisalTransferRosterXlsxUrl,
  getSignStatusSummary,
  getAppraisalAllEmployeesStatus,
  listScoringRules,
} from '@/api/appraisal'
```
（在既有 import 清單最後加兩行 `getAppraisalAllEmployeesStatus`、`listScoringRules`。）

在既有 `import SignProgressBar ...` 那行之後新增：
```ts
import AggregatedStatusDetailDialog from './AggregatedStatusDetailDialog.vue'
```

在既有 `interface Summary {...}` 之後新增：
```ts
interface AggregatedParticipant {
  employee_id?: number
  employee_name?: string
  role_group?: string
  reinstate_count?: number
  attendance?: Record<string, unknown>
  retention?: Record<string, unknown> | null
  activity?: Record<string, unknown> | null
  disciplinary?: Record<string, unknown>
  [key: string]: unknown
}
```

在既有 `const catalog = ref<unknown[]>([])` 之後新增：
```ts
const aggregatedParticipants = ref<AggregatedParticipant[]>([])
const rulesByCode = ref<Record<string, unknown>>({})
const detailDialogVisible = ref(false)
const detailTarget = ref<AggregatedParticipant | null>(null)
```

`load()` 函式（原第 119-140 行）改為：
```ts
async function load() {
  loading.value = true
  try {
    const [cyclesRes, participantsRes, summariesRes, catalogRes, statusRes] = await Promise.all([
      listAppraisalCycles(),
      listAppraisalParticipants(cycleId.value),
      listAppraisalSummaries(cycleId.value),
      listAppraisalCatalog(),
      getAppraisalAllEmployeesStatus(cycleId.value),
    ])
    const cycles = cyclesRes.data as unknown as Cycle[]
    cycle.value = cycles.find((c) => c.id === cycleId.value) || null
    participants.value = participantsRes.data as Participant[]
    summaries.value = summariesRes.data as Summary[]
    catalog.value = catalogRes.data as unknown[]
    aggregatedParticipants.value = (statusRes.data as { participants?: AggregatedParticipant[] })?.participants ?? []
    loadRules()
  } catch (e) {
    ElMessage.error(apiError(e, MSG.load_failed))
  } finally {
    loading.value = false
  }
}

// 詳情 dialog 的規則 tooltip 用資料，比照 CurrentSemesterOverview.vue 既有作法：
// 失敗不影響主流程，rulesByCode 留空 dict、dialog 內 tooltip 自動隱藏。
async function loadRules() {
  if (!cycle.value?.base_score_calc_date) { rulesByCode.value = {}; return }
  try {
    const { data } = await listScoringRules(cycle.value.base_score_calc_date)
    const list = data as Array<{ item_code: string; [key: string]: unknown }>
    rulesByCode.value = Object.fromEntries(list.map((r) => [r.item_code, r]))
  } catch {
    rulesByCode.value = {}
  }
}

function openDetail(employeeId?: number) {
  if (employeeId == null) return
  const row = aggregatedParticipants.value.find((p) => p.employee_id === employeeId)
  if (!row) {
    ElMessage.warning('找不到明細資料，請重新整理後再試')
    return
  }
  detailTarget.value = row
  detailDialogVisible.value = true
}
```

（`aggregatedParticipants`/`rulesByCode` 新增這兩個 ref 的宣告位置＋以上兩個新函式的插入位置，緊接在既有 `load()` 函式定義之後、`kanbanRef`/`reload()` 定義之前。）

`defineExpose`（原第 253-263 行）新增 `openDetail`：
```ts
defineExpose({
  view,
  selectedIds,
  openReject,
  openComment,
  openLog,
  openDetail,
  sign,
  signingIds,
  isSigning,
  summaries,
})
```

Template：`ListView` 掛載處（原第 340-357 行）新增一行 `@open-detail="openDetail"`：
```vue
    <ListView
      v-else
      :cycle-id="cycleId"
      :participants="participants"
      :summary-by-participant="summaryByParticipant"
      :catalog="catalog"
      v-model:selected-ids="selectedIds"
      :busy="busy"
      :signing-ids="signingIds"
      :can-sign-supervisor="canSignSupervisor"
      :can-sign-accounting="canSignAccounting"
      :can-finalize="canFinalize"
      :can-reject="canReject"
      @sign="sign"
      @reject="openReject"
      @comment="openComment"
      @open-log="openLog"
      @open-detail="(p) => openDetail(p.employee_id)"
    />
```

在既有 `<SummaryLogDrawer ... />`（原第 369-372 行）之後新增：
```vue
    <AggregatedStatusDetailDialog
      v-model:visible="detailDialogVisible"
      :participant="detailTarget"
      :cycle="cycle"
      :rules="rulesByCode"
    />
```

**2. `ListView.vue` 改動**

`defineEmits`（原第 30-36 行）新增 `open-detail`：
```ts
const emit = defineEmits<{
  'sign': [payload: { summary: Summary; stage: string }]
  'reject': [summary: Summary]
  'comment': [summary: Summary]
  'open-log': [summary: Summary]
  'open-detail': [participant: Participant]
  'update:selected-ids': [ids: number[]]
}>()
```

在既有 `function openLog(...)`（原第 74 行）之後新增：
```ts
function openDetail(row: Participant) { emit('open-detail', row) }
```

template「員工」欄（原第 89-91 行）改為：
```vue
    <el-table-column label="員工" width="120">
      <template #default="{ row }">
        <el-button
          link
          type="primary"
          :data-test="`detail-btn-${row.id}`"
          @click="openDetail(row)"
        >{{ row.employee_name ?? `員工 ${row.employee_id}` }}</el-button>
      </template>
    </el-table-column>
```

**3. 測試檔改動**

`CycleDetailPanel.spec.js` 的 `vi.mock('@/api/appraisal', ...)`（原第 7-24 行）新增兩支 mock：
```js
vi.mock('@/api/appraisal', () => ({
  listAppraisalParticipants: vi.fn().mockResolvedValue({ data: [] }),
  listAppraisalSummaries: vi.fn().mockResolvedValue({ data: [] }),
  listAppraisalCatalog: vi.fn().mockResolvedValue({ data: [] }),
  recomputeAppraisalSummaries: vi.fn().mockResolvedValue({ data: {} }),
  signSupervisorAppraisalSummary: vi.fn().mockResolvedValue({ data: {} }),
  signAccountingAppraisalSummary: vi.fn().mockResolvedValue({ data: {} }),
  finalizeAppraisalSummary: vi.fn().mockResolvedValue({ data: {} }),
  listAppraisalCycles: vi.fn().mockResolvedValue({
    data: [
      { id: 5, academic_year: 114, semester: 'FIRST', base_score_calc_date: '2025-09-15', base_score: 75.6, status: 'OPEN' },
    ],
  }),
  exportAppraisalCycleXlsxUrl: vi.fn().mockReturnValue('/x'),
  exportAppraisalTransferRosterXlsxUrl: vi.fn().mockReturnValue('/y'),
  getSignStatusSummary: vi.fn().mockResolvedValue({
    data: { cycle_id: 5, counts: { DRAFT: 2, SUPERVISOR_SIGNED: 1, ACCOUNTING_SIGNED: 0, FINALIZED: 3 }, buckets: [] },
  }),
  getAppraisalAllEmployeesStatus: vi.fn().mockResolvedValue({
    data: { participants: [{ employee_id: 42, employee_name: '林靜宜', role_group: 'HOMEROOM', attendance: {}, retention: null, activity: null, disciplinary: {} }] },
  }),
  listScoringRules: vi.fn().mockResolvedValue({ data: [] }),
}))
```
（只在既有物件最後新增 `getAppraisalAllEmployeesStatus`、`listScoringRules` 兩個 key，其餘逐字不動。）

`stubs.ListView` 定義（原第 47-54 行附近）的 `emits` 陣列與 `AggregatedStatusDetailDialog` 新增一個 stub：
```js
  ListView: defineComponent({
    name: 'ListView',
    props: ['cycleId', 'participants', 'summaryByParticipant', 'catalog', 'selectedIds', 'busy'],
    emits: ['sign', 'reject', 'comment', 'open-log', 'open-detail', 'update:selected-ids'],
    setup() {
      return () => h('div', { 'data-test': 'list-view-stub' }, 'list')
    },
  }),
```
（只在 `emits` 陣列加一個 `'open-detail'`。）

在 `stubs` 物件內、`SummaryLogDrawer` 定義之後（原約第 90-99 行附近）新增：
```js
  AggregatedStatusDetailDialog: defineComponent({
    name: 'AggregatedStatusDetailDialog',
    props: ['visible', 'participant', 'cycle', 'rules'],
    emits: ['update:visible'],
    setup(props) {
      return () => (props.visible
        ? h('div', { 'data-test': 'detail-dialog-stub' }, props.participant?.employee_name ?? '')
        : null)
    },
  }),
```

在既有 `describe('CycleDetailPanel', ...)` 區塊最後（`it('opens reject dialog via openReject', ...)` 之後）新增：
```js
  it('openDetail(employeeId) 找到對應明細時開啟詳情 dialog', async () => {
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="detail-dialog-stub"]').exists()).toBe(false)
    wrapper.vm.openDetail(42)
    await nextTick()
    const dialog = wrapper.find('[data-test="detail-dialog-stub"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('林靜宜')
  })

  it('openDetail(employeeId) 找不到對應明細時顯示警告、不開啟 dialog', async () => {
    const { ElMessage } = await import('element-plus')
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.openDetail(9999)
    await nextTick()
    expect(wrapper.find('[data-test="detail-dialog-stub"]').exists()).toBe(false)
    expect(ElMessage.warning).toHaveBeenCalled()
  })

  it('openDetail(undefined) 為 no-op', async () => {
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.openDetail(undefined)
    await nextTick()
    expect(wrapper.find('[data-test="detail-dialog-stub"]').exists()).toBe(false)
  })
```

另在 `ListView.vue` 建立/更新對應測試（`src/views/appraisal/components/__tests__/ListView.spec.ts`，若不存在則建立，先用 `find` 確認實際檔名與現況，若已存在既有測試檔請沿用其現有 mock/mount pattern 新增以下測試，不要整份重寫覆蓋既有測試）：
```ts
it('點擊員工姓名觸發 open-detail 事件，帶出該列 participant', async () => {
  const participants = [{ id: 1, employee_id: 42, employee_name: '林靜宜', role_group: 'HOMEROOM' }]
  const wrapper = mount(ListView, {
    props: { cycleId: 5, participants, summaryByParticipant: {} },
    global: { plugins: [ElementPlus] },
  })
  await wrapper.find('[data-test="detail-btn-1"]').trigger('click')
  expect(wrapper.emitted('open-detail')?.[0]).toEqual([participants[0]])
})
```
（若既有測試檔已有自己的 mount helper/plugins 設定，改用該檔既有的 helper，不要引入第二套 mount 慣例；若該檔完全不存在，先 `find src/views/appraisal/components/__tests__ -iname "ListView*"` 確認，不存在才新建，新建時比照同目錄其他 `components/__tests__/*.spec.ts` 檔案的 import/mount 慣例。）

- [ ] **Step 1: 跑既有測試確認目前基準（先確認 187 行測試檔現況全綠，作為改動前基準）**

Run: `npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js`
Expected: PASS（改動前的既有 8 個測試）

- [ ] **Step 2: 依上方 1-3 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js`
Expected: PASS（8 個既有 + 3 個新增 = 11 個）

Run: `npm run test -- --run src/views/appraisal/components/__tests__/ListView.spec.ts`（若該檔存在或本 task 新建）
Expected: PASS。

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisal`
Expected: PASS。特別確認 `CycleDetailPanel.opt.test.ts`（既有樂觀更新測試，本次改動不動 `sign`/`onRejected`/`onCommented` 邏輯，理論上不受影響）與 `CurrentSemesterOverview.spec.js`（本 task 未修改該檔案，不應受影響）皆綠。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/components/ListView.vue src/views/appraisal/__tests__/CycleDetailPanel.spec.js
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/components/ListView.vue src/views/appraisal/__tests__/CycleDetailPanel.spec.js
# 若有新建/修改 ListView 測試檔，一併加入路徑
git commit -m "feat(appraisal): 簽核階段 List 側補員工詳情入口（沿用既有 AggregatedStatusDetailDialog）

CycleDetailPanel.vue 新增 getAppraisalAllEmployeesStatus/listScoringRules
兩支既有 API 呼叫，掛載既有 AggregatedStatusDetailDialog.vue（完全不修改
該元件與 CurrentSemesterOverview.vue）；ListView.vue 員工姓名欄改為可點擊
連結觸發 open-detail。簽核時終於能看到員工的出缺勤/留校率/才藝/懲處明細，
不用切回準備資料階段查（V2 IA 簡化 Phase 1 Batch 6 Task 1，Kanban 側見 Task 2）。"
```

---

### Task 2: `SummaryCard.vue`（Kanban 側）補員工詳情入口

**Files:**
- Modify: `src/views/appraisal/components/SummaryCard.vue`（現況見上一輪對話已讀取的完整內容，115 行）
- Modify: `src/views/appraisal/CycleDetailPanel.vue`（`onKanbanAction` 函式一處新增分支，Task 1 commit 後的現況）
- Modify test: 對應的 `SummaryCard` 測試檔與 `CycleDetailPanel.spec.js`

**⚠ 前置條件：Task 1 必須先完成並 commit（本 task 呼叫 Task 1 已建好的 `openDetail` 函式）。**

**Interfaces:**
- Consumes：Task 1 的 `CycleDetailPanel.openDetail(employeeId?: number)`。
- Produces：`SummaryCard.vue` 沿用既有 `action: [payload: { action: string; summary: Summary }]` emit 契約，新增 `action: 'detail'` 這個既有型別已涵蓋的字串值（不需改型別定義，`action: string` 本就是寬鬆字串）。

**1. `SummaryCard.vue` 改動**

在既有 `function onMenuClick(...)`（原第 20 行）之後新增：
```ts
function onDetailClick() { emit('action', { action: 'detail', summary: props.summary }) }
```

template `.employee-name` span（原第 60 行 `<span class="employee-name">{{ summary.employee_name }}</span>`）改為：
```vue
      <el-button
        link
        type="primary"
        class="employee-name"
        :data-test="`detail-btn-${summary.id}`"
        @click.stop="onDetailClick"
      >{{ summary.employee_name }}</el-button>
```

**2. `CycleDetailPanel.vue` 改動**

`onKanbanAction` 函式（Task 1 完成後現況，原第 236-247 行區塊）新增一個 `else if` 分支：
```ts
function onKanbanAction({ action, summary }: { action: string; summary: Summary }) {
  if (action === 'sign') {
    const stage = ({
      DRAFT: 'supervisor',
      SUPERVISOR_SIGNED: 'accounting',
      ACCOUNTING_SIGNED: 'finalize',
    } as Record<string, string>)[summary.status ?? '']
    if (stage) sign({ summary: { id: summary.id }, stage })
  } else if (action === 'reject') openReject(summary)
  else if (action === 'comment') openComment(summary)
  else if (action === 'log') openLog(summary)
  else if (action === 'detail') openDetail(summary.employee_id as number | undefined)
}
```

**3. 測試改動**

`CycleDetailPanel.spec.js` 新增一個測試（放在 Task 1 新增的三個測試之後）：
```js
  it('onKanbanAction 收到 action=detail 時呼叫 openDetail', async () => {
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.view = 'kanban'
    await nextTick()
    wrapper.vm.$options.__proto__ // no-op guard removed below; call via exposed API instead
  })
```
**上面這條先不要照抄**——`onKanbanAction` 未被 `defineExpose`，測試無法直接呼叫。改為透過已 stub 的 `KanbanView` 觸發 `action` 事件（`stubs.KanbanView` 目前只是純 div，本 task 需要讓它可以觸發事件；不修改 stub 的顯示內容，只需能在測試中手動 `emit`）：

```js
  it('kanban 觸發 action=detail 時開啟對應員工的詳情 dialog', async () => {
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.view = 'kanban'
    await nextTick()
    await wrapper.findComponent({ name: 'KanbanView' }).vm.$emit('action', { action: 'detail', summary: { id: 1, employee_id: 42, employee_name: '林靜宜' } })
    await nextTick()
    const dialog = wrapper.find('[data-test="detail-dialog-stub"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('林靜宜')
  })
```

另在 `SummaryCard` 對應測試檔（先 `find src/views/appraisal/components/__tests__ -iname "SummaryCard*"` 確認實際檔名，沿用其既有 mount 慣例）新增：
```ts
it('點擊員工姓名 emit action:detail', async () => {
  const summary = { id: 3, employee_name: '林靜宜', status: 'DRAFT', total_score: 90, grade: 'A', bonus_amount: 3000 }
  const wrapper = mount(SummaryCard, { props: { summary }, global: { plugins: [ElementPlus] } })
  await wrapper.find('[data-test="detail-btn-3"]').trigger('click')
  expect(wrapper.emitted('action')?.[0]).toEqual([{ action: 'detail', summary }])
})
```

- [ ] **Step 1: 套用改動**

依上方 1-3 段落逐一套用；`CycleDetailPanel.spec.js` 的新測試依「上面這條先不要照抄」的說明，寫成透過 `findComponent({name:'KanbanView'}).vm.$emit(...)` 的版本（已在上方給出正確版本，第一段是刻意示範「不要這樣寫」的反例，不要真的加進測試檔）。

- [ ] **Step 2: 跑測試確認全綠**

```bash
npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js
npm run test -- --run src/views/appraisal/components/__tests__/SummaryCard.spec.ts
```
Expected: PASS。

- [ ] **Step 3: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisal`
Expected: PASS。

- [ ] **Step 4: 全庫回歸掃描**

Run: `npm run test -- --run src` 導出結果、grep 摘要行確認除本批次範圍外無新增紅燈。

- [ ] **Step 5: typecheck + lint + build**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint
npm run build
```
Expected: 三者皆綠。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/components/SummaryCard.vue src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/__tests__/CycleDetailPanel.spec.js
# 若有修改 SummaryCard 測試檔，一併加入路徑
git commit -m "feat(appraisal): 簽核階段 Kanban 側補員工詳情入口

SummaryCard.vue 卡片姓名改可點擊，沿用既有 action emit 契約傳
action:'detail'；CycleDetailPanel.onKanbanAction 加一個分支呼叫 Task 1
建好的 openDetail。List／Kanban 兩種檢視現在都能在簽核階段直接看員工明細
（V2 IA 簡化 Phase 1 Batch 6 Task 2，收尾本批次）。"
```

---

## Self-Review 記錄

1. **Spec coverage**：ux-spec §3.4 要求的「員工明細抽屜」完整五區塊（結果摘要/自動衍生證據/人工調整/計算軌跡/異動紀錄）本批次**只達成「自動衍生證據」一項**（沿用既有 `AggregatedStatusDetailDialog` 的四個唯讀分頁）。經盤點確認：考核側目前①無任何「人工調整覆寫＋自動/人工對比＋恢復自動值」機制（年終側 `GridRowDetailDrawer.vue` 有，考核側完全沒有對應後端/前端）②無 `getProvenance` 式的逐步計算軌跡 API③現有的 `SummaryLogDrawer.vue` 已經是異動紀錄 timeline，但只涵蓋簽核事件不含分項資料變動。真正做到「統一 5 區塊抽屜殼」是規模與本批次相當甚至更大的獨立工作（需要考核側新增覆寫機制的後端探索與設計），不適合塞進本批次，已在 Goal 段落明確排除範圍，只解決「完全看不到明細」這個此刻最痛的缺口。
2. **Placeholder scan**：兩個 task 為完整可執行程式碼；ListView/SummaryCard 測試檔部分因無法保證測試檔一定存在，明確指示「先 find 確認、不存在才新建、存在則沿用既有慣例新增」，這是必要的條件式指示而非模糊指示，執行時的決策點清楚（存在→沿用；不存在→新建），不算 placeholder。
3. **Type consistency**：`AggregatedParticipant` 介面在 Task 1 定義、Task 2 不需要它（Kanban 側只傳 `employee_id` 給既有 `openDetail`）；`onKanbanAction` 的 `action==='detail'` 分支沿用既有 `action: string` 寬鬆型別，不需新增聯合型別。
4. **風險守則**：`AggregatedStatusDetailDialog.vue`／`CurrentSemesterOverview.vue` 全程不修改；新增的 API 呼叫（`getAppraisalAllEmployeesStatus`/`listScoringRules`）皆為既有、已在其他頁面驗證過的唯讀端點，不新增後端負擔或風險。
