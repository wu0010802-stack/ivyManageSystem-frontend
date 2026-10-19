import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const pushMock = vi.fn()
let routeMock: { query: Record<string, unknown>; meta: Record<string, unknown> }

// router.resolve 用真的 vue-router（createRouter + memory history），含動態參數路由，
// 才抓得到「from resolve 到 /students/profile/:id 時 params 夾帶攻擊者文字」這類繞法。
const { realResolve } = vi.hoisted(() => ({ realResolve: { fn: null as null | ((to: string) => unknown) } }))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  const Stub = { render: () => null }
  const router = actual.createRouter({
    history: actual.createMemoryHistory(),
    routes: [
      { path: '/portal/albums', name: 'portal-albums', component: Stub, meta: { title: '班級相簿' } },
      { path: '/portal/albums/:id', name: 'portal-album-detail', component: Stub, meta: { title: '相簿內容' } },
      { path: '/employees', name: 'employees', component: Stub, meta: { title: '員工管理' } },
      { path: '/students/profile/:id', name: 'student-profile', component: Stub, meta: { title: '學生檔案' } },
      { path: '/surveys/:id', name: 'survey-detail', component: Stub, meta: { title: '問卷內容' } },
      {
        path: '/:pathMatch(.*)*',
        name: 'not-found',
        component: Stub,
        meta: { title: '找不到頁面', errorPage: true, errorType: 'not-found' },
      },
    ],
  })
  realResolve.fn = (to: string) => router.resolve(to)
  return {
    useRoute: () => routeMock,
    useRouter: () => ({ push: pushMock, replace: vi.fn(), resolve: (to: string) => realResolve.fn!(to) }),
  }
})
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

    it('from resolve 到動態參數路由但 params 夾帶任意文字時，不顯示原網址（功能名稱仍取固定 title）', () => {
      vi.mocked(getUserInfo).mockReturnValue(null)
      for (const from of [
        '/students/profile/您的帳號已停用 請加LINE @fake-ivy',
        '/surveys/%E8%AB%8B%E5%8A%A0LINE%20%40fake-ivy',
        '/portal/albums/12abc@fake-ivy',
      ]) {
        routeMock = { query: { from }, meta: FORBIDDEN_META }
        const wrapper = mountView()
        expect(wrapper.text()).not.toContain('原網址')
        expect(wrapper.text()).not.toContain('@fake-ivy')
        expect(wrapper.text()).not.toContain('請加')
        expect(wrapper.text()).not.toContain('帳號已停用')
      }
      routeMock = { query: { from: '/students/profile/請加LINE@fake-ivy' }, meta: FORBIDDEN_META }
      expect(mountView().text()).toContain('你目前沒有「學生檔案」的使用權限。')
    })

    it('動態參數皆為純數字或 UUID 時才顯示原網址', () => {
      vi.mocked(getUserInfo).mockReturnValue(ADMIN)
      routeMock = { query: { from: '/students/profile/42' }, meta: FORBIDDEN_META }
      expect(mountView().text()).toContain('原網址：/students/profile/42')

      const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
      routeMock = { query: { from: `/surveys/${uuid}` }, meta: FORBIDDEN_META }
      expect(mountView().text()).toContain(`原網址：/surveys/${uuid}`)
    })
  })
})
