# 考核與年終 V2 Phase 1 — Batch 5：年終發放獨立路由退場＋權限缺口修補 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 兩件事：① 修補 Batch 4 遺留的權限缺口——`AppraisalPayoutView.vue` 本身零 `hasPermission` 判斷，過去唯一防線是獨立路由的 `manifest.ts` 權限規則（`APPRAISAL_FINALIZE`），Batch 4 把它掛進工作區後，該工作區其餘部分只需 `YEAR_END_READ` 即可進入，等於讓只有 `YEAR_END_READ`（無 `APPRAISAL_FINALIZE`）的使用者也能在 UI 上看到並嘗試使用發放功能（後端 API 仍會正確擋下，非資料外洩，但前端授權衛生有缺口、體驗也差：看得到按鈕但一按就報錯）。② 退場獨立路由 `/appraisal-year-end/year-end/payout`——盤點確認只有 2 個檔案（`WorkbenchPayoutCard.vue`、`nextStep.ts`）用 `?year=` 深連結指向它，且該路由掛的元件現在改為一個小型「解析器」，依 `?year=` 反推對應的 `year_end_cycles`，`router.replace` 到工作區的發放階段——**兩個引用檔案完全不用改**，因為它們連的 URL 路徑本身不變，只是掛在該路徑上的元件換了。

**Architecture:** ① 是 `YearEndWorkspaceView.vue` 的小補丁：新增 `canPayout = hasPermission('APPRAISAL_FINALIZE')`，導軌用 `visibleSteps`（過濾掉無權限時的 `payout` 項）取代直接吃 `WORKSPACE_STEPS`，內容分支加 `&& canPayout` 雙重防線（導軌不給點＋內容不給看，直接網址硬闖 `?step=payout` 時優雅退回顯示簽核內容而非空白）。② 新增 `YearEndPayoutEntry.vue`（純解析器，無業務邏輯）：`onMounted` 呼叫既有 `listYearEndCycles()`，用「發放年度 − 1913 = 目標週期學年」（與 `AppraisalPayoutView.vue` 既有的 `sourceAcademicYear = year - 1913` 換算式同一條，Batch 4 已驗證過、本批次不重新推導只沿用）找出對應 `year_end_cycles.id`，找到就導向 `/appraisal-year-end/year-end/cycles/{id}?step=payout&year={year}`；找不到顯示空狀態導向年終清單；API 失敗顯示錯誤＋重試。`router/index.ts` 只改一行：`year-end/payout` 這條路由的 `component:` 從 `AppraisalPayoutView.vue` 換成新解析器。

**Tech Stack:** Vue 3、Vue Router 4、Vitest + `@vue/test-utils`。

**Spec:** `implementation-plan.md` §Phase 1；延續 Batch 3／4 教訓（拆舊入口前必先盤點、兩獨立主鍵軸元件合併只在掛載端做單向補值不碰被合併元件本身）。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫、既有權限判斷語意（新增的判斷式使用既有 `hasPermission` 字串比對慣例）。
- `AppraisalPayoutView.vue`、`YearEndConfigView.vue`、`YearEndGridView.vue`、`YearEndDetailView.vue`、週期狀態機 toolbar 邏輯**一律不修改**。
- `WorkbenchPayoutCard.vue`／`nextStep.ts`／`manifest.ts` 的既有連結與權限規則**一律不修改**（URL 路徑不變，故不需要改）。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: `YearEndWorkspaceView.vue` 補「發放」階段的前端權限缺口

**Files:**
- Modify: `src/views/yearEnd/YearEndWorkspaceView.vue`（現況見下方精確片段，改動前）
- Modify test: `src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`

**改動前精確片段（`YearEndWorkspaceView.vue`）：**

script 區塊（第 56-59 行）：
```ts
const cycle = ref<YearEndCycle | null>(null)
const progress = ref<CycleProgress | null>(null)
const canFinalize = computed(() => hasPermission('YEAR_END_FINALIZE'))
const statusBusy = ref(false)
```

template rail 區塊（第 159-160 行）：
```vue
      <ul class="ye-rail__steps">
        <li v-for="s in WORKSPACE_STEPS" :key="s.key">
```

template 內容區塊（第 255-258 行）：
```vue
      <YearEndConfigView v-if="step === 'config'" :cycle-id="cycleId" />
      <YearEndGridView v-else-if="step === 'grid'" :cycle-id="cycleId" />
      <AppraisalPayoutView v-else-if="step === 'payout'" />
      <YearEndDetailView v-else :cycle-id="cycleId" />
```

**Interfaces：** 無新 export；`canPayout`/`visibleSteps` 為元件內部 computed，不外露。

- [ ] **Step 1: 寫測試（先紅）**

