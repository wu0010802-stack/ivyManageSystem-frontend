import api from './index'

export const liffLogin = (idToken: string) =>
  api.post('/parent/auth/liff-login', { id_token: idToken })

export const bind = (code: string) =>
  api.post('/parent/auth/bind', { code })

export const bindAdditional = (code: string) =>
  api.post('/parent/auth/bind-additional', { code })

export const logout = () => api.post('/parent/auth/logout')
