<script setup lang="ts">
/**
 * P0d-3b 兒童醫療欄位 reason-gated 讀取對話框。
 *
 * UX:
 * 1. 教師點「查看醫療資訊」開啟此 dialog
 * 2. 輸入 reason ≥10 字（前端 + 後端雙 gate）
 * 3. submit 後 call GET /students/{id}/medical?reason=...
 * 4. 顯示 allergy / medication / special_needs（ORM 透明解密）
 * 5. 後端寫 medical_access_log（含 reason / IP / user_id）
 *
 * 法源：個資法 §6 特種個資取用獨立稽核。
 *
 * Refs:
 * - ivy-backend docs/superpowers/specs/2026-05-28-medical-fields-encryption-design.md §3.5
 * - ivy-backend api/students.py:get_student_medical
 */
import { computed, ref, watch } from 'vue'
import { ElDialog, ElInput, ElButton, ElAlert, ElForm, ElFormItem } from 'element-plus'
import { getStudentMedical, type MedicalFieldsOut } from '@/api/students'

const props = defineProps<{
  modelValue: boolean
  studentId: number
  studentName: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', open: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

const reason = ref('')
const loading = ref(false)
const errorMessage = ref('')
const medical = ref<MedicalFieldsOut | null>(null)

const canSubmit = computed(() => reason.value.length >= 10 && !loading.value)

watch(visible, open => {
  if (open) {
    reason.value = ''
    errorMessage.value = ''
    medical.value = null
  }
})

async function fetchMedical() {
  if (!canSubmit.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const { data } = await getStudentMedical(props.studentId, reason.value)
    medical.value = data
  } catch (err) {
    const e = err as { displayMessage?: string; response?: { status?: number; data?: { detail?: string } } }
    if (e.response?.status === 403) {
      errorMessage.value = '您沒有檢視醫療欄位的權限（STUDENTS_HEALTH_READ）'
    } else if (e.response?.status === 422) {
      errorMessage.value = '原因格式不符（後端要求 10-500 字）'
    } else {
      errorMessage.value = e?.displayMessage || e?.response?.data?.detail || '讀取失敗'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="`查看 ${studentName} 的醫療資訊`"
    width="480"
    :close-on-click-modal="false"
  >
    <ElAlert
      v-if="!medical"
      type="info"
      :closable="false"
      show-icon
      class="medical-info-alert"
    >
      <p>
        依個資法 §6 特種個資規範，每次檢視醫療資訊（過敏 / 用藥 / 特殊需求）
        需填寫原因並於系統留存稽核紀錄。
      </p>
    </ElAlert>

    <ElForm v-if="!medical" label-position="top" data-testid="medical-reason-form">
      <ElFormItem label="檢視原因（10-500 字）" required>
        <ElInput
          v-model="reason"
          type="textarea"
          :rows="3"
          placeholder="例：2026-05-28 教師回報過敏反應評估，欲確認用藥史"
          maxlength="500"
          show-word-limit
        />
      </ElFormItem>
      <p v-if="reason.length > 0 && reason.length < 10" class="hint">
        還需 {{ 10 - reason.length }} 字
      </p>
    </ElForm>

    <div v-if="errorMessage" class="error-msg">{{ errorMessage }}</div>

    <div v-if="medical" class="medical-result">
      <ElAlert type="success" :closable="false" show-icon>
        已記入稽核紀錄。如需再次查閱請重新填寫原因。
      </ElAlert>
      <dl class="medical-fields">
        <dt>過敏</dt>
        <dd>{{ medical.allergy || '（無記錄）' }}</dd>
        <dt>用藥</dt>
        <dd>{{ medical.medication || '（無記錄）' }}</dd>
        <dt>特殊需求</dt>
        <dd>{{ medical.special_needs || '（無記錄）' }}</dd>
      </dl>
    </div>

    <template #footer>
      <ElButton @click="visible = false">關閉</ElButton>
      <ElButton
        v-if="!medical"
        type="primary"
        :loading="loading"
        :disabled="!canSubmit"
        @click="fetchMedical"
      >
        送出原因並查看
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.medical-info-alert {
  margin-bottom: 16px;
}

.hint {
  font-size: 12px;
  color: var(--el-color-warning);
  margin: 4px 0 0;
}

.error-msg {
  margin: 8px 0;
  padding: 10px 12px;
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
  border-radius: 4px;
  font-size: 13px;
}

.medical-result {
  margin-top: 8px;
}

.medical-fields {
  margin-top: 16px;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 16px;
}

.medical-fields dt {
  font-weight: 600;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.medical-fields dd {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 14px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
