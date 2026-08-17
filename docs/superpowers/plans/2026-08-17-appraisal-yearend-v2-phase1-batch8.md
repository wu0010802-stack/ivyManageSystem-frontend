# 考核與年終 V2 Phase 1 — Batch 8：例外中心分類篩選／年終需注意列過濾補 URL 同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 延續 Batch 7，繼續收斂 Phase 1 子項 ⑧「URL 狀態同步」剩餘缺口中最後兩個明確的**篩選狀態**（非批次勾選、非一次性動作 dialog）：① 例外中心（`ExceptionCenterView.vue`）的分類篩選 chips（考核/年終各自的 `typeFilter`）② 年終總表（`YearEndGridView.vue`）的「只顯示需注意列」開關（`attentionOnly`）。兩者目前重整或分享連結都會回到「看全部」，逼使用者重新點一次篩選。

**Architecture:** 沿用 Batch 7 已驗證的 pattern：`router.replace({ query: { ...route.query, <key>: <value> } })` 寫入、讀取初值時 fallback 到預設值。**例外中心因為考核/年終各自獨立一組週期選擇 query（`acycle`/`ycycle`），型別篩選比照命名 `atype`/`ytype`**，且該檔案 `onMounted` 已有明確記載「多個 query 變更必須合併成同一次 `router.replace`，否則 vue-router 的 `pendingLocation` 機制會讓後發起的呼叫取消先發起的」——本批次新增的型別篩選寫入**必須套用同一條紀律**（切換週期時型別篩選重置為 `all`，兩者合併進同一次 `replace`，不可分開各自呼叫）。年終總表的 `attentionOnly` 是獨立單一布林開關，沒有這個共存 race，直接用 `watch` 同步即可。**不新增任何後端呼叫、不改資料流、只加 query 讀寫這一層。**

**Tech Stack:** Vue 3、Vue Router 4、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/implementation-plan.md` Phase 1 子項 ⑧；盤點依據見 Batch 7 scout 報告（`ExceptionCenterView.vue`/`YearEndGridView.vue` 現況缺口逐行核實，本計畫延續同一份盤點）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫語意、權限判斷語意。
- **本批次刻意不處理**（Batch 7 已排除、本批次延續排除）：`selectedIds`/`selectedSettlements`（批次勾選）、`visibleBonusCols`（獎金欄開關，已存 tenantStorage 非遺失狀態，留待更後面評估是否值得雙寫 query）、各種一次性動作 dialog、page 分頁（無對應 UI）。
- ⚠ **`ExceptionCenterView.vue` 的「合併成單次 replace」鐵律**（檔案內既有註解已明講，本批次沿用）：同一個使用者操作若同時改變超過一個 query key，必須合併成一次 `router.replace` 呼叫；不可讓兩個獨立的 `watch`/函式各自呼叫 `router.replace`，否則 vue-router `pendingLocation` 機制會讓後發起的取消先發起的，其中一個變更會被靜默還原。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: 例外中心分類篩選補 `atype`／`ytype` query 同步

**Files:**
- Modify: `src/views/yearEnd/ExceptionCenterView.vue`
- Modify test: `src/views/yearEnd/__tests__/ExceptionCenterView.spec.ts`

**Interfaces:**
- 不新增 props/emit；`useExceptionGroup(...)` 回傳的 reactive 物件新增一個方法 `setTypeFilter(type: string): void`（供 template 呼叫，取代直接對 `typeFilter` 賦值）。

**現況**（`ExceptionCenterView.vue:72-150`）：

```ts
function useExceptionGroup(
  fetchCycles: CycleFetcher,
  fetchExceptions: ExceptionsFetcher,
  queryKey: 'acycle' | 'ycycle',
) {
  const cycles = ref<CycleOption[]>([])
  const cyclesLoading = ref(false)
  const selectedCycleId = ref<number | null>(null)
  const data = ref<ExceptionsData | null>(null)
  const loading = ref(false)
  const errorMsg = ref('')
  const typeFilter = ref<string>('all')

  // ...(totalCount/typeCounts/filteredItems computed，不動)
  // ...(loadCycles，不動)
  // ...(loadExceptions，不動)

  function onCycleChange() {
    typeFilter.value = 'all'
    loadExceptions()
    // 週期選擇變更 → 寫回 URL query，只動自己的 key、與其他 query 共存。
    router.replace({ query: { ...route.query, [queryKey]: String(selectedCycleId.value) } })
  }

  return reactive({
    cycles, cyclesLoading, selectedCycleId, data, loading, errorMsg, typeFilter,
    totalCount, typeCounts, filteredItems,
    loadCycles, loadExceptions, onCycleChange,
  })
}
```

template 分類 chips（`ExceptionCenterView.vue:251-274`）：

```vue
<div class="type-chips">
  <button
    type="button"
    class="type-chip"
    :class="{ 'type-chip--active': group.g.typeFilter === 'all' }"
    :data-test="`${group.key}-type-chip-all`"
    @click="group.g.typeFilter = 'all'"
  >
    全部
    <span class="type-chip__count">{{ group.g.totalCount }}</span>
  </button>
  <button
    v-for="(count, type) in group.g.typeCounts"
    :key="type"
    type="button"
    class="type-chip"
    :class="{ 'type-chip--active': group.g.typeFilter === type }"
    :data-test="`${group.key}-type-chip-${type}`"
    @click="group.g.typeFilter = type"
  >
    {{ exceptionTypeLabel(type) }}
    <span class="type-chip__count">{{ count }}</span>
  </button>
