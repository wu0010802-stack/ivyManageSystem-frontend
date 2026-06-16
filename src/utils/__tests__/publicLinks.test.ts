import { describe, it, expect } from 'vitest'
import { buildPublicEditUrl } from '@/utils/publicLinks'

describe('buildPublicEditUrl', () => {
  it('組出 public.html hash 路由的編修連結（token 在 hash 之內）', () => {
    expect(buildPublicEditUrl('https://ivy.example.com', 'abc123')).toBe(
      'https://ivy.example.com/public.html#/activity/query?token=abc123',
    )
  })

  it('token 內含特殊字元時做 URL 編碼', () => {
    expect(buildPublicEditUrl('https://x.com', 'a b/c?d=e')).toBe(
      'https://x.com/public.html#/activity/query?token=a%20b%2Fc%3Fd%3De',
    )
  })

  it('沒有 token 時回空字串', () => {
    expect(buildPublicEditUrl('https://x.com', '')).toBe('')
  })

  it('token 不得出現在 hash 之前（避免 prod nginx 404 / hash router 讀不到 / token 進 referer）', () => {
    const url = buildPublicEditUrl('https://x.com', 'tok')
    const hashIdx = url.indexOf('#')
    expect(hashIdx).toBeGreaterThan(-1)
    // hash 之前的部分不得含 token（舊 bug：/public/activity/query?token= 落在 hash 前）
    expect(url.slice(0, hashIdx)).not.toContain('token')
  })
})
