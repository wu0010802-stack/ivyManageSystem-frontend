# 漏斗看板直接新增訪視 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在招生「漏斗看板」加一個「新增訪視」入口，沿用既有完整訪視表單，存檔後新卡片直接出現在看板，不必切到「訪視明細」tab。

**Architecture:** 純前端（`ivy-frontend`）。新增一個自足元件 `FunnelAddVisit.vue`（按鈕＋既有 `RecruitmentRecordDialog`＋存檔），`FunnelBoard.vue` 放入該元件並在存檔後重載看板，`AdmissionsView.vue` 把既有 dashboard 實例傳入並在新增後同步統計。建立走既有 `POST /recruitment/records`，看板重抓走既有 store。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、Pinia、Vitest（happy-dom）、axios wrapper。

## Global Constraints

- 語言一律繁體中文（程式註解、commit message、UI 文案）。
- `ivy-frontend/src/` 業務碼 100% TypeScript；新 SFC 一律 `<script setup lang="ts">`；禁 `: any` / `as any`（測試檔可用 `as unknown as T` 轉型，沿用既有測試慣例）。
- 後端**不**變更：建立訪視只用既有 `createRecruitmentRecord` → `POST /recruitment/records`；看板只用既有 `useRecruitmentFunnelStore`。
- 送後端的 payload **不可**含前端內部欄位 `month_raw`（與 `AdmissionsRecordsPanel.handleSave` 一致）。
- 「新增訪視」按鈕以 `hasPermission('RECRUITMENT_WRITE')` 前端控管（無權限不渲染）。
- 前端 gate：`npm run typecheck`、`npm run lint`、相關 Vitest 綠（vitest 已 exclude `.worktrees/`，正常跑即可）。
- 共用 checkout 紀律：本工作在 worktree／feature branch（off `origin/main`）進行，spec/plan/程式同分支 commit；勿動平行 session 的 `.worktrees/` 與未追蹤檔。

---

### Task 1: 抽出共用 `emptyVisitForm()` 空表單工廠

把 `AdmissionsRecordsPanel.vue` 內嵌的 `emptyForm()` 提升為共用常數，供明細 tab 與新元件共用，避免兩份空表單定義漂移。

**Files:**
- Modify: `src/constants/recruitment.ts`（新增 `VisitFormState` 型別 + `emptyVisitForm()`）
- Modify: `src/components/recruitment/AdmissionsRecordsPanel.vue:202-233`（移除內嵌 `emptyForm`，改用共用版）
- Test: `src/constants/__tests__/recruitmentVisitForm.test.ts`（新建）

**Interfaces:**
- Produces:
  - `export interface VisitFormState { month: string; month_raw: string | null; seq_no: string; visit_date: string; child_name: string; birthday: string | null; grade: string | null; phone: string; address: string; district: string; source: string; referrer: string; deposit_collector: string; has_deposit: boolean; enrolled: boolean; transfer_term: boolean; no_deposit_reason: string | null; no_deposit_reason_detail: string; notes: string; parent_response: string; geocoding_consent: boolean }`
  - `export function emptyVisitForm(): VisitFormState`

- [ ] **Step 1: 寫失敗測試**

新建 `src/constants/__tests__/recruitmentVisitForm.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { emptyVisitForm } from '@/constants/recruitment'

describe('emptyVisitForm', () => {
  it('回傳全空白、未預繳/未報到的訪視表單預設值', () => {
    const f = emptyVisitForm()
    expect(f.child_name).toBe('')
    expect(f.month).toBe('')
    expect(f.month_raw).toBeNull()
    expect(f.grade).toBeNull()
    expect(f.birthday).toBeNull()
    expect(f.has_deposit).toBe(false)
    expect(f.enrolled).toBe(false)
    expect(f.transfer_term).toBe(false)
    expect(f.no_deposit_reason).toBeNull()
    expect(f.geocoding_consent).toBe(false)
  })

  it('每次回傳全新物件（不共用參考）', () => {
    expect(emptyVisitForm()).not.toBe(emptyVisitForm())
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/constants/__tests__/recruitmentVisitForm.test.ts`
Expected: FAIL（`emptyVisitForm` is not exported / not a function）

- [ ] **Step 3: 在 `src/constants/recruitment.ts` 末端新增實作**

