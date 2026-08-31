# 考核與年終 V2 Phase 1 — Batch 2：考核工作區 shell（新建，尚未接線）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立考核工作區三個新元件——步驟常數、審查例外摘要面板、工作區 shell（週期選擇器＋三階段導軌＋唯讀 ribbon，組合既有 `CurrentSemesterOverview`/`CycleDetailPanel` 為內容）。**本批次刻意不動路由、不刪除 `AppraisalManagementView.vue`、不改任何連結目標**——原因：盤點發現 `appraisal/current`／`appraisal/history`／`appraisal/calibration` 這三個即將被取代的路徑，目前被 7 個檔案（`CurrentSemesterOverview.vue`、`AppraisalPayoutView.vue`、`RulesSettingsLayout.vue`、`WorkbenchAppraisalCard.vue`、`nextStep.ts`、`AppraisalYearEndLayout.vue`、含 query 深連結如 `?cycle=X&view=kanban`）引用，正確的路由切換與 legacy redirect 設計需要對這 7 個引用點逐一核實查詢字串語意，屬於獨立、需要專門盤點的高風險工作，排入 Batch 3。本批次交付的三個元件完整測試通過、可獨立驗證，是 Batch 3 路由切換的前置積木。

**Architecture:** `AppraisalCycleExceptionsSummary.vue` 是純展示元件（props: `cycleId`），資料源直接呼叫既有 `getAppraisalCycleExceptions`（與 `ExceptionCenterView.vue` 共用同一支端點與回應型別，欄位定義照抄該檔已驗證過的 `ExceptionItem`/`ExceptionsData` interface，不重新猜測形狀）。`AppraisalWorkspaceView.vue` 是新的路由葉節點候選元件：週期選擇器用 `listAppraisalCycles()`（比照 `CycleListView.vue` 既有慣例，**不是** `AcademicTermSelector`——後者是全域學期切換元件，只列「本學期＋前後各一學期」的滑動視窗，不支援瀏覽任意歷史週期，語意不合）；「準備資料」階段只在選中週期＝目前真正 OPEN 中的週期（用 `getAppraisalCurrentCycle()` 取得的 id 比對）時渲染既有 `CurrentSemesterOverview.vue`（完全不動、含其內部既有的進頁 auto-refresh，Phase 2 才處理），非目前週期時顯示說明性空狀態；「簽核完成」階段一律渲染既有 `CycleDetailPanel.vue`（已支援任意 `cycleId` prop，本就是 `CycleListView.vue` 現在的用法）；「審查例外」階段渲染本批次新建的摘要面板。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Vue Router 4、Element Plus、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/ux-spec.md` §3.2（考核工作區畫面規格）；`implementation-plan.md` §Phase 1 子項 4、7。

## Global Constraints

- 語言：繁體中文（UI 文字、commit message、註解）；程式識別字英文。
- 不改動任何既有 API 呼叫、公式、計算邏輯、簽核狀態機、權限判斷語意——本批次純新增元件，組合既有唯讀/既有元件。
- **不修改** `CurrentSemesterOverview.vue`、`CycleDetailPanel.vue`、`AppraisalManagementView.vue`、`src/router/index.ts` 任何一行（本批次三個 task 皆為新檔案）。
- 前端 TS-only：`<script setup lang="ts">`；禁 `: any`/`as any`；`noUnusedLocals:true`。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`（worktree 同 Batch 1）。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: `appraisal/workspaceSteps.ts` — 三階段常數（純函式）

**Files:**
- Create: `src/views/appraisal/workspaceSteps.ts`
- Test: `src/views/appraisal/__tests__/workspaceSteps.spec.ts`

**Interfaces:**
- Produces：`export type AppraisalStepKey = 'prepare' | 'exceptions' | 'sign'`；`export const APPRAISAL_WORKSPACE_STEPS: AppraisalWorkspaceStep[]`；`export const DEFAULT_APPRAISAL_STEP: AppraisalStepKey`；`export function normalizeAppraisalStep(raw: unknown): AppraisalStepKey`。Task 3 會 import 這四個符號。

- [ ] **Step 1: 寫測試（先紅）**

