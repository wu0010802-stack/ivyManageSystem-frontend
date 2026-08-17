# 考核與年終 V2 Phase 1 — Batch 15：待辦頁重塑第二階段（視覺重排＋退場舊卡片） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收尾 Phase 1 子項 ③「待辦頁視覺重塑」——Batch 14 已建好資料層（`deriveTodoList`／4 個 composable），本批次把 `OverviewWorkbenchView.vue` 從「hero 卡＋4 張各自獨立主題卡（2x2 grid）」改成 ux-spec §3.1／原型設想的兩欄版面：左欄＝hero 卡＋**統一待辦清單**，右欄＝「進行中的週期」＋「資料新鮮度」（極簡版，已與使用者確認降規格）兩個側欄卡。**退場 4 張舊卡片元件**（`WorkbenchAppraisalCard.vue`／`WorkbenchYearEndCard.vue`／`WorkbenchExceptionsCard.vue`／`WorkbenchPayoutCard.vue`，唯一呼叫端即將被本批次取代，退場前重新 grep 確認零遺漏）。

**Architecture:** Task 1 新增 3 個純新增的展示元件（`WorkbenchTodoList.vue`／`WorkbenchCyclesSidebar.vue`／`WorkbenchFreshnessSidebar.vue`），各自獨立可測試，不觸碰任何既有檔案。Task 2 重寫 `OverviewWorkbenchView.vue`（消費 Batch 14 的 4 個 composable＋Task 1 的 3 個新元件）、微調 `WorkbenchNextStepCard.vue`（部分載入失敗時新增「重試全部」按鈕，取代原本純文字警告）、退場 4 張舊卡片元件與其測試、**全面重寫** `OverviewWorkbenchView.spec.ts`（原本 10 個測試逐一綁定舊 4-card DOM 結構，新版面下每個測試都要換成對應的新結構斷言，這不是遺漏原測試涵蓋的行為，是版面改變後測試斷言必然要跟著換位置）。**唯一發現的行為調整**：`usePayoutWorkbenchStats` 原本靠父層 `v-if="canPayout"` 決定要不要掛載卡片（不掛載＝不 fetch），composable 化後不再有「掛載」這個天然的權限閘門，本批次補上 `year: () => number | null`（`null`＝無權限不查）的顯式閘門，避免無 `APPRAISAL_FINALIZE` 權限的使用者也觸發 `previewAppraisalPayout` 呼叫——這是 Batch 14 composable 抽取時尚未接線才會浮現的必要修正，不算違反 Batch 14「零行為改變」的承諾（那個承諾是對「卡片元件」而非「尚未接線的 composable」）。

**Tech Stack:** Vue 3、Element Plus、Vitest + `@vue/test-utils`。

**Spec:** `.scratch/appraisal-yearend-v2/ux-spec.md` §3.1；`.scratch/appraisal-yearend-v2/prototype.html` 第 267-317 行。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫語意、既有權限判斷語意——唯一例外是上述 `usePayoutWorkbenchStats` 的權限閘門補強，這是修正 Batch 14 遺留的必要調整，不是新增限制（原本卡片版本本就不會讓無權限者觸發這支 API）。
- **本批次刻意不做**：KPI 點擊帶精確 filter query 跳轉（例如「例外」項目點擊後帶 `atype=` 篩選）——`deriveTodoList` 目前的「例外」項目是彙總筆數，沒有拆解到單一 type，點擊後導向例外中心讓使用者自己篩選是可接受的中繼行為；若要做到 ux-spec 設想的「點『缺資料 5 人』直接帶 filter=missing」顆粒度，需要新增 type→粗分類對照表＋`ExceptionCenterView.vue` 的 `atype`/`ytype` 篩選改支援多值，留給更後面的批次視情況評估，非本次遺漏。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: 新增 3 個展示元件（統一清單／週期側欄／新鮮度側欄）

**Files:**
- Create: `src/views/appraisalYearEnd/components/WorkbenchTodoList.vue`
- Create: `src/views/appraisalYearEnd/components/WorkbenchCyclesSidebar.vue`
- Create: `src/views/appraisalYearEnd/components/WorkbenchFreshnessSidebar.vue`
- Create test: `src/views/appraisalYearEnd/components/__tests__/WorkbenchTodoList.spec.ts`
- Create test: `src/views/appraisalYearEnd/components/__tests__/WorkbenchCyclesSidebar.spec.ts`

**⚠ 本 task 只新增檔案，不修改任何既有檔案（不含 `OverviewWorkbenchView.vue`）。**

**Interfaces:**
- `WorkbenchTodoList.vue` props：`{ items: NextStep[] }`（`NextStep` 型別 import 自 `../nextStep`）。無 emit。
- `WorkbenchCyclesSidebar.vue`：無 props，內部自行呼叫 `listAppraisalCycles()`/`listYearEndCycles()`。無 emit。
- `WorkbenchFreshnessSidebar.vue`：無 props/emit，純靜態內容＋一個連結，不呼叫任何 API（已與使用者確認降規格為極簡版：不做原型設想的 4 個獨立資料源同步時間，改成引導使用者去既有真正有追蹤新鮮度的「考核工作區」查看）。

