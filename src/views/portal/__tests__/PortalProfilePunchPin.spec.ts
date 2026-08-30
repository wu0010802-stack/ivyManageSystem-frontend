import { describe, it, expect, vi } from 'vitest'
import { shallowMount, mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

// ---- composable mocks ----
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: { value: false }, cleanup: () => {} }),
}))
vi.mock('@/composables/useErrorNotify', () => ({
  useErrorNotify: () => ({ notify: vi.fn() }),
}))

// ---- QRCode mock ----
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,mock')) },
}))

// ---- lineBinding mock ----
vi.mock('@/api/lineBinding', () => ({
  getMyLineBinding: vi.fn(() => Promise.resolve({ data: { line_user_id: null } })),
  updateMyLineBinding: vi.fn(),
  deleteMyLineBinding: vi.fn(),
}))

// ---- portal mock：保留所有 export，只覆寫 setPunchPin ----
vi.mock('@/api/portal', async (orig) => {
  const actual = await (orig as () => Promise<Record<string, unknown>>)()
  return {
    ...actual,
    getProfile: vi.fn(() => Promise.resolve({ data: {} })),
    updateProfile: vi.fn(),
    setPunchPin: vi.fn(() => Promise.resolve({ data: { message: '打卡 PIN 已更新' } })),
  }
})

import PortalProfileView from '../PortalProfileView.vue'

describe('PortalProfileView 打卡 PIN', () => {
  it('PIN 與確認不一致時不送出 setPunchPin', async () => {
    const wrapper = shallowMount(PortalProfileView)
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      pinForm: { new_pin: string; confirm_pin: string }
      savePunchPin: () => Promise<void>
    }

    vm.pinForm.new_pin = '1234'
    vm.pinForm.confirm_pin = '9999'
    await vm.savePunchPin()

    const { setPunchPin } = await import('@/api/portal')
    expect(setPunchPin).not.toHaveBeenCalled()
  })

  it('PIN 一致且格式正確時呼叫 setPunchPin', async () => {
    const wrapper = shallowMount(PortalProfileView)
    await flushPromises()

    const vm = wrapper.vm as unknown as {
      pinForm: { new_pin: string; confirm_pin: string }
      savePunchPin: () => Promise<void>
    }

    vm.pinForm.new_pin = '1234'
    vm.pinForm.confirm_pin = '1234'
    await vm.savePunchPin()

    const { setPunchPin } = await import('@/api/portal')
    expect(setPunchPin).toHaveBeenCalledWith({ pin: '1234' })
  })
})


// ---- PIN 已設定/尚未設定狀態標籤（2026-08-24 has_punch_pin）----
// el-tag 文案是 slot 內容，shallowMount 的 stub 不渲染 slot，故此組用 full mount。
describe('PortalProfileView PIN 狀態標籤', () => {
  it('has_punch_pin=false 顯示「尚未設定」', async () => {
    const { getProfile } = await import('@/api/portal')
    vi.mocked(getProfile).mockResolvedValueOnce({
      data: { employee_id: 'T1', name: '老師', has_punch_pin: false },
    } as never)
    const wrapper = mount(PortalProfileView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const tag = wrapper.find('.pin-status-tag')
    expect(tag.exists()).toBe(true)
    expect(tag.text()).toBe('尚未設定')
  })

  it('has_punch_pin=true 顯示「已設定」', async () => {
    const { getProfile } = await import('@/api/portal')
    vi.mocked(getProfile).mockResolvedValueOnce({
      data: { employee_id: 'T1', name: '老師', has_punch_pin: true },
    } as never)
    const wrapper = mount(PortalProfileView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.find('.pin-status-tag').text()).toBe('已設定')
  })

  it('成功設定 PIN 後標籤即時翻成「已設定」', async () => {
    const { getProfile } = await import('@/api/portal')
    vi.mocked(getProfile).mockResolvedValueOnce({
      data: { employee_id: 'T1', name: '老師', has_punch_pin: false },
    } as never)
    const wrapper = mount(PortalProfileView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.find('.pin-status-tag').text()).toBe('尚未設定')

    const vm = wrapper.vm as unknown as {
      pinForm: { new_pin: string; confirm_pin: string }
      savePunchPin: () => Promise<void>
    }
    vm.pinForm.new_pin = '1234'
    vm.pinForm.confirm_pin = '1234'
    await vm.savePunchPin()
    await flushPromises()
    expect(wrapper.find('.pin-status-tag').text()).toBe('已設定')
  })
})
