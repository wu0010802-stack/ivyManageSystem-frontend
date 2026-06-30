# 薪資批次手動調整（前端迴圈版）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 薪資月結覆核可選取多筆 record，對單一欄位設同一絕對值 + 共用原因，逐筆呼叫既有 manual-adjust 端點一次套用。

**Architecture:** 純前端。抽 `EDITABLE_SALARY_FIELDS` 共用常數；新 `BatchAdjustDialog`（欄位/值/原因）；`StepReview` 加 selection + 批次按鈕 + `applyBatchAdjust` 以 `Promise.allSettled` 逐筆送單欄 partial payload 給既有 `manualAdjustSalary`，收集逐筆成功/失敗後 `settlement.refresh()`。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + Element Plus + Vitest（happy-dom）。

**Spec:** `docs/superpowers/specs/2026-06-17-salary-batch-manual-adjust-design.md`

---

## 前置：worktree 與分支（⚠ off LOCAL main，非 origin/main）

本子專案建立在上一批（列表一致化）對 `StepReview` 加的搜尋 + 新增的 `src/composables/useClientTableFilter.ts` 之上——這兩者是 **local main 限定、origin/main 沒有**。故 worktree **必須 off local `main`**（否則 worktree 內 StepReview 是舊版、`useClientTableFilter` 不存在）。

```bash
cd /Users/yilunwu/Desktop/ivy-frontend
git worktree add .worktrees/salary-batch-adjust-2026-06-17 -b feat/salary-batch-adjust-2026-06-17-fe main
```
node_modules：在 worktree 內以絕對路徑 symlink 主 checkout（避免 cd 複合指令問題）：
```bash
ln -s /Users/yilunwu/Desktop/ivy-frontend/node_modules /Users/yilunwu/Desktop/ivy-frontend/.worktrees/salary-batch-adjust-2026-06-17/node_modules
```
子代理一律 `git -C <worktree>`、開頭 `git -C <worktree> branch --show-current` 驗證為 `feat/salary-batch-adjust-2026-06-17-fe`；跑測試/typecheck 前 `cd` 進 worktree。**無後端、無 migration、不重生 schema.d.ts。**

## File Structure

- Create: `src/constants/salaryFields.ts` — 共用可調欄位常數（單一責任：欄位 key/label 清單）。
- Create: `src/constants/__tests__/salaryFields.test.ts`
- Modify: `src/views/salary/settle/AdjustDrawer.vue` — 改 import 共用常數（移除內嵌定義）。
- Create: `src/views/salary/settle/BatchAdjustDialog.vue` — presentational 批次調整 dialog。
- Create: `src/views/salary/settle/__tests__/BatchAdjustDialog.spec.ts`
- Modify: `src/views/salary/settle/StepReview.vue` — selection + 批次按鈕 + dialog + `applyBatchAdjust`。
- Modify: `src/views/salary/settle/__tests__/StepReview.spec.ts` — 批次調整測試。

---

## Task 1: 抽 `EDITABLE_SALARY_FIELDS` 共用常數

**Files:**
- Create: `src/constants/salaryFields.ts`
- Create: `src/constants/__tests__/salaryFields.test.ts`
- Modify: `src/views/salary/settle/AdjustDrawer.vue`（內嵌 `EDITABLE_FIELDS` 在 72-85）

- [ ] **Step 1: 寫失敗測試 `src/constants/__tests__/salaryFields.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { EDITABLE_SALARY_FIELDS } from '@/constants/salaryFields'

describe('EDITABLE_SALARY_FIELDS', () => {
  it('含 12 個可調欄位且為 frozen', () => {
    expect(EDITABLE_SALARY_FIELDS).toHaveLength(12)
    expect(Object.isFrozen(EDITABLE_SALARY_FIELDS)).toBe(true)
    expect(EDITABLE_SALARY_FIELDS.map((f) => f.key)).toContain('festival_bonus')
    expect(EDITABLE_SALARY_FIELDS.every((f) => typeof f.key === 'string' && typeof f.label === 'string')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd <worktree> && npx vitest run src/constants/__tests__/salaryFields.test.ts`
Expected: FAIL — 無法解析 `@/constants/salaryFields`。

- [ ] **Step 3: 建常數 `src/constants/salaryFields.ts`**

