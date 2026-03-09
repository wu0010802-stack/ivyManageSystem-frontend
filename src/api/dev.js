import api from './index'

export const getSalaryLogic = () => api.get('/dev/salary-logic')

export const getEmployeeSalaryDebug = (params) =>
  api.get('/dev/employee-salary-debug', { params })
