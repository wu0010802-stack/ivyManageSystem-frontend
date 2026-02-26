import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

/**
 * @param {Object} options
 * @param {string} options.endpoint - API endpoint prefix, e.g. '/employees'
 * @param {Function} options.onSuccess - callback after successful delete
 * @param {string} [options.successMsg='已刪除'] - success message
 * @param {string} [options.errorMsg='刪除失敗'] - error message
 */
export function useConfirmDelete({ endpoint, onSuccess, successMsg = '已刪除', errorMsg = '刪除失敗' }) {
  const confirmDelete = async (row, { label, idField = 'id' } = {}) => {
    const displayName = label || row.name || ''
    const confirmMsg = displayName ? `確定要刪除 ${displayName} 嗎？` : '確定要刪除嗎？'

    try {
      await ElMessageBox.confirm(confirmMsg, '確認刪除', {
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
        type: 'warning',
      })
      await api.delete(`${endpoint}/${row[idField]}`)
      ElMessage.success(successMsg)
      if (onSuccess) onSuccess()
    } catch (e) {
      if (e !== 'cancel') ElMessage.error(errorMsg)
    }
  }

  return { confirmDelete }
}
