import api from './index'

export const getLineConfig = () =>
  api.get('/config/line')

export const updateLineConfig = (data) =>
  api.put('/config/line', data)

export const testLineNotify = () =>
  api.post('/config/line/test')