```ts
// 招生訪視表單空白預設值（明細 tab 與漏斗看板新增共用，避免兩份定義漂移）。
// month_raw 為前端日期選擇器暫存（YYYY-MM-DD），送後端前需移除。
export interface VisitFormState {
  month: string
  month_raw: string | null
  seq_no: string
  visit_date: string
  child_name: string
  birthday: string | null
  grade: string | null
  phone: string
  address: string
  district: string
  source: string
  referrer: string
  deposit_collector: string
  has_deposit: boolean
  enrolled: boolean
  transfer_term: boolean
  no_deposit_reason: string | null
  no_deposit_reason_detail: string
  notes: string
  parent_response: string
  geocoding_consent: boolean
}

export function emptyVisitForm(): VisitFormState {
  return {
    month: '', month_raw: null, seq_no: '', visit_date: '', child_name: '',
    birthday: null, grade: null, phone: '', address: '',
    district: '', source: '', referrer: '', deposit_collector: '',
    has_deposit: false, enrolled: false, transfer_term: false,
    no_deposit_reason: null, no_deposit_reason_detail: '',
    notes: '', parent_response: '',
    geocoding_consent: false,
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/constants/__tests__/recruitmentVisitForm.test.ts`
Expected: PASS

- [ ] **Step 5: 改 `AdmissionsRecordsPanel.vue` 改用共用版**

5a. 在 `<script setup>` 的 import 區（約 `import { GRADES_ORDER }` 不存在於本檔，故新增一行）加入：

```ts
import { emptyVisitForm, type VisitFormState } from '@/constants/recruitment'
```

5b. 刪除內嵌的 `emptyForm` 定義（目前 `src/components/recruitment/AdmissionsRecordsPanel.vue:202-233` 的 `const emptyForm = (): { ... } => ({ ... })` 整段）。

5c. 將 `const form = ref(emptyForm())`（約 `:233`）改為：

```ts
const form = ref<VisitFormState>(emptyVisitForm())
```

5d. 將 `openAddDialog` 內的 `form.value = emptyForm()`（約 `:332`）改為：

```ts
  form.value = emptyVisitForm()
```

（`openEditDialog` 內以 row 組裝的 `form.value = { ... }` 物件維持不動。）

- [ ] **Step 6: 跑既有 panel 測試 + typecheck 確認未破壞**

Run: `npx vitest run src/components/recruitment/__tests__/AdmissionsRecordsPanel.test.ts && npm run typecheck`
Expected: PASS（panel 行為不變；型別通過）

- [ ] **Step 7: Commit**

```bash
git add src/constants/recruitment.ts src/constants/__tests__/recruitmentVisitForm.test.ts src/components/recruitment/AdmissionsRecordsPanel.vue
git commit -m "refactor(recruitment): 抽出共用 emptyVisitForm 空表單工廠"
```

---

### Task 2: 新增 `FunnelAddVisit.vue` 元件（按鈕＋表單＋存檔）

自足元件：一顆權限控管的「新增訪視」按鈕，點開沿用既有 `RecruitmentRecordDialog`，存檔走既有 create API 並 emit `created`。

**Files:**
- Create: `src/components/recruitment/funnel/FunnelAddVisit.vue`
- Test: `src/components/recruitment/funnel/__tests__/FunnelAddVisit.test.ts`（新建）

**Interfaces:**
- Consumes: `emptyVisitForm()` / `VisitFormState`（Task 1）；`createRecruitmentRecord(data)`（`@/api/recruitment`，回傳 axios `{ data }`）；`apiError(e, fallback)`（`@/utils/error`）；`hasPermission(name)`（`@/utils/auth`）；`useRecruitmentDashboard` 回傳型別。
- Produces:
  - props：`{ dashboard: ReturnType<typeof useRecruitmentDashboard> }`
  - emits：`created: [record: Record<string, unknown>]`
  - `defineExpose({ form, dialogVisible, saving, openDialog, handleSave })`（供測試）

- [ ] **Step 1: 寫失敗測試**