**1. `WorkbenchTodoList.vue`**：

```vue
<script setup lang="ts">
import type { NextStep } from '../nextStep'

defineProps<{ items: NextStep[] }>()

const TAG_META: Record<string, { label: string; type: 'danger' | 'warning' | 'info' }> = {
  exceptions: { label: '例外', type: 'danger' },
  'year-end-sign': { label: '年終', type: 'info' },
  'appraisal-sign': { label: '考核', type: 'info' },
  payout: { label: '發放', type: 'info' },
  'create-appraisal': { label: '考核', type: 'warning' },
  'create-year-end': { label: '年終', type: 'warning' },
}
function tagMeta(key: string) {
  return TAG_META[key] ?? { label: '待辦', type: 'info' as const }
}
</script>

<template>
  <div class="wb-todo-list" data-test="wb-todo-list">
    <ul v-if="items.length > 0" class="wb-todo-list__ul">
      <li
        v-for="item in items"
        :key="item.key"
        class="wb-todo-list__item"
        :data-test="`wb-todo-item-${item.key}`"
      >
        <el-tag size="small" :type="tagMeta(item.key).type">{{ tagMeta(item.key).label }}</el-tag>
        <div class="wb-todo-list__text">
          <p class="wb-todo-list__title">{{ item.title }}</p>
          <p class="wb-todo-list__reason">{{ item.reason }}</p>
        </div>
        <router-link v-if="item.to" :to="item.to">
          <el-button size="small">{{ item.ctaLabel }}</el-button>
        </router-link>
      </li>
    </ul>
    <p v-else class="wb-todo-list__empty" data-test="wb-todo-list-empty">✓ 沒有待處理事項</p>
  </div>
</template>

<style scoped>
.wb-todo-list__ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.wb-todo-list__item { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.wb-todo-list__item:last-child { border-bottom: none; }
.wb-todo-list__text { flex: 1; min-width: 0; }
.wb-todo-list__title { margin: 0; font-weight: 600; font-size: var(--text-sm); }
.wb-todo-list__reason { margin: 2px 0 0; font-size: var(--text-xs); color: var(--text-secondary); }
.wb-todo-list__empty { color: var(--el-color-success); font-size: var(--text-sm); margin: 0; padding: var(--space-3) 0; }
</style>
```

**2. `WorkbenchCyclesSidebar.vue`**：

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listAppraisalCycles } from '@/api/appraisal'
import { listYearEndCycles } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { CYCLE_STATUS_LABEL, CYCLE_STATUS_TAG } from '@/constants/appraisalYearEnd'

interface Row { key: string; label: string; status: string; to: string }

const loading = ref(false)
const errorMsg = ref('')
const rows = ref<Row[]>([])

function semesterLabel(s: string) { return s === 'FIRST' ? '上' : '下' }

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [aRes, yRes] = await Promise.all([listAppraisalCycles(), listYearEndCycles()])
    const appraisalRows: Row[] = aRes.data.map((c) => ({
      key: `appraisal-${c.id}`,
      label: `考核 ${c.academic_year} 學年${semesterLabel(c.semester)}學期`,
      status: c.status,
      to: `/appraisal-year-end/appraisal?cycle=${c.id}&stage=sign`,
    }))
    const yearEndRows: Row[] = yRes.data.map((c) => ({
      key: `year-end-${c.id}`,
      label: `年終 ${c.academic_year} 學年度`,
      status: c.status,
      to: `/appraisal-year-end/year-end/cycles/${c.id}`,
    }))
    rows.value = [...appraisalRows, ...yearEndRows]
  } catch (e) {
    errorMsg.value = apiError(e, '載入失敗')
  } finally {
    loading.value = false
  }
}
onMounted(load)
</script>

<template>
  <el-card shadow="never" class="wb-side-card" data-test="wb-cycles-sidebar">
    <template #header><span class="wb-side-card__title">進行中的週期</span></template>
    <el-skeleton v-if="loading" :rows="3" animated />
    <div v-else-if="errorMsg" class="wb-side-card__error">
      載入失敗 <el-button size="small" text type="primary" @click="load">重試</el-button>
    </div>
    <el-empty v-else-if="rows.length === 0" description="尚無週期" :image-size="48" />
    <ul v-else class="wb-side-card__list">
      <li v-for="row in rows" :key="row.key" class="wb-side-card__row">
        <router-link :to="row.to">{{ row.label }}</router-link>
        <el-tag size="small" :type="CYCLE_STATUS_TAG[row.status] ?? 'info'">
          {{ CYCLE_STATUS_LABEL[row.status] ?? row.status }}
        </el-tag>
      </li>
    </ul>
  </el-card>
</template>

<style scoped>
.wb-side-card__title { font-weight: 600; }
.wb-side-card__error { display: flex; align-items: center; gap: var(--space-2); color: var(--el-color-danger); font-size: var(--text-sm); }
.wb-side-card__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.wb-side-card__row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); font-size: var(--text-sm); }
</style>
```

**3. `WorkbenchFreshnessSidebar.vue`**：

```vue
<template>
  <el-card shadow="never" class="wb-side-card" data-test="wb-freshness-sidebar">
    <template #header><span class="wb-side-card__title">資料新鮮度</span></template>
    <p class="wb-side-card__hint">
      同步不會自動執行。如需查看考核資料最後更新時間並手動觸發更新，請至考核工作區「準備資料」階段查看。
    </p>
    <router-link to="/appraisal-year-end/appraisal">前往考核工作區 →</router-link>
  </el-card>
