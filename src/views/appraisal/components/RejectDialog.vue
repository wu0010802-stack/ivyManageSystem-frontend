<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { rejectSummary } from '@/api/appraisal'
import { apiError } from '@/utils/error'

const props = defineProps({
  visible: { type: Boolean, default: false },
  summary: { type: Object, default: null },
})
const emit = defineEmits(['update:visible', 'rejected'])

const dialogVisible = computed({
  get: () => props.visible,
  set: (v) => emit('update:visible', v),
})

const reason = ref('')
const toStatus = ref(null)
const submitting = ref(false)

const toStatusOptions = computed(() => {
  if (!props.summary) return []
  const opts = []
  const s = props.summary.status
  if (s === 'SUPERVISOR_SIGNED') opts.push({ value: 'DRAFT', label: '退到 草稿' })
  if (s === 'ACCOUNTING_SIGNED') {
    opts.push({ value: 'SUPERVISOR_SIGNED', label: '退到 主管已簽' })
    opts.push({ value: 'DRAFT', label: '退到 草稿' })
  }
  if (s === 'FINALIZED') opts.push({ value: 'ACCOUNTING_SIGNED', label: '退到 會計已簽' })
  return opts
})

watch(() => props.visible, (v) => {
  if (v) {
    reason.value = ''
    toStatus.value = toStatusOptions.value[0]?.value || null
  }
}, { immediate: true })

async function submit() {
  if (reason.value.length < 10) {
    ElMessage.warning('退簽原因至少 10 字')
    return
  }
  if (!toStatus.value) {
    ElMessage.warning('請選擇退簽目標')
    return
  }
  submitting.value = true
  try {
    await rejectSummary(props.summary.id, {
      reason: reason.value,
      to_status: toStatus.value,
    })
    ElMessage.success('退簽成功')
    emit('rejected')
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(apiError(e, '退簽失敗'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="`退簽：${summary?.employee_name || ''}`"
    width="500px"
    data-test="reject-dialog"
  >
    <el-form label-width="100px">
      <el-form-item label="當前狀態">
        <el-tag>{{ summary?.status }}</el-tag>
      </el-form-item>
      <el-form-item label="退簽目標">
        <el-radio-group v-model="toStatus" data-test="to-status-radio">
          <el-radio v-for="o in toStatusOptions" :key="o.value" :value="o.value">
            {{ o.label }}
          </el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="原因">
        <el-input
          v-model="reason"
          type="textarea"
          :rows="4"
          placeholder="至少 10 字"
          data-test="reason-input"
        />
        <span class="counter">{{ reason.length }} / 10</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button data-test="cancel-btn" @click="dialogVisible = false">取消</el-button>
      <el-button type="danger" :loading="submitting" data-test="submit-btn" @click="submit">
        確認退簽
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.counter { margin-left: 8px; color: var(--el-text-color-secondary); font-size: 12px; }
</style>
