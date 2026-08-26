import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  looksLikeChunkLoadError,
  installChunkSelfHeal,
  selfHealIfChunkError,
} from '@/utils/chunkSelfHeal'

describe('looksLikeChunkLoadError', () => {
  it.each([
    'ChunkLoadError: Loading chunk 12 failed',
    'Loading chunk vendor-abc failed.',
    'Failed to fetch dynamically imported module: https://x/assets/a-123.js',
    'error loading dynamically imported module',
  ])('命中 chunk 載入錯誤：%s', (msg) => {
    expect(looksLikeChunkLoadError(msg)).toBe(true)
  })

  it('忽略無關錯誤與空字串', () => {
    expect(looksLikeChunkLoadError('TypeError: undefined is not a function')).toBe(false)
    expect(looksLikeChunkLoadError('')).toBe(false)
    expect(looksLikeChunkLoadError()).toBe(false)
  })
})

describe('installChunkSelfHeal', () => {
  afterEach(() => vi.restoreAllMocks())

  it('掛上 error 與 unhandledrejection 兩個 window 監聽', () => {
    const spy = vi.spyOn(window, 'addEventListener')
    installChunkSelfHeal()
    const events = spy.mock.calls.map((c) => c[0])
    expect(events).toContain('error')
    expect(events).toContain('unhandledrejection')
    expect(events.filter((e) => e === 'error')).toHaveLength(1)
    expect(events.filter((e) => e === 'unhandledrejection')).toHaveLength(1)
  })
})

/**
 * 2026-08-26 staging 驗收：部署後點「員工詳情」只換 URL 不換內容、完全無提示。
 * 根因是 vue-router 把 lazy route 的 import() rejection 交給 router.onError，
 * **不會**冒泡到 window 的 error / unhandledrejection——installChunkSelfHeal 掛的
 * 那兩個監聽因此永遠收不到，自癒機制在它最主要的場景（PWA 升級後舊 index.html
 * 指向已被刪除的 hashed chunk）完全失效。
 *
 * 這裡把「判斷 + 自救」抽成可由 router.onError 直接呼叫的函式並鎖住行為。
 */
describe('selfHealIfChunkError（供 router.onError 呼叫）', () => {
  const origLocation = window.location
  let reload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sessionStorage.clear()
    reload = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...origLocation, reload },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: origLocation })
    vi.restoreAllMocks()
  })

  it('lazy route chunk 404（TypeError）→ 回報已接手並實際 reload', async () => {
    const err = new TypeError(
      'Failed to fetch dynamically imported module: https://x/assets/EmployeeDetailView-BAxmWytQ.js',
    )
    expect(selfHealIfChunkError(err)).toBe(true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('字串型錯誤同樣命中', async () => {
    expect(selfHealIfChunkError('ChunkLoadError: Loading chunk 7 failed')).toBe(true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
  })

  it('一般導航錯誤不接手、不 reload（避免把真 bug 洗成無限重載）', async () => {
    expect(selfHealIfChunkError(new Error('Navigation cancelled from / to /x'))).toBe(false)
    expect(selfHealIfChunkError(undefined)).toBe(false)
    expect(selfHealIfChunkError(null)).toBe(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(reload).not.toHaveBeenCalled()
  })

  it('sessionStorage flag 防迴圈：同一個 session 只自救一次', async () => {
    expect(selfHealIfChunkError(new TypeError('Failed to fetch dynamically imported module: /a.js'))).toBe(true)
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(selfHealIfChunkError(new TypeError('Failed to fetch dynamically imported module: /b.js'))).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