</template>

<style scoped>
.wb-side-card__title { font-weight: 600; }
.wb-side-card__hint { font-size: var(--text-sm); color: var(--text-secondary); margin: 0 0 var(--space-2); }
</style>
```

**4. 測試檔**（先 `find` 該目錄既有測試慣例確認 mount pattern，比照 `WorkbenchPayoutCard.spec.ts` 或本目錄其他既有測試）：

`WorkbenchTodoList.spec.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import WorkbenchTodoList from '../WorkbenchTodoList.vue'
import type { NextStep } from '../../nextStep'

const mountList = (items: NextStep[]) =>
  mount(WorkbenchTodoList, {
    props: { items },
    global: { plugins: [ElementPlus], stubs: { 'router-link': RouterLinkStub } },
  })

describe('WorkbenchTodoList', () => {
  it('items 為空時顯示「沒有待處理事項」', () => {
    const w = mountList([])
    expect(w.find('[data-test="wb-todo-list-empty"]').exists()).toBe(true)
  })

  it('依序渲染每一項的類型 tag／標題／說明／動作按鈕', () => {
    const items: NextStep[] = [
      { key: 'exceptions', title: '處理 2 筆阻斷級例外', reason: '阻斷級例外會讓試算與簽核出錯。', ctaLabel: '前往處理', to: '/appraisal-year-end/exceptions' },
      { key: 'payout', title: '4 筆考核年終可發放', reason: '簽核已完成。', ctaLabel: '前往發放', to: '/appraisal-year-end/year-end/payout?year=2026' },
    ]
    const w = mountList(items)
    expect(w.find('[data-test="wb-todo-item-exceptions"]').text()).toContain('處理 2 筆阻斷級例外')
    expect(w.find('[data-test="wb-todo-item-payout"]').text()).toContain('4 筆考核年終可發放')
    expect(w.findAll('.wb-todo-list__item')).toHaveLength(2)
  })
})
```

`WorkbenchCyclesSidebar.spec.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/api/appraisal', () => ({
  listAppraisalCycles: vi.fn(),
}))
vi.mock('@/api/yearEnd', () => ({
  listYearEndCycles: vi.fn(),
}))

import { listAppraisalCycles } from '@/api/appraisal'
import { listYearEndCycles } from '@/api/yearEnd'
import WorkbenchCyclesSidebar from '../WorkbenchCyclesSidebar.vue'

const mountSidebar = () =>
  mount(WorkbenchCyclesSidebar, {
    global: { plugins: [ElementPlus], stubs: { 'router-link': RouterLinkStub } },
  })

describe('WorkbenchCyclesSidebar', () => {
  beforeEach(() => vi.clearAllMocks())

  it('渲染考核與年終週期各一列，帶狀態 tag', async () => {
    vi.mocked(listAppraisalCycles).mockResolvedValue({
      data: [{ id: 5, academic_year: 115, semester: 'FIRST', status: 'OPEN' }],
    } as never)
    vi.mocked(listYearEndCycles).mockResolvedValue({
      data: [{ id: 9, academic_year: 114, status: 'LOCKED' }],
    } as never)
    const w = mountSidebar()
    await flushPromises()
    expect(w.text()).toContain('考核 115 學年上學期')
    expect(w.text()).toContain('年終 114 學年度')
    expect(w.text()).toContain('開放')
    expect(w.text()).toContain('已鎖定')
  })

  it('載入失敗時顯示重試，點擊後恢復', async () => {
    vi.mocked(listAppraisalCycles).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(listYearEndCycles).mockRejectedValueOnce(new Error('boom'))
    const w = mountSidebar()
    await flushPromises()
    expect(w.find('[data-test="wb-cycles-sidebar"]').text()).toContain('載入失敗')

    vi.mocked(listAppraisalCycles).mockResolvedValueOnce({ data: [] } as never)
    vi.mocked(listYearEndCycles).mockResolvedValueOnce({ data: [] } as never)
    await w.find('[data-test="wb-cycles-sidebar"]').find('button').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="wb-cycles-sidebar"]').text()).not.toContain('載入失敗')
  })
})
```

- [ ] **Step 1: 寫測試（TDD，先確認失敗）**

```bash
npm run test -- --run src/views/appraisalYearEnd/components/__tests__/WorkbenchTodoList.spec.ts
npm run test -- --run src/views/appraisalYearEnd/components/__tests__/WorkbenchCyclesSidebar.spec.ts
```
Expected: 兩者皆 FAIL（檔案不存在）

- [ ] **Step 2: 依上方 1-3 段落實作三個元件**

- [ ] **Step 3: 跑測試確認全綠**

```bash
npm run test -- --run src/views/appraisalYearEnd/components/__tests__/WorkbenchTodoList.spec.ts
npm run test -- --run src/views/appraisalYearEnd/components/__tests__/WorkbenchCyclesSidebar.spec.ts
```
Expected: 兩者皆 PASS

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisalYearEnd`
Expected: PASS，確認既有測試（含 4 張舊卡片與 `OverviewWorkbenchView.spec.ts`）完全未受影響——本 task 未修改任何既有檔案。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/appraisalYearEnd/components/WorkbenchTodoList.vue src/views/appraisalYearEnd/components/WorkbenchCyclesSidebar.vue src/views/appraisalYearEnd/components/WorkbenchFreshnessSidebar.vue
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisalYearEnd/components/WorkbenchTodoList.vue src/views/appraisalYearEnd/components/WorkbenchCyclesSidebar.vue src/views/appraisalYearEnd/components/WorkbenchFreshnessSidebar.vue src/views/appraisalYearEnd/components/__tests__/WorkbenchTodoList.spec.ts src/views/appraisalYearEnd/components/__tests__/WorkbenchCyclesSidebar.spec.ts
git commit -m "feat(appraisal-year-end): 新增待辦頁三個展示元件（統一清單／週期側欄／新鮮度側欄）

