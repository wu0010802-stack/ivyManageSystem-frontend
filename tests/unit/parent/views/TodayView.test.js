/**
 * 家長首頁（2026-10-08 改版，方向 A＋C）。
 *
 * 結構：問候列（含公告鈴鐺）→ 每位孩子一張狀態卡（多寶並列）→ 常用功能 →
 * 校園公告卡 → 待辦清單 → 娃娃車列 → 今日動態 → 行事曆。HomeHeroHeader /
 * ChildTodayCard 用真元件掛載（它們就是首頁的主角）；待辦清單、娃娃車列、公告卡、
 * 常用功能列、時間軸各有專屬測試，這裡 stub 掉，只驗證有掛上、順序對。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

// useCachedAsync stub：summary（parent/today/summary）給測試控制的 summaryRef
const summaryRef = ref(null)
const refreshSummaryMock = vi.fn()
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: () => ({ data: summaryRef, error: ref(null), pending: ref(false), refresh: refreshSummaryMock }),
}))

const todayStatusRef = ref(null)
vi.mock('@/parent/composables/useTodayStatusCache', () => ({
  useTodayStatusCache: () => ({ status: todayStatusRef, refresh: vi.fn(), markStale: vi.fn() }),
}))

vi.mock('@/parent/composables/useTodayTimeline', () => ({
  useTodayTimeline: () => ({ buckets: ref([]) }),
}))

const selectionMock = vi.hoisted(() => ({ setSelected: vi.fn(), ensureSelected: vi.fn() }))
vi.mock('@/parent/composables/useChildSelection', () => ({
  useChildSelection: () => selectionMock,
}))

vi.mock('@/parent/api/profile', () => ({ getHomeSummary: vi.fn() }))
vi.mock('@/parent/api/childPhotos', () => ({
  fetchChildPhotos: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

const pushMock = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))

const contactBookMock = vi.hoisted(() => ({
  getTodayContactBook: vi.fn().mockResolvedValue({ data: { entry: null } }),
}))
vi.mock('@/parent/api/contactBook', () => contactBookMock)

const busReloadMock = vi.fn().mockResolvedValue(undefined)

import TodayView from '@/parent/views/TodayView.vue'

function mountWith(summary, today) {
  summaryRef.value = summary
  todayStatusRef.value = today
  return mount(TodayView, {
    global: {
      stubs: {
        PullToRefresh: { template: '<div class="ptr"><slot /></div>' },
        SkeletonBlock: true,
        MobileErrorRetry: true,
        TodayTimeline: true,
        QuickActionsBar: { template: '<div class="qa-stub"></div>' },
        AnnouncementsHomeCard: { template: '<div class="ann-home-card-stub"></div>' },
        HomeTodoList: { template: '<div class="home-todo-stub"></div>' },
        HomeBusRow: {
          template: '<div class="home-bus-stub"></div>',
          setup(_props, { expose }) { expose({ reload: busReloadMock }) },
        },
        RouterLink: { props: ['to'], template: '<a :href="to"><slot /></a>' },
        CrownIcon: true,
      },
    },
  })
}

const ONE_CHILD = (extra = {}) => ({
  me: { name: '王太太', can_push: true },
  children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }],
  summary: {},
  ...extra,
})
const today = (child) => ({ children: [{ student_id: 1, name: '小明', ...child }] })

const card = (w, sid = 1) => w.find(`[data-child-card="${sid}"]`)
const statusOf = (w, sid = 1) => card(w, sid).find('.ctc-status-label').text()

beforeEach(() => {
  setActivePinia(createPinia())
  summaryRef.value = null
  todayStatusRef.value = null
  pushMock.mockClear()
  refreshSummaryMock.mockClear()
  busReloadMock.mockClear()
  selectionMock.setSelected.mockClear()
  selectionMock.ensureSelected.mockClear()
  contactBookMock.getTodayContactBook.mockReset()
  contactBookMock.getTodayContactBook.mockResolvedValue({ data: { entry: null } })
  // 鎖定平日（週四）避免「今天放假」分支干擾
  vi.setSystemTime(new Date('2026-05-14T09:30:00+08:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TodayView 孩子狀態卡', () => {
  it('單一孩子在園：卡片帶姓名、班級與「在園中」', async () => {
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    expect(card(w).find('.ctc-name').text()).toBe('小明')
    expect(card(w).find('.ctc-class').text()).toContain('太陽班')
    expect(statusOf(w)).toBe('在園中')
  })

  it('後端出席狀態為「遲到」：照實顯示在說明', async () => {
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '遲到' } }))
    await flushPromises()
    expect(card(w).find('.ctc-status-detail').text()).toBe('今天遲到')
  })

  it('請假：大字「請假」，聯絡簿副標為請假無紀錄', async () => {
    const w = mountWith(ONE_CHILD(), today({ leave: { type: '病假' } }))
    await flushPromises()
    expect(statusOf(w)).toBe('請假')
    expect(card(w).find('.ctc-cb-sub').text()).toBe('今天請假，暫無紀錄')
    expect(card(w).find('.ctc-steps').exists()).toBe(false)
  })

  it('尚未到校：聯絡簿副標為老師還沒寫', async () => {
    const w = mountWith(ONE_CHILD(), today({}))
    await flushPromises()
    expect(statusOf(w)).toBe('尚未到校')
    expect(card(w).find('.ctc-cb-sub').text()).toBe('老師還沒有寫今天的紀錄')
  })

  it('已離園', async () => {
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' }, dismissal: { status: 'completed' } }))
    await flushPromises()
    expect(statusOf(w)).toBe('已離園')
  })

  it('週末沒有紀錄：今天放假，聯絡簿副標為放假無紀錄', async () => {
    vi.setSystemTime(new Date('2026-05-16T10:00:00+08:00')) // 週六
    const w = mountWith(ONE_CHILD(), { children: [] })
    await flushPromises()
    expect(statusOf(w)).toBe('今天放假')
    expect(card(w).find('.ctc-cb-sub').text()).toBe('今天放假，暫無紀錄')
  })

  it('多寶家庭：每位孩子各一張卡並列，不再有切換器或底部孩子條', async () => {
    // 頭像字取名字最後一字（同姓兄弟姊妹才分得出來），見下方斷言
    const w = mountWith(
      {
        me: { name: '王太太' },
        children: [
          { student_id: 1, name: '小明', classroom_name: '太陽班' },
          { student_id: 2, name: '小華', classroom_name: '月亮班' },
        ],
        summary: {},
      },
      {
        children: [
          { student_id: 1, name: '小明', attendance: { status: '已入園' } },
          { student_id: 2, name: '小華', leave: { type: '事假' } },
        ],
      },
    )
    await flushPromises()
    expect(statusOf(w, 1)).toBe('在園中')
    expect(statusOf(w, 2)).toBe('請假')
    expect(card(w, 1).find('.ctc-avatar-initial').text()).toBe('明')
    expect(card(w, 2).find('.ctc-avatar-initial').text()).toBe('華')
    // 孩子資訊全在狀態卡：問候列不再有孩子姓名／照片，也沒有切換器或底部孩子條
    expect(w.find('.hh-name').exists()).toBe(false)
    expect(w.find('.child-context-header').exists()).toBe(false)
    expect(w.find('.children-section').exists()).toBe(false)
    // 每位孩子各抓自己的今日聯絡簿
    expect(contactBookMock.getTodayContactBook).toHaveBeenCalledWith(1)
    expect(contactBookMock.getTodayContactBook).toHaveBeenCalledWith(2)
  })

  it('點卡片頭：設為選定孩子並進孩子檔案', async () => {
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    await card(w).find('.ctc-head').trigger('click')
    expect(selectionMock.setSelected).toHaveBeenCalledWith(1)
    expect(pushMock).toHaveBeenCalledWith('/children/1')
  })

  it('今天有用藥委託：卡片顯示用藥提示', async () => {
    const w = mountWith(
      ONE_CHILD(),
      today({ attendance: { status: '已入園' }, medication: { has_order: true, order_count: 2 } }),
    )
    await flushPromises()
    expect(card(w).find('[data-child-medication]').text()).toContain('今日用藥委託 2 次')
  })

  it('頁面不含家長稱謂（王太太不應出現在首頁任何角落）', async () => {
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    expect(w.text()).not.toContain('王太太')
  })
})

describe('TodayView 今日聯絡簿入口', () => {
  it('有今天的紀錄：連到該筆詳情；未讀時標「未讀」', async () => {
    contactBookMock.getTodayContactBook.mockResolvedValue({
      data: { entry: { id: 77, isRead: false, readAt: null } },
    })
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    const cb = card(w).find('[data-child-contact-book]')
    expect(cb.attributes('href')).toBe('/contact-book/77')
    expect(cb.find('.ctc-new').exists()).toBe(true)
    expect(cb.find('.ctc-cb-sub').text()).toBe('老師寫好了，點開看看')
  })

  it('已讀：副標改為查看完整紀錄、無未讀標記', async () => {
    contactBookMock.getTodayContactBook.mockResolvedValue({
      data: { entry: { id: 77, isRead: true, readAt: '2026-05-14T16:00:00' } },
    })
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    const cb = card(w).find('[data-child-contact-book]')
    expect(cb.find('.ctc-new').exists()).toBe(false)
    expect(cb.find('.ctc-cb-sub').text()).toBe('查看今天的完整紀錄')
  })

  it('cache-hit（子女清單一開始就有值）也會抓聯絡簿（P1-16）', async () => {
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    expect(contactBookMock.getTodayContactBook).toHaveBeenCalledTimes(1)
    expect(contactBookMock.getTodayContactBook).toHaveBeenCalledWith(1)
    expect(w.find('[data-child-contact-book]').attributes('href')).toBe('/contact-book')
  })

  it('聯絡簿 API 失敗：退回列表頁，不擋卡片其他內容', async () => {
    contactBookMock.getTodayContactBook.mockRejectedValue(new Error('boom'))
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    expect(statusOf(w)).toBe('在園中')
    expect(w.find('[data-child-contact-book]').attributes('href')).toBe('/contact-book')
  })
})

describe('TodayView 尚未綁定子女', () => {
  it('home-summary 子女清單為空：顯示綁定入口，不渲染狀態卡與常用功能', async () => {
    const w = mountWith({ me: { name: '王太太' }, children: [], summary: {} }, { children: [] })
    await flushPromises()
    expect(w.text()).toContain('尚未綁定子女')
    expect(w.find('a[href="/bind-additional"]').text()).toContain('綁定孩子')
    // 舊文案指向已不存在的「右上角個人選單」
    expect(w.text()).not.toContain('右上角')
    expect(w.findAll('[data-child-card]').length).toBe(0)
    expect(w.find('.qa-stub').exists()).toBe(false)
  })

  it('有綁定子女但今日狀態尚未就緒：不誤顯示「尚未綁定子女」（QA P2-15）', async () => {
    const w = mountWith(ONE_CHILD(), null)
    await flushPromises()
    expect(w.text()).not.toContain('尚未綁定子女')
    expect(card(w).exists()).toBe(true)
  })
})

describe('TodayView 區塊組成', () => {
  it('依序掛載狀態卡、常用功能、公告卡、待辦清單、娃娃車列；不再有頂部 banner、Bento 或 LINE 提示卡', async () => {
    const w = mountWith(
      ONE_CHILD({ me: { name: '王太太', can_push: false }, summary: { pending_event_acks: 3, pending_survey_count: 2 } }),
      today({ attendance: { status: '已入園' } }),
    )
    await flushPromises()
    const order = Array.from(
      w.element.querySelectorAll('[data-child-card], .qa-stub, .ann-home-card-stub, .home-todo-stub, .home-bus-stub'),
    ).map((el) => (el.hasAttribute('data-child-card') ? 'card' : el.className.replace('-stub', '')))
    expect(order).toEqual(['card', 'qa', 'ann-home-card', 'home-todo', 'home-bus'])
    expect(w.html()).not.toContain('pending-sign')
    expect(w.html()).not.toContain('pending-survey')
    expect(w.find('.today-bento').exists()).toBe(false)
    expect(w.find('.push-cta').exists()).toBe(false)
  })

  it('今日動態：單一孩子給「更多動態」直達孩子檔案；多寶家庭不給（避免連到錯的孩子）', async () => {
    const one = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    expect(one.find('a.cb-open').attributes('href')).toBe('/children/1')

    const two = mountWith(
      {
        children: [
          { student_id: 1, name: '小明' },
          { student_id: 2, name: '小華' },
        ],
        summary: {},
      },
      { children: [] },
    )
    await flushPromises()
    expect(two.find('a.cb-open').exists()).toBe(false)
  })

  it('下拉刷新：summary、聯絡簿與娃娃車列一起重抓', async () => {
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    contactBookMock.getTodayContactBook.mockClear()
    await w.vm.pullRefresh()
    expect(refreshSummaryMock).toHaveBeenCalledWith(true)
    expect(contactBookMock.getTodayContactBook).toHaveBeenCalledWith(1)
    expect(busReloadMock).toHaveBeenCalled()
  })
})

describe('TodayView 公告鈴鐺（2026-09-08）', () => {
  it('有未讀公告時鈴鐺帶紅點，沒有則不帶', async () => {
    const unread = mountWith(ONE_CHILD({ summary: { unread_announcements: 3 } }), today({}))
    await flushPromises()
    expect(unread.find('[data-testid="hh-bell-dot"]').exists()).toBe(true)

    const none = mountWith(ONE_CHILD({ summary: { unread_announcements: 0 } }), today({}))
    await flushPromises()
    expect(none.find('[data-testid="hh-bell-dot"]').exists()).toBe(false)
  })

  it('點擊鈴鐺導向 /announcements', async () => {
    const w = mountWith(ONE_CHILD({ summary: { unread_announcements: 1 } }), today({}))
    await flushPromises()
    await w.find('[data-testid="hh-bell"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/announcements')
  })
})
