/**
 * TodayView 首頁 hero 重整回歸測試
 *
 * PRODUCT.md 的成功定義是「家長打開首頁 3 秒內看到孩子當日狀態」，
 * DESIGN.md 把 ContactBookDayCard 定位成首頁 hero。重整前它排在
 * 待簽橫幅 / 姓名 hero / 推播 CTA / 行政 Bento 之後（第 6 個區塊），
 * 手機首屏看不到。
 *
 * 涵蓋：
 *  - 今日卡三態（full / awaiting / offday）由 variant 驅動，位置固定
 *  - 今日卡 DOM 順序必須在行政 Bento 之前
 *  - 尚未綁定子女走 EmptyState，不再借用 DashboardHero
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const contactBookEntryRef = ref<{ id: number } | null>(null)
vi.mock('@/parent/api/contactBook', () => ({
  getTodayContactBook: vi.fn(() =>
    Promise.resolve({ data: { entry: contactBookEntryRef.value } }),
  ),
}))

const summaryDataRef = ref<Record<string, unknown> | null>(null)
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: () => ({
    data: summaryDataRef,
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))

const todayStatusRef = ref<{ children: Record<string, unknown>[] } | null>(null)
vi.mock('@/parent/composables/useTodayStatusCache', () => ({
  useTodayStatusCache: () => ({ status: todayStatusRef, refresh: vi.fn() }),
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
import ContactBookDayCard from '@/parent/components/contact-book/ContactBookDayCard.vue'

/** 單孩家庭；summary 帶足資料讓行政 Bento 會渲染（才測得出順序）。 */
function setSingleChildSummary() {
  summaryDataRef.value = {
    me: { can_push: true },
    children: [{ student_id: 1, name: '小明', classroom_name: '向日葵班' }],
    summary: {
      fees: { outstanding_count: 2, overdue: 0 },
      pending_event_acks: 1,
    },
  }
}

async function mountToday() {
  const TodayView = (await import('@/parent/views/TodayView.vue')).default
  const wrapper = shallowMount(TodayView, {
    global: {
      stubs: {
        // PullToRefresh 是包住整頁的真 SFC 容器，預設 shallowMount stub 會
        // 連 slot 一起吞掉（渲染出空的 <pull-to-refresh-stub />），首頁區塊
        // 全部消失。要驗 DOM 順序就必須給它一個會渲染 slot 的 stub。
        PullToRefresh: { template: '<div class="ptr-stub"><slot /></div>' },
      },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  clearChildSelection()
  try {
    localStorage.clear()
  } catch {
    /* happy-dom 防呆 */
  }
  contactBookEntryRef.value = null
  todayStatusRef.value = null
  setSingleChildSummary()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TodayView — 今日卡三態', () => {
  it('老師已填今日聯絡簿：variant=full 且整張卡可點進詳情', async () => {
    contactBookEntryRef.value = { id: 100 }
    todayStatusRef.value = {
      children: [{ student_id: 1, attendance: { status: '在園中' } }],
    }

    const wrapper = await mountToday()
    const card = wrapper.findComponent(ContactBookDayCard)

    expect(card.exists()).toBe(true)
    expect(card.props('variant')).toBe('full')
    expect(card.props('statusLabel')).toBe('在園中')
    expect(wrapper.find('.cb-card-link').exists()).toBe(true)

    wrapper.unmount()
  })

  it('上學日但老師還沒填：variant=awaiting，卡片不可點', async () => {
    contactBookEntryRef.value = null
    todayStatusRef.value = {
      children: [{ student_id: 1, attendance: { status: '在園中' } }],
    }

    const wrapper = await mountToday()
    const card = wrapper.findComponent(ContactBookDayCard)

    expect(card.props('variant')).toBe('awaiting')
    expect(card.props('statusLabel')).toBe('在園中')
    // 沒有 entry 就沒有可導向的詳情頁，不該包 router-link
    expect(wrapper.find('.cb-card-link').exists()).toBe(false)

    wrapper.unmount()
  })

  it('請假日：variant=offday 且帶請假專屬文案', async () => {
    contactBookEntryRef.value = null
    todayStatusRef.value = {
      children: [{ student_id: 1, leave: { type: '病假' } }],
    }

    const wrapper = await mountToday()
    const card = wrapper.findComponent(ContactBookDayCard)

    expect(card.props('variant')).toBe('offday')
    expect(card.props('statusLabel')).toBe('請假')
    expect(card.props('hint')).toBe('今天請假，好好休息')

    wrapper.unmount()
  })

  it('週末：variant=offday 且用預設休息文案（不覆寫 hint）', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // 2026-08-09 是星期日
    vi.setSystemTime(new Date(2026, 7, 9, 10, 0, 0))

    contactBookEntryRef.value = null
    todayStatusRef.value = { children: [{ student_id: 1 }] }

    const wrapper = await mountToday()
    const card = wrapper.findComponent(ContactBookDayCard)

    expect(card.props('variant')).toBe('offday')
    expect(card.props('statusLabel')).toBe('今天放假')
    expect(card.props('hint')).toBe('')

    wrapper.unmount()
  })
})

describe('TodayView — 區塊順序', () => {
  it('今日卡必須排在行政 Bento 之前', async () => {
    contactBookEntryRef.value = { id: 100 }
    todayStatusRef.value = {
      children: [{ student_id: 1, attendance: { status: '在園中' } }],
    }

    const wrapper = await mountToday()
    const html = wrapper.html()

    const heroAt = html.indexOf('cb-hero')
    const bentoAt = html.indexOf('today-bento')

    expect(heroAt).toBeGreaterThan(-1)
    expect(bentoAt).toBeGreaterThan(-1)
    expect(heroAt).toBeLessThan(bentoAt)

    wrapper.unmount()
  })
})

describe('TodayView — 尚未綁定子女', () => {
  it('走 EmptyState，不渲染今日卡', async () => {
    summaryDataRef.value = {
      me: { can_push: true },
      children: [],
      summary: { fees: null, pending_event_acks: 0 },
    }
    todayStatusRef.value = { children: [] }

    const wrapper = await mountToday()

    expect(wrapper.findComponent(ContactBookDayCard).exists()).toBe(false)
    // 首屏不引入共用 EmptyState（會把 admin-core chunk 拖進家長端首屏），
    // 改用本地 markup，斷言落在文案與 class 上。
    expect(wrapper.find('.unbound').exists()).toBe(true)
    expect(wrapper.text()).toContain('尚未綁定子女')

    wrapper.unmount()
  })
})
