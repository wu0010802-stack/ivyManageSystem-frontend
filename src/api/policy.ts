import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

export const listPolicies = (): AxiosResp<'/admin/policies', 'get'> =>
  api.get('/admin/policies')

export const createPolicy = (
  data: ApiBody<'/admin/policies', 'post'>,
): AxiosResp<'/admin/policies', 'post'> => api.post('/admin/policies', data)
