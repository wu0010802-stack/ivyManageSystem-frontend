# RWD P3 品質掃除（手機卡片視圖 + 觸控目標 + 平板中間帶）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抽薄泛型 `AdminListCards` 卡片元件並套到 3 個高價值 admin 列表（員工/班級出席/帳號），手機顯卡片、桌機維持表格；手機觸控目標 ≥44px（有界）；平板中間帶用 `--to-md`。

**Architecture:** 新增 dumb presentational `AdminListCards.vue`（每筆 item 一張 `el-card`，欄位由 `columns` config 驅動，custom cell/title/actions 走 slot）。各頁取 `const { isMobile } = useIsMobile()`，既有 `<el-table>` 包 `v-if="!isMobile"`、`<AdminListCards v-else>` 重用操作 markup。只在手機（`<768`）出現卡片，桌機零變化。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus（el-card/el-skeleton/el-tag/el-button/el-dropdown）、PostCSS custom-media（`--to-sm`/`--to-md`，P0 已接）、Vitest + @vue/test-utils。

## Global Constraints

- **繁體中文**：註解、commit、docstring。
- **TS-only**：`src/` 100% TS；新 SFC `<script setup lang="ts">`；禁 `: any`/`as any`（用 `: unknown`/泛型 narrow）；`noUnusedLocals` + CI typecheck blocking——未使用 import 必移除。
- **斷點**：只用 P0 既有 `useIsMobile()`（JS，`MOBILE_MAX_PX=767.98`）與 CSS `@media (--to-sm)`(≤767.98) / `@media (--to-md)`(≤1023.98)。**不新增斷點、不寫裸 `innerWidth`/`matchMedia`**（會被 `tests/unit/no-adhoc-breakpoints.test.ts` ratchet 擋）。
- **token**：用既有 design token（`--space-1..12` / `--radius-sm|md|lg|xl` / `--border-color` / `--text-primary|secondary|tertiary` / `--shadow-*`）；卡片 surface 用 `<el-card>` 自帶；**不硬編色**（lint:css 的 `ivy/canonical-token-prefix` 會警告 deprecated 前綴）。
- **只在手機出現卡片**：各頁 `v-if="!isMobile"` 表格 / `v-else` 卡片。桌機與平板（≥768）仍顯示表格。**畫面在桌機零變化。**
- **指令**：單檔測試 `npx vitest run <path>`；全量 `npm run test`；型別 `npm run typecheck`；CSS lint `npm run lint:css`；build `npm run build`。
- **commit**：Conventional Commits、一個 commit 一件事、結尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **共用 checkout 警告**：多 session 並行動 main；commit 只 `git add` 本任務檔，**勿** `git add -A`；`git status` 的 ` M components.d.ts` / `D node_modules` 是噪音，**絕不 add**。

---

### Task 1: `AdminListCards` 共用卡片元件

**Files:**
- Create: `src/components/common/AdminListCards.vue`
- Test: `src/components/common/__tests__/AdminListCards.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  interface AdminListColumn { label: string; prop: string; formatter?: (item: Record<string, unknown>) => unknown }
  defineProps<{
    items: Record<string, unknown>[]
    columns: AdminListColumn[]
    rowKey: string
    loading?: boolean
    emptyText?: string
  }>()
  // slots: #title="{ item }"（卡片標題；無則 fallback 第一欄值）、
  //        #actions="{ item }"（操作區，底部，按鈕自動 ≥44px）、
  //        #cell-<prop>="{ item }"（覆寫該欄 value 渲染，供 el-tag 等自訂）、
  //        #empty（覆寫空狀態）
  ```
- Task 2–4 消費此元件。

- [ ] **Step 1: 寫失敗測試**

`src/components/common/__tests__/AdminListCards.spec.ts`：
```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import AdminListCards from '@/components/common/AdminListCards.vue'

const items = [
  { id: 'A1', name: '王小明', dept: '行政' },
  { id: 'A2', name: '李小華', dept: '教學' },
]
const columns = [
  { label: '部門', prop: 'dept' },
  { label: '代號', prop: 'id', formatter: (it: Record<string, unknown>) => `#${it.id}` },
]

