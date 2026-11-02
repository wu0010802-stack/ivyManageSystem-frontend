import type { AxiosResponse } from 'axios'
import api from './index'
import { waitForAdminSessionCleanup, waitForPendingLogout } from '@/utils/auth'
import { advanceAdminSession } from '@/utils/adminSession'
import { shareStaffRefresh } from './refreshCoordinator'

async function requestSessionChange<T>(request: () => Promise<T>): Promise<T> {
  await waitForPendingLogout()
  advanceAdminSession()
  await waitForAdminSessionCleanup()
  return request()
}

export const login = (username: string, password: string) => requestSessionChange(() =>
  api.post('/auth/login', { username, password }))

// Why: 切頁、idle timer 與 401 retry 可能同時觸發 refresh。router guard／useIdleTimeout 與
// axios 401 攔截器共用 refreshCoordinator 的同一個 in-flight——原本兩邊各自 dedupe、跨路徑
// 不合流，同一分頁仍會打兩支 /auth/refresh，後到的拿 409 而把老師踢回登入頁（day-qa F3）。
export const refreshSession = () =>
  shareStaffRefresh(() => api.post<{ user: unknown }>('/auth/refresh')) as Promise<
    AxiosResponse<{ user: unknown }>
  >

export const changePassword = (data: unknown) =>
  api.post('/auth/change-password', data)

export const impersonate = (employeeId: number, mode: 'readonly' | 'write' = 'readonly') =>
  requestSessionChange(() => api.post('/auth/impersonate', { employee_id: employeeId, mode }))

export const getUsers = () => api.get('/auth/users')

export const getPermissions = () => api.get('/auth/permissions')

export const createUser = (payload: unknown) => api.post('/auth/users', payload)

export const updateUser = (id: number, payload: unknown) => api.put(`/auth/users/${id}`, payload)

export const deleteUser = (id: number) => api.delete(`/auth/users/${id}`)

export const resetPassword = (userId: number, newPassword: string) =>
  api.put(`/auth/users/${userId}/reset-password`, { new_password: newPassword })

export const endImpersonate = () => requestSessionChange(() => api.post('/auth/end-impersonate'))

export const logout = () => requestSessionChange(() => api.post('/auth/logout'))