新建 `src/components/recruitment/funnel/__tests__/FunnelAddVisit.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import FunnelAddVisit from '../FunnelAddVisit.vue'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'

const createRecruitmentRecordMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/recruitment', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createRecruitmentRecord: createRecruitmentRecordMock }
})

const successMock = vi.hoisted(() => vi.fn())
const errorMock = vi.hoisted(() => vi.fn())
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    ElMessage: { success: successMock, error: errorMock, info: vi.fn(), warning: vi.fn() },
  }
})

const hasPermissionMock = vi.hoisted(() => vi.fn())
vi.mock('@/utils/auth', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, hasPermission: hasPermissionMock }
})

function makeDashboard() {
  return {
    stats: ref<Record<string, unknown>>({ by_district: [] }),
    options: ref<Record<string, unknown>>({ sources: [], referrers: [], no_deposit_reasons: [] }),
    fetchOptions: vi.fn().mockResolvedValue(true),
  }
}

function mountComp(dash = makeDashboard()) {
  return mount(FunnelAddVisit, {
    props: { dashboard: dash as unknown as ReturnType<typeof useRecruitmentDashboard> },
    global: { stubs: { teleport: true, RecruitmentRecordDialog: true } },
  })
}

type ExposedVm = {
  form: Record<string, unknown>
  dialogVisible: boolean
  saving: boolean
  openDialog: () => Promise<void>
  handleSave: () => Promise<void>
}

describe('FunnelAddVisit', () => {
  beforeEach(() => {
    createRecruitmentRecordMock.mockReset()
    createRecruitmentRecordMock.mockResolvedValue({ data: { id: 99, month: '115.03' } })
    successMock.mockReset()
    errorMock.mockReset()
    hasPermissionMock.mockReset()
    hasPermissionMock.mockReturnValue(true)
  })

  it('有 RECRUITMENT_WRITE 時渲染「新增訪視」按鈕', () => {
    const wrapper = mountComp()
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.text()).toContain('新增訪視')
  })

  it('無權限時不渲染按鈕', () => {
    hasPermissionMock.mockReturnValue(false)
    const wrapper = mountComp()
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('openDialog 會 fetchOptions 並開啟 dialog', async () => {
    const dash = makeDashboard()
    const wrapper = mountComp(dash)
    const vm = wrapper.vm as unknown as ExposedVm
    await vm.openDialog()
    await flushPromises()
    expect(dash.fetchOptions).toHaveBeenCalled()
    expect(vm.dialogVisible).toBe(true)
  })

  it('儲存成功：payload 不含 month_raw、呼叫 create、emit created', async () => {
    const wrapper = mountComp()
    const vm = wrapper.vm as unknown as ExposedVm
    vm.form.child_name = '王小明'
    vm.form.month = '115.03'
    vm.form.month_raw = '2026-03-01'
    await vm.handleSave()
    await flushPromises()
    expect(createRecruitmentRecordMock).toHaveBeenCalledTimes(1)
    const payload = createRecruitmentRecordMock.mock.calls[0][0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('month_raw')
    expect(payload.child_name).toBe('王小明')
    expect(successMock).toHaveBeenCalled()
    expect(vm.dialogVisible).toBe(false)
    expect(wrapper.emitted('created')).toBeTruthy()
    expect(wrapper.emitted('created')![0][0]).toMatchObject({ id: 99 })
  })

  it('儲存失敗：顯示錯誤、不 emit created、saving 復位', async () => {
    createRecruitmentRecordMock.mockRejectedValue(new Error('boom'))
    const wrapper = mountComp()
    const vm = wrapper.vm as unknown as ExposedVm
    await vm.handleSave()
    await flushPromises()
    expect(errorMock).toHaveBeenCalled()
    expect(wrapper.emitted('created')).toBeFalsy()
    expect(vm.saving).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/components/recruitment/funnel/__tests__/FunnelAddVisit.test.ts`
Expected: FAIL（找不到 `../FunnelAddVisit.vue`）

- [ ] **Step 3: 建立 `src/components/recruitment/funnel/FunnelAddVisit.vue`**

