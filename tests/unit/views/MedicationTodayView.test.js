import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'

// 載入失敗時必須與「今日真的沒有用藥任務」明顯區隔，否則老師可能漏餵藥（QA P1-4）。
const { mockGetToday, mockAdminister, mockSkip, msgError, confirmMock } = vi.hoisted(() => ({
  mockGetToday: vi.fn(),
  mockAdminister: vi.fn(),
  mockSkip: vi.fn(),
  msgError: vi.fn(),
  confirmMock: vi.fn(),
}))

vi.mock('@/api/studentHealth', () => ({
  getTodayMedication: (...a) => mockGetToday(...a),
  administerMedication: (...a) => mockAdminister(...a),
  skipMedication: (...a) => mockSkip(...a),
}))
vi.mock('element-plus', async (orig) => ({
  ...(await orig()),
  ElMessage: { success: vi.fn(), warning: vi.fn(), error: (...a) => msgError(...a) },
  ElMessageBox: { confirm: (...a) => confirmMock(...a) },
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/utils/error', () => ({ apiError: (_e, fallback) => fallback }))

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

const ORDER = {
  id: 1, student_name: '王小明', medication_name: '退燒藥', dose: '5ml',
  logs: [{ id: 11, scheduled_time: '12:00', status: 'pending' }],
}

describe('MedicationTodayView 餵藥／跳過的寫入安全', () => {
  beforeEach(() => {
    mockGetToday.mockReset().mockResolvedValue({ data: { orders: [ORDER], pending: 1, administered: 0, skipped: 0 } })
    mockAdminister.mockReset().mockResolvedValue({ data: {} })
    mockSkip.mockReset()
    msgError.mockReset()
    confirmMock.mockReset()
  })

  it('餵藥前先確認並帶出學生、藥名、時段；取消則不寫入', async () => {
    confirmMock.mockRejectedValue('cancel')
    const wrapper = mountView()
    await flushPromises()
    await wrapper.vm.doAdminister(ORDER, ORDER.logs[0])
    const msg = String(confirmMock.mock.calls[0][0])
    expect(msg).toContain('王小明')
    expect(msg).toContain('退燒藥')
    expect(msg).toContain('12:00')
    expect(mockAdminister).not.toHaveBeenCalled()
  })

  it('確認後寫入', async () => {
    confirmMock.mockResolvedValue('confirm')
    const wrapper = mountView()
    await flushPromises()
    await wrapper.vm.doAdminister(ORDER, ORDER.logs[0])
    expect(mockAdminister).toHaveBeenCalledWith(11, {})
  })

  it('餵藥失敗必須顯示錯誤（不可靜默）', async () => {
    confirmMock.mockResolvedValue('confirm')
    mockAdminister.mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.vm.doAdminister(ORDER, ORDER.logs[0])
    expect(msgError).toHaveBeenCalledWith('餵藥失敗')
  })

  it('跳過失敗必須顯示錯誤（不可靜默）', async () => {
    mockSkip.mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()
    wrapper.vm.openSkip(11)
    wrapper.vm.skipDialog.reason = '家長取消'
    await wrapper.vm.doSkip()
    expect(msgError).toHaveBeenCalledWith('跳過失敗')
  })
})
