import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// 舊生註冊率獎金／舊生預繳 100% 獎金（Q41）：逐班推導 → 結算寫入表外獎金
// （ExtraBonusPayment，category = returning_registration／returning_prepay）。
// per-tenant 設定預設兩類皆關閉、金額 0（＝改版前行為，不產生任何列）。

/** 讀本租戶設定（SALARY_READ）。 */
export const getReturningBonusConfig = (): AxiosResp<'/returning-class-bonus/config', 'get'> =>
    api.get('/returning-class-bonus/config')

/** 整份覆寫本租戶設定（SALARY_WRITE）；同類別核算月重複、日期不合法、金額越界回 422。 */
export const putReturningBonusConfig = (
    body: ApiBody<'/returning-class-bonus/config', 'put'>,
): AxiosResp<'/returning-class-bonus/config', 'put'> =>
    api.put('/returning-class-bonus/config', body)

/** 唯讀推導（不寫錢）；month 不是該類別核算月時 422。 */
export const getReturningBonusPreview = (
    params: ApiQuery<'/returning-class-bonus/preview', 'get'>,
): AxiosResp<'/returning-class-bonus/preview', 'get'> =>
    api.get('/returning-class-bonus/preview', { params })

/** 結算（冪等：同員工同類別同歸屬月已有列即跳過）；未啟用回 409。 */
export const settleReturningBonus = (
    body: ApiBody<'/returning-class-bonus/settle', 'post'>,
): AxiosResp<'/returning-class-bonus/settle', 'post'> =>
    api.post('/returning-class-bonus/settle', body)
