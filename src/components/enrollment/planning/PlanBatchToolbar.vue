<template>
  <div class="plan-batch-toolbar">
    <span class="selected-count">已選 {{ selectedCount }} 位學生</span>

    <el-select
      v-model="assignTargetId"
      placeholder="移至班級"
      clearable
      filterable
      :disabled="assignDisabled"
      class="toolbar-select"
      @change="applyAssign"
    >
      <el-option-group v-for="group in assignGroups" :key="group.gradeName" :label="group.gradeName">
        <el-option v-for="cls in group.options" :key="cls.id" :label="cls.label" :value="cls.id" />
      </el-option-group>
    </el-select>

    <el-select
      v-model="retainTargetId"
      placeholder="標記留級"
      clearable
      :disabled="retainDisabled"
      class="toolbar-select"
      @change="applyRetain"
    >
      <el-option v-for="cls in retainOptions" :key="cls.id" :label="cls.label" :value="cls.id" />
    </el-select>

    <el-button :disabled="isDisabled" @click="applyExclude">排除</el-button>
    <el-button :disabled="isDisabled" @click="applyReset">還原建議</el-button>
    <el-button text class="btn-clear-selection" @click="emit('clear-selection')">清除選取</el-button>
    <span v-if="hint" class="toolbar-hint">{{ hint }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { BulkOp } from '@/composables/useYearPlanWorkspace'

export interface PlanClassOption {
  id: number
  label: string
  /** 目標年級名稱；「移至班級」依此分組、「標記留級」依此過濾。 */
  gradeName?: string | null
}

/** 所選學生的最小資訊（父層由 plan.students 依勾選集合取出）。 */
export interface SelectedPlanStudent {
  id: number
  disposition: string
  current_grade_name?: string | null
}

// 批次工具列（勾選集合由父層 YearPlanWorkspaceView 持有，本元件只負責「派發 op」——
// 父層合併 selectedIds + base_version 呼叫 useYearPlanWorkspace.bulkUpdateStudents()）。
// 依所選學生預先擋掉後端會拒絕或會出事的組合：
// - 含畢業生或留級生時停用「移至班級」：一般分派會把留級改回 promote，畢業生仍會被
//   7/31 自動畢業（只豁免 retain）。
// - 「標記留級」只列與所選學生現況年級相同的班（後端 retain 年級不符回 422）。

const props = withDefaults(defineProps<{
  selectedCount: number
  planClasses: PlanClassOption[]
  selectedStudents?: SelectedPlanStudent[]
  disabled?: boolean
}>(), {
  selectedStudents: () => [],
  disabled: false,
})

const emit = defineEmits<{
  'bulk-op': [payload: { op: BulkOp; planClassId?: number | null; excludeReason?: string | null }]
  'clear-selection': []
}>()

const assignTargetId = ref<number | null>(null)
const retainTargetId = ref<number | null>(null)

const isDisabled = computed(() => !!props.disabled || props.selectedCount === 0)

const hasGraduate = computed(() => props.selectedStudents.some(s => s.disposition === 'graduate'))
// 留級生用「移至班級」會被改回一般分派、丟掉留級標記；換班要走「標記留級」
const hasRetain = computed(() => props.selectedStudents.some(s => s.disposition === 'retain'))
const assignDisabled = computed(() => isDisabled.value || hasGraduate.value || hasRetain.value)

const assignGroups = computed(() => {
  const groups: Array<{ gradeName: string; options: PlanClassOption[] }> = []
  for (const cls of props.planClasses) {
    const gradeName = cls.gradeName || '未分年級'
    let group = groups.find(g => g.gradeName === gradeName)
    if (!group) {
      group = { gradeName, options: [] }
      groups.push(group)
    }
    group.options.push(cls)
  }
  return groups
})

// 所選學生的共同現況年級；混年級或年級不明回 null
const commonGrade = computed<string | null>(() => {
  const names = new Set(props.selectedStudents.map(s => s.current_grade_name ?? ''))
  if (names.size !== 1) return null
  const [only] = names
  return only || null
})
const mixedGrades = computed(() => props.selectedStudents.length > 0 && commonGrade.value === null)
const retainOptions = computed(() => {
  if (props.selectedStudents.length === 0) return props.planClasses
  if (commonGrade.value === null) return []
  return props.planClasses.filter(c => c.gradeName === commonGrade.value)
})
const retainDisabled = computed(() => isDisabled.value || retainOptions.value.length === 0)

const hint = computed(() => {
  if (props.selectedCount === 0) return ''
  const hints: string[] = []
  if (hasGraduate.value) hints.push('所選含畢業生：要續讀請用「標記留級」，否則仍會被自動畢業')
  if (hasRetain.value) hints.push('所選含留級生：要換班請用「標記留級」選同年級的班')
  if (mixedGrades.value) hints.push('所選學生年級不同，請分年級標記留級')
  else if (props.selectedStudents.length > 0 && retainOptions.value.length === 0) {
    hints.push(`沒有${commonGrade.value ?? ''}的班級可以留級`)
  }
  return hints.join('；')
})

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
    const result = await ElMessageBox.prompt(
      '排除的學生不參與本次編班：套用時不會被搬動、仍留在原班，也不會辦理離園（轉學、休學請到學生資料辦理）。可填寫原因（選填）：',
      '排除學生',
      {
        confirmButtonText: '排除',
        cancelButtonText: '取消',
        inputPlaceholder: '例如：預計轉學、待家長確認',
      },
    )
    const value = typeof result === 'object' ? result.value : null
    emit('bulk-op', { op: 'exclude', excludeReason: value || null })
  } catch {
    // 使用者取消，不派發
  }
}

async function applyReset(): Promise<void> {
  try {
    // 還原建議會丟棄所選學生的手動調整，改回系統建議分派——具破壞性，先強確認
    // 再派發（比照 applyExclude 的 ElMessageBox 慣例）。
    await ElMessageBox.confirm(
      '此操作將丟棄所選學生的手動調整，還原為系統建議，確定要繼續嗎？',
      '還原建議',
      { type: 'warning', confirmButtonText: '確定還原', cancelButtonText: '取消' },
    )
  } catch {
    return // 使用者取消，不派發
  }
  emit('bulk-op', { op: 'reset' })
}

// 測試介面：繞過 el-select 的 popper 互動，直接操作內部 ref + 呼叫方法（比照
// AdjustmentEditDialog.test.ts 的 defineExpose 慣例）。
defineExpose({
  assignTargetId,
  retainTargetId,
  retainOptions,
  assignGroups,
  applyAssign,
  applyRetain,
  applyExclude,
  applyReset,
})
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
  font-size: var(--text-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
}

.toolbar-hint {
  font-size: var(--text-xs);
  color: var(--color-warning-hover);
}

.toolbar-select {
  width: 160px;
}
</style>
