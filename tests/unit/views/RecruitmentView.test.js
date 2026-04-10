import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import RecruitmentView from '@/views/RecruitmentView.vue'

const getRecruitmentStats = vi.fn()
const getRecruitmentOptions = vi.fn()
const getRecruitmentRecords = vi.fn()
const getNoDepositAnalysis = vi.fn()
const getRecruitmentAddressHotspots = vi.fn()
const syncRecruitmentAddressHotspots = vi.fn()
const getPeriods = vi.fn()
const getPeriodsSummary = vi.fn()

vi.mock('chart.js', () => ({
  Chart: { register: vi.fn() },
  CategoryScale: {},
  LinearScale: {},
  BarElement: {},
  PointElement: {},
  LineElement: {},
  ArcElement: {},
  Title: {},
  Tooltip: {},
  Legend: {},
}))

vi.mock('vue-chartjs', () => ({
  Bar: { name: 'Bar', template: '<div />' },
  Line: { name: 'Line', template: '<div />' },
  Doughnut: { name: 'Doughnut', template: '<div />' },
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  ElMessageBox: {
    confirm: vi.fn(() => Promise.resolve()),
  },
}))

vi.mock('@/api/recruitment', () => ({
  getRecruitmentStats: (...args) => getRecruitmentStats(...args),
  getRecruitmentOptions: (...args) => getRecruitmentOptions(...args),
  getRecruitmentRecords: (...args) => getRecruitmentRecords(...args),
  createRecruitmentRecord: vi.fn(),
  updateRecruitmentRecord: vi.fn(),
  deleteRecruitmentRecord: vi.fn(),
  getNoDepositAnalysis: (...args) => getNoDepositAnalysis(...args),
  getRecruitmentAddressHotspots: (...args) => getRecruitmentAddressHotspots(...args),
  syncRecruitmentAddressHotspots: (...args) => syncRecruitmentAddressHotspots(...args),
  getPeriods: (...args) => getPeriods(...args),
  getPeriodsSummary: (...args) => getPeriodsSummary(...args),
  createPeriod: vi.fn(),
  updatePeriod: vi.fn(),
  deletePeriod: vi.fn(),
  syncPeriod: vi.fn(),
  exportRecruitmentStats: vi.fn(),
  getMonths: vi.fn(() => Promise.resolve({ data: [] })),
  addMonth: vi.fn(),
  deleteMonth: vi.fn(),
}))

vi.mock('@/utils/error', () => ({
  apiError: vi.fn((_err, fallback) => fallback),
}))

vi.mock('@/utils/auth', () => ({
  getUserInfo: vi.fn(() => ({ permissions: -1 })),
  PERMISSION_VALUES: {
    RECRUITMENT_WRITE: '1',
  },
}))

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const defaultStats = {
  total_visit: 0,
  total_deposit: 0,
  total_enrolled: 0,
  total_transfer_term: 0,
  total_pending_deposit: 0,
  total_effective_deposit: 0,
  unique_visit: 0,
  unique_deposit: 0,
  visit_to_deposit_rate: 0,
  visit_to_enrolled_rate: 0,
  deposit_to_enrolled_rate: 0,
  effective_to_enrolled_rate: 0,
  chuannian_visit: 0,
  chuannian_deposit: 0,
  monthly: [],
  by_grade: [],
  month_grade: {},
  by_source: [],
  by_referrer: [],
  by_district: [],
  referrer_source_cross: null,
  no_deposit_reasons: [],
  chuannian_by_expected: [],
  chuannian_by_grade: [],
  by_year: [],
}

const defaultOptions = {
  months: ['115.04'],
  grades: ['小班'],
  sources: ['網路'],
  referrers: ['王主任'],
  no_deposit_reasons: ['費用考量'],
}

const recruitmentViewSource = readFileSync(
  resolve(process.cwd(), 'src/views/RecruitmentView.vue'),
  'utf8',
)

const mountView = () => shallowMount(RecruitmentView, {
  global: {
    directives: {
      loading: () => {},
    },
    stubs: {
      'el-button': { template: '<button><slot /></button>' },
      'el-card': { template: '<div><slot /><slot name="header" /></div>' },
      'el-table': { template: '<div><slot /></div>' },
      'el-table-column': true,
      'el-tabs': { template: '<div><slot /></div>' },
      'el-tab-pane': { template: '<div><slot /></div>' },
      'el-select': { template: '<div><slot /></div>' },
      'el-option': true,
      'el-pagination': true,
      'el-empty': true,
      'el-input': true,
      'el-tag': { template: '<span><slot /></span>' },
      'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
      'el-date-picker': true,
      'el-form': { template: '<form><slot /></form>' },
      'el-form-item': { template: '<div><slot /></div>' },
      'el-row': { template: '<div><slot /></div>' },
      'el-col': { template: '<div><slot /></div>' },
      'el-autocomplete': true,
      'el-switch': true,
      'el-input-number': true,
    },
  },
})

