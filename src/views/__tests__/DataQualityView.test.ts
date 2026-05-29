import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/dataQuality', () => ({
  listReports: vi.fn().mockResolvedValue({
    data: { items: [], total: 0, page: 1, page_size: 20 },
  }),
  ackReport: vi.fn().mockResolvedValue({ data: { ok: true } }),
  resolveReport: vi.fn().mockResolvedValue({ data: { ok: true } }),
  ignoreReport: vi.fn().mockResolvedValue({ data: { ok: true } }),
  runNow: vi.fn().mockResolvedValue({
    data: { detected: 0, new_open: 0, ran_at: '2026-05-29T03:00:00+08:00' },
  }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { prompt: vi.fn().mockResolvedValue({ value: 'note' }) },
}))

import { listReports } from '@/api/dataQuality'
import { hasPermission } from '@/utils/auth'
import DataQualityView from '../DataQualityView.vue'

const globalStubs = {
  'el-button': {
    template: '<button data-test="el-button" @click="$emit(\'click\')"><slot /></button>',
  },
  'el-input': { template: '<input />', props: ['modelValue'] },
  'el-select': { template: '<select><slot /></select>', props: ['modelValue'] },
  'el-option': { template: '<option><slot /></option>' },
  'el-table': {
    template:
      '<table data-test="dq-table"><tbody><tr v-for="r in data" :key="r.id" :data-test="`dq-row-${r.id}`"><td>{{ r.summary }}</td></tr></tbody></table>',
    props: ['data'],
  },
  'el-table-column': { template: '<span />' },
  'el-tag': {
    template: '<span class="el-tag" :data-type="type"><slot /></span>',
    props: ['type'],
  },
  'el-pagination': { template: '<div class="el-pagination" />' },
}

const globalDirectives = {
  loading: { mounted: () => {}, updated: () => {} },
}

describe('DataQualityView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true)
  })

  it('renders title and counter chips', async () => {
    const wrapper = mount(DataQualityView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('資料品質報告')
    expect(wrapper.text()).toContain('P0')
    expect(wrapper.text()).toContain('P1')
    expect(wrapper.text()).toContain('P2')
  })

  it('calls listReports on mount', async () => {
    mount(DataQualityView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(listReports).toHaveBeenCalled()
  })

  it('shows 立即執行 button when user has WRITE permission', async () => {
    ;(hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const wrapper = mount(DataQualityView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('立即執行')
  })

  it('hides 立即執行 button when user lacks WRITE permission', async () => {
    ;(hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const wrapper = mount(DataQualityView, {
      global: { stubs: globalStubs, directives: globalDirectives },
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('立即執行')
  })
})
