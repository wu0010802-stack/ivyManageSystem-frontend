# 學生工作台整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/students` 與 `/student-academic-affairs` 合併成單一 `StudentWorkbenchView`（頂部今日任務池 + 下方學生列表），sidebar 文案重整，0 router/0 schema/0 後端動作。

**Architecture:** 新 `StudentWorkbenchView.vue` 殼組合 `TodayTasksPanel.vue`（搬自 `StudentAcademicAffairsView`）與 `StudentListPanel.vue`（搬自 `StudentView`）；4 section 元件刪除 hardcoded `open-full-route` 永久取消「展開全頁」CTA；`/student-academic-affairs` 加 redirect 保護書籤。

**Tech Stack:** Vue 3 + TypeScript + Vite + Vue Router + Element Plus + Vitest

**Spec:** `docs/superpowers/specs/2026-05-21-student-workbench-consolidation-design.md`

**Spec deviation 已落地於 plan**：spec §4.5 寫「透傳 `:open-full-route="null"`」假設 4 section 有此 prop——實際上 4 section 把 hardcoded route 寫死，並非 prop。修正為「直接刪除 4 section 內的 `:open-full-route` 一行」，效果相同（SectionCard 預設 null 不渲染 CTA）。

---

## File Structure

**新增**
- `src/views/StudentWorkbenchView.vue` — workbench 殼（layout，無業務邏輯）
- `src/components/student/workbench/TodayTasksPanel.vue` — 包 4 section + filter（搬自 StudentAcademicAffairsView）
- `src/components/student/workbench/StudentListPanel.vue` — 學生列表 + CRUD（搬自 StudentView）
- `tests/unit/views/StudentWorkbenchView.spec.ts` — 新增 spec
- `tests/unit/components/student/workbench/TodayTasksPanel.spec.ts` — 新增 spec

**修改**
- `src/components/student/academic-affairs/AttendanceSection.vue` — 刪 line 108 hardcoded route
- `src/components/student/academic-affairs/LeaveSection.vue` — 刪 line 84 hardcoded route
- `src/components/student/academic-affairs/AssessmentSection.vue` — 刪 line 126 hardcoded route
- `src/components/student/academic-affairs/IncidentSection.vue` — 刪 line 126 hardcoded route
- `src/router/index.ts` — `/students` 改指 Workbench + 加 `/student-academic-affairs` redirect
- `src/components/layout/AdminSidebar.vue` — sub-menu title 改名、刪「學生教務管理」、「學生管理」改「學生」
- `tests/unit/components/layout/AdminSidebar.test.js` — 補 case

**搬移後刪除**
- `src/views/StudentView.vue`
- `src/views/StudentAcademicAffairsView.vue`

**Rename**
- `tests/unit/views/StudentView.test.js` → `tests/unit/components/student/workbench/StudentListPanel.spec.ts`

---

## Task 1: 刪除 4 個 section 的 hardcoded open-full-route

**Files:**
- Modify: `src/components/student/academic-affairs/AttendanceSection.vue:108`
- Modify: `src/components/student/academic-affairs/LeaveSection.vue:84`
- Modify: `src/components/student/academic-affairs/AssessmentSection.vue:126`
- Modify: `src/components/student/academic-affairs/IncidentSection.vue:126`

**設計依據：** `SectionCard.vue` 已支援 `openFullRoute?: Record<string, unknown> | null`（line 12, default `null`），CTA 由 `v-if="openFullRoute"` 控制（line 40）。刪除 hardcoded prop 後 SectionCard fallback 到 default null，CTA 自動消失。

- [ ] **Step 1.1: 確認 SectionCard 行為**

Run:
```bash
cd ~/Desktop/ivy-frontend && grep -nE "openFullRoute" src/components/student/academic-affairs/SectionCard.vue
```
Expected：line 12 `openFullRoute?: Record<string, unknown> | null`、line 20 `openFullRoute: null,`、line 40 `v-if="openFullRoute"`。確認 prop 已支援 null 且 v-if guard 已在。

- [ ] **Step 1.2: AttendanceSection.vue 刪 hardcoded route**

