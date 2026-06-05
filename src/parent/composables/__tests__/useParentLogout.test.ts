import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const { mockLiff, mockLogout } = vi.hoisted(() => ({
  mockLiff: { isLoggedIn: vi.fn(() => true), logout: vi.fn() },
  mockLogout: vi.fn(),
}))
vi.mock('@/parent/services/liff', () => ({ liff: mockLiff }))
vi.mock('@/parent/api/auth', () => ({ logout: mockLogout }))

import { performParentLogout } from '@/parent/composables/useParentLogout'
import { useParentAuthStore } from '@/parent/stores/parentAuth'

const CACHE_KEY = 'parent:today-status:v1'

beforeEach(() => {
  setActivePinia(createPinia())
  mockLiff.isLoggedIn.mockReset().mockReturnValue(true)
  mockLiff.logout.mockReset()
  mockLogout.mockClear().mockResolvedValue(undefined)
  sessionStorage.clear()
})

describe('performParentLogout（家長端統一登出清理）', () => {
  it('清今日狀態快取(PII) + 結束 LIFF session + 清 auth store', async () => {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ payload: { x: 1 } }))
    const auth = useParentAuthStore()
    auth.setUser({ name: '家長甲' })

    await performParentLogout()

    expect(mockLogout).toHaveBeenCalled()
    expect(sessionStorage.getItem(CACHE_KEY)).toBeNull() // FE-2：PII 快取已清
    expect(mockLiff.logout).toHaveBeenCalled() // FE-3：LIFF session 已結束
    expect(auth.user).toBeNull()
  })

  it('liff 未登入時不呼叫 liff.logout（避免無謂例外）', async () => {
    mockLiff.isLoggedIn.mockReturnValue(false)
    await performParentLogout()
    expect(mockLiff.logout).not.toHaveBeenCalled()
  })

  it('後端 logout 失敗仍完成本地清理（避免殘留）', async () => {
    mockLogout.mockRejectedValueOnce(new Error('network'))
    sessionStorage.setItem(CACHE_KEY, 'x')
    const auth = useParentAuthStore()
    auth.setUser({ name: '家長乙' })

    await performParentLogout()

    expect(sessionStorage.getItem(CACHE_KEY)).toBeNull()
    expect(auth.user).toBeNull()
  })
})