在 `YearEndWorkspaceView.spec.ts` 的 `describe('YearEndWorkspaceView', ...)` 區塊內新增三個測試（放在既有測試最後、`})` 結尾之前）：

```ts
  it('無 APPRAISAL_FINALIZE 權限時，導軌不顯示發放按鈕', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    mockHasPermission.mockImplementation((p: string) => p === 'YEAR_END_FINALIZE')
    const wrapper = await mountShell()
    expect(wrapper.find('[data-test="rail-step-payout"]').exists()).toBe(false)
  })

  it('有 APPRAISAL_FINALIZE 權限時，導軌顯示發放按鈕', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    mockHasPermission.mockImplementation((p: string) => p === 'APPRAISAL_FINALIZE')
    const wrapper = await mountShell()
    expect(wrapper.find('[data-test="rail-step-payout"]').exists()).toBe(true)
  })

  it('無 APPRAISAL_FINALIZE 權限但直接以 step=payout 網址進入時，退回顯示簽核內容而非發放內容（雙重防線）', async () => {
    routeRef.value = { params: { id: '9' }, query: { step: 'payout' } }
    mockHasPermission.mockImplementation((p: string) => p === 'YEAR_END_FINALIZE')
    const wrapper = await mountShell()
    expect(wrapper.find('[data-test="stub-payout"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="stub-detail"]').exists()).toBe(true)
  })
```

- [ ] **Step 2: 跑測試確認新增三條紅**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`
Expected: 新增 3 條 FAIL（目前無論權限為何，`rail-step-payout` 恆存在；`step=payout` 恆渲染 `AppraisalPayoutView`）；其餘既有測試仍 PASS（`beforeEach` 預設 `mockHasPermission.mockReturnValue(true)`，不受影響）。

- [ ] **Step 3: 改 `YearEndWorkspaceView.vue`**

1. script 第 58 行後新增一行：
   ```ts
   const canFinalize = computed(() => hasPermission('YEAR_END_FINALIZE'))
   const canPayout = computed(() => hasPermission('APPRAISAL_FINALIZE'))
   const statusBusy = ref(false)
   ```
   （即在 `canFinalize` 宣告後、`statusBusy` 宣告前插入 `canPayout`。）

2. 在 `goStep` 函式之後（第 30 行後）新增：
   ```ts
   const visibleSteps = computed(() => WORKSPACE_STEPS.filter((s) => s.key !== 'payout' || canPayout.value))
   ```

3. template rail 的 `v-for` 改吃 `visibleSteps`：
   ```vue
   <li v-for="s in visibleSteps" :key="s.key">
   ```

4. template 內容分支的 payout 條件加上權限：
   ```vue
   <AppraisalPayoutView v-else-if="step === 'payout' && canPayout" />
   ```

- [ ] **Step 4: 跑測試確認全綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`
Expected: PASS（20/20：原 17 + 新增 3）。

- [ ] **Step 5: 跑更廣範圍**

Run: `npm run test -- --run src/views/yearEnd`
Expected: PASS。

- [ ] **Step 6: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/yearEnd/YearEndWorkspaceView.vue src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 7: Commit**

```bash
git add -- src/views/yearEnd/YearEndWorkspaceView.vue src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
git commit -m "fix(year-end): 工作區發放階段補前端權限判斷（APPRAISAL_FINALIZE）

Batch 4 把 AppraisalPayoutView.vue 掛進工作區後，該元件本身零 hasPermission
判斷，唯一防線曾是獨立路由的 manifest 權限規則；工作區其餘部分只需
YEAR_END_READ，等於讓只有 YEAR_END_READ 的使用者也能在 UI 看到並嘗試點擊
發放功能（後端 API 仍正確擋下，非資料外洩，純前端授權衛生缺口）。
新增 canPayout 雙重防線：導軌不顯示發放項＋內容分支加權限判斷，
直接網址硬闖 ?step=payout 時優雅退回顯示簽核內容（V2 IA Phase 1 Batch 5）。"
```

---

### Task 2: 年終發放獨立路由退場為工作區入口解析器

**Files:**
- Create: `src/views/yearEnd/YearEndPayoutEntry.vue`
- Create: `src/views/yearEnd/__tests__/YearEndPayoutEntry.spec.ts`
- Modify: `src/router/index.ts`（`year-end/payout` 路由的 `component:` 一行）

**⚠ 前置條件：Task 1 必須先完成並 commit（本 task 的解析器會導向 Task 1 已加上權限防線的工作區）。**

**現有 router 定義（`src/router/index.ts`，`year-end/payout` 那一筆，改動前，行號請先 grep `year-end/payout` 確認實際位置）：**