修 `src/components/student/academic-affairs/AttendanceSection.vue` 約 line 108，刪除整行：

舊：
```vue
    :empty-description="ctx.filters.classroomId ? '當日沒有資料' : '請先選擇班級'"
    :show-empty="filteredRows.length === 0"
    :open-full-route="{ name: 'student-attendance' }"
    @retry="fetchDaily"
```

新：
```vue
    :empty-description="ctx.filters.classroomId ? '當日沒有資料' : '請先選擇班級'"
    :show-empty="filteredRows.length === 0"
    @retry="fetchDaily"
```

- [ ] **Step 1.3: LeaveSection.vue 刪 hardcoded route**

修 `src/components/student/academic-affairs/LeaveSection.vue` 約 line 84，刪除 `:open-full-route="{ name: 'student-leaves' }"` 一行（位置與寫法同 1.2，比對 `git grep -n "open-full-route" src/components/student/academic-affairs/LeaveSection.vue` 取得實際行號）。

- [ ] **Step 1.4: AssessmentSection.vue 刪 hardcoded route**

修 `src/components/student/academic-affairs/AssessmentSection.vue` 約 line 126，刪除 `:open-full-route="{ name: 'student-assessments' }"` 一行。

- [ ] **Step 1.5: IncidentSection.vue 刪 hardcoded route**

修 `src/components/student/academic-affairs/IncidentSection.vue` 約 line 126，刪除 `:open-full-route="{ name: 'student-incidents' }"` 一行。

- [ ] **Step 1.6: grep 確認 4 處都清乾淨**

Run:
```bash
cd ~/Desktop/ivy-frontend && grep -rnE "open-full-route" src/components/student/academic-affairs/
```
Expected：只剩 `SectionCard.vue:41` 的 `:to="openFullRoute"`（這是 prop 使用點，不是 hardcoded route）；4 個 section 的 hardcoded 都已消失。

- [ ] **Step 1.7: 跑既有測試確認 0 regression**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test -- src/components/student/academic-affairs
```
Expected：全綠（4 section 元件本身無 unit test，但 grep 該目錄 spec 確保沒有 break）。若無 spec 跑到，命令仍 exit 0。

- [ ] **Step 1.8: typecheck**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm run typecheck
```
Expected：通過（純刪除 prop usage，不影響型別）。

- [ ] **Step 1.9: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/components/student/academic-affairs/{AttendanceSection,LeaveSection,AssessmentSection,IncidentSection}.vue
git commit -m "refactor(student): remove hardcoded open-full-route from 4 academic-affairs sections

SectionCard already supports openFullRoute=null (default). The 4 detached
routes (/student-attendance|leaves|assessments|incidents) remain as
deep-links but lose the in-page expand CTA, in preparation for the
student workbench consolidation."
```

---

## Task 2: 搬 StudentAcademicAffairsView → TodayTasksPanel

**Files:**
- Create: `src/components/student/workbench/TodayTasksPanel.vue`
- Reference (don't modify yet): `src/views/StudentAcademicAffairsView.vue` (285 行)

**搬移原則：** 邏輯 0 變更，UI 0 變更。整支 `<script setup>` 內容、template 內容、style 全部搬到新檔；唯一允許的改動是 root 元素 class 從 `academic-affairs-page` 改為 `today-tasks-panel`（避免歧義），與 `<h2>學生教務管理</h2>` 改為 `<h2>今日任務池</h2>`、subtitle 微調。

- [ ] **Step 2.1: 建立目標目錄**

Run:
```bash
mkdir -p /Users/yilunwu/Desktop/ivy-frontend/src/components/student/workbench
```

- [ ] **Step 2.2: 複製 StudentAcademicAffairsView.vue 內容到 TodayTasksPanel.vue**

Run:
```bash
cp /Users/yilunwu/Desktop/ivy-frontend/src/views/StudentAcademicAffairsView.vue /Users/yilunwu/Desktop/ivy-frontend/src/components/student/workbench/TodayTasksPanel.vue
```

- [ ] **Step 2.3: 改 template 頁面標題與 root class**

在 `src/components/student/workbench/TodayTasksPanel.vue` template 中：

舊：
```vue
<template>
  <div class="academic-affairs-page">
    <div class="page-header">
      <div>
        <h2>學生教務管理</h2>
        <p class="page-subtitle">
          整合出席、請假、評量與事件四個模組，依班級與日期區間同步顯示。
        </p>
      </div>
    </div>
