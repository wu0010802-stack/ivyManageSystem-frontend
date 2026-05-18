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
 */
export async function downloadFile(url: string, fallbackName = 'download.xlsx') {
  try {
    const response = await api.get(url, { responseType: 'blob', timeout: 30000 })
    saveBlobResponse(response, fallbackName)
  } catch (error) {
    ElMessage.error('下載失敗: ' + ((error as { message?: string })?.message || '未知錯誤'))
  }
}