describe('AdminListCards', () => {
  it('每筆 item 渲染一張卡片，含 columns 的 label 與 value', () => {
    const w = mount(AdminListCards, { props: { items, columns, rowKey: 'id' } })
    const cards = w.findAll('.alc-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('部門')
    expect(cards[0].text()).toContain('行政')
    // formatter 生效
    expect(cards[0].text()).toContain('#A1')
  })

  it('#title slot 覆寫卡片標題；無 slot 時 fallback 第一欄', () => {
    const w = mount(AdminListCards, {
      props: { items, columns, rowKey: 'id' },
      slots: { title: ({ item }: { item: Record<string, unknown> }) => h('span', { class: 'my-title' }, String(item.name)) },
    })
    expect(w.find('.my-title').text()).toBe('王小明')
  })

  it('#cell-<prop> slot 覆寫該欄 value 渲染', () => {
    const w = mount(AdminListCards, {
      props: { items, columns, rowKey: 'id' },
      slots: { 'cell-dept': ({ item }: { item: Record<string, unknown> }) => h('em', { class: 'dept-tag' }, String(item.dept)) },
    })
    expect(w.find('.dept-tag').exists()).toBe(true)
  })

  it('#actions slot 渲染於每張卡片底部', () => {
    const w = mount(AdminListCards, {
      props: { items, columns, rowKey: 'id' },
      slots: { actions: ({ item }: { item: Record<string, unknown> }) => h('button', { class: 'act' }, String(item.id)) },
    })
    expect(w.findAll('.alc-card__actions .act')).toHaveLength(2)
  })

  it('loading 時不渲染資料卡片（顯示骨架）', () => {
    const w = mount(AdminListCards, { props: { items, columns, rowKey: 'id', loading: true } })
    expect(w.findAll('.alc-card:not(.alc-card--skeleton)')).toHaveLength(0)
    expect(w.find('.alc-card--skeleton').exists()).toBe(true)
  })

  it('items 空時顯示 emptyText', () => {
    const w = mount(AdminListCards, { props: { items: [], columns, rowKey: 'id', emptyText: '尚無資料' } })
    expect(w.find('.alc-empty').text()).toContain('尚無資料')
  })
})
```

- [ ] **Step 2: 跑測試確認 RED**

Run: `npx vitest run src/components/common/__tests__/AdminListCards.spec.ts`
Expected: FAIL（`Cannot find module '@/components/common/AdminListCards.vue'`）

- [ ] **Step 3: 實作 `src/components/common/AdminListCards.vue`**

```vue
<script setup lang="ts">
// 手機用的泛型卡片列表（dumb presentational）。桌機請續用 el-table；
// 由各頁 v-if="!isMobile" 決定何時改用本元件（比照 PortalAttendanceView 範式）。
interface AdminListColumn {
  label: string
  prop: string
  formatter?: (item: Record<string, unknown>) => unknown
}

const props = defineProps<{
  items: Record<string, unknown>[]
  columns: AdminListColumn[]
  rowKey: string
  loading?: boolean
  emptyText?: string
}>()

function cellValue(col: AdminListColumn, item: Record<string, unknown>): unknown {
  return col.formatter ? col.formatter(item) : item[col.prop]
}
function titleFallback(item: Record<string, unknown>): unknown {
  return props.columns.length ? item[props.columns[0].prop] : ''
}
</script>

<template>
  <div class="admin-list-cards">
    <template v-if="loading">
      <el-card v-for="n in 3" :key="`sk-${n}`" class="alc-card alc-card--skeleton" shadow="never">
        <el-skeleton :rows="3" animated />
      </el-card>
    </template>

    <div v-else-if="!items.length" class="alc-empty">
      <slot name="empty">{{ emptyText || '目前沒有資料' }}</slot>
    </div>

    <template v-else>
      <el-card
        v-for="item in items"
        :key="String(item[rowKey])"
        class="alc-card"
        shadow="never"
      >
        <header class="alc-card__title">
          <slot name="title" :item="item">{{ titleFallback(item) }}</slot>
        </header>
        <dl class="alc-card__fields">
          <div v-for="col in columns" :key="col.prop" class="alc-field">
            <dt class="alc-field__label">{{ col.label }}</dt>
            <dd class="alc-field__value">
              <slot :name="`cell-${col.prop}`" :item="item">{{ cellValue(col, item) }}</slot>
            </dd>
          </div>
        </dl>
        <footer v-if="$slots.actions" class="alc-card__actions">
          <slot name="actions" :item="item" />
        </footer>
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.admin-list-cards {
  display: grid;
  gap: var(--space-3);
}
.alc-card {
  border-radius: var(--radius-lg);
}
.alc-card__title {
  font-size: var(--text-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}
.alc-card__fields {
  display: grid;
  gap: var(--space-1);
  margin: 0;
}
.alc-field {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 28px;
  align-items: center;
}
.alc-field__label {
  color: var(--text-secondary);
  flex-shrink: 0;
}
.alc-field__value {
  text-align: right;
  color: var(--text-primary);
  margin: 0;
}
.alc-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border-color);
}
/* P3-2：卡片操作觸控目標 ≥44px */
.alc-card__actions :deep(.el-button) {
  min-height: 44px;
}
.alc-empty {
  text-align: center;
  color: var(--text-secondary);
  padding: var(--space-6);
}
</style>
```

- [ ] **Step 4: 跑測試確認 GREEN + 型別**

Run: `npx vitest run src/components/common/__tests__/AdminListCards.spec.ts`
Expected: PASS（6 passed）
Run: `npm run typecheck`
Expected: 無新錯誤

- [ ] **Step 5: Commit**

```bash
git add src/components/common/AdminListCards.vue src/components/common/__tests__/AdminListCards.spec.ts
git commit -m "feat(rwd): 新增 AdminListCards 手機卡片列表共用元件

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: EmployeeView 套用卡片視圖

