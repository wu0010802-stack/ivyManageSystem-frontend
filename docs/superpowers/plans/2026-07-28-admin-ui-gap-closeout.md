# 後台 UI 缺口收尾包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補完兩個「後端已就緒、前端缺口」的行政後台功能——公告家長端「指定學生」發送對象編輯，與費用範本管理（復活 FeeTemplateDialog／FeeGenerateModal ＋ 新增管理 Drawer）。

**Architecture:** 純 ivy-frontend 改動，不動後端、不跑 `gen:api`（無 schema 變更）。公告側把 scope 解析／payload 組裝抽成純函式（`src/utils/announcementScope.ts`）以利 TDD，view 只做接線；費用側從 git 歷史（`ed33e51d^`）復活兩個已刪元件並依現行慣例調整，再加一個新的列表容器 Drawer。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、Vitest + @vue/test-utils。

**Spec:** `docs/superpowers/specs/2026-07-28-admin-ui-gap-closeout-design.md`

## Global Constraints

- 工作目錄一律在 worktree：`~/Desktop/ivy-frontend/.claude/worktrees/admin-ui-gap-closeout`（分支 `feat/admin-ui-gap-closeout`；`node_modules` 已 symlink 至主 repo，勿在 worktree 內 `npm install`）。
- 全 TS：新業務檔 `.ts`／SFC `<script setup lang="ts">`；**禁 `: any` / `as any`**（ESLint blocking），用 `unknown` + narrow。
- 不新增任何 npm 依賴。
- API 呼叫一律走 `src/api/` 既有模組；dispatch path 不帶 `/api` 前綴。
- 測試檔：`tests/` 下 `.js`／`.ts` 皆可，co-located `src/**/__tests__/` 用 `.ts`。
- Commit：Conventional Commits 繁中、一 commit 一事、只在本 feature branch commit。
- 完工門檻：`npm run typecheck`、`npm run lint`、`npm run test` 全綠（既有紅字不惡化）。
- 金額門檻常數：財務簽核閾值 **NT$50,000**（後端 `FEE_PAYMENT_APPROVAL_THRESHOLD`）；超過時後端直接 403 附中文 detail（同步檢查，非送簽流程）。

---

### Task 1: `announcementScope` 純函式（scope 解析＋payload 組裝）

**Files:**
- Create: `src/utils/announcementScope.ts`
- Test: `tests/unit/utils/announcementScope.test.ts`

**Interfaces:**
- Consumes: 無（純函式）。
- Produces（Task 2 依賴，簽名務必一致）:
  - `interface ParentRecipientItem { scope: 'all' | 'classroom' | 'student' | 'guardian'; classroom_id?: number | null; student_id?: number | null; guardian_id?: number | null }`
  - `interface ParentScopeState { visibility: 'off' | 'all' | 'classroom' | 'custom'; classroomIds: number[]; studentIds: number[]; preservedItems: ParentRecipientItem[] }`
  - `resolveParentScope(items: ParentRecipientItem[]): ParentScopeState`
  - `buildParentRecipientsPayload(state: { visibility: string; classroomIds: number[]; studentIds: number[]; preservedItems: ParentRecipientItem[] }): ParentRecipientItem[] | null`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/utils/announcementScope.test.ts
import { describe, expect, it } from 'vitest'
import {
  buildParentRecipientsPayload,
  resolveParentScope,
} from '@/utils/announcementScope'

describe('resolveParentScope', () => {
  it('空陣列 → off', () => {
    expect(resolveParentScope([])).toEqual({
      visibility: 'off', classroomIds: [], studentIds: [], preservedItems: [],
    })
  })

  it('含 all scope → all', () => {
    const r = resolveParentScope([{ scope: 'all' }, { scope: 'classroom', classroom_id: 1 }])
    expect(r.visibility).toBe('all')
  })

  it('全部為 classroom → classroom + ids', () => {
    const r = resolveParentScope([
      { scope: 'classroom', classroom_id: 1 },
      { scope: 'classroom', classroom_id: 3 },
    ])
    expect(r.visibility).toBe('classroom')
    expect(r.classroomIds).toEqual([1, 3])
  })

  it('含 student → custom，student ids 抽出、非 student rows 進 preservedItems', () => {
    const r = resolveParentScope([
      { scope: 'student', student_id: 31 },
      { scope: 'student', student_id: 42 },
      { scope: 'guardian', guardian_id: 9 },
      { scope: 'classroom', classroom_id: 2 }, // 混排班級 rows 也必須保留
    ])
    expect(r.visibility).toBe('custom')
    expect(r.studentIds).toEqual([31, 42])
    expect(r.preservedItems).toEqual([
      { scope: 'guardian', guardian_id: 9 },
      { scope: 'classroom', classroom_id: 2 },
    ])
  })
})

