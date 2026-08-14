import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'

// useCachedAsync 的 stub：直接給最新 data，pending=false、error=null
const summaryRef = ref(null)
vi.mock('@/composables/useCachedAsync', () => ({
  useCachedAsync: (_key, _fetcher, _opts) => ({
    data: summaryRef,
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  }),
}))

const todayStatusRef = ref(null)
const refreshTodayMock = vi.fn()
vi.mock('@/parent/composables/useTodayStatusCache', () => ({
  useTodayStatusCache: () => ({
    status: todayStatusRef,
    refresh: refreshTodayMock,
    markStale: vi.fn(),
  }),
}))

vi.mock('@/parent/composables/useTodayTimeline', () => ({
  useTodayTimeline: () => ({ buckets: ref([]) }),
}))

vi.mock('@/parent/api/profile', () => ({
  getHomeSummary: vi.fn().mockResolvedValue({ data: null }),
}))

vi.mock('@/parent/stores/parentAuth', () => ({
  useParentAuthStore: () => ({ setUser: vi.fn() }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// 連帶在 P1-16 加 immediate watch 後，每次 mount 都會打 contact-book API；
// 既存測試對「孩子今日狀態 hero」邏輯為主，這裡 mock 回 null entry 不影響該斷言。
const contactBookMock = vi.hoisted(() => ({
  getTodayContactBook: vi.fn().mockResolvedValue({ data: { entry: null } }),
}))
vi.mock('@/parent/api/contactBook', () => contactBookMock)

// 娃娃車入口卡：首頁 mount 時抓一次今日快照。預設回無班次（不渲染卡片），
// 個別測試以 busTodayMock.getBusToday.mockResolvedValueOnce 覆寫。
const busTodayMock = vi.hoisted(() => ({
  getBusToday: vi.fn().mockResolvedValue({
    data: { trip: null, position: null, stale: false, school: null, children: [] },
  }),
}))
vi.mock('@/parent/api/bus', () => busTodayMock)

import TodayView from '@/parent/views/TodayView.vue'

/**
 * 今日卡 stub。
 *
 * 2026-08-10 首頁重整後 hero 改由 ContactBookDayCard 三態承載
 * （DashboardHero 已從首頁退場），孩子姓名 / 班級 / 出席狀態都是它的 prop。
 * 舊測試斷言的 .today-hero / .today-note / .status-pill-stub 語意在此對應到
 * data-student-name / data-classroom / data-status-label。
 */
const ContactBookDayCardStub = {
  props: [
    'entry', 'studentName', 'classroomName',
    'variant', 'statusLabel', 'statusTone', 'dateLine', 'hint',
  ],
  template: `<div
    class="cb-card-stub"
    :data-entry-id="entry?.id"
    :data-student-name="studentName"
    :data-classroom="classroomName"
    :data-variant="variant"
    :data-status-label="statusLabel"
    :data-status-tone="statusTone"
    :data-hint="hint"
  ></div>`,
}

/** 讀今日卡上的出席狀態（等同舊 .status-pill-stub 的文字） */
function statusOf(w) {
  return w.find('.cb-card-stub').attributes('data-status-label')
}
/** 讀今日卡上的孩子姓名（等同舊 .today-hero 的文字） */
function heroNameOf(w) {
  return w.find('.cb-card-stub').attributes('data-student-name')
}

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
        ChildrenStrip: {
          props: ['children', 'selectedId'],
          emits: ['select', 'navigate'],
          template: '<div class="children-strip-stub" :data-count="children.length" :data-selected="selectedId"></div>',
        },
        ChildContextHeader: { props: ['variant'], template: '<div class="cch-stub" :data-variant="variant"></div>' },
        ContactBookDayCard: ContactBookDayCardStub,
        RouterLink: { template: '<a><slot /></a>', props: ['to'] },
        StatTile: {
          props: ['label', 'value', 'sub', 'icon', 'tone', 'to'],
          template: '<div class="stat-tile-stub" :data-label="label" :data-value="value" :data-tone="tone" :data-to="to"></div>',
        },
        SectionHeader: {
          props: ['title'],
          template: '<div class="section-header-stub" :data-title="title"><slot name="action" /></div>',
        },
        PendingSignBanner: { props: ['count'], template: '<div class="pending-sign-stub" :data-count="count"></div>' },
        PendingSurveyBanner: true,
        M3Card: { template: '<div class="m3-card-stub"><slot /></div>' },
      },
    },
  })
}