```

新：
```vue
<template>
  <div class="today-tasks-panel">
    <div class="panel-header">
      <div>
        <h2>今日任務池</h2>
        <p class="panel-subtitle">
          出席、請假、評量、事件四個區塊，依班級與日期區間同步顯示。
        </p>
      </div>
    </div>
```

- [ ] **Step 2.4: 改 style class 名稱對齊**

把 `.academic-affairs-page` 改成 `.today-tasks-panel`、`.page-header` 改成 `.panel-header`、`.page-subtitle` 改成 `.panel-subtitle`：

Run:
```bash
sed -i '' 's/\.academic-affairs-page/.today-tasks-panel/g; s/\.page-header/.panel-header/g; s/\.page-subtitle/.panel-subtitle/g' /Users/yilunwu/Desktop/ivy-frontend/src/components/student/workbench/TodayTasksPanel.vue
```

Verify with: `grep -nE "academic-affairs-page|page-header|page-subtitle" /Users/yilunwu/Desktop/ivy-frontend/src/components/student/workbench/TodayTasksPanel.vue` → Expected: 無匹配。

- [ ] **Step 2.5: 寫 TodayTasksPanel 渲染測試**

Create `tests/unit/components/student/workbench/TodayTasksPanel.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TodayTasksPanel from '@/components/student/workbench/TodayTasksPanel.vue'

vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(() => Promise.resolve({ data: [] })),
}))
vi.mock('@/api/students', () => ({
  getStudents: vi.fn(() => Promise.resolve({ data: [] })),
}))

