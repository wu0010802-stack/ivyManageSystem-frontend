<script setup>
import { ref } from 'vue'
import { approveLeave } from '@/api/leaves'
import { ElMessage } from 'element-plus'
import { apiError } from '@/utils/error'

const emit = defineEmits(['rejected'])

const rejectDialogVisible = ref(false)
const rejectTarget = ref(null)
const rejectReason = ref('')
const rejectLoading = ref(false)

const openRejectDialog = (row) => {
  rejectTarget.value = row
  rejectReason.value = ''
  rejectDialogVisible.value = true
}

const confirmReject = async () => {
  if (!rejectReason.value.trim()) {
    ElMessage.warning('請填寫駁回原因')
    return
  }
  rejectLoading.value = true
  try {
    await approveLeave(rejectTarget.value.id, {
      approved: false,
      rejection_reason: rejectReason.value.trim(),
    })
    ElMessage.success('已駁回')
    rejectDialogVisible.value = false
    emit('rejected')
  } catch (error) {
    ElMessage.error('操作失敗：' + apiError(error, error.message))
  } finally {
    rejectLoading.value = false
  }
}

defineExpose({ open: openRejectDialog })
</script>

<template>
  <el-dialog v-model="rejectDialogVisible" title="駁回請假" width="420px" :close-on-click-modal="false">
    <p style="margin-bottom: 12px; color: var(--el-text-color-regular);">
      請填寫駁回原因，員工將能在入口網站看到此說明。
    </p>
    <el-input
      v-model="rejectReason"
      type="textarea"
      :rows="3"
      placeholder="例如：請先補上缺少的日期，再重新申請"
      maxlength="200"
      show-word-limit
    />
    <template #footer>
      <el-button @click="rejectDialogVisible = false">取消</el-button>
      <el-button type="danger" :loading="rejectLoading" @click="confirmReject">確認駁回</el-button>
    </template>
  </el-dialog>
</template>
