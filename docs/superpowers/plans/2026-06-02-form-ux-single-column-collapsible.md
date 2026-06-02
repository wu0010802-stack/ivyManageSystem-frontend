# 表單體驗升級（單欄 + 核心先行・進階收合）試點：員工表單 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在「新增員工」表單落地單欄寬鬆 + 核心 6 欄先行、其餘收合的版面，並修正 `employee_id` 必填與後端自動配號不一致。

**Architecture:** 新增可重用 `FormSection.vue`（自管開合 + `defineExpose({ expand })`）。新增模式改為單捲動：`EmployeeFormBasic` 重構為「核心欄位（永遠顯示）+ 4 個收合 FormSection」，薪資以一個收合 FormSection 包住既有 `EmployeeFormSalary`。送出驗證失敗時，依「欄位→區段」對照表自動展開含錯區段、標題標紅、捲到第一個錯誤。編輯模式維持既有 `el-tabs` + dirty/preview/reason-gate 不動。

**Tech Stack:** Vue 3.4 `<script setup lang="ts">`、Element Plus、Vitest + @vue/test-utils（happy-dom）、TS strict。

對應 spec：`docs/superpowers/specs/2026-06-02-form-ux-single-column-collapsible-design.md`

---

## 檔案結構

- Create: `src/components/common/FormSection.vue` — 可收合區段（自管開合、徽章、`expand()`）
- Create: `src/constants/employeeFormSections.ts` — 欄位→區段對照表 + 純函式
- Create: `src/styles/form-hint.css`（或併入既有全域樣式）— 共用 `.form-hint`
- Create: `tests/components/FormSection.test.ts`
- Create: `tests/unit/employeeFormSections.test.ts`
- Create: `tests/components/EmployeeFormBasic.test.ts`
- Modify: `src/components/employee/EmployeeFormBasic.vue` — 單欄、核心+收合區段、`employee_id` 唯讀、`.form-hint`、`defineExpose({ applyValidationErrors })`
- Modify: `src/views/EmployeeView.vue` — `label-position="top"`、rules 對齊後端、新增模式單捲動模板、`saveCreate` 收合×驗證編排

---

### Task 1: `FormSection.vue` 可收合區段元件

**Files:**
- Create: `src/components/common/FormSection.vue`
- Test: `tests/components/FormSection.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/components/FormSection.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormSection from '@/components/common/FormSection.vue'

describe('FormSection', () => {
  it('collapsible 預設依 defaultOpen 顯示內容', () => {
    const wrapper = mount(FormSection, {
      props: { title: '個資', collapsible: true, defaultOpen: false },
      slots: { default: '<div class="inner">內容</div>' },
    })
    expect(wrapper.find('.inner').exists()).toBe(false)
  })

  it('點標題可展開/收合', async () => {
    const wrapper = mount(FormSection, {
      props: { title: '個資', collapsible: true, defaultOpen: false },
      slots: { default: '<div class="inner">內容</div>' },
    })
    await wrapper.find('.form-section__header').trigger('click')
    expect(wrapper.find('.inner').exists()).toBe(true)
  })

  it('expand() 強制展開', async () => {
    const wrapper = mount(FormSection, {
      props: { title: '個資', collapsible: true, defaultOpen: false },
      slots: { default: '<div class="inner">內容</div>' },
    })
    ;(wrapper.vm as unknown as { expand: () => void }).expand()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.inner').exists()).toBe(true)
  })

  it('badgeCount>0 且 error 型別時顯示紅色徽章', () => {
    const wrapper = mount(FormSection, {
      props: { title: '教保身分', collapsible: true, badgeCount: 2, badgeType: 'error' },
    })
    const badge = wrapper.find('.form-section__badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('2')
    expect(badge.classes()).toContain('is-error')
  })

  it('collapsible=false 時永遠顯示內容、無標題點擊', () => {
    const wrapper = mount(FormSection, {
      props: { title: '核心資料', collapsible: false },
      slots: { default: '<div class="inner">內容</div>' },
    })
    expect(wrapper.find('.inner').exists()).toBe(true)
    expect(wrapper.find('.form-section__header').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/components/FormSection.test.ts`
