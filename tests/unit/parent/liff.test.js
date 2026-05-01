import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@line/liff', () => ({
  default: {
    isLoggedIn: vi.fn(),
    isInClient: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
  },
}))

import {
  clearLiffTokenRefreshMarker,
  forceLiffReloginOnce,
  idTokenNeedsRefresh,
  liff,
} from '@/parent/services/liff'

describe('parent LIFF token refresh helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    liff.isLoggedIn.mockReturnValue(true)
    liff.isInClient.mockReturnValue(false)
  })

  it('treats expired or nearly expired id_token as needing refresh', () => {
    expect(idTokenNeedsRefresh({ exp: 1000 }, 1000)).toBe(true)
    expect(idTokenNeedsRefresh({ exp: 1059 }, 1000)).toBe(true)
    expect(idTokenNeedsRefresh({ exp: 1061 }, 1000)).toBe(false)
    expect(idTokenNeedsRefresh(null, 1000)).toBe(true)
  })

  it('forces LINE re-login only once per refresh window', () => {
    expect(forceLiffReloginOnce({ redirectUri: 'https://example.test/parent.html#/login', nowMs: 10 })).toBe(true)
    expect(liff.logout).toHaveBeenCalledTimes(1)
    expect(liff.login).toHaveBeenCalledWith({
      redirectUri: 'https://example.test/parent.html#/login',
    })

    expect(forceLiffReloginOnce({ redirectUri: 'https://example.test/parent.html#/login', nowMs: 1000 })).toBe(false)
    expect(liff.login).toHaveBeenCalledTimes(1)

    clearLiffTokenRefreshMarker()
    expect(forceLiffReloginOnce({ redirectUri: 'https://example.test/parent.html#/login', nowMs: 2000 })).toBe(true)
    expect(liff.login).toHaveBeenCalledTimes(2)
  })
})