describe('buildParentRecipientsPayload', () => {
  it('off → 空陣列（對家長隱藏）', () => {
    expect(buildParentRecipientsPayload({ visibility: 'off', classroomIds: [], studentIds: [], preservedItems: [] })).toEqual([])
  })

  it('all → [{scope: all}]', () => {
    expect(buildParentRecipientsPayload({ visibility: 'all', classroomIds: [], studentIds: [], preservedItems: [] })).toEqual([{ scope: 'all' }])
  })

  it('classroom → classroom rows', () => {
    expect(buildParentRecipientsPayload({ visibility: 'classroom', classroomIds: [1, 3], studentIds: [], preservedItems: [] })).toEqual([
      { scope: 'classroom', classroom_id: 1 },
      { scope: 'classroom', classroom_id: 3 },
    ])
  })

  it('custom → student rows ＋ preservedItems 原樣附回（replace-all 不變量）', () => {
    expect(buildParentRecipientsPayload({
      visibility: 'custom',
      classroomIds: [],
      studentIds: [31],
      preservedItems: [{ scope: 'guardian', guardian_id: 9 }],
    })).toEqual([
      { scope: 'student', student_id: 31 },
      { scope: 'guardian', guardian_id: 9 },
    ])
  })

  it('unchanged → null（呼叫端跳過 PUT）', () => {
    expect(buildParentRecipientsPayload({ visibility: 'unchanged', classroomIds: [], studentIds: [], preservedItems: [] })).toBeNull()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test -- --run tests/unit/utils/announcementScope.test.ts`
Expected: FAIL（模組不存在）。

- [ ] **Step 3: 實作**

```ts
// src/utils/announcementScope.ts
// 公告「家長端發送對象」的 scope 解析與 PUT payload 組裝。
// 後端 PUT /announcements/{id}/parent-recipients 為 replace-all 語意：
// custom 模式下 UI 只編輯 student rows，其餘 rows（guardian／混排 classroom）
// 必須原樣帶回，否則會被洗掉。

export interface ParentRecipientItem {
  scope: 'all' | 'classroom' | 'student' | 'guardian'
  classroom_id?: number | null
  student_id?: number | null
  guardian_id?: number | null
}

export interface ParentScopeState {
  visibility: 'off' | 'all' | 'classroom' | 'custom'
  classroomIds: number[]
  studentIds: number[]
  preservedItems: ParentRecipientItem[]
}

export function resolveParentScope(items: ParentRecipientItem[]): ParentScopeState {
  const empty: ParentScopeState = { visibility: 'off', classroomIds: [], studentIds: [], preservedItems: [] }
  if (items.length === 0) return empty
  if (items.some((it) => it.scope === 'all')) return { ...empty, visibility: 'all' }
  if (items.every((it) => it.scope === 'classroom' && it.classroom_id != null)) {
    return { ...empty, visibility: 'classroom', classroomIds: items.map((it) => it.classroom_id as number) }
  }
  return {
    visibility: 'custom',
    classroomIds: [],
    studentIds: items
      .filter((it) => it.scope === 'student' && it.student_id != null)
      .map((it) => it.student_id as number),
    preservedItems: items.filter((it) => it.scope !== 'student'),
  }
}

export function buildParentRecipientsPayload(state: {
  visibility: string
  classroomIds: number[]
  studentIds: number[]
  preservedItems: ParentRecipientItem[]
}): ParentRecipientItem[] | null {
  if (state.visibility === 'off') return []
  if (state.visibility === 'all') return [{ scope: 'all' }]
  if (state.visibility === 'classroom') {
    return state.classroomIds.map((cid) => ({ scope: 'classroom' as const, classroom_id: cid }))
  }
  if (state.visibility === 'custom') {
    return [
      ...state.studentIds.map((sid) => ({ scope: 'student' as const, student_id: sid })),
      ...state.preservedItems,
    ]
  }
  return null // 'unchanged'：讀取失敗保護，不變更既有設定
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test -- --run tests/unit/utils/announcementScope.test.ts`
Expected: PASS（11 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/announcementScope.ts tests/unit/utils/announcementScope.test.ts
git commit -m "feat: 公告家長端 scope 解析與 payload 組裝純函式

PUT parent-recipients 為 replace-all，custom 模式非 student rows 需原樣帶回。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: AnnouncementView 接上「指定學生」UI

**Files:**
- Modify: `src/views/AnnouncementView.vue`（form 定義 `:163-204`、`openEdit` `:212-256`、`buildParentRecipients` `:258-268`、`handleSubmit` 驗證 `:272-283`、template 家長端區 `:630-666`）
- Test: `tests/unit/views/AnnouncementView.customScope.test.js`

**Interfaces:**
- Consumes（Task 1）: `resolveParentScope` / `buildParentRecipientsPayload` / `ParentRecipientItem`。
- Consumes（既有）: `getStudents(params)`（`@/api/students`，回 `{ data: { items: [...] } }`）、`classroomOptions`（view 內既有，來自 `useClassroomStore`）。
- Produces: 無下游依賴。

- [ ] **Step 1: 寫失敗測試**

新檔 `tests/unit/views/AnnouncementView.customScope.test.js`。mock 佈局複製 `tests/unit/views/AnnouncementView.test.js` 的 `ElTableStub`／`ElTableColumnStub`／`flushPromises`，差異如下：

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import AnnouncementView from '@/views/AnnouncementView.vue'

const replaceAnnouncementParentRecipients = vi.fn(() => Promise.resolve({ data: {} }))
const getAnnouncementParentRecipients = vi.fn(() => Promise.resolve({
  data: { items: [
    { scope: 'student', student_id: 31 },
    { scope: 'guardian', guardian_id: 9 },
  ] },
}))

vi.mock('@/api/announcements', () => ({
  getAnnouncements: vi.fn(() => Promise.resolve({ data: { items: [
    { id: 1, title: '對象測試', content: '內容', priority: 'normal', is_pinned: false, created_by_name: '園長', created_at: '2026-03-14T09:00:00', read_count: 0, read_preview: [], attachments: [] },
  ] } })),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(() => Promise.resolve({ data: {} })),
  deleteAnnouncement: vi.fn(),
  getAnnouncementParentRecipients: (...args) => getAnnouncementParentRecipients(...args),
  getAnnouncementRecipients: vi.fn(() => Promise.resolve({ data: { employee_ids: [] } })),
  getAnnouncementReaders: vi.fn(() => Promise.resolve({ data: { items: [], total: 0 } })),
  replaceAnnouncementParentRecipients: (...args) => replaceAnnouncementParentRecipients(...args),
  uploadAnnouncementAttachment: vi.fn(() => Promise.resolve({ data: {} })),
  deleteAnnouncementAttachment: vi.fn(() => Promise.resolve({ data: {} })),
}))

vi.mock('@/api/employees', () => ({
  getEmployees: vi.fn(() => Promise.resolve({ data: [] })),
}))

vi.mock('@/api/students', () => ({
  getStudents: vi.fn(() => Promise.resolve({ data: { items: [
    { id: 31, name: '王小明', classroom_id: 1 },
    { id: 42, name: '李小美', classroom_id: 2 },
  ] } })),
}))

// el-dialog pass-through：渲染 default + footer slot，讓對話框內容可被斷言
const ElDialogStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', { class: 'dialog-stub' }, [slots.default?.(), slots.footer?.()]) : null)
  },
})

// ElTableStub / ElTableColumnStub / flushPromises：照抄 AnnouncementView.test.js 的定義

const mountView = () => mount(AnnouncementView, {
  global: { stubs: { 'el-dialog': ElDialogStub, 'el-table': ElTableStub, 'el-table-column': ElTableColumnStub } },
})

describe('AnnouncementView 指定學生 scope', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('編輯含 student+guardian scope 公告：custom radio 可選、學生選擇器渲染、保留提示顯示筆數', async () => {
    const wrapper = mountView()
    await flushPromises(); await nextTick()
    const editBtn = wrapper.findAll('el-button').find((b) => b.text().includes('編輯'))
    await editBtn.trigger('click')
    await flushPromises(); await nextTick()

    const customRadio = wrapper.find('[data-test="parent-custom-radio"]')
    expect(customRadio.exists()).toBe(true)
    expect(customRadio.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-test="parent-student-select"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="preserved-scope-hint"]').text()).toContain('1 筆')
  })

  it('送出時 payload = student rows + 保留的 guardian rows（replace-all 不洗掉）', async () => {
    const wrapper = mountView()
    await flushPromises(); await nextTick()
    await wrapper.findAll('el-button').find((b) => b.text().includes('編輯')).trigger('click')
    await flushPromises(); await nextTick()
    await wrapper.findAll('el-button').find((b) => b.text().includes('更新')).trigger('click')
    await flushPromises()

    expect(replaceAnnouncementParentRecipients).toHaveBeenCalledWith(1, [
      { scope: 'student', student_id: 31 },
      { scope: 'guardian', guardian_id: 9 },
    ])
  })

  it('parent-recipients 讀取失敗 → unchanged，送出不呼叫 replace（迴歸保護）', async () => {
    getAnnouncementParentRecipients.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mountView()
    await flushPromises(); await nextTick()
    await wrapper.findAll('el-button').find((b) => b.text().includes('編輯')).trigger('click')
    await flushPromises(); await nextTick()
    await wrapper.findAll('el-button').find((b) => b.text().includes('更新')).trigger('click')
    await flushPromises()

    expect(replaceAnnouncementParentRecipients).not.toHaveBeenCalled()
  })
})
```

註：未解析的 `el-button` 會被 Vue 當 custom element 渲染、click 監聽有效（既有測試同此模式）。若表格「編輯」按鈕實際為 icon-only，改以該按鈕既有的 data-* 或 aria 屬性選取。

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test -- --run tests/unit/views/AnnouncementView.customScope.test.js`
Expected: FAIL（`data-test="parent-custom-radio"` 不存在／payload 不符）。

- [ ] **Step 3: 修改 AnnouncementView.vue**

3a. script 新增 import 與狀態（置於既有 form 定義附近）：

```ts
import { getStudents } from '@/api/students'
import {
  buildParentRecipientsPayload,
  resolveParentScope,
  type ParentRecipientItem,
} from '@/utils/announcementScope'

// form reactive 內新增欄位（型別區塊同步加 parent_target_student_ids: number[]）：
//   parent_target_student_ids: [],

const preservedParentItems = ref<ParentRecipientItem[]>([])

// 學生選項：首次切到「指定學生」才載入（名冊百人級，全量 + 班級分組本地過濾）
const studentOptionsLoading = ref(false)
const studentOptionsLoaded = ref(false)
const studentOptionGroups = ref<{ label: string; options: { value: number; label: string }[] }[]>([])

const ensureStudentOptions = async () => {
  if (studentOptionsLoaded.value) return
  studentOptionsLoading.value = true
  try {
    const res = await getStudents({ is_active: true, limit: 500, skip: 0 })
    const items = ((res.data as { items?: { id: number; name?: string | null; classroom_id?: number | null }[] })?.items) || []
    const classroomLabel = new Map(classroomOptions.value.map((c) => [c.value, c.label]))
    const byClass = new Map<string, { value: number; label: string }[]>()
    for (const s of items) {
      const key = (s.classroom_id != null && classroomLabel.get(s.classroom_id)) || '未分班'
      if (!byClass.has(key)) byClass.set(key, [])
      byClass.get(key)!.push({ value: s.id, label: s.name || `#${s.id}` })
    }
    studentOptionGroups.value = [...byClass.entries()].map(([label, options]) => ({ label, options }))
    studentOptionsLoaded.value = true
  } catch (error) {
    ElMessage.warning(apiError(error, '載入學生名單失敗'))
  } finally {
    studentOptionsLoading.value = false
  }
}

watch(() => form.parent_visibility, (v) => {
  if (v === 'custom') void ensureStudentOptions()
})
```

（`classroomOptions` 為 view 內既有 computed；若其元素型別非 `{ value: number; label: string }` 依實際型別調整 Map 建構。）

3b. `resetForm` 與 `openEdit` 開頭 reset 區各加：

```ts
form.parent_target_student_ids = []
preservedParentItems.value = []
```

3c. `openEdit` 內原本 `if (items.length === 0) { ... } else { ... }` 整段分支（`:240-251`）替換為：

```ts
const items = ((parentRes.data as { items?: ParentRecipientItem[] })?.items) || []
const scope = resolveParentScope(items)
form.parent_visibility = scope.visibility
form.parent_target_classroom_ids = scope.classroomIds
form.parent_target_student_ids = scope.studentIds
preservedParentItems.value = scope.preservedItems
```

（catch 分支的 `unchanged` sentinel 不動。）

3d. `buildParentRecipients`（`:258-268`）整個函式替換為：

```ts
const buildParentRecipients = () => buildParentRecipientsPayload({
  visibility: form.parent_visibility,
  classroomIds: form.parent_target_classroom_ids,
  studentIds: form.parent_target_student_ids,
  preservedItems: preservedParentItems.value,
})
```

3e. `handleSubmit` 既有 classroom 驗證後新增：

```ts
if (
  form.parent_visibility === 'custom'
  && form.parent_target_student_ids.length === 0
  && preservedParentItems.value.length === 0
) {
  ElMessage.warning('已選「指定學生」對家長公開，請至少選擇一位學生')
  return
}
```

3f. template（`:630-666`）：radio 區的 custom 選項改為常駐可選、移除舊唯讀提示區塊：

```html
<el-form-item label="家長端">
  <el-radio-group v-model="form.parent_visibility">
    <el-radio value="off">不對家長公開</el-radio>
    <el-radio value="all">全部家長</el-radio>
    <el-radio value="classroom">指定班級</el-radio>
    <el-radio value="custom" data-test="parent-custom-radio">指定學生</el-radio>
    <el-radio v-if="form.parent_visibility === 'unchanged'" value="unchanged" disabled>
      讀取失敗，將不變更
    </el-radio>
  </el-radio-group>
</el-form-item>
<!-- 指定班級的 el-form-item 保持不動；其後新增： -->
<el-form-item v-if="form.parent_visibility === 'custom'" label="指定學生">
  <el-select
    v-model="form.parent_target_student_ids"
    multiple
    filterable
    placeholder="請選擇學生（該生所有已綁定家長都會收到）"
    :loading="studentOptionsLoading"
    style="width: 100%;"
    data-test="parent-student-select"
  >
    <el-option-group v-for="grp in studentOptionGroups" :key="grp.label" :label="grp.label">
      <el-option v-for="opt in grp.options" :key="opt.value" :label="opt.label" :value="opt.value" />
    </el-option-group>
  </el-select>
  <div v-if="preservedParentItems.length" class="text-muted" data-test="preserved-scope-hint">
    另含 {{ preservedParentItems.length }} 筆進階設定（班級／監護人層級），儲存時將原樣保留。
  </div>
</el-form-item>
<!-- 刪除原 :661-666 的「此公告…尚未支援編輯」唯讀提示 el-form-item -->
```

已離籍學生（不在 is_active 名冊）之既有選取 id：el-select 會以原值 chip 顯示、不影響送出，屬可接受行為。

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test -- --run tests/unit/views/AnnouncementView.customScope.test.js tests/unit/views/AnnouncementView.test.js tests/unit/views/AnnouncementView.contentGuard.test.js src/views/__tests__/AnnouncementView.toolbar.test.ts tests/unit/utils/announcementScope.test.ts`
Expected: 全 PASS（含既有三支公告測試迴歸）。

- [ ] **Step 5: Commit**

```bash
git add src/views/AnnouncementView.vue tests/unit/views/AnnouncementView.customScope.test.js
git commit -m "feat: 公告家長端發送對象支援「指定學生」

後端 scope API 2026-04-25 起即就緒，前端刻意 defer 的最後一塊。
guardian／混排 rows 以唯讀保留帶回，避免 replace-all 洗掉既有設定。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 復活 FeeTemplateDialog（八類型＋大額簽核提示＋快照警語）

**Files:**
- Create: `src/components/fees/FeeTemplateDialog.vue`（基底：`git show ed33e51d^:src/components/fees/FeeTemplateDialog.vue`）
- Test: `src/components/fees/__tests__/FeeTemplateDialog.test.ts`

**Interfaces:**
- Consumes（既有）: `createFeeTemplate(payload)` / `updateFeeTemplate(id, payload)`（`@/api/fees`，回值已解包 `.data`）、`FEE_TYPES`（`@/components/fees/feeTypes`）、`FormSection`（`@/components/common/FormSection.vue`）、`formatCurrency`（`@/utils/currency`）。
- Produces（Task 5 依賴）: 元件 props `{ modelValue: boolean; template?: FeeTemplateRow | null; grades?: { id: number; name: string }[] }`、emits `'update:modelValue'` / `'saved'`。`FeeTemplateRow` 形狀：`{ id: number; grade_id: number | null; school_year: number; semester: number; fee_type: string; name: string; amount: number; due_date_offset_days?: number; breakdown?: { tuition?: number; meal?: number; transport?: number } }`（即舊檔內的 `FeeTemplate` interface，改名避免與他檔混淆）。

- [ ] **Step 1: 還原歷史版本為起點**

```bash
git show ed33e51d^:src/components/fees/FeeTemplateDialog.vue > src/components/fees/FeeTemplateDialog.vue
```

- [ ] **Step 2: 寫失敗測試**

```ts
// src/components/fees/__tests__/FeeTemplateDialog.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import FeeTemplateDialog from '@/components/fees/FeeTemplateDialog.vue'

const createFeeTemplate = vi.fn(() => Promise.resolve({}))
const updateFeeTemplate = vi.fn(() => Promise.resolve({}))
vi.mock('@/api/fees', () => ({
  createFeeTemplate: (...args: unknown[]) => createFeeTemplate(...args),
  updateFeeTemplate: (...args: unknown[]) => updateFeeTemplate(...args),
}))

const ElDialogStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', {}, [slots.default?.(), slots.footer?.()]) : null)
  },
})
const ElFormStub = defineComponent({
  setup(_, { slots, expose }) {
    expose({ validate: () => Promise.resolve(true) })
    return () => h('form', {}, slots.default?.())
  },
})

const baseTemplate = {
  id: 7, grade_id: 2, school_year: 115, semester: 1, fee_type: 'monthly',
  name: '月費', amount: 9000, due_date_offset_days: 14,
  breakdown: { tuition: 5000, meal: 3000, transport: 1000 },
}

const mountDialog = (template: typeof baseTemplate | null = null) => mount(FeeTemplateDialog, {
  props: { modelValue: true, template, grades: [{ id: 2, name: '中班' }] },
  global: { stubs: { 'el-dialog': ElDialogStub, 'el-form': ElFormStub } },
})

describe('FeeTemplateDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('編輯模式只送可變欄位（識別四欄不進 payload）', async () => {
    const wrapper = mountDialog(baseTemplate)
    await wrapper.findAll('el-button').find((b) => b.text().includes('儲存'))!.trigger('click')
    await nextTick(); await Promise.resolve()
    expect(updateFeeTemplate).toHaveBeenCalledTimes(1)
    const [id, payload] = updateFeeTemplate.mock.calls[0] as [number, Record<string, unknown>]
    expect(id).toBe(7)
    expect(payload).not.toHaveProperty('grade_id')
    expect(payload).not.toHaveProperty('school_year')
    expect(payload).not.toHaveProperty('semester')
    expect(payload).not.toHaveProperty('fee_type')
    expect(payload.breakdown).toEqual({ tuition: 5000, meal: 3000, transport: 1000 })
  })

  it('月費組成總和≠金額 → 儲存鈕 disabled', async () => {
    const wrapper = mountDialog({ ...baseTemplate, amount: 9999 })
    await nextTick()
    const saveBtn = wrapper.findAll('el-button').find((b) => b.text().includes('儲存'))!
    expect(saveBtn.attributes('disabled')).toBeDefined()
  })

  it('金額達 50,000 → 顯示財務簽核門檻提示', async () => {
    const wrapper = mountDialog({ ...baseTemplate, fee_type: 'registration', amount: 60000, breakdown: undefined })
    await nextTick()
    expect(wrapper.find('[data-test="finance-approve-hint"]').exists()).toBe(true)
  })

  it('固定顯示快照語意警語', () => {
    const wrapper = mountDialog()
    expect(wrapper.text()).toContain('僅影響之後產生的費用單')
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npm run test -- --run src/components/fees/__tests__/FeeTemplateDialog.test.ts`
Expected: FAIL（門檻提示與警語不存在；`fee_type: 'registration'` 情境的 radio 不含 transport 等類型尚無影響）。

- [ ] **Step 4: 調整還原後的元件**

在還原基底上做四處修改：

4a. 費用類型 radio 從硬編 3 種改為 `FEE_TYPES` 的 record 類型（8 種）：

```html
<el-form-item label="費用類型" prop="fee_type">
  <el-radio-group v-model="form.fee_type" :disabled="isEdit">
    <el-radio v-for="t in TEMPLATE_FEE_TYPES" :key="t.value" :value="t.value">{{ t.label }}</el-radio>
  </el-radio-group>
</el-form-item>
```

```ts
import { FEE_TYPES } from '@/components/fees/feeTypes'

const TEMPLATE_FEE_TYPES = FEE_TYPES.filter((t) => t.source === 'record')
```

4b. 大額門檻常數與提示（金額欄位下方）：

```ts
// 與後端 FEE_PAYMENT_APPROVAL_THRESHOLD 對齊；超過時後端 403（需金流簽核權限）
const FEE_APPROVAL_THRESHOLD = 50_000

const needsFinanceApprove = computed(() => {
  if (form.amount >= FEE_APPROVAL_THRESHOLD) return true
  if (isEdit.value && props.template) {
    const old = props.template.amount
    return old >= FEE_APPROVAL_THRESHOLD || Math.abs(form.amount - old) >= FEE_APPROVAL_THRESHOLD
  }
  return false
})
```

```html
<div v-if="needsFinanceApprove" class="hint" data-test="finance-approve-hint">
  此金額達 NT$50,000 財務簽核門檻，需具備「金流簽核」權限者操作，否則將被拒絕。
</div>
```

4c. 快照語意警語（form 上方常駐）：

```html
<el-alert type="info" :closable="false" class="mb-12">
  範本修改僅影響之後產生的費用單；已產生的費用單不會回溯更新，差額請用「折抵／調整」處理。
</el-alert>
```

（`.mb-12 { margin-bottom: 12px; }` 加進 scoped style。）

4d. TS strict 整理：`form` 的 reactive 需明確型別（`grade_id: null as number | null` 或 `reactive<{...}>`）；舊檔 `FeeTemplate` interface 改名 `FeeTemplateRow`；`payload` 組裝處的型別註記依現行 ESLint 規則（禁 `as any`）調整；403／409 錯誤顯示沿用舊檔既有 `err.response?.data?.detail` 模式（已符合設計）。

- [ ] **Step 5: 跑測試確認通過**

Run: `npm run test -- --run src/components/fees/__tests__/FeeTemplateDialog.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 6: Commit**

```bash
git add src/components/fees/FeeTemplateDialog.vue src/components/fees/__tests__/FeeTemplateDialog.test.ts
git commit -m "feat: 復活費用範本編輯對話框（八類型＋大額簽核提示）

自 ed33e51d^ 還原（cc5f6536 改版後零引用被清），補上快照語意警語
與 NT\$50,000 門檻預先提示；識別四欄編輯時仍不可變。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 復活 FeeGenerateModal（批次產單 dry-run 流程）

**Files:**
- Create: `src/components/fees/FeeGenerateModal.vue`（基底：`git show ed33e51d^:src/components/fees/FeeGenerateModal.vue`）
- Test: `src/components/fees/__tests__/FeeGenerateModal.test.ts`

**Interfaces:**
- Consumes（既有）: `generateFeeRecords(payload)`（`@/api/fees`，已解包）、`currentRocYear()`（`@/utils/academic`）、`FEE_TYPES`（`@/components/fees/feeTypes`）。
- Produces（Task 5 依賴）: props `{ modelValue: boolean }`、emits `'update:modelValue'` / `'generated'`（payload `{ created: number; skipped: number; preview?: Record<string, unknown>[] }`）。

- [ ] **Step 1: 還原歷史版本為起點**

```bash
git show ed33e51d^:src/components/fees/FeeGenerateModal.vue > src/components/fees/FeeGenerateModal.vue
```

- [ ] **Step 2: 寫失敗測試**

```ts
// src/components/fees/__tests__/FeeGenerateModal.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import FeeGenerateModal from '@/components/fees/FeeGenerateModal.vue'

const generateFeeRecords = vi.fn(() => Promise.resolve({ created: 12, skipped: 3, preview: [] }))
vi.mock('@/api/fees', () => ({
  generateFeeRecords: (...args: unknown[]) => generateFeeRecords(...args),
}))

const ElDialogStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', {}, [slots.default?.(), slots.footer?.()]) : null)
  },
})

