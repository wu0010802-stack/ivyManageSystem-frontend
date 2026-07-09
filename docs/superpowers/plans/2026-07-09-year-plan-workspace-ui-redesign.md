# 新學年預編班工作台式 UI/UX 改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 spec `docs/superpowers/specs/2026-07-09-year-plan-workspace-ui-redesign-design.md` 把 `/students/year-plan` 從「7000px 問題紅牆 + 長頁堆疊」改為「主表 + 右側固定側欄」工作台：問題依 code 聚合、待分班可勾選批次分派、locate 點擊定位接線、頁首動作鈕依狀態收斂。

**Architecture:** 純前端。selection 單一事實來源上收至 `YearPlanWorkspaceView`（`Set<number>`），`PlanRosterTable` 與新 `PlanSidePanel` 皆受控；問題面板重寫為 `PlanIssuesSummary`（依 `IssueOut.code` 聚合、預設收合）；後端 API 與 `useYearPlanWorkspace` 契約零改動。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + Element Plus + Vitest (@vue/test-utils, jsdom)。

## Global Constraints

- 全 TS：禁 `.js` 業務檔、禁 `: any`/`as any`（`: unknown` + narrow）。
- 文案一律繁體中文；样式只用既有 design tokens（`--space-*`、`--color-*-soft/hover`、`--neutral-*`、`--surface-color`、`--radius-*`、`--text-*`），不寫死色值、不新增依賴。
- 共用 checkout 有平行 session：commit 一律 path 限定 `git commit -m "..." -- <files>`；不跑 `git add -A`。
- 針對性測試：`npx vitest run <path>`；全套 `npm test`；typecheck `npm run typecheck`。
- 後端零改動；`Schema<'...'>` 型別一律取自 `@/api/_generated/typed`。
- 既有事件 `student-move`、`bulk-op`、`class-edit` payload 契約不變。

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `src/components/enrollment/planning/PlanIssuesSummary.vue` | Create | 問題聚合摘要（依 code 分組、展開、locate-issue） |
| `src/components/enrollment/planning/__tests__/PlanIssuesSummary.spec.ts` | Create | 上者測試 |
| `src/components/enrollment/planning/PlanSidePanel.vue` | Create | 側欄容器：問題摘要 + 待分班（搜尋/勾選/全選/拖曳源）+ 畢業/排除收合 |
| `src/components/enrollment/planning/__tests__/PlanSidePanel.spec.ts` | Create | 上者測試 |
| `src/components/enrollment/planning/PlanBatchToolbar.vue` | Modify | 加「清除選取」 |
| `src/components/enrollment/planning/PlanRosterTable.vue` | Modify | 受控 selection、移除底部收合區、locate expose、外部拖入 fallback、sticky 表頭 |
| `src/views/students/YearPlanWorkspaceView.vue` | Modify | 雙欄版面、selection 上收、locate 接線、狀態化動作鈕、窄幕抽屜 |
| `src/components/enrollment/planning/PlanIssuesPanel.vue` + spec | Delete | 被 PlanIssuesSummary 取代（Task 5 移除） |

---

### Task 1: PlanIssuesSummary 聚合摘要元件

**Files:**
- Create: `src/components/enrollment/planning/PlanIssuesSummary.vue`
- Test: `src/components/enrollment/planning/__tests__/PlanIssuesSummary.spec.ts`

**Interfaces:**
- Consumes: `Schema<'IssuesOut'>`（`{ blocking: IssueOut[]; warnings: IssueOut[] }`，`IssueOut = { code, message, plan_class_id?, student_id? }`）
- Produces: props `{ issues: IssuesOut }`；emit `'locate-issue': [issue: IssueOut]`。Task 2 的 PlanSidePanel 內嵌本元件並轉發 locate-issue。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/components/enrollment/planning/__tests__/PlanIssuesSummary.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import ElementPlus from 'element-plus'
import PlanIssuesSummary from '../PlanIssuesSummary.vue'
import type { Schema } from '@/api/_generated/typed'

type IssuesOut = Schema<'IssuesOut'>

function buildIssues(overrides: Partial<IssuesOut> = {}): IssuesOut {
  return {
    blocking: [
      { code: 'student_unassigned', message: '學生「小明」尚未分派草稿班級', plan_class_id: null, student_id: 1 },
      { code: 'student_unassigned', message: '學生「小華」尚未分派草稿班級', plan_class_id: null, student_id: 2 },
      { code: 'head_teacher_missing', message: '班級「小班A」尚未指派導師', plan_class_id: 10, student_id: null },
    ],
    warnings: [
      { code: 'assistant_teacher_missing', message: '班級「小班A」尚未指派副班導', plan_class_id: 10, student_id: null },
    ],
    ...overrides,
  }
}

function mountSummary(issues: IssuesOut = buildIssues()) {
  return mount(PlanIssuesSummary, { global: { plugins: [ElementPlus] }, props: { issues } })
}

