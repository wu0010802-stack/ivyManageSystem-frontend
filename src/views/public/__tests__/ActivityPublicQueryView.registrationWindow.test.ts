import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

// ── 模擬 vue-router（view 用 useRoute 取 query.token）──────────────────────
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

// ── 模擬 API ──────────────────────────────────────────────────────────────
vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
  publicQueryRegistration: vi.fn(),
  publicUpdateRegistration: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
  getPublicBootstrap: vi.fn().mockResolvedValue({
    data: { courses: [], supplies: [], classes: [], course_videos: {} },
  }),
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: {} }),
}))

import { publicQueryByToken, getPublicBootstrap } from '@/api/activityPublic'

vi.mock('@/utils/arrayUtils', () => ({
  toggleArrayItem: (arr: string[], item: string) => {
    const i = arr.indexOf(item)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(item)
  },
}))

// F5：報名時段守衛（前台「修改報名」頁）。截止後家長不應能再修改已送出的
// 報名資料——本檔驗證 close_at 過去/未來/48h 內三種情境的渲染分支，以及
// 付款鎖定優先於截止鎖定的判斷順序。

interface RegistrationTime {
  is_open?: boolean
  open_at?: string | null
  close_at?: string | null
}

function mockBootstrap({
  courses = [] as Array<{ name: string; price: number }>,
  supplies = [] as Array<{ name: string; price: number }>,
  classes = ['大班'],
  registration_time,
}: {
  courses?: Array<{ name: string; price: number }>
  supplies?: Array<{ name: string; price: number }>
  classes?: string[]
  registration_time?: RegistrationTime
} = {}) {
  vi.mocked(getPublicBootstrap).mockResolvedValue({
    data: { courses, supplies, classes, course_videos: {}, registration_time },
  })
}

const mountView = async (): Promise<VueWrapper> => {
  const ActivityPublicQueryView = (await import('../ActivityPublicQueryView.vue')).default
  return mount(ActivityPublicQueryView, {
    global: {
      stubs: ['router-link', 'router-view'],
    },
  })
}

async function triggerTokenQuery(wrapper: VueWrapper) {
  const tabs = wrapper.findAll('.mode-tab')
  await tabs[0].trigger('click')

  const vm = wrapper.vm as unknown as {
    queryForm: { token: string; parent_phone: string }
    $nextTick: () => Promise<void>
  }
  vm.queryForm.token = 'TESTTOKEN123'
  vm.queryForm.parent_phone = '0912345678'
  await vm.$nextTick()

  await wrapper.find('[data-test="query-submit"]').trigger('click')
  await new Promise((r) => setTimeout(r, 0))
}

const seedRegistration = (overrides: Record<string, unknown> = {}) => {
  vi.mocked(publicQueryByToken).mockResolvedValue({
    data: {
      id: 1,
      name: '王小明',
      birthday: '2020-01-01',
      class_name: '大班',
      parent_phone: '0912345678',
      courses: [{ course_id: 1, name: '美術', status: 'enrolled', price: 3000 }],
      supplies: [{ name: '舞鞋', price: 500 }],
      total_amount: 3500,
      paid_amount: 0,
      is_paid: false,
      ...overrides,
    },
  })
}

