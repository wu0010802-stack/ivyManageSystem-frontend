import { describe, it, expect, beforeEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

// 行銷文案後台化（2026-08-03）：intro_text / notice_items 有值時取代預設文案，
// null／缺欄位（舊後端）時 fallback 原寫死文案；**粗體** 渲染成 <strong>。

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const bootstrapData: Record<string, unknown> = {}

vi.mock('@/api/activityPublic', () => ({
  getPublicBootstrap: vi.fn().mockImplementation(() =>
    Promise.resolve({ data: bootstrapData }),
  ),
  getPublicCoursesAvailability: vi.fn().mockResolvedValue({ data: {} }),
  getPublicRegistrationTime: vi.fn().mockResolvedValue({
    data: { open_at: null, close_at: '2999-01-01T00:00:00Z' },
  }),
  publicRegister: vi.fn(),
}))

function setBootstrap(registrationTime: Record<string, unknown>) {
  Object.keys(bootstrapData).forEach((k) => delete bootstrapData[k])
  Object.assign(bootstrapData, {
    courses: [{ name: '美術', price: 3000 }],
    supplies: [],
    classes: ['大班'],
    course_videos: {},
    registration_time: registrationTime,
  })
}

const mountView = async (): Promise<VueWrapper> => {
  const ActivityPublicView = (await import('../ActivityPublicView.vue')).default
  const wrapper = mount(ActivityPublicView, {
    global: { stubs: ['router-link', 'router-view'] },
  })
  await flushPromises()
  return wrapper
}

describe('ActivityPublicView — 行銷文案後台化', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('後台未設定（缺欄位）時顯示預設文案', async () => {
    setBootstrap({ open_at: null, close_at: '2999-01-01T00:00:00Z' })
    const wrapper = await mountView()

    expect(wrapper.find('.info-intro').text()).toContain('爸比媽咪')
    const items = wrapper.findAll('.notice-list li')
    expect(items).toHaveLength(4)
    expect(items[0].find('strong').text()).toBe('額滿為止')
  })

  it('後台有值時顯示自訂文案並解析粗體', async () => {
    setBootstrap({
      open_at: null,
      close_at: '2999-01-01T00:00:00Z',
      intro_text: '親愛的家長：\n本學期課程開放報名了！',
      notice_items: ['名額有限，**先報先得**。', '費用開學後收取。'],
    })
    const wrapper = await mountView()

    const intro = wrapper.find('.info-intro')
    expect(intro.text()).toContain('親愛的家長：')
    expect(intro.text()).toContain('本學期課程開放報名了！')
    expect(intro.text()).not.toContain('爸比媽咪')

    const items = wrapper.findAll('.notice-list li')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toBe('名額有限，先報先得。')
    expect(items[0].find('strong').text()).toBe('先報先得')
    expect(items[1].find('strong').exists()).toBe(false)
  })

  it('notice_items 為空陣列時視同未設定，回預設四條', async () => {
    setBootstrap({
      open_at: null,
      close_at: '2999-01-01T00:00:00Z',
      intro_text: null,
      notice_items: [],
    })
    const wrapper = await mountView()
    expect(wrapper.findAll('.notice-list li')).toHaveLength(4)
    expect(wrapper.find('.info-intro').text()).toContain('爸比媽咪')
  })
})
