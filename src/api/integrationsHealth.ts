import api from './index'
import type { AxiosResp } from './_generated/typed'

export function getIntegrationsHealth(): AxiosResp<'/internal/integrations/health', 'get'> {
  return api.get('/internal/integrations/health')
}
