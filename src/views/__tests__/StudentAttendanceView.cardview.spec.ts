import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

// 避免 onMounted 抓資料炸：mock store 與 API 依賴為最小空集合
vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({
    school_year: 113,
    semester: 1,
    setTerm: vi.fn(),
  }),
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/api/studentAttendance', () => ({
  getAttendanceOverview: vi.fn(() => new Promise(() => {})),
  getDailyAttendance: vi.fn(() => new Promise(() => {})),
  getMonthlySummary: vi.fn(() => new Promise(() => {})),
}))
vi.mock('@/composables/useChartJs', () => ({
  BarChart: { name: 'BarChart', template: '<div></div>' },
}))

import StudentAttendanceView from '@/views/StudentAttendanceView.vue'

// el-table / el-table-column 不是全域安裝的 Element Plus，shallowMount 下不自動 stub；
// 明確傳入 stubs，讓 el-table-column 不執行帶 scope 的 slot（否則 scope.row 為 undefined 炸）
const globalStubs = {
  stubs: {
    // el-table stub 保留 name 讓 findComponent({ name: 'ElTable' }) 可命中
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    // el-table-column stub 不 render 任何 slot，避免 scope.row undefined
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
    'AttendanceBatchPanel': { name: 'AttendanceBatchPanel', template: '<div></div>' },
  },
}

describe('StudentAttendanceView 班級總覽手機卡片切換', () => {
  it('手機顯示 AdminListCards、桌機不顯示', async () => {
    mockIsMobile.value = true
    const w = shallowMount(StudentAttendanceView, { global: globalStubs })
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)

    mockIsMobile.value = false
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)
  })
})
