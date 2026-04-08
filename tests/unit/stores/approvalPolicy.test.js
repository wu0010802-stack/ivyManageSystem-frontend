import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useApprovalPolicyStore } from '@/stores/approvalPolicy'
import { getApprovalPolicies } from '@/api/approvalSettings'

vi.mock('@/api/approvalSettings', () => ({
  getApprovalPolicies: vi.fn(),
}))

const MOCK_POLICIES = [
  { submitter_role: 'teacher', approver_roles: 'admin,director' },
  { submitter_role: 'staff', approver_roles: 'admin' },
]

describe('approvalPolicy store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('fetchPolicies 成功後更新 policies', async () => {
    getApprovalPolicies.mockResolvedValue({ data: MOCK_POLICIES })
    const store = useApprovalPolicyStore()

    await store.fetchPolicies()

    expect(getApprovalPolicies).toHaveBeenCalledTimes(1)
    expect(store.policies).toEqual(MOCK_POLICIES)
  })

  it('TTL 未過期時不重複呼叫 API', async () => {
    getApprovalPolicies.mockResolvedValue({ data: MOCK_POLICIES })
    const store = useApprovalPolicyStore()

    await store.fetchPolicies()
    await store.fetchPolicies()

    expect(getApprovalPolicies).toHaveBeenCalledTimes(1)
  })

  it('force=true 強制重新 fetch 忽略快取', async () => {
    getApprovalPolicies.mockResolvedValue({ data: MOCK_POLICIES })
    const store = useApprovalPolicyStore()

    await store.fetchPolicies()
    await store.fetchPolicies(true)

    expect(getApprovalPolicies).toHaveBeenCalledTimes(2)
  })

  it('_pending 去重：並發呼叫只發送一次請求', async () => {
    let resolveRequest
    getApprovalPolicies.mockReturnValue(
      new Promise((resolve) => { resolveRequest = resolve })
    )

    const store = useApprovalPolicyStore()
    const first = store.fetchPolicies()
    const second = store.fetchPolicies()

    expect(getApprovalPolicies).toHaveBeenCalledTimes(1)

    resolveRequest({ data: MOCK_POLICIES })
    await Promise.all([first, second])

    expect(store.policies).toEqual(MOCK_POLICIES)
  })

  it('TTL 過期後重新 fetch', async () => {
    getApprovalPolicies.mockResolvedValue({ data: MOCK_POLICIES })
    const store = useApprovalPolicyStore()

    await store.fetchPolicies()
    // 手動讓快取過期
    store._fetchedAt = Date.now() - 6 * 60 * 1000

    await store.fetchPolicies()

    expect(getApprovalPolicies).toHaveBeenCalledTimes(2)
  })

  it('invalidate() 清除快取使下次重新 fetch', async () => {
    getApprovalPolicies.mockResolvedValue({ data: MOCK_POLICIES })
    const store = useApprovalPolicyStore()

    await store.fetchPolicies()
    store.invalidate()
    await store.fetchPolicies()

    expect(getApprovalPolicies).toHaveBeenCalledTimes(2)
  })

  it('API 失敗時靜默處理，policies 維持空陣列', async () => {
    getApprovalPolicies.mockRejectedValue(new Error('network error'))
    const store = useApprovalPolicyStore()

    await store.fetchPolicies()

    expect(store.policies).toEqual([])
  })
})
