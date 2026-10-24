import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

// 家長端服務監控（SPEC-023）。路徑不帶 /api 前綴——dump_openapi.py 已剝除。
// 前七支皆唯讀，權限由後端 AUDIT_LOGS 把關；唯一的寫入動作是
// retryParentMonitorDelivery（重送推播），權限刻意是 SETTINGS_WRITE，見該函式註解。

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

export const getParentMonitorClientEvents = (
  params: ApiQuery<'/parent-monitor/client-events', 'get'> = {},
): AxiosResp<'/parent-monitor/client-events', 'get'> =>
  api.get('/parent-monitor/client-events', { params })

export const getParentMonitorDeliveries = (
  params: ApiQuery<'/parent-monitor/deliveries', 'get'> = {},
): AxiosResp<'/parent-monitor/deliveries', 'get'> =>
  api.get('/parent-monitor/deliveries', { params })

/**
 * 手動重送單筆已最終失敗的推播。
 *
 * ⚠ 權限刻意是 `SETTINGS_WRITE`，不是本頁其餘端點共用的 `AUDIT_LOGS`——這是
 * 本頁唯一的寫入動作，唯讀權限不該能觸發重送（否則稽核查閱者形同拿到一個
 * 寫入後門）。呼叫端（`DeliveriesPanel.vue`）必須先用
 * `hasPermission('SETTINGS_WRITE')` 判斷是否渲染重送鈕，不能只靠後端 403
 * 兜底。
 *
 * 後端對「尚未達最終失敗門檻」回 409、對「找不到或屬於別租戶」與「總開關
 * 關閉」回 404——三者 `detail` 皆為可讀中文，呼叫端用 `getErrorMessage`
 * 取用即可，不需要在這裡另外轉譯。
 */
export const retryParentMonitorDelivery = (
  deliveryId: number,
): AxiosResp<'/parent-monitor/deliveries/{delivery_id}/retry', 'post'> =>
  api.post(`/parent-monitor/deliveries/${deliveryId}/retry`)
