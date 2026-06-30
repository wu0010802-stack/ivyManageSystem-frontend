# Admin 列表體驗一致化（第一批）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 admin/HR 端的清單頁建立一致的搜尋/篩選/分頁/結果數/匯出體驗，先套到 5 張最痛的清單。

**Architecture:** 抽兩個共用單元——presentational 元件 `<AdminListToolbar>`（搜尋框＋篩選 chip＋結果數＋匯出鈕）與客端篩選 composable `useClientTableFilter`（對齊既有 `useTableFilters` 的回傳形狀）。後端分頁/篩選型清單沿用既有 `useTableFilters`；已全載型清單用 `useClientTableFilter`。僅公告與員工匯出需各加一個後端 query 參數。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + Element Plus + Vitest（happy-dom）；後端 FastAPI + SQLAlchemy + pytest（SQLite test client）。

**Spec:** `docs/superpowers/specs/2026-06-17-admin-list-experience-consistency-design.md`

---

## 前置：worktree 與分支

兩個 repo 各開一支 worktree（**off `origin/main`**，勿從 local main——local main 已堆大量未 push commit）：

- 前端：`feat/admin-list-toolbar-2026-06-17-fe`（repo `/Users/yilunwu/Desktop/ivy-frontend`）
- 後端：`feat/admin-list-filters-2026-06-17-be`（repo `/Users/yilunwu/Desktop/ivy-backend`）

子代理執行時 commit 一律用 `git -C <worktree 絕對路徑>`，並在開頭 `git -C <path> branch --show-current` 驗證分支。前端任務（1-4、6、7、9）在前端 worktree；後端任務（5、8）在後端 worktree。Task 6/9 含 `gen:api`（需後端 worktree 已先完成對應 Task 5/8 並可 `dump_openapi.py`）。

## File Structure

**前端（新建）**
- `src/composables/useClientTableFilter.ts` — 客端搜尋＋篩選 composable（唯一職責：對已載入陣列做 search + predicate 過濾，回 `filtered/total/shown`）。
- `src/composables/__tests__/useClientTableFilter.test.ts`
- `src/components/common/AdminListToolbar.vue` — presentational 工具列（唯一職責：渲染搜尋/chip/筆數/匯出鈕並 emit，不持有資料）。
- `src/components/common/__tests__/AdminListToolbar.test.ts`

**前端（修改）**
- `src/composables/index.ts` — barrel 加 `useClientTableFilter`。
- `src/views/salary/settle/StepReview.vue`（+ `__tests__/StepReview.spec.ts`）— 姓名搜尋。
- `src/views/appraisal/CurrentSemesterOverview.vue`（+ `__tests__/CurrentSemesterOverview.spec.js`）— 搜尋＋chip。
- `src/views/AnnouncementView.vue`（+ 新測試）— useTableFilters＋分頁＋搜尋＋優先級 chip。
- `src/views/DsrRequestsView.vue`（+ `__tests__/DsrRequestsView.test.ts`）— 狀態 chip＋預設待處理。
- `src/utils/download.ts` — `downloadFile` 支援 params。
- `src/views/EmployeeView.vue`（+ 測試）— 匯出沿用 search。
- `src/api/_generated/schema.d.ts` — `gen:api` 重生（Task 6、9）。

**後端（修改）**
- `api/announcements.py::list_announcements`（+ `tests/test_announcements_api.py`）— search/priority。
- `api/exports.py::export_employees`（+ 新測試 `tests/test_export_employees_search.py`）— search。

---

## Task 1: `useClientTableFilter` composable

**Files:**
- Create: `src/composables/useClientTableFilter.ts`
- Test: `src/composables/__tests__/useClientTableFilter.test.ts`
- Modify: `src/composables/index.ts`

- [ ] **Step 1: Write the failing test**

`src/composables/__tests__/useClientTableFilter.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useClientTableFilter } from '@/composables/useClientTableFilter'

interface Row { id: number; name: string; active: boolean }
const DATA: Row[] = [
  { id: 1, name: '王小明', active: true },
  { id: 2, name: '陳大文', active: false },
  { id: 3, name: '王美麗', active: true },
]

describe('useClientTableFilter', () => {
  it('預設無 search 無 filter → filtered === source，total/shown 為長度', () => {
    const { filtered, total, shown } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name],
    })
    expect(filtered.value).toHaveLength(3)
    expect(total.value).toBe(3)
    expect(shown.value).toBe(3)
  })

  it('search 以 searchFields 子字串（大小寫不敏感）過濾', () => {
    const { searchQuery, filtered, shown } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name, String(r.id)],
    })
    searchQuery.value = '王'
    expect(shown.value).toBe(2)
    expect(filtered.value.map((r) => r.id)).toEqual([1, 3])
    searchQuery.value = '2'
    expect(filtered.value.map((r) => r.id)).toEqual([2])
  })

  it('空白 search 不過濾', () => {
    const { searchQuery, shown } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name],
    })
    searchQuery.value = '   '
    expect(shown.value).toBe(3)
  })

  it('filter predicate 過濾；空值（undefined/空字串）視為不過濾', () => {
    const { filterValues, filtered } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name],
      filters: { onlyActive: (r, v) => v !== 'yes' || r.active === true },
    })
    expect(filtered.value).toHaveLength(3)
    filterValues.value = { onlyActive: 'yes' }
    expect(filtered.value.map((r) => r.id)).toEqual([1, 3])
    filterValues.value = { onlyActive: '' }
    expect(filtered.value).toHaveLength(3)
  })

  it('search 與多個 filter 為 AND', () => {
    const { searchQuery, filterValues, filtered } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name],
      filters: { onlyActive: (r, v) => v !== 'yes' || r.active === true },
    })
    searchQuery.value = '王'
    filterValues.value = { onlyActive: 'yes' }
    expect(filtered.value.map((r) => r.id)).toEqual([1, 3])
  })

  it('source 為 reactive getter → 來源變動即反映', () => {
    const src = ref<Row[]>([])
    const { total } = useClientTableFilter<Row>({
      source: () => src.value,
      searchFields: (r) => [r.name],
    })
    expect(total.value).toBe(0)
    src.value = DATA
    expect(total.value).toBe(3)
  })

  it('reset 清空 search 與 filterValues', () => {
    const { searchQuery, filterValues, shown, reset } = useClientTableFilter<Row>({
      source: () => DATA,
      searchFields: (r) => [r.name],
      filters: { onlyActive: (r, v) => v !== 'yes' || r.active === true },
    })
    searchQuery.value = '王'
    filterValues.value = { onlyActive: 'yes' }
    reset()
    expect(searchQuery.value).toBe('')
    expect(filterValues.value).toEqual({})
    expect(shown.value).toBe(3)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/composables/__tests__/useClientTableFilter.test.ts`
