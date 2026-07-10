<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { rejectSummary } from '@/api/appraisal'
import { apiError } from '@/utils/error'
import { REJECT_TARGET_LABEL, MSG } from '@/constants/appraisalYearEnd'

interface Summary { id?: number; status?: string; employee_name?: string; [key: string]: unknown }

const props = defineProps<{
  visible?: boolean
  summary?: Summary | null
}>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'rejected': [payload: { summaryId: number; newStatus: string }]
}>()

const dialogVisible = computed({
  get: () => props.visible ?? false,
  set: (v: boolean) => emit('update:visible', v),
})

const reason = ref('')
const toStatus = ref<string>('')
const submitting = ref(false)

const toStatusOptions = computed(() => {
  if (!props.summary) return []
  const opts: { value: string; label: string }[] = []
  const s = props.summary.status
  if (s === 'SUPERVISOR_SIGNED') opts.push({ value: 'DRAFT', label: REJECT_TARGET_LABEL.DRAFT })
  if (s === 'ACCOUNTING_SIGNED') {
    opts.push({ value: 'SUPERVISOR_SIGNED', label: REJECT_TARGET_LABEL.SUPERVISOR_SIGNED })
    opts.push({ value: 'DRAFT', label: REJECT_TARGET_LABEL.DRAFT })
  }
  if (s === 'FINALIZED') opts.push({ value: 'ACCOUNTING_SIGNED', label: REJECT_TARGET_LABEL.ACCOUNTING_SIGNED })
  return opts
})

watch(() => props.visible, (v) => {
  if (v) {
    reason.value = ''
    toStatus.value = toStatusOptions.value[0]?.value || ''
  }
}, { immediate: true })

async function submit() {
  if (!toStatus.value) {
    ElMessage.warning(MSG.reject_target_required)
    return
  }
  // P1-10：reason 字數驗證委派給後端（避免前後端契約耦合）；
  // 失敗時後端回 422，由 apiError 取出 detail 訊息顯示給使用者。
  submitting.value = true
  try {
    await rejectSummary(props.summary?.id as number, {
      reason: reason.value,
      to_status: toStatus.value,
    })
    ElMessage.success(MSG.reject_success)
    // P1-14：emit payload 含 summaryId + newStatus 讓 parent 局部 patch summaries
    // 取代全 reload；fallback to_status 為 'DRAFT'（理論上不會 null）
    emit('rejected', { summaryId: props.summary?.id as number, newStatus: toStatus.value || 'DRAFT' })
    dialogVisible.value = false
  } catch (e) {
    ElMessage.error(apiError(e, MSG.reject_failed))
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
    :title="`退簽：${summary?.employee_name || ''}`"
    width="500px"
    aria-label="退簽 dialog"
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
          maxlength="500"
          show-word-limit
          :placeholder="MSG.reject_reason_placeholder"
          data-test="reason-input"
        />
        <span class="counter">{{ reason.length }} / 500</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button data-test="cancel-btn" @click="dialogVisible = false">取消</el-button>
      <el-button type="danger" :loading="submitting" data-test="submit-btn" @click="submit">
        {{ MSG.reject_confirm_btn }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.counter { margin-left: 8px; color: var(--el-text-color-secondary); font-size: 12px; }
</style>
