# 考核與年終 V2 Phase 1 — Batch 4：年終工作區擴充第四階段「發放」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把年終工作區（`YearEndWorkspaceView.vue`）從 3 步（設定/試算·調整/簽核）擴充為 4 步，新增「發放」階段，內容直接沿用既有 `AppraisalPayoutView.vue`（完全不修改其內部邏輯——它的計算/API/警告文案皆已審查過，本批次只負責把它掛進工作區導軌）。**本批次刻意不退場獨立路由 `/appraisal-year-end/year-end/payout`**——盤點發現 `WorkbenchPayoutCard.vue`／`nextStep.ts` 的 payout 分支都還指著這條獨立路由且帶 `?year=` 深連結，比照 Batch 3 的教訓（考核那邊退場前先盤點 7 個引用點），退場年終發放的獨立路由需要同等規模的專門盤點，留給 Batch 5。本批次只新增能力，不拆除任何既有入口，零功能倒退風險。

**Architecture:** `AppraisalPayoutView.vue`是以「年度」（AD year）為主鍵、透過 `route.query.year` 自我驅動的獨立元件，與 `YearEndWorkspaceView` 以 `cycleId`（`year_end_cycles.id`）為主鍵的機制是不同軸——刻意不強行讓兩者耦合（不改 `AppraisalPayoutView.vue` 一行）。整合點只有一處：`goStep('payout')` 時，若 URL 尚未帶 `year`，用當前週期的 `academic_year + 1913`（與 `AppraisalPayoutView.vue` 自身已有的 `sourceAcademicYear = year - 1913` 換算式互為反函式，換算式本身不動）補上 `year` query，讓從工作區導軌點進「發放」時能看到與當前週期對應學年的發放資料；URL 已有 `year` 時不覆寫（保留使用者手動切換的年度或深連結帶入的年度）。

**Tech Stack:** Vue 3、Vue Router 4、Vitest + `@vue/test-utils`。

**Spec:** `/Users/yilunwu/Desktop/ivyManageSystem/.scratch/appraisal-yearend-v2/ux-spec.md` §3.3（年終工作區四階段）；`implementation-plan.md` §Phase 1 子項 5。

## Global Constraints

- 語言：繁體中文；程式識別字英文。
- 不改動任何計算邏輯、API 呼叫、權限判斷語意；`AppraisalPayoutView.vue` 一行都不改。
- 不刪除、不修改 `/appraisal-year-end/year-end/payout` 獨立路由，也不改 `WorkbenchPayoutCard.vue`／`nextStep.ts` 任何連結。
- 每個 task 完成後跑：`npm run test -- --run <相關檔案>` → 全數通過才進下一 task。
- typecheck 一律用 `NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit`（本機驗證過可取得乾淨結果）。
- 分支：延續 `feat/appraisal-yearend-v2-phase1`。每個 task 完成後 `git add -- <明確路徑>` + commit；**禁止 `git add -A`/`git add .`**。

---

### Task 1: `workspaceSteps.ts`（yearEnd）擴充為四步

**Files:**
- Modify: `src/views/yearEnd/workspaceSteps.ts`（現況見下方「現有完整內容」，共 20 行）
- Modify test: `src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts:7,88`（兩處硬編碼「三步」斷言）

**現有完整內容（`workspaceSteps.ts`，改動前）：**

```ts
/** 年終工作區左導軌步驟（單一來源，shell 與測試共用）。 */
export type WorkspaceStepKey = 'config' | 'grid' | 'detail'

export interface WorkspaceStep {
  key: WorkspaceStepKey
  label: string
  hint: string
}

export const WORKSPACE_STEPS: WorkspaceStep[] = [
  { key: 'config', label: '設定', hint: '招生目標與班級編制' },
  { key: 'grid', label: '試算 · 調整', hint: '總表試算與手動調整' },
  { key: 'detail', label: '簽核', hint: '結算明細與兩關簽核' },
]

export const DEFAULT_STEP: WorkspaceStepKey = 'detail'

export function normalizeStep(raw: unknown): WorkspaceStepKey {
  return raw === 'config' || raw === 'grid' || raw === 'detail' ? raw : DEFAULT_STEP
}
```

