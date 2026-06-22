import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

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
  getPublicCourses: vi.fn().mockResolvedValue({ data: [] }),
  getPublicSupplies: vi.fn().mockResolvedValue({ data: [] }),
  getPublicClasses: vi.fn().mockResolvedValue({ data: [] }),
  getPublicCourseVideos: vi.fn().mockResolvedValue({ data: {} }),
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: {} }),
}))

import {
  publicQueryByToken,
  publicQueryRegistration,
  publicConfirmPromotion,
} from '@/api/activityPublic'

// ── 工具 function 型 mock（view 透過具名 import 用）─────────────────────────
vi.mock('@/utils/arrayUtils', () => ({
  toggleArrayItem: vi.fn(),
}))

const mountView = async () => {
  const ActivityPublicQueryView = (await import('../ActivityPublicQueryView.vue')).default
  const wrapper = mount(ActivityPublicQueryView, {
    global: {
      stubs: ['router-link', 'router-view'],
    },
  })
  return wrapper
}

/**
 * 切換到 token 模式、填入查詢碼與手機，然後點擊查詢按鈕。
 * handleQuery 在 tokenValid / phoneValid 不滿足時會 early-return，
 * 所以必須先寫入合法值再觸發。
 */
async function triggerTokenQuery(wrapper) {
  // 切到 token 模式（點 tab）
  const tabs = wrapper.findAll('.mode-tab')
  // 第 0 個是「查詢碼 + 手機」
  await tabs[0].trigger('click')

  // 填 queryForm（直接設 vm 的 reactive 物件最可靠）
  wrapper.vm.queryForm.token = 'TESTTOKEN123'
  wrapper.vm.queryForm.parent_phone = '0912345678'
  await wrapper.vm.$nextTick()

  // 點查詢按鈕
  await wrapper.find('[data-test="query-submit"]').trigger('click')
  // 讓 Promise 微任務跑完
  await new Promise((r) => setTimeout(r, 0))
}

describe('ActivityPublicQueryView — 候補位次顯示', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('候補課程顯示「目前第 N 位 / 共 M 位」', async () => {
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [
          {
            course_id: 1,
            name: '美術',
            status: 'waitlist',
            waitlist_position: 3,
            waitlist_total: 8,
          },
        ],
        supplies: [],
        total_amount: 0,
        paid_amount: 0,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    const txt = wrapper.text()
    expect(txt).toContain('候補')
    expect(txt).toMatch(/第\s*3\s*位/)
    expect(txt).toMatch(/共\s*8\s*位/)
  })

  it('waitlist_position == 1 時顯示「下一位」提示', async () => {
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [
          {
            course_id: 1,
            name: '美術',
            status: 'waitlist',
            waitlist_position: 1,
            waitlist_total: 5,
          },
        ],
        supplies: [],
        total_amount: 0,
        paid_amount: 0,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.text()).toContain('下一位')
  })

  it('waitlist_total == 1 顯示「唯一候補者」', async () => {
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [
          {
            course_id: 1,
            name: '美術',
            status: 'waitlist',
            waitlist_position: 1,
            waitlist_total: 1,
          },
        ],
        supplies: [],
        total_amount: 0,
        paid_amount: 0,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.text()).toContain('唯一候補者')
    // 唯一候補時不應同時顯示「下一位」（互斥）
    expect(wrapper.text()).not.toContain('下一位')
  })

  it('enrolled 課程不顯示候補資訊區塊', async () => {
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [
          {
            course_id: 1,
            name: '美術',
            status: 'enrolled',
            waitlist_position: null,
            waitlist_total: null,
          },
        ],
        supplies: [],
        total_amount: 0,
        paid_amount: 0,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.text()).not.toContain('目前第')
    expect(wrapper.text()).not.toContain('候補中')
  })
})

describe('ActivityPublicQueryView — 候補轉正後刷新沿用查詢模式（#5）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('token 模式確認候補轉正後，用 token 查詢刷新（不誤用三欄查詢跳到別的學期）', async () => {
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [
          {
            course_id: 7,
            name: '美術',
            status: 'promoted_pending',
            waitlist_position: null,
            waitlist_total: null,
          },
        ],
        supplies: [],
        total_amount: 0,
        paid_amount: 0,
      },
    })
    publicConfirmPromotion.mockResolvedValue({ data: { message: '已確認升為正式' } })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    // 清掉查詢階段的呼叫，只觀察「轉正後刷新」用哪個 API
    publicQueryByToken.mockClear()
    publicQueryRegistration.mockClear()

    await wrapper.vm.handleConfirmPromotion({
      course_id: 7,
      name: '美術',
      status: 'promoted_pending',
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(publicConfirmPromotion).toHaveBeenCalledTimes(1)
    // 刷新必須沿用 token 模式（token 查詢鎖定同一張報名 / 學期），
    // 不可硬用三欄查詢（多筆跨學期時會任意跳到別的學期報名）
    expect(publicQueryByToken).toHaveBeenCalledTimes(1)
    expect(publicQueryRegistration).not.toHaveBeenCalled()
  })
})
