import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePortalCache } from '@/stores/portalCache'

describe('usePortalCache', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-06T10:00:00Z'))
  })

  it('get returns undefined for missing key', () => {
    const cache = usePortalCache()
    expect(cache.get('attendance', 'k1')).toBeUndefined()
  })

  it('set + get within TTL returns value', () => {
    const cache = usePortalCache()
    cache.set('attendance', 'k1', { hello: 'world' })
    expect(cache.get('attendance', 'k1')).toEqual({ hello: 'world' })
  })

  it('TTL expired returns undefined', () => {
    const cache = usePortalCache()
    cache.set('attendance', 'k1', { v: 1 }, { ttlMs: 1000 })
    vi.advanceTimersByTime(1500)
    expect(cache.get('attendance', 'k1')).toBeUndefined()
  })

  it('invalidate(namespace, key) removes specific key', () => {
    const cache = usePortalCache()
    cache.set('attendance', 'k1', 1)
    cache.set('attendance', 'k2', 2)
    cache.invalidate('attendance', 'k1')
    expect(cache.get('attendance', 'k1')).toBeUndefined()
    expect(cache.get('attendance', 'k2')).toBe(2)
  })

  it('invalidate(namespace) clears entire namespace', () => {
    const cache = usePortalCache()
    cache.set('attendance', 'k1', 1)
    cache.set('schedule', 'k2', 2)
    cache.invalidate('attendance')
    expect(cache.get('attendance', 'k1')).toBeUndefined()
    expect(cache.get('schedule', 'k2')).toBe(2)
  })

  it('clear removes everything', () => {
    const cache = usePortalCache()
    cache.set('a', '1', 'x')
    cache.set('b', '2', 'y')
    cache.clear()
    expect(cache.get('a', '1')).toBeUndefined()
    expect(cache.get('b', '2')).toBeUndefined()
  })

  it('default TTL is 5 minutes', () => {
    const cache = usePortalCache()
    cache.set('attendance', 'k1', 'v')
    vi.advanceTimersByTime(4 * 60 * 1000)
    expect(cache.get('attendance', 'k1')).toBe('v')
    vi.advanceTimersByTime(2 * 60 * 1000) // total 6min
    expect(cache.get('attendance', 'k1')).toBeUndefined()
  })

  it('has() reflects existence + TTL', () => {
    const cache = usePortalCache()
    expect(cache.has('attendance', 'k1')).toBe(false)
    cache.set('attendance', 'k1', 1, { ttlMs: 500 })
    expect(cache.has('attendance', 'k1')).toBe(true)
    vi.advanceTimersByTime(600)
    expect(cache.has('attendance', 'k1')).toBe(false)
  })
})