</div>
```

**1. `useExceptionGroup` 函式改動**：在既有 `const typeFilter = ref<string>('all')` 那一行**前面**新增一行推導 type query key，並把 `typeFilter` 初值改讀 URL：

```ts
function useExceptionGroup(
  fetchCycles: CycleFetcher,
  fetchExceptions: ExceptionsFetcher,
  queryKey: 'acycle' | 'ycycle',
) {
  const typeQueryKey = queryKey === 'acycle' ? 'atype' : 'ytype'
  const cycles = ref<CycleOption[]>([])
  const cyclesLoading = ref(false)
  const selectedCycleId = ref<number | null>(null)
  const data = ref<ExceptionsData | null>(null)
  const loading = ref(false)
  const errorMsg = ref('')
  // Batch 8：分類篩選上 URL query（考核 atype／年終 ytype），F5／分享連結保留篩選。
  // 未知 type 值只會讓 filteredItems 過濾出空清單（優雅降級，不需要像週期 id 那樣
  // 驗證存在性後 fallback）。
  const initialTypeRaw = route.query[typeQueryKey]
  const typeFilter = ref<string>(typeof initialTypeRaw === 'string' ? initialTypeRaw : 'all')
```

**2. 新增 `setTypeFilter` 函式**（放在 `loadExceptions` 定義之後、`onCycleChange` 定義之前）：

```ts
  // 型別篩選變更 → 單獨寫回自己的 query key，與週期 query 共存（不同使用者操作
  // 各自觸發各自的 replace，彼此不會同時發生，不受檔案開頭「合併成單次 replace」
  // 鐵律限制——那條鐵律管的是「同一個操作內」多個 key 同時變更的情境，見下方
  // onCycleChange 的處理）。
  function setTypeFilter(type: string) {
    typeFilter.value = type
    router.replace({ query: { ...route.query, [typeQueryKey]: type } })
  }
```

**3. `onCycleChange` 改為把型別篩選重置也合併進同一次 `replace`**（取代原本整個函式）：

```ts
  function onCycleChange() {
    typeFilter.value = 'all'
    loadExceptions()
    // 週期選擇變更 → 寫回 URL query，只動自己的 key、與其他 query 共存。
    // typeFilter 同時重置為 all，兩個 key 的變更合併進同一次 replace——不可分開
    // 各自呼叫（vue-router pendingLocation 會讓後發起的取消先發起的，見檔案開頭
    // 「合併成單次 replace」註解，這裡是同一顆坑的第二個現場）。
    router.replace({
      query: { ...route.query, [queryKey]: String(selectedCycleId.value), [typeQueryKey]: 'all' },
    })
  }
```

**4. `return reactive({...})` 新增 `setTypeFilter`**（取代原本整個 return 陳述式）：

```ts
  return reactive({
    cycles, cyclesLoading, selectedCycleId, data, loading, errorMsg, typeFilter,
    totalCount, typeCounts, filteredItems,
    loadCycles, loadExceptions, onCycleChange, setTypeFilter,
  })
}
```

**5. template 兩處 `@click` 改為呼叫 `setTypeFilter`**（取代原本 251-274 行整段）：

```vue
        <div class="type-chips">
          <button
            type="button"
            class="type-chip"
            :class="{ 'type-chip--active': group.g.typeFilter === 'all' }"
            :data-test="`${group.key}-type-chip-all`"
            @click="group.g.setTypeFilter('all')"
          >
            全部
            <span class="type-chip__count">{{ group.g.totalCount }}</span>
          </button>
          <button
            v-for="(count, type) in group.g.typeCounts"
            :key="type"
            type="button"
            class="type-chip"
            :class="{ 'type-chip--active': group.g.typeFilter === type }"
            :data-test="`${group.key}-type-chip-${type}`"
            @click="group.g.setTypeFilter(type)"
          >
            {{ exceptionTypeLabel(type) }}
            <span class="type-chip__count">{{ count }}</span>
          </button>
        </div>