Expected: FAIL（找不到 `FormSection.vue`）

- [ ] **Step 3: 實作 `FormSection.vue`**

```vue
<!-- src/components/common/FormSection.vue -->
<script setup lang="ts">
import { ref } from 'vue'
import { ArrowRight } from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
  title: string
  collapsible?: boolean
  defaultOpen?: boolean
  badgeCount?: number
  badgeType?: 'error' | 'info'
}>(), {
  collapsible: false,
  defaultOpen: true,
  badgeCount: 0,
  badgeType: 'info',
})

const isOpen = ref(props.collapsible ? props.defaultOpen : true)

function toggle() {
  if (props.collapsible) isOpen.value = !isOpen.value
}

function expand() {
  isOpen.value = true
}

defineExpose({ expand })
</script>

<template>
  <div class="form-section">
    <div
      v-if="collapsible"
      class="form-section__header"
      role="button"
      tabindex="0"
      :aria-expanded="isOpen"
      @click="toggle"
      @keydown.enter.prevent="toggle"
      @keydown.space.prevent="toggle"
    >
      <el-icon class="form-section__chevron" :class="{ 'is-open': isOpen }"><ArrowRight /></el-icon>
      <span class="form-section__title">{{ title }}</span>
      <span
        v-if="badgeCount > 0"
        class="form-section__badge"
        :class="{ 'is-error': badgeType === 'error', 'is-info': badgeType === 'info' }"
      >{{ badgeCount }}</span>
    </div>
    <div v-else class="form-section__label">{{ title }}</div>

    <div v-show="isOpen" class="form-section__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.form-section { margin-bottom: 8px; }
.form-section__header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; cursor: pointer;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px; background: var(--el-fill-color-blank);
  user-select: none;
}
.form-section__header:hover { background: var(--el-fill-color-light); }
.form-section__chevron { transition: transform .2s; color: var(--el-text-color-secondary); }
.form-section__chevron.is-open { transform: rotate(90deg); }
.form-section__title { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); }
.form-section__badge {
  margin-left: auto; min-width: 18px; height: 18px; padding: 0 6px;
  border-radius: 9px; font-size: 12px; line-height: 18px; text-align: center; color: #fff;
}
.form-section__badge.is-error { background: var(--el-color-danger); }
.form-section__badge.is-info { background: var(--el-color-info); }
.form-section__label {
  font-size: 11px; letter-spacing: .5px; font-weight: 600;
  color: var(--el-color-primary); margin-bottom: 10px;
}
.form-section__body { padding: 12px 4px 4px; }
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/components/FormSection.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add src/components/common/FormSection.vue tests/components/FormSection.test.ts
git commit -m "feat(common): 新增可收合 FormSection 元件（單欄表單分組用）"
```

---

### Task 2: 欄位→區段對照表 + 純函式

**Files:**
- Create: `src/constants/employeeFormSections.ts`
- Test: `tests/unit/employeeFormSections.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/unit/employeeFormSections.test.ts
import { describe, it, expect } from 'vitest'
import {
  sectionForField,
  sectionsForInvalidFields,
  type EmployeeFormSection,
} from '@/constants/employeeFormSections'

describe('employeeFormSections', () => {
  it('已知欄位對到正確區段', () => {
    expect(sectionForField('phone')).toBe('personal')
    expect(sectionForField('position')).toBe('jobDetail')
    expect(sectionForField('work_start_time')).toBe('worktime')
    expect(sectionForField('teacher_cert_no')).toBe('gov')
    expect(sectionForField('base_salary')).toBe('salary')
  })

  it('核心欄位回 core', () => {
    expect(sectionForField('name')).toBe('core')
    expect(sectionForField('hire_date')).toBe('core')
  })

  it('未知欄位 fallback 回 core', () => {
    expect(sectionForField('not_a_field')).toBe('core')
  })

  it('sectionsForInvalidFields 去重彙整區段', () => {
    const result = sectionsForInvalidFields(['phone', 'address', 'teacher_cert_no'])
    expect(result.sort()).toEqual<EmployeeFormSection[]>(['gov', 'personal'])
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/unit/employeeFormSections.test.ts`
Expected: FAIL（找不到模組）