describe('PlanIssuesSummary', () => {
  it('同 code 聚合成一組：組標題 + 組內筆數，嚴重度區塊顯示總數', () => {
    const w = mountSummary()
    // blocking：student_unassigned×2 + head_teacher_missing×1 → 2 組、總數 3
    const blockingSection = w.find('.severity-blocking')
    expect(blockingSection.find('.severity-count').text()).toBe('3')
    const groups = blockingSection.findAll('.group-toggle')
    expect(groups.length).toBe(2)
    expect(groups[0].text()).toContain('學生尚未分派班級')
    expect(groups[0].find('.group-count').text()).toBe('2')
    expect(groups[1].text()).toContain('班級尚未指派導師')
    // warnings：1 組
    const warningSection = w.find('.severity-warning')
    expect(warningSection.find('.severity-count').text()).toBe('1')
    expect(warningSection.findAll('.group-toggle').length).toBe(1)
  })

  it('預設收合：不渲染逐筆列；點組標題展開後渲染逐筆 message', async () => {
    const w = mountSummary()
    expect(w.findAll('.issue-item').length).toBe(0)
    await w.findAll('.group-toggle')[0].trigger('click')
    const items = w.findAll('.issue-item')
    expect(items.length).toBe(2)
    expect(items[0].text()).toContain('小明')
    // 再點一次收回
    await w.findAll('.group-toggle')[0].trigger('click')
    expect(w.findAll('.issue-item').length).toBe(0)
  })

  it('展開後點逐筆列 emit locate-issue 帶完整 issue 物件', async () => {
    const w = mountSummary()
    await w.findAll('.group-toggle')[0].trigger('click')
    await w.findAll('.issue-item')[1].trigger('click')
    const events = w.emitted('locate-issue')
    expect(events).toBeTruthy()
    expect(events![0][0]).toMatchObject({ code: 'student_unassigned', student_id: 2 })
  })

  it('未知 code fallback：以該組首筆 message 當組標題（不壞版）', () => {
    const w = mountSummary(buildIssues({
      blocking: [
        { code: 'brand_new_code', message: '某種新問題描述', plan_class_id: null, student_id: null },
      ],
    }))
    expect(w.find('.severity-blocking .group-title').text()).toBe('某種新問題描述')
  })

  it('全空顯示無問題訊息，且不渲染嚴重度區塊', () => {
    const w = mountSummary({ blocking: [], warnings: [] })
    expect(w.find('.issues-empty').exists()).toBe(true)
    expect(w.find('.severity-section').exists()).toBe(false)
  })

  it('僅 warnings 時不渲染 blocking 區塊', () => {
    const w = mountSummary(buildIssues({ blocking: [] }))
    expect(w.find('.severity-blocking').exists()).toBe(false)
    expect(w.find('.severity-warning').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd ~/Desktop/ivy-frontend && npx vitest run src/components/enrollment/planning/__tests__/PlanIssuesSummary.spec.ts`
Expected: FAIL（`Cannot find module '../PlanIssuesSummary.vue'`）

- [ ] **Step 3: 實作元件**

```vue
<!-- src/components/enrollment/planning/PlanIssuesSummary.vue -->
<template>
  <div class="plan-issues-summary">
    <div v-if="!hasIssues" class="issues-empty">
      <el-icon class="empty-icon"><CircleCheck /></el-icon>
      目前沒有偵測到問題
    </div>

    <section
      v-for="severity in visibleSeverities"
      :key="severity.key"
      class="severity-section"
      :class="`severity-${severity.key}`"
    >
      <div class="severity-header">
        <span class="severity-title">{{ severity.label }}</span>
        <span class="severity-count">{{ severity.total }}</span>
      </div>
      <div v-for="group in severity.groups" :key="group.key" class="issue-group">
        <button type="button" class="group-toggle" @click="toggleGroup(group.key)">
          <el-icon class="group-arrow" :class="{ expanded: expandedGroups.has(group.key) }">
            <ArrowRight />
          </el-icon>
          <span class="group-title">{{ group.title }}</span>
          <span class="group-count">{{ group.items.length }}</span>
        </button>
        <ul v-if="expandedGroups.has(group.key)" class="group-items">
          <li
            v-for="(issue, idx) in group.items"
            :key="idx"
            class="issue-item"
            @click="emit('locate-issue', issue)"
          >{{ issue.message }}</li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, CircleCheck } from '@element-plus/icons-vue'
import type { Schema } from '@/api/_generated/typed'

// 問題聚合摘要：同 code 併為一組（標題 + 計數），預設收合，展開才見逐筆。
// 取代逐筆平鋪的 PlanIssuesPanel（207 筆同文案問題曾把版面撐到 7000px+）。
// locate-issue 事件名與 payload 沿用舊 PlanIssuesPanel 契約，父層接線不變。

type IssuesOut = Schema<'IssuesOut'>
type IssueOut = Schema<'IssueOut'>

const props = defineProps<{ issues: IssuesOut }>()
const emit = defineEmits<{ 'locate-issue': [issue: IssueOut] }>()

// 與後端 services/classroom_year_plan/issues.py 的 code 對齊；未知 code fallback
// 用該組首筆 message 當標題（後端新增 code 時前端不壞版）。
const GROUP_TITLES: Record<string, string> = {
  student_unassigned: '學生尚未分派班級',
  retain_wrong_grade: '留級學生年級不符',
  capacity_exceeded: '班級人數超過容量',
  head_teacher_missing: '班級尚未指派導師',
  teacher_duplicate: '教師重複指派多班',
  student_missing_from_plan: '在籍生不在草稿中，需重新產生',
  plan_student_inactive: '學生已非在籍，套用時將跳過',
  assistant_teacher_missing: '班級尚未指派副班導',
  art_teacher_missing: '班級尚未指派美語老師',
}

interface IssueGroup {
  key: string
  title: string
  items: IssueOut[]
}

function groupByCode(items: IssueOut[], severity: string): IssueGroup[] {
  const order: string[] = []
  const map = new Map<string, IssueOut[]>()
  for (const issue of items) {
    if (!map.has(issue.code)) {
      map.set(issue.code, [])
      order.push(issue.code)
    }
    map.get(issue.code)!.push(issue)
  }
  return order.map(code => ({
    key: `${severity}:${code}`,
    title: GROUP_TITLES[code] ?? map.get(code)![0].message,
    items: map.get(code)!,
  }))
}

const visibleSeverities = computed(() =>
  [
    {
      key: 'blocking',
      label: '阻擋發布',
      total: props.issues.blocking.length,
      groups: groupByCode(props.issues.blocking, 'blocking'),
    },
    {
      key: 'warning',
      label: '提醒事項',
      total: props.issues.warnings.length,
      groups: groupByCode(props.issues.warnings, 'warning'),
    },
  ].filter(s => s.total > 0),
)

const hasIssues = computed(
  () => props.issues.blocking.length > 0 || props.issues.warnings.length > 0,
)

const expandedGroups = ref<Set<string>>(new Set())

function toggleGroup(key: string): void {
  if (expandedGroups.value.has(key)) expandedGroups.value.delete(key)
  else expandedGroups.value.add(key)
}
</script>

<style scoped>
.plan-issues-summary {
  font-size: var(--text-sm);
}

.issues-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  padding: var(--space-2) 0;
}

.empty-icon {
  color: var(--color-success);
}

.severity-section {
  margin-bottom: var(--space-3);
}

.severity-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  margin-bottom: var(--space-2);
}

.severity-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 6px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-xs);
  font-weight: 700;
}

.severity-blocking .severity-count {
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.severity-warning .severity-count {
  color: var(--color-warning-hover);
  background: var(--color-warning-soft);
}

.issue-group {
  margin-bottom: 2px;
}

.group-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}

.group-toggle:hover {
  background: var(--neutral-100);
}

.group-arrow {
  transition: transform 0.15s ease;
  color: var(--text-secondary);
}

.group-arrow.expanded {
  transform: rotate(90deg);
}

.group-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-count {
  font-weight: 600;
  color: var(--text-secondary);
  font-size: var(--text-xs);
}

.severity-blocking .group-count {
  color: var(--color-danger-hover);
}

.group-items {
  list-style: none;
  margin: 2px 0 var(--space-2);
  padding: 0 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 40vh;
  overflow-y: auto;
}

