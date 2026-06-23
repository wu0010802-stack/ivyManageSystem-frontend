# Admin 密集網格輸入體驗（第二批）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓 admin 兩個密集數字網格（考核手填事件、月度固定費用）可用鍵盤連續輸入、未存離開有攔截、看得到原值，並各補一個少打字的加值（固定費用套用全年、考核沿用上一週期）。

**Architecture:** 抽 2 個共用 composable（`useGridKeyboardNav`、`useUnsavedChangesGuard`）套到兩網格；原值對照與加值各網格自理；固定費用因父層 `:key` remount，換年度/切 tab 的攔截上提到 `ReportsView`（panel emit dirty + 受控年度選擇 + `el-tabs :before-leave`）。100% 前端，沿用既有 API，無 migration、無 schema 異動。

**Tech Stack:** Vue 3（`<script setup lang="ts">`）、Element Plus、vue-router、Vitest + @vue/test-utils（happy-dom）。

## Global Constraints

- **TS-only**：所有新檔 `.ts` / SFC `<script setup lang="ts">`；禁 `: any`/`as any`，用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`。
- **無後端/無 migration/無 `gen:api`**：只用既有端點 `listAppraisalCycles` / `getAppraisalAllEmployeesStatus` / `getManualEventCounts` / `batchUpsertManualEventCounts` / `getMonthlyFixedCosts` / `batchUpsertMonthlyFixedCosts`。不重生 `schema.d.ts`。
- **測試慣例**：spec 檔放對應 `__tests__/`，純 composable 直接呼叫；含 lifecycle hook 的 composable 用 `mount` 一個測試宿主元件。API mock 一律 `vi.mock('@/api/...')` 寫在 import 之前。
- **驗證 gate**：`npm run typecheck`（0 error）、`npm run test`（新舊全綠）、`npm run lint`（`no-explicit-any`）。
- **語言**：繁體中文（UI 文案、commit、註解）。
- **不可回歸**：既有 `ManualEventEntrySection.spec.js` 等測試需維持綠。

---

### Task 1: `useGridKeyboardNav` 共用 composable

容器層鍵盤導航：Enter/↓ 下一列同欄、Shift+Enter/↑ 上一列；左右交給原生 Tab。相容 `el-input-number`（attr 落外層 div、input 為後代）與原生 `<input>`（attr 落 input 本身）。

**Files:**
- Create: `src/composables/useGridKeyboardNav.ts`
- Test: `src/composables/__tests__/useGridKeyboardNav.test.ts`

**Interfaces:**
- Produces: `useGridKeyboardNav(container: Ref<HTMLElement | null>): void`。網格每個可輸入格需標 `data-grid-row="<number>"` `data-grid-col="<number>"`（標在 `el-input-number` 或原生 `<input>` 上）。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/composables/__tests__/useGridKeyboardNav.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref, h, onMounted } from 'vue'
import { useGridKeyboardNav } from '@/composables/useGridKeyboardNav'

// 測試宿主：2 列 × 2 欄原生 input 網格
const Host = defineComponent({
  setup() {
    const container = ref<HTMLElement | null>(null)
    useGridKeyboardNav(container)
    return () =>
      h('div', { ref: container }, [
        h('input', { 'data-grid-row': 0, 'data-grid-col': 0, id: 'r0c0' }),
        h('input', { 'data-grid-row': 0, 'data-grid-col': 1, id: 'r0c1' }),
        h('input', { 'data-grid-row': 1, 'data-grid-col': 0, id: 'r1c0' }),
        h('input', { 'data-grid-row': 1, 'data-grid-col': 1, id: 'r1c1' }),
      ])
  },
})

function fire(el: Element, init: KeyboardEventInit) {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
}

describe('useGridKeyboardNav', () => {
  it('Enter 從 r0c0 移焦點到 r1c0（下一列同欄）', () => {
    const w = mount(Host, { attachTo: document.body })
    const r0c0 = w.find('#r0c0').element as HTMLInputElement
    r0c0.focus()
    fire(r0c0, { key: 'Enter' })
    expect(document.activeElement?.id).toBe('r1c0')
    w.unmount()
  })

  it('Shift+Enter 從 r1c1 移到 r0c1（上一列同欄）', () => {
    const w = mount(Host, { attachTo: document.body })
    const r1c1 = w.find('#r1c1').element as HTMLInputElement
    r1c1.focus()
    fire(r1c1, { key: 'Enter', shiftKey: true })
    expect(document.activeElement?.id).toBe('r0c1')
    w.unmount()
  })

  it('底列 Enter 不動（邊界，無下一列）', () => {
    const w = mount(Host, { attachTo: document.body })
    const r1c0 = w.find('#r1c0').element as HTMLInputElement
    r1c0.focus()
    fire(r1c0, { key: 'Enter' })
    expect(document.activeElement?.id).toBe('r1c0')
    w.unmount()
  })

  it('ArrowDown 等同 Enter 且 preventDefault（避免 number step）', () => {
    const w = mount(Host, { attachTo: document.body })
    const r0c1 = w.find('#r0c1').element as HTMLInputElement
    r0c1.focus()
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    r0c1.dispatchEvent(ev)
    expect(document.activeElement?.id).toBe('r1c1')
    expect(ev.defaultPrevented).toBe(true)
    w.unmount()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/composables/__tests__/useGridKeyboardNav.test.ts`
