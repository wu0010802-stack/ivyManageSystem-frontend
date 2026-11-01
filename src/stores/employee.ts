import { getEmployees, getEmployeeOptions } from '@/api/employees'
import { getUserInfo, hasPermission } from '@/utils/auth'
import { fetchAllByTotalCount, EMPLOYEE_PAGE_LIMIT, EMPLOYEE_MAX_PAGES } from '@/utils/fetchAllByTotalCount'
import { createFetchStore } from './_createFetchStore'

// 員工名冊需完整清單：後端預設只回 100 筆，依 X-Total-Count 翻頁取完（FE-F4）。
// 直接以單頁 getEmployees 翻頁（而非 getAllEmployees），讓只 mock 了 getEmployees 的
// 既有測試照常運作（替身無 header → 退回單頁）；常數也放在不會被 mock 的 util。
//
// 已登入但沒有 EMPLOYEES_READ 的角色（如主任）改走 /employees/options：只取 id／員編／
// 姓名／在職供下拉使用（EMPLOYEES_READ 會連帶開放全員電話地址與名冊匯出，故不授予）。
// 未登入（含既有測試無使用者資訊）維持原行為。
const fetchRoster = () =>
  getUserInfo() && !hasPermission('EMPLOYEES_READ')
    ? getEmployeeOptions()
    : fetchAllByTotalCount((skip, limit) => getEmployees({ skip, limit }), {
        pageLimit: EMPLOYEE_PAGE_LIMIT,
        maxPages: EMPLOYEE_MAX_PAGES,
        label: '員工清單',
      })

export const useEmployeeStore = createFetchStore('employee', fetchRoster, {
  dataKey: 'employees',
  methodName: 'fetchEmployees',
  errorMsg: '員工資料載入失敗',
  getters: {
    teacherList: (state: Record<string, unknown>) =>
      (state.employees as { job_title: string }[]).filter((e: { job_title: string }) => ['主教', '助教', '美語老師'].includes(e.job_title)),
  },
})
