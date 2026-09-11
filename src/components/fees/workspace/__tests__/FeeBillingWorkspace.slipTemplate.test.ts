/**
 * SPEC-025 入口：應收帳款檢視工具列的「產生範本 ▾」。
 *
 * 放在「匯入 ▾」左側——它是輸出不是輸入，但和匯入同屬銀行往返的一條線。
 *
 * 本檔測試環境（tests/setup.js）不全域註冊 Element Plus，
 * 故自帶 pass-through stub 讓下拉與其選項渲染出 data-test 屬性
 * （比照 FeeBillingWorkspace.mode.test.ts／BillSlipTab.test.ts 慣例）；
 * FeeSlipTemplateDialog 另用 vi.mock 換成可觀察 props 的輕量替身，
 * 避免真實渲染需要一整套未註冊的 Element Plus 表單／表格元件。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const apiMocks = vi.hoisted(() => ({
  getFeePeriods: vi.fn().mockResolvedValue([]),
  getCloseSummary: vi.fn().mockResolvedValue({}),
  getCashHandovers: vi.fn().mockResolvedValue([]),
  getFeeSummary: vi.fn().mockResolvedValue({}),
  getClosePeriods: vi.fn().mockResolvedValue([]),
  getBillSlipBatches: vi.fn().mockResolvedValue([]),
  getCollectionPayments: vi.fn().mockResolvedValue([]),
  previewSlipTemplate: vi.fn().mockResolvedValue({}),
  exportSlipTemplate: vi.fn(),
}))
vi.mock('@/api/fees', () => apiMocks)

const authMocks = vi.hoisted(() => ({ hasPermission: vi.fn(() => true) }))
vi.mock('@/utils/auth', () => authMocks)

vi.mock('@/utils/academic', () => ({
  getCurrentAcademicTerm: () => ({ school_year: 115, semester: 1 }),
}))
vi.mock('@/stores/classroomAll', () => ({
  useAllClassroomStore: () => ({ classrooms: [], fetchClassrooms: vi.fn() }),
}))

vi.mock('../FeeSlipTemplateDialog.vue', () => ({
  __esModule: true,
  default: {
    name: 'FeeSlipTemplateDialog',
    props: ['modelValue', 'kind', 'defaultYear', 'defaultMonth'],
    emits: ['update:modelValue'],
    template: '<div />',
  },
}))

import FeeBillingWorkspace from '../FeeBillingWorkspace.vue'

const GLOBAL_STUBS = {
  FeeMonthlyStatement: true,
  FeeRecordsTab: true,
  FeeMatchingPanel: true,
  CashItemsView: true,
  FeeRefundsTab: true,
  FeeBillSlipDrawer: true,
  ManualFeeRecordDialog: true,
  'el-button': { template: '<button type="button" v-bind="$attrs"><slot /></button>' },
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { template: '<div v-bind="$attrs"><slot /></div>' },
  'el-icon': { template: '<i><slot /></i>' },
  teleport: true,
}

function mountWorkspace() {
  return mount(FeeBillingWorkspace, {
    props: { view: 'receivable' },
    global: {
      stubs: GLOBAL_STUBS,
    },
  })
}

describe('FeeBillingWorkspace 產生範本入口', () => {
  beforeEach(() => vi.clearAllMocks())

  it('應收帳款檢視有「產生範本」下拉', async () => {
    const wrapper = mountWorkspace()
    await nextTick()
    expect(wrapper.find('[data-test="billing-slip-template-menu"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="slip-template-monthly"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="slip-template-registration"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('選月費單會以 monthly 開啟對話框', async () => {
    const wrapper = mountWorkspace()
    await nextTick()
    await (wrapper.vm as unknown as { onSlipTemplateCommand: (c: string) => void })
      .onSlipTemplateCommand('monthly')
    await nextTick()
    const dialog = wrapper.findComponent({ name: 'FeeSlipTemplateDialog' })
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('kind')).toBe('monthly')
    wrapper.unmount()
  })

  it('選註冊費單會以 registration 開啟對話框', async () => {
    const wrapper = mountWorkspace()
    await nextTick()
    await (wrapper.vm as unknown as { onSlipTemplateCommand: (c: string) => void })
      .onSlipTemplateCommand('registration')
    await nextTick()
    expect(
      wrapper.findComponent({ name: 'FeeSlipTemplateDialog' }).props('kind'),
    ).toBe('registration')
    wrapper.unmount()
  })

  it('沒有寫入權限時不顯示入口', async () => {
    authMocks.hasPermission.mockReturnValue(false)
    const wrapper = mountWorkspace()
    await nextTick()
    expect(wrapper.find('[data-test="billing-slip-template-menu"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
