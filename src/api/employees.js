import api from './index'

/**
 * Typed API surface for employees. Path templates use the OpenAPI literal
 * form (e.g. `{employee_id}`, `{contract_id}`) — JS callers may still pass
 * any string template; types only require the path token to match the spec.
 *
 * @typedef {import('./_generated/typed').ApiQuery<'/employees', 'get'>}                                                EmployeesQuery
 * @typedef {import('./_generated/typed').AxiosResp<'/employees', 'get'>}                                              GetEmployeesResp
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}', 'get'>}                                GetEmployeeResp
 * @typedef {import('./_generated/typed').ApiBody<'/employees', 'post'>}                                                EmployeeCreatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/employees', 'post'>}                                             CreateEmployeeResp
 * @typedef {import('./_generated/typed').ApiBody<'/employees/{employee_id}', 'put'>}                                   EmployeeUpdatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}', 'put'>}                                UpdateEmployeeResp
 * @typedef {import('./_generated/typed').ApiBody<'/employees/{employee_id}/offboard', 'post'>}                         OffboardPayload
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/offboard', 'post'>}                      OffboardResp
 * @typedef {import('./_generated/typed').ApiQuery<'/employees/{employee_id}/final-salary-preview', 'get'>}             FinalSalaryPreviewQuery
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/final-salary-preview', 'get'>}           FinalSalaryPreviewResp
 *
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/educations', 'get'>}                    ListEducationsResp
 * @typedef {import('./_generated/typed').ApiBody<'/employees/{employee_id}/educations', 'post'>}                      EducationCreatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/educations', 'post'>}                   CreateEducationResp
 * @typedef {import('./_generated/typed').ApiBody<'/employees/{employee_id}/educations/{edu_id}', 'put'>}              EducationUpdatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/educations/{edu_id}', 'put'>}           UpdateEducationResp
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/educations/{edu_id}', 'delete'>}        DeleteEducationResp
 *
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/certificates', 'get'>}                  ListCertificatesResp
 * @typedef {import('./_generated/typed').ApiBody<'/employees/{employee_id}/certificates', 'post'>}                    CertificateCreatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/certificates', 'post'>}                 CreateCertificateResp
 * @typedef {import('./_generated/typed').ApiBody<'/employees/{employee_id}/certificates/{cert_id}', 'put'>}           CertificateUpdatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/certificates/{cert_id}', 'put'>}        UpdateCertificateResp
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/certificates/{cert_id}', 'delete'>}     DeleteCertificateResp
 *
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/contracts', 'get'>}                     ListContractsResp
 * @typedef {import('./_generated/typed').ApiBody<'/employees/{employee_id}/contracts', 'post'>}                       ContractCreatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/contracts', 'post'>}                    CreateContractResp
 * @typedef {import('./_generated/typed').ApiBody<'/employees/{employee_id}/contracts/{contract_id}', 'put'>}          ContractUpdatePayload
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/contracts/{contract_id}', 'put'>}       UpdateContractResp
 * @typedef {import('./_generated/typed').AxiosResp<'/employees/{employee_id}/contracts/{contract_id}', 'delete'>}    DeleteContractResp
 */

/**
 * @param {EmployeesQuery} [params]
 * @returns {GetEmployeesResp}
 */
export const getEmployees = (params) => api.get('/employees', { params })

/**
 * @param {number} id
 * @returns {GetEmployeeResp}
 */
export const getEmployee = (id) => api.get(`/employees/${id}`)

/**
 * @param {EmployeeCreatePayload} data
 * @returns {CreateEmployeeResp}
 */
export const createEmployee = (data) => api.post('/employees', data)

/**
 * @param {number} id
 * @param {EmployeeUpdatePayload} data
 * @returns {UpdateEmployeeResp}
 */
export const updateEmployee = (id, data) => api.put(`/employees/${id}`, data)

/**
 * @param {number} id
 * @param {OffboardPayload} data
 * @returns {OffboardResp}
 */
export const offboard = (id, data) => api.post(`/employees/${id}/offboard`, data)

