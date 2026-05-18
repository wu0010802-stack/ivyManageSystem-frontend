import { getShiftTypes } from '@/api/shifts'
import { createFetchStore } from './_createFetchStore'

export const useShiftStore = createFetchStore('shift', getShiftTypes, {
  dataKey: 'shiftTypes',
  methodName: 'fetchShiftTypes',
  errorMsg: '班別資料載入失敗',
  getters: {
    activeShiftTypes: (state) => (state as { shiftTypes: { is_active: unknown }[] }).shiftTypes.filter((t: { is_active: unknown }) => t.is_active),
  },
})
