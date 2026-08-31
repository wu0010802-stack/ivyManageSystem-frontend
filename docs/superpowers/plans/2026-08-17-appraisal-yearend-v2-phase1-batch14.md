# 考核與年終 V2 Phase 1 — Batch 14：待辦頁重塑第一階段（統一清單資料層＋抓取邏輯抽取） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 1 原始子項 ③「待辦頁視覺重塑」——原型（`.scratch/appraisal-yearend-v2/prototype.html` 第 267-317 行）與 UX 規格 §3.1 設想的待辦頁是「hero 卡＋統一待辦清單」（左欄）＋「進行中的週期／資料新鮮度」兩個側欄卡（右欄）的兩欄版面，現況 `OverviewWorkbenchView.vue` 只有 hero 卡（`WorkbenchNextStepCard.vue`，已存在），下方是 4 張各自獨立的主題卡片（2x2 grid），不是統一清單，也沒有側欄。**本批次是視覺重塑的第一階段，只做資料層**：① `nextStep.ts` 新增 `deriveTodoList()`（從「只回傳最優先一項」擴充成「回傳全部待處理項目」的清單，供統一清單渲染）② 把 4 張卡片內建的抓取邏輯抽成可獨立測試的 composable（不改動任何實際 UI，４張卡片本身在本批次維持原樣、正常運作）。**視覺重排（把 4 卡片換成清單＋兩個側欄卡、退場舊卡片元件）留給下一批次**，比照本 session 已多次驗證有效的「先建能力、再接線」兩批次節奏。

**Architecture:** Task 1 的 `deriveTodoList()` 與既有 `deriveNextStep()` 共用同一份優先序邏輯與文案（`deriveNextStep` 改為呼叫 `deriveTodoList()[0] ?? DONE_STEP`，不重複維護兩份文案），**現有 10 個 `deriveNextStep` 測試案例必須逐字不變仍全綠**，這是驗證重構「零行為改變」的關鍵指標。Task 2 把 4 張卡片（`WorkbenchAppraisalCard.vue`／`WorkbenchYearEndCard.vue`／`WorkbenchExceptionsCard.vue`／`WorkbenchPayoutCard.vue`）內建的 `load()`／`loading`／`error`／`counts` 狀態機**逐一原樣搬進 4 個 composable 函式**（`useWorkbenchStats.ts` 單一檔案內 4 個 export），**卡片元件本身這批次不動**——只新增 composable 層，供下一批次的視圖重寫消費，本批次卡片與 composable 是平行存在的兩套實作，尚未互相取代。

**Tech Stack:** Vue 3、Vitest + `@vue/test-utils`。

**Spec:** `.scratch/appraisal-yearend-v2/ux-spec.md` §3.1；`.scratch/appraisal-yearend-v2/prototype.html` 第 267-317 行；規模與可行性查證見本 session scout 報告（已存 memory）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫語意、既有權限判斷語意。**composable 抽取必須逐一比對原卡片的 fetch 呼叫、聚合邏輯、錯誤處理，數字/行為需與原卡片完全一致。**
- **本批次刻意不做**：`OverviewWorkbenchView.vue` 的視覺重排（統一清單＋兩個側欄卡＋退場舊卡片元件）、KPI 可點擊帶 filter query、`ExceptionCenterView.vue` 的 `atype`/`ytype` 多值篩選支援——這些留給下一批次（視覺重排批次），本批次只交付「資料層」。
- **「資料新鮮度」側欄已與使用者確認降規格為極簡版**（考核彙整資料最後重算時間一行，不做原型設想的 4 個獨立資料源同步時間——查證後那個概念在系統裡不成立，出勤/請假/招生在籍是即時資料非批次同步、機構活動出席無外部同步管線）；本批次不涉及這塊，留給下一批次視覺重排時一併處理。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: `nextStep.ts` 新增 `deriveTodoList()`

**Files:**
- Modify: `src/views/appraisalYearEnd/nextStep.ts`
- Modify test: `src/views/appraisalYearEnd/__tests__/nextStep.spec.ts`

