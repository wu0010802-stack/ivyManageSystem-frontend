<template>
  <div class="plan-batch-toolbar">
    <span class="selected-count">已選 {{ selectedCount }} 位學生</span>

    <el-select
      v-model="assignTargetId"
      placeholder="移至班級"
      clearable
      :disabled="isDisabled"
      class="toolbar-select"
      @change="applyAssign"
    >
      <el-option v-for="cls in planClasses" :key="cls.id" :label="cls.label" :value="cls.id" />
    </el-select>

    <el-select
      v-model="retainTargetId"
      placeholder="標記留級"
      clearable
      :disabled="isDisabled"
      class="toolbar-select"
      @change="applyRetain"
    >
      <el-option v-for="cls in planClasses" :key="cls.id" :label="cls.label" :value="cls.id" />
    </el-select>

    <el-button :disabled="isDisabled" @click="applyExclude">排除</el-button>
    <el-button :disabled="isDisabled" @click="applyReset">還原建議</el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'

export interface PlanClassOption {
  id: number
  label: string
}

// 批次工具列（勾選集合由 PlanRosterTable 上溯至父層 YearPlanWorkspaceView，本元件只
// 負責「派發 op」——不持有 student_ids，父層合併 selectedIds + base_version 呼叫
// useYearPlanWorkspace.bulkUpdateStudents()。assign/retain 皆需要 plan_class_id（後端
// BulkStudentsRequest 語意：retain 的目標班級年級須與學生現況年級一致，由後端驗證，
// 前端不重複判斷，錯誤走既有 error 流程）。

const props = defineProps<{
  selectedCount: number
  planClasses: PlanClassOption[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  'bulk-op': [payload: { op: BulkOp; planClassId?: number | null; excludeReason?: string | null }]
}>()

const assignTargetId = ref<number | null>(null)
const retainTargetId = ref<number | null>(null)

const isDisabled = computed(() => !!props.disabled || props.selectedCount === 0)

function applyAssign(): void {
  if (assignTargetId.value == null) return
  emit('bulk-op', { op: 'assign', planClassId: assignTargetId.value })
  assignTargetId.value = null
}

function applyRetain(): void {
  if (retainTargetId.value == null) return
  emit('bulk-op', { op: 'retain', planClassId: retainTargetId.value })
  retainTargetId.value = null
}

async function applyExclude(): Promise<void> {
  try {
    // ElMessageBox.prompt 型別為 MessageBoxInputData | Action（三種 box 共用型別，
    // TS 不會依呼叫的是 prompt narrowing），實際上 prompt 恆回傳含 value 的物件。
    const result = await ElMessageBox.prompt('排除原因（選填）', '排除學生', {
      confirmButtonText: '確定',
      cancelButtonText: '取消',
      inputPlaceholder: '例如：轉學、休學…',
    })
    const value = typeof result === 'object' ? result.value : null
    emit('bulk-op', { op: 'exclude', excludeReason: value || null })
  } catch {
    // 使用者取消，不派發
  }
}

function applyReset(): void {
  emit('bulk-op', { op: 'reset' })
}

// 測試介面：繞過 el-select 的 popper 互動，直接操作內部 ref + 呼叫方法（比照
// AdjustmentEditDialog.test.ts 的 defineExpose 慣例）。
defineExpose({ assignTargetId, retainTargetId, applyAssign, applyRetain, applyExclude, applyReset })
</script>

<style scoped>
.plan-batch-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-2) 0;
}

.selected-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.toolbar-select {
  width: 160px;
}
</style>
