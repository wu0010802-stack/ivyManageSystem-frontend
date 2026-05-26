import api from './index'
import type { AxiosResp } from './_generated/typed'

export function getSchedulerMetrics(): AxiosResp<'/internal/metrics', 'get'> {
  return api.get('/internal/metrics')
}
