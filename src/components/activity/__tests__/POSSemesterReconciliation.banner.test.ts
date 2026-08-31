import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

// ③學期對帳改造（2026-08-16）：核對橫幅（應收/實收/簽收差額）、待審核警示條、
// 班級分組。沿用既有 race 測試檔的 mount 慣例（全面 stub 子元件與 el-table，
// 走 $.setupState 斷言內部狀態，不驗表格 DOM）。

const getReconMock = vi.hoisted(() => vi.fn())
const getClassroomsMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/activity', () => ({
  getPOSSemesterReconciliation: getReconMock,
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: getClassroomsMock,
}))

import POSSemesterReconciliation from '../POSSemesterReconciliation.vue'

function mountRecon() {
  return mount(POSSemesterReconciliation, {
    global: {
      stubs: {
        AcademicTermSelector: true,
        StatCard: true,
        POSSignoffLedger: true,
        POSRegChangesTimeline: true,
        'el-table': true,
        'el-table-column': true,
        'el-collapse': true,
        'el-collapse-item': true,
      },
    },
  })
}

function setupStateOf(wrapper: ReturnType<typeof mountRecon>) {
  return wrapper.vm.$.setupState as {
    totals: Record<string, unknown>
    isBalanced: boolean
    items: Record<string, unknown>[]
    groups: { key: string; label: string; pending: boolean }[]
    filters: { review_status: string }
    applyPendingFilter: () => void
  }
}

describe('POSSemesterReconciliation：核對橫幅與待審核防漏', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getClassroomsMock.mockResolvedValue({ data: { items: [] } })
  })
  afterEach(() => vi.clearAllMocks())

  it('對帳 totals 帶回簽收累計/未簽收差額/待確認應收，狀態正確寫入', async () => {
    getReconMock.mockResolvedValue({
      data: {
        items: [{ id: 1, student_name: '王小明', class_name: '玫瑰', total_amount: 2000, paid_amount: 2000, owed: 0, pending_review: false, pending_amount: 0, match_status: 'matched' }],
        totals: {
          total_amount: 2000,
          paid_amount: 2000,
          outstanding_amount: 0,
          approved_paid_amount: 1000,
          pending_paid_amount: 1000,
          signoff_total: 1500,
          unsigned_gap: 500,
          pending_review_count: 0,
          pending_review_amount: 0,
        },
        truncated: false,
        total_active: 1,
      },
    })
    const wrapper = mountRecon()
    await flushPromises()

    const ss = setupStateOf(wrapper)
    expect(ss.totals.signoff_total).toBe(1500)
    expect(ss.totals.unsigned_gap).toBe(500)
    wrapper.unmount()
  })

  it('未收/未簽收/待審核皆為 0 且有資料時 isBalanced 為 true', async () => {
    getReconMock.mockResolvedValue({
      data: {
        items: [{ id: 1, student_name: '王小明', class_name: '玫瑰', total_amount: 2000, paid_amount: 2000, owed: 0, pending_review: false, pending_amount: 0, match_status: 'matched' }],
        totals: {
          outstanding_amount: 0,
          unsigned_gap: 0,
          pending_review_count: 0,
        },
        truncated: false,
        total_active: 1,
      },
    })
    const wrapper = mountRecon()
    await flushPromises()

    expect(setupStateOf(wrapper).isBalanced).toBe(true)
    wrapper.unmount()
  })

  it('有未收金額時 isBalanced 為 false', async () => {
    getReconMock.mockResolvedValue({
      data: {
        items: [{ id: 1, student_name: '王小明', class_name: '玫瑰', total_amount: 2000, paid_amount: 0, owed: 2000, pending_review: false, pending_amount: 0, match_status: 'matched' }],
        totals: { outstanding_amount: 2000, unsigned_gap: 0, pending_review_count: 0 },
        truncated: false,
        total_active: 1,
      },
    })
    const wrapper = mountRecon()
    await flushPromises()

    expect(setupStateOf(wrapper).isBalanced).toBe(false)
    wrapper.unmount()
  })

  it('無資料（空清單）時 isBalanced 為 false（避免空狀態誤判已對平）', async () => {
    getReconMock.mockResolvedValue({
      data: { items: [], totals: { outstanding_amount: 0, unsigned_gap: 0, pending_review_count: 0 }, truncated: false, total_active: 0 },
    })
    const wrapper = mountRecon()
    await flushPromises()

    expect(setupStateOf(wrapper).isBalanced).toBe(false)
    wrapper.unmount()
  })

  it('applyPendingFilter 設定 review_status=pending 並重新查詢', async () => {
    getReconMock.mockResolvedValue({
      data: { items: [], totals: {}, truncated: false, total_active: 0 },
    })
    const wrapper = mountRecon()
    await flushPromises()
    getReconMock.mockClear()

    setupStateOf(wrapper).applyPendingFilter()
    await flushPromises()

    expect(setupStateOf(wrapper).filters.review_status).toBe('pending')
    expect(getReconMock).toHaveBeenCalledWith(
      expect.objectContaining({ review_status: 'pending' })
    )
    wrapper.unmount()
  })

  it('班級分組：待審核置頂，其餘依班級名稱分組', async () => {
    getReconMock.mockResolvedValue({
      data: {
        items: [
          { id: 1, student_name: '正常生', class_name: '玫瑰', total_amount: 1000, paid_amount: 0, owed: 1000, pending_review: false, pending_amount: 0, match_status: 'matched' },
          { id: 2, student_name: '待審生', class_name: '', total_amount: 0, paid_amount: 0, owed: 0, pending_review: true, pending_amount: 1500, match_status: 'pending' },
        ],
        totals: {},
        truncated: false,
        total_active: 2,
      },
    })
    const wrapper = mountRecon()
    await flushPromises()

    const ss = setupStateOf(wrapper)
    expect(ss.groups[0].pending).toBe(true)
    expect(ss.groups[0].label).toBe('待審核／未分班')
    expect(ss.groups.some((g) => g.label === '玫瑰')).toBe(true)
    wrapper.unmount()
  })
})
