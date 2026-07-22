/**
 * tests/unit/api/auth.test.js
 *
 * 驗證 src/api/auth.ts 各 wrapper 的 HTTP method / URL / payload。
 * 因為整個 @/api/index 都被 mock，axios interceptor 不會觸發，
 * 不會有任何 token / cookie 副作用。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, defineStore, setActivePinia } from 'pinia'
import { clearAuth, getUserInfo, setUserInfo } from '@/utils/auth'
import { getAdminSessionGeneration } from '@/utils/adminSession'

const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@/api/index', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}))

import * as mod from '@/api/auth'

describe('auth api', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockDelete.mockReset()
    mockGet.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    mockPut.mockResolvedValue({ data: {} })
    mockDelete.mockResolvedValue({ data: {} })
  })

  it('login POST /auth/login with username + password body', async () => {
    const generation = getAdminSessionGeneration()
    await mod.login('admin', 'admin123')
    expect(mockPost).toHaveBeenCalledWith('/auth/login', {
      username: 'admin',
      password: 'admin123',
    })
    expect(getAdminSessionGeneration()).toBe(generation + 1)
  })

  it('login 會等待前一個 logout 回應，避免舊 Set-Cookie 晚到清掉新 session', async () => {
    let resolveLogout
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveLogout = resolve })))
    const pendingLogout = clearAuth()

    const pendingLogin = mod.login('next-user', 'secret')
    await Promise.resolve()
    expect(mockPost).not.toHaveBeenCalled()

    resolveLogout({ ok: true })
    await pendingLogout
    await pendingLogin
    expect(mockPost).toHaveBeenCalledWith('/auth/login', {
      username: 'next-user',
      password: 'secret',
    })
  })

  it('refreshSession POST /auth/refresh', async () => {
    await mod.refreshSession()
    expect(mockPost).toHaveBeenCalledWith('/auth/refresh')
  })

  it('refreshSession dedupes concurrent calls into a single request', async () => {
    let resolveRefresh
    mockPost.mockReturnValueOnce(new Promise((r) => { resolveRefresh = r }))

    const p1 = mod.refreshSession()
    const p2 = mod.refreshSession()
    const p3 = mod.refreshSession()

    expect(mockPost).toHaveBeenCalledTimes(1)

    resolveRefresh({ data: { user: { id: 1 } } })
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    expect(r1).toBe(r2)
    expect(r2).toBe(r3)
  })

  it('refreshSession after settle fires a fresh request', async () => {
    mockPost.mockResolvedValueOnce({ data: { user: { id: 1 } } })
    await mod.refreshSession()
    mockPost.mockResolvedValueOnce({ data: { user: { id: 2 } } })
    await mod.refreshSession()
    expect(mockPost).toHaveBeenCalledTimes(2)
  })

  it('refreshSession resets inflight after rejection', async () => {
    mockPost.mockRejectedValueOnce(new Error('network'))
    await expect(mod.refreshSession()).rejects.toThrow('network')

    mockPost.mockResolvedValueOnce({ data: { user: { id: 1 } } })
    await mod.refreshSession()
    expect(mockPost).toHaveBeenCalledTimes(2)
  })

  it('session 切換會捨棄舊 refresh inflight，而舊 promise 晚到不會清掉新 inflight', async () => {
    let resolveOld
    let resolveCurrent
    mockPost
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce({ data: { user: { id: 'B' } } })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveCurrent = resolve }))

    const oldRefresh = mod.refreshSession()
    await mod.login('next-user', 'secret')
    const currentRefresh = mod.refreshSession()

    expect(mockPost).toHaveBeenCalledTimes(3)
    resolveOld({ data: { user: { id: 'A' } } })
    await oldRefresh

    const currentDuplicate = mod.refreshSession()
    expect(currentDuplicate).toBe(currentRefresh)
    expect(mockPost).toHaveBeenCalledTimes(3)

    resolveCurrent({ data: { user: { id: 'B' } } })
    await currentRefresh
  })

  it('changePassword POST /auth/change-password with payload passthrough', async () => {
    const payload = { old_password: 'old', new_password: 'newSecret9' }
    await mod.changePassword(payload)
    expect(mockPost).toHaveBeenCalledWith('/auth/change-password', payload)
  })

  it('impersonate POST /auth/impersonate with employee_id and explicit mode', async () => {
    const generation = getAdminSessionGeneration()
    await mod.impersonate(5, 'readonly')
    expect(mockPost).toHaveBeenCalledWith('/auth/impersonate', { employee_id: 5, mode: 'readonly' })
    expect(getAdminSessionGeneration()).toBe(generation + 1)
  })

  it('impersonate 切換前會重置已實例化 Pinia store，不殘留前一位教師資料', async () => {
    setActivePinia(createPinia())
    const useTeacherSessionStore = defineStore('impersonate_session_boundary_test', {
      state: () => ({ studentName: '' }),
    })
    const store = useTeacherSessionStore()
    store.studentName = '前一位教師的學生'

    await mod.impersonate(8, 'readonly')

    expect(store.studentName).toBe('')
  })

  it('impersonate 會清 Portal cache，但不會觸發 logout 或提前清掉 userInfo', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('caches', { delete: deleteCache })
    const logoutFetch = vi.fn()
    vi.stubGlobal('fetch', logoutFetch)
    setUserInfo({ id: 'admin-A', role: 'admin' })

    await mod.impersonate(9, 'readonly')
    await Promise.resolve()

    expect(deleteCache).toHaveBeenCalledWith('portal-api')
    expect(logoutFetch).not.toHaveBeenCalled()
    expect(getUserInfo()).toMatchObject({ id: 'admin-A' })
  })

  it('impersonate 會等待舊身分 client cache cleanup 完成才送出新請求', async () => {
    let releaseCleanup
    const cleanup = new Promise((resolve) => { releaseCleanup = resolve })
    const deleteCache = vi.fn(() => cleanup)
    vi.stubGlobal('caches', { delete: deleteCache })

    const pendingImpersonate = mod.impersonate(10, 'readonly')
    await Promise.resolve()
    await Promise.resolve()

    expect(mockPost).not.toHaveBeenCalled()

    releaseCleanup(true)
    await pendingImpersonate
    expect(mockPost).toHaveBeenCalledWith('/auth/impersonate', {
      employee_id: 10,
      mode: 'readonly',
    })
  })

  it('impersonate sends mode: write when specified', async () => {
    await mod.impersonate(5, 'write')
    expect(mockPost).toHaveBeenCalledWith('/auth/impersonate', { employee_id: 5, mode: 'write' })
  })

  it('impersonate defaults mode to readonly when omitted', async () => {
    await mod.impersonate(42)
    expect(mockPost).toHaveBeenCalledWith('/auth/impersonate', { employee_id: 42, mode: 'readonly' })
  })

  it('getUsers GET /auth/users', async () => {
    await mod.getUsers()
    expect(mockGet).toHaveBeenCalledWith('/auth/users')
  })

  it('getPermissions GET /auth/permissions', async () => {
    await mod.getPermissions()
    expect(mockGet).toHaveBeenCalledWith('/auth/permissions')
  })

  it('createUser POST /auth/users with payload', async () => {
    const payload = { username: 'newbie', employee_id: 5, password: 'x' }
    await mod.createUser(payload)
    expect(mockPost).toHaveBeenCalledWith('/auth/users', payload)
  })

  it('updateUser PUT /auth/users/:id with payload', async () => {
    await mod.updateUser(99, { is_active: false })
    expect(mockPut).toHaveBeenCalledWith('/auth/users/99', { is_active: false })
  })

  it('deleteUser DELETE /auth/users/:id', async () => {
    await mod.deleteUser(99)
    expect(mockDelete).toHaveBeenCalledWith('/auth/users/99')
  })

  it('resetPassword PUT /auth/users/:id/reset-password with new_password body', async () => {
    await mod.resetPassword(99, 'fresh123')
    expect(mockPut).toHaveBeenCalledWith('/auth/users/99/reset-password', {
      new_password: 'fresh123',
    })
  })

  it('endImpersonate POST /auth/end-impersonate', async () => {
    const generation = getAdminSessionGeneration()
    await mod.endImpersonate()
    expect(mockPost).toHaveBeenCalledWith('/auth/end-impersonate')
    expect(getAdminSessionGeneration()).toBe(generation + 1)
  })

  it('logout POST /auth/logout', async () => {
    const generation = getAdminSessionGeneration()
    await mod.logout()
    expect(mockPost).toHaveBeenCalledWith('/auth/logout')
    expect(getAdminSessionGeneration()).toBe(generation + 1)
  })
})
