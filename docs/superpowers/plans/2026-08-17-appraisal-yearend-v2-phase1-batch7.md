# 考核與年終 V2 Phase 1 — Batch 7：員工明細/分頁狀態補 URL 同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 原始子項 ⑧「URL 狀態同步」要求 term/year/stage/filter/panel/employee/page 全上 query。目前 `cycle`/`stage`/`view`/`step`/`year` 已同步，但「目前開著哪個員工的明細」與「年終結算單頁停在哪個分頁」完全沒同步——分享連結或重新整理都會遺失，逼使用者重新點一次。本批次補上這兩個最高價值、最低風險的缺口：**考核簽核階段明細 dialog 的 `employee` query**（沿用 Batch 6 剛做好的入口）、**年終結算單頁的 `tab` 分頁 query ＋ 計算軌跡 drawer 的 `employee` query**。

**Architecture:** 沿用專案既有慣例（`AppraisalWorkspaceView.vue`/`CycleDetailPanel.vue`/`YearEndWorkspaceView.vue` 已用的 pattern）：`router.replace({ query: { ...route.query, <key>: <value> } })` 寫入、`String(route.query.<key> ?? '')` 讀取初值、`watch` 監聽對話框/抽屜的 visible 狀態在關閉時清除該 query key。**不新增任何後端呼叫、不改資料流、只加 query 讀寫這一層。**

**Tech Stack:** Vue 3、Vue Router 4、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/implementation-plan.md` Phase 1 子項 ⑧；盤點依據見本 session scout 報告（`CycleDetailPanel.vue`/`YearEndDetailView.vue` 現況缺口逐行核實）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫語意、權限判斷語意。
- **本批次刻意不處理**（範圍已盤點但明確排除，理由見下）：
  - `selectedIds`/`selectedSettlements`（批次勾選）——選取是工作中的暫存集合，不是「檢視狀態」，放進 URL 會讓連結過長且分享語意怪（別人打開連結不該連你選的列都一起選上）。
  - `attentionOnly`（年終需注意列過濾）、`visibleBonusCols`（獎金欄開關）、例外中心 `typeFilter`——留給下一批，避免本批次範圍過散。
  - 各種一次性動作 dialog（退簽/留言/簽核歷程/重新試算 dialog）——這些是操作觸發流程而非可分享的檢視狀態，不適合上 query。
  - page（分頁）——`YearEndGridView.vue`/`YearEndDetailView.vue` 目前皆無分頁 UI（一次全載），沒有對應狀態可同步，非本批次遺漏。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: 考核簽核階段明細 dialog 補 `employee` query 同步

**Files:**
- Modify: `src/views/appraisal/CycleDetailPanel.vue`
- Modify test: `src/views/appraisal/__tests__/CycleDetailPanel.spec.js`

**Interfaces:**
- 不新增 props/emit；`openDetail(employeeId?: number)` 既有簽名不變，內部新增 query 寫入副作用。

**現況（Batch 6 剛建立）**：
```ts
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
`route`/`router` 已在檔案頂部（`const route = useRoute()` / `const router = useRouter()`，`CycleDetailPanel.vue:59-60`）宣告好，`view` query 同步已示範好 pattern（`CycleDetailPanel.vue:96-101`）。`onMounted` 現況（`CycleDetailPanel.vue:312-315`）：
```ts
onMounted(() => {
  load()
  loadSignCounts()
})
```

**1. `openDetail` 改為找到資料後同步寫入 `employee` query**

```ts
function openDetail(employeeId?: number) {
  if (employeeId == null) return
  const row = aggregatedParticipants.value.find((p) => p.employee_id === employeeId)
  if (!row) {
    ElMessage.warning('找不到明細資料，請重新整理後再試')
    return
  }
  detailTarget.value = row
  detailDialogVisible.value = true
  if (router?.replace) {
    router.replace({ query: { ...(route?.query || {}), employee: String(employeeId) } })
  }
}
```

**2. 新增一個 `watch`，在對話框關閉時清除 `employee` query**（放在 `openDetail` 函式定義之後）：

```ts
// 詳情 dialog 關閉時清掉 URL 上的 employee query，避免重整後又自動彈回同一個
// 員工（closeable dialog 的關閉是「使用者主動退出」語意，query 應跟著清空）。
watch(detailDialogVisible, (visible) => {
  if (visible) return
  if (!route?.query?.employee) return
  const q = { ...(route.query || {}) }
  delete q.employee
  router?.replace?.({ query: q })
})
```

**3. `onMounted` 改為載入完成後檢查 URL 是否帶 `employee`，若有且找得到對應明細則自動開啟**（保留 `load()`/`loadSignCounts()` 原本的並行時機，只在 `load()` resolve 後多做一件事）：