WorkbenchTodoList.vue（消費 Batch 14 的 deriveTodoList）／
WorkbenchCyclesSidebar.vue（進行中的週期，listAppraisalCycles+
listYearEndCycles 既有 API）／WorkbenchFreshnessSidebar.vue（資料新鮮度
極簡版，已與使用者確認降規格為靜態引導連結，不做原型設想的 4 個獨立
資料源同步時間）。純新增，不修改任何既有檔案
（V2 IA 簡化 Phase 1 Batch 15 Task 1，接線與退場舊卡片見 Task 2）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 重寫 `OverviewWorkbenchView.vue`，退場 4 張舊卡片

**Files:**
- Modify: `src/views/appraisalYearEnd/OverviewWorkbenchView.vue`
- Modify: `src/views/appraisalYearEnd/components/WorkbenchNextStepCard.vue`
- Modify: `src/views/appraisalYearEnd/useWorkbenchStats.ts`（`usePayoutWorkbenchStats` 簽名調整）
- Modify test: `src/views/appraisalYearEnd/__tests__/useWorkbenchStats.spec.ts`（對應調整）
- Delete: `src/views/appraisalYearEnd/components/WorkbenchAppraisalCard.vue`
- Delete: `src/views/appraisalYearEnd/components/WorkbenchYearEndCard.vue`
- Delete: `src/views/appraisalYearEnd/components/WorkbenchExceptionsCard.vue`
- Delete: `src/views/appraisalYearEnd/components/WorkbenchPayoutCard.vue`
- Delete test: `src/views/appraisalYearEnd/__tests__/WorkbenchPayoutCard.spec.ts`（若其餘三張舊卡片各自也有測試檔，一併刪除——實作前先 `find` 確認完整清單）
- Rewrite test: `src/views/appraisalYearEnd/__tests__/OverviewWorkbenchView.spec.ts`

**⚠ 前置條件：Task 1 必須先完成並 commit。**

**Interfaces:**
- `usePayoutWorkbenchStats(year: () => number | null)`（簽名變更，`() => null` 代表無權限/不查，比照另外三個 composable「cycle getter 回傳 null 即不查」的既有模式）。
- `WorkbenchNextStepCard.vue` 新增 emit `'retry': []`（部分載入失敗時，「重試全部」按鈕觸發，取代原本純文字警告）。

**1. `usePayoutWorkbenchStats` 簽名調整**（`useWorkbenchStats.ts`，取代原本 `usePayoutWorkbenchStats` 函式定義）：

```ts
export function usePayoutWorkbenchStats(year: () => number | null) {
  const loading = ref(false)
  const errorMsg = ref('')
  const notReady = ref(false)
  const stat = ref<number | undefined>(undefined)
  const totalAmount = ref(0)

  async function load() {
    const y = year()
    if (y == null) {
      stat.value = 0
      return
    }
    loading.value = true
    errorMsg.value = ''
    notReady.value = false
    try {
      const rows = (await previewAppraisalPayout(y)).data
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

（測試檔 `useWorkbenchStats.spec.ts` 內既有的 `usePayoutWorkbenchStats` 測試呼叫處，把 `usePayoutWorkbenchStats(() => 2026)` 改成 `usePayoutWorkbenchStats(() => 2026 as number | null)` 或直接維持 `() => 2026`——TS 型別可推導相容不強制改動呼叫端寫法；另外新增一個測試：`year() 回傳 null 時 stat 設為 0，不呼叫 API`，比照另外三個 composable「無 cycle 不查」的既有測試案例寫法。）

**2. `WorkbenchNextStepCard.vue` 新增重試全部按鈕**（取代原本整個檔案）：

```vue
<script setup lang="ts">
import type { NextStep } from '../nextStep'

