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
