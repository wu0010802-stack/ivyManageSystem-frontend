import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 海報放大檢視的三條接線柵欄。三者壞掉都不會噴錯，只會靜默退化成
 * 「點了沒反應」「點下載卻彈出燈箱」「燈箱整片沒樣式」。
 */
const source = readFileSync(resolve(__dirname, '../ActivityPublicView.vue'), 'utf-8')

describe('海報放大檢視接線', () => {
  it('posterZoomable 同時排除 posterBroken——載入失敗的預設圖不給放大', () => {
    // 只看 posterLoaded 會誤放行：DEFAULT_POSTER fallback 同樣會觸發 img @load
    const match = source.match(/const posterZoomable = computed\(\(\) =>([^)]*)\)/)
    expect(match, '找不到 posterZoomable').toBeTruthy()
    expect(match![1]).toMatch(/posterLoaded\.value/)
    expect(match![1]).toMatch(/!posterBroken\.value/)
  })

  it('openPosterLightbox 以 posterZoomable 為閘門', () => {
    const fn = source.match(/function openPosterLightbox\(\)\s*\{([\s\S]*?)\n\}/)
    expect(fn, '找不到 openPosterLightbox').toBeTruthy()
    expect(fn![1]).toMatch(/if \(!posterZoomable\.value\) return/)
  })

  it('下載／分享按鈕列擋掉冒泡，點它們不會連帶開燈箱', () => {
    expect(source).toMatch(/class="poster-actions"\s+@click\.stop/)
  })

  it('海報容器可鍵盤操作（Enter／Space 開燈箱）', () => {
    expect(source).toMatch(/@keydown\.enter\.prevent="openPosterLightbox"/)
    expect(source).toMatch(/@keydown\.space\.prevent="openPosterLightbox"/)
  })

  it('燈箱樣式放在非 scoped 區塊——scoped 的 data-v-* 到不了子元件 DOM', () => {
    const nonScoped = source.slice(source.lastIndexOf('<style>'))
    expect(nonScoped).toMatch(/\.public-activity-page \.modal-panel--poster\s*\{/)
    expect(nonScoped).toMatch(/\.public-activity-page \.poster-full\s*\{/)
    expect(nonScoped).toMatch(/\.public-activity-page \.poster-full-actions \.poster-action\s*\{/)
  })

  it('燈箱圖以寬度優先渲染，不設 max-height', () => {
    // 直式 A4 海報若整張 fit 進視窗高，桌機只剩 ~460px 寬——比頁面上原本的 526px 還小
    const rule = source.match(/\.public-activity-page \.poster-full\s*\{([^}]*)\}/)
    expect(rule![1]).toMatch(/width:\s*min\(100%, 900px\)/)
    expect(rule![1]).not.toMatch(/max-height/)
  })

  it('第二段放大有上限 1800px——原圖寬 2505，再大只是放大像素', () => {
    const rule = source.match(/\.public-activity-page \.poster-full\.is-zoomed\s*\{([^}]*)\}/)
    expect(rule, '找不到 is-zoomed 規則').toBeTruthy()
    expect(rule![1]).toMatch(/width:\s*min\(200%, 1800px\)/)
  })

  it('燈箱面板用 block + margin auto 置中，不用 flex align-items:center', () => {
    // flex 置中在子元素比容器寬時會裁掉左半截且捲不回去，放大後就看不到海報左邊
    const rule = source.match(/\.public-activity-page \.modal-panel--poster\s*\{([^}]*)\}/)
    const declarations = rule![1].replace(/\/\*[\s\S]*?\*\//g, '') // 註解裡也提到 align-items
    expect(declarations).toMatch(/display:\s*block/)
    expect(declarations).not.toMatch(/align-items:\s*center/)
  })

  it('overlay 可雙向捲動（放大後圖會超出視窗）', () => {
    const rule = source.match(/\.public-activity-page \.modal-overlay--poster\s*\{([^}]*)\}/)
    expect(rule![1]).toMatch(/overflow:\s*auto/)
    expect(rule![1]).toMatch(/overscroll-behavior:\s*contain/)
  })
})
