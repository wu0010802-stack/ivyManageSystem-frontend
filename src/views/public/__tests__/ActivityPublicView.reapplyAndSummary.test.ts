import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const publicRegister = vi.fn()

vi.mock('@/api/activityPublic', () => ({
  getPublicBootstrap: vi.fn().mockResolvedValue({
    data: {
      courses: [
        { name: '美術', price: 3000 },
        { name: '舞蹈', price: 2600 },
      ],
      supplies: [{ name: '舞衣', price: 600 }],
      classes: ['大班', '中班'],
      course_videos: {},
      registration_time: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
    },
  }),
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: {} }),
  getPublicRegistrationTime: vi.fn().mockResolvedValue({
    data: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
  }),
  publicRegister,
}))

const mountView = async (): Promise<VueWrapper> => {
  const ActivityPublicView = (await import('../ActivityPublicView.vue')).default
  const wrapper = mount(ActivityPublicView, {
    global: { stubs: ['router-link', 'router-view'] },
  })
  await flushPromises()
  return wrapper
}

const summary = (wrapper: VueWrapper) => wrapper.find('[data-test="selection-summary"]')
const nextButton = (wrapper: VueWrapper) => wrapper.find('.registration-nav-actions .btn-submit')
const courseBoxes = (wrapper: VueWrapper) =>
  wrapper.findAll('#courseListGroup input[type="checkbox"]')

/** 走完三步驟送出一筆報名，回傳成功摘要 modal 的 wrapper */
async function submitOnce(wrapper: VueWrapper, name = '王小明') {
  await courseBoxes(wrapper)[0].setValue(true)
  await nextButton(wrapper).trigger('click')
  await flushPromises()

  await wrapper.find('#studentName').setValue(name)
  await wrapper.find('#parentPhone').setValue('0912345678')
  await wrapper.find('#studentClass').setValue('大班')
  await wrapper.find('#contactEmail').setValue('parent@example.com')
  await nextButton(wrapper).trigger('click')
  await flushPromises()

  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  publicRegister.mockResolvedValue({
    data: { message: '報名資料已送出', query_token: 'tok_ABC' },
  })
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  })
})

describe('第 1 步選課摘要', () => {
  it('未選任何項目時提示尚未選課', async () => {
    const wrapper = await mountView()
    expect(summary(wrapper).text()).toContain('尚未選擇課程')
  })

  it('勾選課程後列出課名與數量', async () => {
    const wrapper = await mountView()
    await courseBoxes(wrapper)[0].setValue(true)
    await courseBoxes(wrapper)[1].setValue(true)

    const text = summary(wrapper).text()
    expect(text).toContain('已選課程（2）')
    expect(text).toContain('美術')
    expect(text).toContain('舞蹈')
    expect(text).not.toContain('尚未選擇課程')
  })

  it('加購用品獨立成一行', async () => {
    const wrapper = await mountView()
    await courseBoxes(wrapper)[0].setValue(true)
    await wrapper.find('.dance-grid input[type="checkbox"]').setValue(true)

    const text = summary(wrapper).text()
    expect(text).toContain('加購用品（1）')
    expect(text).toContain('舞衣')
  })

  it('不顯示任何金額合計（2026-08-03 業主裁定）', async () => {
    const wrapper = await mountView()
    await courseBoxes(wrapper)[0].setValue(true)
    await wrapper.find('.dance-grid input[type="checkbox"]').setValue(true)

    const text = summary(wrapper).text()
    expect(text).not.toContain('3,600')
    expect(text).not.toContain('合計')
    expect(text).not.toContain('$')
  })
})

describe('幫另一位寶貝報名', () => {
  it('保留手機與 Email、清空孩子資料與選課，並回到第 1 步', async () => {
    const wrapper = await mountView()
    await submitOnce(wrapper)

    // 守門：先複製查詢碼，避免被攔一次
    await wrapper.find('.token-control .btn-copy').trigger('click')
    await flushPromises()
    await wrapper.find('[data-test="reapply-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.modal-panel--success').exists()).toBe(false)
    expect((wrapper.find('#parentPhone').element as HTMLInputElement).value).toBe('0912345678')
    expect((wrapper.find('#contactEmail').element as HTMLInputElement).value).toBe(
      'parent@example.com',
    )
    expect((wrapper.find('#studentName').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#studentClass').element as HTMLInputElement).value).toBe('')
    expect(summary(wrapper).text()).toContain('尚未選擇課程')
    expect(courseBoxes(wrapper).every((box) => !(box.element as HTMLInputElement).checked)).toBe(
      true,
    )
  })

  it('第二筆送出時帶的是新孩子資料與同一支家長手機', async () => {
    const wrapper = await mountView()
    await submitOnce(wrapper, '王小明')

    await wrapper.find('.token-control .btn-copy').trigger('click')
    await flushPromises()
    await wrapper.find('[data-test="reapply-button"]').trigger('click')
    await flushPromises()

    await courseBoxes(wrapper)[1].setValue(true)
    await nextButton(wrapper).trigger('click')
    await flushPromises()
    await wrapper.find('#studentName').setValue('王小美')
    await wrapper.find('#studentClass').setValue('中班')
    await nextButton(wrapper).trigger('click')
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(publicRegister).toHaveBeenCalledTimes(2)
    expect(publicRegister.mock.calls[1][0]).toMatchObject({
      name: '王小美',
      class: '中班',
      parent_phone: '0912345678',
      email: 'parent@example.com',
      courses: [{ name: '舞蹈' }],
    })
  })
})