- [ ] **Step 3: 實作對照表**

```ts
// src/constants/employeeFormSections.ts
// 欄位 prop → 收合區段 key。核心欄位（永遠顯示）回 'core'，不需展開。
// 新增欄位時務必在此登記其所屬區段，否則送出驗證失敗時不會自動展開。
export type EmployeeFormSection =
  | 'core' | 'jobDetail' | 'personal' | 'worktime' | 'gov' | 'salary'

export const EMPLOYEE_FIELD_SECTION: Record<string, EmployeeFormSection> = {
  // 核心（永遠顯示）
  name: 'core',
  employee_id: 'core',
  job_title_id: 'core',
  employee_type: 'core',
  hire_date: 'core',
  classroom_id: 'core',
  // 職務細節
  position: 'jobDetail',
  supervisor_role: 'jobDetail',
  department: 'jobDetail',
  bonus_grade: 'jobDetail',
  probation_end_date: 'jobDetail',
  // 個資・聯絡・緊急聯絡
  birthday: 'personal',
  id_number: 'personal',
  phone: 'personal',
  address: 'personal',
  dependents: 'personal',
  emergency_contact_name: 'personal',
  emergency_contact_phone: 'personal',
  // 工作時間
  work_start_time: 'worktime',
  work_end_time: 'worktime',
  // 教保身分・政府申報
  staff_role_category: 'gov',
  teacher_cert_no: 'gov',
  teacher_cert_type: 'gov',
  // 薪資・投保・銀行
  base_salary: 'salary',
  hourly_rate: 'salary',
  insurance_salary_level: 'salary',
  pension_self_rate: 'salary',
  bank_code: 'salary',
  bank_account: 'salary',
  bank_account_name: 'salary',
  labor_insured_salary: 'salary',
  health_insured_salary: 'salary',
  pension_insured_salary: 'salary',
  extra_dependents_quarterly: 'salary',
  insurance_salary_override_reason: 'salary',
}

export function sectionForField(prop: string): EmployeeFormSection {
  return EMPLOYEE_FIELD_SECTION[prop] ?? 'core'
}

export function sectionsForInvalidFields(props: string[]): EmployeeFormSection[] {
  const set = new Set<EmployeeFormSection>()
  for (const p of props) set.add(sectionForField(p))
  return [...set]
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/unit/employeeFormSections.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add src/constants/employeeFormSections.ts tests/unit/employeeFormSections.test.ts
git commit -m "feat(employee): 新增欄位→收合區段對照表與純函式"
```

---

### Task 3: 共用 `.form-hint` 樣式

**Files:**
- Create: `src/styles/form-hint.css`
- Modify: `src/main.ts`（import 全域樣式）

- [ ] **Step 1: 建立樣式檔**

```css
/* src/styles/form-hint.css */
/* 表單欄位下方的就地說明 / 格式範例 */
.form-hint {
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.form-hint--example { color: var(--el-text-color-placeholder); }
```

- [ ] **Step 2: 在 `main.ts` import**

於 `src/main.ts` 既有樣式 import 區塊（與其他 `import './styles/...'` 或 element-plus 樣式同處）新增一行：

```ts
import './styles/form-hint.css'
```

- [ ] **Step 3: 驗證 build 不破**

Run: `npx vue-tsc --noEmit && npm run build`
Expected: 無錯誤

- [ ] **Step 4: Commit**

```bash
git add src/styles/form-hint.css src/main.ts
git commit -m "feat(styles): 新增共用 .form-hint 欄位說明樣式"
```

---

### Task 4: 重構 `EmployeeFormBasic.vue`（單欄 + 核心/收合 + 唯讀工號 + 錯誤展開）

**Files:**
- Modify: `src/components/employee/EmployeeFormBasic.vue`
- Test: `tests/components/EmployeeFormBasic.test.ts`

> 注意：本檔 Edit/Write 後若觸發 PostToolUse 格式化 hook 造成全檔重排，subagent 請改用 `python3` 的 `str.replace` 做外科式修改（見 workspace memory）。