**Interfaces:**
- 新增 `deriveTodoList(stats: WorkbenchStats): NextStep[]`（沿用既有 `NextStep`/`WorkbenchStats` 型別，不新增型別）。
- `deriveNextStep(stats: WorkbenchStats): NextStep | null` 既有簽名/回傳型別不變，內部改為呼叫 `deriveTodoList`。

**現況**（`nextStep.ts` 全檔已讀取，見上方 Architecture 段落描述）：`deriveNextStep` 依優先序（阻斷例外 > 年終待簽 > 考核待簽 > 可發放 > 建立缺失週期 > 全部完成）**找到第一個符合條件的就回傳**，其餘分支即使也符合條件也不會被看到。

**1. 改為（取代整個檔案第 44-125 行 `deriveNextStep` 函式）**：

```ts
const DONE_STEP: NextStep = {
  key: 'done',
  title: '目前沒有待辦',
  reason: '簽核、例外與發放皆已處理完畢。',
  ctaLabel: '',
  to: '',
}

function isLoading(stats: WorkbenchStats): boolean {
  return (
    stats.blockingExceptions === undefined ||
    stats.yearEndPendingSign === undefined ||
    stats.appraisalPendingSign === undefined ||
    stats.payoutReadyCount === undefined
  )
}

/** 回傳全部待處理項目（依既有優先序排列），供待辦頁統一清單渲染。
 *  isLoading 時回空陣列——呼叫端（統一清單）應另外依 isLoading 決定是否顯示
 *  skeleton，不要把空陣列誤讀成「全部完成」。 */
export function deriveTodoList(stats: WorkbenchStats): NextStep[] {
  if (isLoading(stats)) return []
  const {
    appraisalCycle,
    yearEndCycle,
    blockingExceptions,
    yearEndPendingSign,
    appraisalPendingSign,
    payoutReadyCount,
    canAppraisal,
    canYearEnd,
    payoutYear,
  } = stats
  const items: NextStep[] = []

  if (blockingExceptions !== undefined && blockingExceptions > 0) {
    items.push({
      key: 'exceptions',
      title: `處理 ${blockingExceptions} 筆阻斷級例外`,
      reason: '阻斷級例外會讓試算與簽核出錯，建議最先處理。',
      ctaLabel: `前往${PAGE_TERMS.yearEndExceptions}`,
      to: '/appraisal-year-end/exceptions',
    })
  }
  if (yearEndCycle?.status === 'OPEN' && yearEndPendingSign !== undefined && yearEndPendingSign > 0) {
    items.push({
      key: 'year-end-sign',
      title: `年終結算還有 ${yearEndPendingSign} 筆未核定`,
      reason: `${yearEndCycle.label}結算進行中，完成兩關簽核後才能鎖定發放。`,
      ctaLabel: '前往結算明細',
      to: `/appraisal-year-end/year-end/cycles/${yearEndCycle.id}`,
    })
  }
  if (appraisalCycle && appraisalPendingSign !== undefined && appraisalPendingSign > 0) {
    items.push({
      key: 'appraisal-sign',
      title: `考核還有 ${appraisalPendingSign} 筆未核定`,
      reason: `${appraisalCycle.label}簽核進行中。`,
      ctaLabel: '前往簽核',
      to: `/appraisal-year-end/appraisal?cycle=${appraisalCycle.id}&stage=sign&view=kanban`,
    })
  }
  if (payoutReadyCount !== undefined && payoutReadyCount > 0) {
    items.push({
      key: 'payout',
      title: `${payoutReadyCount} 筆考核年終可發放`,
      reason: '簽核已完成，可產生轉帳資料。',
      ctaLabel: '前往發放',
      to: `/appraisal-year-end/year-end/payout?year=${payoutYear}`,
    })
  }
  if (!appraisalCycle && canAppraisal) {
    items.push({
      key: 'create-appraisal',
      title: '建立本學期考核週期',
      reason: '本學期尚未建立考核週期，建立後才能開始評分與簽核。',
      ctaLabel: '前往建立',
      to: '/appraisal-year-end/appraisal',
    })
  }
  if (!yearEndCycle && canYearEnd) {
    items.push({
      key: 'create-year-end',
      title: '建立年終結算週期',
      reason: '尚未建立年終週期；年底結算前建立即可。',
      ctaLabel: '前往建立',
      to: '/appraisal-year-end/year-end',
    })
  }
  return items
}

export function deriveNextStep(stats: WorkbenchStats): NextStep | null {
  if (isLoading(stats)) return null
  return deriveTodoList(stats)[0] ?? DONE_STEP
}
```

