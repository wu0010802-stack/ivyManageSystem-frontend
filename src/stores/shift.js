import { getShiftTypes } from '@/api/shifts'
import { createFetchStore } from './_createFetchStore'

export const useShiftStore = createFetchStore('shift', getShiftTypes, {
  dataKey: 'shiftTypes',
  methodName: 'fetchShiftTypes',
  errorMsg: '班別資料載入失敗',
  getters: {
    activeShiftTypes: (state) => state.shiftTypes.filter(t => t.is_active),
  },
})