**Interfaces:**
- Produces：`WorkspaceStepKey` 新增 `'payout'` 成員；`WORKSPACE_STEPS` 新增第 4 筆；`normalizeStep` 白名單新增 `'payout'`。`DEFAULT_STEP` 維持 `'detail'` 不變（Task 2 會 import 這些符號）。

- [ ] **Step 1: 改測試（先紅）**

`YearEndWorkspaceView.spec.ts` 第 7 行：
```ts
    expect(WORKSPACE_STEPS.map((s) => s.key)).toEqual(['config', 'grid', 'detail'])
```
改為：
```ts
    expect(WORKSPACE_STEPS.map((s) => s.key)).toEqual(['config', 'grid', 'detail', 'payout'])
```
（同時把第 6 行 it 標題 `'三步定義齊全且順序為 config→grid→detail'` 改為 `'四步定義齊全且順序為 config→grid→detail→payout'`）

第 88 行：
```ts
    expect(wrapper.findAll('[data-test^="rail-step-"]').length).toBe(3)
```
改為：
```ts
    expect(wrapper.findAll('[data-test^="rail-step-"]').length).toBe(4)
```

- [ ] **Step 2: 跑測試確認紅**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`
Expected: FAIL（上述兩條斷言此刻仍對舊的三步陣列，會失敗；其餘既有測試應仍綠，因為它們不依賴步驟總數）

- [ ] **Step 3: 改 `workspaceSteps.ts`**

整份取代為：

```ts
/** 年終工作區左導軌步驟（單一來源，shell 與測試共用）。 */
export type WorkspaceStepKey = 'config' | 'grid' | 'detail' | 'payout'

export interface WorkspaceStep {
  key: WorkspaceStepKey
  label: string
  hint: string
}

export const WORKSPACE_STEPS: WorkspaceStep[] = [
  { key: 'config', label: '設定', hint: '招生目標與班級編制' },
  { key: 'grid', label: '試算 · 調整', hint: '總表試算與手動調整' },
  { key: 'detail', label: '簽核', hint: '結算明細與兩關簽核' },
  { key: 'payout', label: '發放', hint: '考核年終獨立轉帳與轉帳名冊' },
]

export const DEFAULT_STEP: WorkspaceStepKey = 'detail'

export function normalizeStep(raw: unknown): WorkspaceStepKey {
  return raw === 'config' || raw === 'grid' || raw === 'detail' || raw === 'payout' ? raw : DEFAULT_STEP
}
```

- [ ] **Step 4: 跑測試確認綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`
Expected: PASS。**注意**：本檔其餘既有測試（`mountShell()` 用 `STUBS` 只 stub 了 `YearEndConfigView`/`YearEndGridView`/`YearEndDetailView` 三個，本 task 不新增 `AppraisalPayoutView` stub、也不會有測試進入 `step==='payout'` 分支，因為 Task 1 完全不動 `YearEndWorkspaceView.vue` 本身的 template——只是步驟常數多一筆，rail 會多渲染一個按鈕但預設仍落在 `detail`，其餘測試不受影響）。

- [ ] **Step 5: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/yearEnd/workspaceSteps.ts src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 6: Commit**

```bash
git add -- src/views/yearEnd/workspaceSteps.ts src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
git commit -m "feat(year-end): 工作區導軌步驟擴充為四步，新增「發放」

WORKSPACE_STEPS/normalizeStep 新增 payout 鍵；本 commit 只改步驟常數，
YearEndWorkspaceView.vue 尚未實際掛載發放內容（Task 2 才做）
（V2 IA 簡化 Phase 1 Batch 4）。"
```

---

### Task 2: `YearEndWorkspaceView.vue` 掛載發放階段內容

**Files:**
- Modify: `src/views/yearEnd/YearEndWorkspaceView.vue`（現況見下方「現有完整內容」，共 277 行）
- Modify test: `src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`

**⚠ 前置條件：Task 1 必須先完成並 commit。**

**現有完整內容（`YearEndWorkspaceView.vue`，改動前）：**