const flushPromises = async () => { await Promise.resolve(); await Promise.resolve() }

describe('FeeGenerateModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('預覽 → dry_run: true；確認 → dry_run: false 並 emit generated', async () => {
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: true },
      global: { stubs: { 'el-dialog': ElDialogStub } },
    })
    await wrapper.findAll('el-button').find((b) => b.text().includes('預覽'))!.trigger('click')
    await flushPromises(); await nextTick()
    expect(generateFeeRecords).toHaveBeenCalledTimes(1)
    expect((generateFeeRecords.mock.calls[0][0] as { dry_run: boolean }).dry_run).toBe(true)

    await wrapper.findAll('el-button').find((b) => b.text().includes('確認產生'))!.trigger('click')
    await flushPromises()
    expect(generateFeeRecords).toHaveBeenCalledTimes(2)
    expect((generateFeeRecords.mock.calls[1][0] as { dry_run: boolean }).dry_run).toBe(false)
    expect(wrapper.emitted('generated')).toBeTruthy()
  })

  it('未預覽前確認鈕 disabled', () => {
    const wrapper = mount(FeeGenerateModal, {
      props: { modelValue: true },
      global: { stubs: { 'el-dialog': ElDialogStub } },
    })
    const confirmBtn = wrapper.findAll('el-button').find((b) => b.text().includes('確認產生'))!
    expect(confirmBtn.attributes('disabled')).toBeDefined()
  })
})
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `npm run test -- --run src/components/fees/__tests__/FeeGenerateModal.test.ts`
Expected: FAIL（元件不存在／還原前）。還原基底後（Step 1 已做）本測試應接近通過——若已通過，直接進 Step 4 的調整再全跑。