- [ ] **Step 1: 寫失敗測試**

```ts
// tests/components/EmployeeFormBasic.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EmployeeFormBasic from '@/components/employee/EmployeeFormBasic.vue'

function mountForm() {
  return mount(EmployeeFormBasic, {
    global: { plugins: [ElementPlus] },
    props: { form: { name: '', employee_id: '' } },
  })
}

describe('EmployeeFormBasic', () => {
  it('員工編號呈現為唯讀自動配號提示、非輸入框', () => {
    const wrapper = mountForm()
    const auto = wrapper.find('[data-test="employee-id-auto"]')
    expect(auto.exists()).toBe(true)
    expect(auto.text()).toContain('自動配號')
  })

  it('收合區段內欄位預設不可見', () => {
    const wrapper = mountForm()
    // 「教保身分」屬 gov 區段，預設收合
    expect(wrapper.text()).not.toContain('教保身分別')
  })

  it('applyValidationErrors 會展開含錯區段並設徽章', async () => {
    const wrapper = mountForm()
    ;(wrapper.vm as unknown as { applyValidationErrors: (p: string[]) => void })
      .applyValidationErrors(['teacher_cert_no'])
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('教保身分別')
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/components/EmployeeFormBasic.test.ts`
Expected: FAIL（無 `employee-id-auto`、無 `applyValidationErrors`）

- [ ] **Step 3: 重構元件**

重構重點（保留既有 props 介面、`isLocked`/`fmt`/各 `computed` label 不動）：

1. `<script setup>` 區段新增 import 與區段 ref／錯誤狀態／`applyValidationErrors`：

```ts
import { ref, reactive, computed } from 'vue'
import FormSection from '@/components/common/FormSection.vue'
import { sectionForField } from '@/constants/employeeFormSections'

type CollapsibleSection = 'jobDetail' | 'personal' | 'worktime' | 'gov'

const jobDetailRef = ref<{ expand: () => void } | null>(null)
const personalRef = ref<{ expand: () => void } | null>(null)
const worktimeRef = ref<{ expand: () => void } | null>(null)
const govRef = ref<{ expand: () => void } | null>(null)
const sectionRefs: Record<CollapsibleSection, typeof jobDetailRef> = {
  jobDetail: jobDetailRef, personal: personalRef, worktime: worktimeRef, gov: govRef,
}
const sectionErrors = reactive<Record<CollapsibleSection, number>>({
  jobDetail: 0, personal: 0, worktime: 0, gov: 0,
})

function applyValidationErrors(invalidProps: string[]) {
  ;(Object.keys(sectionErrors) as CollapsibleSection[]).forEach(k => { sectionErrors[k] = 0 })
  for (const prop of invalidProps) {
    const sec = sectionForField(prop)
    if (sec === 'jobDetail' || sec === 'personal' || sec === 'worktime' || sec === 'gov') {
      sectionErrors[sec] += 1
      sectionRefs[sec].value?.expand()
    }
  }
}

defineExpose({ applyValidationErrors })
```

2. `<template>` 改為單欄（移除 `el-row`/`el-col` 雙欄），核心欄位直接列出，其餘包進 `FormSection`。核心區（永遠顯示）：

