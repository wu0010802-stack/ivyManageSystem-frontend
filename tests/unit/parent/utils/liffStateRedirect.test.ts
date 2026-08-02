import { describe, it, expect } from 'vitest'
import { resolvePublicLiffStateTarget } from '@/parent/utils/liffStateRedirect'

describe('resolvePublicLiffStateTarget', () => {
  it('liff.state 指向公開頁（URL-encoded）時回傳解碼後路徑', () => {
    expect(
      resolvePublicLiffStateTarget('?liff.state=%2Fpublic.html%23%2Factivity'),
    ).toBe('/public.html#/activity')
  })

  it('liff.state 為裸 /public.html（無 hash）也接受', () => {
    expect(resolvePublicLiffStateTarget('?liff.state=/public.html')).toBe('/public.html')
  })

  it('保留公開頁自帶的 query 與 hash', () => {
    expect(
      resolvePublicLiffStateTarget('?liff.state=%2Fpublic.html%3Ffrom%3Dline%23%2Factivity%2Fquery'),
    ).toBe('/public.html?from=line#/activity/query')
  })

  it('liff.state 指向家長端自身路由時不攔截', () => {
    expect(resolvePublicLiffStateTarget('?liff.state=%2Fmessages')).toBeNull()
    expect(resolvePublicLiffStateTarget('?liff.state=%2Factivity')).toBeNull()
  })

  it('沒有 liff.state 參數時回傳 null', () => {
    expect(resolvePublicLiffStateTarget('')).toBeNull()
    expect(resolvePublicLiffStateTarget('?foo=bar')).toBeNull()
  })

  it('拒絕非同源／偽裝路徑（開放重導防線）', () => {
    expect(resolvePublicLiffStateTarget('?liff.state=https%3A%2F%2Fevil.com%2Fpublic.html')).toBeNull()
    expect(resolvePublicLiffStateTarget('?liff.state=%2F%2Fevil.com%2Fpublic.html')).toBeNull()
    expect(resolvePublicLiffStateTarget('?liff.state=%2Fpublic.html.evil.com')).toBeNull()
    expect(resolvePublicLiffStateTarget('?liff.state=%2Fpublic.htmlx')).toBeNull()
  })
})