**Files:**
- Modify: `src/views/EmployeeView.vue`（主表 `:935-996`）
- Test: `src/views/__tests__/EmployeeView.cardview.spec.ts`（Create）

**Interfaces:**
- Consumes: `AdminListCards`（Task 1）。EmployeeView 已 `import { useIsMobile }`（P0 收斂後）且有 `const { isMobile } = useIsMobile()`。

- [ ] **Step 1: 寫失敗測試（render 切換）**

`src/views/__tests__/EmployeeView.cardview.spec.ts`：
```ts
import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))
// 避免 onMounted 抓資料炸：mock store 與 API 依賴為最小空集合
vi.mock('@/stores/employee', () => ({ useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn(() => new Promise(() => {})) }) }))
vi.mock('@/stores/classroom', () => ({ useClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn(() => new Promise(() => {})) }) }))
vi.mock('@/stores/config', () => ({ useConfigStore: () => ({}) }))

import EmployeeView from '@/views/EmployeeView.vue'

describe('EmployeeView 手機卡片切換', () => {
  it('桌機顯示 el-table、手機顯示 AdminListCards', async () => {
    mockIsMobile.value = false
    const w = shallowMount(EmployeeView)
    await nextTick()
    expect(w.findComponent({ name: 'ElTable' }).exists() || w.find('.el-table').exists()).toBe(true)
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)

    mockIsMobile.value = true
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)
  })
})
```
> 若 EmployeeView 的 store 模組路徑或 onMounted 依賴與上述 mock 不符，先讀檔頂 import 補齊 mock（目標只是讓它 mount 成功；資料不重要）。`findComponent({ name: 'AdminListCards' })` 依元件 name；shallowMount 下子元件被 stub 仍可由 name 命中。

- [ ] **Step 2: 跑確認 RED**

Run: `npx vitest run src/views/__tests__/EmployeeView.cardview.spec.ts`
Expected: FAIL（目前無 AdminListCards，手機仍渲染 el-table）

- [ ] **Step 3: 改 `EmployeeView.vue`**