describe('TodayView hero - 以孩子今日狀態為主角', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    summaryRef.value = null
    todayStatusRef.value = null
    // 鎖定為平日（週四）避免「今天放假」分支干擾單一孩子相關測試
    vi.setSystemTime(new Date('2026-05-14T09:30:00+08:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('單一孩子在園：今日卡帶孩子姓名、班級與出席狀態', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', attendance: { status: '已入園' } }] },
    )
    await flushPromises()

    expect(heroNameOf(w)).toBe('小明')
    expect(w.find('.cb-card-stub').attributes('data-classroom')).toBe('太陽班')
    expect(statusOf(w)).toBe('已入園')
    expect(w.find('.cb-card-stub').attributes('data-status-tone')).toBe('ok')
  })

  it('單一孩子在園但 status 為「遲到」：今日卡顯示「遲到」（保留 backend 細節）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', attendance: { status: '遲到' } }] },
    )
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(statusOf(w)).toBe('遲到')
  })

  it('單一孩子在園但 attendance 無 status 欄位：fallback 為「在園中」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: {} }] },
    )
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(statusOf(w)).toBe('在園中')
  })

  it('單一孩子請假：今日卡顯示「請假」且走 offday 態', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', leave: { type: '事假' } }] },
    )
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(statusOf(w)).toBe('請假')
    expect(w.find('.cb-card-stub').attributes('data-status-tone')).toBe('info')
    // 請假有專屬文案，不套用「今天放假，好好休息」
    expect(w.find('.cb-card-stub').attributes('data-variant')).toBe('offday')
    expect(w.find('.cb-card-stub').attributes('data-hint')).toBe('今天請假，好好休息')
  })

  it('單一孩子尚未到校：今日卡顯示「尚未到校」且走 awaiting 態', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }] },
    )
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(statusOf(w)).toBe('尚未到校')
    expect(w.find('.cb-card-stub').attributes('data-variant')).toBe('awaiting')
  })

  it('單一孩子已離園：今日卡顯示「已離園」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' }, dismissal: { status: 'completed' } }] },
    )
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(statusOf(w)).toBe('已離園')
    expect(w.find('.cb-card-stub').attributes('data-status-tone')).toBe('ok')
  })

  it('多孩子：hero 渲染 ChildContextHeader（hero variant）+ ChildrenStrip 接力，不再顯示「今天 N 位」聚合文案', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }, { student_id: 2, name: '小華' }], summary: {} },
      { children: [
        { student_id: 1, name: '小明', attendance: { status: '已入園' } },
        { student_id: 2, name: '小華', leave: { type: '病假' } },
      ] },
    )
    await flushPromises()
    // 新行為：hero 區渲染 ChildContextHeader stub variant=hero
    expect(w.find('.cch-stub[data-variant="hero"]').exists()).toBe(true)
    // 不再有「今天 N 位」聚合文案
    expect(w.text()).not.toContain('今天 2 位小朋友')
    // ChildrenStrip 接力顯示
    expect(w.find('.children-strip-stub').exists()).toBe(true)
    expect(w.find('.children-strip-stub').attributes('data-count')).toBe('2')
  })

  it('尚未綁定子女：走 EmptyState 空狀態，不渲染今日卡', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [], summary: {} },
      { children: [] },
    )
    await flushPromises()
    expect(w.text()).toContain('尚未綁定子女')
    expect(w.text()).toContain('加綁')
    expect(w.find('.cb-card-stub').exists()).toBe(false)
  })

  it('有綁定子女但今日狀態尚未就緒：不誤顯示「尚未綁定子女」（QA P2-15）', async () => {
    const w = mountWith(
      // home-summary 已確認有綁定子女，但 today-status 為空（放假/尚未載入）
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [] },
    )
    await flushPromises()
    // 絕不可據 today-status 空而誤報「尚未綁定子女」。
    // 重整後這種情況仍渲染今日卡（awaiting/offday 態），而不是隱藏 hero。
    expect(w.text()).not.toContain('尚未綁定子女')
    expect(w.find('.cb-card-stub').exists()).toBe(true)
    expect(heroNameOf(w)).toBe('小明')
  })

  it('不再顯示樣板問候語（晚安/早安/午安/下午好）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    const head = w.find('.today-head').text()
    expect(head).not.toMatch(/晚安|早安|午安|下午好|夜深了/)
    expect(head).not.toContain('王太太')
  })

  it('不再顯示 IA migration banner（公告／出席已移至底部）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    expect(w.html()).not.toContain('ia-banner')
    expect(w.text()).not.toContain('公告')
  })

  it('週末單一孩子無 attendance：顯示「今天放假」而非「尚未到校」', async () => {
    vi.setSystemTime(new Date('2026-05-16T10:00:00+08:00')) // 星期六
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }] },
    )
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(statusOf(w)).toBe('今天放假')
    expect(w.find('.cb-card-stub').attributes('data-variant')).toBe('offday')
  })

  it('週日單一孩子無 attendance：顯示「今天放假」，用預設休息文案', async () => {
    vi.setSystemTime(new Date('2026-05-17T10:00:00+08:00')) // 星期日
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明' }] },
    )
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(statusOf(w)).toBe('今天放假')
    // 放假不覆寫 hint，由卡片自己套「今天放假，好好休息」
    expect(w.find('.cb-card-stub').attributes('data-hint')).toBe('')
  })

  it('日期行顯示「N 月 N 日　星期X」格式（非 weekday-uppercase 樣板）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    const dateText = w.find('.today-date').text()
    expect(dateText).toMatch(/\d+ 月 \d+ 日.*星期[日一二三四五六]/)
    // 不再是 letterspace uppercase eyebrow
    expect(dateText).not.toMatch(/SUNDAY|MONDAY|MON|TUE|WED|星期\s*[A-Z]/)
  })
})