```ts
{ path: 'year-end/payout', name: 'aye-payout', component: () => import('../views/yearEnd/AppraisalPayoutView.vue'), meta: { title: '考核年終發放' } },
```

**改為：**

```ts
{ path: 'year-end/payout', name: 'aye-payout', component: () => import('../views/yearEnd/YearEndPayoutEntry.vue'), meta: { title: '考核年終發放' } },
```

（只改 `component:` 那一段的 import 路徑，`path`/`name`/`meta.title` 逐字不動——`WorkbenchPayoutCard.vue`／`nextStep.ts` 連的是這個 `path`，兩者完全不用改。）

**新元件 `YearEndPayoutEntry.vue` 完整內容：**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listYearEndCycles } from '@/api/yearEnd'
import EmptyState from '@/components/common/EmptyState.vue'

// 純解析器：獨立發放路由退場後的落點。舊路由只認「發放年度」（AD year），
// 工作區以 year_end_cycles.id 為主鍵，兩者換算式與 AppraisalPayoutView.vue
// 既有的 sourceAcademicYear = year - 1913 同一條（Batch 4 已驗證，此處
// 只沿用不重新推導）：目標週期學年 = 發放年度 - 1913。
interface YearEndCycle { id: number; academic_year: number }

const route = useRoute()
const router = useRouter()
const notFound = ref(false)
const loadError = ref(false)

async function resolve() {
  notFound.value = false
  loadError.value = false
  const year = Number(route.query.year) || new Date().getFullYear()
  const targetAcademicYear = year - 1913
  try {
    const res = await listYearEndCycles()
    const cycles = res.data as YearEndCycle[]
    const match = cycles.find((c) => c.academic_year === targetAcademicYear)
    if (match) {
      router.replace({
        path: `/appraisal-year-end/year-end/cycles/${match.id}`,
        query: { step: 'payout', year: String(year) },
      })
    } else {
      notFound.value = true
    }
  } catch {
    loadError.value = true
  }
}
onMounted(resolve)
</script>

<template>
  <div class="ye-payout-entry">
    <EmptyState
      v-if="notFound"
      title="找不到對應的年終週期"
      description="此年度尚未建立對應的年終結算週期，請先於年終清單建立，或切換其他年度。"
    >
      <template #action>
        <router-link to="/appraisal-year-end/year-end">
          <el-button type="primary" plain>前往年終清單</el-button>
        </router-link>
      </template>
    </EmptyState>
    <div v-else-if="loadError" class="ye-payout-entry__error">
      載入失敗
      <el-button data-test="payout-entry-retry" size="small" text type="primary" @click="resolve">重試</el-button>
    </div>
  </div>
</template>

<style scoped>
.ye-payout-entry { padding: var(--space-4); }
.ye-payout-entry__error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
}
</style>
```

**測試 `YearEndPayoutEntry.spec.ts` 完整內容：**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'

vi.mock('@/api/yearEnd', () => ({
  listYearEndCycles: vi.fn(),
}))
import { listYearEndCycles } from '@/api/yearEnd'

const mockedList = vi.mocked(listYearEndCycles)

async function mountEntry(query = '') {
  const YearEndPayoutEntry = (await import('../YearEndPayoutEntry.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/entry', component: YearEndPayoutEntry },
      { path: '/appraisal-year-end/year-end/cycles/:id', component: { template: '<div/>' } },
      { path: '/appraisal-year-end/year-end', component: { template: '<div/>' } },
    ],
  })
  await router.push('/entry' + query)
  await router.isReady()
  const w = mount(YearEndPayoutEntry, { global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  return { w, router }
}

describe('YearEndPayoutEntry', () => {
  beforeEach(() => { mockedList.mockReset() })

  it('依 year 換算目標學年（year-1913），找到對應週期時導向工作區發放階段並帶回 year', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 9, academic_year: 114 }] })
    const { router } = await mountEntry('?year=2027')
    expect(router.currentRoute.value.path).toBe('/appraisal-year-end/year-end/cycles/9')
    expect(router.currentRoute.value.query).toMatchObject({ step: 'payout', year: '2027' })
  })

  it('查無對應週期時顯示空狀態並附「前往年終清單」連結，不導向', async () => {
    mockedList.mockResolvedValue({ data: [{ id: 9, academic_year: 999 }] })
    const { w, router } = await mountEntry('?year=2027')
    expect(w.text()).toContain('找不到對應的年終週期')
    expect(w.find('a[href="/appraisal-year-end/year-end"]').exists()).toBe(true)
    expect(router.currentRoute.value.path).toBe('/entry')
  })

  it('未帶 year 時仍會呼叫 API 嘗試以今年換算（不因缺參數而直接報錯）', async () => {
    mockedList.mockResolvedValue({ data: [] })
    await mountEntry()
    expect(mockedList).toHaveBeenCalledTimes(1)
  })

  it('API 失敗時顯示錯誤與重試按鈕，點擊重試會再次呼叫', async () => {
    mockedList.mockRejectedValueOnce(new Error('network error'))
    const { w } = await mountEntry('?year=2027')
    expect(w.find('[data-test="payout-entry-retry"]').exists()).toBe(true)

    mockedList.mockResolvedValueOnce({ data: [{ id: 9, academic_year: 114 }] })
    await w.find('[data-test="payout-entry-retry"]').trigger('click')
    await flushPromises()
    expect(mockedList).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 1: 確認 router 現況（唯讀）**

```bash
grep -n "year-end/payout" src/router/index.ts
```
確認恰好命中一處（Task 1 不會動這行，故此處應仍是改動前的 `AppraisalPayoutView.vue` import）。

- [ ] **Step 2: 寫新元件與新測試（先紅）**

依上方「新元件」「測試」兩段完整程式碼建立兩個新檔案。

- [ ] **Step 3: 跑新測試確認失敗**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndPayoutEntry.spec.ts`
Expected: 若元件檔已建立則應直接可跑（本 task 不是嚴格 TDD 先紅，因新元件與新測試同時撰寫；跑一次確認測試邏輯本身無誤，非驗證某個「舊行為」被推翻）。

