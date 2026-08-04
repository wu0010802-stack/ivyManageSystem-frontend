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
 * 填入查詢碼與手機，然後點擊查詢按鈕。
 * handleQuery 在 tokenValid / phoneValid 不滿足時會 early-return，
 * 所以必須先寫入合法值再觸發。
 */
async function triggerTokenQuery(wrapper) {
  // 填 queryForm（直接設 vm 的 reactive 物件最可靠）
  wrapper.vm.queryForm.token = 'TESTTOKEN123'
  wrapper.vm.queryForm.parent_phone = '0912345678'
  await wrapper.vm.$nextTick()

  // 點查詢按鈕
  await wrapper.find('[data-test="query-submit"]').trigger('click')
  // 讓 Promise 微任務跑完
  await new Promise((r) => setTimeout(r, 0))
}

// 2026-08-04 業主決策：公開端一律不揭露候補順位。本 describe 原名「候補位次
// 顯示」、斷言「目前第 N 位／共 M 位」「下一位」「唯一候補者」三種順位文案，
// 反轉為「候補區塊只講狀態、不得出現任何順位資訊」的守衛。
// Why: 家長看到自己排在後段會直接放棄；且後台可手動調整候補順序（sort_order
// 優先於報名先後），露出順位會引來「我比較早報名為什麼排後面」的爭議。
describe('ActivityPublicQueryView — 候補狀態顯示（不含順位）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 測資刻意仍帶 waitlist_position / waitlist_total（模擬舊版後端或殘留資料），
  // 確保前端就算收到也絕不渲染。
  const WAITLIST_PAYLOAD = {
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
  }

  it('候補課程只顯示「候補中」，候補區塊不含任何順位數字', async () => {
    publicQueryByToken.mockResolvedValue({ data: WAITLIST_PAYLOAD })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    const summary = wrapper.find('[data-test="waitlist-summary"]')
    expect(summary.exists()).toBe(true)
    const txt = summary.text()
    expect(txt).toContain('候補中')
    // 區塊內不得出現任何數字——涵蓋 position / total 兩者的所有渲染形式
    expect(txt).not.toMatch(/\d/)
  })

  it('候補區塊不出現順位相關文案（第 N 位／共 M 位／下一位／唯一候補者）', async () => {
    publicQueryByToken.mockResolvedValue({ data: WAITLIST_PAYLOAD })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    const txt = wrapper.text()
    expect(txt).not.toContain('目前第')
    expect(txt).not.toContain('下一位')
    expect(txt).not.toContain('唯一候補者')
    expect(txt).not.toMatch(/共\s*\d+\s*位/)
  })

  it('候補區塊改以「校方會依序聯繫」取代順位，讓家長知道不必重複報名', async () => {
    publicQueryByToken.mockResolvedValue({ data: WAITLIST_PAYLOAD })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.find('[data-test="waitlist-summary"]').text()).toContain(
      '無需重複報名',
    )
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

    await wrapper.vm.handleConfirmPromotion({
      course_id: 7,
      name: '美術',
      status: 'promoted_pending',
    })
    await new Promise((r) => setTimeout(r, 0))

    expect(publicConfirmPromotion).toHaveBeenCalledTimes(1)
    // 刷新必須用 token 查詢鎖定同一張報名 / 學期（查詢碼是公開端唯一查詢方式，
    // 2026-08-03 起三欄查詢已整組移除，不再有「跳到別的學期報名」的替代路徑）
    expect(publicQueryByToken).toHaveBeenCalledTimes(1)
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