Expected: FAIL（`useGridKeyboardNav` 不存在 / 找不到模組）

- [ ] **Step 3: 實作 composable**

```ts
// src/composables/useGridKeyboardNav.ts
import { onMounted, onScopeDispose } from 'vue'
import type { Ref } from 'vue'

/**
 * 密集網格鍵盤導航（容器層）。
 * 每個可輸入格需標 data-grid-row / data-grid-col。
 * Enter / ArrowDown → 下一列同欄；Shift+Enter / ArrowUp → 上一列同欄。
 * 左右不接管，交給瀏覽器原生 Tab 與數字框游標。
 */
export function useGridKeyboardNav(container: Ref<HTMLElement | null>): void {
  function findInput(el: Element | null): HTMLInputElement | null {
    if (!el) return null
    if (el instanceof HTMLInputElement) return el
    return el.querySelector('input')
  }

  function onKeydown(e: KeyboardEvent): void {
    const key = e.key
    const isDown = key === 'Enter' && !e.shiftKey
    const isUp = (key === 'Enter' && e.shiftKey) || key === 'ArrowUp'
    const isArrowDown = key === 'ArrowDown'
    if (!isDown && !isUp && !isArrowDown) return

    const target = e.target as HTMLElement | null
    const cell = target?.closest('[data-grid-row][data-grid-col]') as HTMLElement | null
    if (!cell || !container.value) return

    const row = Number(cell.getAttribute('data-grid-row'))
    const col = Number(cell.getAttribute('data-grid-col'))
    if (Number.isNaN(row) || Number.isNaN(col)) return

    const nextRow = isUp ? row - 1 : row + 1
    const nextCell = container.value.querySelector(
      `[data-grid-row="${nextRow}"][data-grid-col="${col}"]`,
    )
    const input = findInput(nextCell)
    // ArrowUp/Down 在數字框預設會加減值；無論有無目標都要 preventDefault
    if (key === 'ArrowUp' || isArrowDown) e.preventDefault()
    if (!input) return
    e.preventDefault()
    input.focus()
    input.select()
  }

  onMounted(() => container.value?.addEventListener('keydown', onKeydown))
  onScopeDispose(() => container.value?.removeEventListener('keydown', onKeydown))
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/composables/__tests__/useGridKeyboardNav.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: typecheck + commit**

Run: `npm run typecheck`
Expected: 0 error

```bash
git add src/composables/useGridKeyboardNav.ts src/composables/__tests__/useGridKeyboardNav.test.ts
git commit -m "feat(composables): useGridKeyboardNav 密集網格 Enter/方向鍵跳格"
```

---

### Task 2: `useUnsavedChangesGuard` 共用 composable

dirty 時攔截離開：`onBeforeRouteLeave` + `beforeunload` + 回傳 `confirmDiscard()` 供元件內切換用。與 `useFormDraft`（草稿持久化）關注點不同，不互相取代。

**Files:**
- Create: `src/composables/useUnsavedChangesGuard.ts`
- Test: `src/composables/__tests__/useUnsavedChangesGuard.test.ts`

**Interfaces:**
- Produces: `useUnsavedChangesGuard(isDirty: () => boolean): { confirmDiscard: () => Promise<boolean> }`

- [ ] **Step 1: 寫失敗測試**

```ts
// src/composables/__tests__/useUnsavedChangesGuard.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// 攔截 vue-router 的 onBeforeRouteLeave：把註冊的 guard 抓出來
let registeredGuard: (() => unknown) | null = null
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn((cb: () => unknown) => { registeredGuard = cb }),
}))

// ElMessageBox.confirm mock
const confirmMock = vi.fn()
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: (...a: unknown[]) => confirmMock(...a) },
}))

import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'

function mountWith(isDirty: () => boolean) {
  const Host = defineComponent({
    setup() {
      const api = useUnsavedChangesGuard(isDirty)
      return () => h('div', { 'data-api': '' }, JSON.stringify(!!api.confirmDiscard))
    },
  })
  return mount(Host, { attachTo: document.body })
}

beforeEach(() => {
  registeredGuard = null
  confirmMock.mockReset()
})