```ts
import { describe, it, expect } from 'vitest'
import { APPRAISAL_WORKSPACE_STEPS, DEFAULT_APPRAISAL_STEP, normalizeAppraisalStep } from '../workspaceSteps'

describe('appraisal workspaceSteps', () => {
  it('三步驟依序為 準備資料/審查例外/簽核完成', () => {
    expect(APPRAISAL_WORKSPACE_STEPS.map((s) => s.key)).toEqual(['prepare', 'exceptions', 'sign'])
    expect(APPRAISAL_WORKSPACE_STEPS.map((s) => s.label)).toEqual(['準備資料', '審查例外', '簽核完成'])
  })
  it('預設步驟為 prepare', () => {
    expect(DEFAULT_APPRAISAL_STEP).toBe('prepare')
  })
  it('normalizeAppraisalStep 對合法值原樣回傳', () => {
    expect(normalizeAppraisalStep('prepare')).toBe('prepare')
    expect(normalizeAppraisalStep('exceptions')).toBe('exceptions')
    expect(normalizeAppraisalStep('sign')).toBe('sign')
  })
  it('normalizeAppraisalStep 對非法值/undefined/null/number 回傳預設值', () => {
    expect(normalizeAppraisalStep('bogus')).toBe('prepare')
    expect(normalizeAppraisalStep(undefined)).toBe('prepare')
    expect(normalizeAppraisalStep(null)).toBe('prepare')
    expect(normalizeAppraisalStep(123)).toBe('prepare')
  })
})
```

- [ ] **Step 2: 跑測試確認全紅**

Run: `npm run test -- --run src/views/appraisal/__tests__/workspaceSteps.spec.ts`
Expected: FAIL（模組 `../workspaceSteps` 不存在）

- [ ] **Step 3: 寫實作**

```ts
/** 考核工作區左導軌步驟（單一來源，shell 與測試共用）。仿 src/views/yearEnd/workspaceSteps.ts 慣例。 */
export type AppraisalStepKey = 'prepare' | 'exceptions' | 'sign'

export interface AppraisalWorkspaceStep {
  key: AppraisalStepKey
  label: string
  hint: string
}

export const APPRAISAL_WORKSPACE_STEPS: AppraisalWorkspaceStep[] = [
  { key: 'prepare', label: '準備資料', hint: '名冊、資料來源與更新' },
  { key: 'exceptions', label: '審查例外', hint: '缺資料、衝突與人工覆寫' },
  { key: 'sign', label: '簽核完成', hint: '結果預覽與批次簽核' },
]

export const DEFAULT_APPRAISAL_STEP: AppraisalStepKey = 'prepare'

export function normalizeAppraisalStep(raw: unknown): AppraisalStepKey {
  return raw === 'prepare' || raw === 'exceptions' || raw === 'sign' ? raw : DEFAULT_APPRAISAL_STEP
}
```

- [ ] **Step 4: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/__tests__/workspaceSteps.spec.ts`
Expected: PASS（4/4）

- [ ] **Step 5: typecheck + lint**

Run: `npm run lint -- src/views/appraisal/workspaceSteps.ts src/views/appraisal/__tests__/workspaceSteps.spec.ts`
Expected: 0 錯誤。（`npm run typecheck` 在本機為已知環境限制會 OOM——見 Batch 1 ledger；本檔無新型別複雜度，不強制在此機器上取得乾淨 typecheck 輸出，若機器負載較低時能跑過則附上，跑不過不算 blocker。）

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/workspaceSteps.ts src/views/appraisal/__tests__/workspaceSteps.spec.ts
git commit -m "feat(appraisal): 新增考核工作區三階段常數 workspaceSteps

仿 yearEnd/workspaceSteps.ts 慣例；純函式，供 Task 3 工作區 shell 使用（V2 IA Phase 1 Batch 2）。"
```

---

### Task 2: `AppraisalCycleExceptionsSummary.vue` — 審查例外摘要面板

**Files:**
- Create: `src/views/appraisal/components/AppraisalCycleExceptionsSummary.vue`
- Test: `src/views/appraisal/components/__tests__/AppraisalCycleExceptionsSummary.spec.ts`

**現有已驗證的型別與 API（照抄 `src/views/yearEnd/ExceptionCenterView.vue:18-37`，該檔已在用，不重新猜測）：**

```ts
type Severity = 'blocking' | 'warning' | 'info'
interface ExceptionItem {
  type: string
  severity: Severity
  entity_type: string
  entity_id: string
  target_name: string
  reason: string
  impact: string
  suggested_action: string
  deep_link: string
}
interface ExceptionsData {
  cycle_id: number
  generated_at: string
  counts_by_type: Record<string, number>
  items: ExceptionItem[]
}
```

