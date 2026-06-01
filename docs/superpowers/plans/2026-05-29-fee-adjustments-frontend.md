# 學費折抵前端補完 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把學費折抵（同胞優惠 / 預繳 / 請假扣款 / 其他）的前端從死 stub 補成可用的 CRUD：接上 4 個 api wrapper、把 `AdjustmentEditDialog.vue` 重寫成真元件。

**Architecture:** 純前端。後端 `/fees/adjustments` CRUD 既有不動。`src/api/fees.ts` 補 create/update/delete wrapper 並把 `getFeeAdjustments` 從 `Promise.resolve({items:[]})` 換成真呼叫；`AdjustmentEditDialog.vue` 改用 `el-dialog`，內部維護一份由 `existing` 種入的本地清單，逐筆即時 POST/PUT/DELETE，每次成功 `emit('saved')` 讓 `FeesTab.fetchData()` 重抓並刷新淨額 KPI。`FeesTab.vue`、`feeTypes.ts`、後端皆不改。

**Tech Stack:** Vue 3 `<script setup lang="ts">`、Element Plus、Vitest + @vue/test-utils、axios wrapper（`src/api/index.ts`，本檔內部 `.then(res => res.data)` 解包）。

---

## 關鍵契約與約束（實作前先讀）

**後端契約（`ivy-backend/api/fees/adjustments.py`，不動）：**

| Method | Path | Query / Body | 回傳 |
|---|---|---|---|
| GET | `/fees/adjustments` | query `?period=&student_id=&adjustment_type=` | `{ items: [...], total }` |
| POST | `/fees/adjustments` | body `AdjustmentCreate` | 單筆序列化物件 |
| PUT | `/fees/adjustments/{id}` | body `AdjustmentUpdate`（欄位皆 optional） | 單筆序列化物件 |
| DELETE | `/fees/adjustments/{id}` | — | `{ deleted: id }` |

- `AdjustmentCreate` = `{ student_id: int>0, period: str(^\d{3}-[12]$), adjustment_type: str, amount: int 1..999999, reason?: str≤200, notes?: str≤500 }`
- `adjustment_type` ∈ `sibling_discount` / `prepayment` / `leave_deduction` / `other`
- 序列化欄位：`id, student_id, period, adjustment_type, amount, reason, notes, created_by, created_at, updated_at`
- 後端 router **無 `response_model`** → OpenAPI 對應 response 型別是 `unknown`（非 codegen bug）。故 wrapper 回傳即 `unknown`，consumer 自行 narrow。

**OpenAPI 型別（已存在於 `src/api/_generated/schema.d.ts`，不需 regen）：**
- `ApiQuery<'/fees/adjustments', 'get'>` → `{ adjustment_type?: string|null; period?: string|null; student_id?: number|null }`
- `ApiBody<'/fees/adjustments', 'post'>` → `AdjustmentCreate`
- `ApiBody<'/fees/adjustments/{adjustment_id}', 'put'>` → `AdjustmentUpdate`

**硬約束（違反就破壞既有編譯 / 行為）：**
1. **不改 `FeesTab.vue`、`feeTypes.ts`、後端任何檔。**
2. `FeesTab` 呼叫 `getFeeAdjustments(adjParams)`，其中 `adjParams` 宣告為 `Record<string, unknown>`。因此 **`getFeeAdjustments` 參數型別必須維持 `unknown`**（對齊既有 `getFeeRecords = (params: unknown) => ...`）。若改成 `ApiQuery<...>` 會讓 `FeesTab` typecheck 失敗（`Record<string, unknown>` 不可指派給 `ApiQuery`）。**只在 create/update 套 `ApiBody`**（無 consumer 限制，型別安全價值最高的就是 mutation 路徑）。
3. `AdjustmentEditDialog` 的 **props/emits 契約不可變**（`FeesTab` 已依賴）：props `modelValue/student/period/adjustmentType/existing`、emits `update:modelValue`/`saved`。`student` prop 型別維持 `Record<string, unknown> | null`（`FeesTab` 傳入 `{student_id, id, student_name}` 的 `Record<string,unknown>` ref；窄化 prop 型別會讓 `FeesTab` 的 `:student` 綁定 typecheck 失敗）。
4. `FeesTab` 用 `v-if="adjDialogVisible"` 掛載 dialog → 每次開啟都是**全新 mount**，故本地清單在 setup 期由 `props.existing` 種入即可，不需 watch reseed。
5. 前端 TS-only：禁 `: any` / `as any`。測試需存取元件內部時用 `as unknown as <介面>`，不用 `as any`。

