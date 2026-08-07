import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

// ── 模擬 vue-router（view 用 useRouter 導頁至查詢頁）──────────────────────
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// ── 模擬 API：bootstrap / 名額 / 報名時段皆回傳最小可用資料 ────────────────
vi.mock('@/api/activityPublic', () => ({
  getPublicBootstrap: vi.fn().mockResolvedValue({
    data: {
      courses: [{ name: '美術', price: 3000 }],
      supplies: [],
      classes: ['大班'],
      course_videos: {},
      registration_time: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
    },
  }),
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: {} }),
  getPublicRegistrationTime: vi.fn().mockResolvedValue({
    data: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
  }),
  publicRegister: vi.fn(),
}))

const mountView = async (): Promise<VueWrapper> => {
  const ActivityPublicView = (await import('../ActivityPublicView.vue')).default
  const wrapper = mount(ActivityPublicView, {
    global: {
      stubs: ['router-link', 'router-view'],
    },
  })
  await flushPromises()
  return wrapper
}

// 下載／分享列是 v-if="posterLoaded"；happy-dom 不會真的載圖，手動觸發 @load
const loadPoster = async (wrapper: VueWrapper) => {
  await wrapper.find('.poster-wrapper img').trigger('load')
  await nextTick()
}

// 用原生 KeyboardEvent 才拿得到 defaultPrevented——這正是本 bug 的觀測點：
// 外層 @keydown.*.prevent 一旦吃到子元素的鍵盤事件，就會取消 <a download> /
// <button> 的原生啟動行為，家長按下載卻只看到燈箱彈出。
const pressKey = (el: Element, key: string): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  el.dispatchEvent(event)
  return event
}

const lightboxOpen = (wrapper: VueWrapper) => wrapper.find('.modal-overlay--poster').exists()

describe('ActivityPublicView — 海報下載／分享的鍵盤操作不被燈箱攔截', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // canSharePoster 靠 navigator.share 是否存在；happy-dom 預設沒有
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockResolvedValue(undefined),
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'share')
  })

  it('在「下載」連結上按 Enter：不開燈箱，也不取消連結的原生下載行為', async () => {
    const wrapper = await mountView()
    await loadPoster(wrapper)

    const link = wrapper.find('.poster-actions a.poster-action')
    expect(link.exists(), '找不到下載連結').toBe(true)

    const event = pressKey(link.element, 'Enter')
    await nextTick()

    expect(event.defaultPrevented, '連結的原生啟動行為被取消，下載不會發生').toBe(false)
    expect(lightboxOpen(wrapper), '按下載卻彈出燈箱').toBe(false)
  })

  it('在「分享」按鈕上按 Space：不開燈箱，也不取消按鈕的原生啟動行為', async () => {
    const wrapper = await mountView()
    await loadPoster(wrapper)

    const shareBtn = wrapper.find('.poster-actions button.poster-action')
    expect(shareBtn.exists(), '找不到分享按鈕').toBe(true)

    const event = pressKey(shareBtn.element, ' ')
    await nextTick()

    // <button> 的啟動 click 是在 keyup 才合成；keydown 被 preventDefault 就永遠不會發生
    expect(event.defaultPrevented, '按鈕的原生啟動行為被取消，分享不會發生').toBe(false)
    expect(lightboxOpen(wrapper), '按分享卻彈出燈箱').toBe(false)
  })

  it('海報本體仍可用 Enter 開燈箱（修復不得誤傷原功能）', async () => {
    const wrapper = await mountView()
    await loadPoster(wrapper)

    pressKey(wrapper.find('.poster-wrapper').element, 'Enter')
    await nextTick()

    expect(lightboxOpen(wrapper)).toBe(true)
  })

  it('海報本體仍可用 Space 開燈箱，且擋掉捲頁的預設行為', async () => {
    const wrapper = await mountView()
    await loadPoster(wrapper)

    const event = pressKey(wrapper.find('.poster-wrapper').element, ' ')
    await nextTick()

    expect(lightboxOpen(wrapper)).toBe(true)
    expect(event.defaultPrevented, 'Space 應擋掉頁面捲動').toBe(true)
  })

  it('滑鼠點擊下載／分享列同樣不開燈箱（既有 @click.stop 的回歸柵欄）', async () => {
    const wrapper = await mountView()
    await loadPoster(wrapper)

    await wrapper.find('.poster-actions button.poster-action').trigger('click')
    await nextTick()

    expect(lightboxOpen(wrapper)).toBe(false)
  })
})
