import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

function setMobile(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches, media: '(max-width: 767.98px)', onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })
}

// 頁面實際 import：getMyPunchCorrections、createMyPunchCorrection（@/api/portal）
vi.mock('@/api/portal', () => ({
  getMyPunchCorrections: vi.fn(() => Promise.resolve({ data: [] })),
  createMyPunchCorrection: vi.fn(() => Promise.resolve({ data: {} })),
}))

import PortalPunchCorrectionView from '@/views/portal/PortalPunchCorrectionView.vue'

const stubs = {
  AdminListCards: {
    name: 'AdminListCards',
    props: ['items', 'columns', 'rowKey'],
    template: '<div class="alc-stub" :data-count="items.length"/>',
  },
  TeacherBottomSheet: true,
  PortalPunchCorrectionForm: true,
}

describe('PortalPunchCorrectionView 手機卡片視圖', () => {
  beforeEach(() => setMobile(false))

  it('桌機渲染 el-table、不渲染 AdminListCards', async () => {
    setMobile(false)
    const w = mount(PortalPunchCorrectionView, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(w.find('.el-table').exists()).toBe(true)
    expect(w.find('.alc-stub').exists()).toBe(false)
    w.unmount()
  })

  it('手機渲染 AdminListCards、不渲染 el-table', async () => {
    setMobile(true)
    const w = mount(PortalPunchCorrectionView, { global: { plugins: [ElementPlus], stubs } })
    await flushPromises()
    expect(w.find('.alc-stub').exists()).toBe(true)
    expect(w.find('.el-table').exists()).toBe(false)
    w.unmount()
  })
})