```ts
onMounted(() => {
  load().then(() => {
    const initialEmployee = Number(route?.query?.employee)
    if (!Number.isNaN(initialEmployee) && initialEmployee > 0) {
      openDetail(initialEmployee)
    }
  })
  loadSignCounts()
})
```

**4. 測試檔改動**

先把 `useRouter` mock 從「每次呼叫都回傳新物件」改成「回傳同一個可被斷言呼叫紀錄的物件」（原本測試從未斷言過 `router.replace` 被呼叫的內容，這是新增能力必要的前置修改，不影響任何既有測試行為——每個 `it()` 前 `beforeEach` 的 `vi.clearAllMocks()` 一樣會清空這個共用物件的呼叫紀錄）：

```js
// 原本：useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
// 改為 module-scope 共用物件，讓測試可以斷言 router.replace 被呼叫的參數
// （query 同步邏輯若不驗證呼叫內容，等於只測到「沒噴錯」，測不出寫錯 key）。
const mockRouter = { back: vi.fn(), replace: vi.fn() }
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => mockRouter,
}))
```
（這段取代原本 `vi.mock('vue-router', ...)` 區塊裡 `useRouter: () => ({ back: vi.fn(), replace: vi.fn() })` 那一行；`mockRouter` 宣告放在 `vi.mock` 呼叫式的前一行，比照既有 `routeQuery` 已驗證可行的 hoisting 模式。）

在既有 `describe('CycleDetailPanel', ...)` 區塊最後（Batch 6 新增的 3 個 `openDetail` 測試之後）新增：

```js
  it('openDetail 成功開啟時同步 employee query', async () => {
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.openDetail(42)
    await nextTick()
    const lastCall = mockRouter.replace.mock.calls.at(-1)
    expect(lastCall[0].query.employee).toBe('42')
  })

  it('關閉詳情 dialog 時清除 employee query', async () => {
    const wrapper = mountPanel()
    await flush()
    wrapper.vm.openDetail(42)
    await nextTick()
    await wrapper.findComponent({ name: 'AggregatedStatusDetailDialog' }).vm.$emit('update:visible', false)
    await nextTick()
    const lastCall = mockRouter.replace.mock.calls.at(-1)
    expect(lastCall[0].query.employee).toBeUndefined()
  })

  it('URL 帶 employee query 時，載入完成後自動開啟該員工詳情', async () => {
    routeQuery.value = { employee: '42' }
    const wrapper = mountPanel()
    await flush()
    const dialog = wrapper.find('[data-test="detail-dialog-stub"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('林靜宜')
  })

  it('URL 帶不存在的 employee query 時，不噴錯、不開啟 dialog', async () => {
    routeQuery.value = { employee: '9999' }
    const wrapper = mountPanel()
    await flush()
    expect(wrapper.find('[data-test="detail-dialog-stub"]').exists()).toBe(false)
  })
```

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js`
Expected: PASS（Batch 6 收尾時的 11 個既有測試）

- [ ] **Step 2: 依上方 1-4 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/__tests__/CycleDetailPanel.spec.js`
Expected: PASS（11 個既有 + 4 個新增 = 15 個）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisal`
Expected: PASS，特別確認 `CycleDetailPanel.opt.test.ts`（改了 `useRouter` mock 的檔案是另一支獨立測試檔，不受影響；但仍需確認它自己原本若也 mock 了 vue-router，行為未被本次改動波及——若該檔完全沒 mock vue-router 且元件現在會呼叫 `useRoute`/`useRouter`，需一併檢查該檔是否需要補 mock；若跑起來噴 `useRoute is not a function` 之類錯誤，比照 Task 1 的 pattern 幫該檔也補上同款 `vi.mock('vue-router', ...)`）。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/__tests__/CycleDetailPanel.spec.js
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/CycleDetailPanel.vue src/views/appraisal/__tests__/CycleDetailPanel.spec.js
# 若 Step 4 發現 CycleDetailPanel.opt.test.ts 需要補 vue-router mock，一併加入路徑
git commit -m "feat(appraisal): 簽核階段明細 dialog 補 employee query 同步

openDetail 開啟成功時把 employee id 寫進 URL query，關閉時清除；進頁若
URL 已帶 employee 且該員工存在明細，載入完成後自動開啟。分享連結或重整
現在能直達某個員工的簽核明細，不用重新點一次（V2 IA 簡化 Phase 1 Batch 7
Task 1，年終側 tab/employee 同步見 Task 2）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 年終結算單頁補 `tab`／計算軌跡 drawer 補 `employee` query 同步

**Files:**
- Modify: `src/views/yearEnd/YearEndDetailView.vue`
- Modify test: `src/views/yearEnd/__tests__/YearEndDetailView.spec.ts`

**⚠ 前置條件：Task 1 必須先完成並 commit（雙軌並行 task，此依賴僅為本計畫文件的執行順序約定，兩者程式碼互不耦合）。**

**Interfaces:**
- 不新增 props/emit；`openProvenanceDrawer(employeeId: number)` 既有簽名不變，內部新增 query 寫入副作用；`tab` ref 語意不變。

**現況**：`YearEndDetailView.vue` 目前完全沒有 import `useRoute`/`useRouter`（該元件與 `CycleDetailPanel.vue` 不同，是全新加入這個機制）：
```ts
import { ref, computed, onMounted } from 'vue'
```
（第 2 行）

`tab`/provenance 相關現況（`YearEndDetailView.vue:52-76`）：
```ts
const tab = ref('settlements')

