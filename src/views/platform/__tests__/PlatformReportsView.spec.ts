/**
 * 跨分校報表頁：查詢條件（含 tenant_ids）進 API 與快取 key、失敗分校要顯示、
 * 欄位由實際資料推導（後端加指標不需要改前端）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  listTenants: vi.fn(),
  getPlatformReport: vi.fn(),
}))

vi.mock('@/api/platform', () => ({
  listTenants: h.listTenants,
  getPlatformReport: h.getPlatformReport,
}))
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), prompt: vi.fn() },
}))
vi.mock('@/utils/auth', () => ({ hasPermission: () => true }))

import { _resetCacheForTesting } from '@/composables/useCachedAsync'
import PlatformReportsView from '../PlatformReportsView.vue'

const REPORT = {
  category: 'platform_overview',
  params: {},
  generated_at: '2026-08-04T10:00:00',
  cached: false,
  totals: { student_count: 120, attendance_rate: 0.93 },
  tenants: [
    { tenant_id: 2, slug: 'branch-a', name: 'A 校', data: { student_count: 100, attendance_rate: 0.95 }, error: null },
    { tenant_id: 3, slug: 'branch-b', name: 'B 校', data: {}, error: '取數逾時' },
  ],
}

const stubs = {
  PageHeader: { template: '<div><slot name="filters" /></div>' },
  EmptyState: { template: '<div class="empty" />' },
  'el-alert': { props: ['title'], template: '<div class="el-alert">{{ title }}<slot /></div>' },
  'el-button': { props: ['loading'], template: '<button><slot /></button>' },
  'el-select': { props: ['modelValue'], template: '<select><slot /></select>' },
  'el-option': { template: '<option />' },
  'el-tag': { template: '<span><slot /></span>' },
  'el-table': {
    props: ['data'],
    template: '<table><tbody><tr v-for="r in data" :key="r.tenant_id"><td>{{ r.name }}</td></tr></tbody></table>',
  },
  'el-table-column': { props: ['label'], template: '<span class="col">{{ label }}</span>' },
}

interface Vm {
  category: string
  selectedTenantIds: number[]
  metricKeys: string[]
  schoolYear: number | null
}

describe('PlatformReportsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetCacheForTesting()
    h.listTenants.mockResolvedValue({
      data: {
        items: [
          { id: 2, slug: 'branch-a', name: 'A 校', kind: 'school', status: 'active' },
          { id: 3, slug: 'branch-b', name: 'B 校', kind: 'school', status: 'active' },
        ],
        total: 2,
      },
    })
    h.getPlatformReport.mockResolvedValue({ data: REPORT })
  })

  it('預設查總覽報表，並把合計與各校列渲染出來', async () => {
    const w = mount(PlatformReportsView, { global: { stubs } })
    await flushPromises()

    expect(h.getPlatformReport).toHaveBeenCalledWith('overview', expect.objectContaining({ year: expect.any(Number) }))
    expect(w.find('[data-testid="report-totals"]').text()).toContain('120')
    expect(w.find('[data-testid="report-table"]').text()).toContain('A 校')
  })

  it('取數失敗的分校以警示列出（不靜默略過，否則彙總範圍是謊報的）', async () => {
    const w = mount(PlatformReportsView, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-testid="report-partial"]').text()).toContain('B 校')
    expect(w.find('[data-testid="report-partial"]').text()).toContain('取數逾時')
  })

  it('欄位由實際資料推導（後端加指標不需改前端）', async () => {
    const w = mount(PlatformReportsView, { global: { stubs } })
    await flushPromises()
    expect((w.vm as unknown as Vm).metricKeys).toEqual(['student_count', 'attendance_rate'])
  })

  it('切換分校篩選會重新查詢，且 tenant_ids 已排序（與後端快取 key 口徑一致）', async () => {
    const w = mount(PlatformReportsView, { global: { stubs } })
    await flushPromises()
    h.getPlatformReport.mockClear()

    const vm = w.vm as unknown as Vm
    vm.selectedTenantIds = [3, 2]
    await flushPromises()

    expect(h.getPlatformReport).toHaveBeenCalledWith('overview', expect.objectContaining({ tenant_ids: [2, 3] }))
  })

  it('切換報表類別會改打對應端點', async () => {
    const w = mount(PlatformReportsView, { global: { stubs } })
    await flushPromises()
    h.getPlatformReport.mockClear()

    const vm = w.vm as unknown as Vm
    vm.category = 'recruitment'
    await flushPromises()

    expect(h.getPlatformReport).toHaveBeenCalledWith('recruitment', expect.not.objectContaining({ year: expect.anything() }))
  })

  it('學生班級 tab 未選學年時不送 school_year；選了學年後會送', async () => {
    h.getPlatformReport.mockResolvedValue({
      data: {
        category: 'students',
        params: {},
        tenants: [
          {
            tenant_id: 1,
            slug: 'yihua',
            name: 'A 校',
            data: { enrolled_count: 95, total_capacity: 100 },
            error: null,
          },
        ],
        totals: { enrolled_count: 95, total_capacity: 100, occupancy_rate: 0.95 },
        generated_at: null,
        cached: false,
      },
    })
    const w = mount(PlatformReportsView, { global: { stubs } })
    await flushPromises()

    const vm = w.vm as unknown as Vm
    vm.category = 'students'
    await flushPromises()

    // 未選學年：school_year 不送，落到後端「未帶＝當前學期」fallback。
    expect(h.getPlatformReport).toHaveBeenLastCalledWith(
      'students',
      expect.not.objectContaining({ school_year: expect.anything() }),
    )
    // 資料真的有流進 rows（不是只有 totals 那條路徑，見 Important B）。
    expect(vm.metricKeys).toEqual(['enrolled_count', 'total_capacity'])
    // el-table-column 在測試 stub 下只渲染 label、不渲染 cell（見檔內既有測試慣例），
    // 分校列的實際數值改從彙總卡片（report-totals）驗證有渲染出來。
    expect(w.find('[data-testid="report-totals"]').text()).toContain('95')
    expect(w.find('[data-testid="report-table"]').text()).toContain('A 校')

    h.getPlatformReport.mockClear()
    vm.schoolYear = 114
    await flushPromises()

    expect(h.getPlatformReport).toHaveBeenLastCalledWith(
      'students',
      expect.objectContaining({ school_year: 114 }),
    )
  })

  it('活動 tab：未選學年時 school_year/semester 皆不送；選了學年後兩者同送；人事 tab 帶 year', async () => {
    const w = mount(PlatformReportsView, { global: { stubs } })
    await flushPromises()

    const vm = w.vm as unknown as Vm
    vm.category = 'activities'
    await flushPromises()

    // 未選學年：school_year 與 semester 都不送——不能只送 semester，
    // 否則撞後端「同時給或同時不給」約束（400）。
    expect(h.getPlatformReport).toHaveBeenLastCalledWith(
      'activities',
      expect.not.objectContaining({ school_year: expect.anything() }),
    )
    expect(h.getPlatformReport).toHaveBeenLastCalledWith(
      'activities',
      expect.not.objectContaining({ semester: expect.anything() }),
    )

    h.getPlatformReport.mockClear()
    vm.schoolYear = 114
    await flushPromises()

    expect(h.getPlatformReport).toHaveBeenLastCalledWith(
      'activities',
      expect.objectContaining({
        school_year: 114,
        semester: expect.any(Number),
      }),
    )

    vm.category = 'hr'
    await flushPromises()

    expect(h.getPlatformReport).toHaveBeenLastCalledWith(
      'hr',
      expect.objectContaining({ year: expect.any(Number) }),
    )
  })
})
