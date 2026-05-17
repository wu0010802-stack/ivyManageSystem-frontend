import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * geocoding.js 模組內含 module-level `_lastCallAt` 與 1 秒節流 setTimeout。
 * 為避免測試之間互相干擾或卡住，每個 test 用 vi.resetModules() 拿到全新狀態，
 * 並 stub setTimeout 立即 resolve（不真的等 1 秒）。
 */
describe('geocodeAddress()', () => {
  let geocodeAddress

  beforeEach(async () => {
    vi.resetModules()
    // 立即觸發 setTimeout callback，繞過 1s 節流
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((cb) => {
      cb()
      return 0
    })
    const mod = await import('@/utils/geocoding')
    geocodeAddress = mod.geocodeAddress
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('空字串 / 空白 / null 直接回 null，不發 fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({})
    expect(await geocodeAddress('')).toBeNull()
    expect(await geocodeAddress('   ')).toBeNull()
    expect(await geocodeAddress(null)).toBeNull()
    expect(await geocodeAddress(undefined)).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('成功 → 解析第一筆並轉成 { lat, lng, displayName }', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [
        { lat: '25.0330', lon: '121.5654', display_name: '台北市信義區' },
        { lat: '24.0', lon: '121.0', display_name: '另一個結果' },
      ],
    })
    const result = await geocodeAddress('台北 101')
    expect(result).toEqual({
      lat: 25.0330,
      lng: 121.5654,
      displayName: '台北市信義區',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    // URL 應包含 q / format=json / limit=1 / countrycodes=tw
    const calledUrl = fetchSpy.mock.calls[0][0]
    expect(calledUrl).toContain('q=')
    expect(calledUrl).toContain('format=json')
    expect(calledUrl).toContain('limit=1')
    expect(calledUrl).toContain('countrycodes=tw')
    // 預設 Accept-Language header
    const opts = fetchSpy.mock.calls[0][1]
    expect(opts.headers['Accept-Language']).toBe('zh-Hant-TW,zh-TW;q=0.9')
  })

  it('空陣列回 null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [],
    })
    expect(await geocodeAddress('查不到')).toBeNull()
  })

  it('非陣列回應也回 null（防呆）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'something' }),
    })
    expect(await geocodeAddress('any')).toBeNull()
  })

  it('HTTP 非 2xx 時拋出 Error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    })
    await expect(geocodeAddress('any')).rejects.toThrow(/Nominatim HTTP 503/)
  })

  it('支援自訂 countryCodes 與 acceptLanguage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '1', lon: '2', display_name: 'x' }],
    })
    await geocodeAddress('Tokyo', { countryCodes: 'jp', acceptLanguage: 'ja-JP' })
    const calledUrl = fetchSpy.mock.calls[0][0]
    expect(calledUrl).toContain('countrycodes=jp')
    expect(fetchSpy.mock.calls[0][1].headers['Accept-Language']).toBe('ja-JP')
  })

  it('lat/lon 由字串轉 Number', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => [{ lat: '25.5', lon: '121.5', display_name: 'x' }],
    })
    const r = await geocodeAddress('any')
    expect(typeof r.lat).toBe('number')
    expect(typeof r.lng).toBe('number')
    expect(r.lat).toBeCloseTo(25.5)
    expect(r.lng).toBeCloseTo(121.5)
  })
})
