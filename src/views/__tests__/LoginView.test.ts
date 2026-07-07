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