在 `<script setup>` import 區新增（若尚未 import AdminListCards）：
```ts
import AdminListCards from '@/components/common/AdminListCards.vue'
```
在 `<script setup>` 適當處（與其他 const 一起）新增 cardColumns（`__status` 為 slot-only 欄，prop 任意、值由 `#cell-__status` slot 渲染）：
```ts
const employeeCardColumns = [
  { label: '編號', prop: 'employee_id' },
  { label: '教育局系統', prop: 'title' },
  { label: '職位', prop: 'position' },
  { label: '到職日', prop: 'hire_date' },
  { label: '狀態', prop: '__status' },
]
```
把 `:935-996` 的 `<el-card v-else class="no-hover"> ... </el-card>`（含整個 el-table）改為**桌機才顯示**，並在其後加手機卡片版。即把：
```html
    <el-card v-else class="no-hover">
      <el-table :data="displayedEmployees" ...>
        ... （原樣保留全部 column）...
      </el-table>
    </el-card>
```
改為：
```html
    <el-card v-else-if="!isMobile" class="no-hover">
      <el-table :data="displayedEmployees" v-loading="loading" stripe style="width: 100%" max-height="600">
        <!-- 原樣保留全部 el-table-column（編號/姓名/教育局系統/職位/到職日/狀態/操作）與 #empty -->
      </el-table>
    </el-card>
    <AdminListCards
      v-else
      :items="displayedEmployees"
      :columns="employeeCardColumns"
      row-key="employee_id"
      :loading="loading"
      empty-text="尚無員工資料"
    >
      <template #title="{ item }">{{ item.name }}</template>
      <template #cell-__status="{ item }">
        <el-tag :type="getEmployeeStatus(item).type" size="small">{{ getEmployeeStatus(item).label }}</el-tag>
        <el-tag v-if="item.is_active && item.employee_type === 'regular' && item.base_salary === 0" type="warning" size="small" effect="plain" style="margin-left:4px">待補薪資</el-tag>
      </template>
      <template #actions="{ item }">
        <el-button link type="primary" size="small" @click="handleDetail(item)">詳情</el-button>
        <el-button v-if="canWriteEmployees" link type="primary" size="small" @click="openEditWithDraft(item)">編輯</el-button>
        <el-dropdown
          v-if="canWriteEmployees"
          trigger="click"
          @command="(cmd) => handleRowCommand(cmd, item)"
        >
          <el-button link type="primary" size="small">更多<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="item.is_active" command="offboard">辦理離職</el-dropdown-item>
              <el-dropdown-item command="delete" divided>刪除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </AdminListCards>
```
（`#cell-__status` 重用原狀態欄的 `getEmployeeStatus` tag + 待補薪資 tag。`getEmployeeStatus` / `handleDetail` / `canWriteEmployees` / `openEditWithDraft` / `handleRowCommand` / `ArrowDown` 皆為該頁既有 binding，直接重用。）

> ⚠ `el-card` 原本是 `v-else`（對應 `v-if="loading && !...length"` 的 TableSkeleton）。改成 `v-else-if="!isMobile"` 後，手機 loading 態由 AdminListCards 的 `:loading` 處理，桌機 loading 仍走 TableSkeleton（`v-if`）。確認 TableSkeleton 的 `v-if` 條件不變。

- [ ] **Step 4: 跑確認 GREEN + 型別 + 既有測試**

Run: `npx vitest run src/views/__tests__/EmployeeView.cardview.spec.ts`
Expected: PASS
Run: `npm run typecheck`
Expected: 無錯誤
Run: `npx vitest run src/views/__tests__ -t Employee`（若有既有 EmployeeView 測試，確認未壞）
Expected: PASS（或無對應測試時略過）

- [ ] **Step 5: Commit**

```bash
git add src/views/EmployeeView.vue src/views/__tests__/EmployeeView.cardview.spec.ts
git commit -m "feat(rwd): EmployeeView 手機改用 AdminListCards 卡片視圖

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: StudentAttendanceView 班級總覽套用卡片視圖

**Files:**
- Modify: `src/views/StudentAttendanceView.vue`（班級總覽表 `:420-468`）
- Test: `src/views/__tests__/StudentAttendanceView.cardview.spec.ts`（Create）

**Interfaces:**
- Consumes: `AdminListCards`。資料 `overviewRows`、loading `overviewLoading`、helper `rollcallStatusMeta(status)→{type,label}`。**需新增** `const { isMobile } = useIsMobile()`（檢查是否已 import useIsMobile；無則加 `import { useIsMobile } from '@/composables/useIsMobile'`）。

- [ ] **Step 1: 寫失敗測試**

`src/views/__tests__/StudentAttendanceView.cardview.spec.ts`（比照 Task 2 結構）：
```ts
import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

import StudentAttendanceView from '@/views/StudentAttendanceView.vue'

