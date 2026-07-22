<script setup lang="ts">
/**
 * CreateCycleDialog — 統一建考核週期入口（Task A7）
 *
 * 原本 3 個入口各自維護建立流程，欄位不一致：
 *   - CurrentSemesterOverview `createCurrentCycle`：一鍵建，target 寫死 0
 *   - YearlyEnrollmentTargetSection `createForSemester`：一鍵建，target 寫死 0
 *   - CycleListView 自帶 dialog：唯一有完整表單（學年/學期/target/actual）
 * 收斂為單一 dialog，3 觸發點皆改開此元件（見各自 CurrentSemesterOverview.vue /
 * YearlyEnrollmentTargetSection.vue / CycleListView.vue 的 createDialogVisible 開關）。
 *
 * ⚠ 決策記錄（使用者 2026-07-21 裁定，見 batch3/task-A7-brief.md）：spec §5.1.3 原文
 * 「招生目標預設帶班級編制推導建議值」——因批次 3 無新後端端點、班級編制推導需跨模組
 * 資料，本 task **不做任何建議值預帶**：開啟時只重置為當前學年學期，target/actual
 * 一律留空由使用者手動填（`resetToCurrentTerm`，見 useCreateCycle.ts）。
 *
 * canWrite 對齊後端 `POST /appraisal/cycles` 守衛（`Permission.APPRAISAL_FINALIZE`，
 * 見 ivy-backend api/appraisal/cycles.py:create_cycle）；tooltip 包 span pattern
 * 比照 YearEndListView.vue。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { apiError } from '@/utils/error'
import { useCreateCycle, type CreatedCycle } from '../composables/useCreateCycle'

const props = withDefaults(
  defineProps<{
    visible: boolean
    canWrite: boolean
  }>(),
  { visible: false, canWrite: false },
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
  created: [cycle: CreatedCycle]
}>()

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
})

const { form, submit, resetToCurrentTerm } = useCreateCycle()
const submitting = ref(false)

// 開啟時（false → true）重置為當前學年學期，不預帶任何建議值（見上方決策記錄）。
watch(
  () => props.visible,
  (v) => {
    if (v) resetToCurrentTerm()
  },
)

function close() {
  dialogVisible.value = false
}

async function handleSubmit() {
  // 防禦：UI 已用 disabled + tooltip 擋，仍保留一道守衛避免繞過（比照 CLAUDE.md
  // §已確認的現況事實：寫入型動作需自行補權限前置）。
  if (!props.canWrite || submitting.value) return
  submitting.value = true
  try {
    const cycle = await submit()
    ElMessage.success('考核週期已建立')
    dialogVisible.value = false
    emit('created', cycle)
  } catch (e) {
    ElMessage.error(apiError(e, '建立週期失敗'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="新增考核週期"
    width="520px"
    data-test="create-cycle-dialog"
  >
    <el-form :model="form" label-width="120px">
      <el-form-item label="學年">
        <el-input-number
          v-model="form.academic_year"
          :min="100"
          :max="200"
          data-test="create-cycle-year"
        />
      </el-form-item>
      <el-form-item label="學期">
        <el-radio-group v-model="form.semester" data-test="create-cycle-semester">
          <el-radio-button value="FIRST">上學期</el-radio-button>
          <el-radio-button value="SECOND">下學期</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="招生目標">
        <el-input-number
          v-model="form.enrollment_target"
          :min="0"
          placeholder="未填視為 0，稍後可於目標人數頁調整"
          data-test="create-cycle-target"
        />
      </el-form-item>
      <el-form-item label="實際註冊">
        <el-input-number
          v-model="form.enrollment_actual"
          :min="0"
          data-test="create-cycle-actual"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-tooltip content="需要考核核定權限" :disabled="canWrite">
        <span>
          <el-button
            type="primary"
            :disabled="!canWrite"
            :loading="submitting"
            data-test="create-cycle-submit"
            @click="handleSubmit"
          >
            建立
          </el-button>
        </span>
      </el-tooltip>
    </template>
  </el-dialog>
</template>
