<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { batchSignSummaries } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { STAGE_LABEL } from '@/constants/appraisalYearEnd'

interface SummaryMapEntry { employee_name?: string; [key: string]: unknown }
interface FailedItem { summary_id: number; error?: string }
interface BatchResult { succeeded_count?: number; succeeded?: number[]; failed_count?: number; failed?: FailedItem[] }

const props = defineProps<{
  cycleId: number
  stage: string
  selectedIds?: number[]
  disabled?: boolean
  summariesMap?: Record<number, SummaryMapEntry>
}>()
const emit = defineEmits<{ 'done': [data: BatchResult] }>()

function employeeNameFor(summaryId: number) {
  return props.summariesMap?.[summaryId]?.employee_name || `#${summaryId}`
}

// P1-6：後端 error 訊息可能含 stack trace 或長英文；截短至 120 字並
// 取首行，避免 dialog 表格被撐爆。
function shortError(err: unknown) {
  if (!err) return ''
  const s = String(err).split('\n')[0]
  return s.length > 120 ? s.slice(0, 120) + '…' : s
}

// STAGE_LABEL 從 ../labels 集中載入（P2 i18n 過渡）

const submitting = ref(false)
const failedList = ref<FailedItem[]>([])
const failedDialogVisible = ref(false)

const buttonLabel = computed(() => `批次${(STAGE_LABEL as Record<string, string>)[props.stage] ?? props.stage} (${(props.selectedIds ?? []).length})`)

async function submit() {
  const selectedList = props.selectedIds ?? []
  if (selectedList.length === 0) {
    ElMessage.warning('請先勾選 summary')
    return
  }
  const stageLabel = (STAGE_LABEL as Record<string, string>)[props.stage] ?? props.stage
  try {
    await ElMessageBox.confirm(
      `將對 ${selectedList.length} 位員工執行${stageLabel}，確定嗎？`,
      `批次${stageLabel}`,
      { type: 'warning' },
    )
  } catch {
    return
  }
  submitting.value = true
  try {
    const { data } = await batchSignSummaries(props.cycleId, selectedList, props.stage)
    const result = data as BatchResult
    // P1-7：兼容兩種 response shape — 後端可能回 `succeeded_count: number`
    // 或 `succeeded: [...]` array。優先取 count 欄位，退而 array.length。
    const okCount = result.succeeded_count ?? result.succeeded?.length ?? 0
    const failCount = result.failed_count ?? result.failed?.length ?? 0
    if (failCount === 0) {
      ElMessage.success(`已完成 ${okCount} 筆`)
    } else {
      ElMessage.warning(`成功 ${okCount} 筆 / 失敗 ${failCount} 筆`)
      failedList.value = result.failed ?? []
      failedDialogVisible.value = true
    }
    emit('done', result)
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
               :disabled="disabled || (selectedIds ?? []).length === 0"
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