```ts
/** 薪資手動調整可編輯欄位（HR 可手調的安全子集；後端 EDITABLE_SALARY_FIELDS 為其超集）。
 *  單筆 AdjustDrawer 與批次 BatchAdjustDialog 共用，避免兩份漂移。 */
export const EDITABLE_SALARY_FIELDS = Object.freeze([
  { key: 'festival_bonus', label: '節慶獎金' },
  { key: 'overtime_bonus', label: '超額獎金' },
  { key: 'overtime_pay', label: '加班津貼' },
  { key: 'supervisor_dividend', label: '主管紅利' },
  { key: 'meeting_overtime_pay', label: '會議加班' },
  { key: 'birthday_bonus', label: '生日禮金' },
  { key: 'extra_allowance', label: '額外加給' },
  { key: 'leave_deduction', label: '請假扣款' },
  { key: 'late_deduction', label: '遲到扣款' },
  { key: 'early_leave_deduction', label: '早退扣款' },
  { key: 'meeting_absence_deduction', label: '節慶獎金扣減' },
  { key: 'absence_deduction', label: '曠職扣款' },
] as const)

export type EditableSalaryFieldKey = (typeof EDITABLE_SALARY_FIELDS)[number]['key']
```

- [ ] **Step 4: AdjustDrawer 改用共用常數**

`src/views/salary/settle/AdjustDrawer.vue`：在 import 區（56-60）加：
```ts
import { EDITABLE_SALARY_FIELDS as EDITABLE_FIELDS } from '@/constants/salaryFields'
```
刪除內嵌定義（72-85 的 `const EDITABLE_FIELDS = [ ... ] as const`）。其餘用到 `EDITABLE_FIELDS` 之處（17/87/94/104/122）與 `type FieldKey = (typeof EDITABLE_FIELDS)[number]['key']`（87）保持不動（imported 別名相容）。

- [ ] **Step 5: 跑測試確認通過 + AdjustDrawer 既有測試守護**

Run: `cd <worktree> && npx vitest run src/constants/__tests__/salaryFields.test.ts src/views/salary/settle/__tests__/StepReview.spec.ts`
Expected: PASS（新常數測試 + StepReview.spec.ts 內含的 AdjustDrawer describe 全綠——確認抽常數無回歸）。

- [ ] **Step 6: typecheck + commit**

Run: `cd <worktree> && npm run typecheck`（0 錯）
```bash
git -C <worktree> add src/constants/salaryFields.ts src/constants/__tests__/salaryFields.test.ts src/views/salary/settle/AdjustDrawer.vue
git -C <worktree> commit -m "refactor(salary): 抽 EDITABLE_SALARY_FIELDS 共用常數供單筆/批次調整共用"
```

---

## Task 2: `BatchAdjustDialog` 元件

**Files:**
- Create: `src/views/salary/settle/BatchAdjustDialog.vue`
- Test: `src/views/salary/settle/__tests__/BatchAdjustDialog.spec.ts`

- [ ] **Step 1: 寫失敗測試 `src/views/salary/settle/__tests__/BatchAdjustDialog.spec.ts`**

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BatchAdjustDialog from '../BatchAdjustDialog.vue'

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }
})

const STUBS = {
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': true,
  'el-option': true,
  'el-input-number': true,
  'el-input': true,
  'el-button': { template: '<button><slot /></button>' },
  teleport: true,
}
const mountDialog = () => mount(BatchAdjustDialog, { props: { modelValue: true, count: 3 }, global: { stubs: STUBS } })

