import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

/**
 * @param {Object} options
 * @param {string} options.endpoint - API endpoint prefix, e.g. '/employees'
 * @param {Function} options.onSuccess - callback after successful delete
 * @param {string} [options.successMsg='已刪除'] - success message
 * @param {string} [options.errorMsg='刪除失敗'] - error message
 * @returns {{ confirmDelete: Function, deleting: import('vue').Ref<boolean> }}
 */
export function useConfirmDelete({ endpoint, onSuccess, successMsg = '已刪除', errorMsg = '刪除失敗' }: {
  endpoint: string
  onSuccess?: (row: Record<string, unknown>) => void
  successMsg?: string
  errorMsg?: string
}) {
  const deleting = ref(false)

  const confirmDelete = async (row: Record<string, unknown>, { label, idField = 'id' }: { label?: string; idField?: string } = {}) => {
    const displayName = label || (row.name as string) || ''
    const confirmMsg = displayName ? `確定要刪除 ${displayName} 嗎？` : '確定要刪除嗎？'

    try {
      await ElMessageBox.confirm(confirmMsg, '確認刪除', {
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return // 使用者取消，不執行刪除
    }

    deleting.value = true
    try {
      await api.delete(`${endpoint}/${row[idField]}`)
      ElMessage.success(successMsg)
      if (onSuccess) onSuccess(row)
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } }
      ElMessage.error(err?.response?.data?.detail || errorMsg)
    } finally {
      deleting.value = false
    }
  }

  return { confirmDelete, deleting }
}