**檔案結構：**
- Modify：`src/api/fees.ts`（刪 stub、補 4 wrapper）
- Rewrite：`src/components/fees/AdjustmentEditDialog.vue`（佔位 → 真元件）
- Create：`src/api/__tests__/fees.adjustments.test.ts`
- Create：`src/components/fees/__tests__/AdjustmentEditDialog.test.ts`

> 所有 `npm` 指令都在 worktree 根 `/Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/fee-adjustments-ui-2026-05-29-frontend` 下執行。`git` 一律 `git -C <worktree 絕對路徑>`。

---

## Task 1: API wrappers（`src/api/fees.ts`）

**Files:**
- Test: `src/api/__tests__/fees.adjustments.test.ts`（Create）
- Modify: `src/api/fees.ts`（刪 26–31 行 stub 區塊，新增 4 wrapper）

- [ ] **Step 1: 寫失敗測試**

Create `src/api/__tests__/fees.adjustments.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

import api from '@/api'
import {
  getFeeAdjustments,
  createFeeAdjustment,
  updateFeeAdjustment,
  deleteFeeAdjustment,
} from '../fees'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

describe('fees adjustments API wrappers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getFeeAdjustments → GET /fees/adjustments 帶 params 並解包 data', async () => {
    asMock(api.get).mockResolvedValue({ data: { items: [], total: 0 } })
    const res = await getFeeAdjustments({ student_id: 5, period: '114-2' })
    expect(api.get).toHaveBeenCalledWith('/fees/adjustments', {
      params: { student_id: 5, period: '114-2' },
    })
    expect(res).toEqual({ items: [], total: 0 })
  })

  it('createFeeAdjustment → POST /fees/adjustments 帶 body', async () => {
    asMock(api.post).mockResolvedValue({ data: { id: 1 } })
    await createFeeAdjustment({
      student_id: 5,
      period: '114-2',
      adjustment_type: 'leave_deduction',
      amount: 300,
    })
    expect(api.post).toHaveBeenCalledWith('/fees/adjustments', {
      student_id: 5,
      period: '114-2',
      adjustment_type: 'leave_deduction',
      amount: 300,
    })
  })

  it('updateFeeAdjustment → PUT /fees/adjustments/:id 帶 body', async () => {
    asMock(api.put).mockResolvedValue({ data: { id: 7 } })
    await updateFeeAdjustment(7, { amount: 500, reason: '改額' })
    expect(api.put).toHaveBeenCalledWith('/fees/adjustments/7', {
      amount: 500,
      reason: '改額',
    })
  })

  it('deleteFeeAdjustment → DELETE /fees/adjustments/:id 並解包 data', async () => {
    asMock(api.delete).mockResolvedValue({ data: { deleted: 7 } })
    const res = await deleteFeeAdjustment(7)
    expect(api.delete).toHaveBeenCalledWith('/fees/adjustments/7')
    expect(res).toEqual({ deleted: 7 })
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test -- src/api/__tests__/fees.adjustments.test.ts`
Expected: FAIL — `createFeeAdjustment is not a function`（或 import undefined），且 `getFeeAdjustments` 不會呼叫 `api.get`（現為 `Promise.resolve`）。

- [ ] **Step 3: 改 `src/api/fees.ts`**

把檔案最後的 stub 區塊（第 26–31 行，從 `// ===== Stub (worktree-local only)` 註解到 `export const getFeeAdjustments = (_params?: unknown) => Promise.resolve({ items: [] })`）整段**刪除**，換成：