Expected: FAIL — `Failed to resolve import "@/composables/useClientTableFilter"`.

- [ ] **Step 3: Write minimal implementation**

`src/composables/useClientTableFilter.ts`:
```ts
import { ref, computed, type Ref, type ComputedRef } from 'vue'

/**
 * 客端清單過濾：對「已全部載入」的陣列做關鍵字搜尋 + 多重 filter predicate。
 * 刻意對齊 useTableFilters 的回傳形狀（searchQuery / total），讓 AdminListToolbar
 * 在「後端分頁型」與「客端篩選型」清單上綁法一致。
 *
 * - search：trim 後大小寫不敏感子字串比對，searchFields 任一命中即保留；空白不過濾。
 * - filters：key→predicate，filterValues[key] 為空（undefined/null/''/[]）時該 predicate 跳過。
 */
export interface UseClientTableFilterOptions<T> {
  source: () => T[]
  searchFields: (row: T) => (string | null | undefined)[]
  filters?: Record<string, (row: T, value: unknown) => boolean>
}

export interface UseClientTableFilterReturn<T> {
  searchQuery: Ref<string>
  filterValues: Ref<Record<string, unknown>>
  filtered: ComputedRef<T[]>
  total: ComputedRef<number>
  shown: ComputedRef<number>
  reset: () => void
}

const isEmptyFilterValue = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)

export function useClientTableFilter<T>(
  options: UseClientTableFilterOptions<T>,
): UseClientTableFilterReturn<T> {
  const { source, searchFields, filters = {} } = options
  const searchQuery = ref('')
  const filterValues = ref<Record<string, unknown>>({})

  const filtered = computed<T[]>(() => {
    const rows = source()
    const q = searchQuery.value.trim().toLowerCase()
    const keys = Object.keys(filters)
    return rows.filter((row) => {
      if (q) {
        const hit = searchFields(row).some(
          (f) => typeof f === 'string' && f.toLowerCase().includes(q),
        )
        if (!hit) return false
      }
      for (const key of keys) {
        const val = filterValues.value[key]
        if (isEmptyFilterValue(val)) continue
        if (!filters[key](row, val)) return false
      }
      return true
    })
  })

  const total = computed(() => source().length)
  const shown = computed(() => filtered.value.length)

  const reset = () => {
    searchQuery.value = ''
    filterValues.value = {}
  }

  return { searchQuery, filterValues, filtered, total, shown, reset }
}
```

- [ ] **Step 4: Add to composables barrel**

In `src/composables/index.ts`, after line 8 (`export { useTableFilters } from './useTableFilters'`), add:
```ts
export { useClientTableFilter } from './useClientTableFilter'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/composables/__tests__/useClientTableFilter.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npm run typecheck`
Expected: no errors.
```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/composables/useClientTableFilter.ts src/composables/__tests__/useClientTableFilter.test.ts src/composables/index.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(composables): 新增 useClientTableFilter 客端清單搜尋/篩選 composable"
```

---

## Task 2: `<AdminListToolbar>` 元件

**Files:**
- Create: `src/components/common/AdminListToolbar.vue`
- Test: `src/components/common/__tests__/AdminListToolbar.test.ts`

- [ ] **Step 1: Write the failing test**

`src/components/common/__tests__/AdminListToolbar.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AdminListToolbar from '../AdminListToolbar.vue'

const FILTERS = [
  {
    key: 'priority',
    label: '優先級',
    options: [
      { label: '一般', value: 'normal' },
      { label: '重要', value: 'important' },
    ],
  },
]

const mountToolbar = (props: Record<string, unknown> = {}) =>
  mount(AdminListToolbar, { props, global: { plugins: [ElementPlus] } })

describe('AdminListToolbar', () => {
  it('渲染搜尋框，輸入 emit update:search', async () => {
    const wrapper = mountToolbar({ search: '' })
    const input = wrapper.find('[data-test="toolbar-search"] input')
    await input.setValue('王')
    const emitted = wrapper.emitted('update:search')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toBe('王')
  })

  it('searchable=false 時不渲染搜尋框', () => {
    const wrapper = mountToolbar({ searchable: false })
    expect(wrapper.find('[data-test="toolbar-search"]').exists()).toBe(false)
  })

  it('點篩選 chip emit update:filter-values，點「全部」移除該 key', async () => {
    const wrapper = mountToolbar({ filters: FILTERS, filterValues: {} })
    const group = wrapper.find('[data-test="toolbar-filter-priority"]')
    const important = group.findAll('.el-radio-button').find((b) => b.text().includes('重要'))
    await important!.trigger('click')
    let emitted = wrapper.emitted('update:filter-values')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1][0]).toEqual({ priority: 'important' })

    const wrapper2 = mountToolbar({ filters: FILTERS, filterValues: { priority: 'important' } })
    const g2 = wrapper2.find('[data-test="toolbar-filter-priority"]')
    const all = g2.findAll('.el-radio-button').find((b) => b.text().includes('全部'))
    await all!.trigger('click')
    emitted = wrapper2.emitted('update:filter-values')
    expect(emitted![emitted!.length - 1][0]).toEqual({})
  })

  it('筆數文字：未給 shown → 共 N 筆；shown≠total → 顯示 X / 共 N 筆', () => {
    expect(mountToolbar({ total: 5 }).find('[data-test="toolbar-count"]').text()).toBe('共 5 筆')
    expect(
      mountToolbar({ total: 5, shown: 2 }).find('[data-test="toolbar-count"]').text(),
    ).toBe('顯示 2 / 共 5 筆')
  })

  it('exportable 渲染匯出鈕並 emit export；預設不渲染', async () => {
    expect(mountToolbar({}).find('[data-test="toolbar-export"]').exists()).toBe(false)
    const wrapper = mountToolbar({ exportable: true })
    await wrapper.find('[data-test="toolbar-export"]').trigger('click')
    expect(wrapper.emitted('export')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/common/__tests__/AdminListToolbar.test.ts`
