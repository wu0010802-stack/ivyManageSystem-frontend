# 考核年終「任務流重構」批次 3：考核流程 ＋ 規則設定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「考核（appraisal）流程」與「規則設定」兩區塊，從「端點按鈕集合」重組為「任務引導流程」，沿用批次 1+2 已落地的視覺與程式 pattern，消除三痛（繁瑣/複雜/擁擠）。

**Architecture:** 純前端（§6 確認批次 3 無新後端端點；後端狀態機、計算引擎、資料模型、API 契約全不動）。考核頁面**結構不合併**（僅加橫向流程引導條，降低風險，對比年終的單一工作區合併）。百分比在**前端 API 邊界**換算（UI 0–100 ↔ API 0–1），後端儲存格式不變。所有工作累積在既有 FE 分支 `feat/appraisal-yearend-taskflow-uiux`（worktree `ivy-frontend/.claude/worktrees/feat-ayx-taskflow`），批次 3 完成後整批走一次 staging 閘門。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + TypeScript strict + Element Plus + Pinia + axios + Vitest（happy-dom）。

## Global Constraints

- 一律繁體中文（UI 文案、commit message、docstring、註解）。
- TS-only：新檔一律 `<script setup lang="ts">`；禁 `: any`/`as any`，用 `: unknown` + narrow 或 `// @ts-expect-error TODO(ts-strict): <reason>`。
- **無新後端端點、不改後端契約**（§6）。只呼叫既有 `src/api/appraisal.ts` / `src/api/config.ts` / `src/api/yearEnd.ts` 匯出函式。
- **百分比邊界換算**：UI 一律 0–100%；送出前 `/ 100` 存 0–1；讀入後 `* 100` 顯示。後端儲存格式（fraction 0–1）不動。
- **權限矩陣測試鐵律**（記憶教訓）：凡權限會影響 render/行為的元件，測試務必用可調 `permState` 矩陣（比照 `src/views/appraisalYearEnd/__tests__/AppraisalYearEndLayout.spec.ts`），**禁**只用單一 `hasPermission: () => true` mock 帶過——否則權限分歧 bug 只有真實矩陣才抓得到。
- **localStorage 命名慣例**：`aye-<scope>-<purpose>`（比照批次 2 `ye-grid-visible-bonus-cols`、`ye-workspace-rail-collapsed`）；讀取一律含白名單過濾 + try/catch 回退（比照 `gridColumns.ts:loadVisibleBonusCols`）。
- **視覺 token 對齊批次 2**：間距 `var(--space-*)`、字級 `var(--text-sm|xs)`、次要色 `var(--text-secondary)`、active 態 `background: var(--el-color-primary-light-9); border-left/bottom: 3px solid var(--el-color-primary)`。禁硬編碼 hex。
- **enum 中文化單一來源**：新 enum 映射往 `src/constants/appraisalYearEnd.ts` 加映射表 + `xxxLabel(s)`（`MAP[key] || key` 慣例，未知回 raw）。
- 每 Task 一個 commit（Conventional Commits）；累積在 `feat/appraisal-yearend-taskflow-uiux`，**不 push**（整批收束時才走 staging 閘門）。
- 針對性 Vitest：`cd ivy-frontend/.claude/worktrees/feat-ayx-taskflow && npx vitest run <path> --no-coverage`（worktree 內 node_modules 為 symlink，見記憶 `feedback_frontend_worktree_node_modules_symlink`）。
- 收束前：FE 三棵測試樹（`src/**` 全綠）＋ `npm run typecheck` ＋ openapi drift check（本批無 BE 變更，drift 應無新增）。

## 已確認的現況事實（實作前必讀，避免重工）

- **`rule_type` 與 `input_field` 已中文化/枚舉化**（批次 1 P2-FE-5）：`RuleEditorDialog.vue` 已有 `RULE_TYPE_OPTIONS`（中文 + 說明 `:260-265`）與 `INPUT_FIELD_OPTIONS` 枚舉下拉。§5.2.3 只剩「補範例」與「TIER/FLAT_THRESHOLD 以外型別自動隱藏 input_field」的小修（Task B8），非從頭做。
- **無 114/160 硬編碼**（grep 確認）：3 建週期入口的 target 預設是 `0`（入口 1/2）或 `null`（入口 3），學年一律來自 store。Task A7 是「統一入口 + 補建議值」，非「移除硬編碼」。
- **26 欄 = 員工欄 + 24 ScoreItemCode + 合計**；docstring 誤寫「14」需一併更正（Task A5/B1）。
- **13 欄手填表員工欄已 `fixed`**；Task A6 只需補「分組表頭」（凍結欄已存在）。
- **`CurrentSemesterOverview.vue` 無元件層 hasPermission 守衛**（動作僅靠路由 gate + 後端）；引導條與統一建週期入口的寫入型動作需自行補權限前置（比照 §權限前置 pattern）。

---

# Phase A — 考核流程（§5.1）

## Task A1: 考核流程步驟定義 + 當前步驟推導純函式

比照年終 `src/views/yearEnd/workspaceSteps.ts`（步驟定義）與 `src/views/appraisalYearEnd/nextStep.ts`（權限旗標入參純函式）建平行檔。此 Task 純邏輯，無 UI。

**Files:**
- Create: `src/views/appraisal/appraisalSteps.ts`
- Test: `src/views/appraisal/__tests__/appraisalSteps.spec.ts`

**Interfaces:**
- Produces:
  - `type AppraisalStepKey = 'create' | 'participants' | 'manual' | 'sync' | 'recompute' | 'sign'`
  - `interface AppraisalStep { key: AppraisalStepKey; label: string; hint: string }`
  - `const APPRAISAL_STEPS: AppraisalStep[]`（6 步，固定順序）
  - `interface AppraisalStepInput { hasCycle: boolean; cycleStatus: 'OPEN' | 'LOCKED' | 'CLOSED' | null; participantCount: number; hasNonParticipant: boolean; summaryCount: number; pendingSignCount: number; finalizedCount: number; totalCount: number }`
  - `type AppraisalStepStatus = 'done' | 'current' | 'todo' | 'disabled'`
  - `function deriveAppraisalStepStatuses(input: AppraisalStepInput): Record<AppraisalStepKey, AppraisalStepStatus>`
  - `function deriveCurrentAppraisalStep(input: AppraisalStepInput): AppraisalStepKey`（回傳唯一「你在這」步驟，供高亮）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/views/appraisal/__tests__/appraisalSteps.spec.ts
import { describe, it, expect } from 'vitest'
import {
  APPRAISAL_STEPS,
  deriveAppraisalStepStatuses,
  deriveCurrentAppraisalStep,
  type AppraisalStepInput,
} from '../appraisalSteps'

const base: AppraisalStepInput = {
  hasCycle: false, cycleStatus: null, participantCount: 0, hasNonParticipant: false,
  summaryCount: 0, pendingSignCount: 0, finalizedCount: 0, totalCount: 0,
}

describe('APPRAISAL_STEPS', () => {
  it('六步固定順序', () => {
    expect(APPRAISAL_STEPS.map(s => s.key)).toEqual(
      ['create', 'participants', 'manual', 'sync', 'recompute', 'sign'],
    )
  })
})

describe('deriveAppraisalStepStatuses', () => {
  it('無週期時只有 create 是 current，其餘 disabled', () => {
    const s = deriveAppraisalStepStatuses(base)
    expect(s.create).toBe('current')
    expect(s.participants).toBe('disabled')
    expect(s.sign).toBe('disabled')
  })

  it('有週期無成員時 create=done、participants=current', () => {
    const s = deriveAppraisalStepStatuses({
      ...base, hasCycle: true, cycleStatus: 'OPEN', participantCount: 0, hasNonParticipant: true,
    })
    expect(s.create).toBe('done')
    expect(s.participants).toBe('current')
  })

  it('成員齊全後 participants=done、manual 可進行', () => {
    const s = deriveAppraisalStepStatuses({
      ...base, hasCycle: true, cycleStatus: 'OPEN', participantCount: 10, hasNonParticipant: false,
    })
    expect(s.participants).toBe('done')
    expect(s.manual).not.toBe('disabled')
  })

  it('全員定稿後 sign=done', () => {
    const s = deriveAppraisalStepStatuses({
      ...base, hasCycle: true, cycleStatus: 'CLOSED', participantCount: 10, hasNonParticipant: false,
      summaryCount: 10, pendingSignCount: 0, finalizedCount: 10, totalCount: 10,
    })
    expect(s.sign).toBe('done')
  })
})

