import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalLeaveForm from '@/components/portal/PortalLeaveForm.vue'

vi.mock('@/api/portal', () => ({
  createMyLeave: vi.fn(() => Promise.resolve({ data: { id: 99 } })),
  uploadMyLeaveAttachments: vi.fn(() => Promise.resolve({})),
  getMyQuotas: vi.fn(() => Promise.resolve({ data: [] })),
  getMyWorkdayHours: vi.fn(() => Promise.resolve({ data: { breakdown: [] } })),
}))

const globalStubs = {
  'el-icon': true,
  'el-tooltip': true,
  'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' },
  'el-button': { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
  'el-form': {
    template: '<form><slot /></form>',
    methods: {
      validate: () => Promise.resolve(true),
      clearValidate: () => {},
      resetFields: () => {},
    },
  },
}

describe('PortalLeaveForm smoke', () => {
  it('mounts without errors', () => {
    const wrapper = mount(PortalLeaveForm, {
      props: { allEmployees: [] },
      global: { stubs: globalStubs },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('emits cancel when cancel button clicked', async () => {
    const wrapper = mount(PortalLeaveForm, {
      props: { allEmployees: [] },
      global: { stubs: globalStubs },
    })
    const cancelBtn = wrapper.findAll('button').find((b) => b.text().includes('取消'))
    expect(cancelBtn).toBeDefined()
    await cancelBtn.trigger('click')
    // refactor 後 emit('cancel')，不再 emit('update:visible')
    const emitted = wrapper.emitted()
    expect(emitted['cancel']).toBeDefined()
    expect(emitted['update:visible']).toBeUndefined()
  })
})
