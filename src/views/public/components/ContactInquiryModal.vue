<script setup>
/**
 * A1-P3：從 ActivityPublicView 抽出的「聯絡主辦單位」modal。
 *
 * 自含 inquiry 表單狀態與 publicCreateInquiry 呼叫;對外只需 v-model:visible
 * 控制顯示,提交結果（成功 / 失敗）以 `@toast` emit 出去由 parent 顯示。
 *
 * 使用:
 *   <ContactInquiryModal v-model:visible="contactVisible" @toast="showToast" />
 */
import { ref, reactive, watch } from 'vue'
import { publicCreateInquiry } from '@/api/activityPublic'

const props = defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['update:visible', 'toast'])

const inquiry = reactive({ name: '', phone: '', question: '' })
const submitting = ref(false)

function close() {
  emit('update:visible', false)
}

// 每次開啟時重置表單,沿用原 view 行為（openContactModal 重置）
watch(
  () => props.visible,
  (val) => {
    if (val) {
      inquiry.name = ''
      inquiry.phone = ''
      inquiry.question = ''
    }
  },
)

async function handleSubmit() {
  if (submitting.value) return
  const name = inquiry.name.trim()
  const phone = inquiry.phone.trim()
  const question = inquiry.question.trim()
  if (!name) return emit('toast', '請輸入您的姓名', 'error')
  if (!phone) return emit('toast', '請輸入聯絡電話', 'error')
  if (!question) return emit('toast', '請輸入您的問題', 'error')
  if (!/^09\d{8}$/.test(phone.replace(/-/g, ''))) {
    return emit('toast', '請輸入有效的手機號碼，例如 0912345678。', 'error')
  }

  submitting.value = true
  try {
    const res = await publicCreateInquiry({ name, phone, question })
    emit('toast', res?.data?.message || '感謝您的提問，我們會儘快回覆您！', 'success')
    close()
  } catch (err) {
    emit('toast', err.response?.data?.detail || '送出失敗', 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div
    v-if="visible"
    class="modal-overlay is-visible"
    role="dialog"
    aria-modal="true"
    @click.self="close"
  >
    <div class="modal-panel">
      <div class="modal-header">
        <h3 class="modal-title">
          <svg class="icon" width="22" height="22" aria-hidden="true"><use href="#i-phone" /></svg>
          聯絡主辦單位
        </h3>
        <button type="button" class="modal-close" aria-label="關閉視窗" @click="close">
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
            v-model="inquiry.name"
            type="text"
            class="input-text"
            placeholder="請輸入您的姓名"
            maxlength="50"
            autocomplete="name"
          />
        </div>
        <div class="field-group">
          <label for="contactPhone">聯絡電話 <span class="required-mark">*</span></label>
          <input
            id="contactPhone"
            v-model="inquiry.phone"
            type="tel"
            class="input-text"
            placeholder="請輸入手機號碼 (09xxxxxxxx)"
            inputmode="tel"
            autocomplete="tel"
            maxlength="15"
          />
        </div>
        <div class="field-group">
          <label for="contactQuestion">您的問題 <span class="required-mark">*</span></label>
          <textarea
            id="contactQuestion"
            v-model="inquiry.question"
            placeholder="請輸入您要詢問的問題"
            rows="4"
          />
        </div>
        <button
          type="button"
          class="btn btn-primary btn-block"
          :disabled="submitting"
          @click="handleSubmit"
        >
          {{ submitting ? '送出中…' : '送出提問' }}
        </button>
      </div>
    </div>
  </div>
</template>
