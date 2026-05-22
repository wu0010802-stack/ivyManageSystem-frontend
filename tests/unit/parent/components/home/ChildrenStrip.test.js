import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ChildrenStrip from '@/parent/components/home/ChildrenStrip.vue'

const stubs = { ParentIcon: true, CrownIcon: true }

describe('ChildrenStrip', () => {
  it('children 為空時顯示提示文', () => {
    const wrapper = mount(ChildrenStrip, { props: { children: [] }, global: { stubs } })
    expect(wrapper.text()).toContain('尚未綁定任何學生')
    expect(wrapper.text()).toContain('我的孩子')
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
        children: [{ student_id: 1, guardian_id: 11, name: 'A', lifecycle_status: 'enrolled' }],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('未分班')
  })

  it('lifecycle_status withdrawn → 已退學', () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [{ student_id: 1, guardian_id: 11, name: 'A', lifecycle_status: 'withdrawn' }],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('已退學')
  })

  it('點卡片本體 emit select(student_id)，不再 navigate', async () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [{ student_id: 7, guardian_id: 1, name: 'A', lifecycle_status: 'enrolled' }],
      },
      global: { stubs },
    })
    await wrapper.find('.child-card').trigger('click')
    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')[0]).toEqual([7])
    expect(wrapper.emitted('navigate')).toBeFalsy()
  })

  it('點右上 IconButton emit navigate(/children/:id)', async () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [{ student_id: 7, guardian_id: 1, name: 'A', lifecycle_status: 'enrolled' }],
      },
      global: { stubs },
    })
    await wrapper.find('[data-action="open-profile"]').trigger('click')
    expect(wrapper.emitted('navigate')).toBeTruthy()
    expect(wrapper.emitted('navigate')[0]).toEqual(['/children/7'])
    expect(wrapper.emitted('select')).toBeFalsy()
  })

  it('selectedId 對應的卡片加上 active class', () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        selectedId: 2,
        children: [
          { student_id: 1, guardian_id: 11, name: 'A', lifecycle_status: 'enrolled' },
          { student_id: 2, guardian_id: 12, name: 'B', lifecycle_status: 'enrolled' },
        ],
      },
      global: { stubs },
    })
    const cards = wrapper.findAll('.child-card')
    expect(cards[0].classes()).not.toContain('child-card--active')
    expect(cards[1].classes()).toContain('child-card--active')
  })

  it('IconButton click 不冒泡為 card click（避免 select 也被觸發）', async () => {
    const wrapper = mount(ChildrenStrip, {
      props: {
        children: [{ student_id: 9, guardian_id: 1, name: 'A', lifecycle_status: 'enrolled' }],
      },
      global: { stubs },
    })
    await wrapper.find('[data-action="open-profile"]').trigger('click')
    expect(wrapper.emitted('select')).toBeFalsy()
    expect(wrapper.emitted('navigate')[0]).toEqual(['/children/9'])
  })
})
