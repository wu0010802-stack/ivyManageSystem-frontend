import { describe, it, expect, beforeEach, vi } from 'vitest'

// refreshSession 用 mock 模擬後端 staff refresh token rotation 的 409（rotation in
// progress）：另一條獨立路徑（axios 401 攔截器的 _doRefresh）同時搶著刷新，backend
// race-tolerance 視窗內回 409，但實際 session/cookie 仍然有效。
const refreshSessionMock = vi.fn()
vi.mock('@/api/auth', () => ({
  refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
}))

import router from '@/router'
import { setUserInfo, clearAuth, isLoggedIn } from '@/utils/auth'

async function navigate(to: string): Promise<string> {
  return new Promise((resolve) => {
    router.push(to).then(
      () => resolve(router.currentRoute.value.fullPath),
      () => resolve(router.currentRoute.value.fullPath)
    )
  })
}

describe('C-race: /auth/refresh 409（併發 rotation）不應把仍有效的 session 強制登出', () => {
  beforeEach(async () => {
    refreshSessionMock.mockReset()
    clearAuth({ notifyServer: false })
    localStorage.clear()
    sessionStorage.clear()
    // router 是全域單例：上一個 test 可能把 currentRoute 留在 /employees，導致這次
    // push('/employees') 被當成 redundant navigation 而不重跑 guard。先歸零到中性路徑。
    await router.push('/login')
  })

  it('全新分頁沒有 per-tab userInfo 時，改用 HttpOnly Cookie 還原 session', async () => {
    // userInfo 已改 per-tab sessionStorage，開新分頁一定是空的；此時不可直接
    // 判定未登入，必須讓共享的 HttpOnly refresh cookie 有機會還原身分。
    refreshSessionMock.mockImplementationOnce(async () => ({
      data: { user: { id: 'new-tab-admin', role: 'admin', permission_names: ['EMPLOYEES_READ'] } },
    }))

    const landed = await navigate('/employees')

    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
    expect(landed).toBe('/employees')
    expect(isLoggedIn()).toBe(true)
  })

  it('全新分頁遇 409 時不得把未知身分當成已登入', async () => {
    const conflict = new Error('rotation in progress, please retry') as Error & {
      response?: { status: number }
    }
    conflict.response = { status: 409 }
    refreshSessionMock.mockRejectedValueOnce(conflict)

    const landed = await navigate('/employees')

    expect(landed).toBe('/login')
    expect(isLoggedIn()).toBe(false)
  })

  it('session 驗證視窗過期但收到 409 時，沿用既有 userInfo 並放行導航（不彈回 /login）', async () => {
    setUserInfo({
      role: 'admin',
      permission_names: ['EMPLOYEES_READ'],
    })
    // 模擬 14 分鐘驗證視窗已過期（isLoggedIn() 轉 false），觸發 guard 呼叫 refreshSession()
    sessionStorage.removeItem('auth_session_validated_at')
    expect(isLoggedIn()).toBe(false)

    const conflict = new Error('rotation in progress, please retry') as Error & {
      response?: { status: number }
    }
    conflict.response = { status: 409 }
    refreshSessionMock.mockRejectedValueOnce(conflict)

    const landed = await navigate('/employees')

    expect(landed).toBe('/employees')
    expect(isLoggedIn()).toBe(true)
  })

  it('非 409 的刷新失敗（如 401 refresh token 真的失效）仍應清空登入狀態並導向 /login', async () => {
    setUserInfo({
      role: 'admin',
      permission_names: ['EMPLOYEES_READ'],
    })
    sessionStorage.removeItem('auth_session_validated_at')

    const unauthorized = new Error('refresh token 已過期') as Error & {
      response?: { status: number }
    }
    unauthorized.response = { status: 401 }
    refreshSessionMock.mockRejectedValueOnce(unauthorized)

    const landed = await navigate('/employees')

    expect(landed).toBe('/login')
    expect(isLoggedIn()).toBe(false)
  })
})
