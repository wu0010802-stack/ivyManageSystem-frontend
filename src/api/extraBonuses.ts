import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// 表外獎金查詢（招生獎金結算後在招生獎金頁顯示「已發放明細」用，見計畫 Task 10 Step 3——
// 表外獎金（api/extra_bonuses.py）前端沒有其他任何頁面，這裡是 HR 唯一看得到錢落地的地方）。
// 只加頁面需要的最小 wrapper；CRUD 其餘端點目前無前端呼叫方，不在此補齊。

/** 查詢表外獎金發放紀錄（依歸屬年月／類別）。year 為必填 query 參數。 */
export const listExtraBonuses = (
    params: ApiQuery<'/extra-bonuses', 'get'>,
): AxiosResp<'/extra-bonuses', 'get'> => api.get('/extra-bonuses', { params })

// 下學期（2–7 月）超額獎金 7 月表外批次（義華 Q11，category=excess_enrollment_s2）。
// 計入補充保費年累計，須在 7 月薪資封存前執行；重跑冪等、人工登錄的同類列不覆寫。

/** 預覽（唯讀不寫錢）。academic_year 為民國學年，下學期＝次年 2–7 月。 */
export const previewSemester2Excess = (
    params: ApiQuery<'/extra-bonuses/semester2-excess/preview', 'get'>,
): AxiosResp<'/extra-bonuses/semester2-excess/preview', 'get'> =>
    api.get('/extra-bonuses/semester2-excess/preview', { params })

/** 產生／更新 7 月表外批次。 */
export const applySemester2Excess = (
    body: ApiBody<'/extra-bonuses/semester2-excess/apply', 'post'>,
): AxiosResp<'/extra-bonuses/semester2-excess/apply', 'post'> =>
    api.post('/extra-bonuses/semester2-excess/apply', body)
