import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

// ── 模擬 vue-router（view 用 useRouter 導頁至查詢頁）──────────────────────
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// ── 模擬 API：bootstrap / 名額 / 報名時段皆回傳最小可用資料 ────────────────
vi.mock('@/api/activityPublic', () => ({
  getPublicBootstrap: vi.fn().mockResolvedValue({
    data: {
      courses: [{ name: '美術', price: 3000 }],
      supplies: [],
      classes: ['大班'],
      course_videos: {},
      registration_time: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
    },
  }),
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: {} }),
  getPublicRegistrationTime: vi.fn().mockResolvedValue({
    data: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
  }),
  publicRegister: vi.fn(),
}))

const mountView = async (): Promise<VueWrapper> => {
  const ActivityPublicView = (await import('../ActivityPublicView.vue')).default
  const wrapper = mount(ActivityPublicView, {
    global: {
      stubs: ['router-link', 'router-view'],
    },
  })
  await flushPromises()
  return wrapper
}

const nextButton = (wrapper: VueWrapper) =>
  wrapper.find('.registration-nav-actions .btn-submit')

// happy-dom 下 isVisible() 不反映 v-show 的 inline display，改直接斷言 style 屬性
const isShown = (wrapper: VueWrapper, step: string) =>
  !(wrapper.find(`[data-registration-step="${step}"]`).attributes('style') ?? '').includes(
    'display: none',
  )

// 課程優先流程（2026-08-01）：家長先看到課程再填個資，降低公開頁流失
describe('ActivityPublicView — 課程優先的步驟順序', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('第 1 步顯示課程選擇、寶貝資料隱藏，下一步文案指向寶貝資料', async () => {
    const wrapper = await mountView()

    const step1 = wrapper.find('[data-registration-step="1"]')
    const step2 = wrapper.find('[data-registration-step="2"]')
    expect(step1.find('#courseListGroup').exists()).toBe(true)
    expect(isShown(wrapper, '1')).toBe(true)
    expect(step2.find('#studentName').exists()).toBe(true)
    expect(isShown(wrapper, '2')).toBe(false)
    expect(nextButton(wrapper).text()).toContain('下一步：填寫寶貝資料')
  })

  it('步驟 tab 依序為 選擇課程 → 寶貝資料 → 確認送出', async () => {
    const wrapper = await mountView()

    const labels = wrapper
      .findAll('.registration-step-tab')
      .map((tab) => tab.text().replace(/^[✓\d]\s*/, ''))
    expect(labels).toEqual(['選擇課程', '寶貝資料', '確認送出'])
  })

  it('未選課按下一步會被擋在第 1 步並顯示課程錯誤', async () => {
    const wrapper = await mountView()

    await nextButton(wrapper).trigger('click')
    await flushPromises()

    expect(isShown(wrapper, '1')).toBe(true)
    expect(isShown(wrapper, '2')).toBe(false)
    expect(wrapper.text()).toContain('請至少選擇一門課程')
  })

  it('選課後進入第 2 步寶貝資料，下一步文案改為確認資料', async () => {
    const wrapper = await mountView()

    await wrapper.find('#courseListGroup input[type="checkbox"]').setValue(true)
    await nextButton(wrapper).trigger('click')
    await flushPromises()

    expect(isShown(wrapper, '1')).toBe(false)
    expect(isShown(wrapper, '2')).toBe(true)
    expect(nextButton(wrapper).text()).toContain('下一步：確認資料')
  })
})