```

**6. 測試檔改動**：本檔既有 `routeQuery`/`replaceMock` mock（`ExceptionCenterView.spec.ts:31-36`）與 `beforeEach` 的 `routeQuery.value = {}` 重置已經就緒，不用另外修改 mock 基礎設施。在既有 `describe('ExceptionCenterView', ...)` 區塊內新增（找一個合理位置插入，例如既有 acycle/ycycle query 相關測試附近）：

```ts
  it('URL 帶 atype query 時，考核批次初始 typeFilter 採用該值', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({
      data: makeExceptionsOut({ counts_by_type: { missing_score_item: 1 } }),
    } as never)
    vi.mocked(yearEndApi.getYearEndCycleExceptions).mockResolvedValue({ data: makeExceptionsOut({ items: [], counts_by_type: {} }) } as never)
    routeQuery.value = { atype: 'missing_score_item' }

    const wrapper = await mountView()
    const chip = wrapper.get('[data-test="appraisal-type-chip-missing_score_item"]')
    expect(chip.classes()).toContain('type-chip--active')
  })

  it('點擊分類 chip 呼叫 setTypeFilter 並把 atype 寫進 query', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({
      data: makeExceptionsOut({ counts_by_type: { missing_score_item: 1 } }),
    } as never)
    vi.mocked(yearEndApi.getYearEndCycleExceptions).mockResolvedValue({ data: makeExceptionsOut({ items: [], counts_by_type: {} }) } as never)

    const wrapper = await mountView()
    replaceMock.mockClear()
    await wrapper.get('[data-test="appraisal-type-chip-missing_score_item"]').trigger('click')
    const lastCall = replaceMock.mock.calls.at(-1)
    expect(lastCall[0].query.atype).toBe('missing_score_item')
  })

  it('切換週期時 typeFilter 重置為 all，與週期 query 合併成單次 replace（不分開呼叫）', async () => {
    vi.mocked(appraisalApi.listAppraisalCycles).mockResolvedValue({
      data: [makeCycle({ id: 1 }), makeCycle({ id: 2 })],
    } as never)
    vi.mocked(yearEndApi.listYearEndCycles).mockResolvedValue({ data: [makeCycle({ id: 1 })] } as never)
    vi.mocked(appraisalApi.getAppraisalCycleExceptions).mockResolvedValue({ data: makeExceptionsOut() } as never)
    vi.mocked(yearEndApi.getYearEndCycleExceptions).mockResolvedValue({ data: makeExceptionsOut({ items: [], counts_by_type: {} }) } as never)

    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { appraisal: { selectedCycleId: number; onCycleChange: () => void; typeFilter: string } }
    vm.appraisal.typeFilter = 'missing_score_item'
    replaceMock.mockClear()
    vm.appraisal.selectedCycleId = 2
    vm.appraisal.onCycleChange()
    expect(replaceMock).toHaveBeenCalledTimes(1)
    const lastCall = replaceMock.mock.calls.at(-1)
    expect(lastCall[0].query.acycle).toBe('2')
    expect(lastCall[0].query.atype).toBe('all')
    expect(vm.appraisal.typeFilter).toBe('all')
  })
