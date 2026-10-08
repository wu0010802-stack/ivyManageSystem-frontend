import { onScopeDispose, ref } from 'vue'
import { previewReconciliation, confirmReconciliationShift } from '@/api/attendanceReconciliation'
import type { ApiBody, ApiResponse } from '@/api/_generated/typed'
import { getErrorMessage } from '@/utils/errorHandler'

export function useAttendanceReconciliation() {
  const data = ref<ApiResponse<'/attendance/reconciliation/preview', 'post'> | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  let sequence = 0
  let disposed = false

  function reset() {
    sequence += 1
    data.value = null
    error.value = ''
    loading.value = false
  }

  async function preview(body: ApiBody<'/attendance/reconciliation/preview', 'post'>) {
    if (saving.value || disposed) return
    const current = ++sequence
    data.value = null
    error.value = ''
    loading.value = true
    try {
      const response = await previewReconciliation(body)
      if (current === sequence && !disposed) data.value = response.data
    } catch (err) {
      if (current === sequence && !disposed) error.value = getErrorMessage(err, '核對失敗，請重試')
    } finally {
      if (current === sequence && !disposed) loading.value = false
    }
  }

  async function confirm(body: ApiBody<'/attendance/reconciliation/confirm-shift', 'post'>): Promise<boolean> {
    if (saving.value || loading.value || disposed) return false
    saving.value = true
    error.value = ''
    const current = ++sequence
    try {
      await confirmReconciliationShift(body)
      if (!disposed && current === sequence) data.value = null
      return true
    } catch (err) {
      if (!disposed && current === sequence) {
        data.value = null
        error.value = `${getErrorMessage(err, '確認未完成')}。請重新核對最新資料後再確認。`
      }
      return false
    } finally {
      if (!disposed) saving.value = false
    }
  }

  onScopeDispose(() => { disposed = true; reset() })
  return { data, loading, saving, error, preview, confirm, reset }
}
