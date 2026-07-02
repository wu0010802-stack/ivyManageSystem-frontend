import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { usePublicRegistrationForm } from '../usePublicRegistrationForm'

// audit C-3（2026-07-02）：報名頁勾選課程後 30s 輪詢把該課翻成 -1（滿且不開候補）
// 時，toggleCourse 舊守衛無條件 return → 該課永遠無法取消勾選、送出必 400 卡死。
// 查詢/編修頁的 onToggleCourse 有「已勾選可取消」carve-out，報名頁必須對齊。

function makeForm(availabilityMap: Record<string, number>) {
  return usePublicRegistrationForm({
    courses: ref([{ name: '圍棋', price: 3000 }]),
    supplies: ref([]),
    availability: ref(availabilityMap),
  })
}

describe('usePublicRegistrationForm.toggleCourse — availability=-1', () => {
  it('未勾選 + -1 → 擋下（不可新加註定 400 的課）', () => {
    const { form, toggleCourse } = makeForm({ 圍棋: -1 })
    toggleCourse({ name: '圍棋' })
    expect(form.selectedCourses).toEqual([])
  })

  it('已勾選 + -1 → 仍可取消（不可鎖死取消路徑）', () => {
    const { form, toggleCourse } = makeForm({ 圍棋: -1 })
    form.selectedCourses.push('圍棋')
    toggleCourse({ name: '圍棋' })
    expect(form.selectedCourses).toEqual([])
  })

  it('已勾選 + 候補（0）→ 照常 toggle', () => {
    const { form, toggleCourse } = makeForm({ 圍棋: 0 })
    toggleCourse({ name: '圍棋' })
    expect(form.selectedCourses).toEqual(['圍棋'])
  })
})
