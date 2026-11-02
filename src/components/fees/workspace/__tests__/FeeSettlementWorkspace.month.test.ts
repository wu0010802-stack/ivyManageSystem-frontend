/**
 * 月結深連結月份（2026-11-02 bug hunt F3）：工作台「上個月尚未關帳 → 去月結」
 * 原本沒帶月份，CloseTab 一律預設本月，staging 實測待辦寫 2026-10、點進去是
 * 2026-11。現在 ?month= 由殼層下傳 month prop，月結頁要切到該月；工具列換月份
 * 要往上 emit，讓網址同步。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getCashHandovers: vi.fn(),
  getFeeRecords: vi.fn(),
  createCashReceipt: vi.fn(),
  submitCashHandover: vi.fn(),
  confirmCashHandover: vi.fn(),
  reopenCashHandover: vi.fn(),
  getCloseSummary: vi.fn(),
  getClosePeriods: vi.fn(),
  closePeriod: vi.fn(),
  reopenClosePeriod: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

vi.mock('@/utils/auth', () => ({
  hasPermission: () => true,
  getUserInfo: () => ({ id: 1 }),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))

const PASS = { template: '<div><slot /></div>' }
const GLOBAL_STUBS = {
  'el-alert': PASS,
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  // 受控：把 model-value 畫到 DOM、change 時回拋 update:model-value
  'el-date-picker': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input v-bind="$attrs" :value="modelValue" '
      + '@change="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  'el-descriptions': PASS,
  'el-descriptions-item': PASS,
  'el-dialog': { template: '<div />' },
  'el-form': PASS,
  'el-form-item': PASS,
  'el-icon': { template: '<i><slot /></i>' },
  'el-input': { template: '<input v-bind="$attrs" />' },
  'el-input-number': { template: '<input v-bind="$attrs" />' },
  'el-option': { template: '<option />' },
  'el-pagination': { template: '<div />' },
  'el-popover': { template: '<div><slot name="reference" /></div>' },
  'el-select': PASS,
  'el-table': { template: '<div />' },
  'el-table-column': { template: '<span />' },
  'el-tag': PASS,
  'el-tooltip': PASS,
}

const flushAll = async () => {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

import FeeSettlementWorkspace from '../FeeSettlementWorkspace.vue'

function mountWs(props: Record<string, unknown>) {
  return mount(FeeSettlementWorkspace, { props, global: { stubs: GLOBAL_STUBS } })
}

function pickerValue(wrapper: ReturnType<typeof mountWs>): string {
  return (wrapper.find('[data-test="close-month"]').element as HTMLInputElement).value
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.getCashHandovers.mockResolvedValue({ items: [] })
  apiMocks.getCloseSummary.mockRejectedValue(new Error('n/a'))
  apiMocks.getClosePeriods.mockResolvedValue({ total: 0, items: [] })
})

describe('結算工作區：月結深連結月份', () => {
  it('帶 month 進月結：一開始就查該月，不先查本月', async () => {
    const wrapper = mountWs({ view: 'close', month: '2026-09' })
    await flushAll()
    expect(apiMocks.getCloseSummary).toHaveBeenCalled()
    for (const call of apiMocks.getCloseSummary.mock.calls) {
      expect(call).toEqual([2026, 9])
    }
    expect(pickerValue(wrapper)).toBe('2026-09')
    wrapper.unmount()
  })

  it('停在交接時帶 month 切到月結（月結頁首次掛載）：查的是該月', async () => {
    const wrapper = mountWs({ view: 'handover' })
    await flushAll()
    await wrapper.setProps({ view: 'close', month: '2026-09' })
    await flushAll()
    expect(apiMocks.getCloseSummary).toHaveBeenCalled()
    for (const call of apiMocks.getCloseSummary.mock.calls) {
      expect(call).toEqual([2026, 9])
    }
    expect(pickerValue(wrapper)).toBe('2026-09')
    wrapper.unmount()
  })

  it('月結頁已快取在本月，再從工作台帶 month 進來：切到該月', async () => {
    const wrapper = mountWs({ view: 'close' })
    await flushAll()
    await wrapper.setProps({ view: 'handover' })
    await flushAll()
    await wrapper.setProps({ view: 'close', month: '2026-09' })
    await flushAll()
    expect(apiMocks.getCloseSummary.mock.calls.at(-1)).toEqual([2026, 9])
    expect(pickerValue(wrapper)).toBe('2026-09')
    wrapper.unmount()
  })

  it('停在月結時 month 變更（上一頁／再點另一則待辦）：重新查新月份', async () => {
    const wrapper = mountWs({ view: 'close', month: '2026-09' })
    await flushAll()
    await wrapper.setProps({ month: '2026-10' })
    await flushAll()
    expect(apiMocks.getCloseSummary.mock.calls.at(-1)).toEqual([2026, 10])
    expect(pickerValue(wrapper)).toBe('2026-10')
    wrapper.unmount()
  })

  it('工具列換月份：往上 emit change-month 讓網址同步', async () => {
    const wrapper = mountWs({ view: 'close', month: '2026-09' })
    await flushAll()
    await wrapper.find('[data-test="close-month"]').setValue('2026-08')
    await flushAll()
    expect(wrapper.emitted('change-month')?.at(-1)).toEqual(['2026-08'])
    expect(apiMocks.getCloseSummary.mock.calls.at(-1)).toEqual([2026, 8])
    wrapper.unmount()
  })
})
