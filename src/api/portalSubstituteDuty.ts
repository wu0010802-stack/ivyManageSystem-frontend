import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

/**
 * 請假表單用：選了代理人與日期後，預覽「代理人接手我的職務」（SPEC-026 T13／T16）。
 * 唯讀；與送出時的檢查共用同一份後端規劃。
 */
export const getSubstituteDutyPreview = (
  params: ApiQuery<'/portal/substitute-duty-preview', 'get'>,
): AxiosResp<'/portal/substitute-duty-preview', 'get'> =>
  api.get('/portal/substitute-duty-preview', { params })
