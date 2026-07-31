import { describe, it, expect } from 'vitest'
import { buildPublicEditUrl, buildPublicRegistrationUrl } from '@/utils/publicLinks'

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

describe('buildPublicRegistrationUrl', () => {
  it('組出對外分享用的裸報名連結（不帶 token / 學期參數）', () => {
    expect(buildPublicRegistrationUrl('https://ivy.example.com')).toBe(
      'https://ivy.example.com/public.html#/activity',
    )
  })

  it('走 public.html entry 而非 admin SPA fallback（後者在 LINE 預覽卡會顯示成管理系統）', () => {
    const url = buildPublicRegistrationUrl('https://ivy.example.com')
    expect(url).toContain('/public.html#/')
    expect(url).not.toContain('index.html')
    expect(url).not.toContain('#/public/activity')
  })
})
