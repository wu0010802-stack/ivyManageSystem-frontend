import { getAllEmployees } from '@/api/employees'
import { createFetchStore } from './_createFetchStore'

// 員工名冊需完整清單：後端預設只回 100 筆，getAllEmployees 依 X-Total-Count 翻頁取完（FE-F4）。
// 以 arrow 延遲取用，避免只 mock 了 getEmployees 的既有測試在 import 期就失敗。
export const useEmployeeStore = createFetchStore('employee', () => getAllEmployees(), {
  dataKey: 'employees',
  methodName: 'fetchEmployees',
  errorMsg: '員工資料載入失敗',
  getters: {
    teacherList: (state: Record<string, unknown>) =>
      (state.employees as { job_title: string }[]).filter((e: { job_title: string }) => ['主教', '助教', '美語老師'].includes(e.job_title)),
  },
})