describe('deriveCurrentAppraisalStep', () => {
  it('無週期→create', () => {
    expect(deriveCurrentAppraisalStep(base)).toBe('create')
  })
  it('有成員未同步→sign 前的第一個未完成步驟', () => {
    const cur = deriveCurrentAppraisalStep({
      ...base, hasCycle: true, cycleStatus: 'OPEN', participantCount: 10, hasNonParticipant: false,
      summaryCount: 0,
    })
    expect(['manual', 'sync', 'recompute']).toContain(cur)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/appraisalSteps.spec.ts --no-coverage`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作**

```ts
// src/views/appraisal/appraisalSteps.ts
export type AppraisalStepKey = 'create' | 'participants' | 'manual' | 'sync' | 'recompute' | 'sign'

export interface AppraisalStep {
  key: AppraisalStepKey
  label: string
  hint: string
}

// 固定順序，比照 year-end workspaceSteps.ts 的視覺語言（此為橫向引導條）
export const APPRAISAL_STEPS: AppraisalStep[] = [
  { key: 'create', label: '建立週期', hint: '選定學年學期，開啟本期考核' },
  { key: 'participants', label: '加入教師', hint: '把所有在職教師加入考核' },
  { key: 'manual', label: '手填事件', hint: '填寫會議、活動等人工次數' },
  { key: 'sync', label: '同步分數', hint: '把出缺勤與活動資料同步為分數' },
  { key: 'recompute', label: '重算彙整', hint: '重新計算每人考核總分與等第' },
  { key: 'sign', label: '簽核核定', hint: '主管與會計逐關簽核並核定' },
]

export interface AppraisalStepInput {
  hasCycle: boolean
  cycleStatus: 'OPEN' | 'LOCKED' | 'CLOSED' | null
  participantCount: number
  hasNonParticipant: boolean
  summaryCount: number
  pendingSignCount: number
  finalizedCount: number
  totalCount: number
}

export type AppraisalStepStatus = 'done' | 'current' | 'todo' | 'disabled'

/**
 * 輕量 checklist 狀態推導（非強制精靈）。因批次 3 無新後端 progress 端點，
 * 完成訊號取自當期總覽既有資料：cycle 存在、成員數、非成員旗標、彙整數、簽核統計。
 * 手填為選配資料輸入，一旦成員齊全即「可進行」，無硬完成判定（不 disabled、不強制 done）。
 */
export function deriveAppraisalStepStatuses(
  input: AppraisalStepInput,
): Record<AppraisalStepKey, AppraisalStepStatus> {
  const {
    hasCycle, participantCount, hasNonParticipant,
    summaryCount, pendingSignCount, finalizedCount, totalCount,
  } = input

  const createDone = hasCycle
  const participantsDone = hasCycle && participantCount > 0 && !hasNonParticipant
  const synced = summaryCount > 0
  const allFinalized = totalCount > 0 && finalizedCount === totalCount && pendingSignCount === 0

  const status: Record<AppraisalStepKey, AppraisalStepStatus> = {
    create: createDone ? 'done' : 'current',
    participants: !hasCycle ? 'disabled' : participantsDone ? 'done' : 'current',
    manual: !participantsDone ? 'disabled' : 'todo',
    sync: !participantsDone ? 'disabled' : synced ? 'done' : 'todo',
    recompute: !synced ? 'disabled' : 'todo',
    sign: !synced ? 'disabled' : allFinalized ? 'done' : 'todo',
  }

  // 唯一 current 高亮：第一個非 done 且非 disabled 的步驟
  const current = deriveCurrentAppraisalStep(input)
  for (const step of APPRAISAL_STEPS) {
    if (status[step.key] === 'todo' && step.key === current) status[step.key] = 'current'
  }
  return status
}

export function deriveCurrentAppraisalStep(input: AppraisalStepInput): AppraisalStepKey {
  const { hasCycle, participantCount, hasNonParticipant, summaryCount, finalizedCount, totalCount, pendingSignCount } = input
  if (!hasCycle) return 'create'
  if (participantCount === 0 || hasNonParticipant) return 'participants'
  if (summaryCount === 0) return 'sync'
  if (!(totalCount > 0 && finalizedCount === totalCount && pendingSignCount === 0)) return 'sign'
  return 'sign'
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/appraisalSteps.spec.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/appraisalSteps.ts src/views/appraisal/__tests__/appraisalSteps.spec.ts
git commit -m "feat(appraisal): 考核流程步驟定義與當前步驟推導純函式"
```

---

## Task A2: 橫向流程引導條元件 `AppraisalProcessGuide.vue`

比照年終 `YearEndWorkspaceView.vue:134-172` 的 `ye-rail` 視覺（改為**橫向**），吃 Task A1 的步驟狀態；點擊 emit `navigate(stepKey)` 由父層處理跨頁跳轉。

**Files:**
- Create: `src/views/appraisal/components/AppraisalProcessGuide.vue`
- Test: `src/views/appraisal/__tests__/AppraisalProcessGuide.spec.ts`

**Interfaces:**
- Consumes: `APPRAISAL_STEPS`, `AppraisalStepKey`, `AppraisalStepStatus`（Task A1）
- Props: `statuses: Record<AppraisalStepKey, AppraisalStepStatus>`、`current: AppraisalStepKey`
- Emits: `navigate: (key: AppraisalStepKey) => void`
- Produces: 每步 `<button :data-test="`guide-step-${key}`">`；`disabled` 態不可點。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/views/appraisal/__tests__/AppraisalProcessGuide.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppraisalProcessGuide from '../components/AppraisalProcessGuide.vue'

const statuses = {
  create: 'done', participants: 'done', manual: 'current',
  sync: 'todo', recompute: 'disabled', sign: 'disabled',
} as const

describe('AppraisalProcessGuide', () => {
  it('渲染六步且標示 current/done/disabled', () => {
    const w = mount(AppraisalProcessGuide, { props: { statuses, current: 'manual' } })
    expect(w.find('[data-test="guide-step-create"]').classes()).toContain('is-done')
    expect(w.find('[data-test="guide-step-manual"]').classes()).toContain('is-current')
    expect(w.find('[data-test="guide-step-recompute"]').attributes('disabled')).toBeDefined()
  })

  it('點可用步驟 emit navigate；點 disabled 不 emit', async () => {
    const w = mount(AppraisalProcessGuide, { props: { statuses, current: 'manual' } })
    await w.find('[data-test="guide-step-sync"]').trigger('click')
    expect(w.emitted('navigate')?.[0]).toEqual(['sync'])
    await w.find('[data-test="guide-step-recompute"]').trigger('click')
    // disabled 步驟不得再 emit
    expect(w.emitted('navigate')?.length).toBe(1)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/AppraisalProcessGuide.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

```vue
<!-- src/views/appraisal/components/AppraisalProcessGuide.vue -->
<script setup lang="ts">
import { APPRAISAL_STEPS, type AppraisalStepKey, type AppraisalStepStatus } from '../appraisalSteps'

const props = defineProps<{
  statuses: Record<AppraisalStepKey, AppraisalStepStatus>
  current: AppraisalStepKey
}>()
const emit = defineEmits<{ navigate: [key: AppraisalStepKey] }>()

function onClick(key: AppraisalStepKey) {
  if (props.statuses[key] === 'disabled') return
  emit('navigate', key)
}
</script>

<template>
  <nav class="ap-guide" aria-label="考核流程">
    <button
      v-for="(s, i) in APPRAISAL_STEPS"
      :key="s.key"
      class="ap-guide__step"
      :class="{
        'is-done': statuses[s.key] === 'done',
        'is-current': statuses[s.key] === 'current',
        'is-disabled': statuses[s.key] === 'disabled',
      }"
      :data-test="`guide-step-${s.key}`"
      :disabled="statuses[s.key] === 'disabled'"
      :title="s.hint"
      @click="onClick(s.key)"
    >
      <span class="ap-guide__idx">{{ statuses[s.key] === 'done' ? '✓' : i + 1 }}</span>
      <span class="ap-guide__label">{{ s.label }}</span>
    </button>
  </nav>
</template>

<style scoped>
.ap-guide {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs, 8px);
  align-items: stretch;
  padding: var(--space-sm, 12px);
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
}
.ap-guide__step {
  display: flex;
  align-items: center;
  gap: var(--space-xs, 8px);
  padding: var(--space-xs, 8px) var(--space-sm, 12px);
  border: 1px solid var(--el-border-color-lighter);
  border-bottom: 3px solid transparent;
  border-radius: 6px;
  background: var(--el-bg-color);
  color: var(--text-secondary, var(--el-text-color-regular));
  font-size: var(--text-sm, 14px);
  cursor: pointer;
}
.ap-guide__step.is-current {
  background: var(--el-color-primary-light-9);
  border-bottom-color: var(--el-color-primary);
  color: var(--el-color-primary);
  font-weight: 600;
}
.ap-guide__step.is-done { color: var(--el-color-success); }
.ap-guide__step.is-disabled { opacity: 0.5; cursor: not-allowed; }
.ap-guide__idx {
  display: inline-flex; align-items: center; justify-content: center;
  width: 20px; height: 20px; border-radius: 50%;
  background: var(--el-fill-color); font-size: var(--text-xs, 12px);
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/AppraisalProcessGuide.spec.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/components/AppraisalProcessGuide.vue src/views/appraisal/__tests__/AppraisalProcessGuide.spec.ts
git commit -m "feat(appraisal): 橫向流程引導條元件"
```

---

## Task A3: 引導條接入 `CurrentSemesterOverview` + 跨頁跳轉

把 Task A2 引導條掛在當期總覽頂部；用當期既有資料組 `AppraisalStepInput`；`navigate` 事件依步驟導向對應動作/路由（同頁動作＝滾動/開 dialog；`sign` 步驟＝跳 `/appraisal-year-end/appraisal/history`）。

**Files:**
- Modify: `src/views/appraisal/CurrentSemesterOverview.vue`（引導條掛載於頁首 PageHeader 下；`buildStepInput` computed；`onGuideNavigate` handler）
- Test: `src/views/appraisal/__tests__/CurrentSemesterOverview.guide.spec.ts`（新測試檔，避免與既有大測試檔衝突）

**Interfaces:**
- Consumes: `deriveAppraisalStepStatuses`, `deriveCurrentAppraisalStep`, `AppraisalProcessGuide`
- 既有資料來源（現況地圖）：`currentCycle`（含 `id`/`status`）、`hasNonParticipant`（已 computed）、`participants`/all-employees-status 數量、`getSignStatusSummary` 回傳（pending/finalized/total）。若某統計尚未載入，`buildStepInput` 用保守值（`summaryCount:0` 等）使引導條顯示早期步驟，不得誤判 done。

- [ ] **Step 1: 寫失敗測試**（掛載 + navigate 行為）

```ts
// src/views/appraisal/__tests__/CurrentSemesterOverview.guide.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))
// 依現況地圖 mock @/api/apprailsal 的當期/同步/簽核統計函式（實作時對齊實際 import）
vi.mock('@/api/appraisal', () => ({
  getAppraisalCurrentCycle: vi.fn(async () => ({ data: { id: 1, status: 'OPEN', academic_year: 114, semester: 'FIRST' } })),
  getAppraisalAllEmployeesStatus: vi.fn(async () => ({ data: { participants: [], non_participants: [{ id: 9 }] } })),
  getSignStatusSummary: vi.fn(async () => ({ data: { pending: 0, finalized: 0, total: 0 } })),
  refreshAppraisalCycle: vi.fn(async () => ({ data: {} })),
  previewAppraisalScore: vi.fn(),
  syncAppraisalScoreItems: vi.fn(),
}))

import CurrentSemesterOverview from '../CurrentSemesterOverview.vue'

describe('CurrentSemesterOverview 引導條', () => {
  beforeEach(() => pushMock.mockClear())

  it('有非成員時引導條高亮 participants，且點 sign(disabled) 不跳轉', async () => {
    const w = mount(CurrentSemesterOverview, { global: { stubs: { teleport: true } } })
    await flushPromises()
    const guide = w.findComponent({ name: 'AppraisalProcessGuide' })
    expect(guide.exists()).toBe(true)
    expect(guide.props('current')).toBe('participants')
  })
})
```

> 註：此測試依賴當期總覽的真實 mock 形狀，實作 subagent 需先讀 `CurrentSemesterOverview.vue` 現有 import 與 api mock 慣例（參考既有 `CurrentSemesterOverview` 測試檔），對齊 mock 後再補斷言。若既有大測試檔已 mock 這些 api，可改在該檔新增 describe 區塊而非新檔。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/CurrentSemesterOverview.guide.spec.ts --no-coverage`
Expected: FAIL（引導條未掛載）

- [ ] **Step 3: 實作**

在 `CurrentSemesterOverview.vue`：
1. import `AppraisalProcessGuide`、`deriveAppraisalStepStatuses`、`deriveCurrentAppraisalStep`、`type AppraisalStepKey`。
2. 加 computed `stepInput`（組 `AppraisalStepInput`，取值自現有 `currentCycle` / `hasNonParticipant` / 成員數 / 簽核統計 ref；未載入時保守 0）。
3. 加 computed `stepStatuses = deriveAppraisalStepStatuses(stepInput.value)`、`currentStep = deriveCurrentAppraisalStep(stepInput.value)`。
4. `onGuideNavigate(key)`：
   - `create` → 開建週期 dialog（Task A7 的 `CreateCycleDialog`；在 A7 前先 fallback 呼叫既有 `createCurrentCycle` 觸發點）。
   - `participants` → 觸發既有「一鍵加入」流程或滾動到成員區。
   - `manual` → 展開手填 `el-collapse` 並滾動。
   - `sync` → 開統一同步 dialog（Task A4）。
   - `recompute` → 呼叫既有 refresh/recompute。
   - `sign` → `router.push('/appraisal-year-end/appraisal/history')`。
5. template：`<AppraisalProcessGuide :statuses="stepStatuses" :current="currentStep" @navigate="onGuideNavigate" />` 置於 PageHeader 之下、KPI 之上。

- [ ] **Step 4: 跑測試確認通過**（含既有 CurrentSemesterOverview 測試不回歸）

Run: `npx vitest run src/views/appraisal/__tests__/ --no-coverage`
Expected: PASS（新測試 + 既有全綠）

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/CurrentSemesterOverview.vue src/views/appraisal/__tests__/CurrentSemesterOverview.guide.spec.ts
git commit -m "feat(appraisal): 當期總覽接入橫向流程引導條與跨頁跳轉"
```

---

## Task A4: 合併雙重預覽為單一「分數同步」dialog

把「預覽分數」（`score_preview` 26 欄矩陣，唯讀）與「同步分數」（`sync_score_items` dry-run→確認寫入）合併為單一 dialog：一個 dialog 內同時呈現 26 欄計算矩陣 + 同步差異摘要，底部單一「確認寫入」（`hasPermission` 寫入權限才顯示；`hasNonParticipant` 時 disabled + tooltip）。移除兩顆按鈕跳轉的分離流程。

**Files:**
- Modify: `src/views/appraisal/components/ScorePreviewDialog.vue` → 重構為統一 dialog（保留檔名，內部改為含同步區 + 確認寫入 footer）
- Modify: `src/views/appraisal/CurrentSemesterOverview.vue`（toolbar 兩顆按鈕 → 一顆「預覽並同步分數」；移除 `openSyncPreview`/`confirmSync` 分離 dialog；`ScorePreviewDialog` footer 的 `request-sync` emit 移除）
- Test: `src/views/appraisal/__tests__/ScorePreviewDialog.spec.ts`（擴充既有；若無則新建）

**Interfaces:**
- Consumes（既有 api，現況地圖 §3）：`previewAppraisalScore(cycleId)` → `{ participants: [...] }`；`syncAppraisalScoreItems(cycleId, { dryRun })` → `{ deleted_count, inserted_count, skipped_manual_count, items: [...] }`
- Props（統一後）：`visible: boolean`、`cycleId: number`、`canWrite: boolean`、`hasNonParticipant: boolean`
- Emits：`update:visible`、`synced`（寫入成功後父層 refresh）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/views/appraisal/__tests__/ScorePreviewDialog.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const previewMock = vi.fn(async () => ({ data: { participants: [] } }))
const syncMock = vi.fn(async () => ({ data: { deleted_count: 1, inserted_count: 2, skipped_manual_count: 0, items: [] } }))
vi.mock('@/api/appraisal', () => ({
  previewAppraisalScore: (...a: unknown[]) => previewMock(...a),
  syncAppraisalScoreItems: (...a: unknown[]) => syncMock(...a),
}))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: vi.fn(async () => true) } }))

import ScorePreviewDialog from '../components/ScorePreviewDialog.vue'

describe('統一分數同步 dialog', () => {
  beforeEach(() => { previewMock.mockClear(); syncMock.mockClear() })

  it('開啟即載入 26 欄預覽與同步差異摘要', async () => {
    mount(ScorePreviewDialog, { props: { visible: true, cycleId: 1, canWrite: true, hasNonParticipant: false }, global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(previewMock).toHaveBeenCalledWith(1)
    expect(syncMock).toHaveBeenCalledWith(1, { dryRun: true })
  })

  it('無寫入權限不顯示確認寫入', async () => {
    const w = mount(ScorePreviewDialog, { props: { visible: true, cycleId: 1, canWrite: false, hasNonParticipant: false }, global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(w.find('[data-test="confirm-sync-btn"]').exists()).toBe(false)
  })

  it('有非成員時確認寫入 disabled', async () => {
    const w = mount(ScorePreviewDialog, { props: { visible: true, cycleId: 1, canWrite: true, hasNonParticipant: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(w.find('[data-test="confirm-sync-btn"]').attributes('disabled')).toBeDefined()
  })

  it('確認寫入呼叫 dry_run=false 並 emit synced', async () => {
    const w = mount(ScorePreviewDialog, { props: { visible: true, cycleId: 1, canWrite: true, hasNonParticipant: false }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await w.find('[data-test="confirm-sync-btn"]').trigger('click')
    await flushPromises()
    expect(syncMock).toHaveBeenCalledWith(1, { dryRun: false })
    expect(w.emitted('synced')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/ScorePreviewDialog.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

`ScorePreviewDialog.vue` 重構要點：
1. 新 props `canWrite`/`hasNonParticipant`；移除舊 `request-sync` emit，新增 `synced` emit。
2. `onOpen`（watch `visible` → true）：`Promise.all([loadPreview(), loadSyncDryRun()])`。`loadPreview` = `previewAppraisalScore(cycleId)`；`loadSyncDryRun` = `syncAppraisalScoreItems(cycleId, { dryRun: true })`。各自 try/catch 降級（失敗顯 el-alert 不 fail-open）。
3. Body 上方加同步差異摘要 banner：「本次同步將寫入 {{ dry.inserted_count }} 筆、移除 {{ dry.deleted_count }} 筆、保留手動 {{ dry.skipped_manual_count }} 筆」。下方保留既有 26 欄 `el-table`（Task A5 再加欄位開關）。
4. Footer：
   ```vue
   <el-tooltip content="請先把所有教師加入考核再同步" :disabled="!hasNonParticipant">
     <span>
       <el-button
         v-if="canWrite"
         data-test="confirm-sync-btn"
         type="primary"
         :disabled="hasNonParticipant"
         :loading="writing"
         @click="confirmSync"
       >確認寫入</el-button>
     </span>
   </el-tooltip>
   ```
5. `confirmSync`：`ElMessageBox.confirm('確認把預覽的分數同步寫入？此動作會覆寫自動計算欄位。')` → `syncAppraisalScoreItems(cycleId, { dryRun: false })` → 成功 `ElMessage.success` + `emit('synced')` + 關 dialog。

`CurrentSemesterOverview.vue`：
1. toolbar 移除「同步分數」按鈕與 `openSyncPreview`/`confirmSync`/`syncPreview` dialog（現況地圖 §3 :353/:369/:728-775）。
2. 「預覽分數」按鈕改文案「預覽並同步分數」，開統一 dialog，傳 `:can-write="canSyncWrite"`（`hasPermission('APPRAISAL_EVENT_WRITE')`）`:has-non-participant="hasNonParticipant"`；監聽 `@synced="refreshAll"`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/ScorePreviewDialog.spec.ts src/views/appraisal/__tests__/ --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/components/ScorePreviewDialog.vue src/views/appraisal/CurrentSemesterOverview.vue src/views/appraisal/__tests__/ScorePreviewDialog.spec.ts
git commit -m "feat(appraisal): 合併預覽分數與同步分數為單一分數同步 dialog"
```

---

## Task A5: 26 欄分數預覽欄位開關（預設只顯示有異動欄）

比照批次 2b-1 `gridColumns.ts` + GridView chips pattern。預設可見欄 = 該欄任一列有異動（`current_db_value !== delta` 或非零）；使用者可經 chips 增減；覆寫存 localStorage。員工欄與合計欄恆顯示。

**Files:**
- Create: `src/views/appraisal/scorePreviewColumns.ts`
- Modify: `src/views/appraisal/components/ScorePreviewDialog.vue`（chips + 依可見集過濾欄）
- Modify: `src/views/appraisal/scoreItemLabels.ts`（更正 docstring「14」→「24」）
- Test: `src/views/appraisal/__tests__/scorePreviewColumns.spec.ts`

**Interfaces:**
- Produces:
  - `const SCORE_COL_LS_KEY = 'aye-score-preview-visible-cols'`
  - `function loadVisibleScoreColOverride(): Set<string> | null`（null＝使用者未曾覆寫，走「有異動欄」預設）
  - `function saveVisibleScoreColOverride(cols: Set<string>): void`
  - `function computeChangedColumns(participants: ScorePreviewParticipant[]): Set<string>`（回傳有異動的 item_code 集合）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/views/appraisal/__tests__/scorePreviewColumns.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SCORE_COL_LS_KEY,
  loadVisibleScoreColOverride,
  saveVisibleScoreColOverride,
  computeChangedColumns,
} from '../scorePreviewColumns'

describe('scorePreviewColumns', () => {
  beforeEach(() => localStorage.clear())

  it('未覆寫時 loadVisibleScoreColOverride 回 null', () => {
    expect(loadVisibleScoreColOverride()).toBeNull()
  })

  it('存讀往返一致 + 白名單過濾髒資料', () => {
    saveVisibleScoreColOverride(new Set(['LATE_EARLY', 'BOGUS']))
    localStorage.setItem(SCORE_COL_LS_KEY, JSON.stringify(['LATE_EARLY', 'BOGUS', 123]))
    const loaded = loadVisibleScoreColOverride()
    expect(loaded?.has('LATE_EARLY')).toBe(true)
    expect(loaded?.has('BOGUS')).toBe(false) // 非合法 item_code 濾除
  })

  it('computeChangedColumns 只回有異動的欄', () => {
    const changed = computeChangedColumns([
      { participant_id: 1, employee_name: 'A', items: [
        { item_code: 'LATE_EARLY', delta: -2, current_db_value: 0 },
        { item_code: 'RETENTION', delta: 0, current_db_value: 0 },
      ] },
    ] as never)
    expect(changed.has('LATE_EARLY')).toBe(true)
    expect(changed.has('RETENTION')).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/scorePreviewColumns.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

```ts
// src/views/appraisal/scorePreviewColumns.ts
import { ITEM_CODE_LABELS } from './scoreItemLabels'

export const SCORE_COL_LS_KEY = 'aye-score-preview-visible-cols'

const VALID_CODES = new Set(Object.keys(ITEM_CODE_LABELS))

export interface ScorePreviewItem { item_code: string; delta: number; current_db_value: number }
export interface ScorePreviewParticipant { participant_id: number; employee_name: string; items: ScorePreviewItem[] }

export function loadVisibleScoreColOverride(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SCORE_COL_LS_KEY)
    if (raw == null) return null
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return null
    return new Set(arr.filter((k): k is string => typeof k === 'string' && VALID_CODES.has(k)))
  } catch {
    return null
  }
}

export function saveVisibleScoreColOverride(cols: Set<string>): void {
  localStorage.setItem(SCORE_COL_LS_KEY, JSON.stringify([...cols]))
}

export function computeChangedColumns(participants: ScorePreviewParticipant[]): Set<string> {
  const changed = new Set<string>()
  for (const p of participants) {
    for (const it of p.items) {
      if (it.delta !== it.current_db_value || it.delta !== 0) changed.add(it.item_code)
    }
  }
  return changed
}
```

`ScorePreviewDialog.vue`：
1. `visibleCols = ref<Set<string>>(...)`：`onOpen` 載入 preview 後，`const override = loadVisibleScoreColOverride(); visibleCols.value = override ?? computeChangedColumns(participants)`。
2. chips（比照 GridView `:329-341`）：`<el-tag v-for="code in ITEM_CODES_ORDER" :type="visibleCols.has(code)?'primary':'info'" :effect="visibleCols.has(code)?'dark':'plain'" @click="toggleCol(code)">{{ ITEM_CODE_LABELS[code] }}</el-tag>`。`toggleCol` 複製 Set→add/delete→賦值→`saveVisibleScoreColOverride`。
3. 24 欄 `el-table-column` 改 `v-for="code in ITEM_CODES_ORDER" v-if="visibleCols.has(code)"`（員工欄、合計欄不受控恆顯示）。
4. `scoreItemLabels.ts` docstring「14」改「24」。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/scorePreviewColumns.spec.ts src/views/appraisal/__tests__/ScorePreviewDialog.spec.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/scorePreviewColumns.ts src/views/appraisal/components/ScorePreviewDialog.vue src/views/appraisal/scoreItemLabels.ts src/views/appraisal/__tests__/scorePreviewColumns.spec.ts
git commit -m "feat(appraisal): 26 欄分數預覽加欄位開關與有異動欄預設"
```

---

## Task A6: 13 欄手填表分組表頭（凍結欄已存在）

員工欄已 `fixed`；此 Task 只加「分組表頭」：把 11 個手填欄依性質分組（會議類 / 活動異動類 / 分值類），用 `el-table-column` 巢狀 label 生 group header。保留既有鍵盤導航（`useGridKeyboardNav`）與「沿用上一週期」。

**Files:**
- Modify: `src/views/appraisal/components/ManualEventEntrySection.vue`
- Create: `src/views/appraisal/manualColumnGroups.ts`（分組 map，單一來源）
- Test: `src/views/appraisal/__tests__/manualColumnGroups.spec.ts`

**Interfaces:**
- Consumes（現況地圖 §5）：`MANUAL_ITEM_CODES`（11 碼，`composables/useManualEventEntry.ts:12`）、`MANUAL_LABEL`
- Produces:
  - `interface ManualColumnGroup { label: string; codes: string[] }`
  - `const MANUAL_COLUMN_GROUPS: ManualColumnGroup[]`（涵蓋全部 11 碼，每碼恰屬一組）
  - `function assertGroupsCoverAllCodes(codes: string[]): void`（完整性守衛，供測試）

- [ ] **Step 1: 寫失敗測試（完整性守衛）**

```ts
// src/views/appraisal/__tests__/manualColumnGroups.spec.ts
import { describe, it, expect } from 'vitest'
import { MANUAL_COLUMN_GROUPS } from '../manualColumnGroups'
import { MANUAL_ITEM_CODES } from '../composables/useManualEventEntry'

describe('MANUAL_COLUMN_GROUPS', () => {
  it('分組涵蓋全部 11 碼且無重複', () => {
    const grouped = MANUAL_COLUMN_GROUPS.flatMap(g => g.codes)
    expect(new Set(grouped).size).toBe(grouped.length) // 無重複
    expect([...grouped].sort()).toEqual([...MANUAL_ITEM_CODES].sort()) // 完整涵蓋
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/manualColumnGroups.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

先讀 `composables/useManualEventEntry.ts` 確認 11 碼確切字串，再據此填 `MANUAL_COLUMN_GROUPS`（下為依現況地圖語意的分組骨架，實作時以實際 code 常數為準）：

```ts
// src/views/appraisal/manualColumnGroups.ts
export interface ManualColumnGroup { label: string; codes: string[] }

// 依性質分組；codes 必須用 useManualEventEntry 的實際 MANUAL_ITEM_CODES 字串
export const MANUAL_COLUMN_GROUPS: ManualColumnGroup[] = [
  { label: '會議', codes: ['SCHOOL_MEETING', 'INSTITUTION_MEETING_9_13', 'INSTITUTION_MEETING_11_15'] },
  { label: '活動與異動', codes: ['SELF_STRENGTHEN', 'SUSPENSION', 'CLASS_TRANSFER'] },
  { label: '分值', codes: ['ASSESSMENT_SCORE', 'RECRUIT_BONUS', 'SUPERVISOR_BONUS', 'REPORT_EXCELLENCE', 'OTHER'] },
]
```

`ManualEventEntrySection.vue`：把平鋪 `<el-table-column v-for="code in ITEM_CODES">` 改為外層 group column 巢狀：
```vue
<el-table-column v-for="g in MANUAL_COLUMN_GROUPS" :key="g.label" :label="g.label" align="center">
  <el-table-column
    v-for="code in g.codes" :key="code"
    :label="MANUAL_LABEL[code]" width="110"
  >
    <template #default="{ row, $index }"><!-- 既有 el-input-number 儲存格內容原樣搬入 --></template>
  </el-table-column>
</el-table-column>
```
> 注意：`data-grid-row`/`data-grid-col` 屬性與 `useGridKeyboardNav` 綁定須原樣保留在內層儲存格；巢狀不改鍵盤導航容器選擇器。員工欄與角色欄維持在 group 之外（員工欄 `fixed`）。

- [ ] **Step 4: 跑測試確認通過 + 手填表既有測試不回歸**

Run: `npx vitest run src/views/appraisal/__tests__/manualColumnGroups.spec.ts src/views/appraisal/__tests__/ManualEventEntrySection.spec.* --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/manualColumnGroups.ts src/views/appraisal/components/ManualEventEntrySection.vue src/views/appraisal/__tests__/manualColumnGroups.spec.ts
git commit -m "feat(appraisal): 13 欄手填表加分組表頭"
```

---

## Task A7: 統一建週期入口（單一 `CreateCycleDialog`，不預帶建議值）

3 個入口收斂到同一 dialog：完整表單（學年/學期自動帶當前值、招生目標**手動留空**、實際註冊）。3 處觸發點都改開此 dialog。建立後導向引導條下一步。

> **決策記錄（使用者 2026-07-21 裁定）**：spec §5.1.3 原文「招生目標預設帶班級編制推導建議值」。因 §6 明列批次 3 無新後端端點、班級編制推導需跨模組資料，且業主本就「手動設定」目標，本 Task **不做任何建議值預帶**——目標欄預設留空由使用者手動填。班級編制推導/建議值全數移除（不列 follow-up）。本 Task 只做「三入口欄位統一」這一件事。

**Files:**
- Create: `src/views/appraisal/components/CreateCycleDialog.vue`
- Create: `src/views/appraisal/composables/useCreateCycle.ts`（表單狀態 + 當前學年學期帶入 + 送出）
- Modify: `src/views/appraisal/CurrentSemesterOverview.vue`（入口 1 `createCurrentCycle` → 開 dialog）
- Modify: `src/views/appraisal/YearlyEnrollmentTargetSection.vue`（入口 2 `createForSemester` → 開 dialog）
- Modify: `src/views/appraisal/CycleListView.vue`（入口 3 既有 dialog → 改用共用 `CreateCycleDialog`）
- Test: `src/views/appraisal/__tests__/useCreateCycle.spec.ts`、`src/views/appraisal/__tests__/CreateCycleDialog.spec.ts`

**Interfaces:**
- Consumes（現況地圖 §2/§6）：`createAppraisalCycle(payload)` POST `/appraisal/cycles`；termStore（`school_year`/`semester`）；`toSemesterEnum`
- Produces（composable）：
  - `interface CreateCycleForm { academic_year: number; semester: 'FIRST' | 'SECOND'; enrollment_target: number | null; enrollment_actual: number | null }`
  - `function useCreateCycle(): { form; submit(): Promise<CreatedCycle>; resetToCurrentTerm(): void }`
  - `function buildCreateCyclePayload(form: CreateCycleForm): { academic_year: number; semester: string; enrollment_target: number; enrollment_actual: number | null }`（純函式：`enrollment_target: form.enrollment_target ?? 0`，維持後端「target 不可 null」語意）
- Props（dialog）：`visible: boolean`、`canWrite: boolean`；Emits：`update:visible`、`created: (cycle) => void`

- [ ] **Step 1: 寫失敗測試（純函式 payload + resetToCurrentTerm）**

```ts
// src/views/appraisal/__tests__/useCreateCycle.spec.ts
import { describe, it, expect } from 'vitest'
import { buildCreateCyclePayload } from '../composables/useCreateCycle'

describe('buildCreateCyclePayload', () => {
  it('target 留空(null)時送 0', () => {
    expect(buildCreateCyclePayload({ academic_year: 114, semester: 'FIRST', enrollment_target: null, enrollment_actual: null }))
      .toEqual({ academic_year: 114, semester: 'FIRST', enrollment_target: 0, enrollment_actual: null })
  })
  it('target 有值時原樣送出', () => {
    expect(buildCreateCyclePayload({ academic_year: 114, semester: 'SECOND', enrollment_target: 160, enrollment_actual: 152 }))
      .toEqual({ academic_year: 114, semester: 'SECOND', enrollment_target: 160, enrollment_actual: 152 })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/useCreateCycle.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

`useCreateCycle.ts` 要點：
- `buildCreateCyclePayload`（純函式）：`{ ...form, enrollment_target: form.enrollment_target ?? 0 }`。
- `resetToCurrentTerm`：`form.academic_year = termStore.school_year`；`form.semester = toSemesterEnum(termStore.semester)`；`form.enrollment_target = null`；`form.enrollment_actual = null`（**不預帶任何建議值**）。
- `submit`：`createAppraisalCycle(buildCreateCyclePayload(form))`。
- **無** `loadSuggestion`/`pickSuggestedTarget`/`suggestedTarget`——批次 3 明確不做建議值。

`CreateCycleDialog.vue`：完整表單（學年 `el-input-number` min 100 max 200；學期 radio FIRST/SECOND；目標 `el-input-number` 預設空、placeholder「未填視為 0，稍後可於目標人數頁調整」；實際註冊可空）。`canWrite` gate 送出鈕（tooltip 包 span pattern）。送出成功 `emit('created', cycle)`。

3 觸發點改：把原本各自的建立函式改為開 dialog（`createDialogVisible.value = true` + `resetToCurrentTerm()`）；入口 3（CycleListView）用共用 dialog 取代自帶 dialog。`@created` handler：`CurrentSemesterOverview` → 設當期並高亮引導條下一步 `participants`；`CycleListView`/`YearlyEnrollmentTargetSection` → reload 清單。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/useCreateCycle.spec.ts src/views/appraisal/__tests__/CreateCycleDialog.spec.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/components/CreateCycleDialog.vue src/views/appraisal/composables/useCreateCycle.ts src/views/appraisal/CurrentSemesterOverview.vue src/views/appraisal/YearlyEnrollmentTargetSection.vue src/views/appraisal/CycleListView.vue src/views/appraisal/__tests__/useCreateCycle.spec.ts src/views/appraisal/__tests__/CreateCycleDialog.spec.ts
git commit -m "feat(appraisal): 三個建週期入口統一為單一 dialog(不預帶建議值)"
```

---

# Phase B — 規則設定（§5.2）

## Task B1: 24 張規則卡依性質分組

新增 domain 分組靜態 map（前後端目前皆無此欄位，前端 map 最省）；`ScoringRulesPanel.vue` 卡片改分組渲染（group header + 各組卡片）；更正 docstring「14」→「24」。

**Files:**
- Modify: `src/views/appraisal/scoreItemLabels.ts`（加 `ITEM_DOMAIN_GROUPS` + 完整性守衛用匯出）
- Modify: `src/views/appraisal/components/ScoringRulesPanel.vue`（分組渲染 + docstring）
- Test: `src/views/appraisal/__tests__/scoreItemDomainGroups.spec.ts`

**Interfaces:**
- Produces:
  - `type ScoreDomain = '考勤' | '招生' | '才藝' | '懲處' | '加分'`
  - `interface ScoreDomainGroup { domain: ScoreDomain; codes: string[] }`
  - `const ITEM_DOMAIN_GROUPS: ScoreDomainGroup[]`（涵蓋全部 24 碼、每碼恰屬一組）

- [ ] **Step 1: 寫失敗測試（完整性守衛）**

```ts
// src/views/appraisal/__tests__/scoreItemDomainGroups.spec.ts
import { describe, it, expect } from 'vitest'
import { ITEM_DOMAIN_GROUPS, ITEM_CODE_LABELS } from '../scoreItemLabels'

describe('ITEM_DOMAIN_GROUPS', () => {
  it('分組涵蓋全部 24 碼、每碼恰屬一組', () => {
    const grouped = ITEM_DOMAIN_GROUPS.flatMap(g => g.codes)
    expect(new Set(grouped).size).toBe(grouped.length) // 無重複
    expect([...grouped].sort()).toEqual(Object.keys(ITEM_CODE_LABELS).sort()) // 完整
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/scoreItemDomainGroups.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

讀 `scoreItemLabels.ts` 現有 24 碼確切字串後，填 `ITEM_DOMAIN_GROUPS`（依 24 碼語意分入 考勤/招生/才藝/懲處/加分；每碼恰一組，完整性守衛測試會強制涵蓋）。`ScoringRulesPanel.vue` 卡片 grid 改為 `v-for="g in ITEM_DOMAIN_GROUPS"` 外層加 group header（`<h4>{{ g.domain }}</h4>`），內層 `v-for="code in g.codes"` 保留既有卡片。docstring「14 規則卡」改「24 規則卡」。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/scoreItemDomainGroups.spec.ts src/views/appraisal/__tests__/ScoringRulesPanel.spec.* --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/scoreItemLabels.ts src/views/appraisal/components/ScoringRulesPanel.vue src/views/appraisal/__tests__/scoreItemDomainGroups.spec.ts
git commit -m "feat(appraisal): 24 規則卡依性質分組"
```

---

## Task B2: 規則摘要收斂為單一來源 + 歷史抽屜改用人話摘要

把 `ScoringRulesPanel.vue` 私有 `fmtRuleSummary`（單行）與 `ruleSummary.ts:summarizeRule`（多行）收斂：`ruleSummary.ts` 提供單行版 `summarizeRuleOneLine` 與既有多行 `summarizeRule`；卡片改用 `summarizeRuleOneLine`；`RuleHistoryDrawer.vue` raw JSON 改用 `summarizeRule` 呈現、raw JSON 收入「進階」`el-collapse`。

**Files:**
- Modify: `src/views/appraisal/ruleSummary.ts`（加 `summarizeRuleOneLine`）
- Modify: `src/views/appraisal/components/ScoringRulesPanel.vue`（移除私有 `fmtRuleSummary`，改 import）
- Modify: `src/views/appraisal/components/RuleHistoryDrawer.vue`（timeline 每版用 `summarizeRule` + 進階折疊 raw JSON）
- Test: `src/views/appraisal/__tests__/ruleSummary.spec.js`（擴充 one-line 案）、`RuleHistoryDrawer.spec.*`

**Interfaces:**
- Consumes: 既有 `summarizeRule(rule): string[]`
- Produces: `function summarizeRuleOneLine(rule): string`（4 型別各回一行精簡摘要；沿用 `summarizeRule` 邏輯首行/彙整，不另寫第二份 switch）

- [ ] **Step 1: 寫失敗測試**

```ts
// 追加於 src/views/appraisal/__tests__/ruleSummary.spec.js
import { summarizeRuleOneLine } from '../ruleSummary'

describe('summarizeRuleOneLine', () => {
  it('PER_UNIT 單行', () => {
    expect(summarizeRuleOneLine({ rule_type: 'PER_UNIT', per_unit_delta: -2 }))
      .toContain('每次')
  })
  it('TIER 單行含階數', () => {
    const s = summarizeRuleOneLine({ rule_type: 'TIER', input_field: 'retention_rate', tiers: [{ min: 0, delta: 0 }, { min: 0.8, delta: 5 }] })
    expect(s).toMatch(/階梯|階/)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/ruleSummary.spec.js --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

`ruleSummary.ts` 加：
```ts
export function summarizeRuleOneLine(rule: unknown): string {
  const lines = summarizeRule(rule)
  // 單行＝首行摘要；TIER 補階數。復用多行版避免第二份 switch。
  return lines.join('；')
}
```
（若既有 `summarizeRule` 對 TIER 已回「階梯式（N 階）…」逐行，`join('；')` 即單行；細節依實作調整，重點是**不新增第二份型別 switch**。）

`ScoringRulesPanel.vue`：刪 `:94-111` 私有 `fmtRuleSummary`，卡片 body `:158` 改 `{{ summarizeRuleOneLine(rule) }}`（import 自 `../ruleSummary`）。
`RuleHistoryDrawer.vue`：`:51` `<pre>{{ JSON.stringify(...) }}</pre>` 改：
```vue
<div v-for="line in summarizeRule(v.rule_config)" :key="line">{{ line }}</div>
<el-collapse><el-collapse-item title="進階：原始設定 JSON">
  <pre>{{ JSON.stringify(v.rule_config, null, 2) }}</pre>
</el-collapse-item></el-collapse>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/ruleSummary.spec.js src/views/appraisal/__tests__/ScoringRulesPanel.spec.* src/views/appraisal/__tests__/RuleHistoryDrawer.spec.* --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/ruleSummary.ts src/views/appraisal/components/ScoringRulesPanel.vue src/views/appraisal/components/RuleHistoryDrawer.vue src/views/appraisal/__tests__/ruleSummary.spec.js
git commit -m "refactor(appraisal): 規則摘要收斂單一來源、歷史抽屜改用人話摘要"
```

---

## Task B3: 百分比統一（UI 0–100，API 邊界換算 0–1）

把三種百分比寫法統一為 UI 0–100%：紅利門檻 `dividend_activity_threshold`、舊生率 `dividend_returning_threshold`（現為 0–1 raw）改 0–100 輸入 + 邊界換算；逐年級門檻（已 0–100）維持；`RuleEditorDialog.vue` tier min（`retention_rate`/`activity_rate`，第 4 種隱性寫法）也統一。換算 util 擴充通用 `percentToFraction`/`fractionToPercent`（既有 `dividendActivityThresholds.ts` 已有，直接復用）。後端契約/儲存 0–1 不動。

**Files:**
- Modify: `src/views/yearEnd/YearEndRulesPanel.vue`（兩個 0–1 欄位改 0–100 輸入 + load `*100` / save `/100`）
- Modify: `src/utils/dividendActivityThresholds.ts`（若需補單值換算 helper；`percentToFraction`/`fractionToPercent` 已存在，直接用）
- Modify: `src/views/appraisal/components/RuleEditorDialog.vue`（tier min 對 rate 型 input_field 顯示 0–100 + 送出換算）
- Test: `src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts`（換算往返）、`src/views/appraisal/__tests__/RuleEditorDialog.spec.*`、`src/utils/__tests__/dividendActivityThresholds.spec.*`

**Interfaces:**
- Consumes: 既有 `fractionToPercent(f)=f*100`、`percentToFraction(p)=p/100`（`dividendActivityThresholds.ts:14-21`）
- 契約不變：送後端仍為 0–1 fraction。

- [ ] **Step 1: 寫失敗測試（邊界換算往返）**

```ts
// 追加於 src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts
// 驗證：load 時後端 0.8 → UI 顯示 80；save 時 UI 80 → 送 0.8
it('紅利門檻/舊生率 0-100 UI 與 0-1 API 邊界換算往返', async () => {
  // mock getBonusConfig 回 { dividend_activity_threshold: 0.8, dividend_returning_threshold: 0.75 }
  // mount → 斷言輸入框顯示 80 / 75
  // 改為 90 → save → 斷言 updateBonusConfig payload 內為 0.9
})
```

> 實作 subagent 依既有 `YearEndRulesPanel.spec.ts` 的 mock 慣例（`vi.mock('@/api/config')` 等）補完斷言主體。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

`YearEndRulesPanel.vue`：
- 兩個 `el-input-number`（`:360-364`/`:384-388`）`:min=0 :max=1 :step=0.05` → `:min=0 :max=100 :step=1`，附 `%` unit hint（比照逐年級欄）；移除「0–1 小數」desc/tooltip。
- 載入（`:109` 附近）：`form.dividend_activity_threshold = fractionToPercent(api.dividend_activity_threshold)`，舊生率同。
- 送出（`:189` 附近 payload）：`dividend_activity_threshold: percentToFraction(form.dividend_activity_threshold)`，舊生率同。
- ⚠ 確認送出 payload 對後端仍是 0–1；逐年級既有 `gradeThresholdsToApi` 不動。

`RuleEditorDialog.vue`：tier `min` 欄位（`:302-307`）對 `input_field ∈ {retention_rate, activity_rate}` 顯示 0–100（`:min=0 :max=100`），`buildPayload`（`:148-180`）送出時該欄 `percentToFraction`；其餘 input_field（late_count/leave_days 為次數非率）維持原值不換算。載入 `existingRule` 時 rate 型 tier min `fractionToPercent`。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts src/views/appraisal/__tests__/RuleEditorDialog.spec.* src/utils/__tests__/dividendActivityThresholds.spec.* --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/yearEnd/YearEndRulesPanel.vue src/views/appraisal/components/RuleEditorDialog.vue src/utils/dividendActivityThresholds.ts src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts
git commit -m "feat(rules): 百分比統一為 UI 0-100 並在 API 邊界換算 0-1"
```

---

## Task B4: 危險操作防護一致化（確認＋原因＋快選模板＋補權限 gate）

補齊四處缺確認/原因的危險操作，並補 bonus-rates / enrollment-targets 缺失的前端寫入 gate。年終規則既有「原因≥10 字」加常用原因快選模板。抽出共用 `confirmWithReason` helper（含快選模板）供各處復用。

**Files:**
- Create: `src/views/appraisal/confirmWithReason.ts`（共用「確認＋原因」helper + 常用原因模板常數）
- Modify: `src/views/appraisal/components/BonusRatesPanel.vue`（加 `APPRAISAL_RULE_WRITE` gate + 新版本確認＋原因）
- Modify: `src/views/appraisal/YearlyEnrollmentTargetSection.vue`（加 gate + 目標修改確認＋原因）
- Modify: `src/views/appraisal/components/PenaltyCatalogPanel.vue`（停用切換加確認）
- Modify: `src/views/yearEnd/YearEndRulesPanel.vue`（既有 prompt 改用共用 helper + 快選模板）
- Test: `src/views/appraisal/__tests__/confirmWithReason.spec.ts` + 各面板測試補確認/gate 案

**Interfaces:**
- Produces:
  - `const RULE_CHANGE_REASON_TEMPLATES: string[]`（如「年度政策調整」「主管裁示」「校正錯誤設定」「配合法規更新」）
  - `async function confirmWithReason(opts: { title: string; message: string; minLength?: number; templates?: string[] }): Promise<string | null>`（回原因字串；取消回 null）
- 內部走 `ElMessageBox.prompt`（textarea + `inputValidator` 最小字數，比照 `YearEndRulesPanel.vue:157-172`）。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/views/appraisal/__tests__/confirmWithReason.spec.ts
import { describe, it, expect, vi } from 'vitest'
vi.mock('element-plus', () => ({
  ElMessageBox: { prompt: vi.fn(async (_m: string, _t: string, opts: { inputValidator?: (v: string) => boolean | string }) => {
    // 模擬驗證 + 使用者輸入
    const v = '年度政策調整'
    if (opts.inputValidator && opts.inputValidator(v) !== true) throw new Error('invalid')
    return { value: v }
  }) },
}))
import { confirmWithReason, RULE_CHANGE_REASON_TEMPLATES } from '../confirmWithReason'

describe('confirmWithReason', () => {
  it('回傳輸入原因', async () => {
    const r = await confirmWithReason({ title: '確認', message: '確定？', minLength: 5 })
    expect(r).toBe('年度政策調整')
  })
  it('提供常用原因模板', () => {
    expect(RULE_CHANGE_REASON_TEMPLATES.length).toBeGreaterThan(2)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/confirmWithReason.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

`confirmWithReason.ts`：
```ts
import { ElMessageBox } from 'element-plus'

export const RULE_CHANGE_REASON_TEMPLATES = ['年度政策調整', '主管裁示', '校正錯誤設定', '配合法規更新']

export async function confirmWithReason(opts: {
  title: string; message: string; minLength?: number; templates?: string[]
}): Promise<string | null> {
  const min = opts.minLength ?? 10
  const tpl = opts.templates ?? RULE_CHANGE_REASON_TEMPLATES
  try {
    const { value } = await ElMessageBox.prompt(
      `${opts.message}\n\n常用原因：${tpl.join('、')}`,
      opts.title,
      {
        inputType: 'textarea',
        inputValidator: (v: string) => (v && v.trim().length >= min) || `原因至少 ${min} 字`,
        confirmButtonText: '確認', cancelButtonText: '取消',
      },
    )
    return value
  } catch {
    return null // 取消
  }
}
```
> 快選模板：`ElMessageBox.prompt` 無法內嵌按鈕，故以「常用原因：…」提示置於 message；若要真一鍵帶入，改用自製小 dialog 元件（可列為此 Task 選配）。最小實作＝提示文字 + 必填字數。

各面板接線：
- `BonusRatesPanel.vue`：加 `import { hasPermission }`，`canWrite = computed(() => hasPermission('APPRAISAL_RULE_WRITE'))`，新版本按鈕 tooltip 包 span gate；`submitForm` 前 `const reason = await confirmWithReason({ title: '新增獎金率版本', message: '將建立新版本並套用於後續計算。', minLength: 10 }); if (reason == null) return;`（reason 隨 audit，若後端無此欄則僅作前端確認閘）。
- `YearlyEnrollmentTargetSection.vue`：加 gate；`saveEdit` 前 `confirmWithReason`。
- `PenaltyCatalogPanel.vue`：`toggleActive` `el-switch` @change 前 `await ElMessageBox.confirm('確定要停用/啟用此扣分項目？')`，取消則還原 switch。
- `YearEndRulesPanel.vue`：`saveRules`（`:157-172`）改呼叫 `confirmWithReason({ minLength: 10 })`，移除重複 prompt 樣板。

- [ ] **Step 4: 跑測試確認通過（含各面板 gate/確認案，用 permState 矩陣）**

Run: `npx vitest run src/views/appraisal/__tests__/confirmWithReason.spec.ts src/views/appraisal/__tests__/BonusRatesPanel.spec.* src/views/appraisal/__tests__/PenaltyCatalogPanel.spec.* src/views/appraisal/__tests__/YearlyEnrollmentTargetSection.spec.* src/views/yearEnd/__tests__/YearEndRulesPanel.spec.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/confirmWithReason.ts src/views/appraisal/components/BonusRatesPanel.vue src/views/appraisal/YearlyEnrollmentTargetSection.vue src/views/appraisal/components/PenaltyCatalogPanel.vue src/views/yearEnd/YearEndRulesPanel.vue src/views/appraisal/__tests__/confirmWithReason.spec.ts
git commit -m "feat(rules): 危險操作確認與原因一致化並補寫入權限 gate"
```

---

## Task B5: 規則變更影響提示（OPEN 週期 → 前往重算）

規則儲存成功後，若存在 OPEN 週期，提示「此變更於下次試算/重算生效 → [前往重算]」；規則設定頁頂部常駐顯示目前 OPEN 週期連結。抽 composable `useOpenCycleHint` 供各規則面板/layout 復用。

**Files:**
- Create: `src/views/appraisal/composables/useOpenCycleHint.ts`
- Modify: `src/views/appraisalYearEnd/RulesSettingsLayout.vue`（頂部 OPEN 週期連結 banner）
- Modify: 各規則面板儲存成功後呼叫 hint（`ScoringRulesPanel` / `BonusRatesPanel` / `YearEndRulesPanel` / `RuleEditorDialog` created 後）
- Test: `src/views/appraisal/__tests__/useOpenCycleHint.spec.ts`

**Interfaces:**
- Consumes（既有 api）：`getAppraisalCurrentCycle()` 或 `listAppraisalCycles()` 找 `status==='OPEN'` 的年終/考核週期
- Produces:
  - `function useOpenCycleHint(): { openCycle: Ref<CycleLike | null>; refresh(): Promise<void>; notifyRuleChanged(): void }`
  - `notifyRuleChanged`：若 `openCycle` 存在，`ElMessage`（含「前往重算」action 或提示文字 + router 連結）

- [ ] **Step 1: 寫失敗測試**

```ts
// src/views/appraisal/__tests__/useOpenCycleHint.spec.ts
import { describe, it, expect, vi } from 'vitest'
const listMock = vi.fn()
vi.mock('@/api/appraisal', () => ({ listAppraisalCycles: (...a: unknown[]) => listMock(...a) }))
const msgSuccess = vi.fn()
vi.mock('element-plus', () => ({ ElMessage: { success: (...a: unknown[]) => msgSuccess(...a), info: vi.fn() } }))
import { useOpenCycleHint } from '../composables/useOpenCycleHint'

describe('useOpenCycleHint', () => {
  it('有 OPEN 週期時 refresh 設 openCycle', async () => {
    listMock.mockResolvedValueOnce({ data: [{ id: 3, status: 'OPEN' }, { id: 2, status: 'CLOSED' }] })
    const { openCycle, refresh } = useOpenCycleHint()
    await refresh()
    expect(openCycle.value?.id).toBe(3)
  })
  it('無 OPEN 週期時 notifyRuleChanged 不提示重算', async () => {
    listMock.mockResolvedValueOnce({ data: [{ id: 2, status: 'CLOSED' }] })
    const { refresh, notifyRuleChanged } = useOpenCycleHint()
    await refresh()
    msgSuccess.mockClear()
    notifyRuleChanged()
    // 無 OPEN 週期不觸發「前往重算」提示（可只顯一般成功）
    expect(msgSuccess).not.toHaveBeenCalledWith(expect.stringContaining('重算'))
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/useOpenCycleHint.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

`useOpenCycleHint.ts`：`refresh` 抓 `listAppraisalCycles()` 找第一筆 `status==='OPEN'` → `openCycle`。`notifyRuleChanged`：`openCycle` 存在 → `ElMessage.success('規則已更新。此變更於下次試算/重算生效。')`（並在 layout banner 給「前往重算」連結）；不存在 → 一般成功訊息。
`RulesSettingsLayout.vue`：`onMounted` `refresh()`；頂部 `<el-alert v-if="openCycle" type="info">目前有進行中週期，規則變更於下次重算生效 <router-link :to="...">前往重算</router-link></el-alert>`。
各面板儲存成功處呼叫 `notifyRuleChanged()`（透過 layout provide/inject 或各面板各自 `useOpenCycleHint`）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/useOpenCycleHint.spec.ts src/views/appraisalYearEnd/__tests__/RulesSettingsLayout.spec.* --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/composables/useOpenCycleHint.ts src/views/appraisalYearEnd/RulesSettingsLayout.vue src/views/appraisal/components/ScoringRulesPanel.vue src/views/appraisal/components/BonusRatesPanel.vue src/views/yearEnd/YearEndRulesPanel.vue src/views/appraisal/components/RuleEditorDialog.vue src/views/appraisal/__tests__/useOpenCycleHint.spec.ts
git commit -m "feat(rules): 規則變更影響提示與 OPEN 週期連結"
```

---

## Task B6: 三處目標人數 UI 互相標註對照

考核週期目標（`AppraisalCycle.enrollment_target`）、年終 org_settings 目標、實際註冊值三處在 UI 互相標註來源與連結（**資料模型整併不在本案範圍**，僅 UI 標註）。抽小元件 `TargetCrossRef.vue` 顯示三值對照 + 來源連結。

**Files:**
- Create: `src/views/appraisal/components/TargetCrossRef.vue`
- Modify: `src/views/appraisal/YearlyEnrollmentTargetSection.vue`（嵌入對照）
- Modify: `src/views/yearEnd/YearEndRulesPanel.vue`（org_settings 目標處嵌對照）
- Test: `src/views/appraisal/__tests__/TargetCrossRef.spec.ts`

**Interfaces:**
- Props：`cycleTarget: number | null`、`orgSettingTarget: number | null`、`actual: number | null`
- 純呈現：三個標籤 + tooltip 說明各來源 + 對照差異提示（不一致時 warning 色）。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/views/appraisal/__tests__/TargetCrossRef.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TargetCrossRef from '../components/TargetCrossRef.vue'

describe('TargetCrossRef', () => {
  it('三值不一致時顯示對照警示', () => {
    const w = mount(TargetCrossRef, { props: { cycleTarget: 160, orgSettingTarget: 158, actual: 152 } })
    expect(w.text()).toContain('160')
    expect(w.text()).toContain('158')
    expect(w.find('[data-test="target-mismatch"]').exists()).toBe(true)
  })
  it('一致時不警示', () => {
    const w = mount(TargetCrossRef, { props: { cycleTarget: 160, orgSettingTarget: 160, actual: 160 } })
    expect(w.find('[data-test="target-mismatch"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/TargetCrossRef.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

`TargetCrossRef.vue`：三個 `el-tag`（考核週期目標 / 年終設定目標 / 實際註冊）各附 tooltip 說明來源；`mismatch = computed(() => new Set([cycleTarget, orgSettingTarget].filter(v => v != null)).size > 1)`，mismatch 時顯 `<span data-test="target-mismatch" class="warn">三處目標不一致，請確認</span>`。嵌入兩處面板對應目標欄位旁。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/TargetCrossRef.spec.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/components/TargetCrossRef.vue src/views/appraisal/YearlyEnrollmentTargetSection.vue src/views/yearEnd/YearEndRulesPanel.vue src/views/appraisal/__tests__/TargetCrossRef.spec.ts
git commit -m "feat(rules): 三處目標人數 UI 互相標註對照"
```

---

## Task B7: 不可寫 tab 顯示「唯讀（需 XX 權限）」徽章

抽共用 `ReadonlyBadge.vue`（顯示「唯讀（需 XX 權限）」）；`RulesSettingsLayout.vue` 各 tab 依該 tab 寫入權限判定是否顯示徽章；統一各面板無寫入權限的呈現。

**Files:**
- Create: `src/components/common/ReadonlyBadge.vue`（或既有 common 目錄）
- Modify: `src/views/appraisalYearEnd/RulesSettingsLayout.vue`（tab 標題旁徽章）
- Modify: 各面板（無寫入權限時頂部顯 `ReadonlyBadge`；比照 year-end-rules 既有 alert）
- Test: `src/components/common/__tests__/ReadonlyBadge.spec.ts` + `RulesSettingsLayout.spec.*` 權限矩陣案

**Interfaces:**
- Props：`permissionLabel: string`（如「考核規則設定」）、`show: boolean`
- 只在 `show`（無寫入權限）時 render `<el-tag type="info">唯讀（需{{ permissionLabel }}權限）</el-tag>`

- [ ] **Step 1: 寫失敗測試（含權限矩陣）**

```ts
// src/components/common/__tests__/ReadonlyBadge.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ReadonlyBadge from '../ReadonlyBadge.vue'

describe('ReadonlyBadge', () => {
  it('show=true 顯示唯讀徽章與權限名', () => {
    const w = mount(ReadonlyBadge, { props: { permissionLabel: '考核規則設定', show: true } })
    expect(w.text()).toContain('唯讀')
    expect(w.text()).toContain('考核規則設定')
  })
  it('show=false 不 render', () => {
    const w = mount(ReadonlyBadge, { props: { permissionLabel: '考核規則設定', show: false } })
    expect(w.find('.el-tag').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/components/common/__tests__/ReadonlyBadge.spec.ts --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

`ReadonlyBadge.vue`：`<el-tag v-if="show" type="info" size="small">唯讀（需{{ permissionLabel }}權限）</el-tag>`。
`RulesSettingsLayout.vue`：`TABS` 每項加 `writePerm` 與 `permLabel`；tab label slot 內 `<ReadonlyBadge :permission-label="t.permLabel" :show="!hasPermission(t.writePerm)" />`。
各面板頂部（無寫入權限時）顯 `ReadonlyBadge`（year-end-rules 既有 alert 可保留或改用徽章統一）。**測試用 `permState` 矩陣**驗證不同權限下徽章顯隱。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/components/common/__tests__/ReadonlyBadge.spec.ts src/views/appraisalYearEnd/__tests__/RulesSettingsLayout.spec.* --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ReadonlyBadge.vue src/views/appraisalYearEnd/RulesSettingsLayout.vue src/views/appraisal/__tests__ src/components/common/__tests__/ReadonlyBadge.spec.ts
git commit -m "feat(rules): 不可寫 tab 顯示唯讀權限徽章"
```

---

## Task B8: 規則編輯 dialog rule_type 補範例（微調）

`rule_type`/`input_field` 已中文化枚舉化（批次 1）。此 Task 只補「範例」文字，並讓 `input_field` 對不需要的型別（PER_UNIT/DISCIPLINARY_TIERED）自動隱藏。

**Files:**
- Modify: `src/views/appraisal/components/RuleEditorDialog.vue`
- Test: `src/views/appraisal/__tests__/RuleEditorDialog.spec.*`（範例文字 + input_field 條件顯示）

**Interfaces:**
- Consumes: 既有 `RULE_TYPE_OPTIONS`、`INPUT_FIELD_OPTIONS`

- [ ] **Step 1: 寫失敗測試**

```ts
// 追加於 RuleEditorDialog 測試
it('選 PER_UNIT 時不顯示 input_field 欄', async () => {
  // mount，設 rule_type=PER_UNIT，斷言 input_field select 不存在
})
it('每型別顯示範例說明', async () => {
  // 斷言 dialog 內含「範例」字樣
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/appraisal/__tests__/RuleEditorDialog.spec.* --no-coverage`
Expected: FAIL

- [ ] **Step 3: 實作**

`RuleEditorDialog.vue`：`RULE_TYPE_OPTIONS` 說明（`:260-265`）各補一句「範例：…」；`input_field` 欄 `v-if="['TIER','FLAT_THRESHOLD'].includes(form.rule_type)"`（PER_UNIT/DISCIPLINARY_TIERED 隱藏）。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/appraisal/__tests__/RuleEditorDialog.spec.* --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/appraisal/components/RuleEditorDialog.vue src/views/appraisal/__tests__/RuleEditorDialog.spec.*
git commit -m "feat(rules): 規則編輯 dialog 補型別範例並依型別隱藏 input_field"
```

---

# 收束（整批 staging 閘門）

15 task 全綠後，一次性收束（比照批次 2 收束）：

- [ ] **全測試樹 + typecheck**
  ```bash
  cd ~/Desktop/ivy-frontend/.claude/worktrees/feat-ayx-taskflow
  npx vitest run src --no-coverage        # 三棵樹全綠
  npm run typecheck                        # 0 error
  ```
- [ ] **openapi drift**（本批無 BE 變更，應無新增 drift）：`npm run gen:api:check`
- [ ] **cross-repo parity 四向**：本批純 FE、不動 permission/schema/PII，parity 應無漂移；仍跑一次確認。
- [ ] **升 staging**（FE 依賴 BE `/progress`——本批**無新 BE 端點**，但仍照鐵律確認 BE staging 已含批次 2 的 `/progress`）：`git push origin feat/appraisal-yearend-taskflow-uiux:staging`（ff）或整合路徑 merge，比照批次 2 升 staging 流程。
- [ ] **更新 ledger**：`.superpowers/sdd/progress.md` 補批次 3 每 task commit SHA。
- [ ] **延後 follow-up**：class-composition 推導建議值（Task A7 決策）、快選原因真一鍵 dialog（Task B4 選配）記入 `docs/superpowers/appraisal-yearend-taskflow-deferred-followups.md`。

---

## Self-Review（對照 spec §5 逐項）

| spec §5 要求 | 對應 Task |
|---|---|
| §5.1 橫向流程引導條（6 步、完成狀態、點擊直達） | A1（步驟+推導）、A2（元件）、A3（接入+跨頁） |
| §5.1 合併雙重預覽（一次 dry-run + 確認寫入、寫權限才顯示） | A4 |
| §5.1 建週期入口統一（3→1、學年自動帶、目標建議值、建後落下一步） | A7 |
| §5.1 26 欄預設只顯示有異動欄 + 欄位開關 chips | A5 |
| §5.1 13 欄凍結欄（已存在）+ 分組表頭（保留鍵盤導航/沿用上期） | A6 |
| §5.2 24 卡分組（考勤/招生/才藝/懲處/加分） | B1 |
| §5.2 百分比統一 0–100 UI ↔ 0–1 API（紅利門檻/逐年級/舊生率） | B3 |
| §5.2 rule_type 白話說明+範例、input_field 自動帶入並隱藏 | B8（+ 批次 1 已完成主體） |
| §5.2 歷史抽屜用 summarizeRule、raw JSON 進階折疊、summary 收斂單一來源 | B2 |
| §5.2 危險操作確認+原因一致化、快選原因模板 | B4 |
| §5.2 影響提示（OPEN 週期→前往重算、頂部 OPEN 連結） | B5 |
| §5.2 三處目標人數 UI 互相標註對照 | B6 |
| §5.2 不可寫 tab 唯讀（需 XX 權限）徽章 | B7 |

**類型一致性檢查**：`AppraisalStepKey`（A1）→ A2/A3 一致使用；`ScorePreviewParticipant`（A5）與 A4 dialog 資料結構一致；`percentToFraction`/`fractionToPercent`（既有 util）B3 全處復用不另造；`confirmWithReason`（B4）供 B4 各面板 + B5 無耦合。**無 placeholder**：每 Task 含具體檔案路徑、測試碼、實作要點與 commit。**非目標遵守**：不動計算引擎/公式、不整併目標資料模型、考核頁不做單一工作區合併、手填 13 欄不改資料結構。
