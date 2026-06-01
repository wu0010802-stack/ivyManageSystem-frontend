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
            <el-input v-model="editForm.reason" size="small" maxlength="200" show-word-limit placeholder="原因（選填）" />
            <el-input v-model="editForm.notes" size="small" maxlength="500" show-word-limit placeholder="備註（選填）" class="mt-4" />
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
        <el-input v-model="newForm.reason" size="small" maxlength="200" placeholder="選填" style="width: 130px" />
      </el-form-item>
      <el-form-item label="備註">
        <el-input v-model="newForm.notes" size="small" maxlength="500" placeholder="選填" style="width: 130px" />
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
