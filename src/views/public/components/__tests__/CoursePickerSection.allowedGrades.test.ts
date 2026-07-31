import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CoursePickerSection from '../CoursePickerSection.vue'

// 可報名年級（allowed_grades，2026-07-31）：課程卡顯示「限 ○班」chip。
// 僅顯示 advisory——業主規格：不在報名時比對學童資格，勾選不受年級影響。
const baseProps = {
  courses: [],
  selectedCourses: [],
  availabilityState: () => ({ text: '', cssClass: '', full: false }),
  formatSchedule: () => '',
  courseAdvisory: () => [],
}

describe('CoursePickerSection — 限定年級 chip', () => {
  it('有 allowed_grades 的課顯示「限 ○班」chip', () => {
    const wrapper = mount(CoursePickerSection, {
      props: {
        ...baseProps,
        courses: [{ name: '足球', price: 3000, allowed_grades: ['中班', '大班'] }],
      },
    })
    const chip = wrapper.find('.meta-chip--grades')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toBe('限 中班、大班')
  })

  it('無限定（空陣列或缺欄位）不渲染 chip', () => {
    const wrapper = mount(CoursePickerSection, {
      props: {
        ...baseProps,
        courses: [
          { name: '美術', price: 2000, allowed_grades: [] },
          { name: '圍棋', price: 3000 },
        ],
      },
    })
    expect(wrapper.find('.meta-chip--grades').exists()).toBe(false)
  })

  it('限定年級不影響勾選（advisory 不擋報名）', () => {
    const wrapper = mount(CoursePickerSection, {
      props: {
        ...baseProps,
        courses: [{ name: '足球', price: 3000, allowed_grades: ['大班'] }],
      },
    })
    const cb = wrapper.find('input[type="checkbox"]')
    expect(cb.attributes('disabled')).toBeUndefined()
  })
})
