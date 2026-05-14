import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

// ── API mocks ──────────────────────────────────────────────────────────────
const getFeePeriods = vi.fn()

vi.mock('@/api/fees', () => ({
  getFeePeriods: (...a) => getFeePeriods(...a),
}))

const getClassrooms = vi.fn()
vi.mock('@/api/classrooms', () => ({
  getClassrooms: (...a) => getClassrooms(...a),
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
}))

// ── stub children that pull in heavy dependencies ──────────────────────────
// FeeRecordsTab：暴露 fetchRecords 讓父層觸發
vi.mock('@/components/fees/FeeRecordsTab.vue', () => {
  const fetchRecords = vi.fn()
  return {
    __fetchRecords: fetchRecords,
    default: {
      name: 'FeeRecordsTab',
      props: ['periodOptions', 'classrooms'],
      setup(_, { expose }) {
        expose({ fetchRecords })
        return {}
      },
      template: '<div data-testid="fee-records-tab" />',
    },
  }
})

vi.mock('@/components/fees/FeeTemplateTab.vue', () => ({
  default: { name: 'FeeTemplateTab', template: '<div data-testid="fee-template-tab" />' },
}))

vi.mock('@/components/fees/FeeRefundsTab.vue', () => ({
  default: { name: 'FeeRefundsTab', template: '<div data-testid="fee-refunds-tab" />' },
}))

// ── global stubs ───────────────────────────────────────────────────────────
const GLOBAL_STUBS = {
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { props: ['name', 'label'], template: '<div><slot /></div>' },
}

const flushPromises = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

import StudentFeeView from '@/views/StudentFeeView.vue'
import * as FeeRecordsTabModule from '@/components/fees/FeeRecordsTab.vue'

function mountFeeView() {
  return mount(StudentFeeView, {
    global: { directives: { loading: () => {} }, stubs: GLOBAL_STUBS },
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('StudentFeeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    getFeePeriods.mockResolvedValue(['2025-1', '2024-2'])
    getClassrooms.mockResolvedValue({ data: [] })
  })

  it('掛載後呼叫 getFeePeriods 與 getClassrooms（不再呼叫 items API）', async () => {
    mountFeeView()
    await flushPromises()

    expect(getFeePeriods).toHaveBeenCalled()
    expect(getClassrooms).toHaveBeenCalled()
  })

  it('預設 activeTab 為 templates', async () => {
    const wrapper = mountFeeView()
    await flushPromises()
    expect(wrapper.vm.$.setupState.activeTab).toBe('templates')
  })

  it('渲染三個 tab 子元件：費用範本 / 繳費記錄 / 退費管理', async () => {
    const wrapper = mountFeeView()
    await flushPromises()

    expect(wrapper.find('[data-testid="fee-template-tab"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fee-records-tab"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fee-refunds-tab"]').exists()).toBe(true)
  })

  it('切換至「繳費記錄」Tab 時呼叫子元件 fetchRecords', async () => {
    const wrapper = mountFeeView()
    await flushPromises()
    FeeRecordsTabModule.__fetchRecords.mockClear()

    // 觸發 watch(activeTab)
    wrapper.vm.$.setupState.activeTab = 'records'
    await nextTick()
    await flushPromises()

    expect(FeeRecordsTabModule.__fetchRecords).toHaveBeenCalled()
  })

  it('切換至「退費管理」Tab 不會觸發 fetchRecords', async () => {
    const wrapper = mountFeeView()
    await flushPromises()
    FeeRecordsTabModule.__fetchRecords.mockClear()

    wrapper.vm.$.setupState.activeTab = 'refunds'
    await nextTick()
    await flushPromises()

    expect(FeeRecordsTabModule.__fetchRecords).not.toHaveBeenCalled()
  })
})
