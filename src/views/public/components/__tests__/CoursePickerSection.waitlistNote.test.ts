import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CoursePickerSection from '../CoursePickerSection.vue'

/**
 * 「額滿·可候補」與「已額滿」的差別原本只寫在 .course-item 的 title 屬性裡，
 * 觸控裝置永遠不顯示——而這頁的家長幾乎全部是用手機從 LINE 點進來的。
 * 候補是他們在這頁唯一真正不確定的決定，說明必須常駐在選課區內。
 */
const baseProps = {
  courses: [{ name: '圍棋', price: 3000 }],
  selectedCourses: [],
  availabilityState: () => ({ text: '額滿·可候補', cssClass: 'is-waiting', full: false }),
  formatSchedule: () => '',
  courseAdvisory: () => [],
}

describe('CoursePickerSection — 候補說明常駐於選課決策點', () => {
  it('說明與課程清單同時可見，不依賴 hover 或 title 屬性', () => {
    const wrapper = mount(CoursePickerSection, { props: baseProps })
    const note = wrapper.find('.waitlist-note')
    expect(note.exists()).toBe(true)
    expect(wrapper.find('.course-list-vertical').exists()).toBe(true)
  })

  it('回答家長真正會問的三件事：可不可以選、要不要先付錢、之後怎麼知道', () => {
    const text = mount(CoursePickerSection, { props: baseProps }).find('.waitlist-note').text()
    expect(text).toContain('仍可勾選')
    expect(text).toContain('不先收費')
    expect(text).toContain('通知')
  })

  it('說明「已額滿」與「額滿·可候補」的差別（兩者的可勾選狀態不同）', () => {
    const text = mount(CoursePickerSection, { props: baseProps }).find('.waitlist-note').text()
    expect(text).toContain('額滿·可候補')
    expect(text).toContain('已額滿')
  })
})
