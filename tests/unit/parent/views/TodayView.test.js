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
  // FE-PARENT-04：「今天不搭」入口的載入路徑。不列出來的話 vitest 會在**呼叫時**
  // 丟「No "getRideCancellations" export is defined on the mock」，被
  // `loadRideCancellations()` 的 catch 吞掉——本檔是首頁 bento 顯示條件的主測試檔，
  // 那樣等於整條新路徑都沒被覆蓋，之後改壞也不會變紅。
  getRideCancellations: vi.fn().mockResolvedValue({
    data: { date: '2026-08-26', children: [] },
  }),
  createRideCancellation: vi.fn(),
  revokeRideCancellation: vi.fn(),
}))
vi.mock('@/parent/api/bus', () => busTodayMock)

// 常用功能列（quickact01）：QuickActionsBar 掛載時自己打 /parent/quick-actions，
// 這裡不是測試重點，mock 回預設三格避免真的打網路。
vi.mock('@/parent/api/quickActions', () => ({
  getQuickActions: vi.fn().mockResolvedValue({
    data: { slots: ['pickup', 'proxy', 'announce'], is_default: true },
  }),
  updateQuickActions: vi.fn().mockResolvedValue({ data: {} }),
}))

// HomeHeroHeader：一樣掛載時自己打 /parent/photos，非本檔測試重點。
vi.mock('@/parent/api/childPhotos', () => ({
  fetchChildPhotos: vi.fn().mockResolvedValue({ data: { items: [] } }),
}))

import TodayView from '@/parent/views/TodayView.vue'

/**
 * 出席狀態 / 孩子姓名的斷言來源。
 *
 * 2026-08-10 首頁重整後 hero 一度改由 ContactBookDayCard 三態承載；
 * 2026-08-16 首頁再改版（quickact01）後，孩子姓名/日期/班級搬到
 * HomeHeroHeader（.hh-name / .hh-meta），出席狀態搬到 QuickActionsBar
 * 聯絡簿大按鈕上的 pill（.qa-cb-pill）——ContactBookDayCard 那張獨立
 * 「今日聯絡簿」hero 卡本身因與這兩者重複，已整塊移除（見 TodayView.vue）。
 */

/** 讀出席狀態（等同舊 .status-pill-stub 的文字） */
function statusOf(w) {
  return w.find('.qa-cb-pill').text()
}
/** 讀孩子姓名（等同舊 .today-hero 的文字） */
function heroNameOf(w) {
  return w.find('.hh-name').text()
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
        RouterLink: { template: '<a :href="to"><slot /></a>', props: ['to'] },
        SectionHeader: {
          props: ['title'],
          template: '<div class="section-header-stub" :data-title="title"><slot name="action" /></div>',
        },
        HomeTodoList: { template: '<div class="home-todo-stub"></div>' },
        HomeBusRow: { template: '<div class="home-bus-stub"></div>' },
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

  it('單一孩子在園：頁面帶孩子姓名、班級與出席狀態', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', attendance: { status: '已入園' } }] },
    )
    await flushPromises()

    expect(heroNameOf(w)).toBe('小明')
    expect(w.find('.hh-meta').text()).toContain('太陽班')
    expect(statusOf(w)).toBe('已入園')
    expect(w.find('.qa-cb-pill').classes()).toContain('tone-ok')
  })

  it('單一孩子在園但 status 為「遲到」：出席狀態 pill 顯示「遲到」（保留 backend 細節）', async () => {
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

  it('單一孩子請假：出席狀態 pill 顯示「請假」且聯絡簿副標套 offday 文案', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', leave: { type: '事假' } }] },
    )
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(statusOf(w)).toBe('請假')
    expect(w.find('.qa-cb-pill').classes()).toContain('tone-info')
    // 請假走 offday 態，聯絡簿副標有專屬文案，不套用「今天放假」的字樣
    expect(w.find('.qa-cb-sub').text()).toBe('今天請假，暫無紀錄')
  })

  it('單一孩子尚未到校：出席狀態 pill 顯示「尚未到校」，聯絡簿副標走 awaiting 文案', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }] },
    )
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(statusOf(w)).toBe('尚未到校')
    expect(w.find('.qa-cb-sub').text()).toBe('老師還沒有寫今天的紀錄')
  })

  it('單一孩子已離園：出席狀態 pill 顯示「已離園」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' }, dismissal: { status: 'completed' } }] },
    )
    await flushPromises()
    expect(heroNameOf(w)).toBe('小明')
    expect(statusOf(w)).toBe('已離園')
    expect(w.find('.qa-cb-pill').classes()).toContain('tone-ok')
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

  it('尚未綁定子女：走 EmptyState 空狀態，不渲染孩子 hero 區', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [], summary: {} },
      { children: [] },
    )
    await flushPromises()
    expect(w.text()).toContain('尚未綁定子女')
    expect(w.text()).toContain('加綁')
    expect(w.find('.hh-name').exists()).toBe(false)
    expect(w.find('.qa-cb-bar').exists()).toBe(false)
  })

  it('有綁定子女但今日狀態尚未就緒：不誤顯示「尚未綁定子女」（QA P2-15）', async () => {
    const w = mountWith(
      // home-summary 已確認有綁定子女，但 today-status 為空（放假/尚未載入）
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [] },
    )
    await flushPromises()
    // 絕不可據 today-status 空而誤報「尚未綁定子女」。
    // 重整後這種情況仍渲染孩子 hero 區（awaiting/offday 態），而不是隱藏 hero。
    expect(w.text()).not.toContain('尚未綁定子女')
    expect(w.find('.hh-name').exists()).toBe(true)
    expect(heroNameOf(w)).toBe('小明')
  })

  // 2026-05-16（66093e97）拿掉的是「晚安, 王太太」樣板 hero——問候語當時是首頁
  // 主視覺、搶走孩子狀態的主角地位。2026-08-14 P3（M3 Expressive 改版 spec §6/§9）
  // 依 mockup 加回問候語，但份量降到最低：頂端一小行文字+插畫、不含家長稱謂。
  // 2026-08-16 首頁改版（quickact01）把問候語＋孩子照片／姓名合併成
  // HomeHeroHeader hero，份量比 P3 更重——這是使用者這次明確要的新方向，
  // 取代 2026-08-14 那次「份量降到最低」的裁定；家長稱謂本身仍不出現，是唯一
  // 延續的部分。問候語/日期細節斷言已搬到 HomeHeroHeader 自己的測試
  // （src/parent/components/home/__tests__/HomeHeroHeader.test.ts），
  // 這裡只留「不含家長稱謂」這條全頁級守則。
  it('頁面不含家長稱謂（王太太不應出現在首頁任何角落）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    expect(w.text()).not.toContain('王太太')
  })

  it('不再顯示 IA migration banner（舊版 class 不應出現）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    // 舊斷言曾含 `w.text()).not.toContain('公告')`：2026-08-16 常用功能列
    // （quickact01）讓「公告」成為合法的模組按鈕標籤，此頁本來就該顯示這兩個
    // 字，不再是回歸信號；改回單純守 IA migration banner 本身的 class。
    expect(w.html()).not.toContain('ia-banner')
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
    expect(w.find('.qa-cb-sub').text()).toBe('今天放假，暫無紀錄')
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
    // 放假（非請假）套一般休息文案，不誤用請假專屬那句
    expect(w.find('.qa-cb-sub').text()).toBe('今天放假，暫無紀錄')
  })

  // 2026-08-16 首頁改版（quickact01）：日期行搬進 HomeHeroHeader 的 .hh-meta，
  // 格式也從「N 月 N 日　星期X」改成「M/D · 星期X」（見該元件註解），
  // 但「星期」用中文全形字、不用英文縮寫的精神不變，這條斷言照舊保留。
  it('HomeHeroHeader 日期行顯示「M/D · 星期X」格式（非 weekday-uppercase 樣板）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' } }] },
    )
    await flushPromises()
    const dateText = w.find('.hh-meta').text()
    expect(dateText).toMatch(/\d+\/\d+ · 星期[日一二三四五六]/)
    // 不再是 letterspace uppercase eyebrow
    expect(dateText).not.toMatch(/SUNDAY|MONDAY|MON|TUE|WED|星期\s*[A-Z]/)
  })
})

