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
import AttendanceCardsView from '@/views/portal/components/attendance/AttendanceCardsView.vue'
import AttendanceTableView from '@/views/portal/components/attendance/AttendanceTableView.vue'

describe('PortalAttendanceView viewMode 隨手機態切換', () => {
  it('手機載入時用 cards、切回桌機用 table', async () => {
    mockIsMobile.value = true
    const wrapper = shallowMount(PortalAttendanceView)
    await nextTick()
    expect(wrapper.findComponent(AttendanceCardsView).exists()).toBe(true)
    expect(wrapper.findComponent(AttendanceTableView).exists()).toBe(false)

    mockIsMobile.value = false
    await nextTick()
    expect(wrapper.findComponent(AttendanceTableView).exists()).toBe(true)
    expect(wrapper.findComponent(AttendanceCardsView).exists()).toBe(false)
  })
})