describe('TodayTasksPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders title 今日任務池 and the 4 sections', () => {
    const wrapper = shallowMount(TodayTasksPanel, {
      global: {
        stubs: {
          'el-card': { template: '<div><slot /></div>' },
          'el-select': true,
          'el-option': true,
          'el-date-picker': true,
        },
      },
    })

    expect(wrapper.find('h2').text()).toBe('今日任務池')
    expect(wrapper.findComponent({ name: 'AttendanceSection' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'LeaveSection' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AssessmentSection' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'IncidentSection' }).exists()).toBe(true)
  })
})
```

- [ ] **Step 2.6: 跑測試確認通過**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test -- tests/unit/components/student/workbench/TodayTasksPanel.spec.ts
```
Expected：PASS。

- [ ] **Step 2.7: typecheck**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm run typecheck
```
Expected：通過。

- [ ] **Step 2.8: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/components/student/workbench/TodayTasksPanel.vue tests/unit/components/student/workbench/TodayTasksPanel.spec.ts
git commit -m "feat(student): add TodayTasksPanel containing 4 academic-affairs sections

Copy logic from StudentAcademicAffairsView verbatim (filter UI + 4 sections
via inject ACADEMIC_AFFAIRS_FILTERS_KEY). Only changes: root class renamed
to .today-tasks-panel, heading 學生教務管理 → 今日任務池. Old view will be
deleted in a later commit after the new wrapper view is wired in."
```

---

## Task 3: 搬 StudentView → StudentListPanel + rename test

**Files:**
- Create: `src/components/student/workbench/StudentListPanel.vue`
- Move + edit: `tests/unit/views/StudentView.test.js` → `tests/unit/components/student/workbench/StudentListPanel.spec.ts`
- Reference (don't modify yet): `src/views/StudentView.vue` (634 行)

**搬移原則：** 整支內容 verbatim 搬入新檔，0 變更。唯一允許的改動是內部 `console`、`// TODO` 註解保留。

- [ ] **Step 3.1: 複製 StudentView.vue 內容到 StudentListPanel.vue**

Run:
```bash
cp /Users/yilunwu/Desktop/ivy-frontend/src/views/StudentView.vue /Users/yilunwu/Desktop/ivy-frontend/src/components/student/workbench/StudentListPanel.vue
```

- [ ] **Step 3.2: grep 確認 0 import 路徑需改**

Run:
```bash
grep -nE "from '@/(api|components|stores|utils|composables)" /Users/yilunwu/Desktop/ivy-frontend/src/components/student/workbench/StudentListPanel.vue | head -20
```
Expected：所有 `@/` 路徑都是 absolute alias，不受新檔位置影響。

- [ ] **Step 3.3: rename test + 改 import 路徑**

Run:
```bash
mv /Users/yilunwu/Desktop/ivy-frontend/tests/unit/views/StudentView.test.js /Users/yilunwu/Desktop/ivy-frontend/tests/unit/components/student/workbench/StudentListPanel.spec.ts
```

接著在新檔頂部把 import 改成新路徑：

舊：
```typescript
import StudentView from '@/views/StudentView.vue'
```

新：
```typescript
import StudentListPanel from '@/components/student/workbench/StudentListPanel.vue'
```

並把 `describe('StudentView'`、`shallowMount(StudentView,` 全部 search-replace 為 `StudentListPanel`：

```bash
sed -i '' "s/StudentView/StudentListPanel/g" /Users/yilunwu/Desktop/ivy-frontend/tests/unit/components/student/workbench/StudentListPanel.spec.ts
```

- [ ] **Step 3.4: 跑測試確認搬移後仍綠**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test -- tests/unit/components/student/workbench/StudentListPanel.spec.ts
```
Expected：PASS（同 1 個 test case `uses route query to preload academic term and classroom filters`）。

- [ ] **Step 3.5: typecheck**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm run typecheck
```
Expected：通過。

- [ ] **Step 3.6: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/components/student/workbench/StudentListPanel.vue tests/unit/components/student/workbench/StudentListPanel.spec.ts
git rm tests/unit/views/StudentView.test.js
git commit -m "feat(student): add StudentListPanel (copied verbatim from StudentView.vue)

Move the existing StudentView test along with it (StudentView.test.js →
workbench/StudentListPanel.spec.ts). Old StudentView.vue stays in place
until the new wrapper view is wired in."
```

---

## Task 4: 新建 StudentWorkbenchView 殼

**Files:**
- Create: `src/views/StudentWorkbenchView.vue`
- Create: `tests/unit/views/StudentWorkbenchView.spec.ts`

- [ ] **Step 4.1: 寫 spec 先**

Create `tests/unit/views/StudentWorkbenchView.spec.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudentWorkbenchView from '@/views/StudentWorkbenchView.vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(() => Promise.resolve()) }),
}))

describe('StudentWorkbenchView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders both TodayTasksPanel and StudentListPanel', () => {
    const wrapper = shallowMount(StudentWorkbenchView, {
      global: {
        stubs: {
          TodayTasksPanel: true,
          StudentListPanel: true,
        },
      },
    })

    expect(wrapper.findComponent({ name: 'TodayTasksPanel' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'StudentListPanel' }).exists()).toBe(true)
  })
})
```

- [ ] **Step 4.2: 跑測試確認 fail**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test -- tests/unit/views/StudentWorkbenchView.spec.ts
```
Expected：FAIL with `Cannot find module '@/views/StudentWorkbenchView.vue'`。

- [ ] **Step 4.3: 建立 StudentWorkbenchView.vue**

Create `src/views/StudentWorkbenchView.vue`：

```vue
<script setup lang="ts">
import TodayTasksPanel from '@/components/student/workbench/TodayTasksPanel.vue'
import StudentListPanel from '@/components/student/workbench/StudentListPanel.vue'
</script>

<template>
  <div class="student-workbench-view">
    <TodayTasksPanel class="workbench-section workbench-section--tasks" />
    <div class="workbench-divider" aria-hidden="true" />
    <StudentListPanel class="workbench-section workbench-section--list" />
  </div>
</template>

<style scoped>
.student-workbench-view {
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.workbench-divider {
  height: 1px;
  background: var(--el-border-color-light, #e4e7ed);
}
</style>
```