- [ ] **Step 4: 調整還原後的元件**

4a. 費用類型 checkbox 從硬編 3 種改為 `FEE_TYPES` record 類型（與 Task 3 4a 同來源；月費附註保留）：

```html
<el-checkbox-group v-model="form.fee_types">
  <el-checkbox v-for="t in TEMPLATE_FEE_TYPES" :key="t.value" :value="t.value">
    {{ t.label }}{{ t.value === 'monthly' ? '（展開為 6 張）' : '' }}
  </el-checkbox>
</el-checkbox-group>
```

```ts
import { FEE_TYPES } from '@/components/fees/feeTypes'
const TEMPLATE_FEE_TYPES = FEE_TYPES.filter((t) => t.source === 'record')
```

預設勾選維持 `['registration', 'miscellaneous']`。

4b. 產單冪等提示（form 下方）：

```html
<el-alert type="info" :closable="false">
  已存在的（學生 × 範本 × 月份）組合會自動跳過，不會重複產生；範本修改後的差額不會自動補單。
</el-alert>
```

4c. TS strict 整理（同 Task 3 4d 標準）。

- [ ] **Step 5: 跑測試確認通過**

Run: `npm run test -- --run src/components/fees/__tests__/FeeGenerateModal.test.ts`
Expected: PASS（2 tests）。

