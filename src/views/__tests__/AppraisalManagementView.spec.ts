import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const replace = vi.fn()
let mockQuery: Record<string, unknown> = {}
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace }),
}))

import AppraisalManagementView from '../AppraisalManagementView.vue'

const stubs = {
  CurrentSemesterOverview: { name: 'CurrentSemesterOverview', template: '<div class="stub-current" />' },
  CycleListView: { name: 'CycleListView', template: '<div class="stub-history" />' },
  AppraisalSettingsView: { name: 'AppraisalSettingsView', template: '<div class="stub-settings" />' },
  DisciplinaryPanel: { name: 'DisciplinaryPanel', template: '<div class="stub-disciplinary" />' },
  InstitutionEventPanel: { name: 'InstitutionEventPanel', template: '<div class="stub-institution-events" />' },
  ElTabs: {
    name: 'ElTabs',
    props: ['modelValue'],
    emits: ['update:modelValue', 'tab-change'],
    template: '<div class="stub-tabs"><slot /></div>',
  },
  ElTabPane: { name: 'ElTabPane', props: ['label', 'name'], template: '<div><slot /></div>' },
}

function mountWith(query: Record<string, unknown> = {}) {
  mockQuery = query
  replace.mockClear()
  return mount(AppraisalManagementView, { global: { stubs } })
}

describe('AppraisalManagementView tabs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('tab=history 渲染歷史週期（內嵌明細容器）', () => {
    const w = mountWith({ tab: 'history' })
    expect(w.find('.stub-history').exists()).toBe(true)
    expect(w.find('.stub-current').exists()).toBe(false)
  })

  it('切離 history 時清掉 cycle/view query（內嵌明細殘留）', async () => {
    const w = mountWith({ section: 'appraisal', tab: 'history', cycle: '4', view: 'kanban' })
    replace.mockClear()
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'settings')
    await nextTick()
    expect(replace).toHaveBeenCalledWith({ query: { section: 'appraisal', tab: 'settings' } })
  })

  it('tab=institution_events 渲染活動出席面板（懶載入）', () => {
    const w = mountWith({ tab: 'institution_events' })
    expect(w.find('.stub-institution-events').exists()).toBe(true)
    expect(w.find('.stub-current').exists()).toBe(false)
  })

  it('history 內切 tab 再切回不殘留：切到 current 不帶 cycle', async () => {
    const w = mountWith({ section: 'appraisal', tab: 'history', cycle: '2' })
    replace.mockClear()
    w.findComponent({ name: 'ElTabs' }).vm.$emit('tab-change', 'current')
    await nextTick()
    expect(replace).toHaveBeenCalledWith({ query: { section: 'appraisal', tab: 'current' } })
  })
})
