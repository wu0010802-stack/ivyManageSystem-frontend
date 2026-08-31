import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

// 招生獎金 E 化（rcbonus01，2026-08-14）：campaign 存期間與參數、attribution 存逐筆歸屬，
// 結算時寫入既有表外獎金通道（ExtraBonusPayment，category="recruitment"），前端沒有
// 對應的錢落地頁面——結算後明細改讀 GET /extra-bonuses?category=recruitment（見計畫
// Task 10 Step 3）。

export const listCampaigns = (): AxiosResp<'/recruitment-bonus/campaigns', 'get'> =>
    api.get('/recruitment-bonus/campaigns')

export const createCampaign = (
    body: ApiBody<'/recruitment-bonus/campaigns', 'post'>,
): AxiosResp<'/recruitment-bonus/campaigns', 'post'> =>
    api.post('/recruitment-bonus/campaigns', body)

export const getCampaign = (
    campaignId: number,
): AxiosResp<'/recruitment-bonus/campaigns/{campaign_id}', 'get'> =>
    api.get(`/recruitment-bonus/campaigns/${campaignId}`)

export const patchCampaign = (
    campaignId: number,
    body: ApiBody<'/recruitment-bonus/campaigns/{campaign_id}', 'patch'>,
): AxiosResp<'/recruitment-bonus/campaigns/{campaign_id}', 'patch'> =>
    api.patch(`/recruitment-bonus/campaigns/${campaignId}`, body)

/** 候選同步（冪等）；已結算的期一律 409。 */
export const syncCandidates = (
    campaignId: number,
): AxiosResp<'/recruitment-bonus/campaigns/{campaign_id}/sync-candidates', 'post'> =>
    api.post(`/recruitment-bonus/campaigns/${campaignId}/sync-candidates`)

/** 手動加一筆歸屬列（Excel 外補件、邀約拆分第二列）。 */
export const createAttribution = (
    campaignId: number,
    body: ApiBody<'/recruitment-bonus/campaigns/{campaign_id}/attributions', 'post'>,
): AxiosResp<'/recruitment-bonus/campaigns/{campaign_id}/attributions', 'post'> =>
    api.post(`/recruitment-bonus/campaigns/${campaignId}/attributions`, body)

export const patchAttribution = (
    campaignId: number,
    attributionId: number,
    body: ApiBody<'/recruitment-bonus/campaigns/{campaign_id}/attributions/{attribution_id}', 'patch'>,
): AxiosResp<'/recruitment-bonus/campaigns/{campaign_id}/attributions/{attribution_id}', 'patch'> =>
    api.patch(`/recruitment-bonus/campaigns/${campaignId}/attributions/${attributionId}`, body)

/** 結算：把已確認歸屬換算成錢，寫入表外獎金通道。已結算的期重複呼叫回 409（冪等，不重複發錢）。 */
export const settleCampaign = (
    campaignId: number,
): AxiosResp<'/recruitment-bonus/campaigns/{campaign_id}/settle', 'post'> =>
    api.post(`/recruitment-bonus/campaigns/${campaignId}/settle`)

/** 統計表（園方 Excel 格式）：每師區塊＋計算式＋下次核算名單。 */
export const getCampaignReport = (
    campaignId: number,
): AxiosResp<'/recruitment-bonus/campaigns/{campaign_id}/report', 'get'> =>
    api.get(`/recruitment-bonus/campaigns/${campaignId}/report`)

/** 轉帳名冊；需完整薪資檢視權限，無權限時後端回 403。 */
export const getTransferRoster = (
    campaignId: number,
): AxiosResp<'/recruitment-bonus/campaigns/{campaign_id}/transfer-roster', 'get'> =>
    api.get(`/recruitment-bonus/campaigns/${campaignId}/transfer-roster`)

/** 匯出 Excel（三 sheet）；需完整薪資檢視權限（無權限後端回 403）。 */
export const exportCampaignXlsx = (campaignId: number) =>
    api.get(`/recruitment-bonus/campaigns/${campaignId}/export`, { responseType: 'blob' })
