import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ActivitySupplyView from '../ActivitySupplyView.vue'

// 訂購名單（2026-08-03）：點「已訂套數」開 dialog 列出訂購該用品的有效報名。
// 口徑與 ordered_count 一致：走 GET /registrations?supply_id=，不帶 include_inactive
// （預設 false＝rejected 軟刪不列入）。

const getSuppliesMock = vi.hoisted(() => vi.fn())
const getRegistrationsMock = vi.hoisted(() => vi.fn())
vi.mock('@/api/activity', () => ({
  getSupplies: getSuppliesMock,
  createSupply: vi.fn(),
  updateSupply: vi.fn(),
  deleteSupply: vi.fn(),
  getRegistrations: getRegistrationsMock,
}))

vi.mock('@/stores/academicTerm', () => ({
  useAcademicTermStore: () => ({ school_year: 114, semester: 1 }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

const STUBS = {
  AcademicTermSelector: true,
  'el-table': true,
  'el-table-column': true,
  'el-button': true,
  'el-link': true,
  'el-tag': true,
  'el-dialog': true,
  'el-form': true,
  'el-form-item': true,
  'el-input': true,
  'el-input-number': true,
}

interface SetupState {
  openOrderers: (row: { id: number; name: string }) => Promise<void>
  formatOrdererClass: (row: Record<string, unknown>) => string
  orderers: unknown[]
  orderersTotal: number
  orderersVisible: boolean
  orderersLoading: boolean
}

function mountView() {
  getSuppliesMock.mockResolvedValue({
    data: { supplies: [{ id: 5, name: '畫具', price: 300, ordered_count: 2 }] },
  })
  return mount(ActivitySupplyView, { global: { stubs: STUBS } })
}

describe('ActivitySupplyView 訂購名單 dialog', () => {
  beforeEach(() => {
    getSuppliesMock.mockReset()
    getRegistrationsMock.mockReset()
  })

  it('openOrderers 以 supply_id＋選定學期查報名，且不帶 include_inactive（口徑＝有效報名）', async () => {
    getRegistrationsMock.mockResolvedValue({
      data: {
        items: [
          { student_name: '王小明', grade_name: '大班', class_name: '海豚班', course_names: '直排輪', payment_status: 'paid', created_at: '2026-07-21T10:00:00' },
        ],
        total: 1,
      },
    })
    const wrapper = mountView()
    await flushPromises()

    const ss = wrapper.vm.$.setupState as unknown as SetupState
    await ss.openOrderers({ id: 5, name: '畫具' })
    await flushPromises()

    expect(getRegistrationsMock).toHaveBeenCalledWith({
      supply_id: 5,
      school_year: 114,
      semester: 1,
      limit: 200,
    })
    expect(ss.orderersVisible).toBe(true)
    expect(ss.orderersTotal).toBe(1)
    expect(ss.orderers).toHaveLength(1)
    wrapper.unmount()
  })

  it('載入失敗時清空名單並結束 loading', async () => {
    getRegistrationsMock.mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()

    const ss = wrapper.vm.$.setupState as unknown as SetupState
    await ss.openOrderers({ id: 5, name: '畫具' })
    await flushPromises()

    expect(ss.orderers).toHaveLength(0)
    expect(ss.orderersLoading).toBe(false)
    wrapper.unmount()
  })

  it('formatOrdererClass：年級＋班名以「・」相接，皆缺時退為「—」', async () => {
    const wrapper = mountView()
    await flushPromises()
    const ss = wrapper.vm.$.setupState as unknown as SetupState

    expect(ss.formatOrdererClass({ grade_name: '大班', class_name: '海豚班' })).toBe('大班・海豚班')
    expect(ss.formatOrdererClass({ grade_name: null, class_name: '海豚班' })).toBe('海豚班')
    expect(ss.formatOrdererClass({ grade_name: null, class_name: null })).toBe('—')
    wrapper.unmount()
  })
})
