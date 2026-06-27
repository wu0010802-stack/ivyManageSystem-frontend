import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))
// 避免 onMounted 抓資料炸：mock store 與 API 依賴為最小空集合
// employees 給一筆假資料，避免 loading && !employees.length = true 讓 TableSkeleton 遮住表格
const fakeEmployee = { employee_id: 'T001', name: '測試員工', title: '', position: '', hire_date: '', is_active: true, employee_type: 'regular', base_salary: 30000, status: 'active' }
vi.mock('@/stores/employee', () => ({ useEmployeeStore: () => ({ employees: [fakeEmployee], fetchEmployees: vi.fn(() => new Promise(() => {})) }) }))
vi.mock('@/stores/classroom', () => ({ useClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn(() => new Promise(() => {})) }) }))
vi.mock('@/stores/config', () => ({ useConfigStore: () => ({ jobTitles: [], fetchJobTitles: vi.fn(() => new Promise(() => {})) }) }))
// vue-router mock（onMounted 讀 route.query.search）
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
// API 直呼 mock（onMounted 呼 getPositionSalary）
vi.mock('@/api/config', () => ({ getPositionSalary: vi.fn(() => new Promise(() => {})) }))

import EmployeeView from '@/views/EmployeeView.vue'

// el-table / el-table-column 不是全域安裝的 Element Plus，shallowMount 下不自動 stub；
// 明確傳入 stubs，讓 el-table-column 不執行帶 scope 的 slot（否則 scope.row 為 undefined 炸）
const globalStubs = {
  stubs: {
    // el-table stub 保留 name 讓 findComponent({ name: 'ElTable' }) 可命中
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    // el-table-column stub 不 render 任何 slot，避免 scope.row undefined
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

describe('EmployeeView 手機卡片切換', () => {
  it('桌機顯示 el-table、手機顯示 AdminListCards', async () => {
    mockIsMobile.value = false
    const w = shallowMount(EmployeeView, { global: globalStubs })
    await nextTick()
    expect(w.findComponent({ name: 'ElTable' }).exists() || w.find('.el-table').exists()).toBe(true)
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)

    mockIsMobile.value = true
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)
  })
})
