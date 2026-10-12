import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
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

const queryButtons = (wrapper: VueWrapper) =>
  wrapper.findAll('button').filter((b) => b.text().includes('查詢 / 修改報名'))

// 「與承辦人員聯繫」2026-10-12 全租戶關閉（後台「家長提問」收件匣整個功能下架，
// 留言不再有人看）。在此之前只有仁武關閉（2026-08-07），義華與其他網域都開著——
// 下面逐一列出原本開著的租戶形態，確認全部都不再出現入口。
describe('ActivityPublicView — 與承辦人員聯繫入口全租戶關閉', () => {
  // 首次動態 import 這支大型 SFC 的轉譯成本會吃掉第一個案例的 5 秒預設 timeout
  beforeAll(async () => {
    await import('../ActivityPublicView.vue')
  }, 30_000)

  beforeEach(() => {
    vi.clearAllMocks()
    setHost('activity.example.com')
  })

  it.each([
    ['slug=yihua', 'yihua', 'activity.example.com'],
    ['單租戶 build（slug=null）的義華網域', null, 'yihua.ivypreschool.tw'],
    ['單租戶 build（slug=null）的其他網域', null, 'activity.example.com'],
    ['slug=renwu', 'renwu', 'activity.example.com'],
    ['單租戶 build（slug=null）的仁武網域', null, 'renwu.ivypreschool.tw'],
  ])('%s：不顯示聯繫入口', async (_label, slug, host) => {
    mockSlug = slug
    setHost(host)
    const wrapper = await mountView()
    // 同一列的「查詢 / 修改報名」仍在（防整頁沒渲染的假綠）
    expect(queryButtons(wrapper).length).toBeGreaterThan(0)
    expect(contactButtons(wrapper)).toHaveLength(0)
  })
})
