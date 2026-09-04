import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ClassHubStickyNext from '../ClassHubStickyNext.vue'
import TodayFocusCard from '@/components/portal/home/TodayFocusCard.vue'

/**
 * 「今日任務都完成」不得在還有待辦時出現（2026-09-03 UI/UX 稽核 P1-01）。
 *
 * 實測矛盾：首頁說「尚有 3 項待完成」、本元件說「今日任務都完成」、
 * 快速點名抽屜說「皆已點名」，同頁時段卡卻列著「到園點名 (1)」。
 * 根因是本元件只看 sticky_next，而 sticky_next 只由 medication 驅動。
 *
 * 這組測試把「完成 ＝ next 為空 且 counts 皆 0」釘死在兩個消費端上，
 * 任何一端改回只看 next 都會紅。
 */

const DONE_TEXT = '今日任務都完成'

function mountSticky(props: Record<string, unknown>) {
  return mount(ClassHubStickyNext, {
    props,
    global: { plugins: [ElementPlus] },
  })
}

describe('ClassHubStickyNext 完成狀態', () => {
  it('counts 有待辦但沒有排定任務時，不得宣稱「都完成」', () => {
    const wrapper = mountSticky({
      next: null,
      counts: { attendance_pending: 1, observations_pending: 1, contact_books_pending: 1 },
    })
    expect(wrapper.text()).not.toContain(DONE_TEXT)
    expect(wrapper.text()).toContain('仍有')
    expect(wrapper.text()).toContain('3')
  })

  it('列出待辦類別與各自數量，老師才知道要做什麼', () => {
    const wrapper = mountSticky({
      next: null,
      counts: { attendance_pending: 2, contact_books_pending: 5 },
    })
    expect(wrapper.text()).toContain('到園點名 2')
    expect(wrapper.text()).toContain('聯絡簿 5')
  })

  it('counts 四類皆 0 且無排定任務，才顯示「都完成」', () => {
    const wrapper = mountSticky({
      next: null,
      counts: {
        attendance_pending: 0,
        medications_pending: 0,
        observations_pending: 0,
        contact_books_pending: 0,
      },
    })
    expect(wrapper.text()).toContain(DONE_TEXT)
  })

  it('有排定任務時顯示下一件，且不出現完成字樣', () => {
    const wrapper = mountSticky({
      next: { detail: '餵藥：安佳熱', student_name: '王小明', due_at: '2026-09-03T10:30:00' },
      counts: { medications_pending: 1 },
    })
    expect(wrapper.text()).toContain('餵藥：安佳熱')
    expect(wrapper.text()).toContain('王小明')
    expect(wrapper.text()).not.toContain(DONE_TEXT)
  })
})

describe('TodayFocusCard 與置頂條口徑一致', () => {
  it('同一組 counts 下，兩個元件對「是否完成」的判斷相同', () => {
    const counts = { attendance_pending: 1 }
    const sticky = mountSticky({ next: null, counts })
    const focus = mount(TodayFocusCard, {
      props: { next: null, counts, classroomName: '天堂鳥' },
      global: { plugins: [ElementPlus] },
    })
    // 兩邊都必須說「還有事」，不得一邊說完成、一邊說有待辦
    expect(sticky.text()).not.toContain(DONE_TEXT)
    expect(focus.text()).not.toContain('今日班級任務都完成')
    expect(focus.text()).toContain('尚有 1 項待完成')
  })
})
