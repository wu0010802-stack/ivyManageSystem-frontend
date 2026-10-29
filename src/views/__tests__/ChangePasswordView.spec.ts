/**
 * ChangePasswordView（強制改密頁）。
 *
 * 重點：① 共用 PasswordChangeForm ② 有「登出」出口（走既有 clearAuth 流程）而不是把人困死
 * ③ 成功後才清 must_change_password 旗標。守衛本身（改密前進不了別頁）見
 * src/router/__tests__/mustChangePasswordGuard.spec.ts。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'

const mockClearAuth = vi.fn(() => Promise.resolve())
const mockClearMustChangePassword = vi.fn()
const mockGetUserInfo = vi.fn()
vi.mock('@/utils/auth', () => ({
  clearAuth: () => mockClearAuth(),
  clearMustChangePassword: () => mockClearMustChangePassword(),
  getUserInfo: () => mockGetUserInfo(),
}))

vi.mock('@/api/auth', () => ({
  changePassword: vi.fn(),
}))

import ChangePasswordView from '../ChangePasswordView.vue'
import PasswordChangeForm from '@/components/auth/PasswordChangeForm.vue'
import PageHeader from '@/components/common/PageHeader.vue'

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
      { path: '/change-password', component: ChangePasswordView },
    ],
  })
  await router.push('/change-password')
  await router.isReady()
  const pushSpy = vi.spyOn(router, 'push')
  const wrapper = mount(ChangePasswordView, {
    attachTo: document.body,
    global: { plugins: [ElementPlus, router] },
  })
  await flushPromises()
  return { wrapper, router, pushSpy }
}

beforeEach(() => {
  mockClearAuth.mockClear()
  mockClearMustChangePassword.mockClear()
  mockGetUserInfo.mockReset()
  mockGetUserInfo.mockReturnValue({ role: 'admin', name: '王小明', username: 'xiaoming', must_change_password: true })
})

describe('ChangePasswordView — 版面與共用表單', () => {
  it('使用與個人資料頁相同的共用元件 PasswordChangeForm', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.findComponent(PasswordChangeForm).exists()).toBe(true)
  })

  it('套用 PageHeader（與其他後台頁一致），不再用 100vh 置中大卡片', async () => {
    const { wrapper } = await mountView()
    const header = wrapper.findComponent(PageHeader)
    expect(header.exists()).toBe(true)
    // e2e（ivy-backend/e2e/tests/admin-login.spec.ts）以此標題辨識強制改密頁，勿隨意改字
    expect(header.props('title')).toBe('請修改初始密碼')
  })

  it('顯示目前登入帳號（優先姓名）', async () => {
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-test="account-hint"]').text()).toContain('王小明')
  })

  it('未綁定員工的管理帳號沒有姓名時，退而顯示登入帳號', async () => {
    mockGetUserInfo.mockReturnValue({ role: 'admin', name: '', username: 'sysadmin', must_change_password: true })
    const { wrapper } = await mountView()
    expect(wrapper.find('[data-test="account-hint"]').text()).toContain('sysadmin')
  })
})

describe('ChangePasswordView — 登出出口', () => {
  it('頁面上有「登出」按鈕', async () => {
    const { wrapper } = await mountView()
    const btn = wrapper.find('[data-test="forced-logout"]')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toContain('登出')
  })

  it('按下登出：呼叫既有 clearAuth 並回到 /login，且不會清掉強制改密旗標', async () => {
    const { wrapper, pushSpy } = await mountView()

    await wrapper.find('[data-test="forced-logout"]').trigger('click')
    await flushPromises()

    expect(mockClearAuth).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledWith('/login')
    expect(mockClearMustChangePassword).not.toHaveBeenCalled()
  })

  it('密碼送出中停用登出，避免改到一半被登出造成狀態錯亂', async () => {
    const { wrapper } = await mountView()
    wrapper.findComponent(PasswordChangeForm).vm.$emit('update:submitting', true)
    await flushPromises()

    const btn = wrapper.find('[data-test="forced-logout"]')
    expect(btn.attributes('disabled')).toBeDefined()
    await btn.trigger('click')
    expect(mockClearAuth).not.toHaveBeenCalled()
  })
})

describe('ChangePasswordView — 改密成功', () => {
  it('成功後才清 must_change_password 旗標並進入系統首頁', async () => {
    const { wrapper, pushSpy } = await mountView()
    expect(mockClearMustChangePassword).not.toHaveBeenCalled()

    wrapper.findComponent(PasswordChangeForm).vm.$emit('success')
    await flushPromises()

    expect(mockClearMustChangePassword).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledWith('/')
    expect(mockClearAuth).not.toHaveBeenCalled()
  })
})