describe('useUnsavedChangesGuard', () => {
  it('clean：onBeforeRouteLeave 放行、不跳 confirm', async () => {
    mountWith(() => false)
    const result = await registeredGuard!()
    expect(result).toBe(true)
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('dirty + 使用者確認捨棄：放行', async () => {
    confirmMock.mockResolvedValue('confirm')
    mountWith(() => true)
    const result = await registeredGuard!()
    expect(confirmMock).toHaveBeenCalledOnce()
    expect(result).toBe(true)
  })

  it('dirty + 使用者取消：攔截（回 false）', async () => {
    confirmMock.mockRejectedValue('cancel')
    mountWith(() => true)
    const result = await registeredGuard!()
    expect(result).toBe(false)
  })

  it('confirmDiscard：clean 直接回 true 不跳 confirm', async () => {
    let confirmDiscard!: () => Promise<boolean>
    const Host = defineComponent({
      setup() {
        confirmDiscard = useUnsavedChangesGuard(() => false).confirmDiscard
        return () => h('div')
      },
    })
    mount(Host, { attachTo: document.body })
    expect(await confirmDiscard()).toBe(true)
    expect(confirmMock).not.toHaveBeenCalled()
  })

  it('beforeunload：dirty 時 preventDefault', () => {
    mountWith(() => true)
    const ev = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/composables/__tests__/useUnsavedChangesGuard.test.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 composable**

```ts
// src/composables/useUnsavedChangesGuard.ts
import { onMounted, onScopeDispose } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessageBox } from 'element-plus'

/**
 * dirty 時攔截離開（路由 + 關閉分頁）。
 * 注意：與 useFormDraft 不同——後者是草稿持久化，本 composable 只負責警告/攔截。
 */
export function useUnsavedChangesGuard(isDirty: () => boolean): {
  confirmDiscard: () => Promise<boolean>
} {
  async function confirmDiscard(): Promise<boolean> {
    if (!isDirty()) return true
    try {
      await ElMessageBox.confirm('尚有未儲存的變更，確定離開並捨棄？', '未儲存變更', {
        type: 'warning',
        confirmButtonText: '捨棄變更',
        cancelButtonText: '留在此頁',
      })
      return true
    } catch {
      return false
    }
  }

  onBeforeRouteLeave(async () => confirmDiscard())

  function onBeforeUnload(e: BeforeUnloadEvent): void {
    if (isDirty()) {
      e.preventDefault()
      e.returnValue = ''
    }
  }
  onMounted(() => window.addEventListener('beforeunload', onBeforeUnload))
  onScopeDispose(() => window.removeEventListener('beforeunload', onBeforeUnload))

  return { confirmDiscard }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/composables/__tests__/useUnsavedChangesGuard.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: typecheck + commit**

Run: `npm run typecheck`
Expected: 0 error

```bash
git add src/composables/useUnsavedChangesGuard.ts src/composables/__tests__/useUnsavedChangesGuard.test.ts
git commit -m "feat(composables): useUnsavedChangesGuard dirty 時攔離開（route + beforeunload）"
```

---

### Task 3: 考核 composable 加 `getOriginal` + `inheritFromPreviousCycle`

讓 `useManualEventEntry` 多匯出「原值 getter」與「沿用上一週期」。沿用以 **employee_id 對映**跨週期 participant（手填值以 participant_id 為 key，但 participant 每週期一份）。

**Files:**
- Modify: `src/views/appraisal/composables/useManualEventEntry.ts`
- Test: `src/views/appraisal/composables/__tests__/useManualEventEntry.test.ts`（新建）

**Interfaces:**
- Consumes: 既有 `getManualEventCounts(cycleId)` → `{ data: { entries: {participant_id, item_code, count}[] } }`；新用 `listAppraisalCycles()` → `{ data: {id, start_date}[] }`；`getAppraisalAllEmployeesStatus(cycleId)` → `{ data: { participants: {participant_id?, employee_id?}[] } }`。
- Produces:
  - `getOriginal(pid: string | number, code: string): number`
  - `inheritFromPreviousCycle(currentParticipants: { participant_id?: number | null; employee_id?: number }[]): Promise<{ applied: number; skipped: number } | null>`（無上一週期回 `null`）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/views/appraisal/composables/__tests__/useManualEventEntry.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'

vi.mock('@/api/appraisal', () => ({
  getManualEventCounts: vi.fn(),
  batchUpsertManualEventCounts: vi.fn(),
  listAppraisalCycles: vi.fn(),
  getAppraisalAllEmployeesStatus: vi.fn(),
}))
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))

import {
  getManualEventCounts,
  listAppraisalCycles,
  getAppraisalAllEmployeesStatus,
} from '@/api/appraisal'
import { useManualEventEntry } from '@/views/appraisal/composables/useManualEventEntry'

const mockGetCounts = vi.mocked(getManualEventCounts)
const mockListCycles = vi.mocked(listAppraisalCycles)
const mockAllStatus = vi.mocked(getAppraisalAllEmployeesStatus)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useManualEventEntry getOriginal', () => {
  it('載入後 getOriginal 回原值，setCount 不改 original', async () => {
    mockGetCounts.mockResolvedValue({
      data: { entries: [{ participant_id: 10, item_code: 'OTHER', count: 3 }] },
    } as never)
    const { getOriginal, getCount, setCount } = useManualEventEntry(ref(1))
    await nextTick(); await Promise.resolve(); await nextTick()
    expect(getOriginal(10, 'OTHER')).toBe(3)
    setCount(10, 'OTHER', 9)
    expect(getCount(10, 'OTHER')).toBe(9)
    expect(getOriginal(10, 'OTHER')).toBe(3)
  })
})

describe('useManualEventEntry inheritFromPreviousCycle', () => {
  it('以 employee_id 對映上一週期數值帶入當期（標 dirty）', async () => {
    // 當期 cycle=2，空白
    mockGetCounts.mockResolvedValueOnce({ data: { entries: [] } } as never)
    const { inheritFromPreviousCycle, getCount, dirtyEntries } = useManualEventEntry(ref(2))
    await nextTick(); await Promise.resolve(); await nextTick()

    // 週期列表：1 早於 2
    mockListCycles.mockResolvedValue({
      data: [
        { id: 1, start_date: '2025-02-01' },
        { id: 2, start_date: '2025-08-01' },
      ],
    } as never)
    // 上一週期(1) participants：prevPid 101 → employee 555
    mockAllStatus.mockResolvedValue({
      data: { participants: [{ participant_id: 101, employee_id: 555 }] },
    } as never)
    // 上一週期手填：prevPid 101 OTHER=7
    mockGetCounts.mockResolvedValueOnce({
      data: { entries: [{ participant_id: 101, item_code: 'OTHER', count: 7 }] },
    } as never)

    // 當期 participants：employee 555 → 當期 participant 202
    const res = await inheritFromPreviousCycle([{ participant_id: 202, employee_id: 555 }])

    expect(res).toEqual({ applied: 1, skipped: 0 })
    expect(getCount(202, 'OTHER')).toBe(7)
    expect(dirtyEntries.value).toContainEqual({ participant_id: 202, item_code: 'OTHER', count: 7 })
  })

  it('無上一週期回 null', async () => {
    mockGetCounts.mockResolvedValueOnce({ data: { entries: [] } } as never)
    const { inheritFromPreviousCycle } = useManualEventEntry(ref(1))
    await nextTick(); await Promise.resolve(); await nextTick()
    mockListCycles.mockResolvedValue({ data: [{ id: 1, start_date: '2025-02-01' }] } as never)
    const res = await inheritFromPreviousCycle([{ participant_id: 1, employee_id: 1 }])
    expect(res).toBeNull()
  })

  it('上一週期 employee 在當期不存在 → 略過計入 skipped', async () => {
    mockGetCounts.mockResolvedValueOnce({ data: { entries: [] } } as never)
    const { inheritFromPreviousCycle, dirtyEntries } = useManualEventEntry(ref(2))
    await nextTick(); await Promise.resolve(); await nextTick()
    mockListCycles.mockResolvedValue({
      data: [{ id: 1, start_date: '2025-02-01' }, { id: 2, start_date: '2025-08-01' }],
    } as never)
    mockAllStatus.mockResolvedValue({
      data: { participants: [{ participant_id: 101, employee_id: 999 }] },
    } as never)
    mockGetCounts.mockResolvedValueOnce({
      data: { entries: [{ participant_id: 101, item_code: 'OTHER', count: 7 }] },
    } as never)
    const res = await inheritFromPreviousCycle([{ participant_id: 202, employee_id: 555 }])
    expect(res).toEqual({ applied: 0, skipped: 1 })
    expect(dirtyEntries.value).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/composables/__tests__/useManualEventEntry.test.ts`
Expected: FAIL（`getOriginal` / `inheritFromPreviousCycle` 不存在）

- [ ] **Step 3: 修改 composable**

在 `src/views/appraisal/composables/useManualEventEntry.ts`：

3a. 補 import（第 4 行 import 區塊改為）：
```ts
import {
  getManualEventCounts,
  batchUpsertManualEventCounts,
  listAppraisalCycles,
  getAppraisalAllEmployeesStatus,
} from '@/api/appraisal'
```

3b. 在 `setCount`（約 109 行）之後、`watch` 之前，新增兩個函式：
```ts
  function getOriginal(pid: string | number, code: string) {
    return original.value[String(pid)]?.[code] ?? 0
  }

  async function inheritFromPreviousCycle(
    currentParticipants: { participant_id?: number | null; employee_id?: number }[],
  ): Promise<{ applied: number; skipped: number } | null> {
    const curId = cycleIdRef.value
    if (!curId) return null
    // 1. 取全部週期，依 start_date 升冪找出當前的前一個
    const { data: cyclesRaw } = await listAppraisalCycles()
    const cycles = (cyclesRaw as { id: number; start_date: string }[]) ?? []
    const sorted = [...cycles].sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    const idx = sorted.findIndex((c) => Number(c.id) === Number(curId))
    if (idx <= 0) return null
    const prevId = sorted[idx - 1].id

    // 2. 上一週期 participant_id → employee_id
    const { data: prevStatus } = await getAppraisalAllEmployeesStatus(prevId)
    const prevParts = (prevStatus as { participants?: { participant_id?: number | null; employee_id?: number }[] }).participants ?? []
    const prevPidToEmp = new Map<number, number>()
    for (const p of prevParts) {
      if (p.participant_id != null && p.employee_id != null) prevPidToEmp.set(Number(p.participant_id), Number(p.employee_id))
    }

    // 3. 當期 employee_id → 當期 participant_id
    const empToCurPid = new Map<number, number>()
    for (const p of currentParticipants) {
      if (p.participant_id != null && p.employee_id != null) empToCurPid.set(Number(p.employee_id), Number(p.participant_id))
    }

    // 4. 上一週期手填值，逐筆對映帶入
    const { data: prevCounts } = await getManualEventCounts(prevId)
    const entries = (prevCounts as { entries?: { participant_id: number | string; item_code: string; count: number | string }[] }).entries ?? []
    let applied = 0
    let skipped = 0
    for (const e of entries) {
      const emp = prevPidToEmp.get(Number(e.participant_id))
      const curPid = emp != null ? empToCurPid.get(emp) : undefined
      if (curPid == null) { skipped++; continue }
      setCount(curPid, e.item_code, Number(e.count))
      applied++
    }
    return { applied, skipped }
  }
```

3c. `return` 加上新匯出（約 113 行）：
```ts
  return { counts, dirtyEntries, loading, saving, load, saveAll, getCount, setCount, getOriginal, inheritFromPreviousCycle }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/composables/__tests__/useManualEventEntry.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: typecheck + commit**

Run: `npm run typecheck`
Expected: 0 error

```bash
git add src/views/appraisal/composables/useManualEventEntry.ts src/views/appraisal/composables/__tests__/useManualEventEntry.test.ts
git commit -m "feat(appraisal): useManualEventEntry 加 getOriginal 與 inheritFromPreviousCycle（employee_id 對映）"
```

---

### Task 4: 考核 ManualEventEntrySection 接線（鍵盤導航 + 原值 + 未存攔截 + 沿用上一週期）

**Files:**
- Modify: `src/views/appraisal/components/ManualEventEntrySection.vue`
- Test: `src/views/appraisal/__tests__/ManualEventEntrySection.spec.js`（擴充）

**Interfaces:**
- Consumes: Task 1 `useGridKeyboardNav`、Task 2 `useUnsavedChangesGuard`、Task 3 `getOriginal` / `inheritFromPreviousCycle`。

- [ ] **Step 1: 寫失敗測試（擴充既有 spec）**

先看既有 `ManualEventEntrySection.spec.js` 的 mock 與 mount 樣板，沿用同一份 API mock，新增以下 case（API mock 需含 `listAppraisalCycles` / `getAppraisalAllEmployeesStatus`，並 mock `@/composables/useUnsavedChangesGuard` 避免 router context）：

```js
// 在檔案頂部 mock 區補：
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscard: vi.fn().mockResolvedValue(true) }),
}))

// 新增測試（沿用既有 mountComponent / participants 樣板；participants 至少一筆含 participant_id+employee_id）：
it('改一格後顯示原值「原 N」', async () => {
  // getManualEventCounts 回 participant_id=1 OTHER=2
  // mount 後改該格為 5，斷言出現含「原 2」的節點
  // ...（沿用既有 mount；用 wrapper.find('[data-test="orig-1-OTHER"]') 斷言文字含 '原 2'）
})

it('點「沿用上一週期」呼叫 inheritFromPreviousCycle 並帶入當期 participants', async () => {
  // listAppraisalCycles → [{id:1,start_date:'2025-02-01'},{id:2,start_date:'2025-08-01'}]
  // getAppraisalAllEmployeesStatus(1) → participants prevPid→emp
  // getManualEventCounts 第二次（prev）→ 一筆
  // 點 [data-test="inherit-prev-btn"]，flushPromises，斷言對映後格值更新且 save 按鈕 dirty 數 > 0
})

it('readonly 時沿用按鈕不顯示', async () => {
  // readonly=true mount，斷言 [data-test="inherit-prev-btn"] 不存在
})
```

> 實作測試時，`getManualEventCounts` 用 `mockResolvedValueOnce` 串接「當期 → 上一週期」兩次回傳；確切斷言文字用既有 spec 的 `flushPromises` 模式。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/ManualEventEntrySection.spec.js`
Expected: FAIL（無 `inherit-prev-btn` / 無 `orig-*` 節點）

- [ ] **Step 3: 修改元件**

`<script setup>` 區：
```ts
import { computed, ref } from 'vue'
import {
  useManualEventEntry,
  MANUAL_ITEM_CODES,
  MANUAL_LABEL,
} from '../composables/useManualEventEntry'
import { MANUAL_DELTA_RANGES } from '../scoreItemLabels'
import { useGridKeyboardNav } from '@/composables/useGridKeyboardNav'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  cycleId?: number | null
  participants?: Record<string, unknown>[]
  readonly?: boolean
}>()

const cycleIdRef = computed(() => props.cycleId ?? null)
const { dirtyEntries, loading, saving, getCount, setCount, saveAll, getOriginal, inheritFromPreviousCycle } =
  useManualEventEntry(cycleIdRef)

const ITEM_CODES = MANUAL_ITEM_CODES
const LABEL = MANUAL_LABEL
const minFor = (code: string) => MANUAL_DELTA_RANGES[code]?.min ?? 0
const maxFor = (code: string) => MANUAL_DELTA_RANGES[code]?.max ?? Infinity

// 鍵盤導航容器
const gridRef = ref<HTMLElement | null>(null)
useGridKeyboardNav(gridRef)

// 未存攔截
useUnsavedChangesGuard(() => dirtyEntries.value.length > 0)

// 沿用上一週期
const inheriting = ref(false)
async function onInheritPrevious() {
  inheriting.value = true
  try {
    const res = await inheritFromPreviousCycle(
      (props.participants ?? []) as { participant_id?: number | null; employee_id?: number }[],
    )
    if (res == null) { ElMessage.info('找不到上一週期'); return }
    ElMessage.success(`已帶入 ${res.applied} 筆；略過 ${res.skipped} 筆（對映不到員工）`)
  } catch {
    ElMessage.error('沿用上一週期失敗')
  } finally {
    inheriting.value = false
  }
}
</script>
```

template 區：
- toolbar 內 save 按鈕前加沿用按鈕：
```vue
      <el-button
        v-if="!readonly"
        :loading="inheriting"
        data-test="inherit-prev-btn"
        @click="onInheritPrevious"
      >
        沿用上一週期
      </el-button>
```
- 外層容器（`<div class="manual-event-section">`）加 `ref="gridRef"`。
- 每格 `el-input-number` 加 grid 座標 + 原值對照（`v-for="(code, colIdx) in ITEM_CODES"` 提供 colIdx；row 用 el-table 的 `$index`）：
```vue
      <el-table-column
        v-for="(code, colIdx) in ITEM_CODES"
        :key="code"
        :label="LABEL[code]"
        width="110"
      >
        <template #default="{ row, $index }">
          <div v-if="row.participant_id" class="cell-with-orig">
            <el-input-number
              :model-value="getCount(row.participant_id, code)"
              :step="1"
              :min="minFor(code)"
              :max="maxFor(code)"
              :precision="0"
              :disabled="readonly"
              :data-grid-row="$index"
              :data-grid-col="colIdx"
              :data-test="`count-${row.participant_id}-${code}`"
              @update:model-value="(v) => setCount(row.participant_id!, code, v as number)"
            />
            <span
              v-if="getCount(row.participant_id, code) !== getOriginal(row.participant_id, code)"
              class="cell-orig"
              :data-test="`orig-${row.participant_id}-${code}`"
            >
              原 {{ getOriginal(row.participant_id, code) }}
            </span>
          </div>
          <span v-else>—</span>
        </template>
      </el-table-column>
```
- style 補：
```css
.cell-with-orig { display: flex; flex-direction: column; gap: 2px; }
.cell-orig { font-size: 11px; color: var(--el-text-color-secondary); line-height: 1; }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/ManualEventEntrySection.spec.js`
Expected: PASS（既有 + 新增全綠）

- [ ] **Step 5: typecheck + commit**

Run: `npm run typecheck`
Expected: 0 error

```bash
git add src/views/appraisal/components/ManualEventEntrySection.vue src/views/appraisal/__tests__/ManualEventEntrySection.spec.js
git commit -m "feat(appraisal): 手填事件網格接鍵盤導航/原值對照/未存攔截/沿用上一週期"
```

---

### Task 5: 固定費用 MonthlyFixedCostPanel 接線（鍵盤導航 + 原值 + 套用全年 + 未存攔截 + emit dirty）

**Files:**
- Modify: `src/views/reports/MonthlyFixedCostPanel.vue`
- Test: `src/views/reports/__tests__/MonthlyFixedCostPanel.test.ts`（新建）

**Interfaces:**
- Consumes: Task 1 `useGridKeyboardNav`、Task 2 `useUnsavedChangesGuard`。
- Produces: `emit('update:dirty', boolean)`（給 Task 6 ReportsView 用）。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/views/reports/__tests__/MonthlyFixedCostPanel.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/monthlyFixedCost', () => ({
  getMonthlyFixedCosts: vi.fn().mockResolvedValue([
    { month: 1, category: 'rent', amount: 500000 },
  ]),
  batchUpsertMonthlyFixedCosts: vi.fn().mockResolvedValue({ ok: true }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
const promptMock = vi.fn()
vi.mock('element-plus', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
    ElMessageBox: { prompt: (...a: unknown[]) => promptMock(...a) },
  }
})
vi.mock('@/composables/useUnsavedChangesGuard', () => ({
  useUnsavedChangesGuard: () => ({ confirmDiscard: vi.fn().mockResolvedValue(true) }),
}))

