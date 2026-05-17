<script setup>
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { batchSignSummaries } from '@/api/appraisal'
import { apiError } from '@/utils/error'

const props = defineProps({
  cycleId: { type: Number, required: true },
  stage: { type: String, required: true },   // 'SUPERVISOR' | 'ACCOUNTING' | 'FINALIZE'
  selectedIds: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['done'])

const STAGE_LABEL = {
  SUPERVISOR: '主管簽',
  ACCOUNTING: '會計簽',
  FINALIZE: '核定',
}

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
    const okCount = data.succeeded?.length || 0
    const failCount = data.failed?.length || 0
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
    <el-dialog v-model="failedDialogVisible" title="批次簽核失敗清單" width="500px"
               data-test="failed-dialog">
      <el-table :data="failedList" max-height="320">
        <el-table-column label="Summary ID" prop="summary_id" width="120" />
        <el-table-column label="錯誤訊息" prop="error" />
      </el-table>
    </el-dialog>
  </span>
</template>
