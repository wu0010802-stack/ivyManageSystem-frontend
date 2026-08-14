/**
 * 首頁問候語（P3 mockup 落位）：依時段顯示「早安/午安/晚安」+ 對應插畫。
 * 沿用 TodayView.hero.test.ts 同款 mock 手法（見該檔案），只新增問候語斷言。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import GreetingSunIllustration from '@/parent/components/illustrations/GreetingSunIllustration.vue'
import GreetingMoonIllustration from '@/parent/components/illustrations/GreetingMoonIllustration.vue'

vi.mock('@/parent/api/contactBook', () => ({
  getTodayContactBook: vi.fn().mockResolvedValue({ data: { entry: null } }),
}))
const summaryDataRef = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: () => ({ data: summaryDataRef, error: ref(null), pending: ref(false), refresh: vi.fn() }),
}))
vi.mock('@/parent/composables/useTodayStatusCache', () => ({
  useTodayStatusCache: () => ({ status: ref(null), refresh: vi.fn() }),
}))
vi.mock('@/parent/api/bus', () => ({
  getBusToday: vi.fn().mockResolvedValue({ data: { trip: null, children: [] } }),
}))
vi.mock('@/parent/composables/useTodayTimeline', () => ({
  useTodayTimeline: () => ({ buckets: ref([]) }),
}))
vi.mock('@/parent/api/profile', () => ({ getHomeSummary: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { clearChildSelection } from '@/parent/composables/useChildSelection'

async function mountToday() {
  const TodayView = (await import('@/parent/views/TodayView.vue')).default
  const wrapper = shallowMount(TodayView, {
    global: {
      stubs: { PullToRefresh: { template: '<div class="ptr-stub"><slot /></div>' } },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  clearChildSelection()
  try { localStorage.clear() } catch { /* happy-dom 防呆 */ }
  summaryDataRef.value = {
    me: { can_push: true },
    children: [{ student_id: 1, name: '小明', classroom_name: '向日葵班' }],
    summary: {},
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TodayView — 問候語（P3）', () => {
  it('上午 8 點 → 早安 + 太陽插畫', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 10, 8, 0, 0))
    const wrapper = await mountToday()
    expect(wrapper.find('.today-greet').text()).toBe('早安！')
    expect(wrapper.findComponent(GreetingSunIllustration).exists()).toBe(true)
    wrapper.unmount()
  })

  it('下午 3 點 → 午安 + 太陽插畫', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 10, 15, 0, 0))
    const wrapper = await mountToday()
    expect(wrapper.find('.today-greet').text()).toBe('午安！')
    expect(wrapper.findComponent(GreetingSunIllustration).exists()).toBe(true)
    wrapper.unmount()
  })

  it('晚上 9 點 → 晚安 + 月亮插畫', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 7, 10, 21, 0, 0))
    const wrapper = await mountToday()
    expect(wrapper.find('.today-greet').text()).toBe('晚安！')
    expect(wrapper.findComponent(GreetingMoonIllustration).exists()).toBe(true)
    wrapper.unmount()
  })
})
