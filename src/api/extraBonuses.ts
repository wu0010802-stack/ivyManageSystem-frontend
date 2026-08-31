import api from './index'
import type { ApiQuery, AxiosResp } from './_generated/typed'

// 表外獎金查詢（招生獎金結算後在招生獎金頁顯示「已發放明細」用，見計畫 Task 10 Step 3——
// 表外獎金（api/extra_bonuses.py）前端沒有其他任何頁面，這裡是 HR 唯一看得到錢落地的地方）。
// 只加本頁需要的最小 GET wrapper；CRUD 其餘端點目前無前端呼叫方，不在此補齊。

/** 查詢表外獎金發放紀錄（依歸屬年月／類別）。year 為必填 query 參數。 */
export const listExtraBonuses = (
    params: ApiQuery<'/extra-bonuses', 'get'>,
): AxiosResp<'/extra-bonuses', 'get'> => api.get('/extra-bonuses', { params })
