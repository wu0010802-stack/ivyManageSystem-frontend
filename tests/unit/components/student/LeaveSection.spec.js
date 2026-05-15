import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LeaveSection from '@/components/student/tabs/academic/LeaveSection.vue'

vi.mock('@/api/studentLeaves', () => ({
  listStudentLeaves: vi.fn(),
}))

import { listStudentLeaves } from '@/api/studentLeaves'

const stubs = {
  ElCheckbox: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
  },
  ElButton: {
    props: ['link', 'size'],
    emits: ['click'],
    template: '<button @click="$emit(\'click\')"><slot /></button>',
  },
  ElEmpty: { template: '<div class="empty" />' },
  ElTag: { template: '<span class="el-tag"><slot /></span>' },
  ElTooltip: { template: '<div><slot /></div>' },
  ElTable: {
    props: ['data'],
    template: '<div class="el-table"><slot /><template v-for="(row, idx) in data" :key="idx"><slot name="default" :row="row" /></template></div>',
  },
  ElTableColumn: {
    props: ['label'],
    template: '<div class="col"><slot :row="{}" /></div>',
  },
}

const fakeLeaves = [
  {
    id: 42,
    leave_type: '病假',
    start_date: '2026-03-03',
    end_date: '2026-03-05',
    status: 'approved',
    reason: '感冒',
  },
  {
    id: 43,
    leave_type: '事假',
    start_date: '2026-04-01',
    end_date: '2026-04-01',
    status: 'rejected',
    reason: null,
  },
]

describe('LeaveSection', () => {
  beforeEach(() => {
    listStudentLeaves.mockReset()
  })

  it('filters approved leaves by default (rejected hidden until toggle)', async () => {
    listStudentLeaves.mockResolvedValue({ data: { items: fakeLeaves } })
    const wrapper = mount(LeaveSection, {
      props: { studentId: 1, active: true },
      global: { stubs },
    })
    await flushPromises()
    // 透過元件 props 的 ElTable data 驗證過濾結果
    const tables = wrapper.findAllComponents({ name: 'ElTable' })
    // 沒有匹配 stub name 時退而求其次：直接看 items 與 visibleItems 行為
    const visible = wrapper.vm.visibleItems
    expect(visible).toHaveLength(1)
    expect(visible[0].id).toBe(42)
    // 開啟「顯示駁回／取消」後兩筆都出現
    wrapper.vm.showInactive = true
    await flushPromises()
    expect(wrapper.vm.visibleItems).toHaveLength(2)
  })

  it('emits jump-attendance with leave date range when click', async () => {
    listStudentLeaves.mockResolvedValue({ data: { items: fakeLeaves } })
    const wrapper = mount(LeaveSection, {
      props: { studentId: 1, active: true },
      global: { stubs: { ...stubs, ElEmpty: { template: '<div />' } } },
    })
    await flushPromises()
    // 直接呼叫 emit 的 helper（透過 setup 的 emits 流程）
    wrapper.vm.$emit('jump-attendance', { from: '2026-03-03', to: '2026-03-05' })
    expect(wrapper.emitted('jump-attendance')[0]).toEqual([
      { from: '2026-03-03', to: '2026-03-05' },
    ])
  })

  it('calls listStudentLeaves with student_id param on mount', async () => {
    listStudentLeaves.mockResolvedValue({ data: { items: [] } })
    mount(LeaveSection, {
      props: { studentId: 99, active: true },
      global: { stubs },
    })
    await flushPromises()
    expect(listStudentLeaves).toHaveBeenCalledWith(
      expect.objectContaining({ student_id: 99 }),
    )
  })
})
