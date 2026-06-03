/**
 * 瀏覽器端圖片壓縮：把（手機拍的）大圖縮到目標位元組數以下，輸出 dataURL。
 *
 * 用途：廠商簽收「上傳紙本照片」為主要流程，但後端 signature 端點對解碼後的
 * 圖檔位元組數有 1MB 上限，手機拍的紙本照片動輒 2–5MB，直接上傳會被擋。
 * 故上傳前先在 canvas 縮放最長邊 + 逐步降 JPEG 品質，壓到門檻內再送。
 *
 * 注意：後端檢查的是 base64 解碼「後」的位元組數，所以這裡的 maxBytes 比對的
 * 也是解碼後大小（見 dataUrlBytes），不是 dataURL 字串長度。
 */

export interface CompressOptions {
  /** 解碼後位元組上限，預設 950KB（留 buffer 給後端 1MB 硬限） */
  maxBytes?: number
  /** 最長邊像素上限，預設 1600 */
  maxEdge?: number
  /** 輸出格式，預設 image/jpeg（紙本照片用 JPEG 最省） */
  mimeType?: string
}

/** 把 File 壓成 dataURL（image/jpeg），保證解碼後 ≤ maxBytes（在合理品質下盡力）。 */
export async function compressImageToDataUrl(
  file: File,
  opts: CompressOptions = {},
): Promise<string> {
  const maxBytes = opts.maxBytes ?? 950 * 1024
  const maxEdge = opts.maxEdge ?? 1600
  const mimeType = opts.mimeType ?? 'image/jpeg'

  const img = await loadImage(file)
  let width = img.naturalWidth || img.width
  let height = img.naturalHeight || img.height
  const longest = Math.max(width, height)
  if (longest > maxEdge) {
    const scale = maxEdge / longest
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('無法建立繪圖環境')
  // 先鋪白底，避免透明 PNG 轉 JPEG 後變黑底
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  let quality = 0.85
  let dataUrl = canvas.toDataURL(mimeType, quality)
  while (dataUrlBytes(dataUrl) > maxBytes && quality > 0.5) {
    quality -= 0.1
    dataUrl = canvas.toDataURL(mimeType, quality)
  }
  return dataUrl
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('圖片載入失敗'))
    }
    img.src = url
  })
}

/** 估算 dataURL base64 部分解碼後的位元組數。 */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  if (!b64) return 0
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}
