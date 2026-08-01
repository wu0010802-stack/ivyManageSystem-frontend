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

describe('ActivityPublicView — 必填欄位 aria-required（spec #4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('姓名／生日／家長手機／班級四個必填欄位皆有 aria-required="true"', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('#studentName').attributes('aria-required')).toBe('true')
    expect(wrapper.find('#studentBirthday').attributes('aria-required')).toBe('true')
    expect(wrapper.find('#parentPhone').attributes('aria-required')).toBe('true')
    expect(wrapper.find('#studentClass').attributes('aria-required')).toBe('true')
  })

  it('選填 Email 欄位不帶 aria-required', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('#contactEmail').attributes('aria-required')).toBeUndefined()
  })
})

describe('ActivityPublicView — beforeunload 離開防護（spec #6）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mounted 時掛上 beforeunload、unmount 時移除', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const wrapper = await mountView()

    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    const handler = addSpy.mock.calls.find((c) => c[0] === 'beforeunload')?.[1] as EventListener

    wrapper.unmount()

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', handler)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('表單為空（未填必填欄位）時 beforeunload 不攔截', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    await mountView()

    const handler = addSpy.mock.calls.find((c) => c[0] === 'beforeunload')?.[1] as (
      e: Partial<BeforeUnloadEvent>,
    ) => void
    const event = { preventDefault: vi.fn(), returnValue: '' }
    handler(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    addSpy.mockRestore()
  })

  it('任一必填欄位已填值時 beforeunload 攔截（呼叫 preventDefault）', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const wrapper = await mountView()

    await wrapper.find('#studentName').setValue('王小明')

    const handler = addSpy.mock.calls.find((c) => c[0] === 'beforeunload')?.[1] as (
      e: Partial<BeforeUnloadEvent>,
    ) => void
    const event = { preventDefault: vi.fn(), returnValue: '' }
    handler(event)

    expect(event.preventDefault).toHaveBeenCalled()
    addSpy.mockRestore()
  })

  it('已勾選課程（第 1 步即有進度）時 beforeunload 攔截', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const wrapper = await mountView()

    await wrapper.find('#courseListGroup input[type="checkbox"]').setValue(true)

    const handler = addSpy.mock.calls.find((c) => c[0] === 'beforeunload')?.[1] as (
      e: Partial<BeforeUnloadEvent>,
    ) => void
    const event = { preventDefault: vi.fn(), returnValue: '' }
    handler(event)

    expect(event.preventDefault).toHaveBeenCalled()
    addSpy.mockRestore()
  })
})
