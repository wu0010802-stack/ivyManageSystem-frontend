import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { shallowMount, flushPromises } from '@vue/test-utils'

// 排班與出勤「建立請假單」深連結：/leaves?create=1&employee_id=…&date=…
const route = vi.hoisted(() => ({ query: {} as Record<string, string> }))
const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => router }))

const paged = vi.hoisted(() => <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 5000, hasMore: false }))
const api = vi.hoisted(() => ({ getLeaves: vi.fn() }))
vi.mock('@/api/leaves', () => ({
  getLeaves: api.getLeaves,
  createLeave: vi.fn(),
  updateLeave: vi.fn(),
  approveLeave: vi.fn(),
  batchApproveLeaves: vi.fn(),
  getLeaveImportTemplate: vi.fn(),
  importLeaves: vi.fn(),
}))
vi.mock('@/composables/useIsMobile', async () => {
  const { ref } = await import('vue')
  return { useIsMobile: () => ({ isMobile: ref(false), cleanup: () => {} }) }
})
vi.mock('@/stores/employee', () => ({
  useEmployeeStore: () => ({ employees: [{ id: 12, name: '林佳穎' }], fetchEmployees: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/stores/approvalPolicy', () => ({
  useApprovalPolicyStore: () => ({ policies: [], fetchPolicies: vi.fn(() => Promise.resolve()) }),
}))
vi.mock('@/stores/notification', () => ({ useNotificationStore: () => ({ fetchSummary: vi.fn() }) }))

import LeaveView from '@/views/LeaveView.vue'

const stubs = {
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { template: '<div><slot /></div>' },
  'el-card': { template: '<div><slot /></div>' },
  LoadingPanel: { template: '<div><slot /></div>' },
  'el-table': { name: 'ElTable', template: '<div class="el-table"><slot /></div>' },
  'el-table-column': { name: 'ElTableColumn', template: '<div></div>' },
  'el-dialog': { name: 'ElDialog', props: ['modelValue', 'title'], template: '<section v-if="modelValue" :data-title="title"><slot /><slot name="footer" /></section>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': { name: 'ElSelect', props: ['modelValue', 'placeholder'], template: '<div class="el-select-stub" />' },
  'el-date-picker': { name: 'ElDatePicker', props: ['modelValue', 'type'], template: '<div class="el-date-picker-stub" />' },
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getLeaves.mockResolvedValue(paged([]))
  route.query = {}
})

describe('LeaveView 帶人帶日期開新增假單', () => {
  it('開頁即開「新增請假申請」，帶入員工與當天（整天），列表切到那個月，網址參數拿掉', async () => {
    route.query = { create: '1', employee_id: '12', date: '2026-09-15', search: '林' }
    const w = shallowMount(LeaveView, { global: { stubs } })
    await flushPromises()
    await nextTick()
    const dialog = w.findAllComponents({ name: 'ElDialog' }).find((d) => d.props('title') === '新增請假申請')
    expect(dialog?.props('modelValue')).toBe(true)
    const employeeSelect = w.findAllComponents({ name: 'ElSelect' }).find((s) => s.props('placeholder') === '選擇員工')
    expect(employeeSelect?.props('modelValue')).toBe(12)
    const range = w.findAllComponents({ name: 'ElDatePicker' }).find((p) => p.props('type') === 'daterange')
    expect(range?.props('modelValue')).toEqual(['2026-09-15', '2026-09-15'])
    expect(api.getLeaves).toHaveBeenLastCalledWith(expect.objectContaining({ year: 2026, month: 9 }))
    expect(router.replace).toHaveBeenCalledWith({ query: { search: '林' } })
  })

  it('沒有或格式不對的參數：不開對話框', async () => {
    route.query = { create: '1', employee_id: 'x', date: '2026-09-15' }
    const w = shallowMount(LeaveView, { global: { stubs } })
    await flushPromises()
    const dialog = w.findAllComponents({ name: 'ElDialog' }).find((d) => d.props('title') === '新增請假申請')
    expect(dialog?.props('modelValue') ?? false).toBe(false)
    expect(router.replace).not.toHaveBeenCalled()
  })
})
