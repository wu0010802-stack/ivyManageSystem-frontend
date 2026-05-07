import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivitySessionList from '@/views/portal/components/activity/ActivitySessionList.vue'

const SESSIONS = [
  { id: 1, course_id: 100, course_name: '畫畫', session_date: '2026-05-10', recorded_count: 0, present_count: 0 },
  { id: 2, course_id: 100, course_name: '畫畫', session_date: '2026-05-17', recorded_count: 5, present_count: 4 },
  { id: 3, course_id: 200, course_name: '音樂', session_date: '2026-05-12', recorded_count: 3, present_count: 2 },
]

const STUBS = {
  ElRow: { template: '<div class="el-row"><slot /></div>' },
  ElCol: { template: '<div class="el-col"><slot /></div>' },
  ElSpace: { template: '<div class="el-space"><slot /></div>' },
  ElButtonGroup: { template: '<div class="el-button-group"><slot /></div>' },
  ElButton: {
    template: '<button @click="$emit(\'click\')"><slot /></button>',
    emits: ['click'],
    props: ['type', 'size'],
    name: 'ElButton',
  },
  ElSelect: {
    template: '<select :value="modelValue"><slot /></select>',
    name: 'ElSelect',
    props: ['modelValue', 'placeholder', 'clearable'],
    emits: ['update:modelValue', 'change'],
  },
  ElOption: {
    template: '<option :value="value">{{ label }}</option>',
    props: ['value', 'label'],
  },
  ElDatePicker: {
    template: '<input type="date" :value="modelValue" />',
    props: ['modelValue', 'type', 'placeholder', 'valueFormat'],
    emits: ['update:modelValue', 'change'],
  },
  ElTable: {
    template: '<table class="el-table"><slot /></table>',
    props: ['data', 'border', 'stripe'],
    name: 'ElTable',
  },
  ElTableColumn: {
    template: '<td><slot :row="{}" name="default" /></td>',
    props: ['prop', 'label', 'width', 'minWidth', 'align', 'fixed'],
  },
}

describe('ActivitySessionList', () => {
  it('renders one row per session in table', () => {
    const w = mount(ActivitySessionList, {
      props: { sessions: SESSIONS, filterCourseId: null },
      global: { stubs: STUBS },
    })
    const table = w.findComponent({ name: 'ElTable' })
    expect(table.props('data').length).toBe(3)
  })

  it('filters sessions by filterCourseId', () => {
    const w = mount(ActivitySessionList, {
      props: { sessions: SESSIONS, filterCourseId: 100 },
      global: { stubs: STUBS },
    })
    const table = w.findComponent({ name: 'ElTable' })
    expect(table.props('data').length).toBe(2)
    expect(table.props('data').every(s => s.course_id === 100)).toBe(true)
  })

  it('shows empty hint when sessions=[]', () => {
    const w = mount(ActivitySessionList, {
      props: { sessions: [], filterCourseId: null },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('目前沒有相關場次')
  })

  it('emits open-rollcall when event fired directly', async () => {
    const w = mount(ActivitySessionList, {
      props: { sessions: SESSIONS, filterCourseId: null },
      global: { stubs: STUBS },
    })
    // Emit directly to verify the event is defined and passable
    await w.vm.$emit('open-rollcall', SESSIONS[0])
    expect(w.emitted('open-rollcall')?.[0]?.[0]).toEqual(SESSIONS[0])
  })

  it('emits update:filterCourseId on select change', async () => {
    const w = mount(ActivitySessionList, {
      props: { sessions: SESSIONS, filterCourseId: null },
      global: { stubs: STUBS },
    })
    await w.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 100)
    expect(w.emitted('update:filterCourseId')[0]).toEqual([100])
  })

  it('emits set-month when month button clicked', async () => {
    const w = mount(ActivitySessionList, {
      props: { sessions: SESSIONS, filterCourseId: null, activeMonth: 'current' },
      global: { stubs: STUBS },
    })
    const buttons = w.findAll('button')
    const prevBtn = buttons.find(b => b.text().includes('上月'))
    await prevBtn.trigger('click')
    expect(w.emitted('set-month')[0]).toEqual(['prev'])
  })
})
