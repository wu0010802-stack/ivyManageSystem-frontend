import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useApprovalOperation } from '@/composables/useApprovalOperation'

const mockFetchSummary = vi.fn()

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('@/utils/error', () => ({
  apiError: vi.fn((e, fallback) => fallback),
}))

vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => ({ fetchSummary: mockFetchSummary }),
}))

import { ElMessage } from 'element-plus'
import { apiError } from '@/utils/error'

describe('useApprovalOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('初始狀態 isLoading 為 false', () => {
    const { isLoading } = useApprovalOperation({ apiFn: vi.fn(), onSuccess: vi.fn() })
    expect(isLoading.value).toBe(false)
  })

  describe('成功路徑', () => {
    it('呼叫 apiFn 帶入正確的 id 與 payload', async () => {
      const apiFn = vi.fn().mockResolvedValue({})
      const { execute } = useApprovalOperation({ apiFn, onSuccess: vi.fn() })

      await execute(42, { approved: true }, '已核准')

      expect(apiFn).toHaveBeenCalledWith(42, { approved: true })
    })

    it('成功後呼叫 ElMessage.success 並帶正確訊息', async () => {
      const apiFn = vi.fn().mockResolvedValue({})
      const { execute } = useApprovalOperation({ apiFn, onSuccess: vi.fn() })

      await execute(1, true, '請假已核准')

      expect(ElMessage.success).toHaveBeenCalledWith('請假已核准')
    })

    it('成功後呼叫 onSuccess()', async () => {
      const apiFn = vi.fn().mockResolvedValue({})
      const onSuccess = vi.fn()
      const { execute } = useApprovalOperation({ apiFn, onSuccess })

      await execute(1, true, '已核准')

      expect(onSuccess).toHaveBeenCalled()
    })

    it('成功後呼叫 notificationStore.fetchSummary({ force: true })', async () => {
      const apiFn = vi.fn().mockResolvedValue({})
      const { execute } = useApprovalOperation({ apiFn, onSuccess: vi.fn() })

      await execute(1, true, '已核准')

      expect(mockFetchSummary).toHaveBeenCalledWith({ force: true })
    })
  })

  describe('失敗路徑', () => {
    it('失敗後呼叫 ElMessage.error', async () => {
      const apiFn = vi.fn().mockRejectedValue(new Error('server error'))
      const { execute } = useApprovalOperation({ apiFn, onSuccess: vi.fn() })

      await execute(1, false, '已駁回')

      expect(ElMessage.error).toHaveBeenCalled()
    })

    it('失敗後不呼叫 onSuccess', async () => {
      const apiFn = vi.fn().mockRejectedValue(new Error('fail'))
      const onSuccess = vi.fn()
      const { execute } = useApprovalOperation({ apiFn, onSuccess })

      await execute(1, false, '已駁回')

      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('自訂 errorMsg 作為 fallback 訊息', async () => {
      const err = new Error('fail')
      const apiFn = vi.fn().mockRejectedValue(err)
      const { execute } = useApprovalOperation({ apiFn, onSuccess: vi.fn(), errorMsg: '自訂失敗訊息' })

      await execute(1, false, '已駁回')

      expect(apiError).toHaveBeenCalledWith(err, '自訂失敗訊息')
    })
  })

  describe('isLoading 狀態', () => {
    it('execute 期間 isLoading 為 true，完成後為 false', async () => {
      let resolveFn
      const apiFn = vi.fn().mockImplementation(() => new Promise(r => { resolveFn = r }))
      const { execute, isLoading } = useApprovalOperation({ apiFn, onSuccess: vi.fn() })

      expect(isLoading.value).toBe(false)
      const p = execute(1, true, '已核准')
      expect(isLoading.value).toBe(true)
      resolveFn({})
      await p
      expect(isLoading.value).toBe(false)
    })

    it('失敗時 isLoading 仍重設為 false', async () => {
      const apiFn = vi.fn().mockRejectedValue(new Error('fail'))
      const { execute, isLoading } = useApprovalOperation({ apiFn, onSuccess: vi.fn() })

      await execute(1, false, '已駁回')

      expect(isLoading.value).toBe(false)
    })
  })

  describe('代理接手職務警示（SPEC-026）', () => {
    it('回應帶 substitute_duty_warnings 時，成功訊息之後逐筆以 ElMessage.warning 顯示', async () => {
      const apiFn = vi.fn().mockResolvedValue({
        data: {
          substitute_duty_warnings: [
            { code: 'existing_shift', leave_id: 5, date: '2026-09-16', message: '9/16 代理人已有調班' },
          ],
        },
      })
      const { execute } = useApprovalOperation({ apiFn, onSuccess: vi.fn() })

      await execute(5, { approved: true }, '已核准')

      expect(ElMessage.success).toHaveBeenCalledWith('已核准')
      expect(ElMessage.warning).toHaveBeenCalledTimes(1)
      expect(ElMessage.warning).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('9/16 代理人已有調班') }),
      )
    })

    it('沒有警示（含加班／補卡等沒有這個欄位的回應）時不呼叫 warning', async () => {
      const apiFn = vi.fn().mockResolvedValue({ data: { message: '已核准' } })
      const { execute } = useApprovalOperation({ apiFn, onSuccess: vi.fn() })

      await execute(1, { approved: true }, '已核准')

      expect(ElMessage.warning).not.toHaveBeenCalled()
    })
  })
})

