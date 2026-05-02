import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaveListCard from '@/parent/components/leaves/LeaveListCard.vue'

describe('LeaveListCard', () => {
  const sample = {
    id: 1, student_id: 10, leave_type: '事假',
    start_date: '2026-05-10', end_date: '2026-05-11',
    reason: '出國',
  }

  it('渲染 student name + type + 期間 + reason', () => {
    const wrapper = mount(LeaveListCard, {
      props: {
        leave: sample,
        studentName: '王小明',
        statusLabel: '待審核',
        statusColor: { bg: '#fff', color: '#333' },
      },
    })
    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).toContain('事假')
    expect(wrapper.text()).toContain('2026-05-10')
    expect(wrapper.text()).toContain('出國')
    expect(wrapper.text()).toContain('待審核')
  })

  it('studentName 缺失時顯示 fallback', () => {
    const wrapper = mount(LeaveListCard, {
      props: { leave: sample, studentName: '', statusLabel: '已核准' },
    })
    expect(wrapper.text()).toContain('學生 #10')
  })

  it('canCancel=true 時顯示取消按鈕，click emit cancel', async () => {
    const wrapper = mount(LeaveListCard, {
      props: { leave: sample, statusLabel: '已核准', canCancel: true },
    })
    const btn = wrapper.find('.cancel-btn')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(wrapper.emitted('cancel')[0][0]).toEqual(sample)
  })

  it('canCancel=false 時不顯示按鈕', () => {
    const wrapper = mount(LeaveListCard, {
      props: { leave: sample, statusLabel: '待審核', canCancel: false },
    })
    expect(wrapper.find('.cancel-btn').exists()).toBe(false)
  })

  it('整張卡 click emit click(leave)', async () => {
    const wrapper = mount(LeaveListCard, {
      props: { leave: sample, statusLabel: '已核准' },
    })
    await wrapper.find('article').trigger('click')
    expect(wrapper.emitted('click')[0][0]).toEqual(sample)
  })
})
