import api from './index'

export const liffLogin = (idToken) =>
  api.post('/parent/auth/liff-login', { id_token: idToken })

export const bind = (code) =>
  api.post('/parent/auth/bind', { code })

export const bindAdditional = (code) =>
  api.post('/parent/auth/bind-additional', { code })

export const logout = () => api.post('/parent/auth/logout')
