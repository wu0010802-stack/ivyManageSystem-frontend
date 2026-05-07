import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityRollcallDrawer from '@/views/portal/components/activity/ActivityRollcallDrawer.vue'

const vLoading = { mounted() {}, updated() {} }

const SESSION = {
  id: 1,
  course_name: '畫畫',
  session_date: '2026-05-10',
  total: 2,
  students: [
    { student_id: 1, student_name: '小明', class_name: '小白兔', is_present: true, attendance_notes: '' },
    { student_id: 2, student_name: '小華', class_name: '小綠葉', is_present: false, attendance_notes: '' },
  ],
}

const SORTED_STUDENTS = SESSION.students

const STUBS = {
  ElDrawer: {
    template: '<div data-test="drawer" :data-title="title"><slot /><slot name="footer" /></div>',
    props: ['modelValue', 'title', 'direction', 'size', 'closeOnClickModal'],
    emits: ['update:modelValue'],
    name: 'ElDrawer',
  },
  ElProgress: {
    template: '<div class="el-progress" :data-percentage="percentage"></div>',
    props: ['percentage', 'format'],
  },
  ElSpace: { template: '<div class="el-space"><slot /></div>' },
  ElButton: {
    template: '<button class="el-button" @click="$emit(\'click\')"><slot /></button>',
    emits: ['click'],
    props: ['size', 'type', 'loading'],
    name: 'ElButton',
  },
  ElTag: {
    template: '<span class="el-tag" :data-type="type"><slot /></span>',
    props: ['type', 'size'],
  },
  ElTable: {
    template: '<table class="el-table"><slot /></table>',
    props: ['data', 'border', 'size', 'rowClassName'],
    name: 'ElTable',
  },
  ElTableColumn: {
    template: '<td><slot :row="{}" name="default" /></td>',
    props: ['prop', 'label', 'width', 'minWidth', 'align'],
  },
  ElSwitch: {
    template: '<input type="checkbox" />',
    props: ['modelValue', 'activeValue', 'inactiveValue', 'activeText', 'inactiveText', 'inlinePrompt'],
  },
  ElInput: {
    template: '<input :value="modelValue" />',
    props: ['modelValue', 'size', 'placeholder'],
  },
}

describe('ActivityRollcallDrawer', () => {
  it('passes title prop to drawer', () => {
    const w = mount(ActivityRollcallDrawer, {
      props: {
        modelValue: true,
        drawerTitle: '點名｜畫畫｜2026-05-10',
        drawerLoading: false,
        drawerSession: SESSION,
        sortedStudents: SORTED_STUDENTS,
        saveLoading: false,
        drawerPresentCount: 1,
        drawerAbsentCount: 1,
        drawerUnmarkedCount: 0,
      },
      global: { stubs: STUBS, directives: { loading: vLoading } },
    })
    expect(w.findComponent({ name: 'ElDrawer' }).props('title')).toContain('畫畫')
  })

  it('passes sortedStudents to table', () => {
    const w = mount(ActivityRollcallDrawer, {
      props: {
        modelValue: true,
        drawerTitle: '點名',
        drawerLoading: false,
        drawerSession: SESSION,
        sortedStudents: SORTED_STUDENTS,
        saveLoading: false,
        drawerPresentCount: 1,
        drawerAbsentCount: 1,
        drawerUnmarkedCount: 0,
      },
      global: { stubs: STUBS, directives: { loading: vLoading } },
    })
    const table = w.findComponent({ name: 'ElTable' })
    expect(table.props('data').length).toBe(2)
  })

  it('emits set-all-present(true) when 全部出席 clicked', async () => {
    const w = mount(ActivityRollcallDrawer, {
      props: {
        modelValue: true,
        drawerTitle: '點名',
        drawerLoading: false,
        drawerSession: SESSION,
        sortedStudents: SORTED_STUDENTS,
        saveLoading: false,
        drawerPresentCount: 0,
        drawerAbsentCount: 0,
        drawerUnmarkedCount: 2,
      },
      global: { stubs: STUBS, directives: { loading: vLoading } },
    })
    const buttons = w.findAll('button')
    await buttons.find(b => b.text().includes('全部出席')).trigger('click')
    expect(w.emitted('set-all-present')[0]).toEqual([true])
  })

  it('emits set-all-present(false) when 全部缺席 clicked', async () => {
    const w = mount(ActivityRollcallDrawer, {
      props: {
        modelValue: true,
        drawerTitle: '點名',
        drawerLoading: false,
        drawerSession: SESSION,
        sortedStudents: SORTED_STUDENTS,
        saveLoading: false,
        drawerPresentCount: 0,
        drawerAbsentCount: 0,
        drawerUnmarkedCount: 2,
      },
      global: { stubs: STUBS, directives: { loading: vLoading } },
    })
    const buttons = w.findAll('button')
    await buttons.find(b => b.text().includes('全部缺席')).trigger('click')
    expect(w.emitted('set-all-present')[0]).toEqual([false])
  })

  it('emits save when 儲存點名 button clicked', async () => {
    const w = mount(ActivityRollcallDrawer, {
      props: {
        modelValue: true,
        drawerTitle: '點名',
        drawerLoading: false,
        drawerSession: SESSION,
        sortedStudents: SORTED_STUDENTS,
        saveLoading: false,
        drawerPresentCount: 1,
        drawerAbsentCount: 1,
        drawerUnmarkedCount: 0,
      },
      global: { stubs: STUBS, directives: { loading: vLoading } },
    })
    const saveBtn = w.findAll('button').find(b => b.text().includes('儲存'))
    await saveBtn.trigger('click')
    expect(w.emitted('save')).toHaveLength(1)
  })

  it('shows loading state when drawerLoading=true', () => {
    const w = mount(ActivityRollcallDrawer, {
      props: {
        modelValue: true,
        drawerTitle: '點名',
        drawerLoading: true,
        drawerSession: null,
        sortedStudents: [],
        saveLoading: false,
        drawerPresentCount: 0,
        drawerAbsentCount: 0,
        drawerUnmarkedCount: 0,
      },
      global: { stubs: STUBS, directives: { loading: vLoading } },
    })
    // When loading, session content is not shown
    expect(w.findComponent({ name: 'ElTable' }).exists()).toBe(false)
  })

  it('emits update:modelValue when drawer requests close', async () => {
    const w = mount(ActivityRollcallDrawer, {
      props: {
        modelValue: true,
        drawerTitle: '點名',
        drawerLoading: false,
        drawerSession: SESSION,
        sortedStudents: SORTED_STUDENTS,
        saveLoading: false,
        drawerPresentCount: 1,
        drawerAbsentCount: 1,
        drawerUnmarkedCount: 0,
      },
      global: { stubs: STUBS, directives: { loading: vLoading } },
    })
    await w.findComponent({ name: 'ElDrawer' }).vm.$emit('update:modelValue', false)
    expect(w.emitted('update:modelValue')[0]).toEqual([false])
  })
})
