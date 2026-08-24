/**
 * P1-1（MONEY-01 / STATE-01 / STATE-02 / FEAPV-01，2026-08-24）：
 *
 * 簽收比對的基準必須是「全學期現金淨實收」，不是被畫面篩選過的明細小計。
 * 舊版把 `approved_paid_amount + pending_paid_amount`（套完班級／繳費狀態／簽核狀態／
 * review_status 四道篩選，還受 2000 筆截斷影響）當成 POS 淨實收傳給簽收帳本，
 * 於是篩任一條件就噴出「簽收超過 POS 實收」的假帳差，而那個被污染的數字還會變成
 * 簽收帳本的「建議金額」——按「帶入」就寫進只能作廢、不能修改的帳本。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const getReconMock = vi.hoisted(() => vi.fn())
const getClassroomsMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/activity', () => ({
  getPOSSemesterReconciliation: getReconMock,
}))
vi.mock('@/api/classrooms', () => ({
  getClassrooms: getClassroomsMock,
}))

import POSSemesterReconciliation from '../POSSemesterReconciliation.vue'

const ITEM = {
  id: 1,
  student_name: '王小明',
  class_name: '玫瑰',
  total_amount: 2000,
  paid_amount: 2000,
  owed: 0,
  pending_review: false,
  pending_amount: 0,
  match_status: 'matched',
}

/** 全學期現金淨實收 500,000、已簽收 100,000；畫面篩到只剩一班（實收 150,000）。 */
const FILTERED_RESPONSE = {
  data: {
    items: [ITEM],
    totals: {
      registration_count: 1,
      total_amount: 2000,
      paid_amount: 2000,
      outstanding_amount: 0,
      approved_paid_amount: 150000,
      pending_paid_amount: 0,
      offline_paid_amount: 0,
      signoff_total: 100000,
      unsigned_gap: 400000,
      term_cash_net_paid: 500000,
      term_noncash_net_paid: 24000,
      filters_applied: true,
      pending_review_count: 0,
      pending_review_amount: 0,
    },
  },
}

/** 舊版後端（尚未部署新欄位）。 */
const LEGACY_RESPONSE = {
  data: {
    items: [ITEM],
    totals: {
      registration_count: 1,
      total_amount: 2000,
      paid_amount: 2000,
      outstanding_amount: 0,
      approved_paid_amount: 8000,
      pending_paid_amount: 1000,
      offline_paid_amount: 0,
      signoff_total: 5000,
      unsigned_gap: 4000,
      pending_review_count: 0,
      pending_review_amount: 0,
    },
  },
}

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

function ledgerProps(wrapper: ReturnType<typeof mountRecon>) {
  return wrapper.findComponent({ name: 'POSSignoffLedger' }).props() as {
    posNetPaid: number
  }
}

describe('P1-1：簽收比對基準不受畫面篩選影響', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getClassroomsMock.mockResolvedValue({ data: { items: [] } })
  })
  afterEach(() => vi.clearAllMocks())

  it('傳給簽收帳本的是全學期現金淨實收，不是被篩過的明細小計', async () => {
    getReconMock.mockResolvedValue(FILTERED_RESPONSE)
    const wrapper = mountRecon()
    await flushPromises()

    // 篩選後的小計是 150,000，但簽收建議金額必須以全學期 500,000 為基準
    expect(ledgerProps(wrapper).posNetPaid).toBe(500000)
  })

  it('套用篩選時不得宣稱「本期已對平」', async () => {
    getReconMock.mockResolvedValue({
      data: {
        ...FILTERED_RESPONSE.data,
        totals: {
          ...FILTERED_RESPONSE.data.totals,
          outstanding_amount: 0,
          unsigned_gap: 0,
          filters_applied: true,
        },
      },
    })
    const wrapper = mountRecon()
    await flushPromises()

    const ss = wrapper.vm.$.setupState as { isBalanced: boolean }
    expect(ss.isBalanced).toBe(false)
  })

  it('沒有篩選且真的對平時，仍要顯示已對平', async () => {
    getReconMock.mockResolvedValue({
      data: {
        ...FILTERED_RESPONSE.data,
        totals: {
          ...FILTERED_RESPONSE.data.totals,
          outstanding_amount: 0,
          unsigned_gap: 0,
          pending_review_count: 0,
          filters_applied: false,
        },
      },
    })
    const wrapper = mountRecon()
    await flushPromises()

    const ss = wrapper.vm.$.setupState as { isBalanced: boolean }
    expect(ss.isBalanced).toBe(true)
  })

  it('套用篩選時明講下方統計是部分合計，避免拿去跟簽收互推', async () => {
    getReconMock.mockResolvedValue(FILTERED_RESPONSE)
    const wrapper = mountRecon()
    await flushPromises()

    expect(wrapper.text()).toContain('部分合計')
  })

  it('非現金金額另行標示，不混進簽收比對', async () => {
    getReconMock.mockResolvedValue(FILTERED_RESPONSE)
    const wrapper = mountRecon()
    await flushPromises()

    expect(wrapper.text()).toContain('非現金')
    expect(wrapper.text()).toContain('NT$24,000')
  })

  it('後端還沒回新欄位時退回舊算式，不得把基準變成 0', async () => {
    getReconMock.mockResolvedValue(LEGACY_RESPONSE)
    const wrapper = mountRecon()
    await flushPromises()

    expect(ledgerProps(wrapper).posNetPaid).toBe(9000)
  })
})