- [ ] **Step 6: Commit**

```bash
git add src/components/fees/FeeGenerateModal.vue src/components/fees/__tests__/FeeGenerateModal.test.ts
git commit -m "feat: 復活批次產生費用單 Modal（dry-run 預覽流程）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: FeeTemplateManageDrawer ＋ 費用總覽入口整合

**Files:**
- Create: `src/components/fees/FeeTemplateManageDrawer.vue`
- Modify: `src/components/fees/FeeTemplateTab.vue`（toolbar `:13-18`、檔尾加子元件掛載）
- Test: `src/components/fees/__tests__/FeeTemplateManageDrawer.test.ts`

**Interfaces:**
- Consumes: `getFeeTemplates(params)` / `deleteFeeTemplate(id)`（`@/api/fees`，已解包）、`FeeTemplateDialog`（Task 3 的 props/emits）、`FEE_TYPE_LABELS`（`@/components/fees/feeTypes`）、`formatCurrency`（`@/utils/currency`）。
- Produces: props `{ modelValue: boolean; schoolYear: number; semester: number; grades: { id: number; name: string }[] }`、emits `'update:modelValue'` / `'changed'`（任何寫入後通知父層 reload）。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/components/fees/__tests__/FeeTemplateManageDrawer.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { ElMessageBox } from 'element-plus'
import FeeTemplateManageDrawer from '@/components/fees/FeeTemplateManageDrawer.vue'

const getFeeTemplates = vi.fn(() => Promise.resolve([
  { id: 7, grade_id: 2, school_year: 115, semester: 1, fee_type: 'monthly', name: '中班月費', amount: 9000, is_active: true },
]))
const deleteFeeTemplate = vi.fn(() => Promise.resolve({}))
vi.mock('@/api/fees', () => ({
  getFeeTemplates: (...args: unknown[]) => getFeeTemplates(...args),
  deleteFeeTemplate: (...args: unknown[]) => deleteFeeTemplate(...args),
  createFeeTemplate: vi.fn(),
  updateFeeTemplate: vi.fn(),
}))

const ElDrawerStub = defineComponent({
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots }) {
    return () => (props.modelValue ? h('div', {}, slots.default?.()) : null)
  },
})
// 與 tests/unit/views/AnnouncementView.test.js 相同的 table stub 模式：
// table 把 data 灌給 column stub，column stub 逐 row 呼叫 default slot
const ElTableColumnStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', {}, (props.data as Record<string, unknown>[]).map(
      (row, index) => h('div', { key: index }, slots.default ? slots.default({ row }) : []),
    ))
  },
})
const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () => h('div', {}, (slots.default?.() || []).map(
      (vnode, index) => h(vnode.type, { ...vnode.props, data: props.data, key: index }, vnode.children),
    ))
  },
})

const flushPromises = async () => { await Promise.resolve(); await Promise.resolve() }

const mountDrawer = () => mount(FeeTemplateManageDrawer, {
  props: { modelValue: true, schoolYear: 115, semester: 1, grades: [{ id: 2, name: '中班' }] },
  global: { stubs: { 'el-drawer': ElDrawerStub, 'el-table': ElTableStub, 'el-table-column': ElTableColumnStub, FeeTemplateDialog: true } },
})

describe('FeeTemplateManageDrawer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('開啟時以 props 年期載入範本並渲染列表', async () => {
    const wrapper = mountDrawer()
    await flushPromises(); await nextTick()
    expect(getFeeTemplates).toHaveBeenCalledWith({ school_year: 115, semester: 1 })
    expect(wrapper.text()).toContain('中班月費')
  })

  it('停用需 confirm，確認後呼叫 deleteFeeTemplate 並 emit changed', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValueOnce('confirm')
    const wrapper = mountDrawer()
    await flushPromises(); await nextTick()
    await wrapper.findAll('el-button').find((b) => b.text().includes('停用'))!.trigger('click')
    await flushPromises()
    expect(deleteFeeTemplate).toHaveBeenCalledWith(7)
    expect(wrapper.emitted('changed')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test -- --run src/components/fees/__tests__/FeeTemplateManageDrawer.test.ts`
