import { beforeEach, describe, expect, it } from 'vitest'

import {
  _resetLineClientForTests,
  isInLineClient,
  markLineClientFromSdk,
} from '@/parent/utils/lineClient'

/**
 * SPEC-020 CT-M-02：判斷「是否在 LINE App 內」不得依賴 LIFF init 完成。
 *
 * 已登入的家長不會經過 LoginView，因此不會呼叫 initLiff() ——若只問
 * liff.isInClient() 會把他們判成「不在 LINE 內」，MINI App 的內建 header 與
 * 家長端自畫的 M3TopAppBar 就會同時出現（雙標題列）。
 *
 * 故：SDK 未就緒時退回 User-Agent，SDK 就緒後以 SDK 為權威。
 * 本模組刻意**不** import @line/liff，避免把 SDK 靜態拖進家長端首屏 chunk。
 */

const ORIGINAL_UA = navigator.userAgent

function setUserAgent(ua: string): void {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true })
}

beforeEach(() => {
  _resetLineClientForTests()
  setUserAgent(ORIGINAL_UA)
})

describe('isInLineClient（SDK 未就緒 → User-Agent 判斷）', () => {
  it('LINE in-app WebView 的 UA 含 Line/<版本> → true', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Line/14.2.1 LIAPP',
    )
    expect(isInLineClient()).toBe(true)
  })

  it('一般行動瀏覽器 UA → false', () => {
    setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    )
    expect(isInLineClient()).toBe(false)
  })

  it('UA 為空字串也不得拋錯', () => {
    setUserAgent('')
    expect(isInLineClient()).toBe(false)
  })

  it('含 "online"、"airline" 等字樣不得誤判（需 Line/ 後接版本號）', () => {
    setUserAgent('Mozilla/5.0 AirlineBooking/2.0 online-agent')
    expect(isInLineClient()).toBe(false)
  })
})

describe('isInLineClient（SDK 就緒後以 SDK 為權威）', () => {
  it('SDK 回報 true → true（即使 UA 看不出來）', () => {
    setUserAgent('Mozilla/5.0 Safari/604.1')
    markLineClientFromSdk(true)
    expect(isInLineClient()).toBe(true)
  })

  it('SDK 回報 false → false（覆蓋 UA 的判斷）', () => {
    setUserAgent('Mozilla/5.0 Line/14.2.1 LIAPP')
    markLineClientFromSdk(false)
    expect(isInLineClient()).toBe(false)
  })

  it('SDK 回填後即時反映（render 期間讀 ref 建立依賴）', () => {
    setUserAgent('Mozilla/5.0 Safari/604.1')
    expect(isInLineClient()).toBe(false)
    markLineClientFromSdk(true)
    expect(isInLineClient()).toBe(true)
  })
})