defineProps<{ step: NextStep | null; partialError: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <el-card shadow="never" class="wb-next" data-test="next-step-card">
    <el-skeleton v-if="!step" :rows="1" animated />
    <template v-else>
      <div class="wb-next__row">
        <div>
          <p class="wb-next__title">
            <template v-if="step.key === 'done'">✓ {{ step.title }}</template>
            <template v-else>下一步：{{ step.title }}</template>
          </p>
          <p class="wb-next__reason">{{ step.reason }}</p>
          <p v-if="partialError" class="wb-next__warn">
            部分卡片載入失敗，建議內容可能不完整。
            <el-button size="small" text type="warning" data-test="next-step-retry-all" @click="$emit('retry')">重試全部</el-button>
          </p>
        </div>
        <router-link v-if="step.to" :to="step.to">
          <el-button type="primary">{{ step.ctaLabel }}</el-button>
        </router-link>
      </div>
    </template>
  </el-card>
</template>

<style scoped>
.wb-next { border-left: 4px solid var(--el-color-primary); }
.wb-next__row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.wb-next__title { font-weight: 600; font-size: var(--text-base); margin: 0; }
.wb-next__reason { font-size: var(--text-sm); color: var(--text-secondary); margin: 4px 0 0; }
.wb-next__warn { font-size: var(--text-xs); color: var(--el-color-warning); margin: 4px 0 0; display: flex; align-items: center; gap: var(--space-2); }
</style>
```

（`.wb-next { border-left: 4px solid ... }` 為既有樣式，本次不動——非本批次範圍的視覺瑕疵，不在本次修復清單內。）

**3. 重寫 `OverviewWorkbenchView.vue`**（取代整個檔案）：

```vue
<script setup lang="ts">
// 待辦頁：hero 卡＋統一待辦清單（左欄）＋進行中的週期／資料新鮮度側欄（右欄）。
// Batch 15：4 張各自獨立主題卡（舊版）已退場，4 個 composable（Batch 14）+
// deriveTodoList（Batch 14）在此接線消費。
import { ref, computed } from 'vue'
import { getAppraisalCurrentCycle } from '@/api/appraisal'
import { listYearEndCycles } from '@/api/yearEnd'
import type { Schema } from '@/api/_generated/typed'
import { hasPermission } from '@/utils/auth'
import { deriveTodoList, deriveNextStep } from './nextStep'
import {
  useAppraisalWorkbenchStats,
  useYearEndWorkbenchStats,
  useExceptionsWorkbenchStats,
  usePayoutWorkbenchStats,
} from './useWorkbenchStats'
import WorkbenchNextStepCard from './components/WorkbenchNextStepCard.vue'
import WorkbenchTodoList from './components/WorkbenchTodoList.vue'
import WorkbenchCyclesSidebar from './components/WorkbenchCyclesSidebar.vue'
import WorkbenchFreshnessSidebar from './components/WorkbenchFreshnessSidebar.vue'

interface CycleHandle { id: number; label: string; status: string }

const appraisalCycle = ref<CycleHandle | null>(null)
const yearEndCycle = ref<CycleHandle | null>(null)
const payoutYear = new Date().getFullYear()

// 根把手 fetch 失敗顯式化：rejected 不可靜默吞掉，否則會誤讓 composable 判定
// 「查無週期」而非「載入失敗」（沿用既有 appraisalRootError/yearEndRootError
// 既有作法，語意不變，只是不再驅動卡片級錯誤 UI，改驅動 partialError 彙總）。
const appraisalRootError = ref(false)
const yearEndRootError = ref(false)

const semesterLabel = (s: string) => (s === 'FIRST' ? '上' : '下')

async function loadHandles() {
  appraisalRootError.value = false
  yearEndRootError.value = false
  const [appraisalRes, yearEndRes] = await Promise.allSettled([getAppraisalCurrentCycle(), listYearEndCycles()])

  if (appraisalRes.status === 'fulfilled') {
    const c = appraisalRes.value.data
    appraisalCycle.value = c
      ? { id: c.id, label: `${c.academic_year} 學年${semesterLabel(c.semester)}學期`, status: c.status }
      : null
  } else {
    appraisalRootError.value = true
  }

  if (yearEndRes.status === 'fulfilled') {
    const cycles = yearEndRes.value.data as Schema<'YearEndCycleOut'>[]
    if (cycles.length > 0) {
      const latest = cycles.reduce((a, b) => (b.academic_year > a.academic_year ? b : a))
      yearEndCycle.value = { id: latest.id, label: `${latest.academic_year} 學年度`, status: latest.status }
    } else {
      yearEndCycle.value = null
    }
  } else {
    yearEndRootError.value = true
  }
}

const canAppraisal = computed(() => hasPermission('APPRAISAL_READ'))
const canYearEnd = computed(() => hasPermission('YEAR_END_READ'))
const canExceptions = computed(() => hasPermission('APPRAISAL_READ') || hasPermission('YEAR_END_READ'))
const canPayout = computed(() => hasPermission('APPRAISAL_FINALIZE'))

// 權限閘門直接內建在傳給 composable 的 getter：無權限時 getter 恆回 null，
// composable 內部既有的「無 cycle 不查」路徑（stat 直接設 0）自然生效，不需要
// 額外的 onMounted 補丁（比照舊版 OverviewWorkbenchView.vue 需要一段
// onMounted 手動幫沒 render 的卡片把 stat 補 0 的作法，這裡結構性地不會有
// 這個問題）。
const appraisalStats = useAppraisalWorkbenchStats(() => (canAppraisal.value ? appraisalCycle.value : null))
const yearEndStats = useYearEndWorkbenchStats(() => (canYearEnd.value ? yearEndCycle.value : null))
const exceptionsStats = useExceptionsWorkbenchStats(
  () => (canExceptions.value ? appraisalCycle.value : null),
  () => (canExceptions.value ? yearEndCycle.value : null),
)
const payoutStats = usePayoutWorkbenchStats(() => (canPayout.value ? payoutYear : null))

const cardStats = computed(() => ({
  appraisal: appraisalRootError.value ? 0 : appraisalStats.stat.value,
  yearEnd: yearEndRootError.value ? 0 : yearEndStats.stat.value,
  exceptions: exceptionsStats.stat.value,
  payout: payoutStats.stat.value,
}))

const partialError = computed(
  () =>
    appraisalRootError.value ||
    yearEndRootError.value ||
    !!appraisalStats.errorMsg.value ||
    !!yearEndStats.errorMsg.value ||
    !!exceptionsStats.errorMsg.value ||
    (!!payoutStats.errorMsg.value && !payoutStats.notReady.value),
)

const nextStep = computed(() =>
  deriveNextStep({
    appraisalCycle: appraisalCycle.value,
    yearEndCycle: yearEndCycle.value,
    blockingExceptions: cardStats.value.exceptions,
    yearEndPendingSign: cardStats.value.yearEnd,
    appraisalPendingSign: cardStats.value.appraisal,
    payoutReadyCount: cardStats.value.payout,
    canAppraisal: canAppraisal.value,
    canYearEnd: canYearEnd.value,
    payoutYear,
  }),
)
const todoItems = computed(() =>
  deriveTodoList({
    appraisalCycle: appraisalCycle.value,
    yearEndCycle: yearEndCycle.value,
    blockingExceptions: cardStats.value.exceptions,
    yearEndPendingSign: cardStats.value.yearEnd,
    appraisalPendingSign: cardStats.value.appraisal,
    payoutReadyCount: cardStats.value.payout,
    canAppraisal: canAppraisal.value,
    canYearEnd: canYearEnd.value,
    payoutYear,
  }),
)

async function retryAll() {
  await loadHandles()
  await Promise.all([appraisalStats.load(), yearEndStats.load(), exceptionsStats.load(), payoutStats.load()])
}

loadHandles()
</script>

<template>
  <div class="wb-grid">
    <WorkbenchNextStepCard
      :step="nextStep"
      :partial-error="partialError"
      class="wb-next-slot"
      @retry="retryAll"
    />
    <div class="wb-main">
      <WorkbenchTodoList :items="todoItems" />
    </div>
    <div class="wb-side">
      <WorkbenchCyclesSidebar />
      <WorkbenchFreshnessSidebar />
    </div>
  </div>
</template>

<style scoped>
.wb-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--space-4);
}
.wb-next-slot { grid-column: 1 / -1; }
.wb-main { min-width: 0; }
.wb-side { display: flex; flex-direction: column; gap: var(--space-4); }
@media (max-width: 900px) {
  .wb-grid { grid-template-columns: 1fr; }
}
</style>
```

**4. 刪除 4 張舊卡片元件**：刪除前先 `grep -rn "WorkbenchAppraisalCard\|WorkbenchYearEndCard\|WorkbenchExceptionsCard\|WorkbenchPayoutCard" src/` 確認除了要刪除的檔案自己（含各自測試檔）之外零遺漏呼叫點（`OverviewWorkbenchView.vue` 本 task 已改為不再 import 它們，應該是唯一的既有呼叫端）。實作前先 `find src/views/appraisalYearEnd -iname "Workbench*Card*"` 確認完整檔案清單（含測試檔）再逐一刪除。

**5. 重寫 `OverviewWorkbenchView.spec.ts`**：既有 10 個測試案例全數綁定舊 4-card DOM 結構（`[data-test="appraisal-card"]` 等），新版面下需要對應改寫（不是砍掉，是換位置斷言，涵蓋範圍需對齊）：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import ElementPlus from 'element-plus'

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))

vi.mock('@/api/appraisal', () => ({
  getAppraisalCurrentCycle: vi.fn(() =>
    Promise.resolve({ data: { id: 7, academic_year: 114, semester: 'SECOND', status: 'OPEN' } }),
  ),
  getSignStatusSummary: vi.fn(() =>
    Promise.resolve({
      data: { cycle_id: 7, counts: { DRAFT: 10, SUPERVISOR_SIGNED: 5, ACCOUNTING_SIGNED: 3, FINALIZED: 2 }, buckets: [] },
    }),
  ),
  getAppraisalCycleExceptions: vi.fn(() =>
    Promise.resolve({ data: { cycle_id: 7, generated_at: '2026-07-10T00:00:00Z', counts_by_type: {}, items: [] } }),
  ),
  listAppraisalCycles: vi.fn(() =>
    Promise.resolve({ data: [{ id: 7, academic_year: 114, semester: 'SECOND', status: 'OPEN' }] }),
  ),
}))

vi.mock('@/api/yearEnd', () => ({
  listYearEndCycles: vi.fn(() =>
    Promise.resolve({ data: [{ id: 3, academic_year: 114, bonus_calc_date: '2026-01-15', status: 'OPEN' }] }),
  ),
  getYearEndGrid: vi.fn(() =>
    Promise.resolve({
      data: [
        { settlement_id: 1, employee_id: 1, employee_name: '王小明', status: 'DRAFT', payable_amount: '10000', total_amount: '10000', special_bonuses: {} },
        { settlement_id: 2, employee_id: 2, employee_name: '陳小華', status: 'FINALIZED', payable_amount: '20000', total_amount: '20000', special_bonuses: {} },
      ],
    }),
  ),
  getYearEndCycleExceptions: vi.fn(() =>
    Promise.resolve({
      data: {
        cycle_id: 3,
        generated_at: '2026-07-10T00:00:00Z',
        counts_by_type: { qualification: 1 },
        items: [{ type: 'qualification', severity: 'warning', entity_type: 'employee', entity_id: '1', target_name: '王小明', reason: '', impact: '', suggested_action: '', deep_link: '' }],
      },
    }),
  ),
  previewAppraisalPayout: vi.fn(() => Promise.resolve({ data: [] })),
}))

import OverviewWorkbenchView from '../OverviewWorkbenchView.vue'
import { getSignStatusSummary, getAppraisalCurrentCycle } from '@/api/appraisal'
import { listYearEndCycles } from '@/api/yearEnd'
import { hasPermission } from '@/utils/auth'

const mountView = () =>
  mount(OverviewWorkbenchView, {
    global: { plugins: [ElementPlus], stubs: { 'router-link': RouterLinkStub } },
  })

describe('OverviewWorkbenchView', () => {
  beforeEach(() => {
    vi.mocked(hasPermission).mockReset()
    vi.mocked(hasPermission).mockReturnValue(true)
  })

  it('待辦清單依優先序列出考核/年終待簽項目', async () => {
    const w = mountView()
    await flushPromises()
    const list = w.find('[data-test="wb-todo-list"]')
    // DRAFT10+SUPERVISOR_SIGNED5+ACCOUNTING_SIGNED3 = 18 筆未核定（考核）
    expect(list.text()).toContain('考核還有 18 筆未核定')
    // grid 2 列中 1 列非 FINALIZED（年終）——年終週期 status=OPEN 故此項目會出現
    expect(list.text()).toContain('年終結算還有 1 筆未核定')
  })

  it('待辦清單為空時顯示「沒有待處理事項」', async () => {
    vi.mocked(getSignStatusSummary).mockResolvedValueOnce({
      data: { cycle_id: 7, counts: { FINALIZED: 10 }, buckets: [] },
    } as never)
    // 需同步覆寫 getYearEndGrid／getAppraisalCycleExceptions／getYearEndCycleExceptions／
    // previewAppraisalPayout 讓所有來源皆為 0，實測時依實際 mock 覆寫方式調整
    // ……
  })

  it('無 APPRAISAL_READ 權限 → 待辦清單不含考核相關項目', async () => {
    vi.mocked(hasPermission).mockImplementation((p: string) => p !== 'APPRAISAL_READ')
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="wb-todo-list"]').text()).not.toContain('考核還有')
  })

  it('進行中的週期側欄渲染考核與年終週期', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="wb-cycles-sidebar"]').text()).toContain('考核 114 學年下學期')
    expect(w.find('[data-test="wb-cycles-sidebar"]').text()).toContain('年終 114 學年度')
  })

  it('資料新鮮度側欄顯示極簡靜態引導', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="wb-freshness-sidebar"]').exists()).toBe(true)
  })

  it('考核根把手載入失敗 → partialError 為真，hero 卡顯示「重試全部」', async () => {
    vi.mocked(getAppraisalCurrentCycle).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="next-step-retry-all"]').exists()).toBe(true)
  })

  it('點擊「重試全部」後恢復正常（partialError 消失）', async () => {
    vi.mocked(getAppraisalCurrentCycle).mockRejectedValueOnce(new Error('boom'))
    const w = mountView()
    await flushPromises()
    expect(w.find('[data-test="next-step-retry-all"]').exists()).toBe(true)
    await w.find('[data-test="next-step-retry-all"]').trigger('click')
    await flushPromises()
    expect(w.find('[data-test="next-step-retry-all"]').exists()).toBe(false)
  })

  it('無 APPRAISAL_FINALIZE 權限時不呼叫 previewAppraisalPayout（避免無權限使用者觸發此 API）', async () => {
    const { previewAppraisalPayout } = await import('@/api/yearEnd')
    vi.mocked(hasPermission).mockImplementation((p: string) => p !== 'APPRAISAL_FINALIZE')
    mountView()
    await flushPromises()
    expect(previewAppraisalPayout).not.toHaveBeenCalled()
  })
})
```

