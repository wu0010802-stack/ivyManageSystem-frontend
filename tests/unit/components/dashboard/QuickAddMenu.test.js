import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { provide, inject } from 'vue'
import QuickAddMenu from '@/components/dashboard/QuickAddMenu.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

const hasPermission = vi.fn()
vi.mock('@/utils/auth', () => ({
  hasPermission: (...args) => hasPermission(...args),
}))

const stubs = {
  'el-dropdown': {
    template: '<div class="el-dropdown-stub"><slot /><div class="dropdown-content"><slot name="dropdown" /></div></div>',
    emits: ['command'],
    setup(_, { emit }) {
      provide('emitCommand', (cmd) => emit('command', cmd))
    },
  },
  'el-dropdown-menu': { template: '<ul><slot /></ul>' },
  'el-dropdown-item': {
    template: '<li class="dropdown-item" :data-command="command" @click="onClick"><slot /></li>',
    props: ['command'],
    setup(props) {
      const emitCommand = inject('emitCommand', () => {})
      return {
        onClick: () => emitCommand(props.command),
      }
    },
  },
  'el-button': { template: '<button><slot /></button>' },
  'el-icon': { template: '<i><slot /></i>' },
}

describe('QuickAddMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('完全無 WRITE 權限時不渲染整個下拉', () => {
    hasPermission.mockReturnValue(false)
    const wrapper = mount(QuickAddMenu, { global: { stubs } })
    expect(wrapper.find('.el-dropdown-stub').exists()).toBe(false)
  })

  it('只有部分 WRITE 權限時只渲染有權限的項目', () => {
    hasPermission.mockImplementation((name) => name === 'OVERTIME_WRITE' || name === 'LEAVES_WRITE')
    const wrapper = mount(QuickAddMenu, { global: { stubs } })
    const items = wrapper.findAll('.dropdown-item')
    expect(items.length).toBe(2)
    const commands = items.map((el) => el.attributes('data-command'))
    expect(commands).toEqual(expect.arrayContaining(['overtime', 'leave']))
  })

  it('點 dialog 類型項目 emit open 而不 router push', async () => {
    hasPermission.mockReturnValue(true)
    const wrapper = mount(QuickAddMenu, { global: { stubs } })
    const overtimeItem = wrapper.findAll('.dropdown-item').find((el) => el.attributes('data-command') === 'overtime')
    await overtimeItem.trigger('click')
    expect(push).not.toHaveBeenCalled()
    const emitted = wrapper.emitted('open')
    expect(emitted).toBeTruthy()
    expect(emitted[0]).toEqual(['overtime'])
  })

  it('點 navigate 類型項目觸發 router push 帶 quick_add=1', async () => {
    hasPermission.mockReturnValue(true)
    const wrapper = mount(QuickAddMenu, { global: { stubs } })
    const empItem = wrapper.findAll('.dropdown-item').find((el) => el.attributes('data-command') === 'employee')
    await empItem.trigger('click')
    expect(push).toHaveBeenCalledWith({ path: '/employees', query: { quick_add: '1' } })
    expect(wrapper.emitted('open')).toBeFalsy()
  })
})
