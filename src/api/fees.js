import api from './index'

export const getFeeItems = (params) => api.get('/fees/items', { params }).then((res) => res.data)
export const getFeePeriods = () => api.get('/fees/periods').then((res) => res.data)
export const createFeeItem = (data) => api.post('/fees/items', data).then((res) => res.data)
export const updateFeeItem = (id, data) => api.put(`/fees/items/${id}`, data).then((res) => res.data)
export const deleteFeeItem = (id) => api.delete(`/fees/items/${id}`).then((res) => res.data)
export const generateFeeRecords = (data) => api.post('/fees/generate', data).then((res) => res.data)
export const getFeeRecords = (params) => api.get('/fees/records', { params }).then((res) => res.data)
export const payFeeRecord = (id, data) => api.put(`/fees/records/${id}/pay`, data).then((res) => res.data)
export const refundFeeRecord = (id, data) => api.post(`/fees/records/${id}/refund`, data).then((res) => res.data)
export const getFeeRefunds = (id) => api.get(`/fees/records/${id}/refunds`).then((res) => res.data)
export const getFeeSummary = (params) => api.get('/fees/summary', { params }).then((res) => res.data)
