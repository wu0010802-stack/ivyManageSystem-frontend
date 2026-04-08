import { ref, reactive } from 'vue'
import { publicCreateInquiry } from '@/api/activityPublic'
import { ElMessage } from 'element-plus'

export function useActivityInquiry() {
  const inquiryDrawer = ref(false)
  const inquiry = reactive({ name: '', phone: '', question: '' })
  const inquirySubmitting = ref(false)

  function openInquiryDrawer(prefillName) {
    inquiry.name = prefillName || ''
    inquiry.phone = ''
    inquiry.question = ''
    inquiryDrawer.value = true
  }

  async function submitInquiry() {
    inquirySubmitting.value = true
    try {
      await publicCreateInquiry({
        name: inquiry.name.trim(),
        phone: inquiry.phone.trim(),
        question: inquiry.question.trim(),
      })
      ElMessage.success('提問已送出，我們會盡快回覆')
      inquiryDrawer.value = false
    } catch (err) {
      ElMessage.error(err.response?.data?.detail || '送出失敗，請稍後再試')
    } finally {
      inquirySubmitting.value = false
    }
  }

  return { inquiryDrawer, inquiry, inquirySubmitting, openInquiryDrawer, submitInquiry }
}
