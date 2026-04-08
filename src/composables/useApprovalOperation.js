import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { apiError } from '@/utils/error'
import { useNotificationStore } from '@/stores/notification'

/**
 * 封裝審核操作的通用流程：呼叫 API → 顯示訊息 → 刷新資料 → 更新通知徽章
 * @param {Object} options
 * @param {Function} options.apiFn      - (id, payload) => Promise
 * @param {Function} options.onSuccess  - 成功後的刷新 callback
 * @param {string}  [options.errorMsg]  - 失敗 fallback 訊息，預設 '操作失敗'
 * @returns {{ execute: Function, isLoading: Ref<boolean> }}
 */
export function useApprovalOperation({ apiFn, onSuccess, errorMsg = '操作失敗' }) {
  const isLoading = ref(false)
  const notificationStore = useNotificationStore()

  const execute = async (id, payload, successMsg) => {
    isLoading.value = true
    try {
      await apiFn(id, payload)
      ElMessage.success(successMsg)
      onSuccess()
      notificationStore.fetchSummary({ force: true })
    } catch (error) {
      ElMessage.error(apiError(error, errorMsg))
    } finally {
      isLoading.value = false
    }
  }

  return { execute, isLoading }
}
