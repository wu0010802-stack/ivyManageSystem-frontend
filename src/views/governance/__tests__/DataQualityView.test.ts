import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/dataQuality', () => ({
  listReports: vi.fn().mockResolvedValue({
    data: { items: [], total: 0, page: 1, page_size: 20 },
  }),
  getSummary: vi.fn().mockResolvedValue({
    data: {
      open_by_severity: { P0: 3, P1: 1, P2: 0 },
      total_open: 4,
      last_run_at: '2026-07-25',
    },
  }),
  ackReport: vi.fn().mockResolvedValue({ data: { ok: true } }),
  resolveReport: vi.fn().mockResolvedValue({ data: { ok: true } }),
  ignoreReport: vi.fn().mockResolvedValue({ data: { ok: true } }),
  runNow: vi.fn().mockResolvedValue({
    data: { detected: 0, new_open: 0, ran_at: '2026-07-26T03:00:00+08:00' },
  }),
}))

vi.mock('@/utils/auth', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { prompt: vi.fn().mockResolvedValue({ value: 'note' }) },
}))

import { getSummary, listReports } from '@/api/dataQuality'
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
      '<table data-test="dq-table"><tbody><tr v-for="r in data" :key="r.id" :data-test="`dq-row-${r.id}`"><td>{{ r.summary }}</td></tr></tbody><tfoot v-if="!data.length"><slot name="empty" /></tfoot></table>',
    props: ['data'],
  },
  'el-table-column': { template: '<span />' },
  'el-tag': {
    template: '<span class="el-tag" :data-type="type"><slot /></span>',
    props: ['type'],
  },
  'el-pagination': { template: '<div class="el-pagination" />' },
  'el-popover': { template: '<div><slot name="reference" /><slot /></div>' },
  'el-icon': { template: '<i><slot /></i>' },
  'router-link': { template: '<a><slot /></a>', props: ['to'] },
}

const globalDirectives = {
  loading: { mounted: () => {}, updated: () => {} },
}

const mountView = () =>
  mount(DataQualityView, {
    global: { stubs: globalStubs, directives: globalDirectives },
  })

describe('DataQualityView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(listReports as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { items: [], total: 0, page: 1, page_size: 20 },
    })
    ;(getSummary as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        open_by_severity: { P0: 3, P1: 1, P2: 0 },
        total_open: 4,
        last_run_at: '2026-07-25',
      },
    })
  })

  it('renders severity counters', async () => {
    const wrapper = mountView()
    await flushPromises()
    // 2026-08-20 整併後頁名由分頁列承擔（見 GovernanceLayout.tabs.test.ts），本頁不再自帶標題
    expect(wrapper.text()).toContain('P0')
    expect(wrapper.text()).toContain('P1')
    expect(wrapper.text()).toContain('P2')
  })

  it('載入時同時取列表與統計', async () => {
    mountView()
    await flushPromises()
    expect(listReports).toHaveBeenCalled()
    expect(getSummary).toHaveBeenCalled()
  })

  it('統計數字來自 summary 端點而非當前頁資料', async () => {
    // 列表為空但 summary 說有 3 筆 P0——舊實作會顯示 0
    const wrapper = mountView()
    await flushPromises()

    const counters = wrapper.findAll('[data-testid="severity-counter"]')
    expect(counters[0].text()).toContain('3')
    expect(counters[1].text()).toContain('1')
    expect(counters[2].text()).toContain('0')
  })

  it('統計載入失敗時顯示「—」而非誤導性的 0', async () => {
    ;(getSummary as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()

    const counters = wrapper.findAll('[data-testid="severity-counter"]')
    expect(counters[0].text()).toContain('—')
  })

  it('顯示最後檢查時間', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('2026-07-25')
  })

  it('預設篩選下無資料時顯示健康的空狀態', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('目前沒有待處理的資料異常')
  })

  it('有篩選條件時空狀態改為提示放寬條件', async () => {
    const wrapper = mountView()
    await flushPromises()

    // el-select 已被 stub 成無行為的 <select>，直接改 filters 模擬使用者篩選
    const vm = wrapper.vm as unknown as { filters: { severity: string } }
    vm.filters.severity = 'P0'
    await flushPromises()

    expect(wrapper.text()).toContain('找不到符合條件的紀錄')
  })

  it('列表載入失敗時空狀態顯示載入失敗', async () => {
    ;(listReports as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('載入失敗')
  })

  it('shows 立即檢查 button when user has WRITE permission', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('立即檢查')
  })

  it('hides 立即檢查 button when user lacks WRITE permission', async () => {
    ;(hasPermission as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).not.toContain('立即檢查')
  })

  it('以中文規則名與狀態呈現資料列', async () => {
    ;(listReports as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        items: [
          {
            id: 1,
            rule_code: 'employee_active_but_offboarded',
            severity: 'P1',
            entity_type: 'employee',
            entity_id: '42',
            summary: '員工 #42 離職日已過',
            status: 'open',
            detected_at: '2026-07-25T03:00:00',
            last_seen_at: '2026-07-25T03:00:00',
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      },
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('員工 #42 離職日已過')
  })
})