Expected: FAIL — cannot resolve `../AdminListToolbar.vue`.

- [ ] **Step 3: Write the component**

`src/components/common/AdminListToolbar.vue`:
```vue
<template>
  <div class="admin-list-toolbar">
    <div v-if="searchable" class="admin-list-toolbar__search" data-test="toolbar-search">
      <el-input
        :model-value="search"
        :placeholder="searchPlaceholder"
        :prefix-icon="Search"
        clearable
        @update:model-value="(v) => emit('update:search', String(v ?? ''))"
      />
    </div>

    <div
      v-for="group in filters"
      :key="group.key"
      class="admin-list-toolbar__filter"
      :data-test="`toolbar-filter-${group.key}`"
    >
      <span class="admin-list-toolbar__filter-label">{{ group.label }}</span>
      <el-radio-group
        size="small"
        :model-value="currentValue(group.key)"
        @update:model-value="(v) => onFilterChange(group.key, v)"
      >
        <el-radio-button
          v-for="opt in withAllOption(group)"
          :key="String(opt.value)"
          :value="opt.value"
        >
          {{ opt.label }}
        </el-radio-button>
      </el-radio-group>
    </div>

    <div class="admin-list-toolbar__spacer" />

    <span class="admin-list-toolbar__count" data-test="toolbar-count">{{ countText }}</span>

    <slot name="actions" />

    <el-button
      v-if="exportable"
      type="success"
      :loading="exporting"
      data-test="toolbar-export"
      @click="emit('export')"
    >
      匯出 Excel
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Search } from '@element-plus/icons-vue'

export interface FilterOption {
  label: string
  value: string | number
}
export interface FilterGroup {
  key: string
  label: string
  options: FilterOption[]
  allLabel?: string
}

const props = withDefaults(
  defineProps<{
    search?: string
    searchable?: boolean
    searchPlaceholder?: string
    filters?: FilterGroup[]
    filterValues?: Record<string, unknown>
    total?: number
    shown?: number
    exportable?: boolean
    exporting?: boolean
  }>(),
  {
    search: '',
    searchable: true,
    searchPlaceholder: '搜尋...',
    filters: () => [],
    filterValues: () => ({}),
    total: 0,
    shown: undefined,
    exportable: false,
    exporting: false,
  },
)

const emit = defineEmits<{
  'update:search': [value: string]
  'update:filter-values': [value: Record<string, unknown>]
  export: []
}>()

const ALL_VALUE = '__all__'

const currentValue = (key: string): string | number => {
  const v = props.filterValues[key]
  return v === undefined || v === null || v === '' ? ALL_VALUE : (v as string | number)
}

const withAllOption = (group: FilterGroup): FilterOption[] => [
  { label: group.allLabel ?? '全部', value: ALL_VALUE },
  ...group.options,
]

const onFilterChange = (key: string, value: unknown) => {
  const next = { ...props.filterValues }
  if (value === ALL_VALUE) {
    delete next[key]
  } else {
    next[key] = value
  }
  emit('update:filter-values', next)
}

const countText = computed(() => {
  if (props.shown !== undefined && props.shown !== props.total) {
    return `顯示 ${props.shown} / 共 ${props.total} 筆`
  }
  return `共 ${props.total} 筆`
})
</script>

<style scoped>
.admin-list-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.admin-list-toolbar__search {
  width: 280px;
}
.admin-list-toolbar__filter {
  display: flex;
  align-items: center;
  gap: 6px;
}
.admin-list-toolbar__filter-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.admin-list-toolbar__spacer {
  flex: 1 1 auto;
}
.admin-list-toolbar__count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/components/common/__tests__/AdminListToolbar.test.ts`
Expected: PASS (5 tests). 若 `.el-radio-button` 點擊未觸發 emit，改點其內層 `<span class="el-radio-button__inner">` 或 `findComponent`；EP radio-button 的可點元素為 label。

