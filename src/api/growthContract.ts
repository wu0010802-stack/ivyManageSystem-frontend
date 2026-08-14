import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// 自主成長契約獎勵金（rcbonus01，2026-08-14）：本批只做「登記時數」與「學年結算預覽」
// （唯讀、不落表、不發錢，見 spec §6 P2 金額語意待業主確認）。

export const listGrowthHours = (
    params: ApiQuery<'/growth-contract/hours', 'get'>,
): AxiosResp<'/growth-contract/hours', 'get'> =>
    api.get('/growth-contract/hours', { params })

export const createGrowthHour = (
    body: ApiBody<'/growth-contract/hours', 'post'>,
): AxiosResp<'/growth-contract/hours', 'post'> =>
    api.post('/growth-contract/hours', body)

export const patchGrowthHour = (
    hourId: number,
    body: ApiBody<'/growth-contract/hours/{hour_id}', 'patch'>,
): AxiosResp<'/growth-contract/hours/{hour_id}', 'patch'> =>
    api.patch(`/growth-contract/hours/${hourId}`, body)

export const deleteGrowthHour = (
    hourId: number,
): AxiosResp<'/growth-contract/hours/{hour_id}', 'delete'> =>
    api.delete(`/growth-contract/hours/${hourId}`)

// ⚠ 後端用 Pydantic model_fields_set 區分「body 完全省略 signed_on」（不異動）與
// 「顯式傳 {signed_on: null}」（清空為未簽約）。這支 wrapper 不補預設值、原樣把
// caller 傳入的物件轉交 axios——JSON.stringify 對「完全沒有這個 key」與「key 存在
// 但值是 null」序列化結果不同（前者輸出不含該 key，後者輸出 "signed_on":null），
// 剛好對齊後端語意；呼叫端要「不異動」就傳 {}，要「清空」就傳 { signed_on: null }。
export const patchSignedOn = (
    employeeId: number,
    body: ApiBody<'/growth-contract/employees/{employee_id}/signed-on', 'patch'>,
): AxiosResp<'/growth-contract/employees/{employee_id}/signed-on', 'patch'> =>
    api.patch(`/growth-contract/employees/${employeeId}/signed-on`, body)

/** 學年結算預覽（唯讀，不落表、不寫錢）。 */
export const getGrowthPreview = (
    schoolYear: number,
): AxiosResp<'/growth-contract/preview', 'get'> =>
    api.get('/growth-contract/preview', { params: { school_year: schoolYear } })