/**
 * @param {number} id
 * @param {FinalSalaryPreviewQuery} [params]
 * @returns {FinalSalaryPreviewResp}
 */
export const getFinalSalaryPreview = (id, params) =>
  api.get(`/employees/${id}/final-salary-preview`, { params })

// ============ Diff-only updates ============
// Why: 後端 require_not_self_edit 比對 update_data.keys()，前端必須只送
// 真正異動的欄位才不會誤觸守衛（即使值相同也算 touch）。
// updateEmployeeBasic / updateEmployeeSalary 各自只送對應 tab 的 dirty fields。

/**
 * @param {number} id
 * @param {Partial<EmployeeUpdatePayload>} dirtyPayload
 * @returns {UpdateEmployeeResp}
 */
export const updateEmployeeBasic = (id, dirtyPayload) =>
    api.put(`/employees/${id}`, dirtyPayload)

/**
 * @param {number} id
 * @param {Partial<EmployeeUpdatePayload>} dirtyPayload
 * @returns {UpdateEmployeeResp}
 */
export const updateEmployeeSalary = (id, dirtyPayload) =>
    api.put(`/employees/${id}`, dirtyPayload)

// ========== Educations ==========

/**
 * @param {number} id
 * @returns {ListEducationsResp}
 */
export const listEmployeeEducations = (id) =>
  api.get(`/employees/${id}/educations`)

/**
 * @param {number} id
 * @param {EducationCreatePayload} data
 * @returns {CreateEducationResp}
 */
export const createEmployeeEducation = (id, data) =>
  api.post(`/employees/${id}/educations`, data)

/**
 * @param {number} id
 * @param {number} eduId
 * @param {EducationUpdatePayload} data
 * @returns {UpdateEducationResp}
 */
export const updateEmployeeEducation = (id, eduId, data) =>
  api.put(`/employees/${id}/educations/${eduId}`, data)

/**
 * @param {number} id
 * @param {number} eduId
 * @returns {DeleteEducationResp}
 */
export const deleteEmployeeEducation = (id, eduId) =>
  api.delete(`/employees/${id}/educations/${eduId}`)

// ========== Certificates ==========

/**
 * @param {number} id
 * @returns {ListCertificatesResp}
 */
export const listEmployeeCertificates = (id) =>
  api.get(`/employees/${id}/certificates`)

/**
 * @param {number} id
 * @param {CertificateCreatePayload} data
 * @returns {CreateCertificateResp}
 */
export const createEmployeeCertificate = (id, data) =>
  api.post(`/employees/${id}/certificates`, data)

/**
 * @param {number} id
 * @param {number} certId
 * @param {CertificateUpdatePayload} data
 * @returns {UpdateCertificateResp}
 */
export const updateEmployeeCertificate = (id, certId, data) =>
  api.put(`/employees/${id}/certificates/${certId}`, data)

/**
 * @param {number} id
 * @param {number} certId
 * @returns {DeleteCertificateResp}
 */
export const deleteEmployeeCertificate = (id, certId) =>
  api.delete(`/employees/${id}/certificates/${certId}`)

// ========== Contracts ==========

/**
 * @param {number} id
 * @returns {ListContractsResp}
 */
export const listEmployeeContracts = (id) =>
  api.get(`/employees/${id}/contracts`)

/**
 * @param {number} id
 * @param {ContractCreatePayload} data
 * @returns {CreateContractResp}
 */
export const createEmployeeContract = (id, data) =>
  api.post(`/employees/${id}/contracts`, data)

/**
 * @param {number} id
 * @param {number} cid
 * @param {ContractUpdatePayload} data
 * @returns {UpdateContractResp}
 */
export const updateEmployeeContract = (id, cid, data) =>
  api.put(`/employees/${id}/contracts/${cid}`, data)

/**
 * @param {number} id
 * @param {number} cid
 * @returns {DeleteContractResp}
 */
export const deleteEmployeeContract = (id, cid) =>
  api.delete(`/employees/${id}/contracts/${cid}`)
