import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

// ── 模擬 vue-router（view 用 useRoute 取 query.token）──────────────────────
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

// ── 模擬 API ──────────────────────────────────────────────────────────────
vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
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

function mockBootstrap({
  courses = [] as Array<{ name: string; price: number }>,
  supplies = [] as Array<{ name: string; price: number }>,
  classes = ['大班'],
} = {}) {
  vi.mocked(getPublicBootstrap).mockResolvedValue({
    data: { courses, supplies, classes, course_videos: {} },
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

/** 切到 token 模式、填入合法查詢碼與手機後觸發查詢（同既有測試慣例） */
async function triggerTokenQuery(wrapper: VueWrapper) {
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

const REVIEW_HINT = '此報名尚待校方核對就讀資料，課程與班級以校方確認結果為準。'

const seedRegistration = (overrides: Record<string, unknown> = {}) => {
  vi.mocked(publicQueryByToken).mockResolvedValue({
    data: {
      id: 1,
      name: '王小明',
      birthday: '2020-01-01',
      class_name: '大班',
      parent_phone: '0912345678',
      courses: [{ course_id: 1, name: '美術', status: 'enrolled', price: 3000 }],
      supplies: [],
      total_amount: 3000,
      paid_amount: 0,
      is_paid: false,
      ...overrides,
    },
  })
}

describe('ActivityPublicQueryView — 審核中（review_state=school_review）提示', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      supplies: [],
    })
  })

  it('field_state.review_state=school_review 時顯示審核中提示', async () => {
    seedRegistration({ field_state: { class_source: 'parent_input', class_editable: true, review_state: 'school_review' } })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="review-pending-hint"]').exists()).toBe(true)
    expect(wrapper.text()).toContain(REVIEW_HINT)
  })

  it('field_state.review_state=confirmed 時不顯示審核中提示', async () => {
    seedRegistration({ field_state: { class_source: 'student_record', class_editable: false, review_state: 'confirmed' } })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="review-pending-hint"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain(REVIEW_HINT)
  })

  it('缺 field_state（舊後端）時 fallback 為 confirmed，不顯示審核中提示', async () => {
    seedRegistration({ field_state: undefined })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="review-pending-hint"]').exists()).toBe(false)
  })
})
