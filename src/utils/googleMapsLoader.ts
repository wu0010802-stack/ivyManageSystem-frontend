/**
 * Google Maps JavaScript SDK 的共用載入器。
 *
 * 設計立場：**Google 是加分項，不是相依**。整支唯一的對外承諾是
 * 「回一個 maps API，或回 null」——永不 reject。呼叫端據此二選一：
 * 拿到 API 就畫 Google 地圖，拿到 null 就退回 Leaflet + OpenStreetMap。
 * 這讓「沒設金鑰的環境（dev / e2e / 未開通的租戶）」與「SDK 被網路擋掉」
 * 走同一條安靜的降級路徑，不必在每個地圖元件裡各寫一次 try/catch。
 *
 * 計費：每次 `new google.maps.Map()` 算一次 Dynamic Maps load，載入 SDK
 * 本身不計費。所以本檔只負責把 SDK 弄進頁面，**建立地圖實例的時機由呼叫端
 * 決定**（例如只在班次行駛中才建、收起時 destroy）。
 *
 * 失敗只試一次：載入失敗後永久回 null，不重試。理由是家長端多在 LINE
 * WebView 內，網路被擋時每次開圖都重試等於每次都卡一段 timeout 才看到地圖。
 *
 * ⚠ 招生熱點圖（`components/recruitment/RecruitmentAddressHeatmap.vue`）另有一份
 * 自己的 loader，因為它需要 `libraries=places`。兩份尚未收斂——**新的地圖一律
 * 用本檔**；哪天招生要收斂進來，記得把 libraries 做成參數再合併。
 */

/** Google Maps SDK 沒有 @types，比照 repo 既有慣例以 any 承接。 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GoogleMapsApi = any

const SDK_MARKER = 'data-google-maps-sdk'
const SDK_BASE_URL = 'https://maps.googleapis.com/maps/api/js'

let loadPromise: Promise<GoogleMapsApi | null> | null = null
let unavailable = false

/** 每次呼叫時才讀 env（module 載入時讀會讓測試無法 stub，也擋住 runtime 注入）。 */
function browserApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim()
}

function existingApi(): GoogleMapsApi | null {
  return (window as unknown as { google?: { maps?: GoogleMapsApi } }).google?.maps ?? null
}

function removeSdkScripts(): void {
  document.querySelectorAll(`script[${SDK_MARKER}="true"]`).forEach((el) => { el.remove() })
}

/** 金鑰、地區、語言都在此組出；libraries 先不帶，需要 places/marker 時再由呼叫端擴充。 */
function sdkUrl(key: string): string {
  const params = new URLSearchParams({
    key,
    v: 'weekly',
    language: 'zh-TW',
    region: 'TW',
  })
  return `${SDK_BASE_URL}?${params.toString()}`
}

function injectSdk(key: string): Promise<GoogleMapsApi | null> {
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = sdkUrl(key)
    script.async = true
    script.defer = true
    script.setAttribute(SDK_MARKER, 'true')

    // 先 load 成功、稍後才收到 error 的情況確實存在（瀏覽器對已執行的腳本仍可能
    // 補一個 error）。少了這道閘，那顆遲到的 error 會把 unavailable 打開，
    // 讓後續每次開圖都無謂地退回 Leaflet。
    let settled = false

    const settle = (api: GoogleMapsApi | null) => {
      if (settled) return
      settled = true
      if (api) {
        resolve(api)
        return
      }
      // 失敗的 script 留在 head 會讓「已載入」的判斷說謊，一律清掉再降級
      unavailable = true
      removeSdkScripts()
      resolve(null)
    }

    script.addEventListener(
      'load',
      () => {
        // 金鑰無效時 Google 仍回 200 但不掛 window.google，這裡一併當失敗處理
        settle(existingApi())
      },
      { once: true },
    )
    script.addEventListener('error', () => { settle(null) }, { once: true })

    document.head.appendChild(script)
  })
}

/**
 * 取得 Google Maps API；沒有金鑰、載入失敗或金鑰無效時回 `null`。
 *
 * 併發呼叫共用同一次載入，不會重複插入 script。
 */
export async function ensureGoogleMaps(): Promise<GoogleMapsApi | null> {
  // 先看 SDK 是否已經在頁面上：曾經失敗過不代表現在沒有（別的元件載成功、
  // 或使用者從斷網恢復後重整）。unavailable 的用途是「不要再發請求」，
  // 而這條路徑本來就不發請求。
  const alreadyLoaded = existingApi()
  if (alreadyLoaded) return alreadyLoaded

  if (unavailable) return null

  const key = browserApiKey()
  if (!key) return null

  if (!loadPromise) {
    loadPromise = injectSdk(key).then((api) => {
      // 失敗後把 promise 清掉，讓 unavailable 旗標成為唯一的短路來源
      if (!api) loadPromise = null
      return api
    })
  }
  return loadPromise
}