describe('TodayView 聯絡簿 hero card — cache hit 也要顯示（P1-16）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    summaryRef.value = null
    todayStatusRef.value = null
    vi.setSystemTime(new Date('2026-05-14T09:30:00+08:00'))
    contactBookMock.getTodayContactBook.mockReset()
    contactBookMock.getTodayContactBook.mockResolvedValue({
      data: { entry: { id: 77, mood: 'happy', teacher_note: '今天表現很棒' } },
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * 真正能重現 P1-16 的場景：
   *   useCachedAsync 命中 cache → children 立刻有值
   *   selectedStudentId 也已從 sessionStorage 還原成同一個 id（多孩家庭跨頁切換）
   *
   *   原本 watch(() => children.value?.length) 不會 fire（length 未變）
   *   watch(selectedStudentId) 也不會 fire（id 未變）
   *   → loadContactBook 永遠沒被呼叫，hero 卡消失
   *
   * 修補後（onMounted 直接 loadContactBook）：API 仍會被呼叫、hero render。
   */
  it('cache-hit 且 selectedStudentId 與 children 同步：仍 fire contact-book fetch 並 render hero', async () => {
    // 模擬上一頁已 ensureSelected 過 selectedId=1（同 module-level ref 跨測殘留）
    // 為穩健，使用 mock 取代 useChildSelection 避免狀態漏到此 describe 影響邏輯
    const { useChildSelection: real } = await import('@/parent/composables/useChildSelection')
    real() // 觸發初始化
    // 確保起始 selectedId 為 1（模擬已選好小明）
    vi.spyOn(JSON, 'parse') // 占位，避免 lint
    const mod = await import('@/parent/composables/useChildSelection')
    // 直接讀導出的 selectedId 來設值
    const { selectedId } = mod.useChildSelection()
    selectedId.value = 1

    summaryRef.value = {
      me: { name: '王太太' },
      children: [{ student_id: 1, name: '小明' }],
      summary: {},
    }
    todayStatusRef.value = {
      children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }],
    }

    const w = mountWith(summaryRef.value, todayStatusRef.value)
    await flushPromises()

    // 必須有打 contact-book API（修補前 cache-hit 不會 fire watch）
    expect(contactBookMock.getTodayContactBook).toHaveBeenCalledWith(1)
    // hero card section 必須存在
    expect(w.find('.cb-hero').exists()).toBe(true)
    expect(w.find('.cb-card-stub').exists()).toBe(true)
    expect(w.find('.cb-card-stub').attributes('data-entry-id')).toBe('77')
  })
})

