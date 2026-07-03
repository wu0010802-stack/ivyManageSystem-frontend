import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CoursePickerSection from '../CoursePickerSection.vue'

const baseProps = {
  courses: [],
  selectedCourses: [],
  availabilityState: () => ({ text: '', cssClass: '', full: false }),
  formatSchedule: () => '',
  courseAdvisory: () => [],
}

describe('CoursePickerSection', () => {
  it('Step 2 說明文常駐顯示「必選」引導（不需送出即可見）', () => {
    const wrapper = mount(CoursePickerSection, { props: baseProps })
    expect(wrapper.find('.step-desc').text()).toContain('必選')
  })
})

describe('CoursePickerSection — 額滿課已勾選仍可取消（audit C-3，2026-07-02）', () => {
  const fullState = { text: '已額滿', cssClass: 'is-full', full: true }
  const props = {
    ...baseProps,
    courses: [{ name: '圍棋', price: 3000 }],
    availabilityState: () => fullState,
  }

  it('full 且未勾選 → checkbox disabled（不可新加註定 400 的課）', () => {
    const wrapper = mount(CoursePickerSection, { props: { ...props, selectedCourses: [] } })
    const cb = wrapper.find('input[type="checkbox"]')
    expect(cb.attributes('disabled')).toBeDefined()
  })

  it('full 但已勾選 → checkbox 可點（30s 輪詢後名額翻轉不可鎖死取消路徑）', () => {
    const wrapper = mount(CoursePickerSection, { props: { ...props, selectedCourses: ['圍棋'] } })
    const cb = wrapper.find('input[type="checkbox"]')
    expect(cb.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.course-item').classes()).not.toContain('course-item-disabled')
  })
})
