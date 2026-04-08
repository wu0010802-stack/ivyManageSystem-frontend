import api from './index'

export const getFeeItems = (params) => api.get('/fees/items', { params })
export const createFeeItem = (data) => api.post('/fees/items', data)
export const updateFeeItem = (id, data) => api.put(`/fees/items/${id}`, data)
export const deleteFeeItem = (id) => api.delete(`/fees/items/${id}`)
export const generateFeeRecords = (data) => api.post('/fees/generate', data)
export const getFeeRecords = (params) => api.get('/fees/records', { params })
export const payFeeRecord = (id, data) => api.put(`/fees/records/${id}/pay`, data)
export const getFeeSummary = (params) => api.get('/fees/summary', { params })