（`isLoading`／`DONE_STEP` 為模組內部輔助，不 export；`deriveTodoList`／`deriveNextStep` 皆 export。）

**2. 測試檔改動**：既有 10 個測試案例（`describe('deriveNextStep 優先序', ...)`）**逐字不動**，只在檔案最後新增一個新的 `describe` 區塊：

```ts
describe('deriveTodoList', () => {
  it('isLoading 時回空陣列', () => {
    expect(deriveTodoList({ ...base, blockingExceptions: undefined })).toEqual([])
  })
  it('全部完成時回空陣列（非含 done 項目的陣列）', () => {
    expect(deriveTodoList(base)).toEqual([])
  })
  it('多項待處理時依優先序全部列出（阻斷例外/年終待簽/考核待簽/可發放同時存在）', () => {
    const items = deriveTodoList({
      ...base,
      blockingExceptions: 2,
      yearEndPendingSign: 5,
      appraisalPendingSign: 3,
      payoutReadyCount: 4,
    })
    expect(items.map((i) => i.key)).toEqual(['exceptions', 'year-end-sign', 'appraisal-sign', 'payout'])
  })
  it('年終週期非 OPEN 時年終待簽項目不出現，但考核待簽項目仍出現', () => {
    const items = deriveTodoList({
      ...base,
      yearEndCycle: { id: 9, label: '114 學年度', status: 'LOCKED' },
      yearEndPendingSign: 5,
      appraisalPendingSign: 3,
    })
    expect(items.map((i) => i.key)).toEqual(['appraisal-sign'])
  })
  it('deriveNextStep 回傳值等於 deriveTodoList 第一項（優先序一致性）', () => {
    const stats = { ...base, blockingExceptions: 2, yearEndPendingSign: 5 }
    expect(deriveNextStep(stats)).toEqual(deriveTodoList(stats)[0])
  })
  it('deriveNextStep 全部完成時回 done，deriveTodoList 回空陣列（兩者語意不同但一致）', () => {
    expect(deriveNextStep(base)?.key).toBe('done')
    expect(deriveTodoList(base)).toEqual([])
  })
})
```

