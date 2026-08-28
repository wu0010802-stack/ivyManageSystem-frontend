import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

const fakeSwap = {
  id: 1,
  swap_date: '2026-08-05',
  requester_name: '甲老師',
  requester_shift: '早班',
  target_name: '乙老師',
  target_shift: '晚班',
  reason: '家中臨時有事需要調整',
  status: 'accepted',
  target_responded_at: '2026-08-03 12:00',
  created_at: '2026-08-02 09:00',
}
vi.mock('@/api/shifts', () => ({
  getAssignments: vi.fn(() => Promise.resolve({ data: [] })),
  saveAssignments: vi.fn(),
  getDaily: vi.fn(() => Promise.resolve({ data: [] })),
  saveDaily: vi.fn(),
  deleteDaily: vi.fn(),
  getSwapHistory: vi.fn(() => Promise.resolve({ data: [fakeSwap] })),
  getShiftImportTemplate: vi.fn(),
  importShifts: vi.fn(),
  exportShifts: vi.fn(),
  getLeaveContext: vi.fn(() => Promise.resolve({ data: [] })),
  // shift store 由同一個模組取用，未 mock 會整包 import 失敗
  getShiftTypes: vi.fn(() => Promise.resolve({ data: [] })),
}))
vi.mock('@/stores/shift', () => ({
  useShiftStore: () => ({ activeShiftTypes: ref([]), fetchShiftTypes: vi.fn(() => Promise.resolve()) }),
}))
// 本頁以 storeToRefs 解構 store，故 mock 的 state 必須是 ref（否則 storeToRefs 取不到 .value）
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({
    employees: ref([{ id: 1, name: '甲老師', is_active: true, classroom_id: 3, classroom_name: '向日葵班' }]),
    fetchEmployees: vi.fn(() => Promise.resolve()),
  }),
}))
// 只替換 storeToRefs（讓它對「已是 ref 的 plain object mock」直接透傳），
// 其餘 pinia 匯出保留原樣——整包 mock 會讓其他 store 的 defineStore 消失
vi.mock('pinia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('pinia')>()),
  storeToRefs: (store: Record<string, unknown>) => store,
}))

import ScheduleView from '@/views/ScheduleView.vue'

const globalStubs = {
  stubs: {
    'el-tabs': { template: '<div><slot /></div>' },
    'el-tab-pane': { template: '<div><slot /></div>' },
    'el-card': { template: '<div><slot /></div>' },
    'el-dialog': { template: '<div></div>' },
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

describe('ScheduleView 手機卡片切換', () => {
  it('桌機顯示班別指派與換班紀錄 el-table、手機皆改 AdminListCards', async () => {
    mockIsMobile.value = false
    const w = shallowMount(ScheduleView, { global: globalStubs })
    await flushPromises()
    await nextTick()
    expect(w.findAll('.el-table').length).toBeGreaterThanOrEqual(2)
    expect(w.findAllComponents({ name: 'AdminListCards' }).length).toBe(0)

    mockIsMobile.value = true
    await nextTick()
    expect(w.findAllComponents({ name: 'AdminListCards' }).length).toBeGreaterThanOrEqual(2)
    expect(w.find('.el-table').exists()).toBe(false)
  })
})
