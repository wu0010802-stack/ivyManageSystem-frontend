import api from './index'
import type { ApiQuery, ApiBody, AxiosResp } from './_generated/typed'

export const getEmployees = (params?: ApiQuery<'/employees', 'get'>): AxiosResp<'/employees', 'get'> =>
    api.get('/employees', { params })

/** 後端 GET /employees 單頁 limit 上限（api/employees.py：Query(le=500)） */
export const EMPLOYEE_PAGE_LIMIT = 500
/** 翻頁安全上限：header 異常時不無限迴圈（500 × 40 = 2 萬筆） */
const EMPLOYEE_MAX_PAGES = 40
/** 後端以此 header 回報過濾後總筆數（body 維持陣列）；axios 會把 header 名轉小寫 */
const TOTAL_COUNT_HEADER = 'x-total-count'

type EmployeeListParams = Omit<NonNullable<ApiQuery<'/employees', 'get'>>, 'skip' | 'limit'>

/**
 * 取完整員工清單（FE-F4）：後端預設只回 100 筆，需要完整名冊的地方（員工 store、
 * 離職發起、員工搜尋）一律走這裡，依 `X-Total-Count` 逐頁取完並合併。
 * 舊後端沒有該 header 時退回單頁；翻頁上限仍取不完時提示使用者，不靜默少人。
 */
export async function getAllEmployees(params?: EmployeeListParams): AxiosResp<'/employees', 'get'> {
    const first = await getEmployees({ ...params, skip: 0, limit: EMPLOYEE_PAGE_LIMIT })
    const total = Number(first.headers?.[TOTAL_COUNT_HEADER])
    if (!Number.isFinite(total)) return first
    const rows = [...(first.data ?? [])]
    for (let page = 1; rows.length < total && page < EMPLOYEE_MAX_PAGES; page++) {
        const next = await getEmployees({ ...params, skip: rows.length, limit: EMPLOYEE_PAGE_LIMIT })
        if (!next.data?.length) break
        rows.push(...next.data)
    }
    if (rows.length < total) {
        // 動態載入：api 模組在首屏 entry 內，靜態 import element-plus 會把整包拖進首屏
        const { ElMessage } = await import('element-plus')
        ElMessage.warning(`員工清單只載入 ${rows.length} / ${total} 筆，請以搜尋縮小範圍`)
    }
    return { ...first, data: rows }
}

export const getEmployee = (id: number): AxiosResp<'/employees/{employee_id}', 'get'> =>
    api.get(`/employees/${id}`)

export const createEmployee = (data: ApiBody<'/employees', 'post'>): AxiosResp<'/employees', 'post'> =>
    api.post('/employees', data)

export const updateEmployee = (id: number, data: ApiBody<'/employees/{employee_id}', 'put'>): AxiosResp<'/employees/{employee_id}', 'put'> =>
    api.put(`/employees/${id}`, data)

/** 快速標記離職（軟刪：設離職+撤帳號，跳過 offboarding 流程）——非資料刪除 */
export const deleteEmployee = (id: number): AxiosResp<'/employees/{employee_id}', 'delete'> =>
    api.delete(`/employees/${id}`)

// ============ Diff-only updates ============
// Why: 後端 require_not_self_edit 比對 update_data.keys()，前端必須只送
// 真正異動的欄位才不會誤觸守衛（即使值相同也算 touch）。
// updateEmployeeBasic / updateEmployeeSalary 各自只送對應 tab 的 dirty fields。

export const updateEmployeeBasic = (id: number, dirtyPayload: Partial<ApiBody<'/employees/{employee_id}', 'put'>>): AxiosResp<'/employees/{employee_id}', 'put'> =>
    api.put(`/employees/${id}`, dirtyPayload)

export const updateEmployeeSalary = (id: number, dirtyPayload: Partial<ApiBody<'/employees/{employee_id}', 'put'>>): AxiosResp<'/employees/{employee_id}', 'put'> =>
    api.put(`/employees/${id}`, dirtyPayload)

// ========== Educations ==========

export const listEmployeeEducations = (id: number): AxiosResp<'/employees/{employee_id}/educations', 'get'> =>
    api.get(`/employees/${id}/educations`)

export const createEmployeeEducation = (id: number, data: ApiBody<'/employees/{employee_id}/educations', 'post'>): AxiosResp<'/employees/{employee_id}/educations', 'post'> =>
    api.post(`/employees/${id}/educations`, data)

export const updateEmployeeEducation = (id: number, eduId: number, data: ApiBody<'/employees/{employee_id}/educations/{edu_id}', 'put'>): AxiosResp<'/employees/{employee_id}/educations/{edu_id}', 'put'> =>
    api.put(`/employees/${id}/educations/${eduId}`, data)

export const deleteEmployeeEducation = (id: number, eduId: number): AxiosResp<'/employees/{employee_id}/educations/{edu_id}', 'delete'> =>
    api.delete(`/employees/${id}/educations/${eduId}`)

// ========== Certificates ==========

export const listEmployeeCertificates = (id: number): AxiosResp<'/employees/{employee_id}/certificates', 'get'> =>
    api.get(`/employees/${id}/certificates`)

export const createEmployeeCertificate = (id: number, data: ApiBody<'/employees/{employee_id}/certificates', 'post'>): AxiosResp<'/employees/{employee_id}/certificates', 'post'> =>
    api.post(`/employees/${id}/certificates`, data)

export const updateEmployeeCertificate = (id: number, certId: number, data: ApiBody<'/employees/{employee_id}/certificates/{cert_id}', 'put'>): AxiosResp<'/employees/{employee_id}/certificates/{cert_id}', 'put'> =>
    api.put(`/employees/${id}/certificates/${certId}`, data)

export const deleteEmployeeCertificate = (id: number, certId: number): AxiosResp<'/employees/{employee_id}/certificates/{cert_id}', 'delete'> =>
    api.delete(`/employees/${id}/certificates/${certId}`)

// ========== Contracts ==========

export const listEmployeeContracts = (id: number): AxiosResp<'/employees/{employee_id}/contracts', 'get'> =>
    api.get(`/employees/${id}/contracts`)

export const createEmployeeContract = (id: number, data: ApiBody<'/employees/{employee_id}/contracts', 'post'>): AxiosResp<'/employees/{employee_id}/contracts', 'post'> =>
    api.post(`/employees/${id}/contracts`, data)

export const updateEmployeeContract = (id: number, cid: number, data: ApiBody<'/employees/{employee_id}/contracts/{contract_id}', 'put'>): AxiosResp<'/employees/{employee_id}/contracts/{contract_id}', 'put'> =>
    api.put(`/employees/${id}/contracts/${cid}`, data)

export const deleteEmployeeContract = (id: number, cid: number): AxiosResp<'/employees/{employee_id}/contracts/{contract_id}', 'delete'> =>
    api.delete(`/employees/${id}/contracts/${cid}`)

// ========== Class History ==========

export const listEmployeeClassHistory = (id: number): AxiosResp<'/employees/{employee_id}/class-history', 'get'> =>
    api.get(`/employees/${id}/class-history`)

// ========== Punch PIN（管理員重置） ==========

/** 管理員重置指定員工的打卡 PIN（員工下次需自行重設） */
export const resetPunchPin = (employeeId: number): AxiosResp<'/employees/{employee_id}/reset-punch-pin', 'post'> =>
    api.post(`/employees/${employeeId}/reset-punch-pin`)