// ── Provenance Drawer ─────────────────────────────────────────────
const provenanceDrawerVisible = ref(false)
const provenanceEmployeeId = ref(0)

// ...(DEDUCTION_KEY_LABELS/DEDUCTION_KEYS 定義，不動)

function openProvenanceDrawer(employeeId: number) {
  provenanceEmployeeId.value = employeeId
  provenanceDrawerVisible.value = true
}
// ─────────────────────────────────────────────────────────────────
```

`el-tab-pane` 的三個 `name` 值（`YearEndDetailView.vue:246,347,367`）：`settlements`／`bonuses`／`classes`。

`onMounted` 現況（`YearEndDetailView.vue:231`）：
```ts
onMounted(load)
```

**1. Import 改動**（第 2 行）：

```ts
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
```

**2. `tab`/provenance 區塊改為（取代原本第 52-76 行整段）**：

```ts
const route = useRoute()
const router = useRouter()

// tab／employee 上 URL query：分享連結或重整能停在同一個分頁／同一個員工的
// 計算軌跡，不用重新點（比照 CycleDetailPanel.vue 的 view query 同步 pattern）。
const VALID_TABS = ['settlements', 'bonuses', 'classes']
const initialQueryTab = String(route?.query?.tab ?? '')
const tab = ref(VALID_TABS.includes(initialQueryTab) ? initialQueryTab : 'settlements')
watch(tab, (next) => {
  if (router?.replace) {
    router.replace({ query: { ...(route?.query || {}), tab: next } })
  }
})

// ── Provenance Drawer ─────────────────────────────────────────────
const provenanceDrawerVisible = ref(false)
const provenanceEmployeeId = ref(0)

// Task 16 動態化：keys 對齊後端 services/provenance/base.py KNOWN_KEYS（唯一可被
// /api/provenance/{key} 接受的 4 個 key，非本頁自訂）；label 走查表 + fallback raw
// key，未來 KNOWN_KEYS 新增項目時只需補一筆查表，不會漏標籤整段消失。
const DEDUCTION_KEY_LABELS: Record<string, string> = {
  attendance_late: '遲到/未打卡',
  personal_leave: '事假',
  sick_leave: '病假',
  meeting_absence: '會議缺席',
}
const DEDUCTION_KEYS: ProvenanceKey[] = Object.keys(DEDUCTION_KEY_LABELS).map((key) => ({
  key,
  label: DEDUCTION_KEY_LABELS[key] ?? key,
}))

function openProvenanceDrawer(employeeId: number) {
  provenanceEmployeeId.value = employeeId
  provenanceDrawerVisible.value = true
  if (router?.replace) {
    router.replace({ query: { ...(route?.query || {}), employee: String(employeeId) } })
  }
}

// drawer 關閉時清掉 employee query（同 CycleDetailPanel.vue 的 openDetail 收尾 pattern）。
watch(provenanceDrawerVisible, (visible) => {
  if (visible) return
  if (!route?.query?.employee) return
  const q = { ...(route.query || {}) }
  delete q.employee
  router?.replace?.({ query: q })
})
// ─────────────────────────────────────────────────────────────────
```

**3. `onMounted` 改為（取代原本第 231 行）**：

```ts
onMounted(() => {
  load()
  const initialEmployee = Number(route?.query?.employee)
  if (!Number.isNaN(initialEmployee) && initialEmployee > 0) {
    openProvenanceDrawer(initialEmployee)
  }
})
```
（`ProvenanceDrawer.vue` 自己吃 `employeeId`/`cycleId`/`visible` 三個 prop 自主呼叫 `getProvenance(...)`，不依賴 `settlements`/`load()` 先跑完，故不需要像 Task 1 那樣等 `load()` resolve 才開。）

**4. 測試檔改動**

`YearEndDetailView.spec.ts` 目前完全沒有 `vue-router` mock，需新增（放在既有 `vi.mock('@/api/index', ...)` 之後）：

```ts
const routeQuery = { value: {} as Record<string, string> }
const mockYearEndRouter = { replace: vi.fn() }
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery.value }),
  useRouter: () => mockYearEndRouter,
}))
```

在既有 `beforeEach`（若無則於 `describe` 最外層第一個 `beforeEach` 補一行；先讀該檔既有 `beforeEach` 內容，在其中新增，不要新建第二個 `beforeEach`）補上重置：

```ts
routeQuery.value = {}
mockYearEndRouter.replace.mockClear()
```

新增測試（找該檔既有 `describe`/`it` 慣例插入位置，比照既有測試對 `mountView()` helper 的用法）：

```ts
it('切換 tab 時同步 query', async () => {
  setupApiMocks([makeSettlement()])
  const wrapper = await mountView()
  wrapper.vm.tab = 'bonuses'
  await nextTick()
  const lastCall = mockYearEndRouter.replace.mock.calls.at(-1)
  expect(lastCall[0].query.tab).toBe('bonuses')
})

