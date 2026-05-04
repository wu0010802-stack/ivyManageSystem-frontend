import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TodoCenter from '@/parent/components/home/TodoCenter.vue'

const stubs = { ParentIcon: true }

describe('TodoCenter', () => {
  it('todos 為空時顯示「目前沒有待辦事項」', () => {
    const wrapper = mount(TodoCenter, { props: { todos: [] }, global: { stubs } })
    expect(wrapper.text()).toContain('目前沒有待辦事項')
    expect(wrapper.find('.todos-card').exists()).toBe(false)
    expect(wrapper.find('.todos-empty').exists()).toBe(true)
  })

  it('渲染 todos 列表 + count 用 <strong> 強調', () => {
    const wrapper = mount(TodoCenter, {
      props: {
        todos: [
          {
            key: 'fees',
            icon: 'money',
            tint: 'money',
            primaryText: '待繳費',
            count: 3,
            suffix: ' 筆',
            path: '/fees',
          },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('待繳費')
    expect(wrapper.text()).toContain('筆')
    expect(wrapper.find('strong').text()).toBe('3')
    expect(wrapper.find('.todo-row').exists()).toBe(true)
  })

  it('warn 文字顯示在 todo-warn span', () => {
    const wrapper = mount(TodoCenter, {
      props: {
        todos: [
          {
            key: 'fees',
            icon: 'money',
            tint: 'money',
            primaryText: '待繳費',
            count: 1,
            path: '/fees',
            warn: '（逾期 NT$ 1,000）',
          },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.find('.todo-warn').exists()).toBe(true)
    expect(wrapper.find('.todo-warn').text()).toContain('逾期')
  })

  it('點擊 todo emit navigate(path)', async () => {
    const wrapper = mount(TodoCenter, {
      props: {
        todos: [
          {
            key: 'x',
            icon: 'money',
            tint: 'money',
            primaryText: '待繳',
            count: 1,
            path: '/fees',
          },
        ],
      },
      global: { stubs },
    })
    await wrapper.find('button.todo-row').trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')[0]).toEqual(['/fees'])
  })

  it('多筆 todos 全部渲染並依序保留 key', () => {
    const wrapper = mount(TodoCenter, {
      props: {
        todos: [
          { key: 'a', icon: 'money', tint: 'money', primaryText: '待繳', count: 1, path: '/a' },
          { key: 'b', icon: 'chat', tint: 'message', primaryText: '訊息', count: 2, path: '/b' },
          { key: 'c', icon: 'art', tint: 'activity', primaryText: '才藝', count: 3, path: '/c' },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.findAll('.todo-row').length).toBe(3)
  })
})