（`base` 為既有檔案頂部已定義的 fixture 常數，直接沿用不需重新定義。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/appraisalYearEnd/__tests__/nextStep.spec.ts`
Expected: PASS（既有 10 個案例）

- [ ] **Step 2: 依上方 1-2 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisalYearEnd/__tests__/nextStep.spec.ts`
Expected: PASS（既有 10 個 **逐字不變** + 6 個新增 = 16 個）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisalYearEnd`
Expected: PASS，特別確認 `OverviewWorkbenchView.nextstep.spec.ts`（消費 `deriveNextStep` 的既有整合測試）未受影響。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/appraisalYearEnd/nextStep.ts src/views/appraisalYearEnd/__tests__/nextStep.spec.ts
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisalYearEnd/nextStep.ts src/views/appraisalYearEnd/__tests__/nextStep.spec.ts
git commit -m "feat(appraisal-year-end): nextStep.ts 新增 deriveTodoList，供待辦頁統一清單使用

deriveNextStep 原本只回傳優先序最高的一項；deriveTodoList 回傳全部待
處理項目（同一份優先序邏輯與文案，deriveNextStep 改為呼叫
deriveTodoList()[0] ?? DONE_STEP，不重複維護兩份文案）。既有 10 個
deriveNextStep 測試案例逐字不變仍全綠，證明重構零行為改變
（V2 IA 簡化 Phase 1 Batch 14 Task 1，卡片抓取邏輯抽取見 Task 2）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 抽取 4 張卡片的抓取邏輯為 composable

**Files:**
- Create: `src/views/appraisalYearEnd/useWorkbenchStats.ts`
- Create test: `src/views/appraisalYearEnd/__tests__/useWorkbenchStats.spec.ts`

**⚠ 前置條件：Task 1 必須先完成並 commit（兩者程式碼互不耦合，此依賴僅為本計畫文件的執行順序約定）。**

**Interfaces:**
- `useAppraisalWorkbenchStats(cycle: () => CycleHandle | null)` → `{ loading: Ref<boolean>; errorMsg: Ref<string>; stat: Ref<number | undefined>; counts: Ref<Record<string, number>>; load: () => Promise<void> }`
- `useYearEndWorkbenchStats(cycle: () => CycleHandle | null)` → `{ loading: Ref<boolean>; errorMsg: Ref<string>; stat: Ref<number | undefined>; counts: Ref<Record<string, number>>; load: () => Promise<void> }`
- `useExceptionsWorkbenchStats(appraisalCycle: () => CycleHandle | null, yearEndCycle: () => CycleHandle | null)` → `{ loading: Ref<boolean>; errorMsg: Ref<string>; stat: Ref<number | undefined>; appraisalCount: Ref<number>; yearEndCount: Ref<number>; severityCounts: Ref<Partial<Record<'blocking'|'warning'|'info', number>>>; load: () => Promise<void> }`
- `usePayoutWorkbenchStats(year: () => number)` → `{ loading: Ref<boolean>; errorMsg: Ref<string>; notReady: Ref<boolean>; stat: Ref<number | undefined>; totalAmount: Ref<number>; load: () => Promise<void> }`

**⚠ 本 task 只新增 composable，不修改／不刪除任何一個既有卡片元件，也不修改 `OverviewWorkbenchView.vue`——4 張卡片這批次仍正常獨立運作，composable 是平行新增的第二套實作，供下一批次的視圖重寫消費。**

**現況**：4 張卡片各自的 `load()`/`loading`/`error`/資料 ref 定義已在上方 Architecture 段落前完整讀取（`WorkbenchAppraisalCard.vue`／`WorkbenchYearEndCard.vue`／`WorkbenchExceptionsCard.vue`／`WorkbenchPayoutCard.vue` 全檔內容），以下逐一列出 composable 版本，**每個函式內的 API 呼叫、聚合公式、錯誤處理與原卡片逐字一致，只是把 `props`/`emit` 換成函式參數/回傳 ref**：

```ts
// useWorkbenchStats.ts
import { ref, watch } from 'vue'
import { getSignStatusSummary, getAppraisalCycleExceptions } from '@/api/appraisal'
import { getYearEndGrid, getYearEndCycleExceptions, previewAppraisalPayout } from '@/api/yearEnd'
import { apiError } from '@/utils/error'

export interface CycleHandle { id: number; label: string; status: string }

// ── 考核（比照 WorkbenchAppraisalCard.vue 既有 load() 邏輯）──────────────
export function useAppraisalWorkbenchStats(cycle: () => CycleHandle | null) {
  const loading = ref(false)
  const errorMsg = ref('')
  const stat = ref<number | undefined>(undefined)
  const counts = ref<Record<string, number>>({})

  async function load() {
    const c = cycle()
    if (!c) {
      stat.value = 0
      return
    }
    loading.value = true
    errorMsg.value = ''
    try {
      const acc = (await getSignStatusSummary(c.id)).data.counts ?? {}
      counts.value = acc
      const total = Object.values(acc).reduce((s, n) => s + n, 0)
      stat.value = total - (acc.FINALIZED ?? 0)
    } catch (e) {
      errorMsg.value = apiError(e, '載入失敗')
      stat.value = 0
    } finally {
      loading.value = false
    }
  }
  watch(cycle, load, { immediate: true })
  return { loading, errorMsg, stat, counts, load }
}