```

（第三個測試假設 `wrapper.vm.appraisal` 可直接存取——`<script setup>` 頂層 binding 對 `@vue/test-utils` 的 `wrapper.vm` 預設可見，不需要額外 `defineExpose`，比照 Batch 7 Task 2 已驗證可行的作法；若實測發現存取不到，改用 `defineExpose({ appraisal, yearEnd })` 補上，比照 `CycleDetailPanel.vue` 既有 `defineExpose` 慣例插入位置。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/yearEnd/__tests__/ExceptionCenterView.spec.ts`
Expected: PASS

- [ ] **Step 2: 依上方 1-6 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/ExceptionCenterView.spec.ts`
Expected: PASS（既有全數 + 3 個新增）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/yearEnd`
Expected: PASS。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/yearEnd/ExceptionCenterView.vue src/views/yearEnd/__tests__/ExceptionCenterView.spec.ts
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/yearEnd/ExceptionCenterView.vue src/views/yearEnd/__tests__/ExceptionCenterView.spec.ts
git commit -m "feat(year-end): 例外中心分類篩選補 atype／ytype query 同步

考核／年終各自的分類篩選 chips 現在透過 setTypeFilter 寫回 URL（atype／
ytype key），切換週期時的重置與週期 query 合併成單次 replace（沿用檔案
既有『多個 query 變更必須合併』的鐵律，避免 vue-router pendingLocation
互相取消）。分享連結或重整能保留已篩選的分類，不用重新點
（V2 IA 簡化 Phase 1 Batch 8 Task 1，年終總表需注意列過濾見 Task 2）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 年終總表「只顯示需注意列」開關補 `attention` query 同步

**Files:**
- Modify: `src/views/yearEnd/YearEndGridView.vue`
- Modify test: `src/views/yearEnd/__tests__/YearEndGridView.spec.ts`

**⚠ 前置條件：Task 1 必須先完成並 commit（兩者程式碼互不耦合，此依賴僅為本計畫文件的執行順序約定）。**

**Interfaces:**
- 不新增 props/emit；`attentionOnly` ref 語意不變，新增 query 讀寫副作用。

**現況**：`YearEndGridView.vue` 目前完全沒有 import `useRoute`/`useRouter`（第 2 行）：
```ts
import { ref, computed, onMounted } from 'vue'
```

`attentionOnly` 現況（`YearEndGridView.vue:125`）：
```ts
const attentionOnly = ref(false)
```

**1. Import 改動**（第 2 行）：

```ts
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
```

**2. 在 `const props = defineProps<{ cycleId: number }>()` 之後（`YearEndGridView.vue:34-35` 附近）新增 `route`/`router`**：

```ts
const props = defineProps<{ cycleId: number }>()
const cycleId = props.cycleId

const route = useRoute()
const router = useRouter()
```

**3. `attentionOnly` 改為讀 URL 初值＋寫回 query**（取代原本第 125 行）：

