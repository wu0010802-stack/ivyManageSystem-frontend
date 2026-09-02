/**
 * Google Maps SDK 載入器的守衛。
 *
 * 這支存在的理由只有一條：**地圖不得因為第三方 SDK 而變成單點故障**。
 * 沒設金鑰、SDK 載入失敗、網路被擋（家長端在 LINE WebView 內尤其常見）——
 * 三種情況都必須安靜地回 `null`，讓呼叫端退回 Leaflet + OpenStreetMap，
 * 而不是拋錯讓整個地圖區塊消失。所以本檔的斷言重心在「失敗路徑」。
 *
 * 測試邊界：happy-dom 對外部 `<script>` 一律**同步**回 error（測試環境不下載
 * 外部資源），所以真實的 load 事件在此環境不可能發生。因此把 `appendChild`
 * ——也就是「DOM 插入 → 瀏覽器發網路請求」這條邊界——換成受控替身，由測試
 * 決定該次載入成功或失敗。被測的仍是載入器自己的判斷邏輯。
 *
 * 載入器的單例狀態是 module-level，每個 test 都用 `vi.resetModules()` 取全新
 * 實例，避免前一個 test 的「已失敗」旗標污染下一個。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

type LoaderModule = typeof import('@/utils/googleMapsLoader')

/** 每個 test 拿全新 module 實例（單例 promise 與失敗旗標都在 module scope）。 */
async function freshLoader(): Promise<LoaderModule> {
  vi.resetModules()
  return import('@/utils/googleMapsLoader')
}

type SdkOutcome =
  | { kind: 'loaded'; maps: Record<string, unknown> }
  | { kind: 'loadedWithoutApi' }
  | { kind: 'error' }

/**
 * 攔下 SDK script 的插入，改由測試決定該次載入的結果。
 * 回傳所有被插入的 script，供斷言 URL 與屬性。
 */
function stubSdkDelivery(outcome: SdkOutcome): HTMLScriptElement[] {
  const injected: HTMLScriptElement[] = []
  vi.spyOn(document.head, 'appendChild').mockImplementation(((node: Node) => {
    injected.push(node as HTMLScriptElement)
    if (outcome.kind === 'loaded') {
      // 真實瀏覽器的順序：SDK 先把 API 掛上 window，才觸發 load
      ;(window as unknown as { google?: unknown }).google = { maps: outcome.maps }
    }
    node.dispatchEvent(new Event(outcome.kind === 'error' ? 'error' : 'load'))
    return node
  }) as typeof document.head.appendChild)
  return injected
}

function appendCallCount(): number {
  return vi.mocked(document.head.appendChild).mock.calls.length
}

beforeEach(() => {
  delete (window as unknown as { google?: unknown }).google
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('ensureGoogleMaps', () => {
  it('未設金鑰時回 null，且不得對 Google 發出任何請求', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '')
    stubSdkDelivery({ kind: 'loaded', maps: { Map: vi.fn() } })
    const { ensureGoogleMaps } = await freshLoader()

    expect(await ensureGoogleMaps()).toBeNull()
    expect(appendCallCount()).toBe(0)
  })

  it('金鑰只有空白字元時視同未設（避免 env 填了空格就打出無效請求）', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '   ')
    stubSdkDelivery({ kind: 'loaded', maps: { Map: vi.fn() } })
    const { ensureGoogleMaps } = await freshLoader()

    expect(await ensureGoogleMaps()).toBeNull()
    expect(appendCallCount()).toBe(0)
  })

  it('SDK 已經在頁面上時直接沿用，不重複載入', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const maps = { Map: vi.fn() }
    ;(window as unknown as { google?: unknown }).google = { maps }
    stubSdkDelivery({ kind: 'error' })
    const { ensureGoogleMaps } = await freshLoader()

    expect(await ensureGoogleMaps()).toBe(maps)
    expect(appendCallCount()).toBe(0)
  })

  it('有金鑰時載入 SDK 並回傳 maps API', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const maps = { Map: vi.fn() }
    const injected = stubSdkDelivery({ kind: 'loaded', maps })
    const { ensureGoogleMaps } = await freshLoader()

    expect(await ensureGoogleMaps()).toBe(maps)
    expect(injected).toHaveLength(1)
    expect(injected[0].src).toContain('maps.googleapis.com/maps/api/js')
    expect(injected[0].src).toContain('key=test-key')
    // 台灣的地名與路名標示：少了 language/region 會回英文地名，家長看不懂
    expect(injected[0].src).toContain('language=zh-TW')
    expect(injected[0].src).toContain('region=TW')
    expect(injected[0].async).toBe(true)
  })

  it('併發呼叫共用同一次載入，只送出一次請求', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const maps = { Map: vi.fn() }
    stubSdkDelivery({ kind: 'loaded', maps })
    const { ensureGoogleMaps } = await freshLoader()

    const [first, second] = await Promise.all([ensureGoogleMaps(), ensureGoogleMaps()])

    expect(first).toBe(maps)
    expect(second).toBe(maps)
    expect(appendCallCount()).toBe(1)
  })

  it('載入失敗時回 null 而非拋錯（呼叫端據此退回 Leaflet）', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    stubSdkDelivery({ kind: 'error' })
    const { ensureGoogleMaps } = await freshLoader()

    await expect(ensureGoogleMaps()).resolves.toBeNull()
  })

  it('載入失敗後不再重試——否則每次開地圖都要再等一次 timeout', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    stubSdkDelivery({ kind: 'error' })
    const { ensureGoogleMaps } = await freshLoader()

    await ensureGoogleMaps()
    expect(await ensureGoogleMaps()).toBeNull()
    expect(appendCallCount()).toBe(1)
  })

  it('SDK 載完卻沒掛上 window.google 時同樣回 null（金鑰無效時 Google 會回空白腳本）', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    stubSdkDelivery({ kind: 'loadedWithoutApi' })
    const { ensureGoogleMaps } = await freshLoader()

    await expect(ensureGoogleMaps()).resolves.toBeNull()
  })

  it('已載入成功後遲到的 error 不得把載入器打成不可用', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key')
    const maps = { Map: vi.fn() }
    const injected = stubSdkDelivery({ kind: 'loaded', maps })
    const { ensureGoogleMaps } = await freshLoader()

    expect(await ensureGoogleMaps()).toBe(maps)
    injected[0].dispatchEvent(new Event('error'))

    expect(await ensureGoogleMaps()).toBe(maps)
  })
})
