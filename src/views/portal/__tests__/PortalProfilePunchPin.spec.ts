import { describe, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'

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
