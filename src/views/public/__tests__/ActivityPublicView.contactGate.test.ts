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

// tenantSlug 以變數控制，其餘 tenant utils 維持原實作（灰度不變式不受影響）
let mockSlug: string | null = null
vi.mock('@/utils/tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/tenant')>()),
  tenantSlug: () => mockSlug,
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

const contactButtons = (wrapper: VueWrapper) =>
  wrapper.findAll('button').filter((b) => b.text().includes('與承辦人員聯繫'))

const setHost = (hostname: string) => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, hostname },
  })
}

// 仁武暫不開放線上留言（2026-08-07 業主指示）：桌機按鈕列與手機選單的
// 「與承辦人員聯繫」入口都要隱藏；其他租戶不受影響。
//
// prod 是單租戶 build（tenantSlug() 回 null），故 hostname 分支才是實際生效的
// 那條——2026-08-07 只靠 slug 的版本上 prod 後按鈕依然顯示，這組測試守住回歸。
describe('ActivityPublicView — 與承辦人員聯繫的租戶閘', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setHost('activity.example.com')
  })

  it('slug=renwu 隱藏所有聯繫入口', async () => {
    mockSlug = 'renwu'
    const wrapper = await mountView()
    expect(contactButtons(wrapper)).toHaveLength(0)
  })

  it('單租戶 build（slug=null）下，仁武網域仍隱藏聯繫入口', async () => {
    mockSlug = null
    setHost('renwu.ivypreschool.tw')
    const wrapper = await mountView()
    expect(contactButtons(wrapper)).toHaveLength(0)
  })

  it('slug=yihua 保留聯繫入口（桌機按鈕列）', async () => {
    mockSlug = 'yihua'
    const wrapper = await mountView()
    expect(contactButtons(wrapper).length).toBeGreaterThan(0)
  })

  it('單租戶模式的其他網域保留聯繫入口', async () => {
    mockSlug = null
    const wrapper = await mountView()
    expect(contactButtons(wrapper).length).toBeGreaterThan(0)
  })
})
