import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/activity', () => ({
  getPOSSemesterSignoffs: vi.fn(),
  createPOSSemesterSignoff: vi.fn(),
  voidPOSSemesterSignoff: vi.fn(),
}))

vi.mock('@/utils/auth', () => ({ hasPermission: vi.fn(() => true) }))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { prompt: vi.fn() },
}))

import {
  createPOSSemesterSignoff,
  getPOSSemesterSignoffs,
  voidPOSSemesterSignoff,
} from '@/api/activity'
import { hasPermission } from '@/utils/auth'
import { ElMessageBox } from 'element-plus'
import POSSignoffLedger from '../POSSignoffLedger.vue'

// 表格/dialog 內部渲染依循既有慣例（POSSemesterReconciliation.race.test.ts）：
// 全面 stub el-table/el-table-column（不驗表格 DOM），改用 $.setupState 斷言內部狀態。

function mountLedger(props: Record<string, unknown> = {}) {
  return mount(POSSignoffLedger, {
    props: {
      schoolYear: 115,
      semester: 1,
      posNetPaid: 3000,
      ...props,
    },
    global: {
      directives: { loading: {} },
      stubs: {
        'el-card': true,
        'el-table': true,
        'el-table-column': true,
        'el-tag': true,
        'el-tooltip': true,
        'el-empty': true,
        'el-dialog': true,
        'el-form': true,
        'el-form-item': true,
        'el-input-number': true,
        'el-input': true,
        'el-button': true,
      },
    },
  })
}

function setupStateOf(wrapper: ReturnType<typeof mountLedger>) {
  return wrapper.vm.$.setupState as {
    items: Record<string, unknown>[]
    signoffTotal: number
    suggestAmount: number
    canApprove: boolean
    form: { amount: number | null; note: string }
    submitSignoff: () => Promise<void>
    askVoid: (row: Record<string, unknown>) => Promise<void>
  }
}

describe('POSSignoffLedger', () => {
  beforeEach(() => {
    vi.mocked(getPOSSemesterSignoffs).mockResolvedValue({
      data: {
        school_year: 115,
        semester: 1,
        signoff_total: 1000,
        items: [
          {
            id: 1,
            school_year: 115,
            semester: 1,
            amount: 1000,
            signed_by: 'boss',
            signed_at: '2026-08-16T10:00:00',
            voided_at: null,
          },
        ],
      },
    } as never)
    vi.mocked(hasPermission).mockReturnValue(true)
  })
  afterEach(() => vi.clearAllMocks())

  it('mount 時依學年/學期載入簽收流水', async () => {
    const wrapper = mountLedger()
    await flushPromises()

    expect(getPOSSemesterSignoffs).toHaveBeenCalledWith({ school_year: 115, semester: 1 })
    const ss = setupStateOf(wrapper)
    expect(ss.items).toHaveLength(1)
    expect(ss.items[0].signed_by).toBe('boss')
    expect(ss.signoffTotal).toBe(1000)
  })

  it('無權限時 canApprove 為 false', async () => {
    vi.mocked(hasPermission).mockReturnValue(false)
    const wrapper = mountLedger()
    await flushPromises()
    expect(setupStateOf(wrapper).canApprove).toBe(false)
  })

  it('建議金額 = POS 淨實收 − 已簽收', async () => {
    const wrapper = mountLedger({ posNetPaid: 3000 })
    await flushPromises()
    // signoff_total=1000（mock），posNetPaid=3000 → 建議 2000
    expect(setupStateOf(wrapper).suggestAmount).toBe(2000)
  })

  it('建議金額不為負（已簽收超過淨實收時夾 0）', async () => {
    const wrapper = mountLedger({ posNetPaid: 500 })
    await flushPromises()
    expect(setupStateOf(wrapper).suggestAmount).toBe(0)
  })

  it('提交簽收成功後重新載入並 emit changed', async () => {
    vi.mocked(createPOSSemesterSignoff).mockResolvedValue({ data: {} } as never)
    const wrapper = mountLedger()
    await flushPromises()

    const ss = setupStateOf(wrapper)
    ss.form.amount = 500
    await ss.submitSignoff()
    await flushPromises()

    expect(createPOSSemesterSignoff).toHaveBeenCalledWith(
      expect.objectContaining({ school_year: 115, semester: 1, amount: 500 })
    )
    expect(wrapper.emitted('changed')).toBeTruthy()
  })

  it('金額未填時不送出', async () => {
    const wrapper = mountLedger()
    await flushPromises()
    const ss = setupStateOf(wrapper)
    ss.form.amount = null
    await ss.submitSignoff()
    expect(createPOSSemesterSignoff).not.toHaveBeenCalled()
  })

  it('作廢流程：prompt 取消時不呼叫 API', async () => {
    vi.mocked(ElMessageBox.prompt).mockRejectedValue(new Error('cancel'))
    const wrapper = mountLedger()
    await flushPromises()

    await setupStateOf(wrapper).askVoid({ id: 1 })
    expect(voidPOSSemesterSignoff).not.toHaveBeenCalled()
  })

  it('作廢流程：確認後呼叫 API 並重新載入', async () => {
    vi.mocked(ElMessageBox.prompt).mockResolvedValue({ value: '重複登記' } as never)
    vi.mocked(voidPOSSemesterSignoff).mockResolvedValue({ data: {} } as never)
    const wrapper = mountLedger()
    await flushPromises()

    await setupStateOf(wrapper).askVoid({ id: 1 })
    await flushPromises()

    expect(voidPOSSemesterSignoff).toHaveBeenCalledWith(1, { reason: '重複登記' })
    expect(wrapper.emitted('changed')).toBeTruthy()
  })

  it('切學年學期時重新載入（同 school_year/semester 變更觸發 watch）', async () => {
    const wrapper = mountLedger({ schoolYear: 115, semester: 1 })
    await flushPromises()
    vi.mocked(getPOSSemesterSignoffs).mockClear()

    await wrapper.setProps({ schoolYear: 115, semester: 2 })
    await flushPromises()

    expect(getPOSSemesterSignoffs).toHaveBeenCalledWith({ school_year: 115, semester: 2 })
  })
})
