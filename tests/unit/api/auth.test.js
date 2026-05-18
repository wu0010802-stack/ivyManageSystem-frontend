/**
 * tests/unit/api/auth.test.js
 *
 * 驗證 src/api/auth.ts 各 wrapper 的 HTTP method / URL / payload。
 * 因為整個 @/api/index 都被 mock，axios interceptor 不會觸發，
 * 不會有任何 token / cookie 副作用。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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
    await mod.login('admin', 'admin123')
    expect(mockPost).toHaveBeenCalledWith('/auth/login', {
      username: 'admin',
      password: 'admin123',
    })
  })

  it('refreshSession POST /auth/refresh', async () => {
    await mod.refreshSession()
    expect(mockPost).toHaveBeenCalledWith('/auth/refresh')
  })

  it('changePassword POST /auth/change-password with payload passthrough', async () => {
    const payload = { old_password: 'old', new_password: 'newSecret9' }
    await mod.changePassword(payload)
    expect(mockPost).toHaveBeenCalledWith('/auth/change-password', payload)
  })

  it('impersonate POST /auth/impersonate with employee_id body', async () => {
    await mod.impersonate(42)
    expect(mockPost).toHaveBeenCalledWith('/auth/impersonate', { employee_id: 42 })
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
    await mod.endImpersonate()
    expect(mockPost).toHaveBeenCalledWith('/auth/end-impersonate')
  })

  it('logout POST /auth/logout', async () => {
    await mod.logout()
    expect(mockPost).toHaveBeenCalledWith('/auth/logout')
  })
})
