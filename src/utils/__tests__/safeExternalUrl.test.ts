import { describe, it, expect } from 'vitest'
import { safeExternalUrl, LINE_FRIEND_URL_HOSTS } from '@/utils/url'

// 資安稽核 2026-10-28 P3：tenant-meta 品牌 URL（brand.line_bot_friend_url）由同租戶
// SETTINGS_WRITE 帳號可寫，原樣綁 :href ＝儲存型 javascript: URL／釣魚網址。
describe('safeExternalUrl', () => {
  it('只放行 https 絕對 URL（去除前後空白）', () => {
    expect(safeExternalUrl(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1')
  })

  it.each([
    'http://example.com',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    '//evil.example/x',
    '/relative/path',
    'line://ti/p/@x',
    '',
    '   ',
  ])('擋非 https：%s', (v) => {
    expect(safeExternalUrl(v)).toBeUndefined()
  })

  it.each([null, undefined, 123, {}, []])('非字串回 undefined：%s', (v) => {
    expect(safeExternalUrl(v)).toBeUndefined()
  })

  it('帶 allowedHosts 時只放行精確網域或其子網域', () => {
    expect(safeExternalUrl('https://line.me/R/ti/p/@school', LINE_FRIEND_URL_HOSTS)).toBe(
      'https://line.me/R/ti/p/@school',
    )
    expect(safeExternalUrl('https://lin.ee/abc', LINE_FRIEND_URL_HOSTS)).toBe('https://lin.ee/abc')
    expect(safeExternalUrl('https://page.line.me/x', LINE_FRIEND_URL_HOSTS)).toBe('https://page.line.me/x')
    expect(safeExternalUrl('https://evil.example/R/ti/p/@x', LINE_FRIEND_URL_HOSTS)).toBeUndefined()
    // 後綴詐騙與帳密前綴
    expect(safeExternalUrl('https://evilline.me/x', LINE_FRIEND_URL_HOSTS)).toBeUndefined()
    expect(safeExternalUrl('https://line.me.evil.example/x', LINE_FRIEND_URL_HOSTS)).toBeUndefined()
    expect(safeExternalUrl('https://line.me@evil.example/x', LINE_FRIEND_URL_HOSTS)).toBeUndefined()
  })
})
