<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { commentSummary } from '@/api/appraisal'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: { type: Boolean, default: false },
  summary: { type: Object, default: null },
})
const emit = defineEmits(['update:visible', 'commented'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const comment = ref('')
const submitting = ref(false)

watch(() => props.visible, (v) => { if (v) comment.value = '' }, { immediate: true })

async function submit() {
  if (!comment.value.trim()) {
    ElMessage.warning('留言不可空')
    return
  }
  submitting.value = true
  try {
    await commentSummary(props.summary.id, comment.value)
    ElMessage.success('已留言')
    emit('commented')
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(apiError(e, '留言失敗'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="`留言：${summary?.employee_name || ''}`"
    width="500px"
    data-test="comment-dialog"
  >
    <el-input
      v-model="comment"
      type="textarea"
      :rows="4"
      placeholder="留言內容"
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
