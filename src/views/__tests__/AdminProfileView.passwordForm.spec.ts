/**
 * AdminProfileView — 修改密碼區塊已改用共用 PasswordChangeForm（與強制改密頁同一份），
 * 並維持既有行為：成功後提示並登出、導回 /login，請使用者以新密碼重新登入。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'

const mockClearAuth = vi.fn(() => Promise.resolve())
vi.mock('@/utils/auth', () => ({
  clearAuth: () => mockClearAuth(),
  // 無 employee_id：不會載入員工資料／LINE 綁定，頁面只剩帳號資訊與修改密碼
  getUserInfo: () => ({ role: 'admin', username: 'sysadmin', name: '', employee_id: null }),
}))

vi.mock('@/api/portal', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}))
vi.mock('@/api/lineBinding', () => ({
  getMyLineBinding: vi.fn(),
  updateMyLineBinding: vi.fn(),
  deleteMyLineBinding: vi.fn(),
}))
vi.mock('@/api/auth', () => ({
  changePassword: vi.fn(),
}))

import AdminProfileView from '../AdminProfileView.vue'
import PasswordChangeForm from '@/components/auth/PasswordChangeForm.vue'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
      { path: '/profile', component: AdminProfileView },
    ],
  })
  await router.push('/profile')
  await router.isReady()
  const pushSpy = vi.spyOn(router, 'push')
  const wrapper = mount(AdminProfileView, {
    attachTo: document.body,
    global: { plugins: [ElementPlus, router] },
  })
  await flushPromises()
  return { wrapper, pushSpy }
}

beforeEach(() => {
  mockClearAuth.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminProfileView — 修改密碼區塊', () => {
  it('使用共用的 PasswordChangeForm（不再自帶第二套表單與規則）', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.findComponent(PasswordChangeForm).exists()).toBe(true)
    // 只有這一份表單的三個密碼欄位
    expect(wrapper.findAll('input[type="password"]')).toHaveLength(3)
  })

  it('成功後約 1.2 秒登出並回 /login（既有行為不變）', async () => {
    const { wrapper, pushSpy } = await mountView()
    vi.useFakeTimers()

    wrapper.findComponent(PasswordChangeForm).vm.$emit('success')
    await flushPromises()
    // 立刻不登出：讓使用者看得到成功提示
    expect(mockClearAuth).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1300)

    expect(mockClearAuth).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledWith('/login')
  })
})
