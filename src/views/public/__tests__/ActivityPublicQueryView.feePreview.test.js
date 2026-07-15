import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// code review P2：儲存前退費預警（feePreview / wouldOverpay / saveBlocked）的價格來源。
// 後端 /public/update 是 diff 更新——未變更課程/用品保留原 price_snapshot，不會退費。
// 前端 feePreview 原本對「所有」已選課程/用品都用目前 option 價估算，後台調降價後，家長
// 即使保留原品項也會被誤判 newTotal < paid → wouldOverpay 擋下儲存。
// 修法：既有品項用 queryResult 回的 price_snapshot（課程 courses[].price、用品
// supplies[].price），新增品項才用目前 option 價，與後端 diff 行為對齊。

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
}))

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
  getPublicBootstrap,
  getPublicCoursesAvailability,
} from '@/api/activityPublic'

// 用 bootstrap 設定課程/用品 option 價（取代原本分別 mock getPublicCourses/Supplies）
function mockBootstrap({ courses = [], supplies = [], classes = ['大班'] } = {}) {
  getPublicBootstrap.mockResolvedValue({
    data: { courses, supplies, classes, course_videos: {} },
  })
}

vi.mock('@/utils/arrayUtils', () => ({
  toggleArrayItem: (arr, item) => {
    const i = arr.indexOf(item)
    if (i >= 0) arr.splice(i, 1)
    else arr.push(item)
  },
}))

const mountView = async () => {
  const ActivityPublicQueryView = (await import('../ActivityPublicQueryView.vue')).default
  return mount(ActivityPublicQueryView, {
    global: { stubs: ['router-link', 'router-view'] },
  })
}

async function triggerTokenQuery(wrapper) {
  const tabs = wrapper.findAll('.mode-tab')
  await tabs[0].trigger('click')
  wrapper.vm.queryForm.token = 'TESTTOKEN123'
  wrapper.vm.queryForm.parent_phone = '0912345678'
  await wrapper.vm.$nextTick()
  await wrapper.find('[data-test="query-submit"]').trigger('click')
  await new Promise((r) => setTimeout(r, 0))
}

describe('ActivityPublicQueryView — 退費預警價格來源（P2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('既有課程+用品的 option 價被後台調降後保留原品項，仍用 snapshot 估算、不誤擋儲存', async () => {
    // 後台把美術 option 由 3000 降到 2000、彩色筆由 300 降到 100
    mockBootstrap({
      courses: [{ name: '美術', price: 2000 }],
      supplies: [{ name: '彩色筆', price: 100 }],
    })
    getPublicCoursesAvailability.mockResolvedValue({ data: { 美術: 5 } })
    // query 回報名當下的 snapshot：美術 3000、彩色筆 300，已繳 3300
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        // v3（4c58baa4）起 editorReady 依 school_year/semester 判斷 catalog 是否已載入
        // 對應學期，缺此二欄會讓 editorReady 永遠為 false → saveBlocked 誤鎖。
        school_year: 113,
        semester: 1,
        courses: [{ course_id: 1, name: '美術', status: 'enrolled', price: 3000 }],
        supplies: [{ name: '彩色筆', price: 300 }],
        total_amount: 3300,
        paid_amount: 3300,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    // 既有品項沿用 snapshot（3000 + 300），不是被調降後的 option 價（2000 + 100）
    expect(wrapper.vm.feePreview.newTotal).toBe(3300)
    expect(wrapper.vm.feePreview.wouldOverpay).toBe(false)
    expect(wrapper.vm.saveBlocked).toBe(false)
  })

  it('新增的用品用目前 option 價（snapshot 不存在於既有報名）', async () => {
    mockBootstrap({
      courses: [{ name: '美術', price: 3000 }],
      supplies: [{ name: '畫具', price: 500 }],
    })
    getPublicCoursesAvailability.mockResolvedValue({ data: { 美術: 5 } })
    // 原報名只有美術（snapshot 3000），無任何用品，已繳 3000
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        // 同上：editorReady 需要 school_year/semester 才會判定 catalog 已對齊本學期。
        school_year: 113,
        semester: 1,
        courses: [{ course_id: 1, name: '美術', status: 'enrolled', price: 3000 }],
        supplies: [],
        total_amount: 3000,
        paid_amount: 3000,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    // 家長新增畫具（原報名沒有 → 用目前 option 價 500）
    wrapper.vm.editForm.selectedSupplies.push('畫具')
    await wrapper.vm.$nextTick()

    // 既有課程 snapshot 3000 + 新增用品 option 價 500
    expect(wrapper.vm.feePreview.newTotal).toBe(3500)
    expect(wrapper.vm.feePreview.additionalDue).toBe(500)
    expect(wrapper.vm.saveBlocked).toBe(false)
  })
})

describe('ActivityPublicQueryView — promoted_pending 不計費（audit C-1，2026-07-02）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('零改動時 promoted_pending 課不計入新應繳（與後端僅 enrolled 計費對齊）', async () => {
    mockBootstrap({
      courses: [
        { name: '美術', price: 3000 },
        { name: '圍棋', price: 2000 },
      ],
    })
    getPublicCoursesAvailability.mockResolvedValue({ data: { 美術: 0, 圍棋: 0 } })
    // 後端 total_amount=3000：只計 enrolled 美術；圍棋是 promoted_pending 佔位未確認
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [
          { course_id: 1, name: '美術', status: 'enrolled', price: 3000 },
          { course_id: 2, name: '圍棋', status: 'promoted_pending', price: 2000 },
        ],
        supplies: [],
        total_amount: 3000,
        paid_amount: 3000,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    // 修前 bug：newTotal=5000（pending 課被計費）→ 家長零改動即看到「需補繳 2000」
    expect(wrapper.vm.feePreview.newTotal).toBe(3000)
    expect(wrapper.vm.feePreview.hasChange).toBe(false)
    expect(wrapper.vm.feePreview.additionalDue).toBe(0)
  })

  it('wouldOverpay 以正確口徑判斷，不被 pending 課價虛胖的總額漏擋', async () => {
    mockBootstrap({
      courses: [
        { name: '美術', price: 500 },
        { name: '圍棋', price: 1000 },
      ],
    })
    getPublicCoursesAvailability.mockResolvedValue({ data: { 美術: 0, 圍棋: 0 } })
    // 已繳 800 > 真實新應繳 500（enrolled 美術）→ 應警示退費並擋儲存；
    // 修前虛胖 newTotal=1500 ≥ 800 → 漏警示，家長儲存直接吃後端 409
    publicQueryByToken.mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        courses: [
          { course_id: 1, name: '美術', status: 'enrolled', price: 500 },
          { course_id: 2, name: '圍棋', status: 'promoted_pending', price: 1000 },
        ],
        supplies: [],
        total_amount: 500,
        paid_amount: 800,
      },
    })

    const wrapper = await mountView()
    await triggerTokenQuery(wrapper)

    expect(wrapper.vm.feePreview.newTotal).toBe(500)
    expect(wrapper.vm.feePreview.wouldOverpay).toBe(true)
    expect(wrapper.vm.saveBlocked).toBe(true)
  })
})