```vue
<script setup lang="ts">
import { ref, computed, defineAsyncComponent, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { WORKSPACE_STEPS, normalizeStep, type WorkspaceStepKey } from './workspaceSteps'
import { listYearEndCycles, updateCycleStatus, getCycleProgress } from '@/api/yearEnd'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { CYCLE_STATUS_TAG, cycleStatusLabel } from '@/constants/appraisalYearEnd'
import { tenantGetItem, tenantSetItem } from '@/utils/tenantStorage'

const YearEndConfigView = defineAsyncComponent(() => import('./YearEndConfigView.vue'))
const YearEndGridView = defineAsyncComponent(() => import('./YearEndGridView.vue'))
const YearEndDetailView = defineAsyncComponent(() => import('./YearEndDetailView.vue'))

const route = useRoute()
const router = useRouter()
const cycleId = Number(route.params.id)

const step = computed<WorkspaceStepKey>(() => normalizeStep(route.query.step))
function goStep(key: WorkspaceStepKey) {
  if (key === step.value) return
  router.replace({ query: { ...route.query, step: key } })
}

const RAIL_COLLAPSE_KEY = 'ye-workspace-rail-collapsed'
const collapsed = ref(tenantGetItem(RAIL_COLLAPSE_KEY) === '1')
function toggleCollapse() {
  collapsed.value = !collapsed.value
  tenantSetItem(RAIL_COLLAPSE_KEY, collapsed.value ? '1' : '0')
}

interface YearEndCycle { id: number; academic_year: number; bonus_calc_date: string; status: string }
interface CycleProgress {
  cycle_status: string
  settings_complete: boolean
  settings_missing_count: number
  settlement_count: number
  unmatched_count: number
  sign_counts: Record<string, number>
  pending_sign_count: number
  finalized_count: number
  total_count: number
  exception_count: number
}

const cycle = ref<YearEndCycle | null>(null)
const progress = ref<CycleProgress | null>(null)
const canFinalize = computed(() => hasPermission('YEAR_END_FINALIZE'))
const statusBusy = ref(false)

const cycleLoadFailed = ref(false)
const progressLoadFailed = ref(false)
const headerLoadFailed = computed(() => cycleLoadFailed.value || progressLoadFailed.value)

async function loadCycle() {
  try {
    const res = await listYearEndCycles()
    const cycles = res.data as YearEndCycle[]
    cycle.value = cycles.find((c) => c.id === cycleId) ?? null
    cycleLoadFailed.value = false
  } catch {
    cycleLoadFailed.value = true
  }
}

async function loadProgress() {
  try {
    const res = await getCycleProgress(cycleId)
    progress.value = res.data as CycleProgress
    progressLoadFailed.value = false
  } catch {
    progressLoadFailed.value = true
  }
}

function retryHeaderLoad() {
  loadCycle()
  loadProgress()
}

onMounted(() => {
  loadCycle()
  loadProgress()
})

async function transitionStatus(newStatus: 'OPEN' | 'LOCKED' | 'CLOSED', confirmMessage: string) {
  if (!cycle.value) return
  try {
    await ElMessageBox.confirm(confirmMessage, '確認狀態變更', { type: 'warning' })
  } catch {
    return
  }
  statusBusy.value = true
  try {
    await updateCycleStatus(cycle.value.id, { status: newStatus })
    ElMessage.success('週期狀態已更新')
    await Promise.all([loadCycle(), loadProgress()])
  } catch (e) {
    ElMessage.error(apiError(e, '狀態更新失敗'))
  } finally {
    statusBusy.value = false
  }
}

function lockCycle() {
  return transitionStatus('LOCKED', `確定要鎖定「${cycle.value?.academic_year} 學年度」週期嗎？鎖定後將無法再自動重新試算。`)
}

async function closeCycle() {
  if (progress.value == null) {
    ElMessage.warning('週期進度尚未載入完成，暫時無法確認是否可封存，請稍後再試')
    return
  }
  const pending = progress.value.pending_sign_count
  if (pending > 0) {
    ElMessageBox.alert(
      `尚有 ${pending} 筆結算單未核定（FINALIZED），無法封存。請先完成簽核。`,
      '無法封存',
      { type: 'error' },
    )
    return
  }
  return transitionStatus('CLOSED', `封存前請確認：此週期所有結算單須全數核定（FINALIZED）。確定要封存「${cycle.value?.academic_year} 學年度」週期嗎？`)
}
function reopenToLocked() {
  return transitionStatus('LOCKED', `確定要將「${cycle.value?.academic_year} 學年度」退回鎖定狀態嗎？（救援用途）`)
}
function reopenToOpen() {
  return transitionStatus('OPEN', `確定要將「${cycle.value?.academic_year} 學年度」退回開放狀態嗎？（救援用途）`)
}
</script>

<template>
  <div class="ye-workspace" :class="{ 'ye-workspace--collapsed': collapsed }">
    <nav class="ye-rail" aria-label="年終流程導軌">
      <button class="ye-rail__toggle" type="button" @click="toggleCollapse"
        :aria-label="collapsed ? '展開導軌' : '收合導軌'">{{ collapsed ? '»' : '«' }}</button>
      <ul class="ye-rail__steps">
        <li v-for="s in WORKSPACE_STEPS" :key="s.key">
          <button
            type="button"
            class="ye-rail__step"
            :class="{ 'is-active': step === s.key }"
            :data-test="`rail-step-${s.key}`"
            :aria-current="step === s.key ? 'step' : undefined"
            @click="goStep(s.key)"
          >
            <span class="ye-rail__label">
              {{ s.label }}
              <span
                v-if="s.key === 'config' && progress && progress.settings_missing_count > 0"
                data-test="rail-badge-config"
                class="ye-rail__badge"
              >缺 {{ progress.settings_missing_count }}</span>
              <span v-else-if="s.key === 'grid' && progress" data-test="rail-count-grid" class="ye-rail__count">
                {{ progress.settlement_count }}
                <span
                  v-if="progress.unmatched_count > 0"
                  data-test="rail-badge-grid-unmatched"
                  class="ye-rail__badge"
                >未匹配 {{ progress.unmatched_count }}</span>
              </span>
              <span v-else-if="s.key === 'detail' && progress" data-test="rail-count-detail" class="ye-rail__count">
                待簽 {{ progress.pending_sign_count }}
              </span>
            </span>
            <span v-if="!collapsed" class="ye-rail__hint">{{ s.hint }}</span>
          </button>
        </li>
      </ul>
    </nav>
    <section class="ye-workspace__body">
      <div class="ye-header">
        <el-alert
          v-if="headerLoadFailed"
          type="error" :closable="false" show-icon
          title="週期資訊載入失敗，學年、狀態與流程進度可能未顯示。"
          data-test="header-load-error"
          style="margin-bottom: 12px"
        >
          <el-button size="small" data-test="header-retry-button" @click="retryHeaderLoad">重試</el-button>
        </el-alert>
        <div v-if="cycle" class="ye-header__meta">
          <strong>{{ cycle.academic_year }} 學年度</strong> ｜
          基準日 {{ cycle.bonus_calc_date }} ｜
          <el-tag :type="CYCLE_STATUS_TAG[cycle.status] || 'info'" size="small">{{ cycleStatusLabel(cycle.status) }}</el-tag>
          <span v-if="progress" class="ye-header__progress" data-test="header-progress">
            已核定 {{ progress.finalized_count }} / {{ progress.total_count }}
          </span>
        </div>

        <el-alert
          v-if="cycle?.status === 'LOCKED'"
          type="info" :closable="false" show-icon
          title="週期已鎖定：僅可簽核與核定；不可再試算、手動調整或修改設定。"
          style="margin-bottom: 12px"
        />

        <div class="ye-toolbar">
          <template v-if="canFinalize && cycle">
            <el-button
              v-if="cycle.status === 'OPEN'"
              type="warning"
              :loading="statusBusy"
              data-test="lock-cycle-button"
              @click="lockCycle"
            >鎖定</el-button>
            <template v-else-if="cycle.status === 'LOCKED'">
              <el-button
                type="primary"
                :loading="statusBusy"
                data-test="close-cycle-button"
                @click="closeCycle"
              >封存</el-button>
              <el-button
                :loading="statusBusy"
                data-test="reopen-open-button"
                @click="reopenToOpen"
              >退回開放</el-button>
            </template>
            <el-button
              v-else-if="cycle.status === 'CLOSED'"
              :loading="statusBusy"
              data-test="reopen-locked-button"
              @click="reopenToLocked"
            >退回鎖定</el-button>
          </template>
        </div>
      </div>

      <YearEndConfigView v-if="step === 'config'" :cycle-id="cycleId" />
      <YearEndGridView v-else-if="step === 'grid'" :cycle-id="cycleId" />
      <YearEndDetailView v-else :cycle-id="cycleId" />
    </section>
  </div>
</template>

<style scoped>
.ye-workspace { display: flex; gap: var(--space-4); align-items: flex-start; padding: var(--space-4); }
.ye-rail { flex: 0 0 200px; position: sticky; top: var(--space-4); }
.ye-workspace--collapsed .ye-rail { flex-basis: 56px; }
.ye-rail__toggle { border: none; background: transparent; cursor: pointer; color: var(--text-secondary); margin-bottom: var(--space-2); }
.ye-rail__steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.ye-rail__step { width: 100%; text-align: left; border: none; background: transparent; cursor: pointer;
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); border-left: 3px solid transparent; display: flex; flex-direction: column; gap: 2px; }
.ye-rail__step.is-active { background: var(--el-color-primary-light-9); border-left-color: var(--el-color-primary); }
.ye-rail__label { font-weight: 600; font-size: var(--text-sm); display: flex; align-items: center; gap: 6px; }
.ye-rail__hint { font-size: var(--text-xs); color: var(--text-secondary); }
.ye-rail__count { font-weight: 400; font-size: var(--text-xs); color: var(--text-secondary); }
.ye-rail__badge { margin-left: 2px; font-size: var(--text-xs); font-weight: 600; color: var(--el-color-warning);
  background: var(--el-color-warning-light-9); border-radius: var(--radius-sm, 4px); padding: 0 6px; }
.ye-workspace__body { flex: 1; min-width: 0; }
.ye-header { margin-bottom: var(--space-3); }
.ye-header__meta { margin: var(--space-3) 0; padding: var(--space-3); background: var(--el-fill-color-light, #f5f7fa); border-radius: 4px; display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.ye-header__progress { margin-left: auto; font-size: var(--text-sm); color: var(--text-secondary); }
.ye-toolbar { margin: var(--space-2) 0; display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
</style>
```