`getAppraisalCycleExceptions(cycleId: number)` 定義於 `src/api/appraisal.ts:154-157`，回傳 `AxiosResp<'/appraisal/cycles/{cycle_id}/exceptions', 'get'>`——`.data` 即上述 `ExceptionsData` 形狀（後端契約與 `ExceptionCenterView.vue` 使用的是同一支端點）。

`exceptionTypeLabel(t: string): string`（`src/constants/appraisalYearEnd.ts:125`）把 `type` 轉中文標籤；`formatTimeTW`（`src/utils/format.ts`，`ExceptionCenterView.vue:8` 已 import）格式化 `generated_at`。

**Interfaces:**
- Consumes：`getAppraisalCycleExceptions`（`@/api/appraisal`）、`exceptionTypeLabel`（`@/constants/appraisalYearEnd`）、`formatTimeTW`（`@/utils/format`）、`TableSkeleton`（`@/components/common/TableSkeleton.vue`，props `columns?/rows?`）、`EmptyState`（`@/components/common/EmptyState.vue`，props `title?/description?`）
- Produces：`defineProps<{ cycleId: number }>()`；`defineExpose({ reload, data, loading, loadError })`——Task 3 不直接呼叫這些 expose（純顯示用途），但保留供未來測試/除錯用，比照 `CalibrationView.vue` 既有慣例。

- [ ] **Step 1: 寫測試（先紅）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import AppraisalCycleExceptionsSummary from '../AppraisalCycleExceptionsSummary.vue'

vi.mock('@/api/appraisal', () => ({
  getAppraisalCycleExceptions: vi.fn(),
}))
import { getAppraisalCycleExceptions } from '@/api/appraisal'

const mockedGet = vi.mocked(getAppraisalCycleExceptions)

function mountPanel(cycleId = 7) {
  return mount(AppraisalCycleExceptionsSummary, {
    props: { cycleId },
    global: { plugins: [ElementPlus] },
  })
}

