import type { AxiosResponse } from 'axios'
import api from './index'

export const login = (username: string, password: string) =>
  api.post('/auth/login', { username, password })

// Why: 切頁與 401 retry 可能同時觸發 refresh；router/axios interceptor 各自有獨立 inflight，
// 但跨路徑（navigation 與 401 retry 並發）不會合流。這裡讓 navigation 路徑自身先 dedupe，
// 避免快速連點切頁在 session 過期那一刻同時打多支 /auth/refresh。
let _inflightRefresh: Promise<AxiosResponse<{ user: unknown }>> | null = null

export const refreshSession = () => {
  if (_inflightRefresh) return _inflightRefresh
  // 用 .finally 鏈接著儲存，避免有獨立未被 await 的 promise 鏈造成 unhandled rejection。
  _inflightRefresh = api.post<{ user: unknown }>('/auth/refresh').finally(() => {
    _inflightRefresh = null
  })
  return _inflightRefresh
}

export const changePassword = (data: unknown) =>
  api.post('/auth/change-password', data)

export const impersonate = (employeeId: number) =>
  api.post('/auth/impersonate', { employee_id: employeeId })

export const getUsers = () => api.get('/auth/users')

export const getPermissions = () => api.get('/auth/permissions')

export const createUser = (payload: unknown) => api.post('/auth/users', payload)

export const updateUser = (id: number, payload: unknown) => api.put(`/auth/users/${id}`, payload)

export const deleteUser = (id: number) => api.delete(`/auth/users/${id}`)

export const resetPassword = (userId: number, newPassword: string) =>
  api.put(`/auth/users/${userId}/reset-password`, { new_password: newPassword })

export const endImpersonate = () => api.post('/auth/end-impersonate')

export const logout = () => api.post('/auth/logout')
