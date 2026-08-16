import api from './index'

export const getQuickActions = () =>
  api.get('/parent/quick-actions')

export const updateQuickActions = (data: { slots: string[] }) =>
  api.put('/parent/quick-actions', data)