describe('AppraisalCycleExceptionsSummary', () => {
  beforeEach(() => { mockedGet.mockReset() })

  it('載入中顯示骨架', async () => {
    mockedGet.mockReturnValue(new Promise(() => {})) // 永不 resolve
    const w = mountPanel()
    expect(w.findComponent({ name: 'TableSkeleton' }).exists()).toBe(true)
  })

  it('載入成功且有項目時，依 cycleId 呼叫 API 並渲染每一列', async () => {
    mockedGet.mockResolvedValue({
      data: {
        cycle_id: 7,
        generated_at: '2026-08-16T10:00:00+08:00',
        counts_by_type: { missing_data: 1 },
        items: [{
          type: 'missing_data', severity: 'warning', entity_type: 'employee', entity_id: '12',
          target_name: '林靜宜', reason: '才藝點名 10 月後無紀錄', impact: '±2 分',
          suggested_action: '補點名或人工認定', deep_link: '/appraisal-year-end/appraisal/institution-events',
        }],
      },
    })
    const w = mountPanel(7)
    await flushPromises()
    expect(mockedGet).toHaveBeenCalledWith(7)
    expect(w.text()).toContain('林靜宜')
    expect(w.text()).toContain('補點名或人工認定')
    expect(w.findComponent({ name: 'TableSkeleton' }).exists()).toBe(false)
  })

  it('載入成功但無項目時顯示空狀態，不顯示表格', async () => {
    mockedGet.mockResolvedValue({
      data: { cycle_id: 7, generated_at: '2026-08-16T10:00:00+08:00', counts_by_type: {}, items: [] },
    })
    const w = mountPanel()
    await flushPromises()
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
    expect(w.find('table').exists()).toBe(false)
  })

  it('載入失敗顯示錯誤與重試按鈕，點擊重試會再次呼叫 API', async () => {
    mockedGet.mockRejectedValueOnce(new Error('network'))
    const w = mountPanel()
    await flushPromises()
    const retryBtn = w.find('[data-test="exceptions-summary-retry"]')
    expect(retryBtn.exists()).toBe(true)

    mockedGet.mockResolvedValueOnce({
      data: { cycle_id: 7, generated_at: '2026-08-16T10:00:00+08:00', counts_by_type: {}, items: [] },
    })
    await retryBtn.trigger('click')
    await flushPromises()
    expect(mockedGet).toHaveBeenCalledTimes(2)
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
  })

  it('cycleId 改變時不會自動重新載入（props 變動由父層控制何時重掛，避免隱性重複請求）', async () => {
    mockedGet.mockResolvedValue({
      data: { cycle_id: 7, generated_at: '2026-08-16T10:00:00+08:00', counts_by_type: {}, items: [] },
    })
    const w = mountPanel(7)
    await flushPromises()
    expect(mockedGet).toHaveBeenCalledTimes(1)
    await w.setProps({ cycleId: 8 })
    await flushPromises()
    expect(mockedGet).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 跑測試確認全紅**

Run: `npm run test -- --run src/views/appraisal/components/__tests__/AppraisalCycleExceptionsSummary.spec.ts`
Expected: FAIL（元件檔不存在）

- [ ] **Step 3: 寫實作**

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getAppraisalCycleExceptions } from '@/api/appraisal'
import { exceptionTypeLabel } from '@/constants/appraisalYearEnd'
import { formatTimeTW } from '@/utils/format'
import TableSkeleton from '@/components/common/TableSkeleton.vue'
import EmptyState from '@/components/common/EmptyState.vue'

type Severity = 'blocking' | 'warning' | 'info'
interface ExceptionItem {
  type: string
  severity: Severity
  entity_type: string
  entity_id: string
  target_name: string
  reason: string
  impact: string
  suggested_action: string
  deep_link: string
}
interface ExceptionsData {
  cycle_id: number
  generated_at: string
  counts_by_type: Record<string, number>
  items: ExceptionItem[]
}

const SEVERITY_TAG_TYPE: Record<Severity, 'danger' | 'warning' | 'info'> = {
  blocking: 'danger',
  warning: 'warning',
  info: 'info',
}
const SEVERITY_LABEL: Record<Severity, string> = {
  blocking: '衝突',
  warning: '缺資料',
  info: '提示',
}

const props = defineProps<{ cycleId: number }>()

const data = ref<ExceptionsData | null>(null)
const loading = ref(true)
const loadError = ref(false)

async function reload() {
  loading.value = true
  loadError.value = false
  try {
    const res = await getAppraisalCycleExceptions(props.cycleId)
    data.value = res.data as unknown as ExceptionsData
  } catch {
    loadError.value = true
  } finally {
    loading.value = false
  }
}

onMounted(reload)

defineExpose({ reload, data, loading, loadError })
</script>

<template>
  <div class="ap-exceptions-summary">
    <TableSkeleton v-if="loading" :columns="5" :rows="3" />
    <div v-else-if="loadError" class="ap-exceptions-summary__error">
      載入失敗
      <el-button data-test="exceptions-summary-retry" size="small" text type="primary" @click="reload">重試</el-button>
    </div>
    <EmptyState
      v-else-if="!data || data.items.length === 0"
      title="無待處理例外"
      description="自動計算的人員不需逐筆檢視，可直接前往簽核。"
    />
    <template v-else>
      <p class="ap-exceptions-summary__meta">
        彙整於 {{ formatTimeTW(data.generated_at) }}
      </p>
      <el-table :data="data.items" size="small">
        <el-table-column label="員工" prop="target_name" min-width="120" />
        <el-table-column label="類型" width="110">
          <template #default="{ row }">
            <el-tag :type="SEVERITY_TAG_TYPE[row.severity as Severity]" size="small">
              {{ SEVERITY_LABEL[row.severity as Severity] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="說明" min-width="200">
          <template #default="{ row }">{{ exceptionTypeLabel(row.type) }}：{{ row.reason }}</template>
        </el-table-column>
        <el-table-column label="影響" prop="impact" width="120" />
        <el-table-column label="建議動作" prop="suggested_action" min-width="140" />
      </el-table>
    </template>
  </div>
</template>

<style scoped>
.ap-exceptions-summary__error {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--el-color-danger);
  font-size: var(--text-sm);
}
.ap-exceptions-summary__meta {
  font-size: var(--text-xs, 12px);
  color: var(--el-text-color-secondary);
  margin: 0 0 var(--space-2);
}
</style>
```

- [ ] **Step 4: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/components/__tests__/AppraisalCycleExceptionsSummary.spec.ts`
Expected: PASS（5/5）。若 `el-table`/`el-tag` 在測試環境為 unknown element 導致 `w.text()` 抓不到 slot 內容，比照既有教訓（`el-dialog`/`el-drawer` stub 吞 slot）改用 `mount(..., { global: { plugins: [ElementPlus] } })`（brief 已指定，若仍抓不到內容改用 `w.findAll('td')` 逐格比對，不要放寬斷言成 `toBeTruthy()`）。

- [ ] **Step 5: typecheck + lint**

Run: `npm run lint -- src/views/appraisal/components/AppraisalCycleExceptionsSummary.vue src/views/appraisal/components/__tests__/AppraisalCycleExceptionsSummary.spec.ts`
Expected: 0 錯誤。（typecheck 同 Task 1 備註，OOM 非本檔問題不強制。）

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/components/AppraisalCycleExceptionsSummary.vue src/views/appraisal/components/__tests__/AppraisalCycleExceptionsSummary.spec.ts
git commit -m "feat(appraisal): 新增審查例外摘要面板 AppraisalCycleExceptionsSummary

唯讀，沿用 ExceptionCenterView.vue 已驗證過的 ExceptionItem/ExceptionsData 型別與
getAppraisalCycleExceptions 端點；供 Task 3 工作區 shell 的「審查例外」階段使用
（V2 IA Phase 1 Batch 2）。"
```

---

### Task 3: `AppraisalWorkspaceView.vue` — 工作區 shell（週期選擇器＋三階段導軌）

**Files:**
- Create: `src/views/appraisal/AppraisalWorkspaceView.vue`
- Test: `src/views/appraisal/__tests__/AppraisalWorkspaceView.spec.ts`

**⚠ 本 task 不修改路由，不掛載此元件到任何真實路徑。** 元件必須完全獨立可 mount 測試（不依賴 `router-view` 深度、不依賴父路由 meta）。Task 4（Batch 3，尚未規劃）才會決定實際掛載路徑與舊路徑 redirect。

**依賴的既有元件/API（不得修改，原樣使用）：**
- `listAppraisalCycles(): AxiosResp<'/appraisal/cycles','get'>`（`src/api/appraisal.ts:6-7`）——`.data` 為週期陣列，每筆含 `id: number`、`academic_year: number`、`semester: 'FIRST'|'SECOND'`、`status: 'OPEN'|'LOCKED'|'CLOSED'`（型別參照 `src/views/appraisal/CycleListView.vue:27` 的 `interface Cycle`，本檔比照定義同形狀最小介面，不 import 該檔的私有 interface）。
- `getAppraisalCurrentCycle(): AxiosResp<'/appraisal/current','get'>`（`src/api/appraisal.ts:85-86`，呼叫時不帶 params，即語意上「目前系統認定的 current 週期」）——`.data` 可能為 `null`（尚未建立本學期週期）或同上 `Cycle` 形狀物件，取其 `.id` 判斷「選中的週期是否為目前這個活著的週期」。
- `CycleDetailPanel.vue`（`src/views/appraisal/CycleDetailPanel.vue`）——`defineProps<{ cycleId: number }>()`，必要 prop，`:key` 建議隨 `cycleId` 變動強制重掛（比照 `CycleListView.vue:183-186` 既有寫法 `:key="selectedCycleId"`）。
- `CurrentSemesterOverview.vue`（`src/views/appraisal/CurrentSemesterOverview.vue`）——**無 props**，內部完全靠全域 `useAcademicTermStore()` 驅動，本 task 原樣掛載、不傳任何 prop。
- `AppraisalCycleExceptionsSummary.vue`（Task 2 產物）——`defineProps<{ cycleId: number }>()`。
- 常數：`CYCLE_STATUS_LABEL: Record<string,string>`、`cycleStatusLabel(s: string): string`（`src/constants/appraisalYearEnd.ts:79,122`）。
- Task 1 產物：`APPRAISAL_WORKSPACE_STEPS`、`DEFAULT_APPRAISAL_STEP`、`normalizeAppraisalStep`（`./workspaceSteps`）。

**Interfaces:**
- Consumes：上述全部。
- Produces：路由葉節點元件，無 props/emits；`defineExpose({ selectedCycleId, stage, cycles, currentCycleId })` 供測試操控與未來 Batch 3 銜接時查驗。

- [ ] **Step 1: 寫測試（先紅）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import AppraisalWorkspaceView from '../AppraisalWorkspaceView.vue'

vi.mock('@/api/appraisal', () => ({
  listAppraisalCycles: vi.fn(),
  getAppraisalCurrentCycle: vi.fn(),
  getAppraisalCycleExceptions: vi.fn(),
}))
import { listAppraisalCycles, getAppraisalCurrentCycle, getAppraisalCycleExceptions } from '@/api/appraisal'

const mockedList = vi.mocked(listAppraisalCycles)
const mockedCurrent = vi.mocked(getAppraisalCurrentCycle)
const mockedExceptions = vi.mocked(getAppraisalCycleExceptions)

// CurrentSemesterOverview / CycleDetailPanel 依賴大量其他 API 與 store，
// 本測試只驗證 shell 的組裝與階段切換邏輯，兩個重量級內容元件 stub 掉。
vi.mock('../CurrentSemesterOverview.vue', () => ({ default: { name: 'CurrentSemesterOverview', template: '<div data-test="stub-prepare" />' } }))
vi.mock('../CycleDetailPanel.vue', () => ({
  default: { name: 'CycleDetailPanel', props: ['cycleId'], template: '<div data-test="stub-sign" :data-cycle-id="cycleId" />' },
}))

const CYCLES = [
  { id: 1, academic_year: 114, semester: 'SECOND', status: 'CLOSED' },
  { id: 2, academic_year: 115, semester: 'FIRST', status: 'OPEN' },
]

function router(initialQuery = '') {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/w', component: AppraisalWorkspaceView }, { path: '/', component: { template: '<div/>' } }],
  })
}

async function mountShell(query = '') {
  const r = router()
  await r.push('/w' + query)
  await r.isReady()
  const w = mount(AppraisalWorkspaceView, { global: { plugins: [ElementPlus, r] } })
  await flushPromises()
  return { w, r }
}

describe('AppraisalWorkspaceView', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue({ data: CYCLES })
    mockedCurrent.mockReset().mockResolvedValue({ data: CYCLES[1] })
    mockedExceptions.mockReset().mockResolvedValue({
      data: { cycle_id: 2, generated_at: '2026-08-16T10:00:00+08:00', counts_by_type: {}, items: [] },
    })
  })

  it('預設選中目前 OPEN 的週期，預設階段為準備資料，渲染 CurrentSemesterOverview', async () => {
    const { w } = await mountShell()
    expect((w.vm as any).selectedCycleId).toBe(2)
    expect((w.vm as any).stage).toBe('prepare')
    expect(w.find('[data-test="stub-prepare"]').exists()).toBe(true)
  })

  it('切到簽核完成階段渲染 CycleDetailPanel 並帶正確 cycleId', async () => {
    const { w } = await mountShell('?stage=sign')
    expect(w.find('[data-test="stub-sign"]').attributes('data-cycle-id')).toBe('2')
  })

  it('切到審查例外階段渲染 AppraisalCycleExceptionsSummary 並呼叫例外 API', async () => {
    const { w } = await mountShell('?stage=exceptions')
    expect(mockedExceptions).toHaveBeenCalledWith(2)
    expect(w.findComponent({ name: 'AppraisalCycleExceptionsSummary' }).exists()).toBe(true)
  })

  it('URL 帶 cycle 參數時選中該歷史週期，非目前 OPEN 週期時「準備資料」顯示說明空狀態而非 CurrentSemesterOverview', async () => {
    const { w } = await mountShell('?cycle=1&stage=prepare')
    expect((w.vm as any).selectedCycleId).toBe(1)
    expect(w.find('[data-test="stub-prepare"]').exists()).toBe(false)
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
  })

  it('選中歷史週期時顯示唯讀提示（週期狀態非 OPEN）', async () => {
    const { w } = await mountShell('?cycle=1')
    expect(w.text()).toContain('已完成')
  })

  it('切換週期選擇器會把 cycle 寫回 URL query', async () => {
    const { w, r } = await mountShell()
    await (w.vm as any).selectCycle(1)
    await flushPromises()
    expect(r.currentRoute.value.query.cycle).toBe('1')
  })

  it('切換階段會把 stage 寫回 URL query', async () => {
    const { w, r } = await mountShell()
    await (w.vm as any).selectStage('sign')
    await flushPromises()
    expect(r.currentRoute.value.query.stage).toBe('sign')
  })

  it('無任何週期時顯示空狀態，不呼叫例外/簽核相關渲染', async () => {
    mockedList.mockResolvedValue({ data: [] })
    mockedCurrent.mockResolvedValue({ data: null })
    const { w } = await mountShell()
    expect((w.vm as any).selectedCycleId).toBe(null)
    expect(w.findComponent({ name: 'EmptyState' }).exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認全紅**

Run: `npm run test -- --run src/views/appraisal/__tests__/AppraisalWorkspaceView.spec.ts`
Expected: FAIL（元件檔不存在）

- [ ] **Step 3: 寫實作**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { listAppraisalCycles, getAppraisalCurrentCycle } from '@/api/appraisal'
import { CYCLE_STATUS_LABEL, cycleStatusLabel } from '@/constants/appraisalYearEnd'
import EmptyState from '@/components/common/EmptyState.vue'
import CurrentSemesterOverview from './CurrentSemesterOverview.vue'
import CycleDetailPanel from './CycleDetailPanel.vue'
import AppraisalCycleExceptionsSummary from './components/AppraisalCycleExceptionsSummary.vue'
import { APPRAISAL_WORKSPACE_STEPS, normalizeAppraisalStep, type AppraisalStepKey } from './workspaceSteps'

interface CycleOption { id: number; academic_year: number; semester: string; status: string }

const route = useRoute()
const router = useRouter()

const cycles = ref<CycleOption[]>([])
const currentCycleId = ref<number | null>(null)
const selectedCycleId = ref<number | null>(null)
const loading = ref(true)

const stage = computed<AppraisalStepKey>(() => normalizeAppraisalStep(route.query.stage))

const selectedCycle = computed(() => cycles.value.find((c) => c.id === selectedCycleId.value) ?? null)
const isLiveCurrentCycle = computed(() => selectedCycleId.value != null && selectedCycleId.value === currentCycleId.value)
const cycleLabel = (c: CycleOption) => `${c.academic_year} 學年${c.semester === 'FIRST' ? '上' : '下'}學期`

const cycleOptions = computed(() => cycles.value.map((c) => ({
  value: c.id,
  label: `${cycleLabel(c)}${c.id === currentCycleId.value ? '（進行中）' : ''}`,
})))

function selectCycle(id: number) {
  selectedCycleId.value = id
  router.replace({ query: { ...route.query, cycle: String(id) } })
}
function selectStage(key: AppraisalStepKey) {
  router.replace({ query: { ...route.query, stage: key } })
}

async function load() {
  loading.value = true
  const [listRes, currentRes] = await Promise.all([listAppraisalCycles(), getAppraisalCurrentCycle()])
  cycles.value = (listRes.data as CycleOption[]) ?? []
  currentCycleId.value = (currentRes.data as CycleOption | null)?.id ?? null

  const queryCycle = Number(route.query.cycle)
  if (!Number.isNaN(queryCycle) && cycles.value.some((c) => c.id === queryCycle)) {
    selectedCycleId.value = queryCycle
  } else if (currentCycleId.value != null) {
    selectedCycleId.value = currentCycleId.value
  } else if (cycles.value.length > 0) {
    selectedCycleId.value = cycles.value.reduce((a, b) => (b.academic_year > a.academic_year ? b : a)).id
  } else {
    selectedCycleId.value = null
  }
  loading.value = false
}
onMounted(load)

defineExpose({ selectedCycleId, stage, cycles, currentCycleId, selectCycle, selectStage })
</script>

<template>
  <div class="ap-workspace">
    <EmptyState v-if="!loading && cycles.length === 0" title="尚無考核週期" description="請先建立本學期考核週期。" />
    <template v-else>
      <div class="ap-workspace__head">
        <el-select
          v-if="selectedCycleId != null"
          :model-value="selectedCycleId"
          class="ap-workspace__cycle-select"
          @change="selectCycle"
        >
          <el-option v-for="opt in cycleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
        </el-select>
        <el-tag v-if="selectedCycle" :type="selectedCycle.status === 'OPEN' ? 'success' : 'info'" size="small">
          {{ cycleStatusLabel(selectedCycle.status) }}
        </el-tag>
      </div>

      <div v-if="selectedCycle && selectedCycle.status !== 'OPEN'" class="ap-workspace__readonly">
        此週期已{{ CYCLE_STATUS_LABEL[selectedCycle.status] ?? selectedCycle.status }}，內容為唯讀。
      </div>

      <el-radio-group
        v-if="selectedCycleId != null"
        :model-value="stage"
        class="ap-workspace__stages"
        @change="(v: string) => selectStage(v as AppraisalStepKey)"
      >
        <el-radio-button v-for="s in APPRAISAL_WORKSPACE_STEPS" :key="s.key" :value="s.key">{{ s.label }}</el-radio-button>
      </el-radio-group>

      <div v-if="selectedCycleId != null" class="ap-workspace__body">
        <template v-if="stage === 'prepare'">
          <CurrentSemesterOverview v-if="isLiveCurrentCycle" />
          <EmptyState v-else title="此週期無需準備資料" description="準備資料僅適用於目前進行中的學期；歷史週期請直接查看簽核完成頁。" />
        </template>
        <AppraisalCycleExceptionsSummary v-else-if="stage === 'exceptions'" :cycle-id="selectedCycleId" />
        <CycleDetailPanel v-else :key="selectedCycleId" :cycle-id="selectedCycleId" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.ap-workspace__head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); }
.ap-workspace__cycle-select { width: 220px; }
.ap-workspace__readonly {
  background: var(--el-color-info-light-9);
  color: var(--el-text-color-secondary);
  border-radius: var(--radius-md, 8px);
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  margin-bottom: var(--space-3);
}
.ap-workspace__stages { margin-bottom: var(--space-4); }
</style>
```

- [ ] **Step 4: 跑測試確認全綠**

Run: `npm run test -- --run src/views/appraisal/__tests__/AppraisalWorkspaceView.spec.ts`
Expected: PASS（8/8）。若 `el-radio-group`/`el-select` 的 `@change` 事件在測試環境行為與預期不同，改用 `defineExpose` 出的 `selectCycle`/`selectStage` 直接呼叫驗證（brief 測試已採此法，勿改回模擬 UI 點擊造成 flaky）。

- [ ] **Step 5: typecheck + lint**

Run: `npm run lint -- src/views/appraisal/AppraisalWorkspaceView.vue src/views/appraisal/__tests__/AppraisalWorkspaceView.spec.ts`
Expected: 0 錯誤。（typecheck 同前兩個 task 備註。）

- [ ] **Step 6: Commit**

```bash
git add -- src/views/appraisal/AppraisalWorkspaceView.vue src/views/appraisal/__tests__/AppraisalWorkspaceView.spec.ts
git commit -m "feat(appraisal): 新增考核工作區 shell AppraisalWorkspaceView（尚未接線）

週期選擇器（listAppraisalCycles）+ 三階段導軌，組合既有 CurrentSemesterOverview／
CycleDetailPanel／Task2 例外摘要面板；本 commit 不改路由、不影響任何現有畫面
（V2 IA Phase 1 Batch 2）。路由切換與 7 個既有引用點的 redirect 設計留待 Batch 3。"
```

---

## Self-Review 記錄（plan 撰寫者自查）

1. **Spec coverage**：ux-spec §3.2 三階段（準備資料/審查例外/簽核完成）、學期選擇器（本期＋歷史統一）、唯讀 ribbon 皆有對應 task。本批次刻意不覆蓋「移除進頁 auto-refresh」（屬 Phase 2）、「7 欄簽核表格重製」（`CycleDetailPanel` 內容原樣沿用，欄位重製留待後續，因需要先讀 `ListView.vue`/`KanbanView.vue` 完整欄位定義，範圍夠大值得獨立一批）、「例外表 KPI 過濾卡」（Task 2 只做摘要表格，KPI 卡式過濾與「自動計算正常 N 人」說明卡留待後續 fidelity 批次）——這些缺口已在 Goal 段落與 commit message 明確排除範圍，非遺漏。
2. **Placeholder scan**：三個 task 皆為完整可執行程式碼與精確測試，無 TBD。
3. **Type consistency**：`AppraisalStepKey`／`APPRAISAL_WORKSPACE_STEPS` 命名在 Task 1 定義、Task 3 原樣 import 使用；`ExceptionItem`/`ExceptionsData` 型別在 Task 2 定義（複製自 `ExceptionCenterView.vue` 已驗證形狀）；`CycleOption` 型別 Task 3 獨立定義（最小介面，不 import 其他檔案私有 interface，避免跨檔耦合）。