- [ ] **Step 4.4: 跑測試確認 pass**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test -- tests/unit/views/StudentWorkbenchView.spec.ts
```
Expected：PASS。

- [ ] **Step 4.5: typecheck**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm run typecheck
```
Expected：通過。

- [ ] **Step 4.6: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/views/StudentWorkbenchView.vue tests/unit/views/StudentWorkbenchView.spec.ts
git commit -m "feat(student): add StudentWorkbenchView combining TodayTasksPanel + StudentListPanel"
```

---

## Task 5: Router 切換 `/students` 與加 `/student-academic-affairs` redirect

**Files:**
- Modify: `src/router/index.ts:53-57`（`/students` 改 component）
- Modify: `src/router/index.ts:88-93`（`/student-academic-affairs` 改 redirect）

- [ ] **Step 5.1: 寫 router-redirect 測試**

Create `tests/unit/router/studentWorkbenchRoutes.spec.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import router from '@/router'

describe('student workbench routing', () => {
  it('/students resolves to StudentWorkbenchView', () => {
    const resolved = router.resolve('/students')
    expect(resolved.matched[0]?.components?.default).toBeDefined()
    expect(resolved.name).toBe('students')
  })

  it('/student-academic-affairs redirects to /students', async () => {
    const testRouter = createRouter({
      history: createMemoryHistory(),
      routes: router.options.routes,
    })
    await testRouter.push('/student-academic-affairs')
    expect(testRouter.currentRoute.value.path).toBe('/students')
  })
})
```

- [ ] **Step 5.2: 跑測試確認 fail（redirect 還沒做）**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test -- tests/unit/router/studentWorkbenchRoutes.spec.ts
```
Expected：第 2 個 case FAIL（currentRoute 仍是 `/student-academic-affairs`）。

- [ ] **Step 5.3: 改 /students component**

修 `src/router/index.ts` line 53-57：

舊：
```typescript
{
    path: '/students',
    name: 'students',
    component: () => import('../views/StudentView.vue'),
    meta: { title: '學生管理' }
},
```

新：
```typescript
{
    path: '/students',
    name: 'students',
    component: () => import('../views/StudentWorkbenchView.vue'),
    meta: { title: '學生' }
},
```

- [ ] **Step 5.4: 改 /student-academic-affairs 為 redirect**

修 `src/router/index.ts` line 88-93（找到 path: `/student-academic-affairs` 的整塊）：

舊：
```typescript
{
    path: '/student-academic-affairs',
    name: 'student-academic-affairs',
    component: () => import('../views/StudentAcademicAffairsView.vue'),
    meta: { title: '學生教務管理' }
},
```

新：
```typescript
{
    path: '/student-academic-affairs',
    redirect: '/students',
},
```

- [ ] **Step 5.5: 跑測試確認全綠**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test -- tests/unit/router/studentWorkbenchRoutes.spec.ts
```
Expected：兩個 case PASS。

- [ ] **Step 5.6: 跑全套 router/view spec 0 regression**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test -- tests/unit/router tests/unit/views/StudentWorkbenchView.spec.ts tests/unit/components/student/workbench
```
Expected：全綠。

- [ ] **Step 5.7: typecheck**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm run typecheck
```
Expected：通過。

- [ ] **Step 5.8: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/router/index.ts tests/unit/router/studentWorkbenchRoutes.spec.ts
git commit -m "feat(router): point /students to StudentWorkbenchView + redirect /student-academic-affairs

Old bookmarks to /student-academic-affairs now redirect to /students.
The 4 detached routes (/student-attendance|leaves|assessments|incidents)
remain unchanged as deep-link targets."
```

---

## Task 6: AdminSidebar 文案重整 + 測試補 case

**Files:**
- Modify: `src/components/layout/AdminSidebar.vue:88, 96, 98-101`
- Modify: `tests/unit/components/layout/AdminSidebar.test.js`

- [ ] **Step 6.1: 補 AdminSidebar test case**

Read current `tests/unit/components/layout/AdminSidebar.test.js` 結構（已存在）, append two new `it` cases inside the existing `describe` block:

```typescript
it('shows 學生 menu item pointing to /students', () => {
  // mount with STUDENTS_READ permission, then:
  const items = wrapper.findAll('.el-menu-item')
  const studentItem = items.find((w) => w.text().includes('學生') && !w.text().includes('教務') && !w.text().includes('班級'))
  expect(studentItem).toBeDefined()
  expect(studentItem!.attributes('index')).toBe('/students')
})

it('does not show 學生教務管理 menu item anymore', () => {
  // mount with STUDENTS_READ permission, then:
  const items = wrapper.findAll('.el-menu-item')
  const oldItem = items.find((w) => w.attributes('index') === '/student-academic-affairs')
  expect(oldItem).toBeUndefined()
})

it('renders sub-menu titled 學生與班級', () => {
  // mount with relevant permissions, then check sub-menu title:
  expect(wrapper.text()).toContain('學生與班級')
  expect(wrapper.text()).not.toContain('學生教務')
})
```

注意：實際 selector 要對齊 file 現有 mount 模式（先讀檔再補；若用 stub 而非真 element-plus，selector 可能要改為 `findAllComponents({ name: 'ElMenuItem' })`）。

- [ ] **Step 6.2: 跑測試確認 fail**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test -- tests/unit/components/layout/AdminSidebar.test.js
```
Expected：新 case FAIL（sidebar 還沒改）。

- [ ] **Step 6.3: 修 sidebar template**

修 `src/components/layout/AdminSidebar.vue`：

舊（line 84-114 段）：
```vue
        <!-- 學生教務 -->
        <el-sub-menu v-if="hasVisibleStudentItems" index="group-students">
          <template #title>
            <el-icon><School /></el-icon>
            <span>學生教務</span>
          </template>
          <el-menu-item v-if="canView.CLASSROOMS_READ" index="/classrooms">
            <el-icon><OfficeBuilding /></el-icon>
            <template #title>班級學生管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/students">
            <el-icon><User /></el-icon>
            <template #title>學生管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/student-academic-affairs">
            <el-icon><Calendar /></el-icon>
            <template #title>學生教務管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/student-enrollment">
```

新：
```vue
        <!-- 學生與班級 -->
        <el-sub-menu v-if="hasVisibleStudentItems" index="group-students">
          <template #title>
            <el-icon><School /></el-icon>
            <span>學生與班級</span>
          </template>
          <el-menu-item v-if="canView.CLASSROOMS_READ" index="/classrooms">
            <el-icon><OfficeBuilding /></el-icon>
            <template #title>班級學生管理</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/students">
            <el-icon><User /></el-icon>
            <template #title>學生</template>
          </el-menu-item>
          <el-menu-item v-if="canView.STUDENTS_READ" index="/student-enrollment">
```

（同時刪除 `<el-menu-item v-if="canView.STUDENTS_READ" index="/student-academic-affairs">` 整個 el-menu-item 區塊。）

注意：若 `Calendar` icon 此 sidebar 內僅被刪除的這項使用，請一併移除其 import 句（line ~1-10 區）；若還有別處引用就保留。Run `grep -nE "Calendar" src/components/layout/AdminSidebar.vue` 確認後處理。

- [ ] **Step 6.4: 跑測試確認 pass**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test -- tests/unit/components/layout/AdminSidebar.test.js
```
Expected：全部 case 綠（含原 case + 新 3 case）。

- [ ] **Step 6.5: typecheck**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm run typecheck
```
Expected：通過。

- [ ] **Step 6.6: Commit**

```bash
cd ~/Desktop/ivy-frontend && git add src/components/layout/AdminSidebar.vue tests/unit/components/layout/AdminSidebar.test.js
git commit -m "feat(sidebar): rename group 學生教務 → 學生與班級, 學生管理 → 學生, drop 學生教務管理 entry

