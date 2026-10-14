import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

import { ElMessage } from 'element-plus'
import { notifySubstituteDutyWarnings } from '@/composables/substituteDutyNotice'

describe('notifySubstituteDutyWarnings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('回應帶警示時逐筆以 ElMessage.warning 顯示（8 秒、可關閉）', () => {
    notifySubstituteDutyWarnings({
      data: {
        substitute_duty_warnings: [
          { code: 'existing_shift', leave_id: 5, date: '2026-09-16', message: 'A' },
          { code: 'substitute_reconfirm', leave_id: 5, date: null, message: 'B' },
        ],
      },
    })

    expect(ElMessage.warning).toHaveBeenCalledTimes(2)
    expect(ElMessage.warning).toHaveBeenNthCalledWith(1, {
      message: '【代理接手職務】假單 #5（2026-09-16）：A',
      duration: 8000,
      showClose: true,
    })
    expect(ElMessage.warning).toHaveBeenNthCalledWith(2, {
      message: '【代理接手職務】假單 #5：B',
      duration: 8000,
      showClose: true,
    })
  })

  it('沒有警示、欄位缺漏或回應為空時不顯示任何 toast', () => {
    notifySubstituteDutyWarnings({ data: { substitute_duty_warnings: [] } })
    notifySubstituteDutyWarnings({ data: { message: 'ok' } })
    notifySubstituteDutyWarnings(undefined)

    expect(ElMessage.warning).not.toHaveBeenCalled()
  })
})
