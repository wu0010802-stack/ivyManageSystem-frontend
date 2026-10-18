import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
let routeMock: { query: Record<string, unknown>; meta: Record<string, unknown> }

// 模擬 router.resolve：只認得 /portal/albums 與 /employees，其餘落 404 catch-all
const KNOWN_ROUTES: Record<string, { name: string; title: string }> = {
  '/portal/albums': { name: 'portal-albums', title: '班級相簿' },
  '/employees': { name: 'employees', title: '員工管理' },
}
const resolveMock = vi.fn((to: string) => {
  const path = to.split('?')[0] ?? ''
  const known = KNOWN_ROUTES[path]
  if (known) return { name: known.name, path, meta: { title: known.title }, matched: [{}] }
  return { name: 'not-found', path, meta: { title: '找不到頁面', errorPage: true }, matched: [{}] }
})

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: pushMock, replace: vi.fn(), resolve: resolveMock }),
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
const FORBIDDEN_META = { errorType: 'forbidden' }

describe('ErrorStateView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeMock = { query: {}, meta: {} }
  })

  it('forbidden：顯示權限說明（含功能名稱與原網址），並提供回首頁/重新登入', () => {
    vi.mocked(getUserInfo).mockReturnValue(TEACHER)
    routeMock = {
      query: { type: 'forbidden', feature: '班級相簿', from: '/portal/albums' },
      meta: FORBIDDEN_META,
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
    routeMock = { query: { type: 'forbidden' }, meta: FORBIDDEN_META }
    const wrapper = mountView()

    await wrapper.find('[data-test="go-home"]').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/portal/home')
  })

  it("回首頁依身分導向：admin → '/'（由守衛自動落地）、platform admin → /platform/overview、未登入 → /login", async () => {
    vi.mocked(getUserInfo).mockReturnValue(ADMIN)
    routeMock = { query: { type: 'forbidden' }, meta: FORBIDDEN_META }
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
    routeMock = { query: { type: 'forbidden' }, meta: FORBIDDEN_META }
    const wrapper = mountView()

    await wrapper.find('[data-test="relogin"]').trigger('click')
    await Promise.resolve()
    expect(clearAuth).toHaveBeenCalledTimes(1)
    expect(pushMock).toHaveBeenCalledWith('/portal/login')
  })

  describe('F31：query 不得偽造頁面內容（內容偽造／釣魚文案）', () => {
    const PHISH = '薪資系統」權限。您的帳號已被停用，請立即加 LINE ID：@fake-ivy 驗證身分「'

    it('404 catch-all 上 query.type=forbidden 不得把頁面改成 403（無重新登入鈕、無權限提示）', () => {
      vi.mocked(getUserInfo).mockReturnValue(null)
      routeMock = {
        query: { type: 'forbidden', feature: PHISH, from: '系統安全中心通知' },
        meta: { errorType: 'not-found', noAuth: true, bare: true, errorPage: true },
      }
      const wrapper = mountView()

      expect(wrapper.text()).toContain('找不到這個頁面')
      expect(wrapper.text()).not.toContain('沒有存取權限')
      expect(wrapper.find('[data-test="relogin"]').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('@fake-ivy')
      expect(wrapper.text()).not.toContain('系統安全中心通知')
    })

    it('403 頁不顯示 query.feature 原文；功能名稱一律由 from 對應的真實路由 title 決定', () => {
      vi.mocked(getUserInfo).mockReturnValue(ADMIN)
      routeMock = {
        query: { type: 'forbidden', feature: PHISH, from: '/employees' },
        meta: FORBIDDEN_META,
      }
      const wrapper = mountView()

      expect(wrapper.text()).not.toContain('@fake-ivy')
      expect(wrapper.text()).toContain('你目前沒有「員工管理」的使用權限。')
      expect(wrapper.text()).toContain('原網址：/employees')
    })

    it('from 不是站內真實路由（任意文字、外部網址、protocol-relative、404 路徑）時不顯示原網址與功能名稱', () => {
      vi.mocked(getUserInfo).mockReturnValue(ADMIN)
      for (const from of [
        '系統安全中心通知：請加 LINE @fake-ivy',
        'https://evil.example/login',
        '//evil.example/login',
        '/請加LINE@fake-ivy驗證身分',
      ]) {
        routeMock = { query: { type: 'forbidden', feature: PHISH, from }, meta: FORBIDDEN_META }
        const wrapper = mountView()
        expect(wrapper.text()).not.toContain('原網址')
        expect(wrapper.text()).not.toContain('@fake-ivy')
        expect(wrapper.text()).not.toContain('evil.example')
        expect(wrapper.text()).toContain('你目前沒有這個頁面的使用權限。')
      }
    })

    it('原網址只顯示路由 path，不回顯 query string', () => {
      vi.mocked(getUserInfo).mockReturnValue(ADMIN)
      routeMock = {
        query: { type: 'forbidden', from: '/employees?note=請加LINE@fake-ivy' },
        meta: FORBIDDEN_META,
      }
      const wrapper = mountView()
      expect(wrapper.text()).toContain('原網址：/employees')
      expect(wrapper.text()).not.toContain('@fake-ivy')
    })
  })
})
