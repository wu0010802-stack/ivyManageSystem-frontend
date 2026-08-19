import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SalaryHistoryView from '../SalaryHistoryView.vue'

const hasPermissionMock = vi.fn((_p: string) => true)
vi.mock('@/utils/auth', () => ({
  hasPermission: (p: string) => hasPermissionMock(p),
}))

vi.mock('../SalaryMonthlyOverviewPanel.vue', () => ({
  default: {
    name: 'SalaryMonthlyOverviewPanel',
    props: ['year', 'month'],
    emits: ['scope-change'],
    template: '<div class="overview-panel-stub" :data-year="year" :data-month="month" />',
  },
}))
vi.mock('../SalaryHistoryPanel.vue', () => ({
  default: { name: 'SalaryHistoryPanel', template: '<div class="history-panel-stub" />' },
}))
vi.mock('../SalarySnapshotDialog.vue', () => ({
  default: { name: 'SalarySnapshotDialog', props: ['modelValue', 'year', 'month', 'canWrite'], template: '<div />' },
}))

const STUBS = {
  PageHeader: {
    props: ['title', 'subtitle'],
    template: '<header><h1>{{ title }}</h1><p>{{ subtitle }}</p><slot name="actions" /></header>',
  },
  'el-select': true,
  'el-option': true,
  'el-button': { template: '<button><slot /></button>' },
  'el-tabs': { props: ['modelValue'], template: '<div class="tabs-stub" :data-active="modelValue"><slot /></div>' },
  'el-tab-pane': {
    props: ['label', 'name'],
    template: '<section class="pane-stub" :data-name="name" :data-label="label"><slot /></section>',
  },
  EmptyState: { props: ['description'], template: '<div class="empty-state-stub">{{ description }}</div>' },
}

const mountView = () => mount(SalaryHistoryView, { global: { stubs: STUBS } })

beforeEach(() => {
  hasPermissionMock.mockReset()
  hasPermissionMock.mockReturnValue(true)
})

describe('SalaryHistoryView', () => {
  it('標題與副標題更新為薪資總覽與歷史', () => {
    const wrapper = mountView()
    expect(wrapper.find('h1').text()).toBe('薪資總覽與歷史')
    expect(wrapper.find('p').text()).toBe('全員月度對帳、發放構成與個人歷月明細')
  })

  it('預設開啟全員月總覽分頁', () => {
    const wrapper = mountView()
    expect(wrapper.find('.tabs-stub').attributes('data-active')).toBe('overview')
    expect(wrapper.find('[data-name="overview"]').attributes('data-label')).toBe('全員月總覽')
    expect(wrapper.find('.overview-panel-stub').exists()).toBe(true)
  })

  it('scope=self 時分頁標籤顯示個人月總覽', async () => {
    const wrapper = mountView()
    await wrapper.findComponent({ name: 'SalaryMonthlyOverviewPanel' }).vm.$emit('scope-change', 'self')
    expect(wrapper.find('[data-name="overview"]').attributes('data-label')).toBe('個人月總覽')
  })

  it('缺 EMPLOYEES_READ 時月總覽仍顯示，只有個人歷史退化為 EmptyState', () => {
    hasPermissionMock.mockImplementation((p: string) => p !== 'EMPLOYEES_READ')
    const wrapper = mountView()
    expect(wrapper.find('.overview-panel-stub').exists()).toBe(true)
    expect(wrapper.find('.history-panel-stub').exists()).toBe(false)
    expect(wrapper.find('.empty-state-stub').exists()).toBe(true)
  })

  it('年月選擇同時傳給總覽面板與快照對話框', () => {
    const wrapper = mountView()
    const panel = wrapper.find('.overview-panel-stub')
    const dialog = wrapper.findComponent({ name: 'SalarySnapshotDialog' })
    expect(panel.attributes('data-year')).toBe(String(dialog.props('year')))
    expect(panel.attributes('data-month')).toBe(String(dialog.props('month')))
  })
})
