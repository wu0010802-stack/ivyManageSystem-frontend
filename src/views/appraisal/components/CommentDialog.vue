<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { commentSummary } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { MSG } from '../labels'

const props = defineProps<{
  visible?: boolean
  summary?: Record<string, unknown> | null
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'commented': []
}>()

const dialogVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})

const comment = ref('')
const submitting = ref(false)

watch(() => props.visible, (v) => { if (v) comment.value = '' }, { immediate: true })

async function submit() {
  if (!comment.value.trim()) {
    ElMessage.warning(MSG.comment_required)
    return
  }
  submitting.value = true
  try {
    await commentSummary(props.summary?.id as number, comment.value)
    ElMessage.success(MSG.comment_success)
    emit('commented')
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(apiError(e, MSG.comment_failed))
    // P2-A11Y：失敗不關 dialog（讓使用者改錯重送）；ElMessage 已通知 user
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!--
    P2-FE-2 A11y：el-dialog 預設已 aria-modal=true + focus trap（內建 trapFocus
    directive），毋需手寫；此註解作為審計痕跡。
  -->
  <el-dialog
    v-model="dialogVisible"
    :title="`留言：${summary?.employee_name || ''}`"
    width="500px"
    aria-label="留言 dialog"
    data-test="comment-dialog"
  >
    <el-input
      v-model="comment"
      type="textarea"
      :rows="4"
      :placeholder="MSG.comment_placeholder"
      data-test="comment-input"
    />
    <template #footer>
      <el-button data-test="cancel-btn" @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" data-test="submit-btn" @click="submit">
        送出
      </el-button>
    </template>
  </el-dialog>
</template>
