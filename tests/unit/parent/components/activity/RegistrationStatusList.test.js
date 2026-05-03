import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RegistrationStatusList from '@/parent/components/activity/RegistrationStatusList.vue'

const COURSE_STATUS = {
  enrolled: { label: '已報名', color: { bg: '#e7f3e9', color: '#166534' } },
  waitlist: { label: '候補中', color: { bg: '#fef3c7', color: '#92400e' } },
  promoted_pending: { label: '待您確認', color: { bg: '#fee2e2', color: '#b91c1c' } },
}

const registrations = [
  {
    id: 10,
    student_id: 1,
    student_name: '王小明',
    school_year: 113,
    semester: 1,
    is_paid: false,
    courses: [
      { course_id: 100, course_name: '繪畫', status: 'enrolled' },
      { course_id: 101, course_name: '足球', status: 'promoted_pending' },
    ],
  },
  {
    id: 11,
    student_id: 2,
    school_year: 113,
    semester: 2,
    is_paid: true,
    courses: [
      { course_id: 200, course_name: '英文', status: 'waitlist' },
    ],
  },
]

describe('RegistrationStatusList', () => {
  it('渲染所有 reg 卡片，並用 studentNameMap 補名稱', () => {
    const studentNameMap = new Map([[2, '陳小華']])
    const wrapper = mount(RegistrationStatusList, {
      props: {
        registrations,
        studentNameMap,
        courseStatusMap: COURSE_STATUS,
      },
    })
    const cards = wrapper.findAll('.reg-card')
    expect(cards).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('王小明')
    expect(text).toContain('陳小華')
    expect(text).toContain('113-上')
    expect(text).toContain('113-下')
    expect(text).toContain('未繳費')
    expect(text).toContain('已繳費')
    expect(text).toContain('已報名')
    expect(text).toContain('待您確認')
    expect(text).toContain('候補中')
  })

  it('根節點帶 id="act-active" 作為 hero 錨點', () => {
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations, courseStatusMap: COURSE_STATUS },
    })
    expect(wrapper.find('#act-active').exists()).toBe(true)
  })

  it('promoted_pending 顯示確認按鈕，點擊 emit confirm-promotion(reg, course)', async () => {
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations, courseStatusMap: COURSE_STATUS },
    })
    const buttons = wrapper.findAll('.confirm-btn')
    expect(buttons).toHaveLength(1)
    await buttons[0].trigger('click')
    const ev = wrapper.emitted('confirm-promotion')
    expect(ev).toBeTruthy()
    expect(ev[0][0]).toEqual(registrations[0])
    expect(ev[0][1]).toEqual(registrations[0].courses[1])
  })
})
