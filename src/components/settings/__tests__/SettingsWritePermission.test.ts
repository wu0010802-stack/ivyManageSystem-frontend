import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

const hasPermissionMock = vi.fn<(permission: string) => boolean>()
vi.mock('@/utils/auth', () => ({
  hasPermission: (permission: string) => hasPermissionMock(permission),
}))

const getShiftTypesMock = vi.fn()
vi.mock('@/api/shifts', () => ({
  getShiftTypes: (...args: unknown[]) => getShiftTypesMock(...args),
  createShiftType: vi.fn(),
  updateShiftType: vi.fn(),
  deleteShiftType: vi.fn(),
}))

const getLineConfigMock = vi.fn()
vi.mock('@/api/lineConfig', () => ({
  getLineConfig: (...args: unknown[]) => getLineConfigMock(...args),
  updateLineConfig: vi.fn(),
  testLineNotify: vi.fn(),
}))

vi.mock('@/stores/shift', () => ({
  useShiftStore: () => ({ refresh: vi.fn() }),
}))
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import SettingsShiftTab from '../SettingsShiftTab.vue'
import SettingsLineTab from '../SettingsLineTab.vue'

describe('Settings mutation controls 權限分界', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasPermissionMock.mockImplementation((permission) => permission === 'SETTINGS_READ')
    getShiftTypesMock.mockResolvedValue({ data: [] })
    getLineConfigMock.mockResolvedValue({
      data: {
        is_enabled: false,
        target_id: null,
        has_token: true,
        has_secret: true,
      },
    })
  })

  it('沒有 SCHEDULE 時不顯示班別新增與寫入操作', async () => {
    const wrapper = mount(SettingsShiftTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()

    expect(hasPermissionMock).toHaveBeenCalledWith('SCHEDULE')
    expect(wrapper.findAll('button').some((button) => button.text().includes('新增班別'))).toBe(false)
  })

  it('僅有 SETTINGS_READ 時不顯示 LINE 儲存與真實測試推播操作', async () => {
    const wrapper = mount(SettingsLineTab, { global: { plugins: [ElementPlus] } })
    await flushPromises()

    expect(hasPermissionMock).toHaveBeenCalledWith('SETTINGS_WRITE')
    expect(wrapper.findAll('button').some((button) => button.text().includes('儲存設定'))).toBe(false)
    expect(wrapper.findAll('button').some((button) => button.text().includes('發送測試訊息'))).toBe(false)
  })
})
