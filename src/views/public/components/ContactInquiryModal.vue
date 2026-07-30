<script setup lang="ts">
/**
 * A1-P3：從 ActivityPublicView 抽出的「聯絡主辦單位」modal。
 *
 * 自含 inquiry 表單狀態與 publicCreateInquiry 呼叫;對外只需 v-model:visible
 * 控制顯示,提交結果（成功 / 失敗）以 `@toast` emit 出去由 parent 顯示。
 *
 * 使用:
 *   <ContactInquiryModal v-model:visible="contactVisible" @toast="showToast" />
 */
import { nextTick, ref, reactive, watch } from 'vue'
import { publicCreateInquiry } from '@/api/activityPublic'
import { useAccessibleDialog } from '@/composables/useAccessibleDialog'

const props = withDefaults(defineProps<{
  visible?: boolean
}>(), {
  visible: false,
})

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'toast', message: string, type: string): void
}>()

const inquiry = reactive({ name: '', phone: '', question: '' })
const errors = reactive({ name: '', phone: '', question: '' })
const submitting = ref(false)
const dialogRef = ref<HTMLElement | null>(null)
const nameInputRef = ref<HTMLInputElement | null>(null)

function close() {
  if (submitting.value) return
  emit('update:visible', false)
}

const { onDialogKeydown } = useAccessibleDialog({
  open: () => props.visible,
  dialogRef,
  close,
  initialFocus: () => nameInputRef.value,
})

function clearError(field: keyof typeof errors) {
  errors[field] = ''
}

async function focusFirstError() {
  await nextTick()
  const field = (['name', 'phone', 'question'] as const).find((key) => errors[key])
  if (!field) return
  const element = dialogRef.value?.querySelector<HTMLElement>(`#contact${field[0].toUpperCase()}${field.slice(1)}`)
  element?.focus()
}

function validateInquiry() {
  errors.name = inquiry.name.trim() ? '' : '請輸入您的姓名'

  const phone = inquiry.phone.trim()
  if (!phone) {
    errors.phone = '請輸入聯絡電話'
  } else if (
    !/^[0-9+\-() ]+$/.test(phone) ||
    [...phone].filter((char) => /\d/.test(char)).length < 7
  ) {
    errors.phone = '請輸入有效的聯絡電話（至少 7 位數字）'
  } else {
    errors.phone = ''
  }

  errors.question = inquiry.question.trim() ? '' : '請輸入您的問題'
  return !errors.name && !errors.phone && !errors.question
}

// 每次開啟時重置表單,沿用原 view 行為（openContactModal 重置）
watch(
  () => props.visible,
  (val) => {
    if (val) {
      inquiry.name = ''
      inquiry.phone = ''
      inquiry.question = ''
      errors.name = ''
      errors.phone = ''
      errors.question = ''
    }
  },
)

async function handleSubmit() {
  if (submitting.value) return
  const name = inquiry.name.trim()
  const phone = inquiry.phone.trim()
  const question = inquiry.question.trim()
  if (!validateInquiry()) {
    await focusFirstError()
    return
  }

  submitting.value = true
  try {
    // _hp 為 honeypot（bot 陷阱），正常使用者一律空字串（填值=機器人→後端 silent-drop）。
    const res = await publicCreateInquiry({ name, phone, question, _hp: '' })
    emit('toast', res?.data?.message || '感謝您的提問，我們會儘快回覆您！', 'success')
    emit('update:visible', false)
  } catch (err) {
    emit('toast', (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || '送出失敗', 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    v-if="visible"
    class="modal-overlay is-visible"
    @click.self="close"
  >
    <form
      ref="dialogRef"
      class="modal-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contactModalTitle"
      tabindex="-1"
      @submit.prevent="handleSubmit"
      @keydown="onDialogKeydown"
    >
      <div class="modal-header">
        <h3 id="contactModalTitle" class="modal-title">
          <svg class="icon" width="22" height="22" aria-hidden="true"><use href="#i-phone" /></svg>
          聯絡主辦單位
        </h3>
        <button type="button" class="modal-close tap-target" aria-label="關閉視窗" @click="close">
          <svg width="18" height="18" aria-hidden="true"><use href="#i-close" /></svg>
        </button>
      </div>
      <div class="modal-body">
        <div class="contact-school-card">
          <h4 class="contact-school-name">
            <svg class="icon" width="22" height="22" aria-hidden="true"><use href="#i-school" /></svg>
            常春藤義華校
          </h4>
          <div class="contact-school-detail">
            <svg class="icon" width="16" height="16" aria-hidden="true"><use href="#i-pin" /></svg>
            高雄市三民區義華路 68 號
          </div>
          <div class="contact-school-detail">
            <svg class="icon" width="16" height="16" aria-hidden="true"><use href="#i-phone" /></svg>
            電話：<a href="tel:+88673928366">(07) 392-8366</a>
          </div>
        </div>
        <div class="contact-form-intro">
          <svg class="icon" width="18" height="18" aria-hidden="true"><use href="#i-mail" /></svg>
          您也可以透過以下表單留下問題，我們會儘快與您聯繫
        </div>
        <div class="field-group">
          <label for="contactName">您的姓名 <span class="required-mark">*</span></label>
          <input
            id="contactName"
            ref="nameInputRef"
            v-model="inquiry.name"
            type="text"
            class="input-text"
            :class="{ 'is-invalid': !!errors.name }"
            :aria-invalid="!!errors.name"
            :aria-describedby="errors.name ? 'contactName-err' : undefined"
            placeholder="請輸入您的姓名"
            maxlength="50"
            autocomplete="name"
            enterkeyhint="next"
            @input="clearError('name')"
          />
          <div v-if="errors.name" id="contactName-err" class="form-error-hint" role="alert">{{ errors.name }}</div>
        </div>
        <div class="field-group">
          <label for="contactPhone">聯絡電話 <span class="required-mark">*</span></label>
          <input
            id="contactPhone"
            v-model="inquiry.phone"
            type="tel"
            class="input-text"
            :class="{ 'is-invalid': !!errors.phone }"
            :aria-invalid="!!errors.phone"
            :aria-describedby="errors.phone ? 'contactPhone-err' : undefined"
            placeholder="請輸入手機號碼 (09xxxxxxxx)"
            inputmode="tel"
            autocomplete="tel"
            maxlength="30"
            enterkeyhint="next"
            @input="clearError('phone')"
          />
          <div v-if="errors.phone" id="contactPhone-err" class="form-error-hint" role="alert">{{ errors.phone }}</div>
        </div>
        <div class="field-group">
          <label for="contactQuestion">您的問題 <span class="required-mark">*</span></label>
          <textarea
            id="contactQuestion"
            v-model="inquiry.question"
            :class="{ 'is-invalid': !!errors.question }"
            :aria-invalid="!!errors.question"
            :aria-describedby="errors.question ? 'contactQuestion-err' : undefined"
            placeholder="請輸入您要詢問的問題"
            rows="4"
            @input="clearError('question')"
          />
          <div v-if="errors.question" id="contactQuestion-err" class="form-error-hint" role="alert">{{ errors.question }}</div>
        </div>
        <button
          type="submit"
          class="btn btn-primary btn-block"
          :disabled="submitting"
        >
          {{ submitting ? '送出中…' : '送出提問' }}
        </button>
      </div>
    </form>
  </div>
</template>