describe('TodayView Bento 儀表板 — StatTile 依 summary 條件渲染', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    summaryRef.value = null
    todayStatusRef.value = null
    vi.setSystemTime(new Date('2026-05-14T09:30:00+08:00'))
    contactBookMock.getTodayContactBook.mockReset()
    contactBookMock.getTodayContactBook.mockResolvedValue({ data: { entry: null } })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('mount 後不拋例外、今日卡存在（render smoke）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    expect(w.find('.cb-card-stub').exists()).toBe(true)
  })

  it('summary.fees.outstanding_count > 0：渲染待繳學費 StatTile（tone=amber, to=/fees）', async () => {
    const w = mountWith(
      {
        me: { name: '王太太' },
        children: [{ student_id: 1, name: '小明' }],
        summary: { fees: { outstanding_count: 2, outstanding: 8000, overdue: 0 } },
      },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    const feeTile = w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '待繳學費')
    expect(feeTile).toBeTruthy()
    expect(feeTile.attributes('data-tone')).toBe('amber')
    expect(feeTile.attributes('data-to')).toBe('/fees')
    expect(feeTile.attributes('data-value')).toBe('2 筆')
  })

  it('pending_event_acks > 0：渲染待簽文件 StatTile（tone=coral, to=/events）', async () => {
    const w = mountWith(
      {
        me: { name: '王太太' },
        children: [{ student_id: 1, name: '小明' }],
        summary: { pending_event_acks: 3 },
      },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    const signTile = w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '待簽文件')
    expect(signTile).toBeTruthy()
    expect(signTile.attributes('data-tone')).toBe('coral')
    expect(signTile.attributes('data-to')).toBe('/events')
    expect(signTile.attributes('data-value')).toBe('3 份')
  })

  it('summary 無學費欄位：不渲染待繳學費 StatTile', async () => {
    const w = mountWith(
      {
        me: { name: '王太太' },
        children: [{ student_id: 1, name: '小明' }],
        summary: {},
      },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    const feeTile = w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '待繳學費')
    expect(feeTile).toBeFalsy()
  })

  it('summary.fees.outstanding_count = 0：不渲染待繳學費 StatTile', async () => {
    const w = mountWith(
      {
        me: { name: '王太太' },
        children: [{ student_id: 1, name: '小明' }],
        summary: { fees: { outstanding_count: 0, outstanding: 0, overdue: 0 } },
      },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    const feeTile = w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '待繳學費')
    expect(feeTile).toBeFalsy()
  })

  it('pending_event_acks = 0：不渲染待簽文件 StatTile', async () => {
    const w = mountWith(
      {
        me: { name: '王太太' },
        children: [{ student_id: 1, name: '小明' }],
        summary: { pending_event_acks: 0 },
      },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    const signTile = w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '待簽文件')
    expect(signTile).toBeFalsy()
  })
})

