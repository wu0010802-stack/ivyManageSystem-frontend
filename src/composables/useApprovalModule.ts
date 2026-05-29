import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getApprovalLogs } from '@/api/approvalSettings'
import { useApprovalPolicyStore } from '@/stores/approvalPolicy'
import { getUserInfo } from '@/utils/auth'

/**
 * 統一封裝批次核准/駁回、簽核記錄 Drawer 與審核資格判斷邏輯。
 * 同時用於 LeaveView（docType='leave'）與 OvertimeView（docType='overtime'）。
 *
 * @param {string}   docType        - 'leave' | 'overtime'
 * @param {Function} batchApproveFn - (ids, approved, reason?) => Promise
 * @param {Function} fetchFn        - () => void，批次操作後刷新列表
 * @param {string}   recordLabel    - 顯示用名稱，如 '請假記錄'、'加班記錄'
 */
export function useApprovalModule({ docType, batchApproveFn, fetchFn, recordLabel = '記錄' }: {
  docType: string
  batchApproveFn: (ids: unknown[], approved: boolean, reason?: string) => Promise<{ data: { succeeded: { length: number }[]; failed: { id: unknown; reason: string }[] } }>
  fetchFn: () => void
  recordLabel?: string
}) {
  const approvalPolicyStore = useApprovalPolicyStore()
  const approvalPolicies = computed(() => approvalPolicyStore.policies)
  const currentUserInfo = getUserInfo()

  // ── 批次操作 ──────────────────────────────────────────────────────────────
  const selectedItems = ref<{ id: unknown; submitter_role?: string }[]>([])
  const batchLoading = ref(false)
  const batchRejectVisible = ref(false)
  const batchRejectReason = ref('')

  const handleSelectionChange = (selection: { id: unknown; submitter_role?: string }[]) => {
    selectedItems.value = selection
  }

  const showBatchApproveConfirm = async () => {
    try {
      await ElMessageBox.confirm(
        `確認批次核准選取的 ${selectedItems.value.length} 筆${recordLabel}？`,
        '批次核准',
        { type: 'warning', confirmButtonText: '確認核准', cancelButtonText: '取消' }
      )
      batchLoading.value = true
      const ids = selectedItems.value.map(r => r.id)
      const res = await batchApproveFn(ids, true)
      const { succeeded, failed } = res.data
      if (failed.length === 0) {
        ElMessage.success(`已成功核准 ${succeeded.length} 筆`)
      } else {
        ElMessage.warning(
          `核准完成：成功 ${succeeded.length} 筆，失敗 ${failed.length} 筆（${failed.map((f: { id: unknown; reason: string }) => `#${f.id}: ${f.reason}`).join('；')}）`
        )
      }
      fetchFn()
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string }
      // ElMessageBox 取消鈕 reject 'cancel'、X/ESC reject 'close'，皆為使用者關閉非錯誤
      if (err !== 'cancel' && err !== 'close')
        ElMessage.error('批次核准失敗：' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      batchLoading.value = false
    }
  }

  const openBatchReject = () => {
    batchRejectReason.value = ''
    batchRejectVisible.value = true
  }

  const confirmBatchReject = async () => {
    if (!batchRejectReason.value.trim()) {
      ElMessage.warning('請填寫駁回原因')
      return
    }
    batchLoading.value = true
    try {
      const ids = selectedItems.value.map(r => r.id)
      const res = await batchApproveFn(ids, false, batchRejectReason.value.trim())
      const { succeeded, failed } = res.data
      batchRejectVisible.value = false
      if (failed.length === 0) {
        ElMessage.success(`已成功駁回 ${succeeded.length} 筆`)
      } else {
        ElMessage.warning(`駁回完成：成功 ${succeeded.length} 筆，失敗 ${failed.length} 筆`)
      }
      fetchFn()
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string }
      ElMessage.error('批次駁回失敗：' + (e?.response?.data?.detail || e?.message || ''))
    } finally {
      batchLoading.value = false
    }
  }

  // ── 簽核記錄 Drawer ────────────────────────────────────────────────────────
  const approvalLogDrawerVisible = ref(false)
  const approvalLogs = ref<unknown[]>([])
  const approvalLogLoading = ref(false)

  const openApprovalLogs = async (row: { id: unknown }) => {
    approvalLogDrawerVisible.value = true
    approvalLogLoading.value = true
    approvalLogs.value = []
    try {
      const res = await getApprovalLogs(docType, row.id as number)
      approvalLogs.value = res.data
    } catch {
      ElMessage.error('載入簽核記錄失敗')
    } finally {
      approvalLogLoading.value = false
    }
  }

  // ── 審核資格判斷 ───────────────────────────────────────────────────────────
  const canApprove = (row: { submitter_role?: string }) => {
    const myRole = currentUserInfo?.role as string | undefined
    if (!myRole || myRole === 'teacher') return false
    const submitterRole = row.submitter_role || 'teacher'
    const policy = approvalPolicies.value.find((p: { submitter_role: string; approver_roles: string }) => p.submitter_role === submitterRole)
    if (!policy) return myRole === 'admin'
    const typedPolicy = policy as { approver_roles: string }
    return typedPolicy.approver_roles.split(',').map((r: string) => r.trim()).includes(myRole)
  }

  return {
    // 批次操作
    selectedItems,
    batchLoading,
    batchRejectVisible,
    batchRejectReason,
    handleSelectionChange,
    showBatchApproveConfirm,
    openBatchReject,
    confirmBatchReject,
    // 簽核記錄
    approvalLogDrawerVisible,
    approvalLogs,
    approvalLogLoading,
    openApprovalLogs,
    // 資格判斷
    canApprove,
  }
}
