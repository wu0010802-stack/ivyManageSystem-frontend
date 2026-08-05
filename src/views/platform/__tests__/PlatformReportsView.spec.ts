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
})