- [ ] **Step 5: Typecheck + commit**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npm run typecheck`
Expected: no errors.
```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/components/common/AdminListToolbar.vue src/components/common/__tests__/AdminListToolbar.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(common): 新增 AdminListToolbar 共用清單工具列元件"
```

---

## Task 3: 薪資覆核寬表姓名搜尋（StepReview）

**Files:**
- Modify: `src/views/salary/settle/StepReview.vue`（import 315；onlyAttention/visibleRecords 365-370；actions DOM 22-40；摘要 6-21）
- Test: `src/views/salary/settle/__tests__/StepReview.spec.ts`

說明：`SettlementRecord` 僅有 `employee_name`/`employee_id`（無班級/職稱），故只做姓名/編號搜尋；用 `useClientTableFilter` 取代既有 `visibleRecords`，並與 `onlyAttention` toggle 交集（toggle 先過濾、search 後過濾）。

- [ ] **Step 1: Write the failing test**

在 `src/views/salary/settle/__tests__/StepReview.spec.ts` 既有 `describe` 內新增（沿用檔內 `makeSettlement`/`rec`/`mount`/`STUBS` 工廠；`rec` 簽名見檔案 32-43）：
```ts
it('reviewSearch 以姓名過濾 visibleRecords', async () => {
  const settlement = makeSettlement([
    rec({ employee_id: 'E1', employee_name: '王小明' }),
    rec({ employee_id: 'E2', employee_name: '陳大文' }),
    rec({ employee_id: 'E3', employee_name: '王美麗' }),
  ])
  const wrapper = mount(StepReview, {
    global: { stubs: STUBS, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
  })
  const vm = wrapper.vm as unknown as { reviewSearch: string; visibleRecords: { employee_id: string }[] }
  expect(vm.visibleRecords).toHaveLength(3)
  vm.reviewSearch = '王'
  await wrapper.vm.$nextTick()
  expect(vm.visibleRecords.map((r) => r.employee_id)).toEqual(['E1', 'E3'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/views/salary/settle/__tests__/StepReview.spec.ts -t reviewSearch`
Expected: FAIL — `vm.reviewSearch` 為 undefined（設定無效）→ 斷言 `['E1','E3']` 不成立。

- [ ] **Step 3: 改實作**

在 `StepReview.vue` import 區（315 之後）加：
```ts
import { useClientTableFilter } from '@/composables/useClientTableFilter'
```

把既有 365-370 的 `onlyAttention`/`visibleRecords` 區塊改為：
```ts
const onlyAttention = ref(false)
const attentionRecords = computed(() => {
    const sorted = settlement.sortedRecords.value
    if (!onlyAttention.value) return sorted
    return sorted.filter((r) => settlement.anomalies.value.has(r.employee_id))
})
const { searchQuery: reviewSearch, filtered: visibleRecords } = useClientTableFilter<SettlementRecord>({
    source: () => attentionRecords.value,
    searchFields: (r) => [r.employee_name, String(r.employee_id)],
})
```
（`visibleRecords` 仍是 template `:data="visibleRecords"`（46 行）綁的名稱，型別由 `SettlementRecord` 帶入，無 `unknown` 問題。）

在 `review-toolbar__actions` div（22-40，`onlyAttention` switch 旁）插入搜尋框：
```vue
<el-input
  v-model="reviewSearch"
  placeholder="搜尋姓名/編號"
  :prefix-icon="Search"
  clearable
  size="small"
  style="width: 180px"
/>
```
並在 import 區（316 行那段 element-plus icons）把 `Search` 加入：`import { InfoFilled, Edit, Search } from '@element-plus/icons-vue'`（原 317 行為 `InfoFilled, Edit`）。

（選配）在摘要 span（8 行「共 … 人」附近）加篩選後筆數提示：
```vue
<span v-if="reviewSearch.trim()" class="muted">（符合 {{ visibleRecords.length }} 筆）</span>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/views/salary/settle/__tests__/StepReview.spec.ts`
Expected: PASS（含既有測試——預設 `reviewSearch=''` 時 `visibleRecords` 行為與原 `onlyAttention` 邏輯相同）。

- [ ] **Step 5: Typecheck + commit**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npm run typecheck`
```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/views/salary/settle/StepReview.vue src/views/salary/settle/__tests__/StepReview.spec.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(salary): 薪資覆核寬表加姓名/編號搜尋"
```

---

## Task 4: 考核狀態表搜尋＋chip（CurrentSemesterOverview）

**Files:**
- Modify: `src/views/appraisal/CurrentSemesterOverview.vue`（import 9-29；participants 165；el-table `:data` 515；插入點 513-514）
- Test: `src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js`

chip 只用資料真有的維度：「未加入考核」(`is_participant === false`)、「有懲處」(`warning+minor+major > 0`)；無簽核階段欄位。

- [ ] **Step 1: Write the failing test**

在 `CurrentSemesterOverview.spec.js` 主 `describe` 內（在最後一個合法 `it` 之後、提早關閉 describe 的 `})`〔約 528 行〕之前）新增。沿用 `mountView()`、`makeStatusFixture(extra)`、mock API resolve 注入（`getAppraisalAllEmployeesStatus.mockResolvedValue({ data: makeStatusFixture([...]) })`）：
```js
it('overviewSearch 以姓名過濾 filteredParticipants', async () => {
  getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
  getAppraisalAllEmployeesStatus.mockResolvedValue({
    data: makeStatusFixture([
      { participant_id: 9, employee_id: 9, employee_name: '陳大文', is_participant: true, disciplinary: {} },
    ]),
  })
  const wrapper = await mountView()
  const vm = wrapper.vm
  vm.overviewSearch = '陳'
  await wrapper.vm.$nextTick()
  expect(vm.filteredParticipants.every((p) => p.employee_name.includes('陳'))).toBe(true)
  expect(vm.filteredParticipants.some((p) => p.employee_name === '陳大文')).toBe(true)
})

it('未加入考核 chip 僅留 is_participant===false', async () => {
  getAppraisalCurrentCycle.mockResolvedValue({ data: SAMPLE_CYCLE })
  getAppraisalAllEmployeesStatus.mockResolvedValue({
    data: makeStatusFixture([
      { participant_id: 8, employee_id: 8, employee_name: '未加入者', is_participant: false, disciplinary: {} },
    ]),
  })
  const wrapper = await mountView()
  const vm = wrapper.vm
  vm.overviewFilters = { participation: 'non' }
  await wrapper.vm.$nextTick()
  expect(vm.filteredParticipants.every((p) => p.is_participant === false)).toBe(true)
  expect(vm.filteredParticipants.length).toBeGreaterThan(0)
})
```
在 `GLOBAL_STUBS`（spec.js 55-177）加一行 stub，避免工具列內部 EP 元件渲染：
```js
AdminListToolbar: true,
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js -t overviewSearch`
Expected: FAIL — `vm.filteredParticipants` / `vm.overviewSearch` undefined。

- [ ] **Step 3: 改實作**

import 區（9-29）加：
```ts
import { Search } from '@element-plus/icons-vue'
import { useClientTableFilter } from '@/composables/useClientTableFilter'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
```
（`Search` 也可併入既有 11 行 icons import。）

在 `participants` computed（165 行）之後加：
```ts
const {
  searchQuery: overviewSearch,
  filterValues: overviewFilters,
  filtered: filteredParticipants,
  total: participantTotal,
  shown: participantShown,
} = useClientTableFilter<ParticipantRow>({
  source: () => participants.value,
  searchFields: (p) => [p.employee_name],
  filters: {
    participation: (p, v) => v !== 'non' || p.is_participant === false,
    discipline: (p, v) => {
      if (v !== 'has') return true
      const d = p.disciplinary || {}
      return (d.warning_count || 0) + (d.minor_count || 0) + (d.major_count || 0) > 0
    },
  },
})

const overviewFilterGroups = [
  { key: 'participation', label: '參與', options: [{ label: '未加入考核', value: 'non' }] },
  { key: 'discipline', label: '懲處', options: [{ label: '有懲處', value: 'has' }] },
]
```

template：在 `el-table`（514 行）之前插入工具列：
```vue
<AdminListToolbar
  v-model:search="overviewSearch"
  search-placeholder="搜尋教師姓名"
  :filters="overviewFilterGroups"
  v-model:filter-values="overviewFilters"
  :total="participantTotal"
  :shown="participantShown"
/>
```
並把 515 行 `:data="participants"` 改為 `:data="filteredParticipants"`。

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js`
Expected: PASS（既有測試不受影響：預設無 search/filter → `filteredParticipants` === `participants`）。

- [ ] **Step 5: Typecheck + commit**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npm run typecheck`
```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/views/appraisal/CurrentSemesterOverview.vue src/views/appraisal/__tests__/CurrentSemesterOverview.spec.js
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(appraisal): 考核狀態表加姓名搜尋與未加入/有懲處篩選"
```

---

## Task 5: 後端公告 search/priority（announcements）

**Files:**
- Modify: `api/announcements.py::list_announcements`（簽名 141-147；query 176-187；total 188；切片 189）
- Test: `tests/test_announcements_api.py`（fixture `announcements_client` 24-53；helper `_create_employee`/`_create_user`/`_login`）

在後端 worktree `/Users/yilunwu/Desktop/ivy-backend` 操作。

- [ ] **Step 1: Write the failing test**

在 `tests/test_announcements_api.py` 新增（沿用既有 fixture/helper；建多筆 `Announcement` 後查詢）：
```python
def test_list_announcements_search_filters_by_title(announcements_client):
    client, sf = announcements_client
    with sf() as session:
        author = _create_employee(session, "E001", "園長")
        _create_user(session, "ann_admin", author.id)
        for title in ("期末注意事項", "校外教學通知", "期末成績"):
            session.add(Announcement(title=title, content="x", priority="normal", created_by=author.id))
        session.commit()
    assert _login(client, "ann_admin").status_code == 200
    res = client.get("/api/announcements", params={"search": "期末"})
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 2
    assert all("期末" in it["title"] for it in body["items"])


def test_list_announcements_priority_filter(announcements_client):
    client, sf = announcements_client
    with sf() as session:
        author = _create_employee(session, "E001", "園長")
        _create_user(session, "ann_admin", author.id)
        session.add(Announcement(title="A", content="x", priority="urgent", created_by=author.id))
        session.add(Announcement(title="B", content="x", priority="normal", created_by=author.id))
        session.commit()
    assert _login(client, "ann_admin").status_code == 200
    res = client.get("/api/announcements", params={"priority": "urgent"})
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["priority"] == "urgent"
```
（`Announcement` 模型已於該測試檔 import；若無，照檔頭既有 import 補。建資料欄位對齊既有 list 測試 88-114 的用法。）

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_announcements_api.py -k "search_filters or priority_filter" -v`
Expected: FAIL — 無 search/priority 參數時回傳全部，`total` 為 3 / 2 而非 2 / 1。

- [ ] **Step 3: 改實作**

`api/announcements.py` 簽名（141-147）加參數（檔頭已 import `Query`；`Optional` 若未 import 則改用 `str | None`）：
```python
def list_announcements(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    search: str | None = Query(None),
    priority: str | None = Query(None),
    current_user: dict = Depends(
        require_staff_permission(Permission.ANNOUNCEMENTS_READ)
    ),
):
```
在 query（176-187 之後）與 total（188）之間，建 filter 並同時套用：
```python
        ann_filters = []
        if search:
            ann_filters.append(Announcement.title.ilike(f"%{search}%"))
        if priority:
            ann_filters.append(Announcement.priority == priority)
        if ann_filters:
            query = query.filter(*ann_filters)

        count_q = session.query(func.count(Announcement.id))
        if ann_filters:
            count_q = count_q.filter(*ann_filters)
        total = count_q.scalar() or 0
```
（刪除原 188 行 `total = session.query(func.count(Announcement.id)).scalar() or 0`，改為上面 count_q 版本。`query` 變數即 176-187 那段；`query.filter(...)` 須在 `.offset/.limit`〔189 行〕之前。）

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_announcements_api.py -v`
Expected: PASS（含既有 list 測試）。

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-backend add api/announcements.py tests/test_announcements_api.py
git -C /Users/yilunwu/Desktop/ivy-backend commit -m "feat(announcements): list 端點支援 search/priority 篩選（同步套用 total 計數）"
```

---

## Task 6: 前端公告分頁＋搜尋＋優先級 chip（AnnouncementView）

**Files:**
- Modify: `src/views/AnnouncementView.vue`（loading 50；announcements 51；fetchAnnouncements 183-193；priorityOptions 69-73；page-header 385-388；el-table 390；`</el-table>` 501；onMounted 377；refetch 站點 333/350/362）
- Modify: `src/api/_generated/schema.d.ts`（gen:api 重生）
- Test: `src/views/__tests__/AnnouncementView.toolbar.test.ts`（新）

依賴 Task 5 已完成（後端可 `dump_openapi.py`）。

- [ ] **Step 1: Write the failing test**

`src/views/__tests__/AnnouncementView.toolbar.test.ts`（用 `shallowMount` 自動 stub 子元件，只驗資料層）：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'

vi.mock('@/api/announcements', () => ({
  getAnnouncements: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  getAnnouncementReaders: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  getAnnouncementParentRecipients: vi.fn().mockResolvedValue({ data: { recipients: [] } }),
  replaceAnnouncementParentRecipients: vi.fn(),
  getAnnouncementRecipients: vi.fn().mockResolvedValue({ data: { recipient_ids: [] } }),
  uploadAnnouncementAttachment: vi.fn(),
  deleteAnnouncementAttachment: vi.fn(),
}))
vi.mock('element-plus', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }
})

import AnnouncementView from '@/views/AnnouncementView.vue'
import { getAnnouncements } from '@/api/announcements'

describe('AnnouncementView 清單工具列', () => {
  beforeEach(() => vi.clearAllMocks())

  it('掛載即帶 page/page_size 呼叫（修資料遺失）', async () => {
    shallowMount(AnnouncementView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(getAnnouncements).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, page_size: 50 }),
    )
  })

  it('優先級篩選帶 priority 重新查詢', async () => {
    const wrapper = shallowMount(AnnouncementView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    ;(wrapper.vm as unknown as { onAnnFilterChange: (v: Record<string, unknown>) => void })
      .onAnnFilterChange({ priority: 'urgent' })
    await flushPromises()
    expect(getAnnouncements).toHaveBeenCalledWith(expect.objectContaining({ priority: 'urgent' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/views/__tests__/AnnouncementView.toolbar.test.ts`
Expected: FAIL — 現況 `getAnnouncements({})` 不帶 page/page_size；`onAnnFilterChange` 不存在。

- [ ] **Step 3: 改實作**

import 區加：
```ts
import { useTableFilters } from '@/composables/useTableFilters'
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
import { getAnnouncements } from '@/api/announcements'  // 若已 import 則不重複
```

刪除既有 `loading`（50）、`announcements`（51）兩個 ref 與 `fetchAnnouncements`（183-193）整段，改為：
```ts
const {
  searchQuery: annSearch,
  items: rawAnnouncements,
  total: annTotal,
  page: annPage,
  pageSize: annPageSize,
  loading,
  fetch: fetchAnnouncements,
  setPage: annSetPage,
  setExtraParams,
} = useTableFilters({ apiFunc: (params) => getAnnouncements(params), initialPageSize: 50 })

const announcements = computed(() => rawAnnouncements.value as AnnouncementItem[])

const annFilterValues = ref<Record<string, unknown>>({})
const onAnnFilterChange = (v: Record<string, unknown>) => {
  annFilterValues.value = v
  return setExtraParams({ priority: v.priority })
}
const annFilterGroups = computed(() => [
  { key: 'priority', label: '優先級', options: priorityOptions.map((o) => ({ label: o.label, value: o.value })) },
])
```
（需確認 `computed`/`ref` 已 import 自 vue；`priorityOptions` 在 69-73 已存在。`onMounted(fetchAnnouncements)`〔377〕、submit/delete/togglePin 後的 `fetchAnnouncements()`〔333/350/362〕呼叫保持不變。）

template：在 `page-header`（385-388）之後、`el-table`（390）之前插入：
```vue
<AdminListToolbar
  v-model:search="annSearch"
  search-placeholder="搜尋公告標題"
  :filters="annFilterGroups"
  :filter-values="annFilterValues"
  :total="annTotal"
  @update:filter-values="onAnnFilterChange"
/>
```
在 `</el-table>`（501）之後插入分頁：
```vue
<el-pagination
  v-if="annTotal > annPageSize"
  style="margin-top: 16px; justify-content: flex-end;"
  background
  layout="total, prev, pager, next"
  :total="annTotal"
  :page-size="annPageSize"
  :current-page="annPage"
  @current-change="annSetPage"
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/views/__tests__/AnnouncementView.toolbar.test.ts`
Expected: PASS（2 tests）。

- [ ] **Step 5: 重生 OpenAPI 型別**

Run:
```bash
cd /Users/yilunwu/Desktop/ivy-backend && python scripts/dump_openapi.py
cd /Users/yilunwu/Desktop/ivy-frontend && npm run gen:api
```
Expected: `schema.d.ts` 更新（`/announcements` get 多出 search/priority query）。

- [ ] **Step 6: Typecheck + commit**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npm run typecheck`
```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/views/AnnouncementView.vue src/views/__tests__/AnnouncementView.toolbar.test.ts src/api/_generated/schema.d.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(announcements): 公告清單接分頁＋標題搜尋＋優先級篩選（修 >50 則遺失）"
```

---

## Task 7: DSR 佇列狀態 chip＋預設待處理（DsrRequestsView）

**Files:**
- Modify: `src/views/DsrRequestsView.vue`（STATUS_LABEL 17-21；records 30；loading 31；fetchList 46-56；onMounted 106；h2 111；el-table 113）
- Test: `src/views/__tests__/DsrRequestsView.test.ts`（mock 5-44；globalStubs 59-90）

後端已支援 `status`，純前端。

- [ ] **Step 1: Write the failing test**

在 `DsrRequestsView.test.ts` 的 `globalStubs`（59-90）加：
```ts
AdminListToolbar: true,
```
新增測試：
```ts
it('預設帶 status=pending 查詢', async () => {
  mount(DsrRequestsView, { global: { stubs: globalStubs, directives: globalDirectives } })
  await flushPromises()
  expect(listDsrRequests).toHaveBeenCalledWith({ status: 'pending' })
})

it('切換狀態 chip 以新 status 重查；全部則不帶 status', async () => {
  const wrapper = mount(DsrRequestsView, { global: { stubs: globalStubs, directives: globalDirectives } })
  await flushPromises()
  const vm = wrapper.vm as unknown as { onStatusFilterChange: (v: Record<string, unknown>) => void }
  vm.onStatusFilterChange({ status: 'approved' })
  await flushPromises()
  expect(listDsrRequests).toHaveBeenLastCalledWith({ status: 'approved' })
  vm.onStatusFilterChange({})
  await flushPromises()
  expect(listDsrRequests).toHaveBeenLastCalledWith(undefined)
})
```
（`flushPromises` 從 `@vue/test-utils` import；若檔案頂部尚未 import 則補。）

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/views/__tests__/DsrRequestsView.test.ts -t status`
Expected: FAIL — 現況 `listDsrRequests()` 不帶參數；`onStatusFilterChange` 不存在。

- [ ] **Step 3: 改實作**

import 區加 `AdminListToolbar`、`computed`（若未 import）：
```ts
import AdminListToolbar from '@/components/common/AdminListToolbar.vue'
```
在 `loading`（31）後加狀態：
```ts
const statusFilter = ref<string>('pending')
const dsrFilterGroups = [{
  key: 'status', label: '狀態', allLabel: '全部',
  options: [
    { label: '待處理', value: 'pending' },
    { label: '已核准', value: 'approved' },
    { label: '已駁回', value: 'rejected' },
  ],
}]
const dsrFilterValues = computed<Record<string, unknown>>(() => ({ status: statusFilter.value }))
const onStatusFilterChange = (v: Record<string, unknown>) => {
  statusFilter.value = (v.status as string) ?? ''
  return fetchList()
}
```
把 `fetchList`（46-56）的 `listDsrRequests()` 改為帶 status：
```ts
    const params = statusFilter.value ? { status: statusFilter.value } : undefined
    const res = await listDsrRequests(params)
```
template：在 `<h2>`（111）之後、`<el-table>`（113）之前插入：
```vue
<AdminListToolbar
  :searchable="false"
  :filters="dsrFilterGroups"
  :filter-values="dsrFilterValues"
  :total="records.length"
  @update:filter-values="onStatusFilterChange"
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/views/__tests__/DsrRequestsView.test.ts`
Expected: PASS（既有 8 測試＋新 2；既有 `toHaveBeenCalledOnce`/`toHaveLength(2)` 不受帶參數影響，mock 忽略 params）。

- [ ] **Step 5: Typecheck + commit**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npm run typecheck`
```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/views/DsrRequestsView.vue src/views/__tests__/DsrRequestsView.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(dsr): DSR 佇列加狀態篩選與預設待處理視圖"
```

---

## Task 8: 後端員工匯出 search（exports）

**Files:**
- Modify: `api/exports.py::export_employees`（簽名 135-140；查詢 144-146；router prefix 44）
- Test: `tests/test_export_employees_search.py`（新；參考 `tests/test_employee_attendance_export_authz.py` 的 export client fixture）

後端 worktree 操作。

- [ ] **Step 1: Write the failing test**

`tests/test_export_employees_search.py`（自足：用 `test_employees.py` 已確認存在的 `_login_admin`〔67-84，建 admin 帶 EMPLOYEES_READ/WRITE 並登入〕，員工資料一律走已驗證可動的 `POST /api/employees`，故同時掛 `employees_router` 與 `exports_router`）：
```python
import io
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from openpyxl import load_workbook

import api.base as base_module
from models.base import Base
from api.auth import router as auth_router
from api.employees import router as employees_router
from api.exports import router as exports_router, _export_rate_limit
from tests.test_employees import _login_admin  # 67-84，簽名 (client, session_factory)


@pytest.fixture
def exports_client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'exp.sqlite'}", connect_args={"check_same_thread": False})
    sf = sessionmaker(bind=engine)
    old_e, old_s = base_module._engine, base_module._SessionFactory
    base_module._engine, base_module._SessionFactory = engine, sf
    Base.metadata.create_all(engine)
    app = FastAPI()
    from utils.exception_handlers import register_exception_handlers
    register_exception_handlers(app)
    app.include_router(auth_router)
    app.include_router(employees_router)
    app.include_router(exports_router)
    app.dependency_overrides[_export_rate_limit] = lambda: None
    with TestClient(app) as client:
        yield client, sf
    base_module._engine, base_module._SessionFactory = old_e, old_s


def _rows(content: bytes) -> int:
    wb = load_workbook(io.BytesIO(content))
    ws = wb.active
    return max(ws.max_row - 1, 0)  # 扣表頭


def test_export_employees_search_narrows(exports_client):
    client, sf = exports_client
    _login_admin(client, sf)
    # 透過 API 建兩名員工（一名含「王」一名不含），payload 對齊 test_employees.py:145-166
    for name in ("王小明", "陳大文"):
        r = client.post("/api/employees", json={"name": name, "employee_type": "regular", "gender": "男"})
        assert r.status_code == 201, r.text
    full = client.get("/api/exports/employees")
    assert full.status_code == 200
    narrowed = client.get("/api/exports/employees", params={"search": "王"})
    assert narrowed.status_code == 200
    assert _rows(narrowed.content) == 1
    assert _rows(full.content) == 2
```
> 若 `POST /api/employees` 需更多必填欄位才回 201，補上對齊 `test_employees.py:145-166` 的 payload（如 `email`、`insurance_effective_date`）。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_export_employees_search.py -v`
Expected: FAIL — 匯出忽略 search，narrowed 與 full 列數相同（`<` 不成立）。

- [ ] **Step 3: 改實作**

`api/exports.py` 簽名（135-140）加參數（檔頭確認已 import `Query`；無則 `from fastapi import Query`）：
```python
@router.get("/employees")
def export_employees(
    request: Request,
    search: str | None = Query(None),
    _rl=Depends(_export_rate_limit),
    current_user: dict = Depends(require_staff_permission(Permission.EMPLOYEES_READ)),
):
```
查詢（144-146）改為帶 filter：
```python
    q = session.query(Employee).order_by(Employee.employee_id)
    if search:
        like = f"%{search}%"
        q = q.filter(Employee.name.ilike(like) | Employee.employee_id.ilike(like))
    employees = list(q.yield_per(500))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_export_employees_search.py -v`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-backend add api/exports.py tests/test_export_employees_search.py
git -C /Users/yilunwu/Desktop/ivy-backend commit -m "feat(exports): 員工匯出支援 search 篩選"
```

---

## Task 9: 前端匯出沿用 search（downloadFile + EmployeeView）

**Files:**
- Modify: `src/utils/download.ts`（downloadFile 38-45）
- Modify: `src/views/EmployeeView.vue`（searchQuery 349；exportEmployees 404-406）
- Modify: `src/api/_generated/schema.d.ts`（gen:api 重生）
- Test: `src/utils/__tests__/download.test.ts`（新或既有）

依賴 Task 8 已完成。

- [ ] **Step 1: Write the failing test**

`src/utils/__tests__/download.test.ts`（若已存在則新增 `it`）：
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const get = vi.fn().mockResolvedValue({ data: new Blob(['x']), headers: {} })
vi.mock('@/api', () => ({ default: { get } }))
vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

import { downloadFile } from '@/utils/download'

describe('downloadFile', () => {
  beforeEach(() => vi.clearAllMocks())
  it('帶 params 時傳給 axios get', async () => {
    await downloadFile('/exports/employees', '員工名冊.xlsx', { search: '王' })
    expect(get).toHaveBeenCalledWith(
      '/exports/employees',
      expect.objectContaining({ responseType: 'blob', params: { search: '王' } }),
    )
  })
  it('未帶 params 時 params 為 undefined（向後相容）', async () => {
    await downloadFile('/exports/employees')
    expect(get).toHaveBeenCalledWith(
      '/exports/employees',
      expect.objectContaining({ responseType: 'blob', params: undefined }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/utils/__tests__/download.test.ts`
Expected: FAIL — 現況 `downloadFile` 無第三參數，`api.get` 未帶 `params`。

- [ ] **Step 3: 改實作**

`src/utils/download.ts` 的 `downloadFile`（38-45）改：
```ts
export async function downloadFile(
  url: string,
  fallbackName = 'download.xlsx',
  params?: Record<string, unknown>,
) {
  try {
    const response = await api.get(url, { responseType: 'blob', timeout: 30000, params })
    saveBlobResponse(response, fallbackName)
  } catch (error) {
    ElMessage.error('下載失敗: ' + ((error as { message?: string })?.message || '未知錯誤'))
  }
}
```
`EmployeeView.vue` 的 `exportEmployees`（404-406）改：
```ts
const exportEmployees = () => {
  const q = searchQuery.value.trim()
  downloadFile('/exports/employees', '員工名冊.xlsx', q ? { search: q } : undefined)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/yilunwu/Desktop/ivy-frontend && npx vitest run src/utils/__tests__/download.test.ts`
Expected: PASS。

- [ ] **Step 5: 重生 OpenAPI 型別 + 全量回歸**

```bash
cd /Users/yilunwu/Desktop/ivy-backend && python scripts/dump_openapi.py
cd /Users/yilunwu/Desktop/ivy-frontend && npm run gen:api
npm run typecheck
npx vitest run
```
Expected: schema.d.ts 更新（`/exports/employees` 多 search query）；typecheck 0 錯；vitest 全綠。

- [ ] **Step 6: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend add src/utils/download.ts src/utils/__tests__/download.test.ts src/views/EmployeeView.vue src/api/_generated/schema.d.ts
git -C /Users/yilunwu/Desktop/ivy-frontend commit -m "feat(employees): 員工清單匯出沿用當前搜尋條件"
```

---

## 收尾驗證（全部任務完成後）

- [ ] 前端：`cd /Users/yilunwu/Desktop/ivy-frontend && npm run typecheck && npx vitest run && npm run gen:api:check`（型別 0 錯、測試全綠、無 OpenAPI 漂移）。
- [ ] 後端：`cd /Users/yilunwu/Desktop/ivy-backend && python -m pytest tests/test_announcements_api.py tests/test_export_employees_search.py -v`（綠）。
- [ ] 兩 repo 各自 push 功能分支、開 PR、CI 綠後 merge，當天 `git worktree remove`（依 CLAUDE.md DoD）。後端含 query 參數無 migration，Zeabur resume 後自動生效、無前置。
