import { computed, reactive, ref } from 'vue'
import { publicRecoverQueryToken } from '@/api/activityPublic'
import { TW_MOBILE_RE, normalizeMobile } from '@/utils/phone'

/**
 * 「忘記查詢碼」找回流程（2026-08-04）。
 *
 * Why: 生日欄移除後，查詢碼＋手機是唯一自助查詢途徑，而 email 為選填——沒填／
 * 填錯的家長忘記查詢碼即完全查不到，只能打電話請園方代查。本流程以報名表僅存
 * 的三個身分欄位（學生姓名＋班級＋家長手機）向後端換回查詢碼。
 *
 * 後端依報名當初有無留 email 決定投遞方式（見 PublicRecoverTokenOut）：
 * - delivery='shown'：畫面直接拿到查詢碼，呼叫端負責填入查詢欄並自動查詢
 * - delivery='email'：只寄到該信箱，畫面僅得遮罩後的信箱字串
 */
export interface RecoveryOutcome {
  delivery: 'shown' | 'email'
  token: string
  maskedEmail: string
}

export function useQueryTokenRecovery() {
  const recoveryOpen = ref(false)
  const recoveryForm = reactive({ name: '', class_name: '', parent_phone: '' })
  const recoveryLoading = ref(false)
  const recoveryError = ref('')
  // 寄信路徑的成功提示（畫面路徑不留提示，token 直接進查詢欄並自動查詢）。
  const recoverySentTo = ref('')
  const recoveryTouched = ref(false)

  const recoveryNameValid = computed(() => recoveryForm.name.trim().length > 0)
  const recoveryClassValid = computed(() => recoveryForm.class_name.trim().length > 0)
  const recoveryPhoneValid = computed(() =>
    TW_MOBILE_RE.test(normalizeMobile(recoveryForm.parent_phone)),
  )
  const recoveryFormValid = computed(
    () => recoveryNameValid.value && recoveryClassValid.value && recoveryPhoneValid.value,
  )

  function toggleRecovery(prefillPhone = '') {
    recoveryOpen.value = !recoveryOpen.value
    if (recoveryOpen.value && !recoveryForm.parent_phone && prefillPhone) {
      // 家長多半已在上方填過手機，重打一次是白費力氣。
      recoveryForm.parent_phone = prefillPhone
    }
    if (!recoveryOpen.value) resetRecoveryFeedback()
  }

  function resetRecoveryFeedback() {
    recoveryError.value = ''
    recoverySentTo.value = ''
  }

  /**
   * 送出找回請求。成功回 RecoveryOutcome，失敗回 null（錯誤訊息寫入 recoveryError）。
   * 呼叫端依 delivery 決定後續（填入查詢欄 / 顯示寄信提示）。
   */
  async function submitRecovery(): Promise<RecoveryOutcome | null> {
    recoveryTouched.value = true
    if (!recoveryFormValid.value) return null
    recoveryLoading.value = true
    resetRecoveryFeedback()
    try {
      const res = await publicRecoverQueryToken({
        name: recoveryForm.name.trim(),
        class: recoveryForm.class_name.trim(),
        parent_phone: normalizeMobile(recoveryForm.parent_phone),
        // _hp honeypot：正常使用者空字串（填值=機器人→後端回假碼、不動 DB）。
        // 與報名頁 ActivityPublicView 同慣例，不另設隱形實體欄位。
        _hp: '',
      })
      const data = (res as { data?: { delivery?: string; query_token?: string | null; masked_email?: string | null } }).data
      const outcome: RecoveryOutcome = {
        delivery: data?.delivery === 'email' ? 'email' : 'shown',
        token: data?.query_token || '',
        maskedEmail: data?.masked_email || '',
      }
      if (outcome.delivery === 'email') {
        recoverySentTo.value = outcome.maskedEmail
      }
      return outcome
    } catch (err) {
      // 與查詢端一致的隱私口徑：不透露是哪一欄不符。
      recoveryError.value =
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        || '查無對應報名，請確認三項資料是否與報名時一致。'
      return null
    } finally {
      recoveryLoading.value = false
    }
  }

  return {
    recoveryOpen,
    recoveryForm,
    recoveryLoading,
    recoveryError,
    recoverySentTo,
    recoveryTouched,
    recoveryNameValid,
    recoveryClassValid,
    recoveryPhoneValid,
    recoveryFormValid,
    toggleRecovery,
    resetRecoveryFeedback,
    submitRecovery,
  }
}
