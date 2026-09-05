import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

// 家長端服務監控（SPEC-023）。四支皆唯讀，權限由後端 AUDIT_LOGS 把關。
// 路徑不帶 /api 前綴——dump_openapi.py 已剝除。

export const getParentMonitorOverview = (): AxiosResp<'/parent-monitor/overview', 'get'> =>
  api.get('/parent-monitor/overview')

export const getParentMonitorProbes = (
  params: ApiQuery<'/parent-monitor/probes', 'get'> = {},
): AxiosResp<'/parent-monitor/probes', 'get'> =>
  api.get('/parent-monitor/probes', { params })

export const getParentMonitorConfigCheck = (): AxiosResp<'/parent-monitor/config-check', 'get'> =>
  api.get('/parent-monitor/config-check')

export const getParentMonitorTraffic = (
  params: ApiQuery<'/parent-monitor/traffic', 'get'> = {},
): AxiosResp<'/parent-monitor/traffic', 'get'> =>
  api.get('/parent-monitor/traffic', { params })