// ── 年終（比照 WorkbenchYearEndCard.vue 既有 load() 邏輯；getYearEndGrid
//    回傳裸陣列 GridRowOut[]，非 { rows: [...] }）──────────────────────
export function useYearEndWorkbenchStats(cycle: () => CycleHandle | null) {
  const loading = ref(false)
  const errorMsg = ref('')
  const stat = ref<number | undefined>(undefined)
  const counts = ref<Record<string, number>>({})

  async function load() {
    const c = cycle()
    if (!c) {
      stat.value = 0
      return
    }
    loading.value = true
    errorMsg.value = ''
    try {
      const rows = (await getYearEndGrid(c.id)).data
      const acc: Record<string, number> = {}
      for (const r of rows) acc[r.status] = (acc[r.status] ?? 0) + 1
      counts.value = acc
      stat.value = rows.filter((r) => r.status !== 'FINALIZED').length
    } catch (e) {
      errorMsg.value = apiError(e, '載入失敗')
      stat.value = 0
    } finally {
      loading.value = false
    }
  }
  watch(cycle, load, { immediate: true })
  return { loading, errorMsg, stat, counts, load }
}

// ── 例外（比照 WorkbenchExceptionsCard.vue 既有 load() 邏輯；severity 實際值
//    為 blocking/warning/info，見 schema.d.ts ExceptionItemOut.severity）──
type Severity = 'blocking' | 'warning' | 'info'

export function useExceptionsWorkbenchStats(
  appraisalCycle: () => CycleHandle | null,
  yearEndCycle: () => CycleHandle | null,
) {
  const loading = ref(false)
  const errorMsg = ref('')
  const stat = ref<number | undefined>(undefined)
  const appraisalCount = ref(0)
  const yearEndCount = ref(0)
  const severityCounts = ref<Partial<Record<Severity, number>>>({})

  async function load() {
    loading.value = true
    errorMsg.value = ''
    try {
      const aCycle = appraisalCycle()
      const yCycle = yearEndCycle()
      const [aRes, yRes] = await Promise.all([
        aCycle ? getAppraisalCycleExceptions(aCycle.id) : Promise.resolve(null),
        yCycle ? getYearEndCycleExceptions(yCycle.id) : Promise.resolve(null),
      ])
      const aItems = aRes?.data.items ?? []
      const yItems = yRes?.data.items ?? []
      appraisalCount.value = aItems.length
      yearEndCount.value = yItems.length
      const sev: Partial<Record<Severity, number>> = {}
      for (const it of [...aItems, ...yItems]) {
        const key = it.severity as Severity
        sev[key] = (sev[key] ?? 0) + 1
      }
      severityCounts.value = sev
      stat.value = sev.blocking ?? 0
    } catch (e) {
      errorMsg.value = apiError(e, '載入失敗')
      stat.value = 0
    } finally {
      loading.value = false
    }
  }
  watch(() => [appraisalCycle()?.id, yearEndCycle()?.id], load, { immediate: true })
  return { loading, errorMsg, stat, appraisalCount, yearEndCount, severityCounts, load }
}

// ── 發放（比照 WorkbenchPayoutCard.vue 既有 load() 邏輯；422 = 資料態尚未
//    就緒，非載入失敗，不視為 error）────────────────────────────────────
const NOT_READY_MESSAGE = '本年度尚無可發放的考核年終資料，可切換年份，或前往考核管理建立來源學年的考核週期'