describe('StudentAttendanceView 班級總覽手機卡片切換', () => {
  it('手機顯示 AdminListCards、桌機不顯示', async () => {
    mockIsMobile.value = true
    const w = shallowMount(StudentAttendanceView)
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)

    mockIsMobile.value = false
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)
  })
})
```
> 若 mount 因其他 onMounted 依賴（API/store）失敗，補對應 vi.mock 讓它能 mount（資料給空/pending 即可）。讀該檔 `<script setup>` import 區決定要 mock 哪些。

- [ ] **Step 2: 跑確認 RED**

Run: `npx vitest run src/views/__tests__/StudentAttendanceView.cardview.spec.ts`
Expected: FAIL

- [ ] **Step 3: 改 `StudentAttendanceView.vue`**

import 區（若無）加 `import AdminListCards from '@/components/common/AdminListCards.vue'`、`import { useIsMobile } from '@/composables/useIsMobile'`；script 內加 `const { isMobile } = useIsMobile()` 與：
```ts
const classroomCardColumns = [
  { label: '在籍人數', prop: 'student_count' },
  { label: '已點名', prop: 'recorded_count' },
  { label: '未點名', prop: 'unmarked_count' },
  { label: '到校率', prop: '__rate' },
  { label: '點名完成率', prop: '__completion' },
  { label: '狀態', prop: '__status' },
]
```
把 `:420-468` 的班級總覽 `<el-table v-loading="overviewLoading" :data="overviewRows" ...> ... </el-table>` 包成桌機才顯示，並在其後加手機卡片版：
```html
        <el-table
          v-if="!isMobile"
          v-loading="overviewLoading"
          :data="overviewRows"
          stripe
          style="width: 100%; margin-top: 16px"
        >
          <!-- 原樣保留全部 column -->
        </el-table>
        <AdminListCards
          v-else
          :items="overviewRows"
          :columns="classroomCardColumns"
          row-key="classroom_name"
          :loading="overviewLoading"
          empty-text="目前沒有可顯示的班級出席資料"
          style="margin-top: 16px"
        >
          <template #title="{ item }">{{ item.classroom_name }}</template>
          <template #cell-__rate="{ item }">{{ item.attendance_rate }}%</template>
          <template #cell-__completion="{ item }">
            <el-tag :type="item.record_completion_rate >= 100 ? 'success' : item.record_completion_rate >= 70 ? 'warning' : 'danger'">{{ item.record_completion_rate }}%</el-tag>
          </template>
          <template #cell-__status="{ item }">
            <el-tag :type="rollcallStatusMeta(item.rollcall_status).type">{{ rollcallStatusMeta(item.rollcall_status).label }}</el-tag>
          </template>
          <template #actions="{ item }">
            <el-button link type="primary" @click="openDetailDrawer(item)">查看明細</el-button>
            <el-button link type="success" @click="goToMonthlyAnalysis(item)">月分析</el-button>
            <el-button link type="warning" @click="goToDailyEdit(item)">點名編修</el-button>
          </template>
        </AdminListCards>
```
> 原 `<el-empty v-if="!overviewLoading && overviewRows.length === 0">` 桌機空狀態保留（手機空狀態走 AdminListCards 的 empty-text）。確認它仍在表格區塊內、只在 `!isMobile` 顯示或維持原樣不重複顯示（可加 `v-if="!isMobile && ..."`）。

- [ ] **Step 4: 跑確認 GREEN + 型別**

Run: `npx vitest run src/views/__tests__/StudentAttendanceView.cardview.spec.ts`
Expected: PASS
Run: `npm run typecheck`
Expected: 無錯誤

- [ ] **Step 5: Commit**

```bash
git add src/views/StudentAttendanceView.vue src/views/__tests__/StudentAttendanceView.cardview.spec.ts
git commit -m "feat(rwd): 學生出席班級總覽手機改用 AdminListCards 卡片視圖

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: SettingsAccountsTab 帳號管理套用卡片視圖

**Files:**
- Modify: `src/components/settings/SettingsAccountsTab.vue`（帳號表 `:324-371`）
- Test: `src/components/settings/__tests__/SettingsAccountsTab.cardview.spec.ts`（Create）