（上方第 2 個測試「待辦清單為空」刻意留了註解說明需要同步覆寫多支 mock——implementer 實作時請補齊完整的 mock 覆寫值讓四個來源數字都是 0，比照第一個測試的預設 mock 值調整成「已全數核定/無例外/無可發放」的組合，寫成可執行的完整測試，不要照抄註解本身當成程式碼。以上測試案例是**最低限度**必須涵蓋的行為，若實測發現這份清單遺漏了原本 10 個舊測試裡某個仍然重要、新版面下也該有對應行為的案例（例如「固定順序」的等價概念——新版面下清單本身已經是 `deriveTodoList` 的既有優先序測試涵蓋，不需要重複測；但「單一來源失敗不影響其他來源」這件事在新版面下的呈現方式若有你認為需要額外補的案例，可以補，只是不要為了省事而少測。）

- [ ] **Step 1: 跑既有測試確認目前基準**

Run: `npm run test -- --run src/views/appraisalYearEnd/__tests__/OverviewWorkbenchView.spec.ts`
Expected: PASS（既有 10 個案例，改動前）

- [ ] **Step 2: 依上方 1-5 段落逐一套用改動**

- [ ] **Step 3: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisalYearEnd/__tests__/OverviewWorkbenchView.spec.ts`
Expected: PASS（新版測試案例全數通過）

- [ ] **Step 4: 跑更廣範圍**

Run: `npm run test -- --run src/views/appraisalYearEnd`
Expected: PASS，確認 `useWorkbenchStats.spec.ts`（Step 1 調整過 `usePayoutWorkbenchStats` 呼叫簽名的地方）與其餘既有測試皆綠。

- [ ] **Step 5: 全庫回歸掃描**

Run: `npm run test -- --run src` 導出結果、grep 摘要行確認除本批次範圍外無新增紅燈（已知既有 flaky：`PickupAuthorizationsView.test.ts` 的 `filters refetch on date/status change` 僅在全庫並行負載下偶發紅，與本批次無關，不算新增紅燈）。

- [ ] **Step 6: typecheck + lint + build**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint
npm run build
```
Expected: 三者皆綠。**build 這一步特別重要**——本批次刪除 4 個既有檔案，若有任何遺漏的 import 引用，vite build 會直接失敗。

