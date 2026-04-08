import { getClassrooms } from '@/api/classrooms'
import { createFetchStore } from './_createFetchStore'

export const useClassroomStore = createFetchStore('classroom', getClassrooms, {
  dataKey: 'classrooms',
  methodName: 'fetchClassrooms',
  errorMsg: '班級資料載入失敗',
})
