/**
 * tests/unit/views/portal/PortalAttendanceView.scheduleEntry.test.ts
 *
 * Phase 1 殼層改版：排班 tab 退出底部導覽後，出勤頁補「我的排班」入口列
 * （手機限定；桌機側欄仍有排班項）。
 *
 * (a) 手機模式渲染入口列，含 swapPendingCount badge
 * (b) 點擊導向 /portal/schedule
 * (c) 桌機模式不渲染（側欄已有入口，避免重複）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ElementPlus from 'element-plus'

const mockIsMobile = ref(true)
vi.mock('@/composables/useIsMobile', () => ({
  useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }),
}))

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

vi.mock('@/api/portal', () => ({
  getAttendanceSheet: vi.fn(() =>
    Promise.resolve({ data: { employee_name: '陳老師', summary: {}, days: [] } }),
  ),
  getAttendanceSheetPdf: vi.fn(() => Promise.resolve({ data: new Blob() })),
  getSwapPendingCount: vi.fn(() => Promise.resolve({ data: { pending_count: 2 } })),
}))

vi.mock('@/utils/printPdfWindow', () => ({
  openPdfInNewTab: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({
  getUserInfo: () => ({ title: '幼教老師' }),
}))

import PortalAttendanceView from '@/views/portal/PortalAttendanceView.vue'

const stubs = {
  AttendanceMonthSticky: true,
  AttendanceStatsRow: true,
  AttendanceCardsView: true,
  AttendanceTableView: true,
}

const doMount = async () => {
  const wrapper = mount(PortalAttendanceView, {
    global: { plugins: [ElementPlus], stubs },
  })
  await flushPromises()
  return wrapper
}

describe('PortalAttendanceView — 我的排班入口列', () => {
  beforeEach(() => {
    routerPush.mockClear()
    mockIsMobile.value = true
  })

  it('(a) 手機模式渲染入口列與 swap badge', async () => {
    const wrapper = await doMount()
    const entry = wrapper.find('.schedule-entry')
    expect(entry.exists()).toBe(true)
    expect(entry.text()).toContain('我的排班')
    expect(entry.find('.schedule-entry__badge').text()).toBe('2')
    wrapper.unmount()
  })

  it('(b) 點擊導向 /portal/schedule', async () => {
    const wrapper = await doMount()
    await wrapper.find('.schedule-entry').trigger('click')
    expect(routerPush).toHaveBeenCalledWith('/portal/schedule')
    wrapper.unmount()
  })

  it('(c) 桌機模式不渲染', async () => {
    mockIsMobile.value = false
    const wrapper = await doMount()
    expect(wrapper.find('.schedule-entry').exists()).toBe(false)
    wrapper.unmount()
  })
})
