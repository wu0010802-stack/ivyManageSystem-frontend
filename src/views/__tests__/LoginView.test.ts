/**
 * LoginView（管理端登入頁）— 角色登入放行邏輯。
 *
 * Bug: 舊邏輯寫死 `role !== 'admin'` 才放行，導致 /settings 把帳號角色
 * 從系統管理員改成園長/主管/會計等其他管理端角色後，該帳號無法登入後台
 * （後端已允許登入，僅前端多做了一次錯誤的角色白名單檢查）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'

const mockLogin = vi.fn()
vi.mock('@/api/auth', () => ({
  login: (...args: unknown[]) => mockLogin(...args),
}))

const mockSetUserInfo = vi.fn()
vi.mock('@/utils/auth', () => ({
  setUserInfo: (...args: unknown[]) => mockSetUserInfo(...args),
  // 測試資料無 flags，簡化為硬編碼角色判斷（與 PORTAL_ONLY_ROLES fallback 語意一致）。
  isPortalOnlyUser: (info: { role?: string } | null | undefined) =>
    ['teacher', 'parent'].includes(info?.role ?? ''),
}))

const mockElMessageError = vi.fn()
const mockElMessageSuccess = vi.fn()
vi.mock('element-plus', () => ({
  ElMessage: {
    error: (...args: unknown[]) => mockElMessageError(...args),
    success: (...args: unknown[]) => mockElMessageSuccess(...args),
    info: vi.fn(),
  },
}))

import LoginView from '../LoginView.vue'

function createTestRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
      { path: '/change-password', component: { template: '<div />' } },
    ],
  })
}

const globalStubs = {
  'el-form': { template: '<form><slot /></form>', methods: { validate: () => Promise.resolve() } },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-input': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
}

async function mountAndSubmit(role: string) {
  mockLogin.mockResolvedValue({ data: { user: { role, name: '測試使用者' } } })
  const router = createTestRouter()
  await router.push('/login')
  const wrapper = mount(LoginView, { global: { plugins: [router], stubs: globalStubs } })
  const inputs = wrapper.findAll('input')
  await inputs[0].setValue('user01')
  await inputs[1].setValue('password123')
  await wrapper.find('button').trigger('click')
  await flushPromises()
  return { wrapper, router }
}

beforeEach(() => {
  mockLogin.mockReset()
  mockSetUserInfo.mockReset()
  mockElMessageError.mockReset()
  mockElMessageSuccess.mockReset()
})

describe('LoginView（管理端）— 角色登入放行', () => {
  it.each(['admin', 'principal', 'supervisor', 'hr', 'accountant'])(
    'role=%s 登入成功時應放行進入後台',
    async (role) => {
      await mountAndSubmit(role)
      expect(mockSetUserInfo).toHaveBeenCalledWith(expect.objectContaining({ role }))
      expect(mockElMessageError).not.toHaveBeenCalled()
    },
  )

  it('role=teacher 登入時不應建立管理端 session（教師僅走 Portal）', async () => {
    await mountAndSubmit('teacher')
    expect(mockSetUserInfo).not.toHaveBeenCalled()
  })

  it('role=parent 登入時不應建立管理端 session', async () => {
    await mountAndSubmit('parent')
    expect(mockSetUserInfo).not.toHaveBeenCalled()
  })
})

/**
 * 登入互動 UX（2026-10-29）：錯誤常駐顯示、Enter 送出、防連點、強制改密導向。
 * 文案不區分「帳號不存在」與「密碼錯誤」——前端只顯示後端給的訊息，不自行細分。
 */
describe('LoginView（管理端）— 互動 UX', () => {
  const uxStubs = {
    ...globalStubs,
    'el-alert': { props: ['title'], template: '<div data-test="login-error" role="alert">{{ title }}</div>' },
  }

  async function mountLogin() {
    const router = createTestRouter()
    await router.push('/login')
    const wrapper = mount(LoginView, { global: { plugins: [router], stubs: uxStubs } })
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('user01')
    await inputs[1].setValue('wrong-password')
    return { wrapper, router, inputs }
  }

  it('登入失敗：訊息常駐顯示在表單內，不再只丟會消失的 toast', async () => {
    mockLogin.mockRejectedValue({ displayMessage: '帳號或密碼錯誤' })
    const { wrapper } = await mountLogin()

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="login-error"]').text()).toBe('帳號或密碼錯誤')
    expect(mockElMessageError).not.toHaveBeenCalled()
    expect(mockSetUserInfo).not.toHaveBeenCalled()
  })

  it('後端沒給訊息時顯示通用文案（不細分帳號存在與否）', async () => {
    mockLogin.mockRejectedValue(new Error('network'))
    const { wrapper } = await mountLogin()

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="login-error"]').text()).toBe('登入失敗，請確認帳號密碼')
  })

  it('開始修改帳號或密碼後，上一次的錯誤訊息收掉', async () => {
    mockLogin.mockRejectedValue({ displayMessage: '帳號或密碼錯誤' })
    const { wrapper, inputs } = await mountLogin()
    await wrapper.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-test="login-error"]').exists()).toBe(true)

    await inputs[1].setValue('another-try')

    expect(wrapper.find('[data-test="login-error"]').exists()).toBe(false)
  })

  it('教師帳號走管理端登入：顯示導引文案且不建立管理端 session', async () => {
    mockLogin.mockResolvedValue({ data: { user: { role: 'teacher', name: '王老師' } } })
    const { wrapper } = await mountLogin()

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="login-error"]').text()).toContain('教職員入口')
    expect(mockSetUserInfo).not.toHaveBeenCalled()
  })

  it('在帳號欄按 Enter 也會送出（不只密碼欄）', async () => {
    mockLogin.mockResolvedValue({ data: { user: { role: 'admin', name: '管理員' } } })
    const { inputs } = await mountLogin()

    await inputs[0].trigger('keyup.enter')
    await flushPromises()

    expect(mockLogin).toHaveBeenCalledTimes(1)
    expect(mockLogin).toHaveBeenCalledWith('user01', 'wrong-password')
  })

  it('登入進行中連按 Enter／連點只會送出一次', async () => {
    let resolveLogin: (value: unknown) => void = () => {}
    mockLogin.mockReturnValue(new Promise((resolve) => { resolveLogin = resolve }))
    const { wrapper, inputs } = await mountLogin()

    await inputs[1].trigger('keyup.enter')
    await inputs[1].trigger('keyup.enter')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(mockLogin).toHaveBeenCalledTimes(1)

    resolveLogin({ data: { user: { role: 'admin', name: '管理員' } } })
    await flushPromises()
  })

  it('後端標記必須改密碼 → 導向 /change-password，旗標寫入 userInfo', async () => {
    mockLogin.mockResolvedValue({
      data: { user: { role: 'admin', name: '管理員' }, must_change_password: true },
    })
    const { wrapper, router } = await mountLogin()

    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(mockSetUserInfo).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin', must_change_password: true }),
    )
    expect(router.currentRoute.value.path).toBe('/change-password')
  })
})