export function usePayoutWorkbenchStats(year: () => number) {
  const loading = ref(false)
  const errorMsg = ref('')
  const notReady = ref(false)
  const stat = ref<number | undefined>(undefined)
  const totalAmount = ref(0)

  async function load() {
    loading.value = true
    errorMsg.value = ''
    notReady.value = false
    try {
      const rows = (await previewAppraisalPayout(year())).data
      stat.value = rows.length
      totalAmount.value = rows.reduce((sum, r) => sum + Number(r.total_amount), 0)
    } catch (e) {
      const status = (e as { response?: { status?: number } } | null)?.response?.status
      if (status === 422) {
        notReady.value = true
        errorMsg.value = NOT_READY_MESSAGE
        stat.value = 0
      } else {
        errorMsg.value = apiError(e, '載入失敗')
        stat.value = 0
      }
    } finally {
      loading.value = false
    }
  }
  watch(year, load, { immediate: true })
  return { loading, errorMsg, notReady, stat, totalAmount, load }
}
```

**測試檔**（先 `find` 該目錄既有測試檔慣例確認 API mock 寫法，比照 `WorkbenchPayoutCard.spec.ts` 已驗證可行的 mock 方式）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { effectScope } from 'vue'

vi.mock('@/api/appraisal', () => ({
  getSignStatusSummary: vi.fn(),
  getAppraisalCycleExceptions: vi.fn(),
}))
vi.mock('@/api/yearEnd', () => ({
  getYearEndGrid: vi.fn(),
  getYearEndCycleExceptions: vi.fn(),
  previewAppraisalPayout: vi.fn(),
}))

import { getSignStatusSummary, getAppraisalCycleExceptions } from '@/api/appraisal'
import { getYearEndGrid, getYearEndCycleExceptions, previewAppraisalPayout } from '@/api/yearEnd'
import {
  useAppraisalWorkbenchStats,
  useYearEndWorkbenchStats,
  useExceptionsWorkbenchStats,
  usePayoutWorkbenchStats,
} from '../useWorkbenchStats'

// composable 內用 watch(..., {immediate:true})，須在 effectScope 內執行才會啟動
// 響應式追蹤並觸發首次 load（比照 Vue 官方建議的 composable 單元測試作法，
// 避免脫離元件情境時 watch 不生效）。
function runInScope<T>(fn: () => T): T {
  const scope = effectScope()
  return scope.run(fn) as T
}

describe('useAppraisalWorkbenchStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('cycle 為 null 時 stat 設為 0，不呼叫 API', async () => {
    const { stat, load } = runInScope(() => useAppraisalWorkbenchStats(() => null))
    await load()
    expect(stat.value).toBe(0)
    expect(getSignStatusSummary).not.toHaveBeenCalled()
  })

  it('成功時 stat = total - FINALIZED', async () => {
    vi.mocked(getSignStatusSummary).mockResolvedValue({
      data: { counts: { DRAFT: 2, SUPERVISOR_SIGNED: 1, FINALIZED: 3 } },
    } as never)
    const { stat, load } = runInScope(() => useAppraisalWorkbenchStats(() => ({ id: 5, label: 'x', status: 'OPEN' })))
    await load()
    expect(stat.value).toBe(3)
  })

  it('失敗時 stat 設為 0 且 errorMsg 非空', async () => {
    vi.mocked(getSignStatusSummary).mockRejectedValue(new Error('network'))
    const { stat, errorMsg, load } = runInScope(() => useAppraisalWorkbenchStats(() => ({ id: 5, label: 'x', status: 'OPEN' })))
    await load()
    expect(stat.value).toBe(0)
    expect(errorMsg.value).not.toBe('')
  })
})

describe('useYearEndWorkbenchStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('成功時 stat = 非 FINALIZED 列數', async () => {
    vi.mocked(getYearEndGrid).mockResolvedValue({
      data: [{ status: 'DRAFT' }, { status: 'FINALIZED' }, { status: 'SUPERVISOR_SIGNED' }],
    } as never)
    const { stat, load } = runInScope(() => useYearEndWorkbenchStats(() => ({ id: 9, label: 'x', status: 'OPEN' })))
    await load()
    expect(stat.value).toBe(2)
  })
})

describe('useExceptionsWorkbenchStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stat = blocking 筆數，appraisalCount/yearEndCount 分開計數', async () => {
    vi.mocked(getAppraisalCycleExceptions).mockResolvedValue({
      data: { items: [{ severity: 'blocking' }, { severity: 'warning' }] },
    } as never)
    vi.mocked(getYearEndCycleExceptions).mockResolvedValue({
      data: { items: [{ severity: 'blocking' }] },
    } as never)
    const { stat, appraisalCount, yearEndCount, load } = runInScope(() =>
      useExceptionsWorkbenchStats(
        () => ({ id: 1, label: 'x', status: 'OPEN' }),
        () => ({ id: 2, label: 'y', status: 'OPEN' }),
      ),
    )
    await load()
    expect(stat.value).toBe(2)
    expect(appraisalCount.value).toBe(2)
    expect(yearEndCount.value).toBe(1)
  })
})

describe('usePayoutWorkbenchStats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('422 時 notReady=true，不視為 error', async () => {
    vi.mocked(previewAppraisalPayout).mockRejectedValue({ response: { status: 422 } })
    const { notReady, stat, load } = runInScope(() => usePayoutWorkbenchStats(() => 2026))
    await load()
    expect(notReady.value).toBe(true)
    expect(stat.value).toBe(0)
  })

  it('成功時 stat = 筆數，totalAmount 加總', async () => {
    vi.mocked(previewAppraisalPayout).mockResolvedValue({
      data: [{ total_amount: '1000' }, { total_amount: '2000' }],
    } as never)
    const { stat, totalAmount, load } = runInScope(() => usePayoutWorkbenchStats(() => 2026))
    await load()
    expect(stat.value).toBe(2)
    expect(totalAmount.value).toBe(3000)
  })
})
```

