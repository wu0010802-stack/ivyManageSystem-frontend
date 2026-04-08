import { getTitles } from '@/api/config'
import { createFetchStore } from './_createFetchStore'

export const useConfigStore = createFetchStore('config', getTitles, {
  dataKey: 'jobTitles',
  methodName: 'fetchJobTitles',
  errorMsg: '職稱資料載入失敗',
})