```ts
// 批次 A③ + Batch 8：過濾開關上 URL query（attention=1／不存在＝關），分享連結
// 或重整不遺失篩選狀態。單一布林開關、無其他 query 變更在同一操作內競爭，直接
// watch 同步即可（不像 ExceptionCenterView.vue 的 typeFilter 需要跟週期切換合併
// 成單次 replace）。
const attentionOnly = ref(String(route?.query?.attention ?? '') === '1')
watch(attentionOnly, (next) => {
  if (router?.replace) {
    router.replace({ query: { ...(route?.query || {}), attention: next ? '1' : undefined } })
  }
})
```

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndGridView.spec.ts`
Expected: PASS

- [ ] **Step 2: 依上方 1-3 段落逐一套用改動**

- [ ] **Step 3: 測試檔改動**

`YearEndGridView.spec.ts` 現況 vue-router mock（第 28-35 行）只給 `push`/`back`，缺 `replace`，且 `query` 是寫死的 `{}`（不可變殼）：

```ts
// Task 12：router.push 改成共用 hoisted mock，讓「展開不再 push 到 404 路由」這件事
// 可被斷言（openDetail 已整支刪除，理論上不會再有任何呼叫）。
const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' }, query: {} }),
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}))
```

改為（比照 `ExceptionCenterView.spec.ts` 已驗證可行的 `routeQuery`/`replaceMock` 殼）：

```ts
// Task 12：router.push 改成共用 hoisted mock，讓「展開不再 push 到 404 路由」這件事
// 可被斷言（openDetail 已整支刪除，理論上不會再有任何呼叫）。
// Batch 8：新增 replaceMock／routeQuery，供 attentionOnly 的 query 同步測試斷言
// （比照 ExceptionCenterView.spec.ts 已驗證可行的殼）。
const { pushMock, replaceMock, routeQuery } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  routeQuery: { value: {} as Record<string, unknown> },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '7' }, query: routeQuery.value }),
  useRouter: () => ({ push: pushMock, back: vi.fn(), replace: replaceMock }),
}))
```

在 `describe('YearEndGridView 需注意列過濾', ...)` 的既有 `beforeEach`（`YearEndGridView.spec.ts:947-955` 附近）新增重置（`vi.clearAllMocks()` 會清空 `replaceMock`/`pushMock` 的呼叫紀錄，但不會重置 `routeQuery.value` 這個一般物件，須手動重置）：

```ts
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    routeQuery.value = {}
    vi.mocked(hasPermission).mockReturnValue(true)
    vi.mocked(api.listYearEndCycles).mockResolvedValue({
      data: [{ id: 7, status: 'OPEN' }],
    } as never)
    // 批次 B：initGrid 會載入試算就緒檢查，預設無例外項
    mockExceptions([])
  })