import MonthlyFixedCostPanel from '@/views/reports/MonthlyFixedCostPanel.vue'

beforeEach(() => { promptMock.mockReset() })

function mountPanel() {
  return mount(MonthlyFixedCostPanel, { props: { year: 2025 }, attachTo: document.body })
}

describe('MonthlyFixedCostPanel 套用到全年', () => {
  it('套用後該類 12 月 current 一致且全 dirty，emit update:dirty', async () => {
    promptMock.mockResolvedValue({ value: '12345' })
    const w = mountPanel()
    await flushPromises()
    await w.find('[data-test="apply-year-rent"]').trigger('click')
    await flushPromises()
    // 12 個 rent cell 都應為 12345
    const inputs = w.findAll('input[data-grid-row="0"]')
    expect(inputs).toHaveLength(12)
    inputs.forEach((i) => expect((i.element as HTMLInputElement).value).toBe('12345'))
    // dirty emit 為 true
    const dirtyEvents = w.emitted('update:dirty') as boolean[][]
    expect(dirtyEvents.at(-1)?.[0]).toBe(true)
  })
})

describe('MonthlyFixedCostPanel 原值對照', () => {
  it('改 dirty 格後顯示原值', async () => {
    const w = mountPanel()
    await flushPromises()
    const rentJan = w.find('input[data-grid-row="0"][data-grid-col="0"]')
    await rentJan.setValue('600000')
    expect(w.find('[data-test="orig-1-rent"]').text()).toContain('500,000')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/reports/__tests__/MonthlyFixedCostPanel.test.ts`
Expected: FAIL（無 `apply-year-rent` / 無 `orig-*` / 未 emit dirty）

- [ ] **Step 3: 修改元件**

3a. `<script setup>` import 補：
```ts
import { ref, computed, watch, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getMonthlyFixedCosts, batchUpsertMonthlyFixedCosts } from '@/api/monthlyFixedCost'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { useGridKeyboardNav } from '@/composables/useGridKeyboardNav'
import { useUnsavedChangesGuard } from '@/composables/useUnsavedChangesGuard'

const props = defineProps<{ year: number }>()
const emit = defineEmits<{ 'update:dirty': [boolean] }>()
```

3b. 在 `dirtyCount` 定義後加：emit 同步、原值 getter、套用全年、容器 ref、未存攔截：
```ts
watch(dirtyCount, (n) => emit('update:dirty', n > 0), { immediate: true })

function getOriginal(month: number, category: string): number | null {
  return cellState.get(cellKey(month, category))?.original ?? null
}

const gridRef = ref<HTMLElement | null>(null)
useGridKeyboardNav(gridRef)
useUnsavedChangesGuard(() => dirtyCount.value > 0)

const amountFmt = new Intl.NumberFormat('zh-TW')
function originalText(month: number, category: string): string {
  const v = getOriginal(month, category)
  return v == null ? '—' : amountFmt.format(v)
}

async function applyToYear(category: string, label: string) {
  if (!canWrite.value) return
  try {
    const { value } = await ElMessageBox.prompt(
      `輸入要套用到「${label}」全年 12 個月的金額`,
      '套用到全年',
      { inputPattern: /^\d+$/, inputErrorMessage: '請輸入非負整數', confirmButtonText: '套用', cancelButtonText: '取消' },
    )
    const amount = Math.trunc(Number(value))
    for (const m of MONTHS) setCurrent(m, category, amount)
  } catch { /* 使用者取消 */ }
}
```

3c. template — 容器加 ref、cell 加 grid 座標 + 原值、row label 加套用全年鈕：
- 把 `<table class="fc-table">` 外的 `<div class="fc-scroll">` 加 `ref="gridRef"`。
- row label th 內加按鈕：
```vue
            <th class="sticky-col row-label">
              {{ c.label }}
              <el-button
                v-if="canWrite"
                link
                size="small"
                :data-test="`apply-year-${c.key}`"
                @click="applyToYear(c.key, c.label)"
              >套用全年</el-button>
            </th>
```
- cell `<td>` 內 input 加座標、下方加原值（`v-for="(c, ci) in CATEGORIES"` 與 `v-for="(m, mi) in MONTHS"` 提供 index）：
```vue
          <tr v-for="(c, ci) in CATEGORIES" :key="c.key" :data-category="c.key">
            ...
            <td
              v-for="(m, mi) in MONTHS"
              :key="m"
              class="cell-edit"
              :class="{ 'cell-dirty': isDirty(m, c.key) }"
              :data-cell-key="`${m}-${c.key}`"
            >
              <input
                type="number"
                inputmode="numeric"
                min="0"
                step="1"
                class="cell-input"
                :data-grid-row="ci"
                :data-grid-col="mi"
                :value="getCurrent(m, c.key) ?? ''"
                :disabled="!canWrite || saving"
                :placeholder="c.defaultAmount != null ? amountFormatter.format(c.defaultAmount) : ''"
                @input="setCurrent(m, c.key, ($event.target as HTMLInputElement).value)"
              />
              <span
                v-if="isDirty(m, c.key)"
                class="cell-orig"
                :data-test="`orig-${m}-${c.key}`"
              >原 {{ originalText(m, c.key) }}</span>
            </td>
```
- style 補：
```css
.cell-orig { display: block; font-size: 10px; color: var(--el-text-color-secondary); text-align: right; line-height: 1.2; }
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/reports/__tests__/MonthlyFixedCostPanel.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck + commit**

Run: `npm run typecheck`
Expected: 0 error

```bash
git add src/views/reports/MonthlyFixedCostPanel.vue src/views/reports/__tests__/MonthlyFixedCostPanel.test.ts
git commit -m "feat(reports): 固定費用網格接鍵盤導航/原值對照/套用全年/未存攔截/emit dirty"
```

---

### Task 6: ReportsView 換年度 / 切 tab 攔截（接 panel dirty）

固定費用 panel 因 `:key="selectedYear"` + `v-if` remount，換年度/切 tab 由父層攔。年度選擇改受控（`:model-value` + 確認後才 commit），tab 用 `el-tabs :before-leave`。

**Files:**
- Modify: `src/views/ReportsView.vue`
- Test: `src/views/__tests__/ReportsView.test.ts`（新建）

**Interfaces:**
- Consumes: Task 5 `MonthlyFixedCostPanel` 的 `@update:dirty`。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/views/__tests__/ReportsView.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const confirmMock = vi.fn()
vi.mock('element-plus', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return { ...actual, ElMessageBox: { ...((actual.ElMessageBox as object) ?? {}), confirm: (...a: unknown[]) => confirmMock(...a) } }
})

// 把各 panel 換成輕量 stub，只讓 fixed-cost stub 能 emit update:dirty
import ReportsView from '@/views/ReportsView.vue'

beforeEach(() => confirmMock.mockReset())

function mountView() {
  return mount(ReportsView, {
    global: {
      stubs: {
        MonthlyFixedCostPanel: {
          template: '<div data-test="fc-stub"><button data-test="make-dirty" @click="$emit(\'update:dirty\', true)">d</button></div>',
        },
        OverviewPanel: true, FinanceSummaryPanel: true, MonthlyPnLPanel: true,
        AttendancePanel: true, SalaryPanel: true,
      },
    },
  })
}

describe('ReportsView 固定費用未存攔截', () => {
  it('fixed-cost dirty 時換年度跳 confirm；取消則年度不變', async () => {
    const w = mountView()
    // 切到 fixed-cost tab
    // ...（用 setData / 點 tab；切到 fixed-cost，點 make-dirty 觸發 dirty）
    // 改年度 → confirmMock 被呼叫；mock reject（取消）→ selectedYear 不變
    confirmMock.mockRejectedValue('cancel')
    // 觸發 onYearChange(下一年)
    // 斷言 selectedYear 維持原值
    expect(true).toBe(true) // 佔位：實作時換成對 selectedYear 的真斷言
  })
})
```

> 實作時把佔位斷言換成：透過 `w.vm` 或暴露的 ref 驗證 `selectedYear` 未變、`confirmMock` 被呼叫一次。tab 切換測 `el-tabs` `before-leave`：dirty 時 reject → activeTab 不變。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/__tests__/ReportsView.test.ts`
Expected: FAIL（無攔截邏輯）

- [ ] **Step 3: 修改 ReportsView**

`<script setup>` 補：
```ts
import { ElMessageBox } from 'element-plus'
const fixedCostDirty = ref(false)

async function confirmLoseFixedCost(): Promise<boolean> {
  if (!(activeTab.value === 'fixed-cost' && fixedCostDirty.value)) return true
  try {
    await ElMessageBox.confirm('固定費用尚有未儲存變更，確定離開並捨棄？', '未儲存變更', {
      type: 'warning', confirmButtonText: '捨棄變更', cancelButtonText: '留在此頁',
    })
    return true
  } catch { return false }
}

async function onYearChange(y: number) {
  if (await confirmLoseFixedCost()) selectedYear.value = y
  // 取消則不 commit；el-select 受控於 :model-value 會自動還原顯示
}

async function onTabBeforeLeave(activeName: string, oldName: string): Promise<boolean> {
  if (oldName === 'fixed-cost' && fixedCostDirty.value) return confirmLoseFixedCost()
  return true
}
```

template：
- 年度選擇器改受控：
```vue
      <el-select :model-value="selectedYear" style="width: 120px;" @change="onYearChange">
```
- `<el-tabs>` 加 `:before-leave`：
```vue
    <el-tabs v-model="activeTab" type="card" class="reports-tabs" :before-leave="onTabBeforeLeave">
```
- fixed-cost panel 接 dirty：
```vue
        <MonthlyFixedCostPanel v-if="activeTab === 'fixed-cost'" :key="selectedYear" :year="selectedYear" @update:dirty="fixedCostDirty = $event" />
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/__tests__/ReportsView.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck + 全套件 + commit**

Run: `npm run typecheck && npx vitest run src/views/reports/ src/views/appraisal/ src/composables/ src/views/__tests__/ReportsView.test.ts`
Expected: 0 error、全綠

```bash
git add src/views/ReportsView.vue src/views/__tests__/ReportsView.test.ts
git commit -m "feat(reports): 固定費用 dirty 時換年度/切 tab 攔截"
```

---

## 收尾（merge 前）

- [ ] `npm run typecheck`（0）、`npm run test`（全綠）、`npm run lint`（no-explicit-any 過）。
- [ ] **無** `gen:api` / `gen:api:check`（本批未動契約）。
- [ ] worktree `--no-ff` 併入 `local main`（不動其他 WIP 改動），當天 `git worktree remove`，分支 `--is-ancestor … main` 守衛後刪。
- [ ] DoD：merge local main 後本批仍未 push（與既有 40 commit 一致，push 屬另一收尾決策）。

## Self-Review（plan vs spec）

- **Spec §3.1 鍵盤導航** → Task 1 ✓；§3.2 未存攔截（含 confirmDiscard） → Task 2 ✓；§3.3 原值對照 → 考核 Task 4 / 固定費用 Task 5 ✓；§3.4 套用全年 → Task 5 ✓、沿用上一週期 → Task 3+4 ✓；§「換年度攔截」→ Task 6 ✓（因 `:key` remount 上提父層，較 spec 的 `confirmDiscard()` 描述更精準）。
- **型別一致**：`inheritFromPreviousCycle(currentParticipants)` 簽章 Task 3 定義、Task 4 呼叫一致；`getOriginal(pid, code)` 兩處一致；`emit('update:dirty', boolean)` Task 5 產出、Task 6 消費一致；`data-grid-row/col` 命名跨 Task 1/4/5 一致。
- **無 placeholder**：Task 4 測試以文字描述 case（沿用既有 spec 樣板），Task 6 測試含一個佔位斷言——實作時需替換為對 `selectedYear` 的真斷言（已於步驟註明）。其餘步驟均含完整程式碼。
- **複製上月**：spec §3.4 提及但本 plan 僅做「套用到全年」（對齊使用者選定的加值項），複製上月列為後續，不納本批。
