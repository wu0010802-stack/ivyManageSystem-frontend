import { computed, reactive, ref } from 'vue'
import { publicQueryByIdentity } from '@/api/activityPublic'
import type { QueryResult } from '@/composables/usePublicRegistrationQuery'
import { TW_MOBILE_RE, normalizeMobile } from '@/utils/phone'

/**
 * 「忘記查詢碼」三欄唯讀查詢流程（2026-08-04）。
 *
 * Why: 生日欄移除後，查詢碼＋手機是唯一自助查詢途徑，而 email 為選填——沒填／
 * 填錯的家長忘記查詢碼即完全查不到。本流程以報名表僅存的三個身分欄位（學生
 * 姓名＋班級＋家長手機）做唯讀查詢。
 *
 * 業主裁定（同日二次決策）：三欄是熟人圈容易取得的資訊，比對成功**只能檢視**，
 * 畫面永遠不顯示查詢碼；報名當初有留 email 時後端順便把查詢碼（＝完整編修權限）
 * 寄到該信箱。後端已在出口強制 query_token_required=true，呼叫端以無 token 的
 * credentials hydrate 即得既有的僅供檢視 UI（canMutate=false）。
 */
export interface IdentityQueryOutcome {
  registration: QueryResult
  tokenEmailSent: boolean
  maskedEmail: string
}

export function useQueryTokenRecovery() {
  const recoveryOpen = ref(false)
  const recoveryForm = reactive({ name: '', class_name: '', parent_phone: '' })
  const recoveryLoading = ref(false)
  const recoveryError = ref('')
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
    if (!recoveryOpen.value) recoveryError.value = ''
  }

  /**
   * 送出三欄查詢。成功回 IdentityQueryOutcome（registration 供呼叫端以唯讀
   * 姿態 hydrate），失敗回 null（錯誤訊息寫入 recoveryError）。
   */
  async function submitIdentityQuery(): Promise<IdentityQueryOutcome | null> {
    recoveryTouched.value = true
    if (!recoveryFormValid.value) return null
    recoveryLoading.value = true
    recoveryError.value = ''
    try {
      const res = await publicQueryByIdentity({
        name: recoveryForm.name.trim(),
        class: recoveryForm.class_name.trim(),
        parent_phone: normalizeMobile(recoveryForm.parent_phone),
        // _hp honeypot：正常使用者空字串（填值=機器人→後端回統一 404、不動 DB）。
        // 與報名頁 ActivityPublicView 同慣例，不另設隱形實體欄位。
        _hp: '',
      })
      const data = (res as {
        data?: {
          registration?: unknown
          token_email_sent?: boolean
          masked_email?: string | null
        }
      }).data
      if (!data?.registration) {
        recoveryError.value = '查詢失敗，請稍後再試。'
        return null
      }
      return {
        registration: data.registration as QueryResult,
        tokenEmailSent: Boolean(data.token_email_sent),
        maskedEmail: data.masked_email || '',
      }
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
    recoveryTouched,
    recoveryNameValid,
    recoveryClassValid,
    recoveryPhoneValid,
    recoveryFormValid,
    toggleRecovery,
    submitIdentityQuery,
  }
}
