import { describe, it, expect } from 'vitest'
import { shouldRefreshUnread } from '../unreadThrottle'

describe('shouldRefreshUnread', () => {
  const TTL = 45_000
  it('首次（lastTs=0）一律刷新', () => {
    expect(shouldRefreshUnread(0, 1_000_000, TTL)).toBe(true)
  })
  it('TTL 內不刷新', () => {
    expect(shouldRefreshUnread(1_000_000, 1_000_000 + 30_000, TTL)).toBe(false)
  })
  it('剛好到 TTL 邊界刷新', () => {
    expect(shouldRefreshUnread(1_000_000, 1_000_000 + 45_000, TTL)).toBe(true)
  })
  it('逾 TTL 刷新', () => {
    expect(shouldRefreshUnread(1_000_000, 1_000_000 + 60_000, TTL)).toBe(true)
  })
})