**Interfaces:**
- Consumes：Task 1 產出的 `WORKSPACE_STEPS`（4 筆）、`normalizeStep`（含 `'payout'`）——本 task 對這兩個符號的 import 語句不變，只是它們現在多回傳一種可能值。
- Produces：無新 export（路由葉節點元件）。

- [ ] **Step 1: 改測試（先紅）**

在 `YearEndWorkspaceView.spec.ts` 的 `STUBS` 常數（第 53-57 行附近）新增一筆：
```ts
const STUBS = {
  YearEndConfigView: { template: '<div data-test="stub-config" />' },
  YearEndGridView: { template: '<div data-test="stub-grid" />' },
  YearEndDetailView: { template: '<div data-test="stub-detail" />' },
  AppraisalPayoutView: { template: '<div data-test="stub-payout" />' },
}
```

在 `describe('YearEndWorkspaceView', ...)` 區塊內新增三個測試（放在既有測試最後、`})` 結尾之前）：

```ts
  it('step=payout 時掛載發放內容', async () => {
    routeRef.value = { params: { id: '9' }, query: { step: 'payout', year: '2027' } }
    const wrapper = await mountShell()
    expect(wrapper.find('[data-test="stub-payout"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="stub-detail"]').exists()).toBe(false)
  })

  it('點 rail-step-payout 且 URL 尚無 year → goStep 補上以週期學年換算的 year（academic_year+1913）', async () => {
    routeRef.value = { params: { id: '9' }, query: {} }
    const wrapper = await mountShell()
    replaceMock.mockClear()

    await wrapper.find('[data-test="rail-step-payout"]').trigger('click')

    expect(replaceMock).toHaveBeenCalledWith({ query: { step: 'payout', year: '2027' } })
  })

  it('點 rail-step-payout 且 URL 已有 year → goStep 保留原 year 不覆寫', async () => {
    routeRef.value = { params: { id: '9' }, query: { year: '2026' } }
    const wrapper = await mountShell()
    replaceMock.mockClear()

    await wrapper.find('[data-test="rail-step-payout"]').trigger('click')

    expect(replaceMock).toHaveBeenCalledWith({ query: { year: '2026', step: 'payout' } })
  })
```

