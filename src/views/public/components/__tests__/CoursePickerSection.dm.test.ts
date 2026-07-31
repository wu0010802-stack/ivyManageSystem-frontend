import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CoursePickerSection from '../CoursePickerSection.vue'

/**
 * Task 8：課程 DM 預覽入口 —「課程簡介」按鈕。
 * 僅在 course.dm_pages 非空陣列時渲染；點擊 emit open-dm 帶整個 course 物件
 * （與既有 open-video 的 emit 慣例一致，交由 parent ActivityPublicView 組出 modal state）。
 */

interface CourseItem {
  name: string
  price?: string | number
  sessions?: number | string
  [key: string]: unknown
}

const baseProps = {
  courses: [] as CourseItem[],
  selectedCourses: [] as string[],
  availabilityState: () => ({ text: '', cssClass: '', full: false }),
  formatSchedule: () => '',
  courseAdvisory: () => [],
}

describe('CoursePickerSection — 課程簡介按鈕（Task 8）', () => {
  it('course 有 dm_pages 非空陣列 → 顯示「課程簡介」按鈕', () => {
    const course: CourseItem = { name: '圍棋', price: 3000, dm_pages: ['/api/x/1.png', '/api/x/2.png'] }
    const wrapper = mount(CoursePickerSection, {
      props: { ...baseProps, courses: [course] },
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('課程簡介'))
    expect(btn).toBeTruthy()
    expect(btn!.attributes('aria-label')).toBe('查看 圍棋 課程簡介')
  })

  it('點擊「課程簡介」按鈕 → emit open-dm 帶整個 course 物件', async () => {
    const course: CourseItem = { name: '圍棋', price: 3000, dm_pages: ['/api/x/1.png'] }
    const wrapper = mount(CoursePickerSection, {
      props: { ...baseProps, courses: [course] },
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('課程簡介'))
    await btn!.trigger('click')
    expect(wrapper.emitted('open-dm')).toBeTruthy()
    expect(wrapper.emitted('open-dm')![0]).toEqual([course])
  })

  it('course 無 dm_pages → 不顯示「課程簡介」按鈕', () => {
    const course: CourseItem = { name: '足球', price: 2500 }
    const wrapper = mount(CoursePickerSection, {
      props: { ...baseProps, courses: [course] },
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('課程簡介'))
    expect(btn).toBeUndefined()
  })

  it('course.dm_pages 為空陣列 → 不顯示「課程簡介」按鈕', () => {
    const course: CourseItem = { name: '足球', price: 2500, dm_pages: [] }
    const wrapper = mount(CoursePickerSection, {
      props: { ...baseProps, courses: [course] },
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('課程簡介'))
    expect(btn).toBeUndefined()
  })

  it('course.dm_pages 非陣列（防禦後端異常值）→ 不顯示按鈕', () => {
    const course: CourseItem = { name: '足球', price: 2500, dm_pages: 'not-an-array' }
    const wrapper = mount(CoursePickerSection, {
      props: { ...baseProps, courses: [course] },
    })
    const btn = wrapper.findAll('button').find((b) => b.text().includes('課程簡介'))
    expect(btn).toBeUndefined()
  })
})
