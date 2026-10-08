/**
 * 家長首頁（2026-10-08 改版，方向 A＋C）。
 *
 * 結構：問候列 → 每位孩子一張狀態卡（多寶並列）→ 進行中 → 待你處理 → 常用 →
 * 今日動態。ChildTodayCard / PendingInbox 用真元件掛載（它們就是首頁的主角），
 * 時間軸、常用功能列、推播 CTA 等各有專屬測試，這裡 stub 掉。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

// useCachedAsync 依 key 分流：summary 給測試控制的 summaryRef，兩支輔助計數各自一個 ref
const summaryRef = ref(null)
const enrollDocsRef = ref(0)
const pickupActiveRef = ref(0)
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: (key) => {
    if (key === 'parent/pending/enroll-docs') {
      return { data: enrollDocsRef, error: ref(null), pending: ref(false), refresh: vi.fn() }
    }
    if (key === 'parent/pending/pickup-active') {
      return { data: pickupActiveRef, error: ref(null), pending: ref(false), refresh: vi.fn() }
    }
    return { data: summaryRef, error: ref(null), pending: ref(false), refresh: vi.fn() }
  },
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
vi.mock('@/parent/api/signDocuments', () => ({ listMySignRequests: vi.fn() }))
vi.mock('@/parent/api/pickup', () => ({ listPickupAuthorizations: vi.fn() }))
vi.mock('@/parent/api/childPhotos', () => ({
  fetchChildPhotos: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

const pushMock = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))

const contactBookMock = vi.hoisted(() => ({
  getTodayContactBook: vi.fn().mockResolvedValue({ data: { entry: null } }),
}))
vi.mock('@/parent/api/contactBook', () => contactBookMock)

// 娃娃車：預設無班次；個別測試以 mockResolvedValueOnce 覆寫
const busTodayMock = vi.hoisted(() => ({
  getBusToday: vi.fn().mockResolvedValue({
    data: { trip: null, position: null, stale: false, school: null, children: [] },
  }),
}))
vi.mock('@/parent/api/bus', () => busTodayMock)

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
        PushCta: true,
        QuickActionsBar: { template: '<div class="qa-stub"></div>' },
        HomeHeroHeader: { template: '<div class="hh-stub"></div>' },
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
  enrollDocsRef.value = 0
  pickupActiveRef.value = 0
  pushMock.mockClear()
  selectionMock.setSelected.mockClear()
  selectionMock.ensureSelected.mockClear()
  contactBookMock.getTodayContactBook.mockReset()
  contactBookMock.getTodayContactBook.mockResolvedValue({ data: { entry: null } })
  busTodayMock.getBusToday.mockClear()
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
  it('home-summary 子女清單為空：顯示加綁入口，不渲染狀態卡與待辦', async () => {
    const w = mountWith({ me: { name: '王太太' }, children: [], summary: {} }, { children: [] })
    await flushPromises()
    expect(w.text()).toContain('尚未綁定子女')
    expect(w.find('a[href="/bind-additional"]').exists()).toBe(true)
    // 舊文案指向已不存在的「右上角個人選單」
    expect(w.text()).not.toContain('右上角')
    expect(w.findAll('[data-child-card]').length).toBe(0)
    expect(w.text()).not.toContain('待你處理')
  })

  it('有綁定子女但今日狀態尚未就緒：不誤顯示「尚未綁定子女」（QA P2-15）', async () => {
    const w = mountWith(ONE_CHILD(), null)
    await flushPromises()
    expect(w.text()).not.toContain('尚未綁定子女')
    expect(card(w).exists()).toBe(true)
  })
})

describe('TodayView 待你處理', () => {
  it('summary 有待辦：列在「待你處理」，不再有頂部 banner 或 Bento 小卡', async () => {
    const w = mountWith(
      ONE_CHILD({ summary: { fees: { outstanding_count: 1, outstanding: 3000, overdue: 0 }, pending_event_acks: 1 } }),
      today({ attendance: { status: '已入園' } }),
    )
    await flushPromises()
    const keys = w.findAll('[data-pending]').map((n) => n.attributes('data-pending'))
    expect(keys).toEqual(['acks', 'fees'])
    expect(w.find('.pending-sign-banner').exists()).toBe(false)
    expect(w.find('.today-bento').exists()).toBe(false)
  })

  it('超過 3 項：只露前 3 項，並給「查看全部」導去待辦 tab', async () => {
    enrollDocsRef.value = 1
    const w = mountWith(
      ONE_CHILD({
        summary: {
          fees: { outstanding_count: 1, outstanding: 3000, overdue: 3000 },
          pending_event_acks: 1,
          pending_survey_count: 1,
          unread_announcements: 2,
        },
      }),
      today({ attendance: { status: '已入園' } }),
    )
    await flushPromises()
    expect(w.findAll('[data-pending]').map((n) => n.attributes('data-pending'))).toEqual(['fees', 'acks', 'enrollDocs'])
    const more = w.find('a.pi-more')
    expect(more.attributes('href')).toBe('/admin')
    expect(more.text()).toBe('查看全部')
  })

  it('沒有待辦：顯示安心文案', async () => {
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    expect(w.text()).toContain('目前沒有要處理的事')
  })
})

describe('TodayView 進行中：娃娃車與臨時接送', () => {
  const inProgressBus = () => ({
    data: {
      trip: { id: 7, direction: 'morning', status: 'in_progress', auto_closed: false },
      position: { lat: 22.63, lng: 120.3, at: '2026-05-14T09:29:00' },
      stale: false,
      school: { lat: 22.6, lng: 120.29 },
      children: [{
        student_id: 1, student_name: '小明', stop_status: 'pending',
        stops_ahead: 2, stop_lat: 22.61, stop_lng: 120.28,
      }],
    },
  })

  it('班次進行中：列出娃娃車並連到 /bus', async () => {
    busTodayMock.getBusToday.mockResolvedValueOnce(inProgressBus())
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    const bus = w.find('[data-pending="bus"]')
    expect(bus.text()).toContain('還有 2 站')
    expect(bus.attributes('href')).toBe('/bus')
  })

  it('已上車：顯示班次進行中而非站數', async () => {
    const resp = inProgressBus()
    resp.data.children[0].stop_status = 'departed'
    busTodayMock.getBusToday.mockResolvedValueOnce(resp)
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    expect(w.find('[data-pending="bus"]').text()).toContain('班次進行中')
    expect(w.find('[data-pending="bus"]').text()).not.toContain('站')
  })

  it('班次未進行中、也沒有接送授權：不渲染「進行中」', async () => {
    const resp = inProgressBus()
    resp.data.trip.status = 'completed'
    busTodayMock.getBusToday.mockResolvedValueOnce(resp)
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    expect(w.find('[data-pending="bus"]').exists()).toBe(false)
    expect(w.find('section[aria-label="進行中"]').exists()).toBe(false)
  })

  it('有進行中的臨時接送授權：列出並連到 /pickup', async () => {
    pickupActiveRef.value = 1
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    const pickup = w.find('[data-pending="pickupAuth"]')
    expect(pickup.text()).toContain('1 筆授權進行中')
    expect(pickup.attributes('href')).toBe('/pickup')
  })

  it('娃娃車快照失敗不得擋住首頁其他區塊', async () => {
    busTodayMock.getBusToday.mockRejectedValueOnce(new Error('boom'))
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    expect(statusOf(w)).toBe('在園中')
    expect(w.find('[data-pending="bus"]').exists()).toBe(false)
  })

  it('站點座標（家庭住址）不得進入首頁畫面', async () => {
    busTodayMock.getBusToday.mockResolvedValueOnce(inProgressBus())
    const w = mountWith(ONE_CHILD(), today({ attendance: { status: '已入園' } }))
    await flushPromises()
    expect(w.html()).not.toContain('22.61')
    expect(w.html()).not.toContain('120.28')
  })
})
