import api from './index'

export const getMe = () => api.get('/parent/me')

export const getMyChildren = () => api.get('/parent/my-children')
