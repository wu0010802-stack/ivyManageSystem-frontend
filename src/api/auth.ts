import api from './index'

export const login = (username: string, password: string) =>
  api.post('/auth/login', { username, password })

export const refreshSession = () =>
  api.post('/auth/refresh')

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