```

在同一個 `describe('YearEndGridView 需注意列過濾', ...)` 區塊最後新增：

```ts
  it('attentionOnly 開啟時同步 attention=1 query，關閉時清除', async () => {
    vi.mocked(api.getYearEndGrid).mockResolvedValue({ data: [makeRow()] } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { attentionOnly: boolean }

    vm.attentionOnly = true
    await nextTick()
    let lastCall = replaceMock.mock.calls.at(-1)
    expect(lastCall[0].query.attention).toBe('1')

    vm.attentionOnly = false
    await nextTick()
    lastCall = replaceMock.mock.calls.at(-1)
    expect(lastCall[0].query.attention).toBeUndefined()
  })

  it('URL 帶 attention=1 query 時，初始 attentionOnly 為開啟', async () => {
    routeQuery.value = { attention: '1' }
    vi.mocked(api.getYearEndGrid).mockResolvedValue({
      data: [
        makeRow({ settlement_id: 1, employee_id: 10 }),
        makeRow({ settlement_id: 2, employee_id: 11, total_amount: '0' }),
      ],
    } as never)
    const wrapper = await mountView()
    const vm = wrapper.vm as unknown as { attentionOnly: boolean; displayedRows: GridRow[] }
    expect(vm.attentionOnly).toBe(true)
    expect(vm.displayedRows).toHaveLength(1)
  })
```

- [ ] **Step 4: 跑測試確認全綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndGridView.spec.ts`
Expected: PASS（既有全數 + 2 個新增）。⚠ 這支測試檔案內有多個獨立 `describe` 區塊各自的 `beforeEach`（第 165/431/709/837/947/1019 行附近），確認改動 vue-router mock 殼不會讓其他 describe 區塊（未新增 `routeQuery.value = {}` 重置的那些）因為殘留的 query 值而跳針——若發現有其他 describe 區塊的測試因此變紅，在該區塊的 `beforeEach` 也補上 `routeQuery.value = {}` 重置（不影響其功能、只是保險）。

- [ ] **Step 5: 跑更廣範圍**

Run: `npm run test -- --run src/views/yearEnd`
Expected: PASS。

- [ ] **Step 6: 全庫回歸掃描**

Run: `npm run test -- --run src` 導出結果、grep 摘要行確認除本批次範圍外無新增紅燈（已知既有 flaky：`PickupAuthorizationsView.test.ts` 的 `filters refetch on date/status change` 僅在全庫並行負載下偶發紅、單獨跑必綠，與本批次無關，不算新增紅燈）。

- [ ] **Step 7: typecheck + lint + build**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint
npm run build
```
Expected: 三者皆綠。

- [ ] **Step 8: Commit**

```bash
git add -- src/views/yearEnd/YearEndGridView.vue src/views/yearEnd/__tests__/YearEndGridView.spec.ts
git commit -m "feat(year-end): 年終總表需注意列過濾補 attention query 同步

attentionOnly 開關現在寫回 URL query（attention=1／不存在＝關），分享
連結或重整不再回到『看全部』（V2 IA 簡化 Phase 1 Batch 8 Task 2，例外
中心分類篩選見 Task 1，Phase 1 子項 ⑧ URL 狀態同步至此收斂完整）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 記錄

1. **Spec coverage**：Phase 1 子項 ⑧ 完整清單至此全數覆蓋——`term`/`year`/`stage`/`step`/`view`（前批）、`employee`/`tab`（Batch 7）、`filter`（本批次 `atype`/`ytype`/`attention`，涵蓋 Batch 7 scout 報告點名的所有「篩選」類缺口）。`page`（分頁）確認兩個候選頁面皆無分頁 UI，非遺漏。`panel` 語意已由 `tab`（Batch 7）與本批次的分類 chips 涵蓋。`selectedIds`/`selectedSettlements`（批次勾選）、`visibleBonusCols`（已存 storage）、一次性動作 dialog 三類明確排除且已說明理由，不是遺漏。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼；測試檔的「若實測發現 xxx 則 yyy」（`defineExpose` fallback、其他 describe 補重置）屬必要的條件式指示，不是模糊佔位。
3. **Type consistency**：`setTypeFilter(type: string): void`／`onCycleChange(): void` 簽名與既有一致；`attentionOnly` 型別不變（`Ref<boolean>`）。
4. **風險守則**：Task 1 明確處理了檔案自身文件化過的「合併成單次 replace」鐵律，新增的 `setTypeFilter` 與修改的 `onCycleChange` 都嚴格遵守（型別篩選變更獨立呼叫 OK，因為週期切換與型別點擊是使用者互斥的兩個不同操作、不會同時觸發；唯一「同一操作內兩個 key 同時變」的情境是 `onCycleChange` 自己重置 `typeFilter` 又要寫週期 query，已合併處理）。Task 2 的 `attentionOnly` 經確認是唯一、獨立的布林開關，無其他 replace 呼叫在同一 tick 競爭，`watch` 是安全的最簡寫法。
