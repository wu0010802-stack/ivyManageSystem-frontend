import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { apiError } from '@/utils/error'
import { notifySubstituteDutyWarnings } from './substituteDutyNotice'
import { useNotificationStore } from '@/stores/notification'

/** 被 interceptError 攔下的那一次審核請求；retry 以新的 payload 重送同一筆（成功訊息、刷新流程不變）。 */
export interface ApprovalRequest {
  id: unknown
  payload: unknown
  successMsg: string
  retry: (payload: unknown) => Promise<boolean>
}

/**
 * 封裝審核操作的通用流程：呼叫 API → 顯示訊息 → 刷新資料 → 更新通知徽章
 * @param {Object} options
 * @param {Function} options.apiFn      - (id, payload) => Promise
 * @param {Function} options.onSuccess  - 成功後的刷新 callback
 * @param {string}  [options.errorMsg]  - 失敗 fallback 訊息，預設 '操作失敗'
 * @param {Function} [options.interceptError] - 失敗時先給呼叫端處理：回 true 代表已自行處理（例如彈出確認對話框），
 *        這裡不再顯示錯誤 toast；回 false／未提供則維持原本的錯誤 toast。
 *        請假核准遇到「與已核准假單重疊」用它接強制核准確認（F74）。
 * @returns {{ execute: Function, isLoading: Ref<boolean> }} execute 回傳是否成功
 */
export function useApprovalOperation({ apiFn, onSuccess, errorMsg = '操作失敗', interceptError }: {
  apiFn: (id: unknown, payload: unknown) => Promise<unknown>
  onSuccess: () => void
  errorMsg?: string
  interceptError?: (error: unknown, request: ApprovalRequest) => boolean
}) {
  const isLoading = ref(false)
  const notificationStore = useNotificationStore()

  const execute = async (id: unknown, payload: unknown, successMsg: string): Promise<boolean> => {
    isLoading.value = true
    try {
      const res = await apiFn(id, payload)
      ElMessage.success(successMsg)
      // 請假核准／改判回傳的代理接手職務警示（其他單據沒有這個欄位，回空陣列）
      notifySubstituteDutyWarnings(res)
      onSuccess()
      notificationStore.fetchSummary({ force: true })
      return true
    } catch (error) {
      const handled = interceptError?.(error, {
        id,
        payload,
        successMsg,
        retry: (nextPayload) => execute(id, nextPayload, successMsg),
      })
      if (!handled) ElMessage.error(apiError(error, errorMsg))
      return false
    } finally {
      isLoading.value = false
    }
  }

  return { execute, isLoading }
}
