// 課後才藝點名單列印——薄殼，實際邏輯在通用 utils/printPdfWindow
//
// 保留此檔以維持既有 import 路徑相容性。新功能請直接 import
// `openPdfInNewTab` from '@/utils/printPdfWindow'。

import { openPdfInNewTab } from './printPdfWindow'

export async function openAttendanceRollPrintWindow({ fetchBlob, onError } = {}) {
  return openPdfInNewTab({
    fetchBlob,
    loadingText: '點名單載入中…',
    onError,
  })
}
