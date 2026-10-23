import api from './index'
import type { ApiBody, AxiosResp } from './_generated/typed'

// 節慶發放口徑與「節慶未扣餘額」帳（後端 api/salary/festival_carry.py，義華 2026-10-22
// Q10／Q12／Q14）。開關的「讀」走 GET /salaries/festival-carry/settings（SALARY_READ），
// 「寫」走通用 PUT /system-configs/{key}（SETTINGS_WRITE）——兩條權限不同，UI 要分開判斷。

/** 三個 per-tenant 開關的 system_configs key（後端白名單，值皆為字串）。 */
export const FESTIVAL_CONFIG_KEYS = {
    earlyPayoutFromYm: 'festival.early_payout_from_ym',
    julyLeaverMerge: 'festival.july_leaver_merge_enabled',
    deductionCarryover: 'festival.deduction_carryover_enabled',
} as const

export type FestivalConfigKey = (typeof FESTIVAL_CONFIG_KEYS)[keyof typeof FESTIVAL_CONFIG_KEYS]

/** 節慶發放開關現況（唯讀）。 */
export const getFestivalPayoutSettings = (): AxiosResp<'/salaries/festival-carry/settings', 'get'> =>
    api.get('/salaries/festival-carry/settings')

/**
 * 寫入單一節慶開關。布林開關只接受 "true"/"false"；發放月前移為 YYYY-MM，
 * 傳空字串＝取消前移（回標準 2/6/9/12 發放），格式錯誤後端回 400。
 */
export const updateFestivalConfig = (
    key: FestivalConfigKey,
    configValue: string,
): AxiosResp<'/system-configs/{config_key}', 'put'> => {
    const body: ApiBody<'/system-configs/{config_key}', 'put'> = { config_value: configValue }
    return api.put(`/system-configs/${encodeURIComponent(key)}`, body)
}

/** 全園目前未扣餘額 > 0 的員工。 */
export const listFestivalCarryBalances = (): AxiosResp<'/salaries/festival-carry/balances', 'get'> =>
    api.get('/salaries/festival-carry/balances')

/** 單一員工的未扣餘額異動明細。 */
export const getFestivalCarryEmployee = (
    employeeId: number,
): AxiosResp<'/salaries/festival-carry/employees/{employee_id}', 'get'> =>
    api.get(`/salaries/festival-carry/employees/${employeeId}`)

/** 人工登記：改由其他獎金扣抵（offset_other_bonus）或沖銷（waive）；超過餘額回 422。 */
export const createFestivalCarryManualEntry = (
    body: ApiBody<'/salaries/festival-carry/manual-entries', 'post'>,
): AxiosResp<'/salaries/festival-carry/manual-entries', 'post'> =>
    api.post('/salaries/festival-carry/manual-entries', body)
