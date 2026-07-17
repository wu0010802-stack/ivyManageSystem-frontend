import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CoursePickerSection from '../CoursePickerSection.vue'

/**
 * C4 memoization 回歸測試：模板改讀 computed Map 後，
 * ① 每列顯示的 availability text / cssClass 與修改前一致（behavior-preserving）
 * ② availabilityState 每列僅被呼叫一次（不再 O(6N) 重複 new 物件）
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

// 模擬 useCourseAdvisory.availabilityState 的真實語意
function realAvailabilityState(remainingByName: Record<string, number | undefined>) {
  return (course: CourseItem) => {
    const remaining = remainingByName[course.name]
    if (remaining === undefined) return { text: '名額查詢中', cssClass: 'is-unknown', full: false }
    if (remaining === -1) return { text: '已額滿', cssClass: 'is-full', full: true }
    if (remaining <= 0) return { text: '額滿·可候補', cssClass: 'is-waiting', full: false }
    if (remaining <= 3) return { text: `剩 ${remaining} 位`, cssClass: 'is-low', full: false }
    return { text: `剩 ${remaining} 位`, cssClass: 'is-available', full: false }
  }
}

describe('CoursePickerSection C4 — availabilityState 記憶化', () => {
  const courses: CourseItem[] = [
    { name: '圍棋', price: 3000 },
    { name: '足球', price: 2500 },
    { name: '畫畫', price: 2000 },
    { name: '鋼琴', price: 4000 },
  ]
  const remaining = { 圍棋: -1, 足球: 0, 畫畫: 2, 鋼琴: 10 }

  it('每列顯示的 availability text / cssClass 與函式輸出一致（behavior-preserving）', () => {
    const wrapper = mount(CoursePickerSection, {
      props: {
        ...baseProps,
        courses,
        selectedCourses: [],
        availabilityState: realAvailabilityState(remaining),
      },
    })
    const items = wrapper.findAll('.course-item')
    expect(items).toHaveLength(4)

    const expected = [
      { text: '已額滿', cls: 'is-full' },
      { text: '額滿·可候補', cls: 'is-waiting' },
      { text: '剩 2 位', cls: 'is-low' },
      { text: '剩 10 位', cls: 'is-available' },
    ]
    items.forEach((item, i) => {
      const qty = item.find('.qty-display')
      expect(qty.exists()).toBe(true)
      expect(qty.text()).toBe(expected[i].text)
      expect(qty.classes()).toContain(expected[i].cls)
    })
  })

  it('availabilityState 每列僅呼叫一次，而非模板中的 ~6 次（記憶化生效）', () => {
    const spy = vi.fn(realAvailabilityState(remaining))
    mount(CoursePickerSection, {
      props: {
        ...baseProps,
        courses,
        selectedCourses: [],
        availabilityState: spy,
      },
    })
    // 4 門課 → computed 內每門呼叫一次 = 4；未記憶化時模板會 ~6N = 24
    expect(spy.mock.calls.length).toBe(courses.length)
    // 每門課皆恰好被算過一次
    const seen = spy.mock.calls.map((c) => (c[0] as CourseItem).name).sort()
    expect(seen).toEqual([...courses.map((c) => c.name)].sort())
  })

  it('courseLocked 仍走記憶化狀態：full 且未勾選 → disabled；full 且已勾選 → 可取消', () => {
    const remainingFull = { 圍棋: -1 }
    const notSelected = mount(CoursePickerSection, {
      props: {
        ...baseProps,
        courses: [{ name: '圍棋', price: 3000 }],
        selectedCourses: [],
        availabilityState: realAvailabilityState(remainingFull),
      },
    })
    expect(notSelected.find('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    expect(notSelected.find('.course-item').classes()).toContain('course-item-disabled')

    const selected = mount(CoursePickerSection, {
      props: {
        ...baseProps,
        courses: [{ name: '圍棋', price: 3000 }],
        selectedCourses: ['圍棋'],
        availabilityState: realAvailabilityState(remainingFull),
      },
    })
    expect(selected.find('input[type="checkbox"]').attributes('disabled')).toBeUndefined()
    expect(selected.find('.course-item').classes()).not.toContain('course-item-disabled')
  })

  it('availability 無 text（空字串）時不渲染 qty-display（維持原 v-if 行為）', () => {
    const wrapper = mount(CoursePickerSection, {
      props: {
        ...baseProps,
        courses: [{ name: '圍棋', price: 3000 }],
        selectedCourses: [],
        availabilityState: () => ({ text: '', cssClass: 'is-available', full: false }),
      },
    })
    expect(wrapper.find('.qty-display').exists()).toBe(false)
  })
})
