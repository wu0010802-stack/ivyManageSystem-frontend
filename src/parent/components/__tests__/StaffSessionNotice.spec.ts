/**
 * StaffSessionNotice —— 「你現在不是家長身分」全頁提示。
 *
 * 觸發來源見 tests/unit/parent/api.staffSessionGate.test.ts：管理端與家長端
 * 同源共用同一顆 access_token cookie，先登管理端再開家長端時家長端全部 403。
 * 這個元件負責把那個狀態講清楚，並給兩條出路（清掉員工 session／直接去家長
 * 登入頁重新登入，後者會用新的家長 token 蓋掉那顆 cookie）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const logoutStaffSessionMock = vi.fn()
const fetchStaffSessionIdentityMock = vi.fn()

vi.mock('@/parent/api/auth', () => ({
  logoutStaffSession: (...a: unknown[]) => logoutStaffSessionMock(...a),
  fetchStaffSessionIdentity: (...a: unknown[]) => fetchStaffSessionIdentityMock(...a),
}))

vi.mock('@/parent/composables/useParentLogout', () => ({
  clearParentLocalState: vi.fn().mockResolvedValue(undefined),
}))

import StaffSessionNotice from '@/parent/components/StaffSessionNotice.vue'
import { useStaffSessionGate } from '@/parent/composables/useStaffSessionGate'

const gate = useStaffSessionGate()

beforeEach(() => {
  setActivePinia(createPinia())
  gate.reset()
  window.location.hash = ''
  logoutStaffSessionMock.mockResolvedValue({ data: {} })
  fetchStaffSessionIdentityMock.mockResolvedValue({ data: { name: '王小明', role: 'admin' } })
})

afterEach(() => {
  gate.reset()
})

describe('StaffSessionNotice', () => {
  it('閘門未開啟時不渲染', () => {
    const wrapper = mount(StaffSessionNotice)
    expect(wrapper.find('[data-testid="staff-session-notice"]').exists()).toBe(false)
  })

  it('閘門開啟時渲染，並顯示目前登入的員工身分', async () => {
    const wrapper = mount(StaffSessionNotice)
    gate.require()
    await flushPromises()

    const el = wrapper.find('[data-testid="staff-session-notice"]')
    expect(el.exists()).toBe(true)
    expect(el.text()).toContain('管理員')
    expect(el.text()).toContain('王小明')
  })

  it('查不到目前身分時仍要渲染提示（不因附加資訊失敗而失去出路）', async () => {
    fetchStaffSessionIdentityMock.mockRejectedValue(new Error('boom'))
    const wrapper = mount(StaffSessionNotice)
    gate.require()
    await flushPromises()

    expect(wrapper.find('[data-testid="staff-session-notice"]').exists()).toBe(true)
  })

  it('「登出目前身分」呼叫管理端 logout 後導回家長登入頁', async () => {
    const wrapper = mount(StaffSessionNotice)
    gate.require()
    await flushPromises()

    await wrapper.find('[data-testid="staff-session-logout"]').trigger('click')
    await flushPromises()

    expect(logoutStaffSessionMock).toHaveBeenCalledTimes(1)
    expect(window.location.hash).toBe('#/login')
    expect(gate.visible.value).toBe(false)
  })

  it('後端 logout 失敗仍要把使用者送到家長登入頁（別把人卡在遮罩裡）', async () => {
    logoutStaffSessionMock.mockRejectedValue(new Error('network'))
    const wrapper = mount(StaffSessionNotice)
    gate.require()
    await flushPromises()

    await wrapper.find('[data-testid="staff-session-logout"]').trigger('click')
    await flushPromises()

    expect(window.location.hash).toBe('#/login')
    expect(gate.visible.value).toBe(false)
  })

  it('「直接前往家長登入頁」不呼叫 logout（保留管理端 session）', async () => {
    const wrapper = mount(StaffSessionNotice)
    gate.require()
    await flushPromises()

    await wrapper.find('[data-testid="staff-session-goto-login"]').trigger('click')
    await flushPromises()

    expect(logoutStaffSessionMock).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('#/login')
    expect(gate.visible.value).toBe(false)
  })
})