```vue
<template>
  <!-- 核心資料 -->
  <el-form-item label="姓名" prop="name">
    <el-input v-model="form.name" />
  </el-form-item>

  <el-form-item label="員工編號">
    <div data-test="employee-id-auto" class="form-hint" style="margin-top:0">
      <el-tag type="success" effect="plain">儲存後自動配號（例：114001）</el-tag>
    </div>
  </el-form-item>

  <el-form-item label="教育局系統職稱" prop="job_title_id">
    <template v-if="isLocked('job_title_id')">
      <span class="readonly-text">{{ jobTitleLabel }} <el-icon><Lock /></el-icon></span>
      <div class="lock-hint">此欄位影響薪資，請由 HR 修改</div>
    </template>
    <el-select v-else v-model="form.job_title_id" placeholder="請選擇教育局系統職稱" style="width:100%">
      <el-option v-for="item in bureauJobTitleOptions" :key="item.id" :label="item.name" :value="item.id" />
    </el-select>
  </el-form-item>

  <el-form-item label="員工類型">
    <template v-if="isLocked('employee_type')">
      <span class="readonly-text">{{ employeeTypeLabel }} <el-icon><Lock /></el-icon></span>
    </template>
    <el-select v-else v-model="form.employee_type" style="width:100%">
      <el-option v-for="opt in EMPLOYEE_TYPE_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
    </el-select>
  </el-form-item>

  <el-form-item label="到職日期">
    <template v-if="isLocked('hire_date')">
      <span class="readonly-text">{{ fmt(form.hire_date) }} <el-icon><Lock /></el-icon></span>
      <div class="lock-hint">此欄位影響薪資，請由 HR 修改</div>
    </template>
    <el-date-picker v-else v-model="form.hire_date" type="date" placeholder="選擇日期" style="width:100%" value-format="YYYY-MM-DD" />
  </el-form-item>

  <el-form-item label="班級">
    <template v-if="isLocked('classroom_id')">
      <span class="readonly-text">{{ classroomLabel }} <el-icon><Lock /></el-icon></span>
    </template>
    <el-select v-else v-model="form.classroom_id" placeholder="選擇班級" clearable style="width:100%">
      <el-option v-for="c in classroomOptions" :key="c.id" :label="`${c.name} (${c.grade_name || ''})`" :value="c.id" />
    </el-select>
  </el-form-item>

  <!-- 職務細節 -->
  <FormSection ref="jobDetailRef" title="職務細節" collapsible :default-open="false"
    :badge-count="sectionErrors.jobDetail" badge-type="error">
    <el-form-item label="職位" prop="position">
      <el-select v-model="form.position" filterable allow-create default-first-option placeholder="選擇或輸入職位" style="width:100%">
        <el-option v-for="p in POSITION_OPTIONS" :key="p" :label="p" :value="p" />
      </el-select>
    </el-form-item>
    <el-form-item label="主管職" prop="supervisor_role">
      <el-select v-model="form.supervisor_role" clearable placeholder="無主管職" style="width:100%">
        <el-option v-for="item in SUPERVISOR_ROLE_OPTIONS" :key="item" :label="item" :value="item" />
      </el-select>
    </el-form-item>
    <el-form-item label="部門"><el-input v-model="form.department" /></el-form-item>
    <el-form-item label="獎金等級覆蓋" prop="bonus_grade">
      <el-select v-model="form.bonus_grade" clearable filterable allow-create placeholder="自動（依教育局系統）" style="width:100%">
        <el-option label="A 級（幼兒園教師）" value="A" />
        <el-option label="B 級（教保員）" value="B" />
        <el-option label="C 級（助理教保員）" value="C" />
      </el-select>
      <div class="form-hint">空白表示依教育局系統自動判斷；保留手動覆蓋用於特例（A / B / C）</div>
    </el-form-item>
    <el-form-item label="試用期結束">
      <el-date-picker v-model="form.probation_end_date" type="date" placeholder="選擇日期" style="width:100%" value-format="YYYY-MM-DD" clearable />
    </el-form-item>
  </FormSection>

  <!-- 個資・聯絡・緊急聯絡 -->
  <FormSection ref="personalRef" title="個資・聯絡・緊急聯絡" collapsible :default-open="false"
    :badge-count="sectionErrors.personal" badge-type="error">
    <el-form-item label="生日">
      <el-date-picker v-model="form.birthday" type="date" placeholder="選擇日期" style="width:100%" value-format="YYYY-MM-DD" clearable />
    </el-form-item>
    <el-form-item label="身分證字號">
      <el-input v-model="form.id_number" placeholder="保留遮罩值將不會更新" />
      <div class="form-hint form-hint--example">例：A123456789</div>
    </el-form-item>
    <el-form-item label="聯絡電話">
      <el-input v-model="form.phone" />
      <div class="form-hint form-hint--example">例：0912-345-678</div>
    </el-form-item>
    <el-form-item label="眷屬人數" prop="dependents">
      <el-input-number v-model="form.dependents" :min="0" :max="9" :step="1" style="width:100%" />
    </el-form-item>
    <el-form-item label="通訊地址"><el-input v-model="form.address" type="textarea" :rows="2" /></el-form-item>
    <el-form-item label="緊急聯絡人"><el-input v-model="form.emergency_contact_name" /></el-form-item>
    <el-form-item label="緊急聯絡電話"><el-input v-model="form.emergency_contact_phone" /></el-form-item>
  </FormSection>

  <!-- 工作時間 -->
  <FormSection ref="worktimeRef" title="工作時間" collapsible :default-open="false"
    :badge-count="sectionErrors.worktime" badge-type="error">
    <el-form-item label="上班時間">
      <el-time-select v-model="form.work_start_time" start="06:00" step="00:30" end="22:00" style="width:100%" />
    </el-form-item>
    <el-form-item label="下班時間">
      <el-time-select v-model="form.work_end_time" start="06:00" step="00:30" end="22:00" style="width:100%" />
    </el-form-item>
  </FormSection>

  <!-- 教保身分・政府申報 -->
  <FormSection ref="govRef" title="教保身分・政府申報" collapsible :default-open="false"
    :badge-count="sectionErrors.gov" badge-type="error">
    <el-form-item label="教保身分別">
      <el-select v-model="form.staff_role_category" clearable placeholder="(未指定)" style="width:100%">
        <el-option label="幼教師（持幼教師證）" value="teacher_certified" />
        <el-option label="教保員（持教保員證）" value="educare_certified" />
        <el-option label="助理教保員" value="assistant_educare" />
        <el-option label="行政人員" value="office" />
        <el-option label="廚工" value="kitchen" />
        <el-option label="司機" value="driver" />
        <el-option label="其他" value="other" />
      </el-select>
    </el-form-item>
    <el-form-item label="教師/教保員證號" prop="teacher_cert_no">
      <el-input v-model="form.teacher_cert_no" maxlength="50" style="width:100%" />
    </el-form-item>
    <el-form-item label="證號類型">
      <el-select v-model="form.teacher_cert_type" clearable style="width:100%">
        <el-option label="幼教師證" value="幼教師證" />
        <el-option label="教保員證" value="教保員證" />
        <el-option label="助理教保員證" value="助理教保員證" />
      </el-select>
    </el-form-item>
  </FormSection>
</template>
```

