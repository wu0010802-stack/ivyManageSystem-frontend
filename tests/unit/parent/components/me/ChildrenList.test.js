import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChildrenList from '@/parent/components/me/ChildrenList.vue'

const stubs = {
  'router-link': {
    template: '<a :data-to="to"><slot /></a>',
    props: ['to'],
  },
}

describe('ChildrenList', () => {
  it('未綁定子女時顯示 empty + 加綁 CTA', () => {
    const wrapper = mount(ChildrenList, {
      props: { children: [] },
      global: { stubs },
    })
    expect(wrapper.html()).toContain('尚未綁定子女')
    expect(wrapper.html()).toContain('加綁子女')
  })

  it('顯示每位子女含班級', () => {
    const wrapper = mount(ChildrenList, {
      props: {
        children: [
          { student_id: 1, name: '小明', classroom_name: '小班' },
          { student_id: 2, name: '小華', classroom_name: '中班' },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.html()).toContain('小明')
    expect(wrapper.html()).toContain('小班')
    expect(wrapper.html()).toContain('小華')
    expect(wrapper.html()).toContain('中班')
  })

  it('每位子女連到 /children/:id，加綁連到 /bind-additional', () => {
    const wrapper = mount(ChildrenList, {
      props: {
        children: [{ student_id: 42, name: '小明', classroom_name: '小班' }],
      },
      global: { stubs },
    })
    const links = wrapper.findAll('a')
    // 1 個 child + 1 個 加綁 = 2
    expect(links.length).toBe(2)
    expect(links[0].attributes('data-to')).toBe('/children/42')
    expect(links[1].attributes('data-to')).toBe('/bind-additional')
  })
})
