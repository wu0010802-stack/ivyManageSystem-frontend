<!-- src/components/leave/LeaveOverlapOverrideDialog.vue
     請假核准遇到「與其他已核准假單時間重疊」時的強制核准確認（F74）。

     後端對重疊預設 409 擋下；金流簽核者（ACTIVITY_PAYMENT_APPROVE）可帶 force_overlap＋原因（≥10 字）
     強制放行，原因寫進簽核紀錄永久留存。這個元件接在 useApprovalOperation 的 interceptError 上：
       <LeaveOverlapOverrideDialog ref="overlapRef" />
       useApprovalOperation({ ..., interceptError: (e, req) => overlapRef.value?.handle(e, req) ?? false })
     handle() 回 true 代表錯誤已由這裡處理（開對話框或顯示白話 toast），呼叫端不再跳通用錯誤。
     確認後用 request.retry() 以「原 payload ＋ force_overlap」重送同一筆核准，成功訊息、清單刷新沿用原流程。
     按鈕可用性只是 UI 便利，真正的守衛在後端。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import FormDialog from '@/components/common/FormDialog.vue'
import { PERMISSION_NAMES } from '@/constants/permissions'
import { hasPermission } from '@/utils/auth'
import type { ApprovalRequest } from '@/composables/useApprovalOperation'
import {
  FORCE_OVERLAP_FORBIDDEN_MESSAGE,
  FORCE_OVERLAP_REASON_MAX_LENGTH,
  FORCE_OVERLAP_REASON_MIN_LENGTH,
  forceOverlapReasonLength,
  isForceOverlapForbidden,
  isLeaveOverlapConflict,
  leaveOverlapConflictText,
} from '@/utils/leaveOverlap'

const visible = ref(false)
const conflictText = ref('')
const reason = ref('')
const submitting = ref(false)
const pending = ref<ApprovalRequest | null>(null)

const canForce = computed(() => hasPermission(PERMISSION_NAMES.ACTIVITY_PAYMENT_APPROVE))
const reasonLength = computed(() => forceOverlapReasonLength(reason.value))
const reasonValid = computed(() => reasonLength.value >= FORCE_OVERLAP_REASON_MIN_LENGTH)
const submitDisabled = computed(() => !canForce.value || !reasonValid.value)

const isApprovePayload = (payload: unknown): boolean =>
  !!payload && typeof payload === 'object' && (payload as { approved?: unknown }).approved === true

/**
 * 接 useApprovalOperation 的 interceptError。
 * - 核准被「重疊」409 擋下 → 開對話框（對話框已開著就更新衝突描述，保留已填的原因）
 * - 強制核准重送被 403 拒絕 → 白話 toast（前端權限判斷與後端不一致時）
 * - 其餘錯誤一律回 false，由呼叫端照原樣處理
 */
function handle(error: unknown, request: ApprovalRequest): boolean {
  if (!isApprovePayload(request.payload)) return false
  if (isForceOverlapForbidden(error)) {
    ElMessage.error(FORCE_OVERLAP_FORBIDDEN_MESSAGE)
    return true
  }
  if (!isLeaveOverlapConflict(error)) return false
  pending.value = request
  conflictText.value = leaveOverlapConflictText(error)
  if (!visible.value) reason.value = ''
  visible.value = true
  return true
}

async function submit() {
  const request = pending.value
  if (!request || submitDisabled.value || submitting.value) return
  submitting.value = true
  try {
    const ok = await request.retry({
      ...(request.payload as Record<string, unknown>),
      force_overlap: true,
      force_overlap_reason: reason.value.trim(),
    })
    if (ok) visible.value = false
  } finally {
    submitting.value = false
  }
}

function onClosed() {
  pending.value = null
  reason.value = ''
}

defineExpose({ handle })
</script>

<template>
  <FormDialog
    v-model="visible"
    title="確認強制核准"
    size="compact"
    submit-text="確認強制核准"
    :loading="submitting"
    :disabled="submitDisabled"
    @submit="submit"
    @closed="onClosed"
  >
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      :title="conflictText"
      data-test="overlap-conflict"
    />
    <p class="overlap-note">
      強制核准後，兩張假單會同時生效，可能造成同一時段重複扣薪或重複占用假別額度。
      原因會寫進簽核紀錄永久保存，請先核對兩張假單再確認。
    </p>
    <el-alert
      v-if="!canForce"
      type="info"
      :closable="false"
      show-icon
      title="需具金流簽核權限者處理"
      description="強制核准僅限具「金流簽核」權限的人員操作，請改由具該權限者處理。"
      data-test="overlap-no-permission"
    />
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="強制核准原因" required>
        <el-input
          v-model="reason"
          type="textarea"
          :rows="3"
          :maxlength="FORCE_OVERLAP_REASON_MAX_LENGTH"
          show-word-limit
          :disabled="!canForce"
          placeholder="說明為何仍要讓兩張假單同時生效，例如：補登假單已與員工核對，既有假單時段填寫有誤"
        />
        <div class="overlap-reason-hint" :class="{ 'is-short': !!reason.trim() && !reasonValid }">
          至少 {{ FORCE_OVERLAP_REASON_MIN_LENGTH }} 字（目前 {{ reasonLength }} 字）
        </div>
      </el-form-item>
    </el-form>
  </FormDialog>
</template>

<style scoped>
.overlap-note {
  margin: var(--space-3) 0;
  font-size: var(--text-sm);
  color: var(--el-text-color-regular);
  line-height: 1.6;
}
.overlap-reason-hint {
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--el-text-color-secondary);
}
.overlap-reason-hint.is-short {
  color: var(--el-color-warning);
}
</style>
