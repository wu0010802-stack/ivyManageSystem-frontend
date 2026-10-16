import api from './index'
import type { ApiBody, ApiQuery, ApiResponse, AxiosResp } from './_generated/typed'

export type HistoricalPnlImport = ApiBody<'/reports/historical-pnl/import', 'post'>
export type HistoricalPnlYear = ApiResponse<'/reports/historical-pnl', 'get'>
export type HistoricalPnlPreview = ApiResponse<'/reports/historical-pnl/preview', 'post'>

/** 原表損益參考，獨立於現金收付報表。 */
export const getHistoricalPnl = (year: number): AxiosResp<'/reports/historical-pnl', 'get'> => {
  const params: ApiQuery<'/reports/historical-pnl', 'get'> = { year }
  return api.get('/reports/historical-pnl', { params })
}

export const previewHistoricalPnl = (
  payload: ApiBody<'/reports/historical-pnl/preview', 'post'>,
): AxiosResp<'/reports/historical-pnl/preview', 'post'> =>
  api.post('/reports/historical-pnl/preview', payload)

export const importHistoricalPnl = (
  payload: HistoricalPnlImport,
): AxiosResp<'/reports/historical-pnl/import', 'post'> =>
  api.post('/reports/historical-pnl/import', payload)
