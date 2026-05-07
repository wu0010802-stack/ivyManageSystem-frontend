import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StudentAttendanceTabs from '@/views/portal/components/studentAttendance/StudentAttendanceTabs.vue'

const CLASSROOMS = [
  { classroom_id: 1, classroom_name: '小白兔' },
  { classroom_id: 2, classroom_name: '小綠葉' },
]

const STUBS = {
  ElRadioGroup: {
    name: 'ElRadioGroup',
    template: '<div data-test="radio-group" :data-value="modelValue"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  ElRadioButton: { template: '<label :data-label="label"><slot /></label>', props: ['label'] },
  ElSelect: {
    name: 'ElSelect',
    template: '<select data-test="el-select" :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><slot /></select>',
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
  },
  ElOption: { template: '<option :value="value">{{ label }}</option>', props: ['value', 'label'] },
}

describe('StudentAttendanceTabs', () => {
  it('renders radio group + select', () => {
    const w = mount(StudentAttendanceTabs, {
      props: { activeTab: 'daily', classrooms: CLASSROOMS, classroomId: 1 },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="radio-group"]').exists()).toBe(true)
    expect(w.find('[data-test="el-select"]').exists()).toBe(true)
  })

  it('renders daily slot when activeTab=daily', () => {
    const w = mount(StudentAttendanceTabs, {
      props: { activeTab: 'daily', classrooms: CLASSROOMS, classroomId: 1 },
      slots: { daily: '<div data-test="daily-content">日點名內容</div>', monthly: '<div data-test="monthly-content">月統計內容</div>' },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="daily-content"]').exists()).toBe(true)
    expect(w.find('[data-test="monthly-content"]').exists()).toBe(false)
  })

  it('renders monthly slot when activeTab=monthly', () => {
    const w = mount(StudentAttendanceTabs, {
      props: { activeTab: 'monthly', classrooms: CLASSROOMS, classroomId: 1 },
      slots: { daily: '<div data-test="daily-content">日</div>', monthly: '<div data-test="monthly-content">月</div>' },
      global: { stubs: STUBS },
    })
    expect(w.find('[data-test="daily-content"]').exists()).toBe(false)
    expect(w.find('[data-test="monthly-content"]').exists()).toBe(true)
  })

  it('emits update:activeTab when radio changes', async () => {
    const w = mount(StudentAttendanceTabs, {
      props: { activeTab: 'daily', classrooms: CLASSROOMS, classroomId: 1 },
      global: { stubs: STUBS },
    })
    await w.findComponent({ name: 'ElRadioGroup' }).vm.$emit('update:modelValue', 'monthly')
    expect(w.emitted('update:activeTab')[0]).toEqual(['monthly'])
  })

  it('emits update:classroomId when select changes', async () => {
    const w = mount(StudentAttendanceTabs, {
      props: { activeTab: 'daily', classrooms: CLASSROOMS, classroomId: 1 },
      global: { stubs: STUBS },
    })
    await w.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 2)
    expect(w.emitted('update:classroomId')[0]).toEqual([2])
  })
})
