import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

// ── 模擬 vue-router（view 用 useRoute 取 query.token、useRouter 導回報名頁）──
const { routerPushMock } = vi.hoisted(() => ({ routerPushMock: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: routerPushMock }),
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

import { publicQueryByToken } from '@/api/activityPublic'

const mountView = async (): Promise<VueWrapper> => {
  const ActivityPublicQueryView = (await import('../ActivityPublicQueryView.vue')).default
  return mount(ActivityPublicQueryView, {
    global: {
      stubs: ['router-link', 'router-view'],
    },
  })
}

/**
 * #3/#4 a11y 補齊（spec 2026-07-27-public-registration-ux-batch5-design）：
 * - 必填欄位補 aria-required="true"
 * - validation 訊息補 role="alert"
 * - 查詢結果/錯誤區塊共用 aria-live="polite" wrapper，查詢完成後 focus 移入
 *
 * 2026-08-03：兩種查詢模式（tabs：查詢碼+手機 / 姓名+生日+手機）已整組移除，
 * 只剩查詢碼+手機單一模式；原 role="tablist"/"tab" 與 roving tabindex 測試已刪除。
 */
describe('ActivityPublicQueryView — a11y（#3/#4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 2026-08-03：兩種查詢模式（tabs）已整組移除，查詢碼+手機為唯一模式，
  // 不再需要 tablist/tabpanel/roving tabindex 的鍵盤語意；相關測試已刪除。

  it('必填欄位（查詢碼/手機）皆有 aria-required=true', async () => {
    const wrapper = await mountView()
    await flushPromises()

    expect(wrapper.find('#searchToken').attributes('aria-required')).toBe('true')
    expect(wrapper.find('#searchPhone').attributes('aria-required')).toBe('true')
  })

  it('validation 錯誤訊息帶 role=alert', async () => {
    const wrapper = await mountView()
    await flushPromises()

    await wrapper.find('#searchToken').trigger('blur')
    await flushPromises()
    const msg = wrapper.find('.validation-msg.error')
    expect(msg.exists()).toBe(true)
    expect(msg.attributes('role')).toBe('alert')
  })

  it('查詢失敗：錯誤區塊在 aria-live=polite wrapper 內，且查詢後 focus 移入', async () => {
    vi.mocked(publicQueryByToken).mockRejectedValue({
      response: { data: { detail: '查無對應報名' } },
    })
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    const wrapper = await mountView()
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      queryForm: { token: string; parent_phone: string }
      $nextTick: () => Promise<void>
    }
    vm.queryForm.token = 'TESTTOKEN123'
    vm.queryForm.parent_phone = '0912345678'
    await vm.$nextTick()
    await wrapper.find('[data-test="query-submit"]').trigger('click')
    await flushPromises()

    const errorSection = wrapper.find('.error-message').element.closest('[tabindex="-1"]')
    expect(errorSection).not.toBeNull()
    const liveWrapper = errorSection?.closest('[aria-live="polite"]')
    expect(liveWrapper).not.toBeNull()
    expect(focusSpy).toHaveBeenCalled()
  })

  it('查詢成功：結果區塊在 aria-live=polite wrapper 內，且查詢後 focus 移入', async () => {
    vi.mocked(publicQueryByToken).mockResolvedValue({
      data: {
        id: 1,
        name: '王小明',
        birthday: '2020-01-01',
        class_name: '大班',
        parent_phone: '0912345678',
        school_year: 113,
        semester: 2,
        courses: [],
        supplies: [],
        total_amount: 0,
        paid_amount: 0,
        query_token_required: true,
        is_paid: false,
      },
    })
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    const wrapper = await mountView()
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      queryForm: { token: string; parent_phone: string }
      $nextTick: () => Promise<void>
    }
    vm.queryForm.token = 'TESTTOKEN123'
    vm.queryForm.parent_phone = '0912345678'
    await vm.$nextTick()
    await wrapper.find('[data-test="query-submit"]').trigger('click')
    await flushPromises()

    const resultHeading = wrapper.findAll('h2').find((h) => h.text().includes('編輯報名資料'))
    expect(resultHeading).toBeTruthy()
    const resultSection = resultHeading!.element.closest('[tabindex="-1"]')
    expect(resultSection).not.toBeNull()
    const liveWrapper = resultSection?.closest('[aria-live="polite"]')
    expect(liveWrapper).not.toBeNull()
    expect(focusSpy).toHaveBeenCalled()
  })
})

/**
 * 死巷修正（critique 2026-07-28）：本頁由報名頁同窗導入或 LINE 直開，
 * 舊「取消 Cancel」的 window.close() 靜默失敗；改為顯式導回報名頁，
 * 且 header 常駐返回連結（查詢前也要有路徑可回）。
 */
describe('ActivityPublicQueryView — 回報名頁導航', () => {
  it('header 返回連結存在，點擊導回 public-activity 路由', async () => {
    const wrapper = await mountView()
    await flushPromises()

    const backlink = wrapper.find('.page-backlink')
    expect(backlink.exists()).toBe(true)
    await backlink.trigger('click')
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'public-activity' })
  })
})