```ts
// ===== 學費折抵 CRUD（同胞優惠 / 預繳 / 請假扣款 / 其他）=====
// getFeeAdjustments 參數維持 unknown：FeesTab.vue 以 Record<string, unknown> 傳入，
// 改用 ApiQuery 會破壞既有 typecheck（對齊本檔 getFeeRecords 慣例）。
export const getFeeAdjustments = (params?: unknown) =>
  api.get('/fees/adjustments', { params }).then((res) => res.data)
export const createFeeAdjustment = (payload: ApiBody<'/fees/adjustments', 'post'>) =>
  api.post('/fees/adjustments', payload).then((res) => res.data)
export const updateFeeAdjustment = (
  id: number,
  payload: ApiBody<'/fees/adjustments/{adjustment_id}', 'put'>,
) => api.put(`/fees/adjustments/${id}`, payload).then((res) => res.data)
export const deleteFeeAdjustment = (id: number) =>
  api.delete(`/fees/adjustments/${id}`).then((res) => res.data)
```

並在檔案**第 1 行** `import api from './index'` 下方加一行型別 import：

```ts
import type { ApiBody } from './_generated/typed'
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test -- src/api/__tests__/fees.adjustments.test.ts`
Expected: PASS（4 個 it 全綠）。

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 0 error（特別確認 `FeesTab.vue` 不因 `getFeeAdjustments` 簽章改動而報錯）。

- [ ] **Step 6: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/fee-adjustments-ui-2026-05-29-frontend add src/api/fees.ts src/api/__tests__/fees.adjustments.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/fee-adjustments-ui-2026-05-29-frontend commit -m "feat(fees): 接上學費折抵 CRUD api wrapper

刪除 worktree-local stub（getFeeAdjustments 寫死 {items:[]}），
換成真呼叫並補 create/update/delete。getFeeAdjustments 參數維持
unknown 以相容 FeesTab；mutation body 以 OpenAPI ApiBody 型別約束。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 重寫 `AdjustmentEditDialog.vue`

**Files:**
- Test: `src/components/fees/__tests__/AdjustmentEditDialog.test.ts`（Create）
- Rewrite: `src/components/fees/AdjustmentEditDialog.vue`（整支佔位 → 真元件）

- [ ] **Step 1: 寫失敗測試**

