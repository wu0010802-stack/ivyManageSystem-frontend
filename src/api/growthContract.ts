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

// 業主 2026-08-14 裁定：金額語意已確認，可實際發放（每年 8 月，走表外獎金獨立轉帳）。
// 結算為 per-employee 冪等——已發過的員工這次會落在 skipped_already_paid，不重複發；
// 時數後補齊的員工可再結算一次補發，不是不可逆的整批鎖定。
export const settleGrowthContract = (
    body: ApiBody<'/growth-contract/settle', 'post'>,
): AxiosResp<'/growth-contract/settle', 'post'> =>
    api.post('/growth-contract/settle', body)

// ============ 義華第二批（growth2）：職務異動月額覆寫、扣抵 ============
// 讀取需 SALARY_READ＋完整薪資檢視；寫入需 SALARY_WRITE＋完整薪資檢視（後端
// enforce_full_salary_view），且不得設定自己的資料（require_not_self_salary_record）。

/** 職務 key → 月額／每學期應修時數（覆寫區段下拉選項）。 */
export const listGrowthPositionRates = (): AxiosResp<'/growth-contract/position-rates', 'get'> =>
    api.get('/growth-contract/position-rates')

export const listGrowthRateSegments = (
    params: ApiQuery<'/growth-contract/rate-segments', 'get'>,
): AxiosResp<'/growth-contract/rate-segments', 'get'> =>
    api.get('/growth-contract/rate-segments', { params })

/** 起訖月（YYYY-MM，含兩端）須落在該學年 8 月～次年 7 月內，否則 422。 */
export const createGrowthRateSegment = (
    body: ApiBody<'/growth-contract/rate-segments', 'post'>,
): AxiosResp<'/growth-contract/rate-segments', 'post'> =>
    api.post('/growth-contract/rate-segments', body)

export const deleteGrowthRateSegment = (
    segmentId: number,
): AxiosResp<'/growth-contract/rate-segments/{segment_id}', 'delete'> =>
    api.delete(`/growth-contract/rate-segments/${segmentId}`)

export const listGrowthDeductions = (
    params: ApiQuery<'/growth-contract/deductions', 'get'>,
): AxiosResp<'/growth-contract/deductions', 'get'> =>
    api.get('/growth-contract/deductions', { params })

export const createGrowthDeduction = (
    body: ApiBody<'/growth-contract/deductions', 'post'>,
): AxiosResp<'/growth-contract/deductions', 'post'> =>
    api.post('/growth-contract/deductions', body)

export const deleteGrowthDeduction = (
    deductionId: number,
): AxiosResp<'/growth-contract/deductions/{deduction_id}', 'delete'> =>
    api.delete(`/growth-contract/deductions/${deductionId}`)
