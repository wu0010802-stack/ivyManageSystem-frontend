import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChildrenStrip from '@/parent/components/home/ChildrenStrip.vue'

const stubs = { ParentIcon: true }

describe('ChildrenStrip', () => {
  it('children 為空時顯示提示文', () => {
    const wrapper = mount(ChildrenStrip, { props: { children: [] }, global: { stubs } })
    expect(wrapper.text()).toContain('尚未綁定任何學生')
    expect(wrapper.text()).toContain('我的小孩（0）')
  })

  it('渲染 child name + classroom + 各種 tag', () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [
          {
            student_id: 1,
            guardian_id: 11,
            name: '王小明',
            classroom_name: '小班A',
            guardian_relation: '父親',
            is_primary: true,
            can_pickup: true,
            lifecycle_status: 'enrolled',
          },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).toContain('小班A')
    expect(wrapper.text()).toContain('父親')
    expect(wrapper.text()).toContain('主要聯絡人')
    expect(wrapper.text()).toContain('可接送')
    expect(wrapper.text()).toContain('在學')
  })

  it('classroom_name 為空時顯示「未分班」', () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [
          {
            student_id: 1,
            guardian_id: 11,
            name: 'A',
            lifecycle_status: 'enrolled',
          },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('未分班')
  })

  it('lifecycle_status 對應正確標籤（withdrawn → 已退學）', () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [
          {
            student_id: 1,
            guardian_id: 11,
            name: 'A',
            lifecycle_status: 'withdrawn',
          },
        ],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('已退學')
  })

  it('點擊 child card emit navigate(/children/:id)', async () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [
          {
            student_id: 7,
            guardian_id: 1,
            name: 'A',
            lifecycle_status: 'enrolled',
          },
        ],
      },
      global: { stubs },
    })
    await wrapper.find('.child-card').trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')[0]).toEqual(['/children/7'])
  })
})