Expected: FAIL（元件不存在）。

- [ ] **Step 3: 實作 Drawer**

```vue
<!-- src/components/fees/FeeTemplateManageDrawer.vue -->
<template>
  <el-drawer
    :model-value="modelValue"
    title="費用範本管理"
    size="720px"
    @update:model-value="emit('update:modelValue', $event)"
    @open="loadTemplates"
  >
    <el-alert type="info" :closable="false" class="mb-12">
      範本修改僅影響之後產生的費用單；已產生的費用單不會回溯更新，差額請用「折抵／調整」處理。
    </el-alert>

    <div class="drawer-toolbar">
      <span class="term-label">{{ schoolYear }} 學年度 {{ semester === 1 ? '上' : '下' }}學期</span>
      <el-button type="primary" @click="openCreate">新增範本</el-button>
    </div>

    <el-table v-loading="loading" :data="templates">
      <el-table-column label="年級" width="90">
        <template #default="{ row }">{{ gradeName(row.grade_id) }}</template>
      </el-table-column>
      <el-table-column label="類型" width="90">
        <template #default="{ row }">{{ FEE_TYPE_LABELS[row.fee_type] || row.fee_type }}</template>
      </el-table-column>
      <el-table-column prop="name" label="名稱" min-width="160" />
      <el-table-column label="金額" width="110" align="right">
        <template #default="{ row }">{{ formatCurrency(row.amount) }}</template>
      </el-table-column>
      <el-table-column label="狀態" width="80">
        <template #default="{ row }">
          <el-tag :type="row.is_active ? 'success' : 'info'">{{ row.is_active ? '啟用' : '已停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">編輯</el-button>
          <el-button v-if="row.is_active" link type="danger" @click="onDeactivate(row)">停用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <FeeTemplateDialog
      v-model="dialogVisible"
      :template="editing"
      :grades="grades"
      @saved="onSaved"
    />
  </el-drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteFeeTemplate, getFeeTemplates } from '@/api/fees'
import FeeTemplateDialog from '@/components/fees/FeeTemplateDialog.vue'
import { FEE_TYPE_LABELS } from '@/components/fees/feeTypes'
import { formatCurrency } from '@/utils/currency'

interface TemplateRow {
  id: number
  grade_id: number | null
  school_year: number
  semester: number
  fee_type: string
  name: string
  amount: number
  due_date_offset_days?: number
  breakdown?: { tuition?: number; meal?: number; transport?: number }
  is_active?: boolean
  [key: string]: unknown
}

const props = defineProps<{
  modelValue: boolean
  schoolYear: number
  semester: number
  grades: { id: number; name: string }[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: []
}>()

const loading = ref(false)
const templates = ref<TemplateRow[]>([])
const dialogVisible = ref(false)
const editing = ref<TemplateRow | null>(null)

const gradeName = (gid: number | null) =>
  props.grades.find((g) => g.id === gid)?.name || (gid != null ? `#${gid}` : '—')

