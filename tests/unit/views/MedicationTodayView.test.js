import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'

// 載入失敗時必須與「今日真的沒有用藥任務」明顯區隔，否則老師可能漏餵藥（QA P1-4）。
const { mockGetToday } = vi.hoisted(() => ({ mockGetToday: vi.fn() }))

vi.mock('@/api/studentHealth', () => ({
  getTodayMedication: (...a) => mockGetToday(...a),
  administerMedication: vi.fn(),
  skipMedication: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/utils/error', () => ({ apiError: vi.fn() }))

import MedicationTodayView from '@/views/MedicationTodayView.vue'

function mountView() {
  return shallowMount(MedicationTodayView, {
    global: {
      stubs: {
        // 自訂 stub 讓「真空狀態」可被精準偵測
        'el-empty': { template: '<div class="stub-empty"></div>' },
      },
    },
  })
}

describe('MedicationTodayView 載入失敗 vs 真空狀態', () => {
  beforeEach(() => {
    mockGetToday.mockReset()
  })

  it('載入失敗時顯示錯誤態，且不顯示「今日沒有用藥任務」空狀態', async () => {
    mockGetToday.mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.med-load-error').exists()).toBe(true)
    expect(wrapper.find('.stub-empty').exists()).toBe(false)
  })

  it('成功載入且無任務時顯示空狀態，不顯示錯誤態', async () => {
    mockGetToday.mockResolvedValue({ data: { orders: [], pending: 0, administered: 0, skipped: 0 } })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.stub-empty').exists()).toBe(true)
    expect(wrapper.find('.med-load-error').exists()).toBe(false)
  })
})
