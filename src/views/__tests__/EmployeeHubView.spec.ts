import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const replace = vi.fn()
let mockQuery: Record<string, unknown> = {}
let fullSalaryView = true
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: mockQuery }),
  useRouter: () => ({ replace }),
}))
vi.mock('@/utils/auth', () => ({
  hasFullSalaryView: () => fullSalaryView,
}))

import EmployeeHubView from '../EmployeeHubView.vue'

const stubs = {
  EmployeeListView: { name: 'EmployeeListView', template: '<div class="stub-employees" />' },
  OffboardingView: { name: 'OffboardingView', template: '<div class="stub-offboarding" />' },
  ElSegmented: {
    name: 'ElSegmented',
    props: ['modelValue', 'options'],
    emits: ['change'],
    template: '<div class="stub-seg" />',
  },
}

function mountWith(query: Record<string, unknown> = {}) {
  mockQuery = query
  replace.mockClear()
  return mount(EmployeeHubView, { global: { stubs } })
}

describe('EmployeeHubView shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fullSalaryView = true
  })

  it('預設（無 section query）→ 渲染員工子元件並 normalize URL', () => {
    const w = mountWith()
    expect(w.find('.stub-employees').exists()).toBe(true)
    expect(w.find('.stub-offboarding').exists()).toBe(false)
    const seg = w.findComponent({ name: 'ElSegmented' })
    expect(seg.props('modelValue')).toBe('employees')
    expect(seg.props('options')).toEqual([
      { label: '員工管理', value: 'employees' },
      { label: '離職管理', value: 'offboarding' },
    ])
    expect(replace).toHaveBeenCalledWith({ query: { section: 'employees' } })
  })

  it('deep link ?section=offboarding → 渲染離職子元件且不 replace', () => {
    const w = mountWith({ section: 'offboarding' })
    expect(w.find('.stub-offboarding').exists()).toBe(true)
    expect(w.find('.stub-employees').exists()).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it('不合法 section → fallback 員工並 replace 修正', () => {
    mountWith({ section: 'nope' })
    expect(replace).toHaveBeenCalledWith({ query: { section: 'employees' } })
  })

  it('切換 segmented → router.replace 更新 section', async () => {
    const w = mountWith({ section: 'employees' })
    replace.mockClear()
    w.findComponent({ name: 'ElSegmented' }).vm.$emit('change', 'offboarding')
    await nextTick()
    expect(replace).toHaveBeenCalledWith({ query: { section: 'offboarding' } })
  })

  it('非全員薪資視野隱藏離職管理並拒絕 deep link', () => {
    fullSalaryView = false
    const w = mountWith({ section: 'offboarding' })
    expect(w.find('.stub-employees').exists()).toBe(true)
    expect(w.find('.stub-offboarding').exists()).toBe(false)
    expect(w.findComponent({ name: 'ElSegmented' }).props('options')).toEqual([
      { label: '員工管理', value: 'employees' },
    ])
    expect(replace).toHaveBeenCalledWith({ query: { section: 'employees' } })
  })
})
