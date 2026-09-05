import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StudentRollcallTable from '@/views/portal/components/studentAttendance/StudentRollcallTable.vue'

const STUDENTS = [
  { student_id: 1, student_no: 'A001', name: '小明', status: '出席', remark: '' },
  { student_id: 2, student_no: 'A002', name: '小華', status: '缺席', remark: '生病' },
  { student_id: 3, student_no: 'A003', name: '小美', status: '病假', remark: '' },
]

const STUBS = {
  ElButton: {
    template: '<button :data-type="type" :data-plain="plain" @click="$emit(\'click\')"><slot /></button>',
    name: 'ElButton',
    props: ['size', 'type', 'plain'],
    emits: ['click'],
  },
  ElRadioGroup: {
    template: '<div class="el-radio-group" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></div>',
    name: 'ElRadioGroup',
    props: ['modelValue', 'size'],
    emits: ['update:modelValue'],
  },
  ElRadioButton: {
    template: '<label class="el-radio-button"><input type="radio" :value="value" /><slot /></label>',
    name: 'ElRadioButton',
    props: ['value'],
  },
  ElInput: {
    template: '<input class="el-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    name: 'ElInput',
    props: ['modelValue', 'placeholder', 'size', 'clearable'],
    emits: ['update:modelValue'],
  },
}

describe('StudentRollcallTable', () => {
  it('renders student rows', () => {
    const w = mount(StudentRollcallTable, {
      props: { students: STUDENTS, loading: false },
      global: { stubs: STUBS },
    })
    expect(w.findAll('.student-row').length).toBe(3)
  })

  it('renders student names', () => {
    const w = mount(StudentRollcallTable, {
      props: { students: STUDENTS, loading: false },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('小明')
    expect(w.text()).toContain('小華')
  })

  it('emits quick-set-all with 出席', async () => {
    const w = mount(StudentRollcallTable, {
      props: { students: STUDENTS, loading: false },
      global: { stubs: STUBS },
    })
    const btn = w.findAll('button').find((b) => b.text().includes('全部出席'))
    await btn.trigger('click')
    expect(w.emitted('quick-set-all')[0]).toEqual(['出席'])
  })

  it('emits quick-set-all with 缺席', async () => {
    const w = mount(StudentRollcallTable, {
      props: { students: STUDENTS, loading: false },
      global: { stubs: STUBS },
    })
    const btn = w.findAll('button').find((b) => b.text().includes('全部缺席'))
    await btn.trigger('click')
    expect(w.emitted('quick-set-all')[0]).toEqual(['缺席'])
  })

  it('emits update-status with student_id and new status', async () => {
    const w = mount(StudentRollcallTable, {
      props: { students: STUDENTS, loading: false },
      global: { stubs: STUBS },
    })
    const groups = w.findAllComponents({ name: 'ElRadioGroup' })
    await groups[0].vm.$emit('update:modelValue', '缺席')
    const events = w.emitted('update-status')
    expect(events).toHaveLength(1)
    expect(events[0][0]).toEqual({ student_id: 1, status: '缺席', remark: '' })
  })

  it('emits update-status with remark change', async () => {
    const w = mount(StudentRollcallTable, {
      props: { students: STUDENTS, loading: false },
      global: { stubs: STUBS },
    })
    // 備註預設收合，先展開第一位學生，避免誤選原本已有備註的第二位。
    await w.findAll('.student-row')[0].find('.remark-toggle').trigger('click')
    const inputs = w.findAllComponents({ name: 'ElInput' })
    await inputs[0].vm.$emit('update:modelValue', '感冒')
    const events = w.emitted('update-status')
    expect(events).toHaveLength(1)
    expect(events[0][0]).toEqual({ student_id: 1, status: '出席', remark: '感冒' })
  })

  it('shows empty state when students=[]', () => {
    const w = mount(StudentRollcallTable, {
      props: { students: [], loading: false },
      global: { stubs: STUBS },
    })
    expect(w.text()).toContain('尚無學生')
  })

  it('marks absent students with is-absent class', () => {
    const w = mount(StudentRollcallTable, {
      props: { students: STUDENTS, loading: false },
      global: { stubs: STUBS },
    })
    const rows = w.findAll('.student-row')
    expect(rows[1].classes()).toContain('is-absent')
    expect(rows[0].classes()).not.toContain('is-absent')
  })

  it('hides actions when students=[]', () => {
    const w = mount(StudentRollcallTable, {
      props: { students: [], loading: false },
      global: { stubs: STUBS },
    })
    expect(w.find('.rollcall-actions').exists()).toBe(false)
  })
})
