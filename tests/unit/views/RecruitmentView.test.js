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
const getRecruitmentCampusSetting = vi.fn()
const updateRecruitmentCampusSetting = vi.fn()
const getRecruitmentMarketIntelligence = vi.fn()
const syncRecruitmentMarketIntelligence = vi.fn()
const getRecruitmentNearbyKindergartens = vi.fn()
const getPeriods = vi.fn()
const getPeriodsSummary = vi.fn()
const downloadFile = vi.fn()

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
  getRecruitmentCampusSetting: (...args) => getRecruitmentCampusSetting(...args),
  updateRecruitmentCampusSetting: (...args) => updateRecruitmentCampusSetting(...args),
  getRecruitmentMarketIntelligence: (...args) => getRecruitmentMarketIntelligence(...args),
  syncRecruitmentMarketIntelligence: (...args) => syncRecruitmentMarketIntelligence(...args),
  getRecruitmentNearbyKindergartens: (...args) => getRecruitmentNearbyKindergartens(...args),
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
  getGovKindergartens: vi.fn(() => Promise.resolve({ data: { schools: [], total: 0 } })),
  syncGovKindergartens: vi.fn(),
  getGovKindergartensSyncStatus: vi.fn(() => Promise.resolve({ data: { sync_in_progress: false } })),
}))

vi.mock('@/utils/error', () => ({
  apiError: vi.fn((_err, fallback) => fallback),
}))

