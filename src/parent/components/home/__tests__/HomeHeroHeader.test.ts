/**
 * 首頁頂部 hero（2026-08-16 改版，quickact01）：問候語 chip + 孩子近期照片
 * 輪播 + 姓名 + 日期/班級。
 *
 * 問候語三段斷言沿用原本 TodayView.greeting.test.ts 的時段案例（該檔已刪除，
 * 邏輯搬進本元件後改在這裡測）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GreetingSunIllustration from '../../illustrations/GreetingSunIllustration.vue'
import GreetingMoonIllustration from '../../illustrations/GreetingMoonIllustration.vue'
import HomeHeroHeader from '../HomeHeroHeader.vue'

const fetchChildPhotosMock = vi.fn()
vi.mock('@/parent/api/childPhotos', () => ({
  fetchChildPhotos: (...args: unknown[]) => fetchChildPhotosMock(...args),
}))

function mountHeader(props: Partial<InstanceType<typeof HomeHeroHeader>['$props']> = {}) {
  return mount(HomeHeroHeader, {
    props: {
      studentId: 1,
      name: '小明',
      classroomName: null,
      ...props,
    },
  })
}

beforeEach(() => {
  fetchChildPhotosMock.mockReset()
  fetchChildPhotosMock.mockResolvedValue({ data: { items: [] } })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('HomeHeroHeader — 問候語（依時段）', () => {
  it('上午 8 點 → 早安 + 太陽插畫', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 10, 8, 0, 0))
    const w = mountHeader()
    await flushPromises()
    expect(w.find('.hh-greet-text').text()).toBe('早安')
    expect(w.findComponent(GreetingSunIllustration).exists()).toBe(true)
    w.unmount()
  })

  it('下午 3 點 → 午安 + 太陽插畫', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 10, 15, 0, 0))
    const w = mountHeader()
    await flushPromises()
    expect(w.find('.hh-greet-text').text()).toBe('午安')
    expect(w.findComponent(GreetingSunIllustration).exists()).toBe(true)
    w.unmount()
  })

  it('晚上 9 點 → 晚安 + 月亮插畫', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 10, 21, 0, 0))
    const w = mountHeader()
    await flushPromises()
    expect(w.find('.hh-greet-text').text()).toBe('晚安')
    expect(w.findComponent(GreetingMoonIllustration).exists()).toBe(true)
    w.unmount()
  })
})

describe('HomeHeroHeader — 姓名／日期／班級', () => {
  it('顯示孩子姓名', async () => {
    const w = mountHeader({ name: '小華' })
    await flushPromises()
    expect(w.find('.hh-name').text()).toBe('小華')
  })

  it('日期行格式為「M/D · 星期X」，未帶班級時不多一個分隔點', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 16, 10, 0, 0)) // 2026-08-16 星期日
    const w = mountHeader({ classroomName: null })
    await flushPromises()
    expect(w.find('.hh-meta').text()).toBe('8/16 · 星期日')
  })

  it('有班級時附加在日期行後面', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 16, 10, 0, 0))
    const w = mountHeader({ classroomName: '天堂鳥' })
    await flushPromises()
    expect(w.find('.hh-meta').text()).toBe('8/16 · 星期日 · 天堂鳥')
  })
})

describe('HomeHeroHeader — 照片輪播（真實資料，抓不到就降級）', () => {
  it('無照片：顯示預設頭像 icon，不渲染 <img>', async () => {
    fetchChildPhotosMock.mockResolvedValue({ data: { items: [] } })
    const w = mountHeader()
    await flushPromises()
    expect(w.find('.hh-photo-img').exists()).toBe(false)
    expect(w.find('.hh-photo-fallback').exists()).toBe(true)
  })

  it('API 失敗：降級成預設頭像，不拋例外', async () => {
    fetchChildPhotosMock.mockRejectedValue(new Error('boom'))
    const w = mountHeader()
    await flushPromises()
    expect(w.find('.hh-photo-fallback').exists()).toBe(true)
  })

  it('有照片：渲染 <img>，點擊可切換到下一張（互斥挑選，兩張時必換）', async () => {
    fetchChildPhotosMock.mockResolvedValue({
      data: { items: [{ id: 1, thumb_url: '/a.jpg' }, { id: 2, thumb_url: '/b.jpg' }] },
    })
    const w = mountHeader()
    await flushPromises()
    expect(w.find('.hh-photo-img').attributes('src')).toBe('/a.jpg')
    await w.find('.hh-photo').trigger('click')
    expect(w.find('.hh-photo-img').attributes('src')).toBe('/b.jpg')
  })

  it('只有一張照片：不可點擊（disabled），不進入輪播', async () => {
    fetchChildPhotosMock.mockResolvedValue({
      data: { items: [{ id: 1, thumb_url: '/a.jpg' }] },
    })
    const w = mountHeader()
    await flushPromises()
    expect(w.find('.hh-photo').attributes('disabled')).toBeDefined()
  })

  it('切換 studentId（多寶切換選中子女）：重新抓照片', async () => {
    fetchChildPhotosMock.mockResolvedValue({ data: { items: [] } })
    const w = mountHeader({ studentId: 1 })
    await flushPromises()
    expect(fetchChildPhotosMock).toHaveBeenCalledWith(1, { limit: 6 })
    await w.setProps({ studentId: 2 })
    await flushPromises()
    expect(fetchChildPhotosMock).toHaveBeenCalledWith(2, { limit: 6 })
  })
})
