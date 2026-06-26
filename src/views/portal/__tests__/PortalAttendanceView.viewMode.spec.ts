import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))
// fetchSheet 永不 resolve，避免依賴回傳資料形狀；子元件由 shallowMount stub。
vi.mock('@/api/portal', () => ({
  getAttendanceSheet: vi.fn(() => new Promise(() => {})),
  getAttendanceSheetPdf: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ name: 'T', employee_id: 1 }),
}))

import PortalAttendanceView from '@/views/portal/PortalAttendanceView.vue'

describe('PortalAttendanceView viewMode 隨手機態切換', () => {
  it('手機載入時用 cards、切回桌機用 table', async () => {
    mockIsMobile.value = true
    const wrapper = shallowMount(PortalAttendanceView)
    await nextTick()
    // viewMode='cards'：cards-wrapper 在、grid-card 不在
    expect(wrapper.find('.cards-wrapper').exists()).toBe(true)
    expect(wrapper.find('.grid-card').exists()).toBe(false)

    mockIsMobile.value = false
    await nextTick()
    // viewMode='table'：grid-card 在、cards-wrapper 不在
    expect(wrapper.find('.grid-card').exists()).toBe(true)
    expect(wrapper.find('.cards-wrapper').exists()).toBe(false)
  })
})