- [ ] **Step 4: 改 router**

依上方「改為」段落，把 `year-end/payout` 那筆的 `component:` 換掉。

- [ ] **Step 5: 跑測試確認全綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndPayoutEntry.spec.ts`
Expected: PASS（4/4）。

- [ ] **Step 6: 跑更廣範圍確認 router 相關測試與既有 payout 連結測試未受影響**

```bash
npm run test -- --run src/views/yearEnd src/router src/constants/navigation
```
Expected: PASS。特別確認 `AppraisalPayoutView.spec.ts`（本 task 不修改該元件本身，只是它現在被工作區內嵌掛載、不再被獨立路由直接掛載——其自身測試不依賴路由掛載方式，應不受影響）、`legacyRedirects.spec.ts`／`appraisalYearEndRedirects.spec.ts`（若其中有斷言 `year-end/payout` 導向的元件身分，理論上這些測試只斷言 URL/path，不斷言掛載元件，應不受影響；若真有紅燈，記錄回報不強行修改斷言邏輯本身）。

- [ ] **Step 7: 全庫回歸掃描**

Run: `npm run test -- --run src` 導出結果、grep 摘要行確認除本 task 範圍外無新增紅燈。

- [ ] **Step 8: typecheck + lint + build**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint
npm run build
```
Expected: 三者皆綠（`npm run build` 因新增一個進 build graph 的檔案，需確認 chunk 邊界檢查仍過）。

- [ ] **Step 9: Commit**

```bash
git add -- src/views/yearEnd/YearEndPayoutEntry.vue src/views/yearEnd/__tests__/YearEndPayoutEntry.spec.ts src/router/index.ts
git commit -m "feat(year-end): 獨立發放路由退場為工作區入口解析器

/appraisal-year-end/year-end/payout 保留原路徑與權限規則（manifest 不動），
但改掛新的 YearEndPayoutEntry.vue 解析器：依 ?year= 換算對應週期學年
（year-1913，沿用 AppraisalPayoutView.vue 既有換算式）找到 year_end_cycles
後導向工作區發放階段；找不到顯示空狀態導向年終清單。
WorkbenchPayoutCard.vue／nextStep.ts 的既有 ?year= 深連結完全不用改
（V2 IA Phase 1 Batch 5）。"
```

---

## Self-Review 記錄

1. **Spec coverage**：Batch 4 遺留的權限缺口（Task 1）與獨立路由退場（Task 2）皆為本次 Phase 1 執行過程中新發現/延續的必辦項，非原 ux-spec 條列項但屬同一批次精神（安全縱深、避免功能倒退）的延伸；兩者皆有完整測試覆蓋。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼與精確測試，無 TBD。
3. **Type consistency**：Task 1 的 `canPayout`/`visibleSteps` 命名不與既有 `canFinalize` 衝突；Task 2 的 `YearEndCycle` 本地介面沿用其他檔案（`YearEndListView.vue`／`AppraisalPayoutView.vue` 等）各自定義最小介面的既有慣例，不引入跨檔共用型別。
4. **風險守則**：Task 2 明確要求 Task 1 先行（工作區的權限防線要先到位，解析器才不會把無權限使用者導進一個「有防線但防線還沒上線」的過渡態——雖然兩者是各自獨立 commit、理論上任一順序執行都不會真的出錯，但依 Task1→Task2 順序執行更符合縱深防禦「先立柵欄再開門」的邏輯）。
