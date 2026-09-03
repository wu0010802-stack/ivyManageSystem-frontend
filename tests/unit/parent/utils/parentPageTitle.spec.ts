import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/composables/useTenantBranding', () => ({
  getBranding: () => ({ titles: { parent_short: '常春藤家長' } }),
}))

import { buildParentDocumentTitle } from '@/parent/utils/parentPageTitle'
import { _resetLineClientForTests, markLineClientFromSdk } from '@/parent/utils/lineClient'

/**
 * SPEC-020 CT-M-03：LINE MINI App 的內建 header 直接顯示頁面 `<title>`，
 * 空間有限且 header 本身已標示 App 身分——再掛「- 常春藤家長」只會被截斷，
 * 或把有意義的頁名擠掉。外部瀏覽器沒有那條 header，後綴仍是必要的識別。
 *
 * 家長端有兩處寫 document.title（main.ts 的品牌載入回呼、router.ts 的
 * beforeEach），兩處必須共用同一個組字函式，否則會出現「切頁有後綴、
 * 品牌載完又被改成沒後綴」這種閃動。
 */

const ORIGINAL_UA = navigator.userAgent

beforeEach(() => {
  _resetLineClientForTests()
  Object.defineProperty(navigator, 'userAgent', { value: ORIGINAL_UA, configurable: true })
})

describe('buildParentDocumentTitle', () => {
  it('外部瀏覽器：頁名加園所後綴', () => {
    markLineClientFromSdk(false)
    expect(buildParentDocumentTitle('繳費')).toBe('繳費 - 常春藤家長')
  })

  it('LINE App 內：只有頁名，不加後綴', () => {
    markLineClientFromSdk(true)
    expect(buildParentDocumentTitle('繳費')).toBe('繳費')
  })

  it('LINE App 內且頁名為空：退回園所名稱，不得留下空標題', () => {
    markLineClientFromSdk(true)
    expect(buildParentDocumentTitle('')).toBe('常春藤家長')
  })

  it('外部瀏覽器且頁名為空：同樣退回園所名稱', () => {
    markLineClientFromSdk(false)
    expect(buildParentDocumentTitle('')).toBe('常春藤家長')
  })

  it('頁名等於園所名稱時不重複串接', () => {
    markLineClientFromSdk(false)
    expect(buildParentDocumentTitle('常春藤家長')).toBe('常春藤家長')
  })

  it('SDK 未就緒時走 User-Agent：LINE WebView 不加後綴', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Line/14.2.1 LIAPP',
      configurable: true,
    })
    expect(buildParentDocumentTitle('繳費')).toBe('繳費')
  })
})