- [ ] **Step 7: Commit**

```bash
git add -- src/views/appraisalYearEnd/OverviewWorkbenchView.vue src/views/appraisalYearEnd/components/WorkbenchNextStepCard.vue src/views/appraisalYearEnd/useWorkbenchStats.ts src/views/appraisalYearEnd/__tests__/useWorkbenchStats.spec.ts src/views/appraisalYearEnd/__tests__/OverviewWorkbenchView.spec.ts
git rm -- src/views/appraisalYearEnd/components/WorkbenchAppraisalCard.vue src/views/appraisalYearEnd/components/WorkbenchYearEndCard.vue src/views/appraisalYearEnd/components/WorkbenchExceptionsCard.vue src/views/appraisalYearEnd/components/WorkbenchPayoutCard.vue
# 若既有測試檔清單與 brief 描述有出入，一併 git rm 對應測試檔案（實作時已用 find 確認過的完整清單為準）
git commit -m "feat(appraisal-year-end): 待辦頁重塑第二階段——視覺重排＋退場舊卡片

OverviewWorkbenchView.vue 從 4 張各自獨立主題卡（2x2 grid）改成兩欄
版面：左欄 hero 卡＋統一待辦清單（WorkbenchTodoList，消費 deriveTodoList），
右欄進行中的週期／資料新鮮度兩個側欄卡（Batch 15 Task 1 已建）。4 張舊
卡片元件退場（唯一呼叫端已改用新版面，grep 確認零遺漏引用）。
usePayoutWorkbenchStats 補上權限閘門（year() 回傳 null 即不查，修正
Batch 14 composable 化後遺失的「無權限不掛載即不 fetch」保護）。
WorkbenchNextStepCard.vue 新增「重試全部」按鈕取代純文字警告。
Phase 1 子項 ③ 待辦頁視覺重塑至此完成
（V2 IA 簡化 Phase 1 Batch 15 Task 2，收尾本批次）。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review 記錄

1. **Spec coverage**：ux-spec §3.1 的統一待辦清單、進行中的週期側欄、hero 卡皆已涵蓋；資料新鮮度側欄依使用者裁定降規格為極簡版；KPI 帶精確 filter query 跳轉明確排除於本批次（見 Global Constraints 理由）。Phase 1 原始子項 ③ 至此完整收斂。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼；Task 2 測試檔的「待辦清單為空」案例刻意留白讓 implementer 依實測補齊 mock 組合，已明講「這是需要 implementer 動筆完成的部分，不是照抄註解」，屬必要的條件式指示而非模糊佔位。
3. **Type consistency**：`usePayoutWorkbenchStats` 簽名變更（`() => number` → `() => number | null`）已在 Interfaces 段落明確標注是本批次的刻意調整，非 Batch 14 遺漏；`WorkbenchTodoList.vue`／`WorkbenchCyclesSidebar.vue` 的 props/資料結構與 `nextStep.ts`／既有 API 回傳型別對齊。
4. **風險守則**：`usePayoutWorkbenchStats` 的權限閘門補強有明確論證（避免無權限使用者觸發後端 API，屬安全衛生強化非新增限制）；4 張舊卡片刪除前明確要求重新 grep 確認零遺漏呼叫點；build 驗證步驟特別標注其在「刪除既有檔案」情境下的必要性。
