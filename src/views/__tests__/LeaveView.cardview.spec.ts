import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { shallowMount } from '@vue/test-utils'

const mockIsMobile = ref(false)
vi.mock('@/composables/useIsMobile', () => ({ useIsMobile: () => ({ isMobile: mockIsMobile, cleanup: () => {} }) }))

// onMounted 會抓請假清單 / 員工名冊 / 審核政策：全部 mock 成最小集合，避免 happy-dom 發真實請求
const fakeLeave = {
  id: 1,
  employee_name: '測試員工',
  leave_type: 'personal',
  leave_type_label: '事假',
  start_date: '2026-08-03',
  end_date: '2026-08-03',
  leave_hours: 8,
  status: 'pending',
  reason: '家中有事',
  attachment_paths: [],
  substitute_status: 'not_required',
}
vi.mock('@/api/leaves', () => ({
  getLeaves: vi.fn(() => Promise.resolve({ data: [fakeLeave] })),
  createLeave: vi.fn(),
  updateLeave: vi.fn(),
  approveLeave: vi.fn(),
  batchApproveLeaves: vi.fn(),
  getLeaveImportTemplate: vi.fn(),
  importLeaves: vi.fn(),
}))
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [], fetchEmployees: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/stores/approvalPolicy', () => ({
  useApprovalPolicyStore: () => ({ policies: [], fetchPolicies: vi.fn(() => Promise.resolve()) }),
}))
// useApprovalOperation 內部會取 notification store（無 active pinia 會炸）
vi.mock('@/stores/notification', () => ({
  useNotificationStore: () => ({ fetchSummary: vi.fn() }),
}))

import LeaveView from '@/views/LeaveView.vue'

// 容器類元件（el-tabs / el-tab-pane / el-card / LoadingPanel）用會 render slot 的 stub，
// 否則 shallowMount 的自動 stub 會吞掉 slot，表格/卡片根本不會渲染（既有踩坑：stubs 反吞 slot）
const globalStubs = {
  stubs: {
    'el-tabs': { template: '<div><slot /></div>' },
    'el-tab-pane': { template: '<div><slot /></div>' },
    'el-card': { template: '<div><slot /></div>' },
    LoadingPanel: { template: '<div><slot /></div>' },
    // el-table stub 保留 name 讓 findComponent({ name: 'ElTable' }) 可命中
    'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
    // el-table-column stub 不 render slot，避免 scope.row undefined 炸
    'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  },
}

describe('LeaveView 手機卡片切換', () => {
  it('桌機顯示 el-table、手機顯示 AdminListCards', async () => {
    mockIsMobile.value = false
    const w = shallowMount(LeaveView, { global: globalStubs })
    await nextTick()
    expect(w.findComponent({ name: 'ElTable' }).exists() || w.find('.el-table').exists()).toBe(true)
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(false)

    mockIsMobile.value = true
    await nextTick()
    expect(w.findComponent({ name: 'AdminListCards' }).exists()).toBe(true)
    expect(w.find('.el-table').exists()).toBe(false)
  })
})