**Interfaces:**
- Consumes: `AdminListCards`。資料 `filteredUsers`、loading `loadingUsers`、helper `getRoleTagType(role)`、`isUsingRoleDefault(row)`。**需新增** `const { isMobile } = useIsMobile()`（檢查既有 import）。

- [ ] **Step 1: 寫失敗測試**

`src/components/settings/__tests__/SettingsAccountsTab.cardview.spec.ts`：
```ts
import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

import SettingsAccountsTab from '@/components/settings/SettingsAccountsTab.vue'

describe('SettingsAccountsTab 手機卡片切換', () => {
  it('手機顯示 AdminListCards、桌機不顯示', async () => {
    mockIsMobile.value = true
    const w = shallowMount(SettingsAccountsTab)
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)

    mockIsMobile.value = false
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)
  })
})
```
> 補必要 vi.mock（讀 SettingsAccountsTab `<script setup>` import：API/store/composable）讓 shallowMount 成功。

- [ ] **Step 2: 跑確認 RED**

Run: `npx vitest run src/components/settings/__tests__/SettingsAccountsTab.cardview.spec.ts`
Expected: FAIL

- [ ] **Step 3: 改 `SettingsAccountsTab.vue`**

import 區加 `import AdminListCards from '@/components/common/AdminListCards.vue'` + `import { useIsMobile } from '@/composables/useIsMobile'`；script 加 `const { isMobile } = useIsMobile()` 與：
```ts
const accountCardColumns = [
  { label: '員工姓名', prop: 'employee_name' },
  { label: '角色', prop: '__role' },
  { label: '權限', prop: '__perm' },
  { label: '狀態', prop: '__status' },
  { label: '最後登入', prop: 'last_login' },
]
```
把 `:324-371` 的 `<el-table :data="filteredUsers" ...> ... </el-table>` 包成 `v-if="!isMobile"`，其後加：
```html
    <AdminListCards
      v-else
      :items="filteredUsers"
      :columns="accountCardColumns"
      row-key="username"
      :loading="loadingUsers"
      empty-text="尚無帳號"
      style="margin-top: 20px;"
    >
      <template #title="{ item }">{{ item.username }}</template>
      <template #cell-__role="{ item }">
        <el-tag :type="getRoleTagType(item.role)">{{ item.role_label || item.role }}</el-tag>
      </template>
      <template #cell-__perm="{ item }">
        <template v-if="item.role !== 'teacher'">
          <el-tag v-if="Array.isArray(item.permission_names) && item.permission_names.includes('*')" type="success" size="small">全部</el-tag>
          <el-tag v-else-if="isUsingRoleDefault(item)" type="info" size="small">預設</el-tag>
          <el-tag v-else type="warning" size="small">自訂</el-tag>
        </template>
        <span v-else style="color: var(--text-tertiary);">-</span>
      </template>
      <template #cell-__status="{ item }">
        <el-tag :type="item.is_active ? 'success' : 'info'" size="small">{{ item.is_active ? '啟用' : '停用' }}</el-tag>
      </template>
      <template #actions="{ item }">
        <el-button link type="primary" @click="handleEditUser(item)">編輯</el-button>
        <el-dropdown trigger="click" @command="(cmd: string) => onRowCommand(cmd, item)">
          <el-button link type="primary">更多<el-icon class="el-icon--right"><arrow-down /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="reset">重設密碼</el-dropdown-item>
              <el-dropdown-item command="delete" divided>刪除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </AdminListCards>
```

- [ ] **Step 4: 跑確認 GREEN + 型別 + 既有測試**

Run: `npx vitest run src/components/settings/__tests__/SettingsAccountsTab.cardview.spec.ts`
Expected: PASS
Run: `npm run typecheck`
Expected: 無錯誤
Run: `npx vitest run src/components/settings/__tests__`（確認既有 settings 測試未壞）
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/SettingsAccountsTab.vue src/components/settings/__tests__/SettingsAccountsTab.cardview.spec.ts
git commit -m "feat(rwd): 帳號管理手機改用 AdminListCards 卡片視圖

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: P3-2 AdminHeader 圖示鈕手機 ≥44px

**Files:**
- Modify: `src/components/layout/AdminHeader.vue`（`<style>` 區）

**Interfaces:**
- 純 CSS。用 `@media (--to-sm)`（P0 custom-media，≤767.98）。

