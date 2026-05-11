import api from './index'

// SystemConfig 通用 CRUD（公司付款帳號、其他系統級設定）

export const listSystemConfigs = (prefix) => {
  const params = {}
  if (prefix) params.prefix = prefix
  return api.get('/system-configs', { params })
}

export const getSystemConfig = (key) =>
  api.get(`/system-configs/${encodeURIComponent(key)}`)

export const updateSystemConfig = (key, payload) =>
  api.put(`/system-configs/${encodeURIComponent(key)}`, payload)