.issue-item {
  cursor: pointer;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.severity-blocking .issue-item {
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.severity-warning .issue-item {
  color: var(--color-warning-hover);
  background: var(--color-warning-soft);
}

.issue-item:hover {
  filter: brightness(0.95);
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/components/enrollment/planning/__tests__/PlanIssuesSummary.spec.ts`
Expected: PASS（6 tests）

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/components/enrollment/planning/PlanIssuesSummary.vue src/components/enrollment/planning/__tests__/PlanIssuesSummary.spec.ts
git commit -m "feat(year-plan): PlanIssuesSummary 問題聚合摘要元件（依 code 分組、預設收合）" -- src/components/enrollment/planning/PlanIssuesSummary.vue src/components/enrollment/planning/__tests__/PlanIssuesSummary.spec.ts
```

---

### Task 2: PlanSidePanel 側欄容器元件

**Files:**
- Create: `src/components/enrollment/planning/PlanSidePanel.vue`
- Test: `src/components/enrollment/planning/__tests__/PlanSidePanel.spec.ts`

**Interfaces:**
- Consumes: Task 1 的 `PlanIssuesSummary`（props `issues`、emit `locate-issue`）。
- Produces（Task 5 view 依賴）:
  - props `{ plan: Schema<'PlanDetailOut'>; editable: boolean; selectedIds: Set<number> }`
  - emits `'locate-issue': [issue: IssueOut]`、`'set-selected': [ids: number[], checked: boolean]`
  - `defineExpose({ locateStudent(studentId: number): Promise<boolean> })` — 清空搜尋後捲動至待分班列並閃爍。
  - 待分班列 `dragstart` 以 `dataTransfer.setData('text/plain', String(student.id))` 攜帶 id（Task 4 roster 的外部拖入 fallback 讀此值）。

- [ ] **Step 1: 寫失敗測試**

```ts
// src/components/enrollment/planning/__tests__/PlanSidePanel.spec.ts
import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import ElementPlus from 'element-plus'
import PlanSidePanel from '../PlanSidePanel.vue'
import type { Schema } from '@/api/_generated/typed'

type PlanDetail = Schema<'PlanDetailOut'>

beforeAll(() => {
  // jsdom 未實作 scrollIntoView；locateStudent 需要
  Element.prototype.scrollIntoView = vi.fn()
})

function buildPlan(overrides: Partial<PlanDetail> = {}): PlanDetail {
  return {
    id: 1,
    target_school_year: 115,
    source_school_year: 114,
    status: 'draft',
    version: 1,
    generated_at: '2026-06-01T00:00:00',
    published_at: null,
    applied_at: null,
    classes: [],
    students: [
      { id: 1, student_id: 'S001', name: '王小明', source_classroom_name: '幼幼A', plan_class_id: null, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      { id: 2, student_id: 'S002', name: '李小華', source_classroom_name: '幼幼B', plan_class_id: null, disposition: 'retain', exclude_reason: null, manually_adjusted: false, current_grade_name: '小班' },
      { id: 3, student_id: 'S003', name: '張小美', source_classroom_name: '大班A', plan_class_id: null, disposition: 'graduate', exclude_reason: null, manually_adjusted: false, current_grade_name: '大班' },
      { id: 4, student_id: 'S004', name: '陳小強', source_classroom_name: '中班B', plan_class_id: null, disposition: 'exclude', exclude_reason: '轉學', manually_adjusted: true, current_grade_name: '中班' },
      { id: 5, student_id: 'S005', name: '林已分', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
    ],
    issues: {
      blocking: [{ code: 'student_unassigned', message: '學生「王小明」尚未分派草稿班級', plan_class_id: null, student_id: 1 }],
      warnings: [],
    },
    ...overrides,
  }
}

function mountPanel(overrides: Partial<PlanDetail> = {}, editable = true, selectedIds = new Set<number>()) {
  return mount(PlanSidePanel, {
    global: { plugins: [ElementPlus] },
    props: { plan: buildPlan(overrides), editable, selectedIds },
  })
}

describe('PlanSidePanel', () => {
  it('待分班區只列 promote/retain 且未分班者（畢業/排除/已分班不列），顯示計數', () => {
    const w = mountPanel()
    const rows = w.findAll('.unassigned-row')
    expect(rows.length).toBe(2)
    expect(rows.map(r => r.find('.student-name').text())).toEqual(['王小明', '李小華'])
    expect(w.find('.unassigned-section .section-count').text()).toBe('2')
  })

  it('無未分班學生時不渲染待分班區', () => {
    const w = mountPanel({
      students: [
        { id: 5, student_id: 'S005', name: '林已分', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      ],
    })
    expect(w.find('.unassigned-section').exists()).toBe(false)
  })

  it('搜尋姓名 filter 可見列；全選只作用於 filter 後可見集合', async () => {
    const w = mountPanel()
    await w.find('.unassigned-search input').setValue('小華')
    expect(w.findAll('.unassigned-row').length).toBe(1)
    // 全選（此時只見李小華 id=2）
    await w.find('.select-all-checkbox input[type="checkbox"]').setValue(true)
    const events = w.emitted('set-selected')
    expect(events).toBeTruthy()
    expect(events![events.length - 1]).toEqual([[2], true])
  })

  it('勾選單一學生 emit set-selected([id], checked)', async () => {
    const w = mountPanel()
    await w.findAll('.unassigned-row input[type="checkbox"]')[0].setValue(true)
    expect(w.emitted('set-selected')![0]).toEqual([[1], true])
  })

  it('editable=false：不渲染 checkbox、列不可拖', () => {
    const w = mountPanel({}, false)
    expect(w.findAll('.unassigned-row input[type="checkbox"]').length).toBe(0)
    expect(w.findAll('.unassigned-row')[0].attributes('draggable')).toBe('false')
  })

  it('畢業/排除名單渲染於收合區（預設收合），含排除原因', () => {
    const w = mountPanel()
    const graduate = w.find('.graduate-bucket')
    expect(graduate.text()).toContain('畢業名單（1）')
    expect(graduate.text()).toContain('張小美')
    const exclude = w.find('.exclude-bucket')
    expect(exclude.text()).toContain('排除名單（1）')
    expect(exclude.text()).toContain('陳小強')
    expect(exclude.text()).toContain('轉學')
  })

  it('內嵌 PlanIssuesSummary 並轉發 locate-issue', async () => {
    const w = mountPanel()
    await w.find('.group-toggle').trigger('click')
    await w.find('.issue-item').trigger('click')
    const events = w.emitted('locate-issue')
    expect(events).toBeTruthy()
    expect(events![0][0]).toMatchObject({ code: 'student_unassigned', student_id: 1 })
  })

  it('locateStudent：清空搜尋後定位存在的待分班學生（flash class），不存在回 false', async () => {
    const w = mountPanel()
    await w.find('.unassigned-search input').setValue('查無此人')
    const vm = w.vm as unknown as { locateStudent: (id: number) => Promise<boolean> }
    expect(await vm.locateStudent(1)).toBe(true)
    expect(w.find('.unassigned-row[data-student-id="1"]').classes()).toContain('flash-highlight')
    expect(await vm.locateStudent(999)).toBe(false)
  })

  it('待分班列 dragstart 寫入 dataTransfer text/plain = student.id', async () => {
    const w = mountPanel()
    const setData = vi.fn()
    await w.findAll('.unassigned-row')[0].trigger('dragstart', {
      dataTransfer: { setData, effectAllowed: '' },
    })
    expect(setData).toHaveBeenCalledWith('text/plain', '1')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/components/enrollment/planning/__tests__/PlanSidePanel.spec.ts`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作元件**

```vue
<!-- src/components/enrollment/planning/PlanSidePanel.vue -->
<template>
  <aside ref="rootEl" class="plan-side-panel">
    <section class="panel-section">
      <PlanIssuesSummary :issues="plan.issues" @locate-issue="issue => emit('locate-issue', issue)" />
    </section>

    <!-- 待分班（promote/retain 但無 plan_class_id）：正常流程不應出現，防呆顯示並
         提供勾選/拖曳讓使用者能直接處理（舊版只有唯讀名單，未分班學生無法批次分派） -->
    <section v-if="unassignedStudents.length" class="panel-section unassigned-section">
      <div class="section-header">
        <el-checkbox
          v-if="editable"
          class="select-all-checkbox"
          :model-value="allVisibleSelected"
          :indeterminate="someVisibleSelected && !allVisibleSelected"
          @change="(val: string | number | boolean) => onSelectAllVisible(Boolean(val))"
        />
        <span class="section-title">待分班</span>
        <span class="section-count">{{ unassignedStudents.length }}</span>
      </div>
      <el-input
        v-model="searchQuery"
        class="unassigned-search"
        placeholder="搜尋姓名"
        size="small"
        clearable
      />
      <ul class="unassigned-list">
        <li
          v-for="s in visibleUnassigned"
          :key="s.id"
          class="unassigned-row"
          :data-student-id="s.id"
          :draggable="editable"
          @dragstart="onDragStart(s, $event)"
        >
          <el-checkbox
            v-if="editable"
            :model-value="selectedIds.has(s.id)"
            @change="(val: string | number | boolean) => emit('set-selected', [s.id], Boolean(val))"
          />
          <span class="student-name">{{ s.name }}</span>
          <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
        </li>
      </ul>
    </section>

    <el-collapse v-model="openSections" class="buckets-collapse">
      <el-collapse-item name="graduate" class="graduate-bucket" :title="`畢業名單（${graduateStudents.length}）`">
        <ul class="bucket-list">
          <li v-for="s in graduateStudents" :key="s.id">
            <span class="student-name">{{ s.name }}</span>
            <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
          </li>
        </ul>
      </el-collapse-item>
      <el-collapse-item name="exclude" class="exclude-bucket" :title="`排除名單（${excludeStudents.length}）`">
        <ul class="bucket-list">
          <li v-for="s in excludeStudents" :key="s.id">
            <span class="student-name">{{ s.name }}</span>
            <span class="student-source">{{ s.source_classroom_name ?? '' }}</span>
            <span v-if="s.exclude_reason" class="exclude-reason">（{{ s.exclude_reason }}）</span>
          </li>
        </ul>
      </el-collapse-item>
    </el-collapse>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { Schema } from '@/api/_generated/typed'
import PlanIssuesSummary from './PlanIssuesSummary.vue'

// 工作台右側欄：問題聚合摘要 + 待分班操作區 + 畢業/排除唯讀名單。
// selection 受控（selectedIds 由父層持有），勾選僅 emit set-selected，父層合併後
// 供 PlanBatchToolbar 批次派發——與 PlanRosterTable 的勾選共用同一集合。

type PlanDetail = Schema<'PlanDetailOut'>
type PlanStudent = Schema<'PlanStudentOut'>
type IssueOut = Schema<'IssueOut'>

const props = defineProps<{
  plan: PlanDetail
  editable: boolean
  selectedIds: Set<number>
}>()

const emit = defineEmits<{
  'locate-issue': [issue: IssueOut]
  'set-selected': [ids: number[], checked: boolean]
}>()

const unassignedStudents = computed(() =>
  props.plan.students.filter(
    s => (s.disposition === 'promote' || s.disposition === 'retain') && s.plan_class_id == null,
  ),
)
const graduateStudents = computed(() => props.plan.students.filter(s => s.disposition === 'graduate'))
const excludeStudents = computed(() => props.plan.students.filter(s => s.disposition === 'exclude'))

// ── 搜尋 + 全選（全選只作用於 filter 後可見集合，避免誤選看不到的人）──
const searchQuery = ref('')

const visibleUnassigned = computed(() => {
  const q = searchQuery.value.trim()
  if (!q) return unassignedStudents.value
  return unassignedStudents.value.filter(s => s.name.includes(q))
})

const allVisibleSelected = computed(
  () =>
    visibleUnassigned.value.length > 0 &&
    visibleUnassigned.value.every(s => props.selectedIds.has(s.id)),
)
const someVisibleSelected = computed(() =>
  visibleUnassigned.value.some(s => props.selectedIds.has(s.id)),
)

function onSelectAllVisible(checked: boolean): void {
  emit('set-selected', visibleUnassigned.value.map(s => s.id), checked)
}

// ── 拖曳來源：dataTransfer 攜帶 student.id，表格 onDrop 的外部 fallback 讀取。
// 側欄自身不是拖放目標（維持 drag-move spec 決策 2）。
function onDragStart(student: PlanStudent, event: DragEvent): void {
  if (!props.editable) return
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(student.id))
  }
}

// ── locate：issue 點擊定位未分班學生。目標可能被搜尋 filter 隱藏，先清空搜尋。
const rootEl = ref<HTMLElement | null>(null)
let flashTimer: number | null = null

async function locateStudent(studentId: number): Promise<boolean> {
  if (!unassignedStudents.value.some(s => s.id === studentId)) return false
  searchQuery.value = ''
  await nextTick()
  // 以 rootEl 範圍查詢（勿用 document.querySelector——test-utils mount 預設不掛
  // document，且 root 範圍天然避免與其他實例互撞）
  const el = rootEl.value?.querySelector(`.unassigned-row[data-student-id="${studentId}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.remove('flash-highlight')
  void (el as HTMLElement).offsetWidth // 強制 reflow 讓 animation 可重複觸發
  el.classList.add('flash-highlight')
  if (flashTimer != null) window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => el.classList.remove('flash-highlight'), 1600)
  return true
}

defineExpose({ locateStudent })

// 畢業/排除預設收合（雜亂主因之一是預設全開的長名單）
const openSections = ref<string[]>([])
</script>

<style scoped>
.plan-side-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  font-size: var(--text-sm);
}

.panel-section {
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--surface-color);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  margin-bottom: var(--space-2);
}

