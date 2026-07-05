import api from './index'
import type { ApiBody, ApiQuery, AxiosResp } from './_generated/typed'

// 新學年預編班（草稿隔離：generate/regenerate/classes/students/preview/publish
// 全程只動 classroom_year_plans 系列表，套用寫回 classrooms/students 由後端 apply
// service 負責，前端不涉及）。

/** GET /classroom-year-plans/status — 無 plan 也要能答（state="none"）。 */
export const getClassroomYearPlanStatus = (): AxiosResp<'/classroom-year-plans/status', 'get'> =>
    api.get('/classroom-year-plans/status')

/** POST /classroom-year-plans/generate — 冪等：已有非 cancelled 草稿時直接回既有草稿（created=false）。 */
export const generateClassroomYearPlan = (
    payload: ApiBody<'/classroom-year-plans/generate', 'post'>,
): AxiosResp<'/classroom-year-plans/generate', 'post'> =>
    api.post('/classroom-year-plans/generate', payload)

/** GET /classroom-year-plans/{plan_id} — 草稿完整明細（classes + students + issues）。 */
export const getClassroomYearPlanDetail = (
    planId: number,
): AxiosResp<'/classroom-year-plans/{plan_id}', 'get'> =>
    api.get(`/classroom-year-plans/${planId}`)

/** POST /classroom-year-plans/{plan_id}/regenerate — 重新套用分派規則（可選擇是否覆蓋手動調整）。 */
export const regenerateClassroomYearPlan = (
    planId: number,
    payload: ApiBody<'/classroom-year-plans/{plan_id}/regenerate', 'post'>,
): AxiosResp<'/classroom-year-plans/{plan_id}/regenerate', 'post'> =>
    api.post(`/classroom-year-plans/${planId}/regenerate`, payload)

/** POST /classroom-year-plans/{plan_id}/classes — 草稿內新增一個目標班級。 */
export const createClassroomYearPlanClass = (
    planId: number,
    payload: ApiBody<'/classroom-year-plans/{plan_id}/classes', 'post'>,
): AxiosResp<'/classroom-year-plans/{plan_id}/classes', 'post'> =>
    api.post(`/classroom-year-plans/${planId}/classes`, payload)

/** PATCH /classroom-year-plans/{plan_id}/classes/{class_id} — 部分更新（exclude_unset 語意）。 */
export const updateClassroomYearPlanClass = (
    planId: number,
    classId: number,
    payload: ApiBody<'/classroom-year-plans/{plan_id}/classes/{class_id}', 'patch'>,
): AxiosResp<'/classroom-year-plans/{plan_id}/classes/{class_id}', 'patch'> =>
    api.patch(`/classroom-year-plans/${planId}/classes/${classId}`, payload)

/** DELETE /classroom-year-plans/{plan_id}/classes/{class_id} — 樂觀鎖需帶 base_version query。 */
export const deleteClassroomYearPlanClass = (
    planId: number,
    classId: number,
    params: ApiQuery<'/classroom-year-plans/{plan_id}/classes/{class_id}', 'delete'>,
): AxiosResp<'/classroom-year-plans/{plan_id}/classes/{class_id}', 'delete'> =>
    api.delete(`/classroom-year-plans/${planId}/classes/${classId}`, { params })

/**
 * POST /classroom-year-plans/{plan_id}/students/bulk — 批次調整學生分派
 * （assign/retain/graduate/exclude/reset）。`student_ids` 為 `Student.id`（數字 PK），
 * 非顯示用學號字串。
 */
export const bulkUpdateClassroomYearPlanStudents = (
    planId: number,
    payload: ApiBody<'/classroom-year-plans/{plan_id}/students/bulk', 'post'>,
): AxiosResp<'/classroom-year-plans/{plan_id}/students/bulk', 'post'> =>
    api.post(`/classroom-year-plans/${planId}/students/bulk`, payload)

/** GET /classroom-year-plans/{plan_id}/preview — 發布前摘要：逐班分派、畢業/排除名單、blocking/warnings。 */
export const getClassroomYearPlanPreview = (
    planId: number,
): AxiosResp<'/classroom-year-plans/{plan_id}/preview', 'get'> =>
    api.get(`/classroom-year-plans/${planId}/preview`)

/** POST /classroom-year-plans/{plan_id}/publish */
export const publishClassroomYearPlan = (
    planId: number,
    payload: ApiBody<'/classroom-year-plans/{plan_id}/publish', 'post'>,
): AxiosResp<'/classroom-year-plans/{plan_id}/publish', 'post'> =>
    api.post(`/classroom-year-plans/${planId}/publish`, payload)

/** POST /classroom-year-plans/{plan_id}/unpublish */
export const unpublishClassroomYearPlan = (
    planId: number,
    payload: ApiBody<'/classroom-year-plans/{plan_id}/unpublish', 'post'>,
): AxiosResp<'/classroom-year-plans/{plan_id}/unpublish', 'post'> =>
    api.post(`/classroom-year-plans/${planId}/unpublish`, payload)

/** POST /classroom-year-plans/{plan_id}/cancel */
export const cancelClassroomYearPlan = (
    planId: number,
    payload: ApiBody<'/classroom-year-plans/{plan_id}/cancel', 'post'>,
): AxiosResp<'/classroom-year-plans/{plan_id}/cancel', 'post'> =>
    api.post(`/classroom-year-plans/${planId}/cancel`, payload)