describe('ActivityPublicQueryView — 報名時段截止鎖定（F5）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('close_at 為過去時間 → 顯示截止提示、唯讀摘要出現、儲存按鈕不出現', async () => {
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      supplies: [{ name: '舞鞋', price: 500 }],
      registration_time: { is_open: true, open_at: null, close_at: '2000-01-01T00:00:00Z' },
    })
    seedRegistration()

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="registration-closed-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('報名已截止')

    expect(wrapper.find('[data-test="payment-locked-summary"]').exists()).toBe(true)
    expect(wrapper.find('.action-buttons').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('儲存修改')
    expect(wrapper.find('#editNewPhone').exists()).toBe(false)
    expect(wrapper.findAll('.course-item input[type="checkbox"]')).toHaveLength(0)
  })

  it('close_at 為未來時間 → 完全不受影響、可編輯（回歸）', async () => {
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      supplies: [{ name: '舞鞋', price: 500 }],
      registration_time: { is_open: true, open_at: null, close_at: '2999-01-01T00:00:00Z' },
    })
    seedRegistration()

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="registration-closed-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="payment-locked-summary"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('儲存修改')
    expect(wrapper.find('.action-buttons').exists()).toBe(true)
    expect(wrapper.findAll('.course-item input[type="checkbox"]').length).toBeGreaterThan(0)
  })

  it('registration_time 缺漏（bootstrap 未回傳）→ fail-open，完全不受影響、可編輯', async () => {
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      supplies: [{ name: '舞鞋', price: 500 }],
      registration_time: undefined,
    })
    seedRegistration()

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="registration-closed-hint"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('儲存修改')
  })

  it('close_at 在 48 小時內但未過期 → 顯示非阻斷提醒但仍可編輯', async () => {
    const soon = new Date(Date.now() + 6 * 3_600_000).toISOString()
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      supplies: [{ name: '舞鞋', price: 500 }],
      registration_time: { is_open: true, open_at: null, close_at: soon },
    })
    seedRegistration()

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="registration-window-notice"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('報名即將截止')

    // 仍可編輯：不走鎖定分支
    expect(wrapper.find('[data-test="registration-closed-hint"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="payment-locked-summary"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('儲存修改')
    expect(wrapper.find('.action-buttons').exists()).toBe(true)
  })

  it('is_paid=true 且已截止 → 優先顯示付款鎖定文案（非截止文案）', async () => {
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      supplies: [{ name: '舞鞋', price: 500 }],
      registration_time: { is_open: true, open_at: null, close_at: '2000-01-01T00:00:00Z' },
    })
    seedRegistration({ is_paid: true, paid_amount: 3500 })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="payment-locked-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="registration-closed-hint"]').exists()).toBe(false)
    // 依然唯讀鎖定（付款鎖定與截止鎖定皆走同一 isEditLocked 分支）
    expect(wrapper.find('[data-test="payment-locked-summary"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('儲存修改')
  })

  it('is_open=false（後台暫停報名）→ 顯示「尚未開放」而非誤標成截止', async () => {
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      supplies: [{ name: '舞鞋', price: 500 }],
      registration_time: { is_open: false, open_at: null, close_at: null },
    })
    seedRegistration()

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="registration-closed-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('報名尚未開放')
    expect(wrapper.text()).not.toContain('報名已截止')
    expect(wrapper.find('[data-test="payment-locked-summary"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('儲存修改')
  })

  it('open_at 為未來時間（尚未開始）→ 顯示「尚未開始」而非誤標成截止', async () => {
    const future = new Date(Date.now() + 24 * 3_600_000).toISOString()
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      supplies: [{ name: '舞鞋', price: 500 }],
      registration_time: { is_open: true, open_at: future, close_at: null },
    })
    seedRegistration()

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="registration-closed-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('報名尚未開始')
    expect(wrapper.text()).not.toContain('報名已截止')
    expect(wrapper.find('[data-test="payment-locked-summary"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('儲存修改')
  })

  it('候補確認/放棄按鈕在截止後仍正常顯示（回歸，不受 isEditLocked 影響）', async () => {
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      registration_time: { is_open: true, open_at: null, close_at: '2000-01-01T00:00:00Z' },
    })
    seedRegistration({
      courses: [
        { course_id: 1, name: '美術', status: 'enrolled', price: 3000 },
        {
          course_id: 3,
          name: '足球',
          status: 'promoted_pending',
          confirm_deadline: '2099-12-31T23:59:00+08:00',
        },
      ],
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="registration-closed-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('您有候補已升為正式')
    const actionTexts = wrapper.findAll('.promotion-card-actions button').map((b) => b.text())
    expect(actionTexts.some((t) => t.includes('確認參加'))).toBe(true)
    expect(actionTexts.some((t) => t.includes('放棄此位'))).toBe(true)
  })
})
