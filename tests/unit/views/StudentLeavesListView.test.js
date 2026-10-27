import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import StudentLeavesListView from '@/views/StudentLeavesListView.vue'

const listStudentLeaves = vi.fn()
vi.mock('@/api/studentLeaves', () => ({
  listStudentLeaves: (...a) => listStudentLeaves(...a),
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: vi.fn(() => Promise.resolve({ data: [] })),
}))
vi.mock('element-plus', async (orig) => ({
  ...(await orig()),
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

const STUBS = {
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': true,
  'el-select': true,
  'el-option': true,
  'el-date-picker': true,
  'el-pagination': true,
  'el-tag': { template: '<span><slot /></span>' },
  AdminListToolbar: { template: '<div><slot name="actions" /></div>' },
  'router-link': true,
}

const flush = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve()
}

function mountView() {
  return mount(StudentLeavesListView, {
    global: { directives: { loading: () => {} }, stubs: STUBS, mocks: { $router: { push: vi.fn() } } },
  })
}

describe('StudentLeavesListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listStudentLeaves.mockReset().mockResolvedValue({ data: { items: [], total: 0 } })
  })

  it('說明文字指向實際存在的「學生出席紀錄」，不再寫不存在的「學生考勤」', async () => {
    const w = mountView()
    await flush()
    expect(w.text()).toContain('學生出席紀錄')
    expect(w.text()).not.toContain('學生考勤')
  })

  it('查詢帶分頁、請假期間與姓名，total 用後端的總筆數', async () => {
    listStudentLeaves.mockResolvedValue({ data: { items: [{ id: 1 }], total: 120 } })
    const w = mountView()
    await flush()
    const st = w.vm.$.setupState
    st.filters.dateRange = ['2026-03-01', '2026-03-31']
    st.filters.classroom_id = 5
    st.currentPage = 3
    await st.handlePageChange(3)
    expect(listStudentLeaves).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'approved', skip: 100, limit: 50, classroom_id: 5,
      start_date: '2026-03-01', end_date: '2026-03-31',
    }))
    expect(st.total).toBe(120)
  })

  it('載入失敗顯示錯誤態，不顯示「尚無請假紀錄」', async () => {
    listStudentLeaves.mockRejectedValue(new Error('boom'))
    const w = mountView()
    await flush()
    expect(w.text()).toContain('學生請假紀錄載入失敗')
    expect(w.text()).not.toContain('尚無請假紀錄')
  })
})
