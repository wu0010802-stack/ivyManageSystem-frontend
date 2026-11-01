import { getEmployees } from '@/api/employees'
import { fetchAllByTotalCount, EMPLOYEE_PAGE_LIMIT, EMPLOYEE_MAX_PAGES } from '@/utils/fetchAllByTotalCount'
import { createFetchStore } from './_createFetchStore'

// 員工名冊需完整清單：後端預設只回 100 筆，依 X-Total-Count 翻頁取完（FE-F4）。
// 直接以單頁 getEmployees 翻頁（而非 getAllEmployees），讓只 mock 了 getEmployees 的
// 既有測試照常運作（替身無 header → 退回單頁）；常數也放在不會被 mock 的 util。
export const useEmployeeStore = createFetchStore('employee', () =>
  fetchAllByTotalCount((skip, limit) => getEmployees({ skip, limit }), {
    pageLimit: EMPLOYEE_PAGE_LIMIT,
    maxPages: EMPLOYEE_MAX_PAGES,
    label: '員工清單',
  }), {
  dataKey: 'employees',
  methodName: 'fetchEmployees',
  errorMsg: '員工資料載入失敗',
  getters: {
    teacherList: (state: Record<string, unknown>) =>
      (state.employees as { job_title: string }[]).filter((e: { job_title: string }) => ['主教', '助教', '美語老師'].includes(e.job_title)),
  },
})
