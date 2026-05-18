<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { batchSignSummaries } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { STAGE_LABEL } from '../labels'

const props = defineProps({
  cycleId: { type: Number, required: true },
  stage: { type: String, required: true },   // 'SUPERVISOR' | 'ACCOUNTING' | 'FINALIZE'
  selectedIds: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  // P1-6：parent 注入 Record<summary_id, { employee_name, ... }>，
  // 失敗清單顯示員工姓名以利使用者識別（不只光禿禿的 summary_id）。
  summariesMap: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['done'])

function employeeNameFor(summaryId) {
  return props.summariesMap?.[summaryId]?.employee_name || `#${summaryId}`
}

// P1-6：後端 error 訊息可能含 stack trace 或長英文；截短至 120 字並
// 取首行，避免 dialog 表格被撐爆。
function shortError(err) {
  if (!err) return ''
  const s = String(err).split('\n')[0]
  return s.length > 120 ? s.slice(0, 120) + '…' : s
}

// STAGE_LABEL 從 ../labels 集中載入（P2 i18n 過渡）

const submitting = ref(false)
const failedList = ref([])
const failedDialogVisible = ref(false)

const buttonLabel = computed(() => `批次${STAGE_LABEL[props.stage]} (${props.selectedIds.length})`)

async function submit() {
  if (props.selectedIds.length === 0) {
    ElMessage.warning('請先勾選 summary')
    return
  }
  try {
    await ElMessageBox.confirm(
      `將對 ${props.selectedIds.length} 位員工執行${STAGE_LABEL[props.stage]}，確定嗎？`,
      `批次${STAGE_LABEL[props.stage]}`,
      { type: 'warning' },
    )
  } catch {
    return
  }
  submitting.value = true
  try {
    const { data } = await batchSignSummaries(props.cycleId, props.selectedIds, props.stage)
    // P1-7：兼容兩種 response shape — 後端可能回 `succeeded_count: number`
    // 或 `succeeded: [...]` array。優先取 count 欄位，退而 array.length。
    const okCount = data.succeeded_count ?? data.succeeded?.length ?? 0
    const failCount = data.failed_count ?? data.failed?.length ?? 0
    if (failCount === 0) {
      ElMessage.success(`已完成 ${okCount} 筆`)
    } else {
      ElMessage.warning(`成功 ${okCount} 筆 / 失敗 ${failCount} 筆`)
      failedList.value = data.failed
      failedDialogVisible.value = true
    }
    emit('done', data)
  } catch (e) {
    ElMessage.error(apiError(e, '批次簽核失敗'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <span>
    <el-button :type="stage === 'FINALIZE' ? 'primary' : ''"
               :disabled="disabled || selectedIds.length === 0"
               :loading="submitting"
               data-test="batch-sign-btn"
               @click="submit">
      {{ buttonLabel }}
    </el-button>
    <!--
      P2-FE-2 A11y：el-dialog 預設已 aria-modal=true + focus trap（內建 trapFocus
      directive），毋需手寫；此註解作為審計痕跡。
    -->
    <el-dialog v-model="failedDialogVisible" title="批次簽核失敗清單" width="500px"
               aria-label="批次簽核失敗清單 dialog"
               data-test="failed-dialog">
      <el-table :data="failedList" max-height="320">
        <el-table-column label="員工" width="160">
          <template #default="{ row }">
            <span :data-test="`failed-name-${row.summary_id}`">
              {{ employeeNameFor(row.summary_id) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="錯誤訊息">
          <template #default="{ row }">
            <span :data-test="`failed-error-${row.summary_id}`">
              {{ shortError(row.error) }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </span>
</template>