> 說明：`pendingSuggestion` 自動套薪資 banner 原在基本分頁，移至薪資區（Task 5 由父層處理），本元件移除該 banner。`SALARY_SENSITIVE_FIELDS`/`isLocked` 邏輯與 import 保留。

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/components/EmployeeFormBasic.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: typecheck**

Run: `npx vue-tsc --noEmit`
Expected: 無錯誤

- [ ] **Step 6: Commit**

```bash
git add src/components/employee/EmployeeFormBasic.vue tests/components/EmployeeFormBasic.test.ts
git commit -m "refactor(employee): EmployeeFormBasic 改單欄 + 核心/收合區段 + 工號唯讀"
```

---

### Task 5: `EmployeeView.vue` — rules 對齊後端 + 新增模式單捲動 + 收合×驗證

**Files:**
- Modify: `src/views/EmployeeView.vue`

- [ ] **Step 1: 更新 rules（移除 employee_id 必填、對齊後端約束）**

把 `EmployeeView.vue:58` 起的 `rules` 物件替換為：

```ts
const rules = {
  // 後端 EmployeeCreate 真正必填只有 name；employee_id 由後端自動配號，不再強制
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }],
  supervisor_role: [{ pattern: /^(園長|主任|組長|副組長)$/, message: '主管職不正確', trigger: 'change' }],
  bonus_grade: [{ pattern: /^[ABC]$/, message: '獎金等級僅接受 A / B / C', trigger: 'change' }],
  pension_self_rate: [{ type: 'number', min: 0, max: 0.06, message: '勞退自提率需介於 0–0.06', trigger: 'blur' }],
  extra_dependents_quarterly: [{ type: 'number', min: 0, max: 10, message: '加保眷屬數需介於 0–10', trigger: 'blur' }],
  insurance_salary_override_reason: [{ max: 200, message: '不可超過 200 字', trigger: 'blur' }],
  teacher_cert_no: [{ max: 50, message: '不可超過 50 字', trigger: 'blur' }],
}
```

