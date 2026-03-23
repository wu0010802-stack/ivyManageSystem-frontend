import api from './index'

export const getMyLineBinding = () => api.get('/portal/profile/line-binding')
export const updateMyLineBinding = (data) => api.put('/portal/profile/line-binding', data)
export const deleteMyLineBinding = () => api.delete('/portal/profile/line-binding')