describe('TodayView 娃娃車入口卡', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    summaryRef.value = null
    todayStatusRef.value = null
    vi.setSystemTime(new Date('2026-05-14T09:30:00+08:00'))
    busTodayMock.getBusToday.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const HOME = [
    { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
    { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
  ]

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

  it('班次進行中：顯示娃娃車 StatTile 並連到 /bus', async () => {
    busTodayMock.getBusToday.mockResolvedValueOnce(inProgressBus())
    const w = mountWith(...HOME)
    await flushPromises()
    const tile = w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '娃娃車')
    expect(tile).toBeTruthy()
    expect(tile.attributes('data-value')).toBe('還有 2 站')
    expect(tile.attributes('data-to')).toBe('/bus')
  })

  it('已上車：顯示進行中而非站數', async () => {
    const resp = inProgressBus()
    resp.data.children[0].stop_status = 'departed'
    resp.data.children[0].stops_ahead = 0
    busTodayMock.getBusToday.mockResolvedValueOnce(resp)
    const w = mountWith(...HOME)
    await flushPromises()
    const tile = w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '娃娃車')
    expect(tile.attributes('data-value')).toBe('進行中')
  })

  it('班次未進行中：不渲染娃娃車卡', async () => {
    const resp = inProgressBus()
    resp.data.trip.status = 'completed'
    busTodayMock.getBusToday.mockResolvedValueOnce(resp)
    const w = mountWith(...HOME)
    await flushPromises()
    expect(w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '娃娃車')).toBeFalsy()
  })

  it('有待繳學費但今天沒有娃娃車班次：bento 出現但不得有空白娃娃車卡', async () => {
    // 外層 .today-bento 的 v-if 會因為 feesInfo 有值而成立，內層 StatTile 必須自己擋住，
    // 否則會渲染出 value 空白卻連到 /bus 的卡片。
    busTodayMock.getBusToday.mockResolvedValueOnce({
      data: { trip: null, position: null, stale: false, school: null, children: [] },
    })
    const w = mountWith(
      {
        me: { name: '王太太' },
        children: [{ student_id: 1, name: '小明' }],
        summary: { fees: { outstanding_count: 2, outstanding: 3000, overdue: 0 } },
      },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    expect(w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '待繳學費')).toBeTruthy()
    expect(w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '娃娃車')).toBeFalsy()
  })

  it('娃娃車快照失敗不得擋住首頁其他區塊', async () => {
    busTodayMock.getBusToday.mockRejectedValueOnce(new Error('boom'))
    const w = mountWith(...HOME)
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(w.findAll('.stat-tile-stub').find(el => el.attributes('data-label') === '娃娃車')).toBeFalsy()
  })

  it('站點座標（家庭住址）不得進入首頁畫面', async () => {
    busTodayMock.getBusToday.mockResolvedValueOnce(inProgressBus())
    const w = mountWith(...HOME)
    await flushPromises()
    expect(w.html()).not.toContain('22.61')
    expect(w.html()).not.toContain('120.28')
  })
})

describe('TodayView 預告接送 CTA（pnotice01）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    summaryRef.value = null
    todayStatusRef.value = null
    vi.setSystemTime(new Date('2026-05-14T09:30:00+08:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const SUMMARY = {
    me: { name: '王太太' },
    children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }],
    summary: {},
  }

  it('選中孩子無進行中預告：顯示「我要接小孩」導向 /pickup-notice', async () => {
    const w = mountWith(SUMMARY, {
      children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', attendance: { status: '已入園' } }],
    })
    await flushPromises()
    const cta = w.find('[data-testid="today-pickup-notice-cta"]')
    expect(cta.exists()).toBe(true)
    expect(cta.text()).toContain('我要接小孩')
  })

  it('家長預告進行中：CTA 改為查看文案（同一資料源，不出現矛盾卡）', async () => {
    const w = mountWith(SUMMARY, {
      children: [{
        student_id: 1, name: '小明', classroom_name: '太陽班',
        attendance: { status: '已入園' },
        dismissal: { id: 9, status: 'pending', request_source: 'parent', requested_at: '2026-05-14T09:00:00', expected_arrival_at: '2026-05-14T09:20:00', arrived_at: null },
      }],
    })
    await flushPromises()
    const cta = w.find('[data-testid="today-pickup-notice-cta"]')
    expect(cta.exists()).toBe(true)
    expect(cta.text()).toContain('預告接送進行中')
    expect(cta.text()).not.toContain('我要接小孩')
  })

  it('已離園（dismissal completed）：CTA 隱藏', async () => {
    const w = mountWith(SUMMARY, {
      children: [{
        student_id: 1, name: '小明', classroom_name: '太陽班',
        attendance: { status: '已入園' },
        dismissal: { id: 9, status: 'completed', request_source: 'parent', requested_at: '2026-05-14T09:00:00' },
      }],
    })
    await flushPromises()
    expect(w.find('[data-testid="today-pickup-notice-cta"]').exists()).toBe(false)
  })
})
