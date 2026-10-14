import { describe, expect, it } from 'vitest'
import {
  TAB_ROOT_PATHS,
  ancestorPaths,
  backFallbackPath,
  inAppPreviousPath,
  resolveBackAction,
  type RouteLookup,
} from '../backNavigation'
import router from '../../router'

/** 用真正的家長端路由表查路徑——與 ParentLayout 的 lookupRoute 同一套規則。 */
const realLookup: RouteLookup = (path) => {
  const resolved = router.resolve(path)
  return resolved.name == null ? null : resolved.meta
}

describe('ancestorPaths', () => {
  it('由近到遠列出上層路徑，不含根', () => {
    expect(ancestorPaths('/events/3/ack')).toEqual(['/events/3', '/events'])
    expect(ancestorPaths('/home')).toEqual([])
  })

  it('忽略 query／hash', () => {
    expect(ancestorPaths('/contact-book/9?tab=x')).toEqual(['/contact-book'])
  })
})

describe('backFallbackPath：沒有站內上一頁時的落點', () => {
  it.each([
    ['home', '/home'],
    ['child', '/child'],
    ['contact-book', '/contact-book'],
    ['admin', '/admin'],
    ['me', '/me'],
  ])('沒有可用的上層路由時 tab=%s → 分頁根頁 %s', (tab, expected) => {
    expect(backFallbackPath('/x', { tab })).toBe(expected)
  })

  it('meta.backTo 覆寫一切', () => {
    expect(backFallbackPath('/events/3/ack', { tab: 'admin', backTo: '/fees' }, realLookup)).toBe('/fees')
  })

  it('backTo 不是站內絕對路徑時忽略（防止寫錯成外部網址或相對路徑）', () => {
    expect(backFallbackPath('/x', { tab: 'admin', backTo: 'https://example.com' })).toBe('/admin')
    expect(backFallbackPath('/x', { tab: 'admin', backTo: 42 })).toBe('/admin')
  })

  it('沒有 tab 或未知 tab → 首頁', () => {
    expect(backFallbackPath('/x', {})).toBe('/home')
    expect(backFallbackPath('/x', { tab: 'messages' })).toBe('/home')
    expect(backFallbackPath('/x', null)).toBe('/home')
  })

  // 以真實路由表驗證：推播常見的深連結落點，按返回應回到該功能的清單／上一層
  it.each([
    ['/events/3/ack', '/events'],
    ['/sign/5', '/sign'],
    ['/medications/12', '/medications'],
    ['/medications/new', '/medications'],
    ['/pickup/new', '/pickup'],
    ['/surveys/7', '/surveys'],
    ['/contact-book/9', '/contact-book'],
    ['/children/5/photos', '/children/5'],
    ['/children/5', '/child'],
    ['/me/privacy-rights', '/me'],
    ['/notifications/preferences', '/me'],
    ['/bus', '/home'],
    ['/fees', '/admin'],
  ])('%s → %s', (path, expected) => {
    const meta = router.resolve(path).meta
    expect(backFallbackPath(path, meta, realLookup)).toBe(expected)
  })

  it('五個根頁都是真實存在、且屬於同名分頁的路由（與 router 對齊）', () => {
    for (const [tab, path] of Object.entries(TAB_ROOT_PATHS)) {
      const resolved = router.resolve(path)
      expect(resolved.name).toBeTruthy()
      expect(resolved.meta.tab).toBe(tab)
    }
  })
})

describe('inAppPreviousPath：只認 vue-router 寫入的站內 back', () => {
  it('有 back 字串 → 回傳', () => {
    expect(inAppPreviousPath({ back: '/events', current: '/events/1/ack' })).toBe('/events')
  })

  it.each([
    ['深連結第一頁（back=null）', { back: null, current: '/events/1/ack' }],
    ['state 為 null（非 vue-router 寫入）', null],
    ['空字串', { back: '' }],
    ['型別不對', { back: 123 }],
  ])('%s → null', (_label, state) => {
    expect(inAppPreviousPath(state)).toBeNull()
  })
})

describe('resolveBackAction', () => {
  it('有站內上一頁 → router.back()', () => {
    expect(resolveBackAction({ back: '/fees' }, { path: '/fees', meta: { tab: 'admin' } }, realLookup))
      .toEqual({ type: 'back' })
  })

  it('從推播深連結直接進詳情頁（無站內上一頁）→ replace 到上一層，不退出 App', () => {
    expect(
      resolveBackAction({ back: null }, { path: '/contact-book/9', meta: { tab: 'contact-book' } }, realLookup),
    ).toEqual({ type: 'replace', path: '/contact-book' })
  })

  it('上一頁是登入／綁定等公開頁 → 不退回去，改走 fallback', () => {
    expect(resolveBackAction({ back: '/login' }, { path: '/fees', meta: { tab: 'admin' } }, realLookup))
      .toEqual({ type: 'replace', path: '/admin' })
  })
})