Create `src/components/fees/__tests__/AdjustmentEditDialog.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'

vi.mock('@/api/fees', () => ({
  createFeeAdjustment: vi.fn(),
  updateFeeAdjustment: vi.fn(),
  deleteFeeAdjustment: vi.fn(),
}))

import { createFeeAdjustment, deleteFeeAdjustment } from '@/api/fees'
import AdjustmentEditDialog from '../AdjustmentEditDialog.vue'

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>

// 元件 defineExpose 出的測試介面（避免 as any）
interface DialogVm {
  list: Array<{ id: number; amount: number; adjustment_type: string }>
  showTypePicker: boolean
  newForm: { adjustment_type: string; amount: number; reason: string; notes: string }
  addNew: () => Promise<void>
  removeItem: (item: { id: number; adjustment_type: string; amount: number }) => Promise<void>
}

function mountDialog(overrides: Record<string, unknown> = {}) {
  const wrapper = mount(AdjustmentEditDialog, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
    props: {
      modelValue: true,
      student: { student_id: 5, student_name: '小明' },
      period: '114-2',
      adjustmentType: 'leave_deduction',
      existing: [],
      ...overrides,
    },
  })
  return wrapper
}

const vmOf = (w: ReturnType<typeof mountDialog>) => w.vm as unknown as DialogVm

describe('AdjustmentEditDialog', () => {
  beforeEach(() => vi.clearAllMocks())

  it('種入 existing → 本地清單顯示正確筆數與金額', async () => {
    const wrapper = mountDialog({
      existing: [
        { id: 1, adjustment_type: 'leave_deduction', amount: 300, reason: '請假3天' },
        { id: 2, adjustment_type: 'other', amount: 50, reason: '雜項' },
      ],
    })
    await flushPromises()
    const vm = vmOf(wrapper)
    expect(vm.list.length).toBe(2)
    expect(vm.list[0].amount).toBe(300)
  })

  it('新增成功 → createFeeAdjustment 帶正確 payload + emit saved', async () => {
    asMock(createFeeAdjustment).mockResolvedValue({
      id: 9,
      adjustment_type: 'leave_deduction',
      amount: 200,
    })
    const wrapper = mountDialog()
    await flushPromises()
    const vm = vmOf(wrapper)
    vm.newForm.amount = 200
    vm.newForm.reason = '請假2天'
    await vm.addNew()
    await flushPromises()
    expect(createFeeAdjustment).toHaveBeenCalledWith({
      student_id: 5,
      period: '114-2',
      adjustment_type: 'leave_deduction',
      amount: 200,
      reason: '請假2天',
      notes: '',
    })
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(vm.list.length).toBe(1)
  })

  it('leave_deduction 欄 → showTypePicker=true；sibling_discount → false', async () => {
    const a = mountDialog({ adjustmentType: 'leave_deduction' })
    await flushPromises()
    expect(vmOf(a).showTypePicker).toBe(true)

    const b = mountDialog({ adjustmentType: 'sibling_discount' })
    await flushPromises()
    expect(vmOf(b).showTypePicker).toBe(false)
  })

  it('刪除 → 確認後呼叫 deleteFeeAdjustment + 從清單移除 + emit saved', async () => {
    // happy-dom 下 ElMessageBox.confirm 需 spy；resolve 代表使用者按確認
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    asMock(deleteFeeAdjustment).mockResolvedValue({ deleted: 1 })
    const wrapper = mountDialog({
      existing: [{ id: 1, adjustment_type: 'leave_deduction', amount: 300 }],
    })
    await flushPromises()
    const vm = vmOf(wrapper)
    await vm.removeItem({ id: 1, adjustment_type: 'leave_deduction', amount: 300 })
    await flushPromises()
    expect(deleteFeeAdjustment).toHaveBeenCalledWith(1)
    expect(wrapper.emitted('saved')).toBeTruthy()
    expect(vm.list.length).toBe(0)
  })
})
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npm run test -- src/components/fees/__tests__/AdjustmentEditDialog.test.ts`
Expected: FAIL — 目前佔位元件無 `addNew`/`removeItem`/`list`/`showTypePicker`/`newForm`（`vm.list` 為 undefined → `.length` 報錯）。

- [ ] **Step 3: 重寫 `src/components/fees/AdjustmentEditDialog.vue`**

整支檔案內容替換為：

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { apiError } from '@/utils/error'
import {
  createFeeAdjustment,
  updateFeeAdjustment,
  deleteFeeAdjustment,
} from '@/api/fees'

interface FeeAdjustment {
  id: number
  student_id?: number
  period?: string
  adjustment_type: string
  amount: number
  reason?: string | null
  notes?: string | null
  created_by?: string | null
  created_at?: string | null
  updated_at?: string | null
}