describe('TodayView 聯絡簿狀態 — cache hit 也要正確反映（P1-16）', () => {
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
   *   → loadContactBook 永遠沒被呼叫，contactBookEntry 永遠是 null
   *
   * 修補後（onMounted 直接 loadContactBook）：API 仍會被呼叫，
   * QuickActionsBar 聯絡簿大按鈕的連結會反映拿到的 entry。
   */
  it('cache-hit 且 selectedStudentId 與 children 同步：仍 fire contact-book fetch 並反映到聯絡簿大按鈕', async () => {
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
    // 聯絡簿大按鈕必須連到拿到的 entry（id=77），而非退回列表頁
    const cbBar = w.find('.qa-cb-bar')
    expect(cbBar.exists()).toBe(true)
    expect(cbBar.attributes('href')).toBe('/contact-book/77')
    expect(w.find('.qa-cb-sub').text()).toBe('查看今天的完整紀錄')
  })
})

// 「我要接小孩」CTA（pnotice01 預告接送，獨立於今日聯絡簿卡的另一塊區域）
// 2026-08-16 業主裁定：與 QuickActionsBar 常用功能列的「接送」快捷模組
// （key=pickup，路由同為 /pickup-notice）重複，隨今日聯絡簿卡一併整塊移除
// （見 TodayView.vue）。相關測試（原「TodayView 預告接送 CTA」describe）
// 一併移除，不再保留。

describe('TodayView 區塊收斂（2026-09-02）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('不再渲染頂部待簽橫幅與活動調查橫幅', () => {
    const w = mountWith(
      { children: [{ student_id: 1, name: '小明' }], summary: { pending_event_acks: 3, pending_survey_count: 2 } },
      { children: [{ student_id: 1, name: '小明' }] },
    )
    expect(w.find('.pending-sign-stub').exists()).toBe(false)
    expect(w.html()).not.toContain('pending-survey')
  })

  it('不再渲染 bento 方格容器與 StatTile', () => {
    const w = mountWith(
      { children: [{ student_id: 1, name: '小明' }], summary: { fees: { outstanding_count: 2, outstanding: 100, overdue: 0 } } },
      { children: [{ student_id: 1, name: '小明' }] },
    )
    expect(w.find('.today-bento').exists()).toBe(false)
    expect(w.find('.stat-tile-stub').exists()).toBe(false)
  })

  it('渲染待辦清單與娃娃車列兩個子元件', () => {
    const w = mountWith(
      { children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明' }] },
    )
    expect(w.find('.home-todo-stub').exists()).toBe(true)
    expect(w.find('.home-bus-stub').exists()).toBe(true)
  })
})