```vue
<template>
  <span class="funnel-add-visit">
    <el-button
      v-if="canWrite"
      type="primary"
      size="small"
      @click="openDialog"
    >新增訪視</el-button>

    <RecruitmentRecordDialog
      v-model:visible="dialogVisible"
      mode="add"
      :form="form"
      :saving="saving"
      :district-suggestions="districtSuggestions"
      :source-suggestions="sourceSuggestions"
      :referrer-suggestions="referrerSuggestions"
      :no-deposit-reasons="noDepositReasons"
      @save="handleSave"
    />
  </span>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import { createRecruitmentRecord } from '@/api/recruitment'
import { apiError } from '@/utils/error'
import { hasPermission } from '@/utils/auth'
import { emptyVisitForm, type VisitFormState } from '@/constants/recruitment'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import RecruitmentRecordDialog from '@/components/recruitment/RecruitmentRecordDialog.vue'

const props = defineProps<{
  dashboard: ReturnType<typeof useRecruitmentDashboard>
}>()

const emit = defineEmits<{
  created: [record: Record<string, unknown>]
}>()

// 與「訪視明細」tab 同一把鎖：無 RECRUITMENT_WRITE 不顯示按鈕
const canWrite = computed(() => hasPermission('RECRUITMENT_WRITE'))

const dialogVisible = ref(false)
const saving = ref(false)
const form = ref<VisitFormState>(emptyVisitForm())

// dashboard 提供 autocomplete 建議來源（與 AdmissionsRecordsPanel 取法一致）
const { options, stats, fetchOptions } = props.dashboard

const districtSuggestions = computed((): string[] =>
  ((stats.value.by_district as { district?: string }[] | undefined) || [])
    .map((d) => d.district)
    .filter((d): d is string => typeof d === 'string'),
)
const sourceSuggestions = computed((): string[] =>
  (options.value.sources as string[] | undefined) || [],
)
const referrerSuggestions = computed((): string[] =>
  (options.value.referrers as string[] | undefined) || [],
)
const noDepositReasons = computed((): string[] =>
  (options.value.no_deposit_reasons as string[] | undefined) || [],
)

async function openDialog(): Promise<void> {
  await fetchOptions()
  form.value = emptyVisitForm()
  dialogVisible.value = true
}

async function handleSave(): Promise<void> {
  saving.value = true
  // 排除前端內部用的 month_raw，不送後端（與 AdmissionsRecordsPanel.handleSave 一致）
  const { month_raw: _mr, ...payload } = form.value
  try {
    const res = await createRecruitmentRecord(payload)
    ElMessage.success('新增成功')
    dialogVisible.value = false
    emit('created', (res as { data: Record<string, unknown> }).data)
  } catch (e) {
    ElMessage.error(apiError(e, '儲存失敗'))
  } finally {
    saving.value = false
  }
}

defineExpose({ form, dialogVisible, saving, openDialog, handleSave })
</script>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/components/recruitment/funnel/__tests__/FunnelAddVisit.test.ts`
Expected: PASS（5 個案例）

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/recruitment/funnel/FunnelAddVisit.vue src/components/recruitment/funnel/__tests__/FunnelAddVisit.test.ts
git commit -m "feat(recruitment): 新增 FunnelAddVisit 漏斗看板新增訪視元件"
```

---

### Task 3: `FunnelBoard.vue` 放入新增入口並在存檔後重載

**Files:**
- Modify: `src/components/recruitment/funnel/FunnelBoard.vue`
- Test: `src/components/recruitment/funnel/__tests__/FunnelBoard.test.ts`（新建）

**Interfaces:**
- Consumes: `FunnelAddVisit`（Task 2，emit `created(record)`）；`useRecruitmentFunnelStore`（`loadBoard({force})` / `getCardByVisitId(id)`）。
- Produces:
  - props 新增：`dashboard: ReturnType<typeof useRecruitmentDashboard>`
  - emits 新增：`created: []`
  - `onVisitCreated(record: { id: number; [k: string]: unknown })`

- [ ] **Step 1: 寫失敗測試**

新建 `src/components/recruitment/funnel/__tests__/FunnelBoard.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import FunnelBoard from '../FunnelBoard.vue'
import FunnelAddVisit from '../FunnelAddVisit.vue'
import { useRecruitmentFunnelStore } from '@/stores/recruitmentFunnel'
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'

const infoMock = vi.hoisted(() => vi.fn())
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    ElMessage: { success: vi.fn(), error: vi.fn(), info: infoMock, warning: vi.fn() },
  }
})

function emptyBoard() {
  return {
    stages: { visited: [], deposited: [], enrolled: [], active: [] },
    summary: { visited_count: 0, deposited_count: 0, enrolled_count: 0, active_count: 0 },
  }
}

function makeDashboard() {
  return {
    stats: ref<Record<string, unknown>>({ by_district: [] }),
    options: ref<Record<string, unknown>>({ sources: [], referrers: [], no_deposit_reasons: [] }),
    fetchOptions: vi.fn().mockResolvedValue(true),
  }
}

function mountBoard() {
  return mount(FunnelBoard, {
    props: { dashboard: makeDashboard() as unknown as ReturnType<typeof useRecruitmentDashboard> },
    global: {
      stubs: {
        FunnelAddVisit: true, FunnelColumn: true, FunnelSummaryBar: true,
        TransitionConfirmDialog: true, TimelineDrawer: true,
      },
    },
  })
}

