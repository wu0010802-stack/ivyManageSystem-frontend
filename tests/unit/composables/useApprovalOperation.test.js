import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useApprovalOperation } from '@/composables/useApprovalOperation'

const mockFetchSummary = vi.fn()

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn() },
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
})