（第一個測試用到的週期學年 114 沿用 `beforeEach` 的既有 mock `listYearEndCycles` 回傳 `academic_year: 114`；114+1913=2027，與測試斷言一致。）

- [ ] **Step 2: 跑測試確認新增的三條紅**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`
Expected: 新增的 3 條 FAIL（`stub-payout` 不存在、`goStep` 對 payout 沒有特殊年度補算邏輯），其餘既有測試仍 PASS。

- [ ] **Step 3: 改 `YearEndWorkspaceView.vue`**

1. 在 `defineAsyncComponent` 區塊新增第 4 個：
   ```ts
   const AppraisalPayoutView = defineAsyncComponent(() => import('./AppraisalPayoutView.vue'))
   ```
2. `goStep` 函式改為：
   ```ts
   function goStep(key: WorkspaceStepKey) {
     if (key === step.value) return
     const q: Record<string, unknown> = { ...route.query, step: key }
     if (key === 'payout' && !q.year && cycle.value) {
       q.year = String(cycle.value.academic_year + 1913)
     }
     router.replace({ query: q })
   }
   ```
3. Template 底部渲染區塊改為：
   ```vue
   <YearEndConfigView v-if="step === 'config'" :cycle-id="cycleId" />
   <YearEndGridView v-else-if="step === 'grid'" :cycle-id="cycleId" />
   <AppraisalPayoutView v-else-if="step === 'payout'" />
   <YearEndDetailView v-else :cycle-id="cycleId" />
   ```

- [ ] **Step 4: 跑測試確認全綠**

Run: `npm run test -- --run src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts`
Expected: PASS（含新增 3 條 + 原有全部）。

- [ ] **Step 5: 跑更廣範圍確認無其他斷言受影響**

Run: `npm run test -- --run src/views/yearEnd`
Expected: PASS。特別留意 `AppraisalPayoutView.spec.ts`（本 task 不修改該元件本身，其獨立測試不應受影響——它測的是元件邏輯，不依賴被誰掛載）。

- [ ] **Step 6: typecheck + lint**

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx vue-tsc --noEmit
npm run lint -- src/views/yearEnd/YearEndWorkspaceView.vue src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
```
Expected: 兩者皆 0 錯誤。