describe('FunnelBoard 新增訪視串接', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    infoMock.mockReset()
  })

  it('子元件 created → 重載看板並 emit created', async () => {
    const store = useRecruitmentFunnelStore()
    store.board = { stages: { visited: [{ visit_id: 99 } as never], deposited: [], enrolled: [], active: [] },
      summary: emptyBoard().summary }
    const loadSpy = vi.spyOn(store, 'loadBoard').mockResolvedValue()
    const wrapper = mountBoard()
    await flushPromises()
    loadSpy.mockClear()

    await wrapper.findComponent(FunnelAddVisit).vm.$emit('created', { id: 99, month: '115.03' })
    await flushPromises()

    expect(loadSpy).toHaveBeenCalledWith({ force: true })
    expect(infoMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('created')).toBeTruthy()
  })

  it('新卡片不在目前篩選範圍 → 顯示提示', async () => {
    const store = useRecruitmentFunnelStore()
    store.board = emptyBoard() // 重載後仍無 visit_id=99
    vi.spyOn(store, 'loadBoard').mockResolvedValue()
    const wrapper = mountBoard()
    await flushPromises()

    await wrapper.findComponent(FunnelAddVisit).vm.$emit('created', { id: 99, month: '110.03' })
    await flushPromises()

    expect(infoMock).toHaveBeenCalledTimes(1)
    expect(infoMock.mock.calls[0][0]).toContain('不在目前篩選')
    expect(wrapper.emitted('created')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/components/recruitment/funnel/__tests__/FunnelBoard.test.ts`
Expected: FAIL（`dashboard` prop 不存在 / `onVisitCreated` 未定義 / 找不到 FunnelAddVisit 子元件）

- [ ] **Step 3: 改 `FunnelBoard.vue`**

3a. template：在 toolbar（`<div class="funnel-board__toolbar">`，目前 `:3-29`）的「重新整理」按鈕之後、`</div>` 之前，加入新增入口：

```html
      <el-button size="small" @click="onRefresh">重新整理</el-button>
      <FunnelAddVisit :dashboard="dashboard" class="funnel-board__add" @created="onVisitCreated" />
```

3b. `<script setup>`：import 區加入 `ElMessage` 與子元件、dashboard 型別：

```ts
import { ElSelect, ElOption, ElButton, ElMessage, ElMessageBox } from 'element-plus'
```
（把原本 `import { ElSelect, ElOption, ElButton, ElMessage, ElMessageBox } from 'element-plus'` 確認已含 `ElMessage`——目前已含，無需改。）新增：

```ts
import type { useRecruitmentDashboard } from '@/composables/useRecruitmentDashboard'
import FunnelAddVisit from './FunnelAddVisit.vue'
```

3c. 在 `const store = useRecruitmentFunnelStore()` 之前（或之後）宣告 props 與 emits：

```ts
const props = defineProps<{
  dashboard: ReturnType<typeof useRecruitmentDashboard>
}>()

const emit = defineEmits<{
  created: []
}>()
```

3d. 在 `onMounted` 之前新增處理函式：

```ts
// 看板新增訪視成功：重載看板使新卡片出現；若該訪視月份不在目前篩選的學年/學期，提示使用者
async function onVisitCreated(record: { id: number; [k: string]: unknown }): Promise<void> {
  await store.loadBoard({ force: true })
  if (!store.getCardByVisitId(record.id)) {
    ElMessage.info('新增成功，但該參觀日期不在目前篩選的學年/學期，請切換篩選查看')
  }
  emit('created')
}
```

3e. style：在 `.funnel-board__toolbar` 規則後新增，使新增按鈕靠右：

```css
.funnel-board__add {
  margin-left: auto;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/components/recruitment/funnel/__tests__/FunnelBoard.test.ts`
Expected: PASS（2 個案例）

- [ ] **Step 5: 跑整組 funnel 測試 + typecheck（確認未波及鄰居）**

Run: `npx vitest run src/components/recruitment/funnel && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/recruitment/funnel/FunnelBoard.vue src/components/recruitment/funnel/__tests__/FunnelBoard.test.ts
git commit -m "feat(recruitment): 漏斗看板放入新增訪視入口並於存檔後重載"
```

---

### Task 4: `AdmissionsView.vue` 傳入 dashboard 並同步統計

把既有 dashboard 實例傳給 `FunnelBoard`，並在看板新增後同步統計（與「訪視明細」新增後行為一致，但不重複重載看板——看板已由 Task 3 重載）。

**Files:**
- Modify: `src/views/students/AdmissionsView.vue`

**Interfaces:**
- Consumes: `FunnelBoard`（Task 3，props `dashboard`、emit `created`）；既有 `dashboard`（`useRecruitmentDashboard` 實例）、`statsPanelRef`（`invalidateLazyTabs`）。

- [ ] **Step 1: 改 template**

把 `<FunnelBoard />`（`:19`）改為：

```html
      <el-tab-pane label="漏斗看板" name="funnel">
        <FunnelBoard :dashboard="dashboard" @created="onFunnelVisitCreated" />
      </el-tab-pane>
```

- [ ] **Step 2: 改 `<script setup>` 新增處理函式**

在 `onRecordsChanged` 函式之後新增：

```ts
// 看板直接新增訪視後：同步統計與選項（看板本身已由 FunnelBoard 重載，故此處不再 loadBoard）
async function onFunnelVisitCreated() {
  await dashboard.fetchStats()
  dashboard.invalidateOptions()
  statsPanelRef.value?.invalidateLazyTabs()
}
```

- [ ] **Step 3: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS（無型別錯誤、無 lint 錯誤）

- [ ] **Step 4: 整合驗證（實機）**

啟動兩端後實際走一次（此為跨 UI 串接，非 unit test 可低成本覆蓋——核心邏輯已在 Task 2/3 unit test）：

```bash
cd ~/Desktop/ivyManageSystem && ./start.sh   # 後端 :8088 / 前端 :5173
```
以 `admin`/`ivytest123` 登入 → 進「招生入學」→「漏斗看板」：
1. 右上出現「新增訪視」按鈕（admin 有 RECRUITMENT_WRITE）。
2. 點開 → 填參觀日期（選當前學年內的近期日期）＋幼生姓名 → 儲存。
3. 看板「已訪視」欄出現新卡片（若勾「已預繳」則在「已預繳」欄），且出現「新增成功」訊息。
4. 切到「統計分析」tab 數字已同步。
5. （可選）把參觀日期改填到別的學年，存檔後出現「不在目前篩選的學年/學期」提示。

- [ ] **Step 5: Commit**

```bash
git add src/views/students/AdmissionsView.vue
git commit -m "feat(recruitment): 招生入學頁串接看板新增訪視並同步統計"
```

---

## Self-Review

**1. Spec coverage（對照 spec 各節）**
- spec §3.1 `FunnelAddVisit.vue` → Task 2 ✅（props/emits/建議清單/openDialog/handleSave/排除 month_raw/不接 useFormDraft）
- spec §3.2 `FunnelBoard.vue`（dashboard prop、toolbar 右側按鈕、onVisitCreated、跨學年提示、created emit）→ Task 3 ✅
- spec §3.3 `AdmissionsView.vue`（傳 dashboard、onFunnelVisitCreated 同步統計、不重複 loadBoard）→ Task 4 ✅
- spec §3.4 抽 `emptyVisitForm()` 共用 → Task 1 ✅
- spec §5 錯誤處理（apiError、權限雙層、跨學年不靜默）→ Task 2 handleSave + Task 3 提示 ✅
- spec §6 測試 → Task 1/2/3 各含 Vitest；Task 4 為 glue，以 typecheck＋整合驗證覆蓋（理由已註明）✅
- spec §7 YAGNI（不做快速表單/不加草稿/不自動切篩選/不改後端與卡片欄位）→ 計畫未越界 ✅

**2. Placeholder scan**：無 TBD/TODO；每個改碼步驟均含完整程式碼與確切指令。Task 4 Step 4 為實機驗證清單（非程式步驟），已說明理由與帳密。

**3. Type consistency**：`emptyVisitForm()` / `VisitFormState`（Task 1 產出）在 Task 2 被 import 一致；`FunnelAddVisit` emit `created(record)` 與 Task 3 `onVisitCreated(record)`、`findComponent(FunnelAddVisit).vm.$emit('created', ...)` 一致；`dashboard: ReturnType<typeof useRecruitmentDashboard>` 在 Task 2/3/4 一致；`store.loadBoard({ force: true })` / `getCardByVisitId(id)` 與 store 既有簽名一致。

## 收尾（Definition of Done）

- 四個 commit 完成後在 feature branch；spec 與 plan 一併已在分支。
- 全前端相關測試綠（至少 `npx vitest run src/constants src/components/recruitment` 範圍）＋ `npm run typecheck` ＋ `npm run lint` 綠。
- 是否 push／併 main／開 PR 依使用者指示；若 push 依 workspace「完成 = push + CI 綠 + worktree remove」紀律收尾。
