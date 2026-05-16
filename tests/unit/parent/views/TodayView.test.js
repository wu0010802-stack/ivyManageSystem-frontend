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
        ChildrenStrip: { props: ['children'], template: '<div class="children-strip-stub" :data-count="children.length"></div>' },
        LaurelWreath: true,
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

  it('單一孩子在園：hero 顯示 attendance.status + 孩子名・班級', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', attendance: { status: '已入園' } }] },
    )
    await flushPromises()

    expect(w.find('.today-hero').text()).toBe('已入園')
    expect(w.find('.today-note').text()).toContain('小明')
    expect(w.find('.today-note').text()).toContain('太陽班')
  })

  it('單一孩子在園但 status 為「遲到」：hero 顯示「遲到」（保留 backend 細節）', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', attendance: { status: '遲到' } }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('遲到')
  })

  it('單一孩子在園但 attendance 無 status 欄位：fallback 為「在園中」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: {} }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('在園中')
  })

  it('單一孩子請假：hero 顯示「請假」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班', leave: { type: '事假' } }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('請假')
  })

  it('單一孩子尚未到校：hero 顯示「尚未到校」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('尚未到校')
  })

  it('單一孩子已離園：hero 顯示「已離園」', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', attendance: { status: '已入園' }, dismissal: { status: 'completed' } }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('已離園')
  })

  it('多孩子：hero 顯示「今天 N 位小朋友」，ChildrenStrip 接力', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }, { student_id: 2, name: '小華' }], summary: {} },
      { children: [
        { student_id: 1, name: '小明', attendance: { status: '已入園' } },
        { student_id: 2, name: '小華', leave: { type: '病假' } },
      ] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('今天 2 位小朋友')
    expect(w.find('.children-strip-stub').attributes('data-count')).toBe('2')
  })

  it('尚未綁定子女：hero 顯示空狀態文案', async () => {
    const w = mountWith(
      { me: { name: '王太太' }, children: [], summary: {} },
      { children: [] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('尚未綁定子女')
    expect(w.find('.today-note').text()).toContain('加綁')
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

  it('週末單一孩子無 attendance：hero 顯示「今天放假」而非「尚未到校」', async () => {
    vi.setSystemTime(new Date('2026-05-16T10:00:00+08:00')) // 星期六
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明', classroom_name: '太陽班' }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('今天放假')
  })

  it('週日單一孩子無 attendance：hero 顯示「今天放假」', async () => {
    vi.setSystemTime(new Date('2026-05-17T10:00:00+08:00')) // 星期日
    const w = mountWith(
      { me: { name: '王太太' }, children: [{ student_id: 1, name: '小明' }], summary: {} },
      { children: [{ student_id: 1, name: '小明' }] },
    )
    await flushPromises()
    expect(w.find('.today-hero').text()).toBe('今天放假')
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
