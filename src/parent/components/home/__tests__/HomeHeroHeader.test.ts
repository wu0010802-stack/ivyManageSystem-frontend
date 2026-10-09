/**
 * 首頁頂部問候列：logo＋早安／午安／晚安插畫＋今天日期＋公告鈴鐺。
 *
 * 2026-10-08 改版後孩子照片／姓名／班級移到每張孩子狀態卡（ChildTodayCard，
 * 有自己的測試），本元件只剩 unreadAnnouncements 一個 prop、不打任何 API。
 * 問候語時段案例沿用原本 TodayView.greeting.test.ts；鈴鐺案例沿用 2026-09-08。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import GreetingSunIllustration from '../../illustrations/GreetingSunIllustration.vue'
import GreetingMoonIllustration from '../../illustrations/GreetingMoonIllustration.vue'
import HomeHeroHeader from '../HomeHeroHeader.vue'

afterEach(() => {
  vi.useRealTimers()
})

function mountAt(date: Date, props: { unreadAnnouncements?: number } = {}) {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(date)
  return mount(HomeHeroHeader, { props })
}

const MORNING = new Date(2026, 9, 8, 9, 0, 0)

describe('HomeHeroHeader — 問候語（依時段）', () => {
  it('上午 8 點 → 早安 + 太陽插畫', () => {
    const w = mountAt(new Date(2026, 7, 10, 8, 0, 0))
    expect(w.find('.hh-greet').text()).toBe('早安')
    expect(w.findComponent(GreetingSunIllustration).exists()).toBe(true)
  })

  it('下午 3 點 → 午安 + 太陽插畫', () => {
    const w = mountAt(new Date(2026, 7, 10, 15, 0, 0))
    expect(w.find('.hh-greet').text()).toBe('午安')
    expect(w.findComponent(GreetingSunIllustration).exists()).toBe(true)
  })

  it('晚上 9 點 → 晚安 + 月亮插畫', () => {
    const w = mountAt(new Date(2026, 7, 10, 21, 0, 0))
    expect(w.find('.hh-greet').text()).toBe('晚安')
    expect(w.findComponent(GreetingMoonIllustration).exists()).toBe(true)
  })
})

describe('HomeHeroHeader — 日期', () => {
  it('日期行為「M/D 星期X」，星期用中文全形字', () => {
    // 2026-10-08 是星期四
    const w = mountAt(new Date(2026, 9, 8, 9, 0, 0))
    expect(w.find('.hh-meta').text()).toBe('10/8 星期四')
  })

  it('不再顯示孩子姓名或照片（已移到孩子狀態卡）', () => {
    const w = mountAt(new Date(2026, 9, 8, 9, 0, 0))
    // 唯一的 <img> 是 BrandMark logo
    expect(w.findAll('img').length).toBe(1)
    expect(w.find('.hh-name').exists()).toBe(false)
    expect(w.find('.hh-photo').exists()).toBe(false)
  })
})

describe('HomeHeroHeader — 通知鈴鐺（2026-09-08）', () => {
  it('unreadAnnouncements 未帶（預設 0）：有鈴鐺、不顯示紅點', () => {
    const w = mountAt(MORNING)
    expect(w.find('[data-testid="hh-bell"]').exists()).toBe(true)
    expect(w.find('[data-testid="hh-bell-dot"]').exists()).toBe(false)
  })

  it('unreadAnnouncements > 0：顯示紅點', () => {
    const w = mountAt(MORNING, { unreadAnnouncements: 3 })
    expect(w.find('[data-testid="hh-bell-dot"]').exists()).toBe(true)
  })

  it('點擊鈴鐺 emit open-announcements（不直接依賴 vue-router）', async () => {
    const w = mountAt(MORNING, { unreadAnnouncements: 1 })
    await w.find('[data-testid="hh-bell"]').trigger('click')
    expect(w.emitted('open-announcements')?.length).toBe(1)
  })
})
