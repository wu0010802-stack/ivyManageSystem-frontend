import { getEmployees } from '@/api/employees'
import { createFetchStore } from './_createFetchStore'

export const useEmployeeStore = createFetchStore('employee', getEmployees, {
  dataKey: 'employees',
  methodName: 'fetchEmployees',
  errorMsg: '員工資料載入失敗',
  getters: {
    teacherList: (state) =>
      state.employees.filter(e => ['主教', '助教', '美語老師'].includes(e.job_title)),
  },
})
