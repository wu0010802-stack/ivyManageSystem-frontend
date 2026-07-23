import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import ClassroomWorkbenchView from '@/views/ClassroomWorkbenchView.vue'

const { routeMock } = vi.hoisted(() => ({
  routeMock: { query: {} as Record<string, unknown> },
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
}))

const stubs = {
  EnrollmentPanel: true,
  ClassroomView: true,
  'el-tabs': { props: ['modelValue'], template: '<div><slot /></div>' },
  'el-tab-pane': { props: ['label', 'name'], template: '<section :data-tab="name"><slot /></section>' },
}

describe('ClassroomWorkbenchView', () => {
  beforeEach(() => {
    routeMock.query = {}
  })

  it('把在籍統計排在班級學生管理前並預設顯示', () => {
    const wrapper = shallowMount(ClassroomWorkbenchView, { global: { stubs } })
    const tabs = wrapper.findAll('[data-tab]')

    expect(tabs.map(tab => tab.attributes('data-tab'))).toEqual(['enrollment', 'classrooms'])
    expect(wrapper.vm.$.setupState.activeTab).toBe('enrollment')
  })

  it('tab=classrooms 深層連結可直接顯示班級學生管理', () => {
    routeMock.query = { tab: 'classrooms' }
    const wrapper = shallowMount(ClassroomWorkbenchView, { global: { stubs } })

    expect(wrapper.vm.$.setupState.activeTab).toBe('classrooms')
  })
})