.section-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  padding: 0 6px;
  border-radius: var(--radius-full, 9999px);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--color-danger-hover);
  background: var(--color-danger-soft);
}

.unassigned-search {
  margin-bottom: var(--space-2);
}

.unassigned-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 40vh;
  overflow-y: auto;
}

.unassigned-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: var(--radius-sm);
  cursor: grab;
}

.unassigned-row[draggable='false'] {
  cursor: default;
}

.unassigned-row:hover {
  background: var(--neutral-100);
}

.student-name {
  font-weight: 500;
}

.student-source,
.exclude-reason {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.bucket-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 40vh;
  overflow-y: auto;
}

.bucket-list li {
  display: flex;
  align-items: center;
  gap: 6px;
}

@keyframes flash-highlight {
  0% {
    background: var(--color-primary-soft);
  }
  100% {
    background: transparent;
  }
}

:deep(.flash-highlight),
.flash-highlight {
  animation: flash-highlight 1.6s ease-out;
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/components/enrollment/planning/__tests__/PlanSidePanel.spec.ts`
Expected: PASS（9 tests）

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/components/enrollment/planning/PlanSidePanel.vue src/components/enrollment/planning/__tests__/PlanSidePanel.spec.ts
git commit -m "feat(year-plan): PlanSidePanel 側欄（問題摘要+待分班勾選/搜尋/拖曳源+畢業排除收合）" -- src/components/enrollment/planning/PlanSidePanel.vue src/components/enrollment/planning/__tests__/PlanSidePanel.spec.ts
```

---

### Task 3: PlanBatchToolbar 加「清除選取」

**Files:**
- Modify: `src/components/enrollment/planning/PlanBatchToolbar.vue`
- Test: `src/components/enrollment/planning/__tests__/PlanBatchToolbar.spec.ts`

**Interfaces:**
- Produces: 新 emit `'clear-selection': []`。既有 props/emits 不變（父層 Task 5 改為 `v-if="selectedCount > 0"` 渲染，本元件不自行隱藏）。

- [ ] **Step 1: 加失敗測試**（附加到既有 describe 內）

```ts
  it('點「清除選取」emit clear-selection', async () => {
    const w = mountToolbar({ selectedCount: 2 })
    await w.find('.btn-clear-selection').trigger('click')
    expect(w.emitted('clear-selection')).toBeTruthy()
  })
```

（`mountToolbar` 為該 spec 既有 helper；若名稱不同，沿用該檔實際 helper。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/components/enrollment/planning/__tests__/PlanBatchToolbar.spec.ts`
Expected: FAIL（找不到 `.btn-clear-selection`）

- [ ] **Step 3: 實作**

Template 尾端（「還原建議」按鈕後）加：

```vue
    <el-button text class="btn-clear-selection" @click="emit('clear-selection')">清除選取</el-button>
```

emits 定義改為：

```ts
const emit = defineEmits<{
  'bulk-op': [payload: { op: BulkOp; planClassId?: number | null; excludeReason?: string | null }]
  'clear-selection': []
}>()
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/components/enrollment/planning/__tests__/PlanBatchToolbar.spec.ts`
Expected: PASS（既有 + 新增全綠）

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/components/enrollment/planning/PlanBatchToolbar.vue src/components/enrollment/planning/__tests__/PlanBatchToolbar.spec.ts
git commit -m "feat(year-plan): 批次工具列加清除選取鈕" -- src/components/enrollment/planning/PlanBatchToolbar.vue src/components/enrollment/planning/__tests__/PlanBatchToolbar.spec.ts
```

---

### Task 4: PlanRosterTable 受控 selection、locate、外部拖入、sticky 表頭、移除底部收合區

**Files:**
- Modify: `src/components/enrollment/planning/PlanRosterTable.vue`
- Test: `src/components/enrollment/planning/__tests__/PlanRosterTable.spec.ts`

**Interfaces:**
- Consumes: 無（自足元件）。
- Produces（Task 5 view 依賴）:
  - props 增 `selectedIds: Set<number>`（必填）
  - emit `'select-students'` **移除**，改 `'set-selected': [ids: number[], checked: boolean]`；`plan.version` watch 清勾選邏輯**移除**（上收至 view）
  - `defineExpose({ locateStudent(studentId: number): boolean, locateClass(planClassId: number): boolean })`
  - 底部 `el-collapse`（待分班/畢業/排除）**移除**（由 PlanSidePanel 承載）
  - `onDrop`/`onDragOver` 接受外部拖入（dataTransfer fallback，供側欄拖入）

> ⚠ 本 task 完成當下 `YearPlanWorkspaceView` 尚未改（Task 5），view 的既有測試會因 props/emits 變更而紅。**本 task 只要求元件 spec 綠**；view spec 於 Task 5 同步改寫後全綠。兩 task 需**連續執行、期間不單獨宣稱完成**。

- [ ] **Step 1: 改寫元件 spec（失敗測試）**

對 `PlanRosterTable.spec.ts` 做以下修改：

1. 檔頭加 scrollIntoView stub 與 `beforeAll`：

```ts
import { describe, it, expect, vi, beforeAll } from 'vitest'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
```

2. `mountTable` 加 `selectedIds`：

```ts
function mountTable(overrides: Partial<PlanDetail> = {}, editable = true, selectedIds = new Set<number>()) {
  return mount(PlanRosterTable, {
    global: { plugins: [ElementPlus] },
    props: { plan: buildPlan(overrides), editable, selectedIds },
  })
}
```

3. **刪除**這兩個測試（職責移走）：
   - `'留級學生顯示「留」tag；畢業/排除收合區顯示「畢」「除」tag'` 中畢業/排除收合區斷言（保留「留」tag 斷言，改寫如下）
   - `'plan.version 變動時清空勾選集合並 emit select-students([])'`（整個移除；view 層 Task 5 接手）

```ts
  it('留級學生顯示「留」tag；promote 不帶 tag；畢業/排除不再渲染於本元件', () => {
    const w = mountTable()
    const retainTags = w.findAll('.disposition-tag-retain')
    expect(retainTags.length).toBe(1)
    expect(retainTags[0].text()).toBe('留')
    expect(w.findAll('.disposition-tag-promote').length).toBe(0)
    expect(w.find('.graduate-section').exists()).toBe(false)
    expect(w.find('.exclude-section').exists()).toBe(false)
    expect(w.find('.side-collapse').exists()).toBe(false)
  })
```

4. 勾選測試改為受控模式：

```ts
  it('勾選學生 checkbox emit set-selected([id], checked)；勾選狀態由 selectedIds prop 決定', async () => {
    const w = mountTable({}, true, new Set([2]))
    const checkboxes = w.findAllComponents({ name: 'ElCheckbox' })
    // 學生 2（小華，selectedIds 內）應為勾選狀態
    const checkedBox = checkboxes.find(c => (c.props('modelValue') as boolean) === true)
    expect(checkedBox).toBeTruthy()
    // 勾學生 1 → emit set-selected([1], true)
    await checkboxes[0].find('input[type="checkbox"]').setValue(true)
    expect(w.emitted('set-selected')![0]).toEqual([[1], true])
  })
```

5. 新增外部拖入與 locate 測試：

```ts
  it('外部拖入（無內部 dragstart）：drop 帶 dataTransfer student id → emit student-move', async () => {
    const w = mountTable()
    await w.findAll('.student-cell')[1].trigger('drop', {
      dataTransfer: { getData: () => '42' },
    })
    const events = w.emitted('student-move')
    expect(events).toBeTruthy()
    expect(events![0][0]).toEqual({ studentIds: [42], op: 'assign', planClassId: 11 })
  })

  it('外部拖入 dataTransfer 值非數字 → 不 emit', async () => {
    const w = mountTable()
    await w.findAll('.student-cell')[1].trigger('drop', {
      dataTransfer: { getData: () => 'not-a-number' },
    })
    expect(w.emitted('student-move')).toBeFalsy()
  })

  it('外部拖 dragover（dataTransfer.types 含 text/plain）→ 目標欄高亮', async () => {
    const w = mountTable()
    await w.findAll('.student-cell')[1].trigger('dragover', {
      dataTransfer: { types: ['text/plain'] },
    })
    expect(w.findAll('.student-cell')[1].classes()).toContain('drop-target-active')
  })

  it('locateStudent：存在 → 回 true 且該 entry 帶 flash-highlight；不存在 → false', () => {
    const w = mountTable()
    const vm = w.vm as unknown as { locateStudent: (id: number) => boolean; locateClass: (id: number) => boolean }
    expect(vm.locateStudent(1)).toBe(true)
    expect(w.find('.student-entry[data-student-id="1"]').classes()).toContain('flash-highlight')
    expect(vm.locateStudent(999)).toBe(false)
  })

  it('locateClass：存在 → 回 true 且班名格帶 flash-highlight；不存在 → false', () => {
    const w = mountTable()
    const vm = w.vm as unknown as { locateClass: (id: number) => boolean }
    expect(vm.locateClass(10)).toBe(true)
    expect(w.find('.class-name-cell[data-plan-class-id="10"]').classes()).toContain('flash-highlight')
    expect(vm.locateClass(999)).toBe(false)
  })
```

- [ ] **Step 2: 跑元件 spec 確認失敗**

Run: `npx vitest run src/components/enrollment/planning/__tests__/PlanRosterTable.spec.ts`
Expected: FAIL（缺 selectedIds prop、set-selected 未 emit、locate 不存在等）

- [ ] **Step 3: 實作元件修改**

**3a. props/emits（script）**：

```ts
const props = defineProps<{
  plan: PlanDetail
  editable: boolean
  selectedIds: Set<number>
}>()

const emit = defineEmits<{
  'set-selected': [ids: number[], checked: boolean]
  'class-edit': [planClassId: number]
  'student-move': [payload: { studentIds: number[]; op: BulkOp; planClassId?: number | null; excludeReason?: string | null }]
}>()
```

**3b. 刪除**（script）：`selected` ref、`onToggleStudent`、`plan.version` watch、`unassignedStudents`/`graduateStudents`/`excludeStudents` computed、`openSections` ref。

**3c. checkbox（template，student-line 內）改：**

```vue
                    <el-checkbox
                      v-if="editable"
                      class="student-checkbox"
                      :model-value="selectedIds.has(student.id)"
                      @change="(val: string | number | boolean) => emit('set-selected', [student.id], Boolean(val))"
                    />
```

**3d. data 屬性**：`.student-entry` 加 `:data-student-id="student.id"`；`.class-name-cell` 加 `:data-plan-class-id="cls.id"`。

**3e. 移除 template 底部整段 `<el-collapse class="side-collapse">…</el-collapse>`**，與 style 中 `.side-collapse`、`.side-list`、`.exclude-reason` 區塊。`.plan-roster-wrapper` 根 div 加 `ref="rootEl"`。

**3f. DnD 外部 fallback**：

```ts
function onDragOver(classId: number, event: DragEvent): void {
  // 內部拖曳（draggingStudent）或外部拖入（dataTransfer 帶 text/plain，如側欄待分班）皆高亮
  if (draggingStudent.value || event.dataTransfer?.types.includes('text/plain')) {
    dragOverClassId.value = classId
  }
}

function onDrop(targetClassId: number, event: DragEvent): void {
  const internal = draggingStudent.value
  draggingStudent.value = null
  dragOverClassId.value = null
  if (!props.editable) return
  let dragged = internal
  if (!dragged) {
    // 外部拖入 fallback（側欄待分班列）：dataTransfer 攜帶 student.id；
    // 未分班學生 planClassId 視為 null → 任何班皆非同班、必派發
    const raw = event.dataTransfer?.getData('text/plain')
    const id = raw != null && raw !== '' ? Number(raw) : NaN
    if (!Number.isInteger(id)) return
    dragged = { id, planClassId: null }
  }
  if (dragged.planClassId === targetClassId) return // 同班放回 no-op，免無意義 version bump
  emit('student-move', { studentIds: [dragged.id], op: 'assign', planClassId: targetClassId })
}
```

Template 中所有 `@dragover.prevent="onDragOver(cls.id)"` 改 `@dragover.prevent="onDragOver(cls.id, $event)"`、`@drop="onDrop(cls.id)"` 改 `@drop="onDrop(cls.id, $event)"`（班名格與學生格共四處）。

**3g. locate expose**：

```ts
const rootEl = ref<HTMLElement | null>(null)
const flashTimers = new Map<Element, number>()

function _flash(el: Element): void {
  el.classList.remove('flash-highlight')
  void (el as HTMLElement).offsetWidth // 強制 reflow 讓 animation 可重複觸發
  el.classList.add('flash-highlight')
  const prev = flashTimers.get(el)
  if (prev != null) window.clearTimeout(prev)
  flashTimers.set(el, window.setTimeout(() => {
    el.classList.remove('flash-highlight')
    flashTimers.delete(el)
  }, 1600))
}

function locateStudent(studentId: number): boolean {
  const el = rootEl.value?.querySelector(`.student-entry[data-student-id="${studentId}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  _flash(el)
  return true
}

function locateClass(planClassId: number): boolean {
  const el = rootEl.value?.querySelector(`.class-name-cell[data-plan-class-id="${planClassId}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  _flash(el)
  return true
}

defineExpose({ locateStudent, locateClass })
```

**3h. sticky 表頭 CSS**（style 區塊修改；`border-collapse: collapse` 下 sticky 列邊框會脫落，改 `separate` + 單側邊框）：

```css
.plan-roster-wrapper {
  --yp-h-grade: 34px;
  --yp-h-name: 40px;
  font-size: 14px;
  color: var(--text-primary);
}

.plan-roster-scroll {
  overflow: auto;
  /* 垂直捲動收在表格容器內，sticky 表頭對此容器生效（el-main 為外層捲動根，
     對 window/el-main sticky 需算 header 高度，內部容器最穩） */
  max-height: calc(100vh - 230px);
}

.plan-roster-table {
  border-collapse: separate;
  border-spacing: 0;
  white-space: nowrap;
  color: var(--text-primary);
}

.plan-roster-table td {
  border-right: 1px solid var(--neutral-300);
  border-bottom: 1px solid var(--neutral-300);
  padding: 5px 8px;
  text-align: center;
  vertical-align: top;
  background: var(--surface-color);
}

/* separate 模式補上外框左/上緣 */
.plan-roster-table thead tr:first-child td {
  border-top: 1px solid var(--neutral-300);
}

.plan-roster-table td:first-child {
  border-left: 1px solid var(--neutral-300);
}

/* ── sticky 表頭：年級/班名/人數三列凍結；三師列隨捲動離場 ── */
.plan-roster-table thead tr:nth-child(1) td {
  position: sticky;
  top: 0;
  height: var(--yp-h-grade);
  z-index: 3;
}

.plan-roster-table thead tr:nth-child(2) td {
  position: sticky;
  top: var(--yp-h-grade);
  height: var(--yp-h-name);
  z-index: 3;
}

.plan-roster-table thead tr:nth-child(3) td {
  position: sticky;
  top: calc(var(--yp-h-grade) + var(--yp-h-name));
  z-index: 3;
}

/* 左上交會格（前三列的 row-label / corner）同時 sticky 左+上，須壓過單向 sticky 格 */
.plan-roster-table thead tr:nth-child(-n + 3) td.row-label,
.plan-roster-table thead td.corner-cell {
  z-index: 4;
}

.corner-cell {
  border-right: none !important;
  border-top: none !important;
  border-left: none !important;
  background: transparent;
}
```

既有 `.row-label`/`.seq-cell` 的 `position: sticky; left: 0; z-index: 2` 與 `background: var(--neutral-100)` 保留；`.grade-group-cell`、`.teacher-label`、`.grade-total-cell`、`.grand-total-row td` 的既有背景色保留（會蓋掉 td 通用 `--surface-color`）。

**3i. flash CSS**（style 尾端加）：

```css
@keyframes flash-highlight {
  0% {
    background: var(--color-primary-soft);
    box-shadow: inset 0 0 0 2px var(--color-primary);
  }
  100% {
    background: transparent;
    box-shadow: none;
  }
}

.flash-highlight {
  animation: flash-highlight 1.6s ease-out;
}
```

- [ ] **Step 4: 跑元件 spec 確認通過**

Run: `npx vitest run src/components/enrollment/planning/__tests__/PlanRosterTable.spec.ts`
Expected: PASS。（此時 `YearPlanWorkspaceView.test.ts` 預期紅，Task 5 修復。）

- [ ] **Step 5: Commit（僅元件 + 元件 spec）**

```bash
cd ~/Desktop/ivy-frontend
git add src/components/enrollment/planning/PlanRosterTable.vue src/components/enrollment/planning/__tests__/PlanRosterTable.spec.ts
git commit -m "refactor(year-plan): 編班表受控 selection+locate+外部拖入 fallback+sticky 表頭（view 整合見次 commit）" -- src/components/enrollment/planning/PlanRosterTable.vue src/components/enrollment/planning/__tests__/PlanRosterTable.spec.ts
```

---

### Task 5: YearPlanWorkspaceView 整合：雙欄版面 + selection 上收 + 側欄接入 + 刪 PlanIssuesPanel

**Files:**
- Modify: `src/views/students/YearPlanWorkspaceView.vue`
- Modify: `src/views/students/__tests__/YearPlanWorkspaceView.test.ts`
- Delete: `src/components/enrollment/planning/PlanIssuesPanel.vue`、`src/components/enrollment/planning/__tests__/PlanIssuesPanel.spec.ts`

**Interfaces:**
- Consumes: Task 1-4 全部產出（`PlanSidePanel` props/emits、roster `selectedIds`/`set-selected`/expose、toolbar `clear-selection`）。
- Produces（Task 6/7 依賴）: view 內 `selectedSet: Ref<Set<number>>`、`onSetSelected(ids, checked)`、`clearSelection()`、`rosterRef`/`sidePanelRef` refs。

- [ ] **Step 1: 改寫 view 測試（失敗）**

`YearPlanWorkspaceView.test.ts` 修改：

1. import 換：`PlanRosterTable` 保留、加 `import PlanSidePanel from '@/components/enrollment/planning/PlanSidePanel.vue'`；檔頭 `beforeAll(() => { Element.prototype.scrollIntoView = vi.fn() })`（import `beforeAll` 自 vitest）。
2. 既有「批次工具列」測試維持（勾選經路仍是找第一個 ElCheckbox → roster 學生勾選 → toolbar props selectedCount 1）。
3. **加**以下測試：

```ts
  it('無勾選時批次工具列不渲染；勾選後浮出；清除選取後隱藏', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())

    const w = mountView()
    await flushPromises()
    expect(w.findComponent(PlanBatchToolbar).exists()).toBe(false)

    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    const toolbar = w.findComponent(PlanBatchToolbar)
    expect(toolbar.exists()).toBe(true)

    toolbar.vm.$emit('clear-selection')
    await flushPromises()
    expect(w.findComponent(PlanBatchToolbar).exists()).toBe(false)
  })

  it('側欄與編班表共用 selection：側欄 set-selected 的學生與表格勾選合併派發 bulk op', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    // 一位已分班（id=1）+ 一位未分班（id=2）
    mockDetail.mockResolvedValue(detailDraftWithClasses({
      students: [
        { id: 1, student_id: 'S001', name: '小明', source_classroom_name: '幼幼A', plan_class_id: 10, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
        { id: 2, student_id: 'S002', name: '小華', source_classroom_name: '幼幼B', plan_class_id: null, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      ],
    }))
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 2, version: 2 } })

    const w = mountView()
    await flushPromises()

    // 表格勾 id=1（第一個 checkbox 是 roster 的學生 1）
    const rosterCheckbox = w.findComponent(PlanRosterTable).findComponent({ name: 'ElCheckbox' })
    await rosterCheckbox.find('input[type="checkbox"]').setValue(true)
    // 側欄勾 id=2
    const panel = w.findComponent(PlanSidePanel)
    panel.vm.$emit('set-selected', [2], true)
    await flushPromises()

    const toolbar = w.findComponent(PlanBatchToolbar)
    expect(toolbar.props('selectedCount')).toBe(2)

    const vm = toolbar.vm as unknown as { assignTargetId: number | null; applyAssign: () => void }
    vm.assignTargetId = 10
    vm.applyAssign()
    await flushPromises()

    expect(mockBulkStudents).toHaveBeenCalledWith(5, {
      base_version: 1, op: 'assign', student_ids: [1, 2], plan_class_id: 10, exclude_reason: null,
    })
  })

  it('plan.version 遞增（mutation 成功 reload）後 selection 清空', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValueOnce(detailDraftWithClasses())
    mockBulkStudents.mockResolvedValue({ data: { updated_count: 1, version: 2 } })
    // reload 後 version=2
    mockDetail.mockResolvedValue(detailDraftWithClasses({ version: 2 }))

    const w = mountView()
    await flushPromises()

    const checkbox = w.findComponent({ name: 'ElCheckbox' })
    await checkbox.find('input[type="checkbox"]').setValue(true)
    await flushPromises()
    const toolbar = w.findComponent(PlanBatchToolbar)
    const vm = toolbar.vm as unknown as { assignTargetId: number | null; applyAssign: () => void }
    vm.assignTargetId = 10
    vm.applyAssign()
    await flushPromises()

    // 派發成功 → reload version 2 → selection 清空 → 工具列消失
    expect(w.findComponent(PlanBatchToolbar).exists()).toBe(false)
  })

  it('渲染 PlanSidePanel（含問題聚合摘要），不再渲染舊 PlanIssuesPanel 平鋪列', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraft())
    const w = mountView()
    await flushPromises()
    expect(w.findComponent(PlanSidePanel).exists()).toBe(true)
    expect(w.find('.plan-issues-summary').exists()).toBe(true)
    expect(w.find('.plan-issues-panel').exists()).toBe(false)
  })
```

4. 既有測試小修：
   - 檔頭 import `PlanBatchToolbar` 已存在，確認也 import `beforeAll`。
   - 任何斷言 `.issue-chip-blocking` 的測試（「產生草稿 CTA」案例）**Task 6 才移除 chips**，此處不動。

- [ ] **Step 2: 跑 view 測試確認失敗**

Run: `npx vitest run src/views/students/__tests__/YearPlanWorkspaceView.test.ts`
Expected: FAIL（roster 缺 selectedIds、PlanSidePanel 未渲染等）

- [ ] **Step 3: 實作 view 修改**

**3a. template `workspace-body` 區塊改為：**

```vue
    <div v-else-if="plan" class="workspace-body">
      <div class="main-column">
        <PlanBatchToolbar
          v-if="editable && canWrite && selectedStudentIds.length > 0"
          class="batch-toolbar"
          :selected-count="selectedStudentIds.length"
          :plan-classes="planClassOptions"
          :disabled="loading"
          @bulk-op="onBulkOp"
          @clear-selection="clearSelection"
        />
        <PlanRosterTable
          ref="rosterRef"
          :plan="plan"
          :editable="editable && canWrite"
          :selected-ids="selectedSet"
          @set-selected="onSetSelected"
          @class-edit="onClassEdit"
          @student-move="onStudentMove"
        />
      </div>
      <PlanSidePanel
        ref="sidePanelRef"
        class="side-panel"
        :plan="plan"
        :editable="editable && canWrite"
        :selected-ids="selectedSet"
        @set-selected="onSetSelected"
        @locate-issue="onLocateIssue"
      />
    </div>
```

（`PlanIssuesPanel` 的 `<PlanIssuesPanel :issues=... />` 一行與 import 刪除。）

**3b. script 修改**：

```ts
import PlanSidePanel from '@/components/enrollment/planning/PlanSidePanel.vue'
// 刪除：import PlanIssuesPanel ...

// ── selection 單一事實來源（表格 + 側欄待分班共用；批次工具列據此派發）──
const selectedSet = ref<Set<number>>(new Set())
const selectedStudentIds = computed(() => Array.from(selectedSet.value))

function onSetSelected(ids: number[], checked: boolean): void {
  for (const id of ids) {
    if (checked) selectedSet.value.add(id)
    else selectedSet.value.delete(id)
  }
}

function clearSelection(): void {
  selectedSet.value.clear()
}

// 草稿被異動（regenerate/發布/批次調整）後 version 遞增；新 plan 不殘留舊勾選
watch(() => plan.value?.version, clearSelection)

const rosterRef = ref<InstanceType<typeof PlanRosterTable> | null>(null)
const sidePanelRef = ref<InstanceType<typeof PlanSidePanel> | null>(null)
```

刪除舊的 `const selectedStudentIds = ref<number[]>([])` 與 `onSelectStudents`；`onBulkOp` 內 `selectedStudentIds.value = []` 改 `clearSelection()`（版本 watch 也會清，雙保險）。`onLocateIssue` 本 task 維持既有 no-op stub（Task 7 接線）。

**3c. style 加雙欄 grid：**

```css
.workspace-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--space-5);
  align-items: start;
}

.main-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.side-panel {
  position: sticky;
  top: var(--space-3);
  max-height: calc(100vh - 140px);
  overflow-y: auto;
}

.batch-toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  border: 1px solid var(--neutral-200);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-color);
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.08));
}
```

（刪除舊 `.workspace-body { flex-direction: column }` 與舊 `.batch-toolbar` 底色規則。）

**3d. 刪檔：**

```bash
git rm src/components/enrollment/planning/PlanIssuesPanel.vue src/components/enrollment/planning/__tests__/PlanIssuesPanel.spec.ts
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/students/__tests__/YearPlanWorkspaceView.test.ts src/components/enrollment/planning/__tests__/`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/views/students/YearPlanWorkspaceView.vue src/views/students/__tests__/YearPlanWorkspaceView.test.ts
git commit -m "feat(year-plan): 工作台雙欄版面＋selection 上收＋側欄接入，移除 PlanIssuesPanel 平鋪紅牆" -- src/views/students/YearPlanWorkspaceView.vue src/views/students/__tests__/YearPlanWorkspaceView.test.ts src/components/enrollment/planning/PlanIssuesPanel.vue src/components/enrollment/planning/__tests__/PlanIssuesPanel.spec.ts
```

---

### Task 6: 頁首動作鈕依狀態顯示 + 「更多」下拉 + 移除 chips

**Files:**
- Modify: `src/views/students/YearPlanWorkspaceView.vue`
- Modify: `src/views/students/__tests__/YearPlanWorkspaceView.test.ts`

**Interfaces:**
- Consumes: Task 5 的 view 結構。
- Produces: 頁首 `.actions` 狀態化；`onMoreCommand(command: string)`。

- [ ] **Step 1: 改寫/新增測試（失敗）**

1. **改**既有測試 `'載入中顯示 skeleton…'`：draft 狀態斷言改為

```ts
    // draft 狀態：顯示 draft 動作（新增班/重生成/發布），不顯示撤回發布
    expect(w.find('.btn-regenerate').exists()).toBe(true)
    expect(w.find('.btn-unpublish').exists()).toBe(false)
    // 有 blocking issue → 發布鈕 disabled
    expect((w.find('.btn-publish').element as HTMLButtonElement).disabled).toBe(true)
```

2. **改**既有 `'點擊「產生草稿」CTA…'` 中 `.issue-chip-blocking` 斷言為側欄摘要：

```ts
    expect(w.find('.severity-blocking .severity-count').text()).toBe('1')
```

3. **改**權限兩案例（READ 隱藏／WRITE 顯示）：`.btn-cancel-plan` 斷言改 `.btn-more`（下拉觸發鈕）：READ → `expect(w.find('.btn-more').exists()).toBe(false)`；WRITE → `.btn-add-class`/`.btn-regenerate`/`.btn-publish`/`.btn-more` 存在、`.btn-unpublish` 不存在（draft 狀態）。
4. **改**in-flight 鎖定案例：斷言改為 draft 三鈕 + `.btn-more` disabled（`.btn-unpublish`/`.btn-cancel-plan` 已不存在於 draft）。
5. **改**兩個作廢草稿流程案例：觸發改為

```ts
    const dropdown = w.findComponent({ name: 'ElDropdown' })
    dropdown.vm.$emit('command', 'cancel-plan')
    await flushPromises()
```

（其餘斷言——confirm、`mockCancel` 呼叫參數、回 none 空狀態——不變；「回 none 後」原斷言 `.btn-cancel-plan` 不存在改 `.findComponent({ name: 'ElDropdown' }).exists()` 為 false。）

6. **加**published 狀態測試：

```ts
  it('published 狀態：顯示撤回發布與更多（作廢），不顯示 draft 動作鈕', async () => {
    mockStatus.mockResolvedValue({
      data: { ...statusDraft().data, state: 'published' as const, published_at: '2026-07-01T00:00:00' },
    })
    mockDetail.mockResolvedValue(detailDraftWithClasses({ status: 'published', published_at: '2026-07-01T00:00:00' }))
    const w = mountView()
    await flushPromises()
    expect(w.find('.btn-unpublish').exists()).toBe(true)
    expect(w.find('.btn-more').exists()).toBe(true)
    expect(w.find('.btn-publish').exists()).toBe(false)
    expect(w.find('.btn-add-class').exists()).toBe(false)
    expect(w.find('.btn-regenerate').exists()).toBe(false)
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/students/__tests__/YearPlanWorkspaceView.test.ts`
Expected: FAIL

- [ ] **Step 3: 實作**

**3a. header-main 移除兩個 chip span**（`issue-chip-blocking`/`issue-chip-warning`；style 對應規則一併刪）。

**3b. actions 區塊改：**

```vue
      <div v-if="status" class="actions">
        <template v-if="canWrite && state === 'draft'">
          <el-button class="btn-add-class" :disabled="loading" @click="onAddClassClick">新增班級</el-button>
          <el-button class="btn-regenerate" :disabled="loading" @click="onRegenerateClick">重新產生建議</el-button>
          <el-button type="primary" class="btn-publish" :disabled="!canPublish || loading" @click="onPublishClick">發布</el-button>
        </template>
        <el-button
          v-if="canWrite && state === 'published'"
          class="btn-unpublish"
          :disabled="loading"
          @click="onUnpublishClick"
        >撤回發布</el-button>
        <el-dropdown v-if="canWrite && canCancelPlan" trigger="click" @command="onMoreCommand">
          <el-button class="btn-more" :disabled="loading">
            更多<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="cancel-plan" class="dropdown-item-danger">作廢草稿</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
```

**3c. script**：import `ArrowDown`（`@element-plus/icons-vue`）；刪 `canRegenerate`/`canUnpublish` computed（狀態改由 template `v-if` 表達；`canPublish`、`canCancelPlan` 保留）；加：

```ts
function onMoreCommand(command: string): void {
  if (command === 'cancel-plan') void onCancelPlanClick()
}
```

**3d. style 加：**

```css
.dropdown-item-danger {
  color: var(--color-danger);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/students/__tests__/YearPlanWorkspaceView.test.ts`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/views/students/YearPlanWorkspaceView.vue src/views/students/__tests__/YearPlanWorkspaceView.test.ts
git commit -m "feat(year-plan): 頁首動作鈕依狀態顯示、作廢草稿收進更多下拉、移除重複 issue chips" -- src/views/students/YearPlanWorkspaceView.vue src/views/students/__tests__/YearPlanWorkspaceView.test.ts
```

---

### Task 7: locate-issue 接線 + 窄幕抽屜

**Files:**
- Modify: `src/views/students/YearPlanWorkspaceView.vue`
- Modify: `src/views/students/__tests__/YearPlanWorkspaceView.test.ts`

**Interfaces:**
- Consumes: Task 4 roster expose（`locateStudent`/`locateClass`）、Task 2 side panel expose（`locateStudent`）。
- Produces: 完整 locate 派發；`isNarrow`/`drawerVisible` 響應式狀態。

- [ ] **Step 1: 新增測試（失敗）**

```ts
  it('locate-issue：學生在表格內 → 編班表對應 entry 閃爍高亮', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()

    const panel = w.findComponent(PlanSidePanel)
    panel.vm.$emit('locate-issue', { code: 'plan_student_inactive', message: 'x', plan_class_id: null, student_id: 1 })
    await flushPromises()

    expect(w.find('.student-entry[data-student-id="1"]').classes()).toContain('flash-highlight')
  })

  it('locate-issue：學生未分班 → 側欄待分班列閃爍高亮', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses({
      students: [
        { id: 2, student_id: 'S002', name: '小華', source_classroom_name: '幼幼B', plan_class_id: null, disposition: 'promote', exclude_reason: null, manually_adjusted: false, current_grade_name: '幼幼' },
      ],
    }))
    const w = mountView()
    await flushPromises()

    const panel = w.findComponent(PlanSidePanel)
    panel.vm.$emit('locate-issue', { code: 'student_unassigned', message: 'x', plan_class_id: null, student_id: 2 })
    await flushPromises()

    expect(w.find('.unassigned-row[data-student-id="2"]').classes()).toContain('flash-highlight')
  })

  it('locate-issue：僅 plan_class_id → 班名格閃爍高亮', async () => {
    mockStatus.mockResolvedValue(statusDraft())
    mockDetail.mockResolvedValue(detailDraftWithClasses())
    const w = mountView()
    await flushPromises()

    const panel = w.findComponent(PlanSidePanel)
    panel.vm.$emit('locate-issue', { code: 'head_teacher_missing', message: 'x', plan_class_id: 10, student_id: null })
    await flushPromises()

    expect(w.find('.class-name-cell[data-plan-class-id="10"]').classes()).toContain('flash-highlight')
  })
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run src/views/students/__tests__/YearPlanWorkspaceView.test.ts`
Expected: FAIL（flash-highlight 未附加——現為 no-op stub）

- [ ] **Step 3: 實作**

**3a. `onLocateIssue` 換為：**

```ts
async function onLocateIssue(issue: Schema<'IssueOut'>): Promise<void> {
  if (issue.student_id != null) {
    // 已分班 → 表格定位；否則 fallback 側欄待分班清單
    if (rosterRef.value?.locateStudent(issue.student_id)) return
    await sidePanelRef.value?.locateStudent(issue.student_id)
    return
  }
  if (issue.plan_class_id != null) {
    rosterRef.value?.locateClass(issue.plan_class_id)
  }
}
```

**3b. 窄幕抽屜**：script 加

```ts
// <1280px 側欄改抽屜（admin 桌機為主，僅作基本自適應；jsdom 無 matchMedia → 恆寬幕）
const isNarrow = ref(false)
const drawerVisible = ref(false)
let narrowMq: MediaQueryList | null = null
const onNarrowChange = (e: MediaQueryListEvent | MediaQueryList): void => {
  isNarrow.value = e.matches
}

onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  narrowMq = window.matchMedia('(max-width: 1279px)')
  onNarrowChange(narrowMq)
  narrowMq.addEventListener('change', onNarrowChange)
})

onUnmounted(() => {
  narrowMq?.removeEventListener('change', onNarrowChange)
})

const totalIssueCount = computed(
  () => (plan.value?.issues.blocking.length ?? 0) + (plan.value?.issues.warnings.length ?? 0),
)
```

（import 補 `onUnmounted`。）

template：`.actions` 最前面加窄幕開關鈕，側欄改單一實例掛在 `component`… 具體做法——側欄渲染二選一，同一 ref 用函式綁定：

```vue
      <div v-if="status" class="actions">
        <el-badge v-if="isNarrow && plan" :value="totalIssueCount" :hidden="totalIssueCount === 0" class="drawer-badge">
          <el-button class="btn-side-drawer" @click="drawerVisible = true">問題與名單</el-button>
        </el-badge>
        <!-- （其餘動作鈕不動） -->
```

workspace-body 內側欄改：

```vue
      <PlanSidePanel
        v-if="!isNarrow"
        :ref="setSidePanelRef"
        class="side-panel"
        :plan="plan"
        :editable="editable && canWrite"
        :selected-ids="selectedSet"
        @set-selected="onSetSelected"
        @locate-issue="onLocateIssue"
      />
    </div>

    <el-drawer v-model="drawerVisible" size="360px" :with-header="false">
      <PlanSidePanel
        v-if="isNarrow && plan"
        :ref="setSidePanelRef"
        :plan="plan"
        :editable="editable && canWrite"
        :selected-ids="selectedSet"
        @set-selected="onSetSelected"
        @locate-issue="onLocateIssue"
      />
    </el-drawer>
```

```ts
type SidePanelInstance = InstanceType<typeof PlanSidePanel>
const sidePanelRef = ref<SidePanelInstance | null>(null)
function setSidePanelRef(el: unknown): void {
  if (el) sidePanelRef.value = el as SidePanelInstance
}
```

（兩個 `<PlanSidePanel>` 以 `isNarrow` 互斥，任一時刻只存在一個實例。）

grid 響應：

```css
@media (max-width: 1279px) {
  .workspace-body {
    grid-template-columns: minmax(0, 1fr);
  }
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run src/views/students/__tests__/YearPlanWorkspaceView.test.ts`
Expected: 全 PASS

- [ ] **Step 5: Commit**

```bash
cd ~/Desktop/ivy-frontend
git add src/views/students/YearPlanWorkspaceView.vue src/views/students/__tests__/YearPlanWorkspaceView.test.ts
git commit -m "feat(year-plan): locate-issue 點擊定位接線（表格/側欄雙路徑）＋窄幕側欄抽屜" -- src/views/students/YearPlanWorkspaceView.vue src/views/students/__tests__/YearPlanWorkspaceView.test.ts
```

---

### Task 8: 收尾驗證（全套測試 + typecheck + 實機視覺驗證）

**Files:** 無新增（如驗證發現問題，修復後補 commit）。

- [ ] **Step 1: FE 全套測試**

Run: `cd ~/Desktop/ivy-frontend && npm test`
Expected: 全綠（若有 pre-existing 紅，以 `git stash` 以外方式核實與本工作無關——直接對 origin/main 或本工作前 commit 跑同一檔比對，**勿 stash**，共用 checkout 有平行 session WIP）。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 errors

- [ ] **Step 3: 實機視覺驗證（dev server 由使用者跑 `start.sh`；Claude 不可自行啟動）**

用瀏覽器開 `http://localhost:5173/#/students/year-plan` 逐項確認：
1. 進頁面編班表立即可見（不再有 7000px 紅牆）；右側欄顯示「阻擋 207 / 提醒 16」聚合摘要（依 dev DB 現況）。
2. 展開「學生尚未分派班級」組 → 點一筆 → 側欄待分班列閃爍捲動；點「班級尚未指派導師」一筆 → 表格班名格閃爍。
3. 側欄待分班：搜尋、勾選 2 人 → 主區浮出批次工具列 → 移至某班 → 成功後勾選清空、人數 badge 更新。
4. 側欄拖一位待分班學生入某班欄 → 高亮 + 派發成功。
5. 表格垂直捲動：年級/班名/人數三列凍結、左欄序號凍結、邊框無錯位。
6. 頁首：draft 只見「新增班級/重新產生建議/發布/更多」；「更多→作廢草稿」確認框正常（**測試時勿真的作廢**，取消即可）。
7. 縮窗 <1280px：側欄變抽屜、頁首出現「問題與名單」鈕。
8. 深色模式切換一次確認無寫死色值破版。

- [ ] **Step 4: 驗證通過後回報**

不 push（依收尾紀律，push 由使用者確認後另行執行；FE-only、無 migration、無 OpenAPI regen 需求——本次未動後端）。

---

## Self-Review 紀錄

- Spec 覆蓋：聚合摘要（T1）、側欄+待分班操作（T2）、清除選取（T3）、受控 selection/locate/外部拖入/sticky（T4）、雙欄版面+selection 上收+刪舊面板（T5）、狀態化動作鈕（T6）、locate 接線+抽屜（T7）、驗證（T8）。spec 各節皆有對應 task。
- 型別一致：`set-selected: [ids: number[], checked: boolean]` 三處一致（roster/side panel/view handler）；roster `locateStudent/locateClass` 回傳 `boolean`、side panel `locateStudent` 回傳 `Promise<boolean>`（view `onLocateIssue` 對 roster 同步判斷、對 side panel await）。
- 已知過渡態：Task 4 完成時 view 測試紅（Task 5 修復）——兩 task 連續執行，Task 4 commit 訊息已標注。