- [ ] **Step 1: 讀現況 + 確認 header 圖示鈕的 class**

讀 `src/components/layout/AdminHeader.vue`，找出 header 右側圖示鈕（搜尋/通知/無障礙/帳號等）所在的 class（例如 `.header-actions .el-button` 或具體 class）。記下選擇器。

- [ ] **Step 2: 加手機觸控目標規則**

在 `AdminHeader.vue` 的 `<style scoped>` 末尾新增（把 `<選擇器>` 換成 Step 1 找到的實際 header 圖示鈕容器選擇器；若用 el-button 則 `:deep`）：
```css
/* P3-2：手機放大 header 圖示鈕觸控目標 ≥44px（桌機不變） */
@media (--to-sm) {
  <選擇器> :deep(.el-button) {
    min-width: 44px;
    min-height: 44px;
  }
}
```
> 只放大 header 圖示鈕，**勿** blanket 放大全站按鈕。若 header 圖示非 el-button（純 icon span/自訂鈕），對該實際元素設 min-width/height。

- [ ] **Step 3: 驗證 build + lint:css**

Run: `npm run build`
Expected: 成功（確認 `@media (--to-sm)` 被 postcss 解析；dist grep `--to-sm` 應為 0）
Run: `grep -rn -- "--to-sm" dist | head`
Expected: 無輸出（已解析為 max-width:767.98px）
Run: `npm run lint:css`
Expected: 無新 error

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AdminHeader.vue
git commit -m "feat(rwd): 手機放大 AdminHeader 圖示鈕觸控目標至 44px

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: P3-3 儀表板「學校概況」grid 平板中間帶

**Files:**
- Modify: 儀表板統計卡 grid 所在檔（先定位：`src/views/HomeView.vue` 或 `src/components/dashboard/*` 內「學校概況」section）

**Interfaces:**
- 純 CSS。`@media (--to-md)`(≤1023.98) 中間帶 2 欄 / `@media (--to-sm)` 1 欄。

- [ ] **Step 1: 定位「學校概況」統計卡 grid + 看現有 CSS**

`grep -rn "學校概況" src/views src/components`，找到該 section 的卡片容器 grid class，讀其現有 CSS。
- **若已用 `grid-template-columns: repeat(auto-fit, minmax(...))`** 自動 RWD → **不需改**，在本任務報告中文件化「已自動處理」並跳到 Step 4（commit 空變更則略過 commit、直接回報 DONE_WITH_CONCERNS 說明無需修改）。
- **若是固定 `repeat(4, 1fr)` 之類** → 進 Step 2。

- [ ] **Step 2: 加中間帶**

在該 grid 的 scoped style 加（把 `<grid選擇器>` 換成實際 class）：
```css
@media (--to-md) {
  <grid選擇器> { grid-template-columns: repeat(2, 1fr); }
}
@media (--to-sm) {
  <grid選擇器> { grid-template-columns: 1fr; }
}
```
> 若該 grid 桌機非 4 欄，依實際桌機欄數調整中間帶（桌機→平板減半→手機單欄的漸進）。

- [ ] **Step 3: 驗證 build + lint:css**

Run: `npm run build` → 成功；`grep -rn -- "--to-md\|--to-sm" dist | head` → 無輸出（已解析）
Run: `npm run lint:css` → 無新 error

- [ ] **Step 4: Commit（若有改）**

```bash
git add <該檔>
git commit -m "feat(rwd): 儀表板學校概況統計卡加平板中間帶（768–1024 兩欄）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定義（DoD）

- `AdminListCards.vue` + 6 測試綠；3 頁手機顯卡片、桌機顯表格，整合測試綠。
- 卡片操作 + AdminHeader 圖示鈕手機 ≥44px。
- 儀表板統計 grid 有平板中間帶（或文件化已自動處理）。
- `npm run test` / `typecheck` / `lint:css` / `build` 全綠；dist 無殘留 `--to-sm`/`--to-md`。
- 桌機畫面零變化（卡片只在 <768 出現）。
- 實機 390/768/1024px 截圖核對 3 頁無回歸（沿用 P1 方法；dev server 仍在跑）。

## 後續（不在本計畫）

其餘 admin 列表卡片視圖、全站觸控目標 audit、教師 Portal console warnings 另查。
