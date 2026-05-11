import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TodoCenter from '@/parent/components/home/TodoCenter.vue'

const mkTodo = (overrides = {}) => ({
  key: 'announcements',
  icon: 'megaphone',
  tint: 'announcement',
  primaryText: '未讀公告',
  count: 1,
  suffix: ' 則',
  path: '/announcements',
  ...overrides,
})

describe('TodoCenter Phase 3 升級', () => {
  it('標題顯示「需要你處理（X）」帶 todos.length', () => {
    const wrapper = mount(TodoCenter, {
      props: { todos: [mkTodo(), mkTodo({ key: 'messages', primaryText: '未讀訊息' })] },
    })
    expect(wrapper.html()).toContain('需要你處理')
    expect(wrapper.html()).toContain('（2）')
  })

  it('todos=[] 顯示「目前沒有待辦 ✨」空狀態', () => {
    const wrapper = mount(TodoCenter, { props: { todos: [] } })
    expect(wrapper.html()).toContain('目前沒有待辦')
  })

  it('依陣列順序渲染（HomeView 已預先排序）', () => {
    const wrapper = mount(TodoCenter, {
      props: {
        todos: [
          mkTodo({ key: 'fees_overdue', primaryText: '待繳費' }),
          mkTodo({ key: 'announcements', primaryText: '未讀公告' }),
        ],
      },
    })
    const html = wrapper.html()
    expect(html.indexOf('待繳費')).toBeLessThan(html.indexOf('未讀公告'))
  })
})