describe('RecruitmentView', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    getRecruitmentStats.mockResolvedValue({ data: defaultStats })
    getRecruitmentOptions.mockResolvedValue({ data: defaultOptions })
    getRecruitmentRecords.mockResolvedValue({
      data: { records: [], total: 0 },
    })
    getNoDepositAnalysis.mockResolvedValue({
      data: {
        records: [{ id: 1, child_name: '小安' }],
        total: 120,
      },
    })
    getRecruitmentAddressHotspots.mockResolvedValue({
      data: {
        records_with_address: 2,
        total_hotspots: 2,
        geocoded_hotspots: 0,
        pending_hotspots: 2,
        failed_hotspots: 0,
        provider_available: true,
        provider_name: 'nominatim',
        hotspots: [
          { address: '高雄市三民區民族一路100號', district: '三民區', visit: 2, deposit: 1 },
        ],
      },
    })
    syncRecruitmentAddressHotspots.mockResolvedValue({
      data: {
        records_with_address: 2,
        total_hotspots: 2,
        geocoded_hotspots: 1,
        pending_hotspots: 1,
        failed_hotspots: 0,
        provider_available: true,
        provider_name: 'google',
        hotspots: [
          {
            address: '高雄市三民區民族一路100號',
            district: '三民區',
            visit: 2,
            deposit: 1,
            lat: 22.6461,
            lng: 120.3209,
            geocode_status: 'resolved',
            provider: 'google',
            formatted_address: 'TW 高雄市三民區民族一路100號',
          },
        ],
        synced: 1,
        failed: 0,
      },
    })
    getPeriods.mockResolvedValue({ data: [] })
    getPeriodsSummary.mockResolvedValue({ data: null })
  })

  it('does not fetch detail data or filter options on initial overview load', async () => {
    mountView()

    await flushPromises()

    expect(getRecruitmentStats).toHaveBeenCalledTimes(1)
    expect(getRecruitmentOptions).not.toHaveBeenCalled()
    expect(getRecruitmentRecords).not.toHaveBeenCalled()
    expect(getRecruitmentAddressHotspots).not.toHaveBeenCalled()
  })

  it('lazy loads detail data and options when detail tab is opened', async () => {
    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.onTabClick({ paneName: 'detail' })
    await flushPromises()

    expect(getRecruitmentOptions).toHaveBeenCalledTimes(1)
    expect(getRecruitmentRecords).toHaveBeenCalledWith({
      page: 1,
      page_size: 50,
    })
  })

  it('tracks the active tab so non-current charts can stay unmounted', async () => {
    const wrapper = mountView()

    await flushPromises()

    expect(wrapper.vm.activeTab).toBe('overview')
    expect(wrapper.vm.isChartTabActive('class')).toBe(false)

    await wrapper.vm.onTabClick({ paneName: 'class' })

    expect(wrapper.vm.activeTab).toBe('class')
    expect(wrapper.vm.isChartTabActive('class')).toBe(true)
    expect(wrapper.vm.isChartTabActive('overview')).toBe(false)
  })

  it('passes page state when loading no-deposit data', async () => {
    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.onTabClick({ paneName: 'nodeposit' })
    await flushPromises()

    expect(getNoDepositAnalysis).toHaveBeenLastCalledWith({
      page: 1,
      page_size: 50,
    })

    wrapper.vm.onNDPageChange(2)
    await flushPromises()

    expect(getNoDepositAnalysis).toHaveBeenLastCalledWith({
      page: 2,
      page_size: 50,
    })
  })

  it('lazy loads address hotspots when area tab is opened', async () => {
    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.onTabClick({ paneName: 'area' })
    await flushPromises()

    expect(getRecruitmentAddressHotspots).toHaveBeenCalledWith({ limit: 200 })
    expect(wrapper.vm.areaHotspotsSummary.hotspots).toEqual([
      { address: '高雄市三民區民族一路100號', district: '三民區', visit: 2, deposit: 1 },
    ])
  })

  it('syncs hotspot geocodes and updates area summary', async () => {
    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.handleAreaHotspotSync()

    expect(syncRecruitmentAddressHotspots).toHaveBeenCalledWith({
      batch_size: 10,
      limit: 200,
    })
    expect(wrapper.vm.areaHotspotsSummary.geocoded_hotspots).toBe(1)
    expect(wrapper.vm.areaHotspotsSummary.provider_name).toBe('google')
    expect(wrapper.vm.areaLoaded).toBe(true)
  })

  it('uses fixed 0-100 percent scales for rate charts', async () => {
    const wrapper = mountView()

    await flushPromises()

    expect(wrapper.vm.percentBarOptions.scales.y.min).toBe(0)
    expect(wrapper.vm.percentBarOptions.scales.y.max).toBe(100)
    expect(wrapper.vm.percentHorizBarOptions.scales.x.max).toBe(100)
    expect(wrapper.vm.percentLineOptions.scales.y.ticks.callback(68)).toBe('68%')
    expect(
      wrapper.vm.percentHorizBarOptions.plugins.tooltip.callbacks.label({
        dataset: { label: '預繳率 (%)' },
        parsed: { x: 68.25 },
      }),
    ).toBe('預繳率 (%): 68.3%')
  })

  it('builds overview funnel charts with enrolled counts and effective conversion rate', async () => {
    getRecruitmentStats.mockResolvedValueOnce({
      data: {
        ...defaultStats,
        total_visit: 8,
        total_deposit: 6,
        total_enrolled: 4,
        total_transfer_term: 1,
        total_pending_deposit: 1,
        total_effective_deposit: 5,
        visit_to_deposit_rate: 75,
        visit_to_enrolled_rate: 50,
        deposit_to_enrolled_rate: 66.7,
        effective_to_enrolled_rate: 80,
        monthly: [
          {
            month: '115.03',
            visit: 3,
            deposit: 2,
            enrolled: 1,
            transfer_term: 0,
            pending_deposit: 1,
            effective_deposit: 2,
            visit_to_deposit_rate: 66.7,
            visit_to_enrolled_rate: 33.3,
            deposit_to_enrolled_rate: 50,
            effective_to_enrolled_rate: 50,
            chuannian_visit: 0,
            chuannian_deposit: 0,
          },
          {
            month: '115.04',
            visit: 5,
            deposit: 4,
            enrolled: 3,
            transfer_term: 1,
            pending_deposit: 0,
            effective_deposit: 3,
            visit_to_deposit_rate: 80,
            visit_to_enrolled_rate: 60,
            deposit_to_enrolled_rate: 75,
            effective_to_enrolled_rate: 100,
            chuannian_visit: 0,
            chuannian_deposit: 0,
          },
        ],
      },
    })

    const wrapper = mountView()

    await flushPromises()

    expect(wrapper.vm.monthlyBarData.datasets).toHaveLength(3)
    expect(wrapper.vm.monthlyBarData.datasets[2]).toMatchObject({
      label: '註冊人數',
      data: [1, 3],
    })
    expect(wrapper.vm.monthlyRateData.datasets.map((item) => item.label)).toEqual([
      '參觀→預繳率 (%)',
      '參觀→註冊率 (%)',
      '排除轉期→註冊率 (%)',
    ])
    expect(wrapper.vm.monthlyRateData.datasets[2].data).toEqual([50, 100])
  })

  it('keeps full no-deposit reason labels in chart data', async () => {
    getRecruitmentStats.mockResolvedValueOnce({
      data: {
        ...defaultStats,
        no_deposit_reasons: [
          { reason: '前綴相同很長很長的未預繳原因甲', count: 3, by_grade: { 小班: 2 } },
          { reason: '前綴相同很長很長的未預繳原因乙', count: 4, by_grade: { 小班: 1 } },
        ],
      },
    })

    const wrapper = mountView()

    await flushPromises()

    expect(wrapper.vm.noDepositGradeBarData.labels).toEqual([
      '前綴相同很長很長的未預繳原因甲',
      '前綴相同很長很長的未預繳原因乙',
    ])
  })

  it('uses a responsive chart grid that does not force 400px cards on mobile', () => {
    expect(recruitmentViewSource).toContain('minmax(min(100%, 320px), 1fr)')
    expect(recruitmentViewSource).toContain('@media (max-width: 768px)')
  })
})
