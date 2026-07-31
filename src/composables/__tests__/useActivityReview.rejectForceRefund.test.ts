import { describe, it, expect, vi, beforeEach } from 'vitest'

// 2026-07-31 拒絕擴大涵蓋：後台移除「刪除」後，「拒絕」是唯一移除入口。
// 已繳費報名後端回 409（訊息含「繳費金額」）→ 需二次 prompt 收退費原因
// 並帶 force_refund 重送；其他 409（如已被處理）不得誤觸沖帳流程。

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn().mockResolvedValue('confirm'), prompt: vi.fn() },
}))

const rejectRegistration = vi.fn()
vi.mock('@/api/activity', () => ({
  matchRegistration: vi.fn(),
  rejectRegistration: (...a: unknown[]) => rejectRegistration(...a),
  rematchRegistration: vi.fn(),
  rematchAllPendingRegistrations: vi.fn(),
  forceAcceptRegistration: vi.fn(),
  restoreRegistration: vi.fn(),
  searchActivityStudents: vi.fn(),
}))

import { ElMessage, ElMessageBox } from 'element-plus'
import { useActivityReview } from '@/composables/useActivityReview'

function http409(detail: string) {
  return { response: { status: 409, data: { detail } } }
}

describe('handleReject 已繳費 force_refund 沖帳流程', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function setup() {
    const onChanged = vi.fn()
    return useActivityReview({ onChanged, clearSelection: vi.fn() })
  }

  it('409 含「繳費金額」→ 二次 prompt 收退費原因後帶 force_refund 重送', async () => {
    const review = setup()
    ;(ElMessageBox.prompt as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ value: '家長來電取消報名' }) // 拒絕原因
      .mockResolvedValueOnce({ value: '拒絕沖帳測試原因（家長申請辦理退費）' }) // 沖帳原因
    rejectRegistration
      .mockRejectedValueOnce(http409('此報名已有繳費金額 NT$1200，拒絕前需確認自動沖帳退費'))
      .mockResolvedValueOnce({ data: {} })

    await review.handleReject({ id: 7, student_name: '王小明' })

    expect(rejectRegistration).toHaveBeenCalledTimes(2)
    expect(rejectRegistration).toHaveBeenNthCalledWith(1, 7, '家長來電取消報名', {
      forceRefund: false,
      refundReason: undefined,
    })
    expect(rejectRegistration).toHaveBeenNthCalledWith(2, 7, '家長來電取消報名', {
      forceRefund: true,
      refundReason: '拒絕沖帳測試原因（家長申請辦理退費）',
    })
    expect(ElMessage.success).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).not.toHaveBeenCalled()
  })

  it('沖帳 prompt 取消 → 不重送、不報錯', async () => {
    const review = setup()
    ;(ElMessageBox.prompt as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ value: '家長來電取消報名' })
      .mockRejectedValueOnce('cancel')
    rejectRegistration.mockRejectedValueOnce(http409('此報名已有繳費金額 NT$1200'))

    await review.handleReject({ id: 7, student_name: '王小明' })

    expect(rejectRegistration).toHaveBeenCalledTimes(1)
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(ElMessage.success).not.toHaveBeenCalled()
  })

  it('其他 409（不含繳費字樣）→ 直接顯示錯誤，不觸發沖帳 prompt', async () => {
    const review = setup()
    ;(ElMessageBox.prompt as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      value: '家長來電取消報名',
    })
    rejectRegistration.mockRejectedValueOnce(http409('該筆報名已不存在或已被處理'))

    await review.handleReject({ id: 7, student_name: '王小明' })

    expect(rejectRegistration).toHaveBeenCalledTimes(1)
    expect(ElMessageBox.prompt).toHaveBeenCalledTimes(1) // 只有拒絕原因那次
    expect(ElMessage.error).toHaveBeenCalledWith('該筆報名已不存在或已被處理')
  })

  it('未繳費正常路徑：一次成功、帶 forceRefund=false', async () => {
    const review = setup()
    ;(ElMessageBox.prompt as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      value: '校外生資料不符',
    })
    rejectRegistration.mockResolvedValueOnce({ data: {} })

    await review.handleReject({ id: 3, student_name: '林小華' })

    expect(rejectRegistration).toHaveBeenCalledTimes(1)
    expect(rejectRegistration).toHaveBeenCalledWith(3, '校外生資料不符', {
      forceRefund: false,
      refundReason: undefined,
    })
    expect(ElMessage.success).toHaveBeenCalled()
  })
})
