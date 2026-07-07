import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

/**
 * 機構活動出席登記（G9-D1）。
 *
 * 對應後端獨立頂層 router `api/institution_events.py`（非 appraisal 子路由）：
 * 行政一次登記機構活動（園務會議/自強活動/自我提升活動/尾牙等）並勾選缺席名單，
 * 供考核端顯式同步（dry-run 預覽）與年終扣款端自動納入。
 */

// ============ CRUD ============

/** 列表；school_year 與 semester 需同時提供或同時省略（只給一個後端回 400）。 */
export const listInstitutionEvents = (
    params: ApiQuery<'/institution_events', 'get'> = {},
): AxiosResp<'/institution_events', 'get'> =>
    api.get('/institution_events', { params })

/** 單筆明細（含缺席名單 absences）。 */
export const getInstitutionEvent = (
    eventId: number,
): AxiosResp<'/institution_events/{event_id}', 'get'> =>
    api.get(`/institution_events/${eventId}`)

export const createInstitutionEvent = (
    payload: ApiBody<'/institution_events', 'post'>,
): AxiosResp<'/institution_events', 'post'> =>
    api.post('/institution_events', payload)

/**
 * PATCH 部分更新（後端 exclude_unset）：欄位為 undefined 會被 JSON.stringify
 * 整欄丟棄 → 後端視為「未變更」。要清空 score_item_code 等 nullable 欄位，
 * caller 必須送顯式 null（el-select clearable 的 × 會把 model 變 undefined，
 * 組 payload 處請以 `?? null` 正規化）。
 */
export const updateInstitutionEvent = (
    eventId: number,
    payload: ApiBody<'/institution_events/{event_id}', 'patch'>,
): AxiosResp<'/institution_events/{event_id}', 'patch'> =>
    api.patch(`/institution_events/${eventId}`, payload)

export const deleteInstitutionEvent = (
    eventId: number,
): AxiosResp<'/institution_events/{event_id}', 'delete'> =>
    api.delete(`/institution_events/${eventId}`)

// ============ 缺席名單（replace-set） ============

/**
 * PUT replace-set 語意：entries 即缺席名單全集，未列出者自既有名單移除。
 * entry.is_exempt 為 null 時後端依當日已核准假別自動判豁免並回填 exempt_reason；
 * 顯式 true/false 則尊重 caller 覆寫、不套自動建議。
 */
export const replaceInstitutionEventAbsences = (
    eventId: number,
    payload: ApiBody<'/institution_events/{event_id}/absences', 'put'>,
): AxiosResp<'/institution_events/{event_id}/absences', 'put'> =>
    api.put(`/institution_events/${eventId}/absences`, payload)

// ============ 考核同步 ============

/**
 * 把機構活動缺席同步進考核手填事件（AppraisalManualEventCount）。
 * dryRun=true（預設）只回 diff 預覽不寫入；dryRun=false 實際套用（cycle 需 OPEN）。
 * 缺席清空後同步會出 new_count=0 的 change（歸零回退）。
 */
export const syncInstitutionEventsToAppraisal = (
    cycleId: number,
    { dryRun = true }: { dryRun?: boolean } = {},
): AxiosResp<'/institution_events/sync/appraisal/{cycle_id}', 'post'> =>
    api.post(`/institution_events/sync/appraisal/${cycleId}`, { dry_run: dryRun })
