import api from './index'

export const login = (username, password) =>
  api.post('/auth/login', { username, password })

export const changePassword = (data) =>
  api.post('/auth/change-password', data)

export const impersonate = (employeeId) =>
  api.post('/auth/impersonate', { employee_id: employeeId })

export const getUsers = () => api.get('/auth/users')

export const getPermissions = () => api.get('/auth/permissions')

export const createUser = (payload) => api.post('/auth/users', payload)

export const updateUser = (id, payload) => api.put(`/auth/users/${id}`, payload)

export const deleteUser = (id) => api.delete(`/auth/users/${id}`)

export const resetPassword = (userId, newPassword) =>
  api.put(`/auth/users/${userId}/reset-password`, { new_password: newPassword })

export const endImpersonate = () => api.post('/auth/end-impersonate')

export const logout = () => api.post('/auth/logout')
