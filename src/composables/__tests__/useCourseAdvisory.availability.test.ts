/**
 * FE-5（2026-06-23 audit）：availabilityState 對「availability map 不含該課（undefined）」
 * 原本回傳空字串（無名額提示）且 full:false → UI 靜默呈現為可報名、不顯示名額查詢狀態。
 * 修：undefined 改顯示「名額查詢中」（純顯示層；仍不擋報名，容量由後端硬閘）。
 */
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { useCourseAdvisory } from '../useCourseAdvisory'

function setup(availabilityMap: Record<string, number>) {
  const course = { name: '鋼琴' }
  const api = useCourseAdvisory({
    courses: ref([course]),
    availability: ref(availabilityMap),
    form: { birthday: null, selectedCourses: [] },
  })
  return { course, api }
}

describe('availabilityState — availability 不含該課（undefined）', () => {
  it('顯示「名額查詢中」而非空字串（不再靜默放行）', () => {
    const { course, api } = setup({}) // 空 map → 鋼琴 為 undefined
    const state = api.availabilityState(course)
    expect(state.text).toBe('名額查詢中')
  })

  it('仍不阻擋報名（full=false，容量交由後端硬閘）', () => {
    const { course, api } = setup({})
    expect(api.availabilityState(course).full).toBe(false)
  })

  it('availability 有值時行為不變（剩 5 位）', () => {
    const { course, api } = setup({ 鋼琴: 5 })
    expect(api.availabilityState(course).text).toBe('剩 5 位')
  })
})