vi.mock('@/utils/download', () => ({
  downloadFile: (...args) => downloadFile(...args),
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
  reference_month: '115.04',
  decision_summary: {
    current_month: { visit: 3, deposit: 1, enrolled: 1, visit_to_deposit_rate: 33.3, visit_to_enrolled_rate: 33.3 },
    rolling_30d: { visit: 6, deposit: 2, enrolled: 1, visit_to_deposit_rate: 33.3, visit_to_enrolled_rate: 16.7 },
    rolling_90d: { visit: 8, deposit: 3, enrolled: 2, visit_to_deposit_rate: 37.5, visit_to_enrolled_rate: 25 },
    ytd: { visit: 10, deposit: 4, enrolled: 3, visit_to_deposit_rate: 40, visit_to_enrolled_rate: 30 },
  },
  funnel_snapshot: {
    visit: 3,
    deposit: 1,
    enrolled: 1,
    transfer_term: 0,
    effective_deposit: 1,
    pending_deposit: 0,
  },
  month_over_month: {
    current_month: '115.04',
    previous_month: '115.03',
    visit_to_deposit_rate: { current: 33.3, previous: 50, delta: -16.7 },
    visit_to_enrolled_rate: { current: 33.3, previous: 25, delta: 8.3 },
  },
  alerts: [],
  top_action_queue: [],
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

const mountView = (props = {}) => shallowMount(RecruitmentView, {
  props,
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
      RecruitmentAddressHeatmap: { name: 'RecruitmentAddressHeatmap', template: '<div />' },
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
        summary: {
          high_potential_count: 8,
          overdue_followup_count: 3,
          cold_count: 1,
        },
      },
    })
    getRecruitmentAddressHotspots.mockResolvedValue({
      data: {
        records_with_address: 2,
        total_hotspots: 2,
        geocoded_hotspots: 0,
        pending_hotspots: 2,
        remaining_hotspots: 2,
        failed_hotspots: 0,
        stale_hotspots: 1,
        provider_available: true,
        provider_name: 'nominatim',
        hotspots: [
          { address: '高雄市三民區民族一路100號', district: '三民區', visit: 2, deposit: 1, google_place_id: null },
        ],
      },
    })
    getRecruitmentCampusSetting.mockResolvedValue({
      data: {
        campus_name: '本園',
        campus_address: '高雄市三民區民族一路100號',
        campus_lat: 22.6461,
        campus_lng: 120.3209,
        travel_mode: 'driving',
      },
    })
    getRecruitmentMarketIntelligence.mockResolvedValue({
      data: {
        campus: {
          campus_name: '本園',
          campus_address: '高雄市三民區民族一路100號',
          campus_lat: 22.6461,
          campus_lng: 120.3209,
          travel_mode: 'driving',
        },
        districts: [
          {
            district: '三民區',
            town_code: '64000010',
            lead_count_30d: 1,
            lead_count_90d: 2,
            deposit_rate_90d: 50,
            avg_travel_minutes: 9.2,
            population_density: 1234.5,
            population_0_6: 456,
            data_completeness: 'partial',
          },
        ],
        data_completeness: 'partial',
        synced_at: '2026-04-10T12:00:00',
      },
    })
    syncRecruitmentAddressHotspots.mockResolvedValue({
      data: {
        records_with_address: 2,
        total_hotspots: 2,
        geocoded_hotspots: 2,
        pending_hotspots: 0,
        remaining_hotspots: 0,
        failed_hotspots: 0,
        stale_hotspots: 1,
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
            google_place_id: 'google-place-1',
          },
        ],
        sync_mode: 'incremental',
        attempted: 2,
        synced: 2,
        failed: 0,
        skipped: 0,
      },
    })
    updateRecruitmentCampusSetting.mockResolvedValue({
      data: {
        campus_name: '本園',
        campus_address: '高雄市三民區民族一路100號',
        campus_lat: 22.6461,
        campus_lng: 120.3209,
        travel_mode: 'driving',
      },
    })
    syncRecruitmentMarketIntelligence.mockResolvedValue({
      data: {
        snapshot: {
          campus: {
            campus_name: '本園',
            campus_address: '高雄市三民區民族一路100號',
            campus_lat: 22.6461,
            campus_lng: 120.3209,
            travel_mode: 'driving',
          },
          districts: [
            {
              district: '三民區',
              town_code: '64000010',
              lead_count_30d: 1,
              lead_count_90d: 2,
              deposit_rate_90d: 50,
              avg_travel_minutes: 9.2,
              population_density: 1234.5,
              population_0_6: 456,
              data_completeness: 'partial',
            },
          ],
          data_completeness: 'partial',
          synced_at: '2026-04-10T12:00:00',
        },
      },
    })
    getRecruitmentNearbyKindergartens.mockResolvedValue({
      data: {
        provider_available: true,
        provider_name: 'google',
        query_bounds: {
          south: 22.62,
          west: 120.29,
          north: 22.69,
          east: 120.35,
          zoom: 13,
        },
        total: 2,
        schools: [
          {
            place_id: 'place-1',
            name: '本園旁幼兒園',
            formatted_address: '高雄市三民區民族一路100號',
            lat: 22.6461,
            lng: 120.3209,
            primary_type: 'preschool',
            types: ['preschool', 'school'],
            business_status: 'OPERATIONAL',
            google_maps_uri: 'https://maps.google.com/?cid=1',
            distance_km: 0,
          },
          {
            place_id: 'place-2',
            name: '另一間幼兒園',
            formatted_address: '高雄市三民區建國一路10號',
            lat: 22.6401,
            lng: 120.3159,
            primary_type: 'preschool',
            types: ['preschool', 'school'],
            business_status: 'OPERATIONAL',
            google_maps_uri: 'https://maps.google.com/?cid=2',
            distance_km: 1.1,
          },
        ],
        message: null,
      },
    })
    getPeriods.mockResolvedValue({ data: [] })
    getPeriodsSummary.mockResolvedValue({ data: null })
    downloadFile.mockResolvedValue(undefined)
  })

  it('loads dashboard stats and options on initial overview load without detail data', async () => {
    mountView()

    await flushPromises()

    expect(getRecruitmentStats).toHaveBeenCalledTimes(1)
    expect(getRecruitmentOptions).toHaveBeenCalledTimes(1)
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

  it('keeps manual recruitment requests free of dataset scope parameters', async () => {
    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.onTabClick({ paneName: 'detail' })
    await flushPromises()

    for (const [params] of getRecruitmentStats.mock.calls) {
      expect(params?.dataset_scope).toBeUndefined()
    }
    for (const [params] of getRecruitmentRecords.mock.calls) {
      expect(params?.dataset_scope).toBeUndefined()
    }
    expect(recruitmentViewSource).not.toContain('dataset_scope')
    expect(recruitmentViewSource).not.toContain('datasetScope')
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
      priority: 'high',
    })

    wrapper.vm.onNDPageChange(2)
    await flushPromises()

    expect(getNoDepositAnalysis).toHaveBeenLastCalledWith({
      page: 2,
      page_size: 50,
      priority: 'high',
    })
  })

  it('reloads dashboard stats when the reference month changes', async () => {
    const wrapper = mountView()

    await flushPromises()
    getRecruitmentStats.mockClear()

    await wrapper.vm.handleReferenceMonthChange('115.04')
    await flushPromises()

    expect(getRecruitmentStats).toHaveBeenCalledWith({ reference_month: '115.04' })
  })


  it('routes dashboard actions into the no-deposit tab filters', async () => {
    const wrapper = mountView()

    await flushPromises()
    getNoDepositAnalysis.mockClear()

    await wrapper.vm.handleDashboardTarget({
      target_tab: 'nodeposit',
      target_filter: { priority: 'high', overdue_days: 14, cold_only: false },
    })
    await flushPromises()

    expect(wrapper.vm.activeTab).toBe('nodeposit')
    expect(wrapper.vm.ndFilter.priority).toBe('high')
    expect(wrapper.vm.ndFilter.overdue_days).toBe(14)
    expect(getNoDepositAnalysis).toHaveBeenCalledWith({
      page: 1,
      page_size: 50,
      priority: 'high',
      overdue_days: 14,
    })
  })

  it('routes dashboard actions into the area tab and selected district', async () => {
    const wrapper = mountView()

    await flushPromises()

    await wrapper.vm.handleDashboardTarget({
      target_tab: 'area',
      target_filter: { district: '三民區' },
    })
    await flushPromises()

    expect(wrapper.vm.activeTab).toBe('area')
    expect(wrapper.vm.selectedMarketDistrict).toBe('三民區')
  })

  it('lazy loads address hotspots when area tab is opened', async () => {
    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.onTabClick({ paneName: 'area' })
    await flushPromises()

    expect(getRecruitmentCampusSetting).toHaveBeenCalledTimes(1)
    expect(getRecruitmentMarketIntelligence).toHaveBeenCalledTimes(1)
    expect(getRecruitmentAddressHotspots).toHaveBeenCalledWith({ limit: 200 })
    expect(wrapper.vm.currentCampus.campus_name).toBe('本園')
    expect(wrapper.vm.selectedMarketDistrict).toBe('')
    expect(wrapper.vm.marketSnapshot.districts[0]).toMatchObject({
      district: '三民區',
      lead_count_90d: 2,
      population_density: 1234.5,
    })
    expect(wrapper.vm.areaHotspotsSummary.hotspots).toEqual([
      { address: '高雄市三民區民族一路100號', district: '三民區', visit: 2, deposit: 1, google_place_id: null },
    ])
  })

  it('syncs hotspot geocodes and updates area summary', async () => {
    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.handleAreaHotspotSync()

    expect(syncRecruitmentAddressHotspots).toHaveBeenCalledWith({
      batch_size: 20,
      limit: 200,
      sync_mode: 'incremental',
    })
    expect(wrapper.vm.areaHotspotsSummary.geocoded_hotspots).toBe(2)
    expect(wrapper.vm.areaHotspotsSummary.provider_name).toBe('google')
    expect(wrapper.vm.areaLoaded).toBe(true)
    expect(getRecruitmentMarketIntelligence).toHaveBeenCalled()
  })

  it('keeps syncing hotspot batches until all pending addresses finish', async () => {
    syncRecruitmentAddressHotspots
      .mockReset()
      .mockResolvedValueOnce({
        data: {
          records_with_address: 25,
          total_hotspots: 25,
          geocoded_hotspots: 20,
          pending_hotspots: 5,
          remaining_hotspots: 5,
          failed_hotspots: 0,
          stale_hotspots: 1,
          provider_available: true,
          provider_name: 'google',
          hotspots: [],
          sync_mode: 'incremental',
          attempted: 20,
          synced: 20,
          failed: 0,
          skipped: 0,
        },
      })
      .mockResolvedValueOnce({
        data: {
          records_with_address: 25,
          total_hotspots: 25,
          geocoded_hotspots: 25,
          pending_hotspots: 0,
          remaining_hotspots: 0,
          failed_hotspots: 0,
          stale_hotspots: 1,
          provider_available: true,
          provider_name: 'google',
          hotspots: [],
          sync_mode: 'incremental',
          attempted: 5,
          synced: 5,
          failed: 0,
          skipped: 20,
        },
      })

    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.handleAreaHotspotSync()

    expect(syncRecruitmentAddressHotspots).toHaveBeenCalledTimes(2)
    expect(syncRecruitmentAddressHotspots).toHaveBeenNthCalledWith(1, {
      batch_size: 20,
      limit: 200,
      sync_mode: 'incremental',
    })
    expect(syncRecruitmentAddressHotspots).toHaveBeenNthCalledWith(2, {
      batch_size: 20,
      limit: 200,
      sync_mode: 'incremental',
    })
    expect(wrapper.vm.areaHotspotsSummary.remaining_hotspots).toBe(0)
    expect(wrapper.vm.areaHotspotsSummary.geocoded_hotspots).toBe(25)
  })

  it('supports google-only resync for stale hotspot cache', async () => {
    syncRecruitmentAddressHotspots.mockResolvedValueOnce({
      data: {
        records_with_address: 2,
        total_hotspots: 2,
        geocoded_hotspots: 2,
        pending_hotspots: 0,
        remaining_hotspots: 0,
        failed_hotspots: 0,
        stale_hotspots: 0,
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
            google_place_id: 'google-place-1',
          },
        ],
        sync_mode: 'resync_google',
        attempted: 1,
        synced: 1,
        failed: 0,
        skipped: 1,
      },
    })

    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.handleAreaHotspotSync('resync_google')

    expect(syncRecruitmentAddressHotspots).toHaveBeenCalledWith({
      batch_size: 20,
      limit: 200,
      sync_mode: 'resync_google',
    })
    expect(wrapper.vm.areaHotspotsSummary.stale_hotspots).toBe(0)
  })

  it('syncs market intelligence and updates the district comparison snapshot', async () => {
    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.handleMarketSync()

    expect(syncRecruitmentMarketIntelligence).toHaveBeenCalledWith({ hotspot_limit: 200 })
    expect(wrapper.vm.marketSnapshot.districts[0]).toMatchObject({
      district: '三民區',
      lead_count_90d: 2,
      population_density: 1234.5,
    })
  })

  it('saves campus settings and refreshes area data', async () => {
    const wrapper = mountView()

    await flushPromises()
    wrapper.vm.openCampusDialog()
    wrapper.vm.campusForm.campus_name = '更新後園所'
    await wrapper.vm.handleCampusSave()

    expect(updateRecruitmentCampusSetting).toHaveBeenCalledWith(expect.objectContaining({
      campus_name: '更新後園所',
    }))
    expect(getRecruitmentMarketIntelligence).toHaveBeenCalled()
  })

  it('fetches nearby kindergartens when loading the area tab', async () => {
    // 2026-04 重構：移除 viewport-change 綁定，改為切換到「區域分析」tab 時
    // 一次載入周圍幼兒園（無 bounds / no-arg 呼叫）。
    const wrapper = mountView()

    await flushPromises()
    getRecruitmentNearbyKindergartens.mockClear()

    await wrapper.vm.onTabClick({ paneName: 'area' })
    await flushPromises()

    expect(getRecruitmentNearbyKindergartens).toHaveBeenCalled()
    expect(wrapper.vm.nearbySchools).toHaveLength(2)
    expect(wrapper.vm.nearbySchools[0]).toMatchObject({
      place_id: 'place-1',
      name: '本園旁幼兒園',
    })
  })

  it('keeps area hotspot data intact when nearby kindergarten provider is unavailable', async () => {
    getRecruitmentNearbyKindergartens.mockResolvedValue({
      data: {
        provider_available: false,
        provider_name: 'google',
        total: 0,
        schools: [],
        message: '尚未設定 Google Places API',
      },
    })

    const wrapper = mountView()

    await flushPromises()
    await wrapper.vm.onTabClick({ paneName: 'area' })
    await flushPromises()

    expect(wrapper.vm.nearbySchoolsAvailable).toBe(false)
    expect(wrapper.vm.nearbySchoolsMessage).toContain('Google Places API')
    expect(wrapper.vm.areaHotspotsSummary.hotspots).toEqual([
      { address: '高雄市三民區民族一路100號', district: '三民區', visit: 2, deposit: 1, google_place_id: null },
    ])
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

  it('extracts district filter UI out of the main view', () => {
    // 2026-04 重構：原本 RecruitmentView 內嵌的 district 篩選相關邏輯
    // 已搬到 RecruitmentAreaTab 子元件，主視圖只保留 v-model 綁定與 prop 傳遞。
    expect(recruitmentViewSource).not.toContain('來源地址明細')
    expect(recruitmentViewSource).not.toContain('selectedDistrictDetail')
    expect(recruitmentViewSource).not.toContain('selectedDistrictHotspots')
    expect(recruitmentViewSource).toContain('v-model:selected-district="selectedMarketDistrict"')
  })
})
