import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ActivityCardList from '@/parent/components/activity/ActivityCardList.vue'

const courses = [
  {
    id: 1,
    name: '繪畫課',
    price: 3000,
    sessions: 10,
    capacity: 20,
    enrolled_count: 12,
    is_full: false,
    allow_waitlist: true,
    school_year: 113,
    semester: 1,
    description: '基礎繪畫入門',
  },
  {
    id: 2,
    name: '足球課',
    price: 4500,
    sessions: 12,
    capacity: 15,
    enrolled_count: 15,
    is_full: true,
    allow_waitlist: false,
    school_year: 113,
    semester: 2,
    description: '',
  },
]

describe('ActivityCardList', () => {
  it('渲染所有課程卡片', () => {
    const wrapper = mount(ActivityCardList, { props: { courses } })
    expect(wrapper.findAll('.course-card')).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('繪畫課')
    expect(text).toContain('$3,000')
    expect(text).toContain('10 堂')
    expect(text).toContain('12/20')
    expect(text).toContain('可報名')
    expect(text).toContain('15/15')
    expect(text).toContain('已額滿')
    expect(text).toContain('基礎繪畫入門')
  })

  it('額滿課程帶 enroll-tag.full，可候補時顯示「可候補」', () => {
    const wrapper = mount(ActivityCardList, {
      props: {
        courses: [
          { ...courses[1], allow_waitlist: true, name: '陶藝', id: 99 },
        ],
      },
    })
    const tag = wrapper.find('.enroll-tag')
    expect(tag.classes()).toContain('full')
    expect(tag.text()).toContain('可候補')
  })

  it('根節點帶 id="act-upcoming" 作為 hero 錨點', () => {
    const wrapper = mount(ActivityCardList, { props: { courses: [] } })
    expect(wrapper.find('#act-upcoming').exists()).toBe(true)
  })
})
