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

import TodayView from '@/parent/views/TodayView.vue'

/**
 * DashboardHero stub：以 .today-hero（title）與 .today-note（sub）渲染，
 * 保留舊測試斷言目標；同時暴露 data-status-label / data-status-tone 供新斷言。
 */
const DashboardHeroStub = {
  props: ['eyebrow', 'title', 'value', 'sub', 'statusLabel', 'statusTone'],
  template: `<div class="dash-hero-stub">
    <h2 class="today-hero">{{ title }}</h2>
    <p v-if="sub" class="today-note">{{ sub }}</p>
    <span v-if="statusLabel" class="status-pill-stub" :data-tone="statusTone">{{ statusLabel }}</span>
  </div>`,
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
        ContactBookDayCard: { props: ['entry', 'studentName', 'classroomName'], template: '<div class="cb-card-stub" :data-entry-id="entry?.id"></div>' },
        RouterLink: { template: '<a><slot /></a>', props: ['to'] },
        DashboardHero: DashboardHeroStub,
        StatTile: {
          props: ['label', 'value', 'sub', 'icon', 'tone', 'to'],
          template: '<div class="stat-tile-stub" :data-label="label" :data-value="value" :data-tone="tone" :data-to="to"></div>',
        },
        SectionHeader: {
          props: ['title'],
          template: '<div class="section-header-stub" :data-title="title"><slot name="action" /></div>',
        },
        PendingSignBanner: { props: ['count'], template: '<div class="pending-sign-stub" :data-count="count"></div>' },
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

  it('單一孩子在園：DashboardHero title 為孩子姓名、sub 為班級、StatusPill 顯示出席狀態', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', attendance: { status: '已入園' } }] },
    )
    await flushPromises()

    // title = 孩子姓名
    expect(w.find('.today-hero').text()).toBe('小明')
    // sub = 班級
    expect(w.find('.today-note').text()).toContain('太陽班')
    // statusLabel = 出席狀態（delivered via StatusPill）
    expect(w.find('.status-pill-stub').text()).toBe('已入園')
    expect(w.find('.status-pill-stub').attributes('data-tone')).toBe('ok')
  })

  it('單一孩子在園但 status 為「遲到」：StatusPill 顯示「遲到」（保留 backend 細節）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', attendance: { status: '遲到' } }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('小明')
    expect(w.find('.status-pill-stub').text()).toBe('遲到')
  })

  it('單一孩子在園但 attendance 無 status 欄位：StatusPill fallback 為「在園中」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: {} }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('小明')
    expect(w.find('.status-pill-stub').text()).toBe('在園中')
  })

  it('單一孩子請假：title 為孩子姓名、StatusPill 顯示「請假」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', leave: { type: '事假' } }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('小明')
    expect(w.find('.status-pill-stub').text()).toBe('請假')
    expect(w.find('.status-pill-stub').attributes('data-tone')).toBe('info')
  })

  it('單一孩子尚未到校：title 為孩子姓名、StatusPill 顯示「尚未到校」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('小明')
    expect(w.find('.status-pill-stub').text()).toBe('尚未到校')
  })

  it('單一孩子已離園：title 為孩子姓名、StatusPill 顯示「已離園」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' }, dismissal: { status: 'completed' } }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('小明')
    expect(w.find('.status-pill-stub').text()).toBe('已離園')
    expect(w.find('.status-pill-stub').attributes('data-tone')).toBe('ok')
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

  it('尚未綁定子女：DashboardHero 顯示空狀態文案', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [], summary: {} },
      { children: [] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('尚未綁定子女')
    expect(w.find('.today-note').text()).toContain('加綁')
  })

  it('有綁定子女但今日狀態尚未就緒：不誤顯示「尚未綁定子女」（QA P2-15）', async () => {
    const w = mountWith(
      // home-summary 已確認有綁定子女，但 today-status 為空（放假/尚未載入）
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [] },
    )
    await flushPromises()
    // hero 應為 null（隱藏），絕不可據 today-status 空而誤報「尚未綁定子女」
    expect(w.find('.today-hero').exists()).toBe(false)
    expect(w.text()).not.toContain('尚未綁定子女')
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

  it('週末單一孩子無 attendance：StatusPill 顯示「今天放假」而非「尚未到校」', async () => {
    vi.setSystemTime(new Date('2026-05-16T10:00:00+08:00')) // 星期六
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('小明')
    expect(w.find('.status-pill-stub').text()).toBe('今天放假')
  })

  it('週日單一孩子無 attendance：StatusPill 顯示「今天放假」', async () => {
    vi.setSystemTime(new Date('2026-05-17T10:00:00+08:00')) // 星期日
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明' }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('小明')
    expect(w.find('.status-pill-stub').text()).toBe('今天放假')
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

  it('mount 後不拋例外、DashboardHero stub 存在（render smoke）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    expect(w.find('.dash-hero-stub').exists()).toBe(true)
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
