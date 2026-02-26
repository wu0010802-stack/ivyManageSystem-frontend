import api from '@/api'
import { ElMessage } from 'element-plus'

/**
 * 透過 axios 下載檔案（帶 JWT token，走 proxy）
 * @param {string} url - API 路徑，例如 '/exports/employees'
 * @param {string} [fallbackName] - 預設檔名（若 header 無 Content-Disposition）
 */
export async function downloadFile(url, fallbackName = 'download.xlsx') {
  try {
    const response = await api.get(url, { responseType: 'blob', timeout: 30000 })

    // 嘗試從 Content-Disposition 取得檔名
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
  } catch (error) {
    ElMessage.error('下載失敗: ' + (error.message || '未知錯誤'))
  }
}
