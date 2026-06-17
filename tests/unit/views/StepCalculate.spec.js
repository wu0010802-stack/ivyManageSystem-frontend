import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// hoisted mock fns（可逐測重設 resolve 值）
const h = vi.hoisted(() => ({
  calculateAsync: vi.fn(),
  getSalaryCalcJob: vi.fn(),
  getEnrollmentSnapshot: vi.fn(),
  msgError: vi.fn(),
  msgSuccess: vi.fn(),
  confirm: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/api/salary', () => ({
  calculateAsync: h.calculateAsync,
  getSalaryCalcJob: h.getSalaryCalcJob,
  getEnrollmentSnapshot: h.getEnrollmentSnapshot,
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))
vi.mock('@/composables/useErrorNotify', () => ({ useErrorNotify: () => ({ notify: h.notify }) }))
vi.mock('element-plus', () => ({
  ElMessage: { error: h.msgError, success: h.msgSuccess, info: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: h.confirm },
}))

import StepCalculate from '@/views/salary/settle/StepCalculate.vue'

function makeSettlement(status = 'draft') {
  return {
    status: { value: status },
    records: { value: [] },
    refresh: vi.fn().mockResolvedValue(undefined),
  }
}

const stubs = {
  'el-alert': { template: '<div><slot/></div>' },
  'el-card': { template: '<div><slot/></div>' },
  'el-button': { template: '<button><slot/></button>' },
  'el-tooltip': { template: '<div><slot/></div>' },
  'el-progress': { template: '<div class="el-progress-stub"/>' },
}

function mountStep(settlement, query = { year: 2026, month: 5 }) {
  return mount(StepCalculate, {
    global: {
      provide: { settlement, settleQuery: query },
      stubs,
      directives: { loading: {} },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.confirm.mockResolvedValue('confirm')
  h.getEnrollmentSnapshot.mockResolvedValue({ data: { covered_months: [], rows: [] } })
})

describe('StepCalculate — async 計算 + 輪詢', () => {
  it('completed 無錯誤 → calculateAsync + 輪詢 + refresh + emit next', async () => {
    h.calculateAsync.mockResolvedValue({ data: { job_id: 'j1', total: 3 } })
    h.getSalaryCalcJob.mockResolvedValue({
      data: { status: 'completed', errors: [], done: 3, total: 3 },
    })
    const settlement = makeSettlement()
    const wrapper = mountStep(settlement)
    await flushPromises()

    await wrapper.vm.onCalculate()
    await flushPromises()

    expect(h.calculateAsync).toHaveBeenCalledWith(2026, 5)
    expect(h.getSalaryCalcJob).toHaveBeenCalledWith('j1')
    expect(settlement.refresh).toHaveBeenCalled()
    expect(wrapper.emitted('next')).toBeTruthy()
    expect(h.msgSuccess).toHaveBeenCalled()
  })

  it('completed 有失敗員工 → 列出錯誤、不 emit next', async () => {
    h.calculateAsync.mockResolvedValue({ data: { job_id: 'j2', total: 2 } })
    h.getSalaryCalcJob.mockResolvedValue({
      data: {
        status: 'completed',
        errors: [{ employee_name: '甲', error: 'X' }],
        done: 2,
        total: 2,
      },
    })
    const settlement = makeSettlement()
    const wrapper = mountStep(settlement)
    await flushPromises()

    await wrapper.vm.onCalculate()
    await flushPromises()

    expect(settlement.refresh).toHaveBeenCalled()
    expect(wrapper.emitted('next')).toBeFalsy()
    expect(wrapper.html()).toContain('甲')
  })

  it('failed → ElMessage.error(error_message)，不 refresh 不 emit', async () => {
    h.calculateAsync.mockResolvedValue({ data: { job_id: 'j3', total: 1 } })
    h.getSalaryCalcJob.mockResolvedValue({
      data: { status: 'failed', error_message: '引擎爆炸', errors: [] },
    })
    const settlement = makeSettlement()
    const wrapper = mountStep(settlement)
    await flushPromises()

    await wrapper.vm.onCalculate()
    await flushPromises()

    expect(h.msgError).toHaveBeenCalledWith('引擎爆炸')
    expect(wrapper.emitted('next')).toBeFalsy()
    expect(settlement.refresh).not.toHaveBeenCalled()
  })

  it('使用者取消確認 → 不呼叫 calculateAsync', async () => {
    h.confirm.mockRejectedValue('cancel')
    const settlement = makeSettlement()
    const wrapper = mountStep(settlement)
    await flushPromises()

    await wrapper.vm.onCalculate()
    await flushPromises()

    expect(h.calculateAsync).not.toHaveBeenCalled()
    expect(wrapper.emitted('next')).toBeFalsy()
  })
})
