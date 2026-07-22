import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const hasPermissionMock = vi.hoisted(() => vi.fn())
vi.mock('@/utils/auth', () => ({ hasPermission: hasPermissionMock }))

import OverviewTab from '../OverviewTab.vue'

const profile = {
  basic: {},
  lifecycle: {},
  attendance_summary: {},
  fee_summary: { total_due: 10000, total_paid: 6000, outstanding: 4000 },
  guardians: [],
  incident_summary: [],
}

describe('OverviewTab 費用摘要權限', () => {
  beforeEach(() => hasPermissionMock.mockReset())

  it('缺 FEES_READ 時不渲染費用金額卡片', () => {
    hasPermissionMock.mockReturnValue(false)
    const wrapper = mount(OverviewTab, { props: { profile }, shallow: true })

    expect(wrapper.text()).not.toContain('學費狀態')
    expect(wrapper.text()).not.toContain('10000')
  })

  it('有 FEES_READ 時顯示費用摘要', () => {
    hasPermissionMock.mockImplementation((code: string) => code === 'FEES_READ')
    const wrapper = mount(OverviewTab, { props: { profile }, shallow: true })

    expect(wrapper.text()).toContain('學費狀態')
    expect(wrapper.text()).toContain('10000')
  })
})
