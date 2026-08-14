import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
let routeMock: { query: Record<string, unknown>; meta: Record<string, unknown> }

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}))
vi.mock('@/utils/auth', () => ({
  getUserInfo: vi.fn(),
  clearAuth: vi.fn(async () => {}),
  isPlatformAdmin: vi.fn(() => false),
}))

import { getUserInfo, clearAuth, isPlatformAdmin } from '@/utils/auth'
import ErrorStateView from '../ErrorStateView.vue'

// vitest 設定未掛 unplugin-vue-components（僅 build 用），el-* 在測試中是
// 未解析元素、named slot 不會渲染——以最小 stub 還原 title/subTitle/extra 的資料流。
const mountOptions = {
  global: {
    components: {
      'el-result': {
        props: ['title', 'subTitle', 'icon'],
        template: '<div><h2>{{ title }}</h2><p>{{ subTitle }}</p><slot name="extra" /></div>',
      },
      'el-button': { template: '<button type="button"><slot /></button>' },
    },
  },
}

function mountView() {
  return mount(ErrorStateView, mountOptions)
}

const TEACHER = { role: 'teacher' } as unknown as ReturnType<typeof getUserInfo>
const ADMIN = { role: 'admin' } as unknown as ReturnType<typeof getUserInfo>

describe('ErrorStateView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeMock = { query: {}, meta: {} }
  })

  it('forbidden：顯示權限說明（含功能名稱與原網址），並提供回首頁/重新登入', () => {
    vi.mocked(getUserInfo).mockReturnValue(TEACHER)
    routeMock = {
      query: { type: 'forbidden', feature: '班級相簿', from: '/portal/albums' },
      meta: {},
    }
    const wrapper = mountView()

    expect(wrapper.text()).toContain('沒有存取權限')
    expect(wrapper.text()).toContain('班級相簿')
    expect(wrapper.text()).toContain('原網址：/portal/albums')
    expect(wrapper.find('[data-test="go-home"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="relogin"]').exists()).toBe(true)
  })

  it('not-found（由 meta.errorType 決定）：顯示找不到頁面，不出現重新登入', () => {
    vi.mocked(getUserInfo).mockReturnValue(ADMIN)
    routeMock = { query: {}, meta: { errorType: 'not-found', bare: true } }
    const wrapper = mountView()

    expect(wrapper.text()).toContain('找不到這個頁面')
    expect(wrapper.find('[data-test="relogin"]').exists()).toBe(false)
  })

  it('回首頁依身分導向：teacher → /portal/home', async () => {
    vi.mocked(getUserInfo).mockReturnValue(TEACHER)
    routeMock = { query: { type: 'forbidden' }, meta: {} }
    const wrapper = mountView()

    await wrapper.find('[data-test="go-home"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/portal/home')
  })

  it("回首頁依身分導向：admin → '/'（由守衛自動落地）、platform admin → /platform/overview、未登入 → /login", async () => {
    vi.mocked(getUserInfo).mockReturnValue(ADMIN)
    routeMock = { query: { type: 'forbidden' }, meta: {} }
    let wrapper = mountView()
    await wrapper.find('[data-test="go-home"]').trigger('click')
    expect(pushMock).toHaveBeenLastCalledWith('/')

    vi.mocked(isPlatformAdmin).mockReturnValue(true)
    wrapper = mountView()
    await wrapper.find('[data-test="go-home"]').trigger('click')
    expect(pushMock).toHaveBeenLastCalledWith('/platform/overview')

    vi.mocked(getUserInfo).mockReturnValue(null)
    wrapper = mountView()
    await wrapper.find('[data-test="go-home"]').trigger('click')
    expect(pushMock).toHaveBeenLastCalledWith('/login')
  })

  it('重新登入：清除登入狀態後依身分導向對應登入頁', async () => {
    vi.mocked(getUserInfo).mockReturnValue(TEACHER)
    routeMock = { query: { type: 'forbidden' }, meta: {} }
    const wrapper = mountView()

    await wrapper.find('[data-test="relogin"]').trigger('click')
    await Promise.resolve()
    expect(clearAuth).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/portal/login')
  })
})
