import { describe, it, expect, vi } from 'vitest'
const listMock = vi.fn()
vi.mock('@/api/appraisal', () => ({ listAppraisalCycles: (...a: unknown[]) => listMock(...a) }))
const msgSuccess = vi.fn()
vi.mock('element-plus', () => ({ ElMessage: { success: (...a: unknown[]) => msgSuccess(...a), info: vi.fn() } }))
import { useOpenCycleHint } from '../composables/useOpenCycleHint'

describe('useOpenCycleHint', () => {
  it('有 OPEN 週期時 refresh 設 openCycle', async () => {
    listMock.mockResolvedValueOnce({ data: [{ id: 3, status: 'OPEN' }, { id: 2, status: 'CLOSED' }] })
    const { openCycle, refresh } = useOpenCycleHint()
    await refresh()
    expect(openCycle.value?.id).toBe(3)
  })

  it('無 OPEN 週期時 notifyRuleChanged 不提示重算', async () => {
    listMock.mockResolvedValueOnce({ data: [{ id: 2, status: 'CLOSED' }] })
    const { refresh, notifyRuleChanged } = useOpenCycleHint()
    await refresh()
    msgSuccess.mockClear()
    notifyRuleChanged()
    // 無 OPEN 週期不觸發「前往重算」提示（可只顯一般成功）
    expect(msgSuccess).not.toHaveBeenCalledWith(expect.stringContaining('重算'))
  })

  it('無 OPEN 週期時 refresh 後 openCycle 為 null', async () => {
    listMock.mockResolvedValueOnce({ data: [{ id: 2, status: 'CLOSED' }] })
    const { openCycle, refresh } = useOpenCycleHint()
    await refresh()
    expect(openCycle.value).toBeNull()
  })

  it('有 OPEN 週期時 notifyRuleChanged 顯示含「重算」的提示', async () => {
    listMock.mockResolvedValueOnce({ data: [{ id: 7, status: 'OPEN' }] })
    const { refresh, notifyRuleChanged } = useOpenCycleHint()
    await refresh()
    msgSuccess.mockClear()
    notifyRuleChanged()
    expect(msgSuccess).toHaveBeenCalledWith(expect.stringContaining('重算'))
  })

  it('API 失敗時 refresh 不拋錯，openCycle 回退 null', async () => {
    listMock.mockRejectedValueOnce(new Error('network error'))
    const { openCycle, refresh } = useOpenCycleHint()
    await expect(refresh()).resolves.not.toThrow()
    expect(openCycle.value).toBeNull()
  })

  it('notifyRuleChanged 可帶自訂一般成功訊息（無 OPEN 週期時使用）', async () => {
    listMock.mockResolvedValueOnce({ data: [] })
    const { refresh, notifyRuleChanged } = useOpenCycleHint()
    await refresh()
    msgSuccess.mockClear()
    notifyRuleChanged('已新增版本')
    expect(msgSuccess).toHaveBeenCalledWith('已新增版本')
  })
})