async function loadTemplates() {
  loading.value = true
  try {
    const list = await getFeeTemplates({ school_year: props.schoolYear, semester: props.semester })
    templates.value = (list || []) as TemplateRow[]
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '載入範本失敗')
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  dialogVisible.value = true
}

function openEdit(row: TemplateRow) {
  editing.value = row
  dialogVisible.value = true
}

async function onSaved() {
  dialogVisible.value = false
  await loadTemplates()
  emit('changed')
}

async function onDeactivate(row: TemplateRow) {
  try {
    await ElMessageBox.confirm(
      `確定要停用「${row.name}」嗎？停用後不再參與產單，已產生的費用單不受影響。`,
      '確認停用',
      { confirmButtonText: '停用', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deleteFeeTemplate(row.id)
    ElMessage.success('已停用')
    await loadTemplates()
    emit('changed')
  } catch (e) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail || '停用失敗')
  }
}

// el-drawer @open 於既有開啟時不觸發首次（modelValue 初始即 true 的測試情境），補一次主動載入
if (props.modelValue) void loadTemplates()
</script>

<style scoped>
.mb-12 { margin-bottom: 12px; }
.drawer-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.term-label { color: var(--el-text-color-secondary); }
</style>
```

- [ ] **Step 4: 接上 FeeTemplateTab**

4a. toolbar（`:13-18`）移除 TODO 註解、加兩顆按鈕：

```html
<div class="view-actions">
  <el-button type="primary" @click="manageVisible = true">管理範本</el-button>
  <el-button @click="generateVisible = true">產生費用單</el-button>
  <el-button text @click="expandAll">展開全部</el-button>
  <el-button text @click="collapseAll">收合全部</el-button>
  <el-button @click="loadOverview">重新載入</el-button>