it('URL 帶 tab query 時初始分頁採用該值', async () => {
  routeQuery.value = { tab: 'classes' }
  setupApiMocks([makeSettlement()])
  const wrapper = await mountView()
  expect(wrapper.vm.tab).toBe('classes')
})

it('openProvenanceDrawer 開啟時同步 employee query，關閉時清除', async () => {
  setupApiMocks([makeSettlement()])
  const wrapper = await mountView()
  wrapper.vm.openProvenanceDrawer(10)
  await nextTick()
  let lastCall = mockYearEndRouter.replace.mock.calls.at(-1)
  expect(lastCall[0].query.employee).toBe('10')

  wrapper.vm.provenanceDrawerVisible = false
  await nextTick()
  lastCall = mockYearEndRouter.replace.mock.calls.at(-1)
  expect(lastCall[0].query.employee).toBeUndefined()
})

it('URL 帶 employee query 時，進頁自動開啟計算軌跡 drawer', async () => {
  routeQuery.value = { employee: '10' }
  setupApiMocks([makeSettlement()])
  const wrapper = await mountView()
  expect(wrapper.vm.provenanceDrawerVisible).toBe(true)
  expect(wrapper.vm.provenanceEmployeeId).toBe(10)
})
```

（以上假設 `tab`／`provenanceDrawerVisible`／`provenanceEmployeeId`／`openProvenanceDrawer` 目前透過 `wrapper.vm` 可直接存取——`<script setup>` 元件預設頂層 binding 對 `@vue/test-utils` 的 `wrapper.vm` 可見，不需要額外 `defineExpose`，比照該檔案既有測試若已用相同方式存取其他 ref 的作法；若實測發現存取不到，改用 `defineExpose` 補上這幾個名字，比照 `CycleDetailPanel.vue` 既有的 `defineExpose` 慣例。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndDetailView.spec.ts`
Expected: PASS

- [ ] **Step 2: 依上方 1-4 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndDetailView.spec.ts`
Expected: PASS（既有全數 + 4 個新增）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/yearEnd`
Expected: PASS。

- [ ] **Step 5: 全庫回歸掃描**

Run: `npm run test -- --run src` 導出結果、grep 摘要行確認除本批次範圍外無新增紅燈。

- [ ] **Step 6: typecheck + lint + build**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint
npm run build
```
Expected: 三者皆綠。

- [ ] **Step 7: Commit**

```bash
git add -- src/views/yearEnd/YearEndDetailView.vue src/views/yearEnd/__tests__/YearEndDetailView.spec.ts
git commit -m "feat(year-end): 結算單頁補 tab／計算軌跡 drawer 的 query 同步

三個分頁（員工結算單/特別獎金/班級經營績效）與計算軌跡 drawer 開哪個員工
現在都上 URL query，分享連結或重整不再回到預設分頁、白忙一次找員工
（V2 IA 簡化 Phase 1 Batch 7 Task 2，考核側同語意見 Task 1）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 記錄

1. **Spec coverage**：Phase 1 子項 ⑧ 完整清單（term/year/stage/filter/panel/employee/page）中，`term`/`year`/`stage`/`step`/`view` 前幾批已同步；本批次補 `employee`（兩處）＋ `tab`（等同 panel 語意，年終結算單的分頁即該頁的「panel」）。`filter`／`page` 明確排除於本批次（見 Global Constraints 理由），留給下一批，不是遺漏。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼；測試檔的「若實測發現 xxx 則 yyy」屬必要的條件式指示（`wrapper.vm` 存取失敗的 fallback），不是模糊佔位。
3. **Type consistency**：兩個 task 的 `router.replace({ query: {...} })` 呼叫簽名一致；`openDetail(employeeId?: number)`／`openProvenanceDrawer(employeeId: number)` 保留各自既有簽名不變。
4. **風險守則**：兩個 task 互不耦合（不同檔案、不同 component tree），可平行驗證；`ElTabsStub`/`ElTabPaneStub` 現況不綁定 `v-model`，確認不會因為 `tab` 初始值改變而影響既有測試對三個分頁內容的斷言。