（若實測發現 `watch(..., { immediate: true })` 在 `effectScope().run()` 內的觸發時機跟預期有落差、或 mock 需要調整成該目錄既有 `WorkbenchPayoutCard.spec.ts` 的確切慣例，以實測結果為準調整，不要為了測通而更改 composable 本身邏輯。）

- [ ] **Step 1: 寫測試（TDD，先確認失敗）**

Run: `npm run test -- --run src/views/appraisalYearEnd/__tests__/useWorkbenchStats.spec.ts`
Expected: FAIL（檔案不存在）

- [ ] **Step 2: 依上方段落實作 `useWorkbenchStats.ts`**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisalYearEnd/__tests__/useWorkbenchStats.spec.ts`
Expected: PASS

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisalYearEnd`
Expected: PASS，**特別確認 4 張卡片各自的既有測試（`WorkbenchPayoutCard.spec.ts` 等）與 `OverviewWorkbenchView.spec.ts` 完全未受影響**——本 task 不修改卡片元件或視圖，這些測試理論上連跑都不會碰到新檔案，PASS 是預期基本行為，不是驚喜。

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
git add -- src/views/appraisalYearEnd/useWorkbenchStats.ts src/views/appraisalYearEnd/__tests__/useWorkbenchStats.spec.ts
git commit -m "feat(appraisal-year-end): 抽取 4 張待辦卡片的抓取邏輯為 composable

useWorkbenchStats.ts 內 4 個 composable（考核/年終/例外/發放）逐一比照
4 張既有卡片元件（WorkbenchAppraisalCard/WorkbenchYearEndCard/
WorkbenchExceptionsCard/WorkbenchPayoutCard）現有 load() 邏輯原樣搬移
（API 呼叫、聚合公式、422 特例處理逐字一致），本批次不修改任何一個既有
卡片元件或 OverviewWorkbenchView.vue，兩套實作平行存在。為下一批次的
待辦頁視覺重排（統一清單＋側欄卡＋退場舊卡片）鋪路
（V2 IA 簡化 Phase 1 Batch 14 Task 2，收尾本批次）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 記錄

1. **Spec coverage**：本批次是「待辦頁視覺重塑」的資料層準備工作，涵蓋 ux-spec §3.1 統一待辦清單所需的資料推導（`deriveTodoList`）與抓取邏輯（composable 化）。視覺重排本身（版面、側欄、退場舊卡片、KPI 點擊帶 filter）留給下一批次，已在 Global Constraints 明確排除，非遺漏。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼；測試檔的「若實測發現 effectScope 觸發時機跟預期有落差」屬必要的條件式指示，不是模糊佔位。
3. **Type consistency**：`CycleHandle` 型別與 `nextStep.ts` 既有的同名介面欄位一致（`id`/`label`/`status`）；4 個 composable 的回傳形狀（`loading`/`errorMsg`/`stat`/...）刻意統一命名慣例（`stat` 而非各自不同的 `pendingSign`/`pendingCount`/`count`），方便下一批次的視圖層一致消費。
4. **風險守則**：Task 1 的 `deriveNextStep` 重構用「既有 10 個測試案例逐字不動仍全綠」驗證零行為改變；Task 2 明確聲明「不修改任何既有卡片元件或視圖」，兩套實作平行存在、互不影響，本批次完全不改變使用者看到的待辦頁畫面，純粹是為下一批次鋪路的內部重構，風險降到最低。