describe('BatchAdjustDialog', () => {
  it('原因 < 5 字擋下不 emit confirm', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { field: string; value: number; reason: string; submit: () => void }
    vm.field = 'festival_bonus'; vm.value = 500; vm.reason = '太短'
    vm.submit()
    expect(wrapper.emitted('confirm')).toBeFalsy()
  })

  it('填妥 emit confirm 帶 {field,value,reason}', async () => {
    const wrapper = mountDialog()
    const vm = wrapper.vm as unknown as { field: string; value: number; reason: string; submit: () => void }
    vm.field = 'festival_bonus'; vm.value = 500; vm.reason = '活動加班補發'
    vm.submit()
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual({ field: 'festival_bonus', value: 500, reason: '活動加班補發' })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd <worktree> && npx vitest run src/views/salary/settle/__tests__/BatchAdjustDialog.spec.ts`
Expected: FAIL — 無法解析 `../BatchAdjustDialog.vue`。

- [ ] **Step 3: 建元件 `src/views/salary/settle/BatchAdjustDialog.vue`**

```vue
<template>
  <el-dialog
    :model-value="modelValue"
    title="批次調整薪資"
    width="460px"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <p class="batch-adjust-hint">將套用到所選的 {{ count }} 筆薪資（設為同一絕對值）。</p>
    <el-form label-width="90px">
      <el-form-item label="調整欄位" required>
        <el-select v-model="field" placeholder="選擇欄位" style="width: 100%">
          <el-option v-for="f in EDITABLE_SALARY_FIELDS" :key="f.key" :label="f.label" :value="f.key" />
        </el-select>
      </el-form-item>
      <el-form-item label="金額" required>
        <el-input-number v-model="value" :min="0" :step="100" style="width: 100%" />
      </el-form-item>
      <el-form-item label="調整原因" required>
        <el-input
          v-model="reason"
          type="textarea"
          :rows="3"
          placeholder="必填，至少 5 字（將套用至所有選取的薪資）"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="submit">套用</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { EDITABLE_SALARY_FIELDS } from '@/constants/salaryFields'

withDefaults(defineProps<{ modelValue: boolean; count?: number; loading?: boolean }>(), {
  count: 0,
  loading: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [payload: { field: string; value: number; reason: string }]
}>()

const field = ref('')
const value = ref(0)
const reason = ref('')

const submit = () => {
  if (!field.value) {
    ElMessage.warning('請選擇要調整的欄位')
    return
  }
  if (reason.value.trim().length < 5) {
    ElMessage.warning('請填寫調整原因（至少 5 字）')
    return
  }
  emit('confirm', { field: field.value, value: Number(value.value || 0), reason: reason.value.trim() })
}
</script>

<style scoped>
.batch-adjust-hint {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd <worktree> && npx vitest run src/views/salary/settle/__tests__/BatchAdjustDialog.spec.ts`
Expected: PASS（2 tests）。

- [ ] **Step 5: typecheck + commit**

Run: `cd <worktree> && npm run typecheck`（0 錯）
```bash
git -C <worktree> add src/views/salary/settle/BatchAdjustDialog.vue src/views/salary/settle/__tests__/BatchAdjustDialog.spec.ts
git -C <worktree> commit -m "feat(salary): 新增 BatchAdjustDialog 批次調整對話框"
```

---

## Task 3: `StepReview` 加選取 + 批次套用

**Files:**
- Modify: `src/views/salary/settle/StepReview.vue`（import 322-342；canWriteSalary 352；inject/visibleRecords 346-383；adjust 區 406-412；el-table 52-61、第一欄 62；review-toolbar__actions 22-48；AdjustDrawer 掛載 284）
- Test: `src/views/salary/settle/__tests__/StepReview.spec.ts`

- [ ] **Step 1: 寫失敗測試（加到 `StepReview.spec.ts` 末端，新 describe）**

`@/api/salary` mock（14-17）補上 `manualAdjustSalary`（已存在於 mock）。在 STUBS 加 `BatchAdjustDialog: true`（或在新測試 mount 時併入）。新增：
```ts
import { manualAdjustSalary } from '@/api/salary'

describe('StepReview 批次調整', () => {
  beforeEach(() => { vi.mocked(manualAdjustSalary).mockReset() })

  it('applyBatchAdjust 對每筆選取送單欄 partial payload 並 refresh', async () => {
    vi.mocked(manualAdjustSalary).mockResolvedValue({ data: { record: {} } } as never)
    const settlement = makeSettlement([rec({ id: 1 })])
    const wrapper = mount(StepReview, {
      global: { stubs: { ...STUBS, BatchAdjustDialog: true }, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
    })
    const vm = wrapper.vm as unknown as {
      selectedAdjustRows: SettlementRecord[]
      applyBatchAdjust: (p: { field: string; value: number; reason: string }) => Promise<void>
    }
    vm.selectedAdjustRows = [
      rec({ id: 1, employee_name: '甲', version: 3 }),
      rec({ id: 2, employee_name: '乙', version: 5 }),
    ]
    await vm.applyBatchAdjust({ field: 'festival_bonus', value: 500, reason: '活動加班補發' })
    expect(vi.mocked(manualAdjustSalary)).toHaveBeenCalledTimes(2)
    expect(vi.mocked(manualAdjustSalary)).toHaveBeenCalledWith(1, { festival_bonus: 500, adjustment_reason: '活動加班補發' }, 3)
    expect(vi.mocked(manualAdjustSalary)).toHaveBeenCalledWith(2, { festival_bonus: 500, adjustment_reason: '活動加班補發' }, 5)
    expect(settlement.refresh).toHaveBeenCalled()
  })

  it('部分失敗時其餘成功並 warning', async () => {
    vi.mocked(manualAdjustSalary)
      .mockRejectedValueOnce({ response: { data: { detail: '已封存' } } })
      .mockResolvedValue({ data: { record: {} } } as never)
    const settlement = makeSettlement([rec({ id: 1 })])
    const wrapper = mount(StepReview, {
      global: { stubs: { ...STUBS, BatchAdjustDialog: true }, provide: { settlement, settleQuery: { year: 2026, month: 5 } } },
    })
    const vm = wrapper.vm as unknown as {
      selectedAdjustRows: SettlementRecord[]
      applyBatchAdjust: (p: { field: string; value: number; reason: string }) => Promise<void>
    }
    vm.selectedAdjustRows = [rec({ id: 1, employee_name: '甲', version: 3 }), rec({ id: 2, employee_name: '乙', version: 5 })]
    await vm.applyBatchAdjust({ field: 'overtime_pay', value: 300, reason: '值週津貼補發' })
    const { ElMessage } = await import('element-plus')
    expect(vi.mocked(ElMessage.warning)).toHaveBeenCalled()
    expect(settlement.refresh).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd <worktree> && npx vitest run src/views/salary/settle/__tests__/StepReview.spec.ts -t 批次調整`
Expected: FAIL — `vm.applyBatchAdjust` / `vm.selectedAdjustRows` undefined。

- [ ] **Step 3: 改實作 `StepReview.vue`**

（a）import 區（326）把 `@/api/salary` import 改為含 `manualAdjustSalary`，並 import dialog：
```ts
import { getSalaryFieldBreakdown, manualAdjustSalary } from '@/api/salary'
import BatchAdjustDialog from './BatchAdjustDialog.vue'
```
（b）在「列內調整」區（406-412）之後加批次狀態與函式：
```ts
// ---- 批次調整 ----
const batchAdjustVisible = ref(false)
const selectedAdjustRows = ref<SettlementRecord[]>([])
const isRowSelectable = (row: SettlementRecord) => !row.is_finalized
const onSelectionChange = (rows: SettlementRecord[]) => {
    selectedAdjustRows.value = rows
}
const applyBatchAdjust = async ({ field, value, reason }: { field: string; value: number; reason: string }) => {
    const rows = selectedAdjustRows.value
    if (rows.length === 0) return
    const payload = { [field]: value, adjustment_reason: reason } as Parameters<typeof manualAdjustSalary>[1]
    const results = await Promise.allSettled(
        rows.map((r) => manualAdjustSalary(r.id, payload, r.version ?? undefined)),
    )
    const failed = results
        .map((res, i) => ({ res, row: rows[i] }))
        .filter((x) => x.res.status === 'rejected')
        .map((x) => {
            const e = (x.res as PromiseRejectedResult).reason as { response?: { data?: { detail?: string } } }
            return { name: x.row.employee_name, reason: e?.response?.data?.detail || '失敗' }
        })
    const succeeded = rows.length - failed.length
    if (failed.length === 0) {
        ElMessage.success(`已套用 ${succeeded} 筆`)
    } else {
        ElMessage.warning(
            `完成：成功 ${succeeded} 筆，失敗 ${failed.length} 筆（${failed.map((f) => `${f.name}: ${f.reason}`).join('；')}）`,
        )
    }
    batchAdjustVisible.value = false
    selectedAdjustRows.value = []
    settlement.refresh()
}
```
（`ElMessage` 已於 324 import。）

（c）template：`<el-table>` 開標（52-61）加 `@selection-change="onSelectionChange"`；在第一個欄（`type="expand"`，行 62）之前插入：
```html
      <el-table-column type="selection" :selectable="isRowSelectable" width="45" />
```
（d）`review-toolbar__actions`（22-48）內加批次按鈕（搜尋框旁）：
```html
          <el-button
            v-if="canWriteSalary"
            type="primary"
            size="small"
            :disabled="selectedAdjustRows.length === 0"
            @click="batchAdjustVisible = true"
          >批次調整 ({{ selectedAdjustRows.length }})</el-button>
```
（e）在 `<AdjustDrawer ... />`（284）旁掛 dialog：
```html
    <BatchAdjustDialog v-model="batchAdjustVisible" :count="selectedAdjustRows.length" @confirm="applyBatchAdjust" />
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd <worktree> && npx vitest run src/views/salary/settle/__tests__/StepReview.spec.ts`
Expected: PASS（既有 + 新 2）。

- [ ] **Step 5: typecheck + commit**

Run: `cd <worktree> && npm run typecheck`（0 錯）
```bash
git -C <worktree> add src/views/salary/settle/StepReview.vue src/views/salary/settle/__tests__/StepReview.spec.ts
git -C <worktree> commit -m "feat(salary): 薪資覆核寬表加多選批次調整（逐筆套同值）"
```

---

## 收尾驗證（全部完成後）

- [ ] `cd <worktree> && npm run typecheck && npx vitest run src/constants/__tests__/salaryFields.test.ts src/views/salary/settle/__tests__/`（typecheck 0 + settle 全測 + 常數測試綠）。
- [ ] 合回 local main（worktree off local main，merge 為 ff/clean）；當天清 worktree。無後端、無 migration、無 schema.d.ts 重生。
