import { describe, it, expect, beforeEach } from 'vitest'
import { buildDocumentTitle, applyPageTitle } from '@/utils/pageTitle'

const ADMIN = '常春藤管理系統'
const PORTAL = '常春藤教師入口'
const PUBLIC = '常春藤才藝報名'

describe('buildDocumentTitle()', () => {
  it('管理端首頁 → "儀表板｜常春藤管理系統"', () => {
    expect(buildDocumentTitle({ path: '/' })).toBe(`儀表板｜${ADMIN}`)
  })

  it('管理端登入頁 → "管理員登入｜常春藤管理系統"', () => {
    expect(buildDocumentTitle({ path: '/login' })).toBe(`管理員登入｜${ADMIN}`)
  })

  it('教師入口路徑 → 切換 App title 為 PORTAL', () => {
    expect(buildDocumentTitle({ path: '/portal/dashboard' })).toBe(PORTAL)
    expect(buildDocumentTitle({ path: '/portal/login' })).toBe(`教師登入｜${PORTAL}`)
    expect(buildDocumentTitle({ path: '/portal/change-password' })).toBe(`修改密碼｜${PORTAL}`)
  })

  it('meta.portal=true 強制走 PORTAL app（即使 path 不在 /portal）', () => {
    const route = { path: '/other', meta: { portal: true } }
    expect(buildDocumentTitle(route)).toBe(PORTAL)
  })

  it('公開頁 /public → PUBLIC app title', () => {
    expect(buildDocumentTitle({ path: '/public/activities' })).toBe(PUBLIC)
  })

  it('meta.title 自訂優先於路徑推斷', () => {
    const route = { path: '/anything', meta: { title: '自訂頁面' } }
    expect(buildDocumentTitle(route)).toBe(`自訂頁面｜${ADMIN}`)
  })

  it('管理端 /change-password → "修改密碼｜常春藤管理系統"', () => {
    expect(buildDocumentTitle({ path: '/change-password' })).toBe(`修改密碼｜${ADMIN}`)
  })

  it('無 page title（一般 admin 頁面）→ 只顯示 app title', () => {
    expect(buildDocumentTitle({ path: '/employees' })).toBe(ADMIN)
  })

  it('pageTitle 與 appTitle 相同時不重複組合', () => {
    // 例：meta.title 寫成跟 app title 一樣，不要變 "X｜X"
    const route = { path: '/', meta: { title: ADMIN } }
    expect(buildDocumentTitle(route)).toBe(ADMIN)
  })

  it('route 為 null / undefined 不爆，回 ADMIN', () => {
    expect(buildDocumentTitle(null)).toBe(ADMIN)
    expect(buildDocumentTitle(undefined)).toBe(ADMIN)
  })
})

describe('applyPageTitle()', () => {
  let fakeDoc

  beforeEach(() => {
    // 用 stub document 不污染 jsdom 的全域 document
    const metaContents = { name: 'apple-mobile-web-app-title', content: '' }
    fakeDoc = {
      title: '',
      querySelector(selector) {
        if (selector === 'meta[name="apple-mobile-web-app-title"]') {
          return {
            setAttribute(attr, value) {
              if (attr === 'content') metaContents.content = value
            },
            _read: () => metaContents.content,
          }
        }
        return null
      },
    }
  })

  it('設定 document.title 為 buildDocumentTitle 結果', () => {
    applyPageTitle({ path: '/' }, fakeDoc)
    expect(fakeDoc.title).toBe(`儀表板｜${ADMIN}`)
  })

  it('同步更新 apple-mobile-web-app-title meta（content = appTitle）', () => {
    const captured = []
    const docWithMeta = {
      title: '',
      querySelector: () => ({
        setAttribute: (attr, value) => captured.push([attr, value]),
      }),
    }
    applyPageTitle({ path: '/portal/login' }, docWithMeta)
    expect(docWithMeta.title).toBe(`教師登入｜${PORTAL}`)
    expect(captured).toEqual([['content', PORTAL]])
  })

  it('沒有 meta tag 不會爆', () => {
    const docNoMeta = {
      title: '',
      querySelector: () => null,
    }
    expect(() => applyPageTitle({ path: '/' }, docNoMeta)).not.toThrow()
    expect(docNoMeta.title).toBe(`儀表板｜${ADMIN}`)
  })

  it('預設用全域 document（happy-dom）', () => {
    applyPageTitle({ path: '/login' })
    expect(document.title).toBe(`管理員登入｜${ADMIN}`)
  })
})
