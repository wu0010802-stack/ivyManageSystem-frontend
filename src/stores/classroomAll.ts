import { getClassrooms } from '@/api/classrooms'
import { createFetchStore } from './_createFetchStore'

/**
 * 跨學期班級清單（current_only=false）。
 *
 * 為什麼要跟 `useClassroomStore` 並存而不是改它：那支 store 由多個頁面共用，
 * 「新建資料時挑班級」本來就該只給當期班級；而「對照既有資料的 classroom_id」
 * 或「篩選歷史資料」則需要全學年的班，否則暑假期間學生已編入下學年班級時，
 * 班級一律查不到（接送通知曾因此把 196 位在籍學生全標成「未分班」）。
 *
 * `_createFetchStore` 的 action 呼叫 apiFn() 不帶參數，所以參數固定在這裡包好。
 */
export const useAllClassroomStore = createFetchStore(
  'classroomAll',
  () => getClassrooms({ current_only: false }),
  {
    dataKey: 'classrooms',
    methodName: 'fetchClassrooms',
    errorMsg: '班級資料載入失敗',
  },
)
