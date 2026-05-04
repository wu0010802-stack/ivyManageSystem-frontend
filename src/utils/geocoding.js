/**
 * Geocoding helper（OpenStreetMap Nominatim）
 *
 * 為何不放在 src/api/：Nominatim 是第三方公開服務，不該走自家 axios instance
 * （那會帶上 Authorization cookie 與 /api 前綴）。
 *
 * Nominatim 使用條款：
 *   - 限速 ≤ 1 req/sec，請設定 User-Agent / Referer
 *   - 大量查詢應自架實例，公共 API 不可作為產品後端
 *   詳：https://operations.osmfoundation.org/policies/nominatim/
 *
 * 本模組內含 1 秒節流，避免同一頁面短時間連點。
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const RATE_LIMIT_MS = 1000

let _lastCallAt = 0

/**
 * 將地址轉為 (lat, lng)。找不到則回傳 null。
 *
 * @param {string} address
 * @param {object} [opts]
 * @param {string} [opts.countryCodes='tw']
 * @param {string} [opts.acceptLanguage='zh-Hant-TW,zh-TW;q=0.9']
 * @returns {Promise<{ lat: number, lng: number, displayName: string } | null>}
 */
export async function geocodeAddress(address, opts = {}) {
  if (!address || !address.trim()) return null

  const now = Date.now()
  const wait = Math.max(0, _lastCallAt + RATE_LIMIT_MS - now)
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
  _lastCallAt = Date.now()

  const url = new URL(NOMINATIM_BASE)
  url.searchParams.set('q', address.trim())
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', opts.countryCodes || 'tw')

  const response = await fetch(url.toString(), {
    headers: {
      'Accept-Language': opts.acceptLanguage || 'zh-Hant-TW,zh-TW;q=0.9',
    },
  })
  if (!response.ok) {
    throw new Error(`Nominatim HTTP ${response.status}`)
  }
  const data = await response.json()
  if (!Array.isArray(data) || data.length === 0) return null
  const hit = data[0]
  return {
    lat: parseFloat(hit.lat),
    lng: parseFloat(hit.lon),
    displayName: hit.display_name,
  }
}