> 空字串 pattern 會誤判，故 `supervisor_role`/`bonus_grade` 規則僅在有值時觸發 — Element Plus pattern rule 對空字串預設略過（空字串不比對 pattern），符合需求。

- [ ] **Step 2: `formRef` 型別改 `FormInstance`、加 basicFormRef 與收合狀態**

於 script 區（`EmployeeView.vue:52` 附近）：

```ts
import type { FormInstance } from 'element-plus'
import FormSection from '@/components/common/FormSection.vue'
import { sectionForField } from '@/constants/employeeFormSections'

const formRef = ref<FormInstance | null>(null)
const basicFormRef = ref<{ applyValidationErrors: (p: string[]) => void } | null>(null)
const salarySectionRef = ref<{ expand: () => void } | null>(null)
const salarySectionErrors = ref(0)
```

- [ ] **Step 3: 改寫 `saveCreate` 加入收合×驗證**

把 `EmployeeView.vue:655` 起的 `saveCreate` 替換為：

```ts
const saveCreate = async () => {
  const formEl = formRef.value
  if (!formEl) return
  form.supervisor_role = form.supervisor_role || null
  form.bonus_grade = form.bonus_grade ? (form.bonus_grade as string).toUpperCase() : null
  if (form.bonus_grade && !['A', 'B', 'C'].includes(form.bonus_grade as string)) {
    ElMessage.error('獎金等級覆蓋僅接受 A / B / C')
    return
  }
  formEl.validate(async (valid, invalidFields) => {
    if (!valid) {
      const props = Object.keys(invalidFields ?? {})
      // 基本分頁的收合區段交給子元件展開
      basicFormRef.value?.applyValidationErrors(props)
      // 薪資區段（父層）自行展開
      const salaryProps = props.filter(p => sectionForField(p) === 'salary')
      salarySectionErrors.value = salaryProps.length
      if (salaryProps.length > 0) salarySectionRef.value?.expand()
      await nextTick()
      if (props[0]) formEl.scrollToField(props[0])
      return
    }
    try {
      await createEmployee(form)
      ElMessage.success('員工已新增')
      closeDialog()
      await fetchEmployees()
    } catch (err) {
      showError(err)
    }
  })
}
```

- [ ] **Step 4: 新增模式改單捲動模板（編輯模式維持 el-tabs）**

把 `EmployeeView.vue:829-855`（`<el-form ...>` 內的 `<el-tabs>` 區塊）改為依 `isEdit` 分流。`el-form` 改 `label-position="top"` 並移除 `label-width`：

```vue
<el-form :model="form" :rules="rules" ref="formRef" label-position="top">
  <!-- 新增：單捲動（核心 + 收合區段） -->
  <template v-if="!isEdit">
    <p class="required-legend"><span class="req">*</span> 為必填，其餘可日後補</p>
    <EmployeeFormBasic
      ref="basicFormRef"
      :form="formAsBasicData"
      :bureau-job-title-options="bureauJobTitleOptions"
      :classroom-options="classroomOptions"
      :is-self-edit="isSelfEdit"
    />
    <FormSection
      ref="salarySectionRef"
      title="薪資・投保・銀行"
      collapsible
      :default-open="false"
      :badge-count="salarySectionErrors"
      badge-type="error"
    >
      <el-alert
        v-if="pendingSuggestion"
        type="info" :closable="false" show-icon style="margin-bottom:12px"
      >依職稱建議底薪 {{ Number(suggestedSalary).toLocaleString() }}，可於下方套用</el-alert>
      <EmployeeFormSalary
        :form="form"
        :is-readonly="isSalaryReadonly"
        :readonly-reason="salaryReadonlyReason"
        :pending-suggestion="pendingSuggestion"
        :suggested-salary="suggestedSalary"
        :insurance-error="insuranceError"
        @apply-suggestion="applySuggestion"
        @dismiss-suggestion="dismissSuggestion"
        @sync-insurance="syncInsuranceToBase"
      />
    </FormSection>
  </template>

  <!-- 編輯：維持既有兩分頁 + dirty/preview/reason-gate -->
  <template v-else>
    <el-tabs type="border-card" v-model="activeTab">
      <el-tab-pane label="基本資料" name="basic">
        <EmployeeFormBasic
          :form="formAsBasicData"
          :bureau-job-title-options="bureauJobTitleOptions"
          :classroom-options="classroomOptions"
          :is-self-edit="isSelfEdit"
          :pending-suggestion="pendingSuggestion"
          :suggested-salary="suggestedSalary"
        />
      </el-tab-pane>
      <el-tab-pane label="薪資 / 投保 / 銀行" name="salary">
        <EmployeeFormSalary
          :form="form"
          :is-readonly="isSalaryReadonly"
          :readonly-reason="salaryReadonlyReason"
          :pending-suggestion="pendingSuggestion"
          :suggested-salary="suggestedSalary"
          :insurance-error="insuranceError"
          @apply-suggestion="applySuggestion"
          @dismiss-suggestion="dismissSuggestion"
          @sync-insurance="syncInsuranceToBase"
        />
      </el-tab-pane>
    </el-tabs>
  </template>
</el-form>
```