const props = withDefaults(
  defineProps<{
    modelValue?: boolean
    student?: Record<string, unknown> | null
    period?: string
    adjustmentType?: string
    existing?: Record<string, unknown>[] | null
  }>(),
  {
    modelValue: false,
    student: null,
    period: '',
    adjustmentType: '',
    existing: null,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: []
}>()

const ADJ_TYPE_LABELS: Record<string, string> = {
  sibling_discount: '同胞優惠',
  prepayment: '預繳',
  leave_deduction: '請假扣款',
  other: '其他',
}

// 「其他/請假」欄（leave_deduction）允許在 請假扣款 / 其他 之間選；其餘欄類型固定
const showTypePicker = computed(() => props.adjustmentType === 'leave_deduction')
const NEW_TYPE_OPTIONS = [
  { value: 'leave_deduction', label: '請假扣款' },
  { value: 'other', label: '其他' },
]

const columnLabel = computed(() => ADJ_TYPE_LABELS[props.adjustmentType] || '折抵')
const studentName = computed(() => (props.student?.student_name as string) || '學生')
const studentId = computed(() => Number((props.student?.student_id as number) ?? 0))

// 本地清單：FeesTab 用 v-if 重新掛載，setup 期由 existing 種入即可
const list = ref<FeeAdjustment[]>(
  ((props.existing as FeeAdjustment[] | null) ?? []).map((x) => ({ ...x })),
)

// ── 行內編輯 ──
const editingId = ref<number | null>(null)
const editForm = ref<{ amount: number; reason: string; notes: string }>({
  amount: 1,
  reason: '',
  notes: '',
})
const editBusy = ref(false)

// ── 新增表單 ──
const newForm = ref<{ adjustment_type: string; amount: number; reason: string; notes: string }>({
  adjustment_type:
    props.adjustmentType === 'leave_deduction' ? 'leave_deduction' : props.adjustmentType,
  amount: 1,
  reason: '',
  notes: '',
})
const addBusy = ref(false)

function close() {
  emit('update:modelValue', false)
}

function startEdit(item: FeeAdjustment) {
  editingId.value = item.id
  editForm.value = { amount: item.amount, reason: item.reason ?? '', notes: item.notes ?? '' }
}

function cancelEdit() {
  editingId.value = null
}

async function saveEdit(item: FeeAdjustment) {
  editBusy.value = true
  try {
    const updated = (await updateFeeAdjustment(item.id, {
      amount: editForm.value.amount,
      reason: editForm.value.reason,
      notes: editForm.value.notes,
    })) as FeeAdjustment
    const idx = list.value.findIndex((a) => a.id === item.id)
    if (idx >= 0) list.value[idx] = { ...list.value[idx], ...updated }
    ElMessage.success('已更新折抵')
    editingId.value = null
    emit('saved')
  } catch (e) {
    ElMessage.error(apiError(e, '更新折抵失敗'))
  } finally {
    editBusy.value = false
  }
}

async function removeItem(item: FeeAdjustment) {
  try {
    await ElMessageBox.confirm(
      `確定刪除這筆${ADJ_TYPE_LABELS[item.adjustment_type] || ''}折抵（${item.amount.toLocaleString()} 元）？`,
      '刪除折抵',
      { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消，不報錯
  }
  try {
    await deleteFeeAdjustment(item.id)
    list.value = list.value.filter((a) => a.id !== item.id)
    ElMessage.success('已刪除折抵')
    emit('saved')
  } catch (e) {
    ElMessage.error(apiError(e, '刪除折抵失敗'))
  }
}

async function addNew() {
  if (!studentId.value || !props.period) {
    ElMessage.error('缺少學生或學期資訊')
    return
  }
  const adjustmentType = showTypePicker.value ? newForm.value.adjustment_type : props.adjustmentType
  addBusy.value = true
  try {
    const created = (await createFeeAdjustment({
      student_id: studentId.value,
      period: props.period,
      adjustment_type: adjustmentType,
      amount: newForm.value.amount,
      reason: newForm.value.reason,
      notes: newForm.value.notes,
    })) as FeeAdjustment
    list.value.push(created)
    newForm.value = {
      adjustment_type: showTypePicker.value ? 'leave_deduction' : props.adjustmentType,
      amount: 1,
      reason: '',
      notes: '',
    }
    ElMessage.success('已新增折抵')
    emit('saved')
  } catch (e) {
    ElMessage.error(apiError(e, '新增折抵失敗'))
  } finally {
    addBusy.value = false
  }
}

defineExpose({
  list,
  showTypePicker,
  newForm,
  editForm,
  editingId,
  startEdit,
  cancelEdit,
  saveEdit,
  removeItem,
  addNew,
})
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="`${columnLabel}編輯`"
    width="600px"
    @update:model-value="(v: boolean) => emit('update:modelValue', v)"
    @close="close"
  >
    <div class="adj-sub">{{ studentName }} · {{ period }} · 現有折抵</div>

    <el-table :data="list" size="small" empty-text="尚無折抵" class="adj-table">
      <el-table-column label="類型" width="100">
        <template #default="{ row }">
          {{ ADJ_TYPE_LABELS[row.adjustment_type] || row.adjustment_type }}
        </template>
      </el-table-column>
      <el-table-column label="金額" width="170" align="right">
        <template #default="{ row }">
          <el-input-number
            v-if="editingId === row.id"
            v-model="editForm.amount"
            :min="1"
            :max="999999"
            :step="1"
            :precision="0"
            size="small"
            controls-position="right"
          />
          <span v-else class="amount">-{{ row.amount.toLocaleString() }}</span>
        </template>
      </el-table-column>
      <el-table-column label="原因 / 備註">
        <template #default="{ row }">
          <template v-if="editingId === row.id">
            <el-input v-model="editForm.reason" size="small" placeholder="原因（選填）" />
            <el-input v-model="editForm.notes" size="small" placeholder="備註（選填）" class="mt-4" />
          </template>
          <span v-else>{{ row.reason || row.notes || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130" align="right">
        <template #default="{ row }">
          <template v-if="editingId === row.id">
            <el-button size="small" type="primary" link :loading="editBusy" @click="saveEdit(row)">
              儲存
            </el-button>
            <el-button size="small" link @click="cancelEdit">取消</el-button>
          </template>
          <template v-else>
            <el-button size="small" type="primary" link @click="startEdit(row)">編輯</el-button>
            <el-button size="small" type="danger" link @click="removeItem(row)">刪除</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <el-divider />

    <div class="adj-new-title">新增一筆</div>
    <el-form :inline="true" class="adj-new-form">
      <el-form-item v-if="showTypePicker" label="類型">
        <el-select v-model="newForm.adjustment_type" size="small" style="width: 120px">
          <el-option v-for="o in NEW_TYPE_OPTIONS" :key="o.value" :value="o.value" :label="o.label" />
        </el-select>
      </el-form-item>
      <el-form-item label="金額">
        <el-input-number
          v-model="newForm.amount"
          :min="1"
          :max="999999"
          :step="1"
          :precision="0"
          size="small"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="原因">
        <el-input v-model="newForm.reason" size="small" placeholder="選填" style="width: 130px" />
      </el-form-item>
      <el-form-item label="備註">
        <el-input v-model="newForm.notes" size="small" placeholder="選填" style="width: 130px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" size="small" :loading="addBusy" @click="addNew">新增</el-button>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="close">關閉</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.adj-sub {
  font-size: var(--text-xs, 12px);
  color: var(--text-tertiary, #94a3b8);
  margin-bottom: var(--space-2, 8px);
}
.adj-table {
  font-variant-numeric: tabular-nums;
}
.amount {
  color: var(--el-color-warning, #e6a23c);
  font-weight: 600;
}
.adj-new-title {
  font-weight: 700;
  font-size: var(--text-sm, 13px);
  margin-bottom: var(--space-2, 8px);
}
.adj-new-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 4px;
}
.mt-4 {
  margin-top: 4px;
}
</style>
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npm run test -- src/components/fees/__tests__/AdjustmentEditDialog.test.ts`
Expected: PASS（4 個 it 全綠）。

- [ ] **Step 5: Commit**

```bash
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/fee-adjustments-ui-2026-05-29-frontend add src/components/fees/AdjustmentEditDialog.vue src/components/fees/__tests__/AdjustmentEditDialog.test.ts
git -C /Users/yilunwu/Desktop/ivy-frontend/.claude/worktrees/fee-adjustments-ui-2026-05-29-frontend commit -m "feat(fees): 重寫 AdjustmentEditDialog 為可用折抵編輯元件

佔位提示換成 el-dialog 清單式編輯：由 existing 種入本地清單，
逐筆即時新增/編輯/刪除折抵，每次成功 emit saved 觸發 FeesTab 重抓。
其他/請假欄可選 請假扣款/其他；其餘欄類型固定。

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 整合驗證

**Files:** 無（驗證 + 視需要的收尾 commit）

- [ ] **Step 1: 全套單元測試（相對 main 無新增 fail）**

Run: `npm run test`
Expected: 新增 8 個測試全綠；既有測試數量不減、無新增 fail。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 error。重點再確認 `FeesTab.vue`（`getFeeAdjustments` 簽章）與 dialog 的 `el-dialog` `@update:model-value` 綁定無型別錯誤。

- [ ] **Step 3: build**

Run: `npm run build`
Expected: build success，無 `AdjustmentEditDialog` / `fees.ts` 相關錯誤。

- [ ] **Step 4: 手動 smoke（dev server，需另起後端）**

說明（人工驗收，非自動步驟）：
1. 進入某學生詳情 → 學費 tab → 將學期下拉**從「全部學期」切到具體學期**（如 `114-2`）。
2. 「折抵項目」表任一列點「新增」→ dialog 開啟 → 輸入金額 → 按「新增」→ 應收（淨額）KPI 即時下降、清單出現該筆。
3. 點「編輯」改金額 → 儲存 → KPI 同步更新。
4. 點「刪除」→ 確認 → 該筆消失、KPI 回升。
5. 在「其他/請假」欄新增時，應出現「請假扣款 / 其他」下拉；在「同胞優惠」欄則不出現。

- [ ] **Step 5（若 Task 1/2 已各自 commit 則略過）**

本任務通常不產生程式碼變更。若驗證中發現需微調，修正後依 Conventional Commits 補一筆 `fix(fees): ...`，footer 同上。

---

## 不做（YAGNI）

- 不改 `FeesTab.vue`、`feeTypes.ts`、後端任何檔。
- 不做「全部編輯完一次批次送出」（採每筆即時存檔）。
- 不加全校折抵列表頁 / 折抵匯出。
- 不動 `src/api/index.ts` axios wrapper。
- 不需 `npm run gen:api`（schema.d.ts 已含 `/fees/adjustments` 兩條 path 的型別）。

## 驗收標準

- 具體學期下，折抵列「新增 / 編輯 / 刪除」皆可用，KPI 淨額即時連動。
- 「其他/請假」欄新增可選 請假扣款 / 其他；其餘欄類型固定。
- `npm run test`（新測試綠）、`npm run typecheck`（0 error）、`npm run build`（成功）、相對 main 無新增測試 fail。

---

## Self-Review（plan vs spec）

**1. Spec coverage：**
- spec §1 API wrapper（4 個）→ Task 1 ✅（`getFeeAdjustments` 維持 `unknown` 的決策已明確鎖定，補上 spec 未細究的 `FeesTab` 相容性約束）。
- spec §2 dialog 重寫（props/emits 不變、清單式、leave_deduction 類型下拉、每筆即時存檔）→ Task 2 ✅。
- spec 資料流（emit saved → FeesTab.fetchData）→ Task 2 元件 emit + 手測 Step 4 ✅。
- spec 錯誤處理（try/catch + apiError + 刪除前 confirm + 取消不報錯）→ Task 2 `saveEdit`/`removeItem`/`addNew` ✅。
- spec 測試（api 4 wrapper + dialog 4 案例）→ Task 1/2 測試 ✅。
- spec 驗收標準 → Task 3 ✅。

**2. Placeholder scan：** 無 TODO/TBD；每個 code step 均含完整可貼上的程式碼與確切指令、預期輸出。

**3. Type consistency：** `getFeeAdjustments/createFeeAdjustment/updateFeeAdjustment/deleteFeeAdjustment` 命名在 fees.ts、兩個測試、dialog import 全一致；`FeeAdjustment` 介面欄位與後端 `_serialize` 對齊；`showTypePicker`/`newForm`/`list`/`addNew`/`removeItem` 在元件 `defineExpose` 與 dialog 測試 `DialogVm` 介面一致。
