import api from '@/api'
import { ElMessage } from 'element-plus'
import type { AxiosResponse } from 'axios'

/**
 * 將 axios blob response 觸發瀏覽器下載；自動解析 Content-Disposition。
 * 用於已透過 api wrapper 取得 response 的情境。
 */
export function saveBlobResponse(response: AxiosResponse<BlobPart>, fallbackName = 'download.xlsx') {
  let filename = fallbackName
  const disposition = response.headers['content-disposition']
  if (disposition) {
    // filename*=UTF-8''xxx.xlsx
    const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/i)
    if (utf8Match) {
      filename = decodeURIComponent(utf8Match[1])
    } else {
      const match = disposition.match(/filename="?([^";\n]+)"?/i)
      if (match) filename = match[1]
    }
  }

  const blob = new Blob([response.data])
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

/**
 * 透過 axios 下載檔案（帶 JWT token，走 proxy）
 * @param {string} url - API 路徑，例如 '/exports/employees'
 * @param {string} [fallbackName] - 預設檔名（若 header 無 Content-Disposition）
 * @param {Record<string, unknown>} [params] - 附加 query params（例如搜尋字串）
 * @returns {Promise<boolean>} 成功 true、失敗 false；錯誤已於內部顯示。呼叫端不可
 *   把「沒 throw」當成功（如結薪完成卡），須依此布林值判定成敗。
 */
export async function downloadFile(
  url: string,
  fallbackName = 'download.xlsx',
  params?: Record<string, unknown>,
): Promise<boolean> {
  return (await downloadFileWithHeaders(url, fallbackName, params)) !== null
}

/**
 * 同 downloadFile，但成功時回傳 response headers（key 為小寫，如
 * `x-roster-excluded-count`），供呼叫端讀後端自訂 header；失敗回 null（錯誤已顯示）。
 * 跨網域部署時 header 須在後端 CORS `expose_headers` 登記才讀得到。
 */
export async function downloadFileWithHeaders(
  url: string,
  fallbackName = 'download.xlsx',
  params?: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await api.get(url, { responseType: 'blob', timeout: 30000, params })
    saveBlobResponse(response, fallbackName)
    return (response.headers ?? {}) as Record<string, unknown>
  } catch (error) {
    // interceptor 已把 blob/JSON 錯誤正規化進 displayMessage（如「本月薪資尚未封存」）；
    // 優先顯示真實原因，無則退回通用文案。
    const e = error as { displayMessage?: string | null; message?: string }
    ElMessage.error(e.displayMessage || '下載失敗: ' + (e.message || '未知錯誤'))
    return null
  }
}