於 `<style scoped>` 補：

```css
.required-legend { font-size: 12px; color: var(--el-text-color-secondary); margin: 0 0 14px; }
.required-legend .req { color: var(--el-color-danger); }
```

> EmployeeFormBasic 在編輯模式仍會渲染收合區段（預設收合）。編輯模式不導入收合×驗證編排（沿用既有逐 tab dirty/save）。

- [ ] **Step 5: typecheck + build**

Run: `npx vue-tsc --noEmit && npm run build`
Expected: 無錯誤

- [ ] **Step 6: 跑既有 EmployeeView 相關測試確認無回歸**

Run: `npx vitest run tests/views tests/components/employee 2>/dev/null; npx vitest run --grep Employee`
Expected: 既有 employee 測試全綠（無新增 fail）

- [ ] **Step 7: Commit**

```bash
git add src/views/EmployeeView.vue
git commit -m "feat(employee): 新增員工改單欄收合表單 + rules 對齊後端 + 收合×驗證"
```

---

### Task 6: 全套回歸 + 手測清單

**Files:** 無（驗證）

- [ ] **Step 1: 全套 vitest + typecheck**

Run: `npx vitest run && npx vue-tsc --noEmit`
Expected: 相對 main 無新增 fail；typecheck 0 error

- [ ] **Step 2: 啟動 dev 手測（記錄結果）**

```bash
cd ~/Desktop/ivyManageSystem && ./start.sh
```
逐項確認：
1. 新增員工：只見核心 6 欄 + 4 個收合列 + 薪資收合列；員工編號顯示「自動配號」非輸入框。
2. 不填姓名直接儲存 → 姓名標紅、不送出。
3. 在「教保身分」收合區填一個違規值（如證號超過 50 字），其餘收合 → 儲存 → 該區自動展開 + 標題紅色徽章 + 捲到錯誤。
4. 只填姓名 → 儲存成功、列表出現自動配號工號。
5. 編輯既有員工：仍是兩分頁；改基本資料 → 「儲存基本資料 (n)」dirty 數正確；改薪資敏感欄 → reason-gate 仍跳。
6. self-edit（員工自己編輯）：敏感欄仍顯示鎖頭唯讀。

- [ ] **Step 3: 不 commit，回報手測結果給 user 決定後續**

> 手測為人工 gate，結果回報後由 user 決定是否合併 / 推廣其他表單（follow-up）。

---

## 推廣 follow-up（不在本計畫）

- `StudentEditDialog.vue` 等其餘約 100 個表單採同模式（opt-in）。
- 若要硬擋電話/email/身分證格式，需後端 `EmployeeCreate` 先加 Pydantic pattern（前後端同步，避免漂移）。
- 編輯模式 `FormSection` 顯示各區 dirty 數（`badgeType='info'`）為加值項。
