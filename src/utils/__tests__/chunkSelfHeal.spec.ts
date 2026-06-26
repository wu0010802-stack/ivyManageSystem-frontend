import { describe, it, expect, vi, afterEach } from 'vitest'
import { looksLikeChunkLoadError, installChunkSelfHeal } from '@/utils/chunkSelfHeal'

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
