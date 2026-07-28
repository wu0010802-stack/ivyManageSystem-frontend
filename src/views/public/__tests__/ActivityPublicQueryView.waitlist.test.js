import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// ── 模擬 vue-router（view 用 useRoute 取 query.token）──────────────────────
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

// ── 模擬 API ──────────────────────────────────────────────────────────────
vi.mock('@/api/activityPublic', () => ({
  publicQueryByToken: vi.fn(),
  publicQueryRegistration: vi.fn(),
  publicUpdateRegistration: vi.fn(),
  publicConfirmPromotion: vi.fn(),
  publicDeclinePromotion: vi.fn(),
  // view 改用 bootstrap 單支 GET 取代 4 支個別 GET（C4 quick win）
  getPublicBootstrap: vi.fn().mockResolvedValue({
    data: { courses: [], supplies: [], classes: [], course_videos: {} },
  }),
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: {} }),
}))

import {
  publicQueryByToken,
  publicQueryRegistration,
  publicConfirmPromotion,
  publicDeclinePromotion,
  getPublicBootstrap,
  getPublicCoursesAvailability,
} from '@/api/activityPublic'

// 用 bootstrap 設定課程 option（取代原本 mock getPublicCourses）
function mockBootstrap({ courses = [], supplies = [], classes = ['大班'] } = {}) {
  getPublicBootstrap.mockResolvedValue({
    data: { courses, supplies, classes, course_videos: {} },
  })
}

// ── 工具 function 型 mock（view 透過具名 import 用）─────────────────────────
// toggleArrayItem 真實實作（測 toggle 守衛時需要真的不/有改陣列）
vi.mock('@/utils/arrayUtils', () => ({
  toggleArrayItem: (arr, item) => {
    const i = arr.indexOf(item)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(item)
  },
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

// ── 滿額不開候補（availability=-1）課程鎖定 + 不入估費（P2）──────────────────
describe('ActivityPublicQueryView — 滿額不開候補課鎖定 + 估費剔除（P2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 預設 supplies/classes 空，courses 帶 3 課（含一門 availability=-1 的滿額不候補課）
    mockBootstrap({
      courses: [
        { name: '美術', price: 3000 },
        { name: '陶藝', price: 2000 },
      ],
    })
  })

  it('availability=-1 的新課（本生無原報名）→ checkbox disabled、標示已額滿、且不入 feePreview', async () => {
    // 陶藝 availability=-1（滿且不開候補）；本生只原報名美術（enrolled）
    getPublicCoursesAvailability.mockResolvedValue({ data: { 美術: 5, 陶藝: -1 } })
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [{ course_id: 1, name: '美術', status: 'enrolled' }],
        supplies: [],
        total_amount: 3000,
        paid_amount: 3000,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    // 找到陶藝那個 course-item 的 checkbox（value="陶藝"）
    const taoyiCheckbox = wrapper
      .findAll('.course-item input[type="checkbox"]')
      .find((cb) => cb.attributes('value') === '陶藝')
    expect(taoyiCheckbox).toBeTruthy()
    expect(taoyiCheckbox.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('已額滿（不開放候補）')

    // 估費：估狀態為 unavailable → feePreview 不計陶藝學費
    expect(wrapper.vm.estimatedCourseStatus('陶藝')).toBe('unavailable')
  })

  it('availability=-1 但本生原 enrolled 的課 → 維持可勾選且計費（保留座位）', async () => {
    // 美術 availability=-1（滿且不開候補），但本生原已 enrolled → 保留座位
    getPublicCoursesAvailability.mockResolvedValue({ data: { 美術: -1, 陶藝: 5 } })
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [{ course_id: 1, name: '美術', status: 'enrolled' }],
        supplies: [],
        total_amount: 3000,
        paid_amount: 3000,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    const meishuCheckbox = wrapper
      .findAll('.course-item input[type="checkbox"]')
      .find((cb) => cb.attributes('value') === '美術')
    expect(meishuCheckbox).toBeTruthy()
    // 本生原 enrolled → 不鎖
    expect(meishuCheckbox.attributes('disabled')).toBeUndefined()
    // 估狀態仍 enrolled（保留座位、計費）
    expect(wrapper.vm.estimatedCourseStatus('美術')).toBe('enrolled')
  })
})

describe('ActivityPublicQueryView — 轉正確認/放棄成功但刷新失敗不誤報（audit C-2，2026-07-02）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const seedQuery = () => {
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [
          { course_id: 7, name: '美術', status: 'promoted_pending', waitlist_position: null, waitlist_total: null },
        ],
        supplies: [],
        total_amount: 0,
        paid_amount: 0,
      },
    })
  }

  it('confirm 成功、刷新查詢 429 → 顯示成功與刷新提示，不顯示「確認失敗」', async () => {
    seedQuery()
    publicConfirmPromotion.mockResolvedValue({ data: { message: '已確認升為正式' } })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    // 轉正後的 refetch 失敗（模擬公開查詢限流 / 網路抖動）
    publicQueryByToken.mockRejectedValue({
      response: { status: 429, data: { detail: '查詢過於頻繁，請稍後再試' } },
    })

    await wrapper.vm.handleConfirmPromotion({ course_id: 7, name: '美術', status: 'promoted_pending' })
    await new Promise((r) => setTimeout(r, 0))

    const msgs = wrapper.vm.toasts.map((t) => t.message).join('|')
    expect(msgs).toContain('已確認升為正式')
    expect(msgs).not.toContain('確認失敗')
    // mutation 已成功，任何 error 級 toast（含 429 detail 文字）都是誤報
    expect(wrapper.vm.toasts.filter((t) => t.type === 'error')).toEqual([])
  })

  it('decline 成功、刷新查詢失敗 → 不顯示「放棄失敗」', async () => {
    seedQuery()
    publicDeclinePromotion.mockResolvedValue({ data: { message: '已放棄該名額' } })
    // 測試環境（happy-dom）無 window.confirm，stubGlobal 提供
    vi.stubGlobal('confirm', vi.fn(() => true))

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    publicQueryByToken.mockRejectedValue(new Error('network flake'))

    await wrapper.vm.handleDeclinePromotion({ course_id: 7, name: '美術', status: 'promoted_pending' })
    await new Promise((r) => setTimeout(r, 0))

    const msgs = wrapper.vm.toasts.map((t) => t.message).join('|')
    expect(msgs).toContain('已放棄該名額')
    expect(msgs).not.toContain('放棄失敗')
  })
})
