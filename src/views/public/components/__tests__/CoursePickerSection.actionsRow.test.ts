import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CoursePickerSection from '../CoursePickerSection.vue'

/**
 * 2026-08-01 版面改動：影片／DM 按鈕從「與 label 同一條水平 flex」移為
 * 卡片第三列動作列（.course-row-actions）。兩個回歸點：
 * 1. 動作列必須在 <label> 之外——按鈕巢在 label 內時，點按鈕會連動
 *    勾選 checkbox（label activation）。
 * 2. 沒有任何動作（無影片也無 DM）時整列不渲染，卡片不留空第三列。
 */

interface CourseItem {
  name: string
  price?: string | number
  [key: string]: unknown
}

const baseProps = {
  courses: [] as CourseItem[],
  selectedCourses: [] as string[],
  availabilityState: () => ({ text: '', cssClass: '', full: false }),
  formatSchedule: () => '',
  courseAdvisory: () => [],
}

describe('CoursePickerSection — 卡片動作列（.course-row-actions）', () => {
  it('影片與 DM 按鈕位於 .course-row-actions，且不在 <label> 內', () => {
    const course: CourseItem = { name: '圍棋', price: 3000, dm_pages: ['/api/x/1.png'] }
    const wrapper = mount(CoursePickerSection, {
      props: { ...baseProps, courses: [course], videos: { 圍棋: 'https://youtu.be/dQw4w9WgXcQ' } },
    })
    const actions = wrapper.find('.course-row-actions')
    expect(actions.exists()).toBe(true)
    expect(actions.findAll('button')).toHaveLength(2)
    expect(wrapper.find('.course-label').find('button').exists()).toBe(false)
  })

  it('點擊動作列按鈕不會連動勾選課程 checkbox', async () => {
    const course: CourseItem = { name: '圍棋', price: 3000, dm_pages: ['/api/x/1.png'] }
    const wrapper = mount(CoursePickerSection, {
      props: { ...baseProps, courses: [course] },
    })
    await wrapper.find('.course-row-actions button').trigger('click')
    expect(wrapper.emitted('open-dm')).toBeTruthy()
    expect(wrapper.emitted('toggle')).toBeUndefined()
  })

  it('無影片也無 DM → 不渲染動作列', () => {
    const course: CourseItem = { name: '足球', price: 2500 }
    const wrapper = mount(CoursePickerSection, {
      props: { ...baseProps, courses: [course] },
    })
    expect(wrapper.find('.course-row-actions').exists()).toBe(false)
  })

  it('只有影片沒有 DM → 動作列僅一顆「課程介紹」', () => {
    const course: CourseItem = { name: '街舞', price: 2700 }
    const wrapper = mount(CoursePickerSection, {
      props: { ...baseProps, courses: [course], videos: { 街舞: 'https://youtu.be/dQw4w9WgXcQ' } },
    })
    const actions = wrapper.find('.course-row-actions')
    const buttons = actions.findAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].text()).toContain('課程介紹')
  })
})
