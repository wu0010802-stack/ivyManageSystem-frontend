import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.setConfig({ testTimeout: 15000 })

// 招生獎金三個子分頁（統計表／獎金條／轉帳名冊）載入失敗時，不能退回「尚無資料」或「合計 0 元」：
// 統計表與名冊是發放依據，行政會把失敗誤讀成沒有人要發錢。

const mocks = vi.hoisted(() => ({
  getCampaignReport: vi.fn(),
  getTransferRoster: vi.fn(),
  messageError: vi.fn(),
}))

vi.mock('@/api/recruitmentBonus', () => ({
  getCampaignReport: (...a: unknown[]) => mocks.getCampaignReport(...a),
  getTransferRoster: (...a: unknown[]) => mocks.getTransferRoster(...a),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>()
  return { ...actual, ElMessage: { error: (...a: unknown[]) => mocks.messageError(...a), success: vi.fn() } }
})

import ReportStatementTab from '../ReportStatementTab.vue'
import BonusSlipsTab from '../BonusSlipsTab.vue'
import TransferRosterTab from '../TransferRosterTab.vue'

const REPORT = {
  campaign_id: 1,
  campaign_name: '115.03',
  status: 'open',
  total_amount: 12720,
  settled_mismatches: [],
  unassigned_rows: [],
  blocks: [
    {
      employee_id: 11,
      employee_name: '王雅玲',
      resigned: false,
      counted_persons: 15,
      unit_price: 2000,
      gross_amount: 12720,
      share_in: 0,
      share_out: 0,
      total_amount: 12720,
      formula_text: '(2000*13*0.3*1.5)',
      rows: [
        {
          attribution_id: 1,
          child_name: '黃翊睿',
          visit_grade: '幼幼班',
          point_code: 'self_report',
          point_label: '自報生',
          points: 0.3,
          grade_multiplier: 1.5,
          status: 'confirmed',
          employee_assigned: true,
          uncategorized: false,
        },
      ],
      deferred_rows: [],
    },
  ],
}

const ROSTER = {
  campaign_id: 1,
  campaign_name: '115.03',
  account_masked: false,
  total_amount: 12720,
  rows: [
    {
      employee_id: 11,
      employee_name: '王雅玲',
      bank_code: '013',
      bank_account: '123456',
      bank_account_name: '王雅玲',
      amount: 12720,
      missing_account: false,
    },
  ],
}

const failure = () => Object.assign(new Error('boom'), { response: { status: 500, data: {} } })

const STUBS = {
  'el-button': {
    props: ['disabled', 'loading'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  'el-table': { props: ['data'], template: '<div class="table-stub">{{ JSON.stringify(data) }}</div>' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-tooltip': { template: '<span><slot /></span>' },
}
const mountTab = (comp: unknown) =>
  mount(comp as never, { props: { campaignId: 1 }, global: { stubs: STUBS, directives: { loading: () => {} } } })

beforeEach(() => {
  mocks.getCampaignReport.mockReset()
  mocks.getTransferRoster.mockReset()
  mocks.messageError.mockReset()
})

describe('ReportStatementTab 載入失敗', () => {
  it('失敗顯示錯誤態，不說「尚無歸屬資料」；重試成功後顯示報表', async () => {
    mocks.getCampaignReport.mockRejectedValueOnce(failure())
    const wrapper = mountTab(ReportStatementTab)
    await flushPromises()

    expect(wrapper.find('[data-test="load-error-state"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('統計表載入失敗')
    // 畫面上只該有錯誤態一個標題，不能同時出現「尚無歸屬資料」空狀態
    expect(wrapper.findAll('.empty-state__title').map((t) => t.text())).toEqual(['統計表載入失敗'])
    expect(mocks.messageError).toHaveBeenCalledTimes(1)

    mocks.getCampaignReport.mockResolvedValueOnce({ data: REPORT })
    await wrapper.find('[data-test="load-error-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-test="load-error-state"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('王雅玲')
    expect(wrapper.text()).toContain('計算式')
  })

  it('重載失敗時清掉舊報表，不繼續顯示過期金額', async () => {
    mocks.getCampaignReport.mockResolvedValueOnce({ data: REPORT })
    const wrapper = mountTab(ReportStatementTab)
    await flushPromises()
    expect(wrapper.text()).toContain('王雅玲')

    mocks.getCampaignReport.mockRejectedValueOnce(failure())
    await (wrapper.vm as unknown as { reload: () => Promise<void> }).reload()
    await flushPromises()

    expect(wrapper.text()).not.toContain('王雅玲')
    expect(wrapper.find('[data-test="load-error-state"]').exists()).toBe(true)
  })
})

describe('BonusSlipsTab 載入失敗與抬頭', () => {
  it('失敗顯示錯誤態與重新載入，不說「尚無可發放獎金」', async () => {
    mocks.getCampaignReport.mockRejectedValueOnce(failure())
    const wrapper = mountTab(BonusSlipsTab)
    await flushPromises()

    expect(wrapper.text()).toContain('獎金條載入失敗')
    expect(wrapper.findAll('.empty-state__title').map((t) => t.text())).toEqual(['獎金條載入失敗'])

    mocks.getCampaignReport.mockResolvedValueOnce({ data: REPORT })
    await wrapper.find('[data-test="load-error-retry"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('王雅玲')
  })

  it('獎金條抬頭取自品牌設定（預設租戶仍是「高雄市私立常春藤幼兒園」）', async () => {
    mocks.getCampaignReport.mockResolvedValueOnce({ data: REPORT })
    const wrapper = mountTab(BonusSlipsTab)
    await flushPromises()

    expect(wrapper.text()).toContain('高雄市私立常春藤幼兒園──招生獎金條（115.03）')
  })

  it('沒有可發放的獎金條時不能按列印', async () => {
    mocks.getCampaignReport.mockResolvedValueOnce({ data: { ...REPORT, blocks: [] } })
    const wrapper = mountTab(BonusSlipsTab)
    await flushPromises()

    const printBtn = wrapper.findAll('button').find((b) => b.text().includes('列印獎金條'))
    expect(printBtn?.attributes('disabled')).toBeDefined()
  })
})

describe('TransferRosterTab 載入失敗', () => {
  it('失敗不顯示「合計 0 元」的空名冊，改顯示錯誤態；重試成功後顯示名冊', async () => {
    mocks.getTransferRoster.mockRejectedValueOnce(failure())
    const wrapper = mountTab(TransferRosterTab)
    await flushPromises()

    expect(wrapper.text()).toContain('轉帳名冊載入失敗')
    expect(wrapper.find('.roster-total').exists()).toBe(false)
    expect(wrapper.find('.table-stub').exists()).toBe(false)

    mocks.getTransferRoster.mockResolvedValueOnce({ data: ROSTER })
    await wrapper.find('[data-test="load-error-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.roster-total').text()).toContain('12,720')
    expect(wrapper.find('[data-test="load-error-state"]').exists()).toBe(false)
  })
})
