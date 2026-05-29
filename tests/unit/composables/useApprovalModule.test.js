import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))
vi.mock('@/api/approvalSettings', () => ({ getApprovalLogs: vi.fn() }))
vi.mock('@/stores/approvalPolicy', () => ({
  useApprovalPolicyStore: () => ({ policies: [] }),
}))
vi.mock('@/utils/auth', () => ({ getUserInfo: () => ({ role: 'admin' }) }))

import { ElMessage, ElMessageBox } from 'element-plus'
import { useApprovalModule } from '@/composables/useApprovalModule'

function setup() {
  const batchApproveFn = vi.fn()
  const fetchFn = vi.fn()
  const mod = useApprovalModule({
    docType: 'leave',
    batchApproveFn,
    fetchFn,
    recordLabel: '請假記錄',
  })
  mod.handleSelectionChange([{ id: 1 }])
  return { mod, batchApproveFn, fetchFn }
}

describe('useApprovalModule.showBatchApproveConfirm — 確認框關閉不應誤報失敗', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ESC/X 關閉確認框（reject "close"）不顯示失敗訊息、不呼叫 API', async () => {
    ElMessageBox.confirm.mockRejectedValue('close')
    const { mod, batchApproveFn } = setup()
    await mod.showBatchApproveConfirm()
    expect(batchApproveFn).not.toHaveBeenCalled()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('取消鈕（reject "cancel"）不顯示失敗訊息', async () => {
    ElMessageBox.confirm.mockRejectedValue('cancel')
    const { mod } = setup()
    await mod.showBatchApproveConfirm()
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('真實 API 錯誤仍顯示失敗訊息（不過度抑制）', async () => {
    ElMessageBox.confirm.mockResolvedValue('confirm')
    const { mod, batchApproveFn } = setup()
    batchApproveFn.mockRejectedValue(new Error('Network Error'))
    await mod.showBatchApproveConfirm()
    expect(ElMessage.error).toHaveBeenCalled()
  })
})