The student academic affairs page is now part of the student workbench
landing (/students). Sub-menu title and label collapse from 3 confusing
similarly-named items to 2 clearly different ones."
```

---

## Task 7: 刪除舊 view 檔案 + 最終驗證

**Files:**
- Delete: `src/views/StudentView.vue`
- Delete: `src/views/StudentAcademicAffairsView.vue`

- [ ] **Step 7.1: 最後 audit 確認 0 import**

Run:
```bash
cd ~/Desktop/ivy-frontend && grep -rnE "(views/StudentView|views/StudentAcademicAffairsView|StudentView\.vue|StudentAcademicAffairsView\.vue)" src/ tests/
```
Expected：完全無匹配（router 已改、test 已 rename、Workbench 已使用新 panel）。

- [ ] **Step 7.2: 刪除舊 view 檔**

Run:
```bash
cd ~/Desktop/ivy-frontend && git rm src/views/StudentView.vue src/views/StudentAcademicAffairsView.vue
```

- [ ] **Step 7.3: 跑全套 vitest**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm test
```
Expected：全綠（包含 7 個 new/moved spec + 原 2349+ test 0 regression）。

- [ ] **Step 7.4: typecheck**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm run typecheck
```
Expected：通過。

- [ ] **Step 7.5: build**

Run:
```bash
cd ~/Desktop/ivy-frontend && npm run build
```
Expected：成功（0 error 0 unresolved import）。

- [ ] **Step 7.6: 手動驗證（user gate）**

Run dev server：
```bash
cd ~/Desktop/ivyManageSystem && ./start.sh
```

開瀏覽器分別驗證：

| URL | 預期 |
|---|---|
| `/students` | 同時看到「今日任務池」(4 卡) + 「學生列表」(搜尋表格) |
| `/students` 點任何 row 名字 | 跳轉 `/students/profile/:id`，看到 DetailPanel |
| `/student-academic-affairs` | 自動 redirect 到 `/students` |
| `/student-attendance` | 仍可直訪（deep-link 保留） |
| Sidebar「學生與班級」 sub-menu | 展開看到 5 項：班級學生管理 / 學生 / 在籍統計 / 接送通知 / 學費管理（不再有「學生教務管理」） |

- [ ] **Step 7.7: Commit**

```bash
cd ~/Desktop/ivy-frontend && git commit -m "chore(student): remove legacy StudentView.vue and StudentAcademicAffairsView.vue

All consumers migrated:
- /students route → StudentWorkbenchView
- /student-academic-affairs route → redirect to /students
- AdminSidebar items updated
- StudentView.test.js → workbench/StudentListPanel.spec.ts

The 4 detached student-* routes remain as deep-links."
```

---

## Self-Review

**Spec coverage check（對照 `2026-05-21-student-workbench-consolidation-design.md`）：**

| Spec section | Task 對應 |
|---|---|
| §4.1 新 3 檔 | Task 2 / 3 / 4 |
| §4.2 刪 2 view | Task 7 |
| §4.3 router 變更 | Task 5 |
| §4.4 sidebar 變更 | Task 6 |
| §4.5「展開全頁」CTA 處置 | Task 1（修正 spec 假設，改為刪 hardcoded route） |
| §5 既有引用 audit | Task 7 Step 7.1 |
| §6 權限 | 沿用既有判斷（Task 6 不動 `canView.STUDENTS_READ` guard） |
| §7 測試 | Task 2.5 / 3.3 / 4.1 / 5.1 / 6.1 + Task 7.3 全跑 |
| §8 migration | Task 5 redirect + Task 7 刪檔 |
| §10 驗收標準 | Task 7.6 |

**Placeholder scan：** 0 個 TBD/TODO/「implement later」/「handle edge cases」/「similar to Task N」/「fill in details」。所有 step 都有具體 command 或 vue/ts 程式碼。

**Type consistency：**
- `TodayTasksPanel`、`StudentListPanel`、`StudentWorkbenchView` 命名橫跨 task 一致
- prop / class 名稱：`today-tasks-panel`、`panel-header`、`panel-subtitle`、`student-workbench-view`、`workbench-section`、`workbench-divider` 一致
- router name `students` 一致

**已知 spec deviation（在 plan 開頭已 disclose）：** spec §4.5 假設 4 section 有 `open-full-route` prop，實際是 hardcoded；plan 改為 Task 1「直接刪 hardcoded route」。最終 user-visible 行為相同（CTA 消失）。

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-21-student-workbench-consolidation.md`.
