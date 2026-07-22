import type { AxiosResponse } from 'axios'
import api from './index'
import { waitForAdminSessionCleanup, waitForPendingLogout } from '@/utils/auth'
import { advanceAdminSession, onAdminSessionReset } from '@/utils/adminSession'

async function requestSessionChange<T>(request: () => Promise<T>): Promise<T> {
  await waitForPendingLogout()
  advanceAdminSession()
  await waitForAdminSessionCleanup()
  return request()
}

export const login = (username: string, password: string) => requestSessionChange(() =>
  api.post('/auth/login', { username, password }))

// Why: 切頁與 401 retry 可能同時觸發 refresh；router/axios interceptor 各自有獨立 inflight，
// 但跨路徑（navigation 與 401 retry 並發）不會合流。這裡讓 navigation 路徑自身先 dedupe，
// 避免快速連點切頁在 session 過期那一刻同時打多支 /auth/refresh。
let _inflightRefresh: Promise<AxiosResponse<{ user: unknown }>> | null = null

onAdminSessionReset(() => {
  _inflightRefresh = null
})

export const refreshSession = () => {
  if (_inflightRefresh) return _inflightRefresh
  // 用 .finally 鏈接著儲存，避免有獨立未被 await 的 promise 鏈造成 unhandled rejection。
  const refresh = api.post<{ user: unknown }>('/auth/refresh')
  const tracked = refresh.finally(() => {
    // session 切換後可能已有新 refresh；舊 promise 完成時不可清掉新的。
    if (_inflightRefresh === tracked) _inflightRefresh = null
  })
  _inflightRefresh = tracked
  return tracked
}

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