</div>
```

4b. template 末尾（`.fee-template-tab` 收尾前）掛子元件：

```html
<FeeTemplateManageDrawer
  v-model="manageVisible"
  :school-year="filterYear"
  :semester="filterSemester"
  :grades="drawerGrades"
  @changed="loadOverview"
/>
<FeeGenerateModal v-model="generateVisible" @generated="loadOverview" />
```

4c. script 加：

```ts
import FeeTemplateManageDrawer from '@/components/fees/FeeTemplateManageDrawer.vue'
import FeeGenerateModal from '@/components/fees/FeeGenerateModal.vue'

const manageVisible = ref(false)
const generateVisible = ref(false)
// 本檔 Grade.id 為 number | string（展示用寬鬆型別），Drawer/Dialog 需 number
const drawerGrades = computed(() =>
  grades.value
    .filter((g) => typeof g.id === 'number')
    .map((g) => ({ id: g.id as number, name: g.name })),
)
```

- [ ] **Step 5: 跑測試確認通過**

Run: `npm run test -- --run src/components/fees/__tests__/ src/views/__tests__/StudentFeeView.test.js`
Expected: 全 PASS（含 StudentFeeView 既有測試迴歸）。

- [ ] **Step 6: Commit**

```bash
git add src/components/fees/FeeTemplateManageDrawer.vue src/components/fees/__tests__/FeeTemplateManageDrawer.test.ts src/components/fees/FeeTemplateTab.vue
git commit -m "feat: 費用總覽接上範本管理 Drawer 與批次產單入口

補回 cc5f6536 拔掉的「編輯費用設定」缺口，範本 CRUD 不再只能打 API。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 全套驗證與收尾

**Files:** 無新增（驗證＋必要之最小修正）。

- [ ] **Step 1: 全套測試**

Run: `npm run test`
Expected: 全綠。任何非本次改動造成的既有紅字，記錄檔名後跳過（不惡化即可）；本次改動造成的紅字必修。

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 error。注意主 repo `main` 曾有 `IntegrationsHealthCard` 既有 TS 紅（若在本 worktree 出現，屬既有問題，記錄不修）。

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 error（特別注意新檔無 `as any`、無 unused disable directive）。

- [ ] **Step 4: 若上述步驟有本次改動造成的問題，修正並 commit**

```bash
git add -A && git commit -m "fix: 收尾 typecheck/lint 修正

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

（全綠則跳過此 commit。）

- [ ] **Step 5: 回報**

輸出：各 task 測試結果摘要、commit 清單（`git log --oneline main..HEAD`）、既有紅字（若有）清單。分支收束（merge 回 local main、不 push）由使用者確認後另行執行。