describe('useApprovalOperation — execute 回傳值與 interceptError（F74）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('成功回 true、失敗回 false', async () => {
    const ok = useApprovalOperation({ apiFn: vi.fn().mockResolvedValue({}), onSuccess: vi.fn() })
    expect(await ok.execute(1, { approved: true }, '已核准')).toBe(true)

    const bad = useApprovalOperation({ apiFn: vi.fn().mockRejectedValue(new Error('x')), onSuccess: vi.fn() })
    expect(await bad.execute(1, { approved: true }, '已核准')).toBe(false)
  })

  it('沒提供 interceptError：行為與原本相同（顯示錯誤 toast）', async () => {
    const { execute } = useApprovalOperation({ apiFn: vi.fn().mockRejectedValue(new Error('x')), onSuccess: vi.fn() })
    await execute(1, { approved: true }, '已核准')
    expect(ElMessage.error).toHaveBeenCalledTimes(1)
  })

  it('interceptError 回 true：不顯示錯誤 toast、不呼叫 onSuccess，且收到 id／payload／原錯誤', async () => {
    const err = new Error('overlap')
    const onSuccess = vi.fn()
    const interceptError = vi.fn().mockReturnValue(true)
    const { execute } = useApprovalOperation({ apiFn: vi.fn().mockRejectedValue(err), onSuccess, interceptError })

    const ok = await execute(9, { approved: true }, '已核准')

    expect(ok).toBe(false)
    expect(ElMessage.error).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(interceptError).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ id: 9, payload: { approved: true }, successMsg: '已核准' }),
    )
  })

  it('interceptError 回 false：照常顯示錯誤 toast', async () => {
    const { execute } = useApprovalOperation({
      apiFn: vi.fn().mockRejectedValue(new Error('x')),
      onSuccess: vi.fn(),
      interceptError: vi.fn().mockReturnValue(false),
    })
    await execute(1, { approved: true }, '已核准')
    expect(ElMessage.error).toHaveBeenCalledTimes(1)
  })

  it('request.retry 以新 payload 重送同一筆：成功訊息、onSuccess 沿用，回傳 true', async () => {
    const apiFn = vi.fn().mockRejectedValueOnce(new Error('overlap')).mockResolvedValueOnce({})
    const onSuccess = vi.fn()
    let captured
    const { execute } = useApprovalOperation({
      apiFn,
      onSuccess,
      interceptError: (_e, request) => {
        captured = request
        return true
      },
    })

    await execute(9, { approved: true }, '已核准')
    const retried = await captured.retry({ approved: true, force_overlap: true, force_overlap_reason: '一二三四五六七八九十' })

    expect(retried).toBe(true)
    expect(apiFn).toHaveBeenNthCalledWith(2, 9, { approved: true, force_overlap: true, force_overlap_reason: '一二三四五六七八九十' })
    expect(ElMessage.success).toHaveBeenCalledWith('已核准')
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})