- [ ] **Step 7: Commit**

```bash
git add -- src/views/yearEnd/YearEndWorkspaceView.vue src/views/yearEnd/__tests__/YearEndWorkspaceView.spec.ts
git commit -m "feat(year-end): 工作區第四階段掛載發放內容（沿用既有 AppraisalPayoutView）

AppraisalPayoutView.vue 完全不動；goStep 進入發放階段且 URL 未帶 year 時，
以當前週期學年換算對應年度（academic_year+1913，與元件既有的
sourceAcademicYear=year-1913 互為反函式）補上 query，避免顯示錯誤年度的
發放資料。獨立路由 /appraisal-year-end/year-end/payout 與其餘引用點本批次
不動，留待 Batch 5 專門盤點後切換（V2 IA 簡化 Phase 1 Batch 4）。"
```

---

## Self-Review 記錄

1. **Spec coverage**：ux-spec §3.3「發放（stage=payout，整合原 AppraisalPayoutView）」在本批次落地；「未全數核定時 disabled」「產生後收據卡」「轉帳名冊下載」等細節皆是 `AppraisalPayoutView.vue` 既有邏輯，未改動即已符合。獨立路由退場（含 `WorkbenchPayoutCard.vue`／`nextStep.ts` 兩處深連結的引用點盤點與切換）明確排除本批次範圍，留 Batch 5。
2. **Placeholder scan**：兩個 task 皆為完整可執行程式碼與精確測試，無 TBD。
3. **Type consistency**：`WorkspaceStepKey`/`WORKSPACE_STEPS`/`normalizeStep` 在 Task 1 定義、Task 2 原樣沿用；`goStep` 的 `q` 型別維持與既有 `route.query` 展開一致的寬鬆型別（`Record<string, unknown>`），不引入新型別。
4. **風險守則**：`AppraisalPayoutView.vue` 零修改（僅新增一個 import 它的其他檔案）；`YearEndConfigView`/`YearEndGridView`/`YearEndDetailView` 三個既有內容元件與 `cycleId` prop 契約完全不動；週期狀態機（鎖定/封存/退回）toolbar 邏輯不動。
