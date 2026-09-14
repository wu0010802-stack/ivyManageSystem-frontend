import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import ClassroomOpsCard from '@/components/portal/home/ClassroomOpsCard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

// allergy_alerts 是物件陣列 {student_id, student_name, allergens: [{allergen}]}
// consecutive_absences 是物件陣列 {student_id, student_name, days}
// upcoming_birthdays_7d 是物件陣列 {student_id, student_name, days_until}
const FULL_CARD = {
  classroom_id: 1,
  classroom_name: '小白兔班',
  student_count: 15,
  contact_book: { roster: 15, draft: 3, published: 10, missing: 2, percentage: 66.7 },
  attendance_called_today: false,
  pending_dismissal_calls: 2,
  consecutive_absences: [{ student_id: 1, student_name: '王小明', days: 3 }],
  upcoming_birthdays_7d: [{ student_id: 2, student_name: '李小花', days_until: 2 }],
  allergy_alerts: [
    { student_id: 3, student_name: '陳大頭', allergens: [{ allergen: '花生' }, { allergen: '海鮮' }] },
  ],
  pending_medications_today: 1,
}

const EMPTY_CARD = {
  classroom_id: 2,
  classroom_name: '空班',
  student_count: 0,
  contact_book: { roster: 0, draft: 0, published: 0, missing: 0, percentage: 0 },
  attendance_called_today: false,
  pending_dismissal_calls: 0,
  consecutive_absences: [],
  upcoming_birthdays_7d: [],
  allergy_alerts: [],
  pending_medications_today: 0,
}

function mountIt(card = FULL_CARD) {
  return mount(ClassroomOpsCard, {
    props: { card },
    global: { plugins: [router] },
  })
}

describe('ClassroomOpsCard', () => {
  it('renders classroom_name', () => {
    const w = mountIt()
    expect(w.text()).toContain('小白兔班')
  })

  it('renders student_count', () => {
    const w = mountIt()
    expect(w.text()).toContain('15')
  })

  it('renders allergy alerts with allergen names', () => {
    const w = mountIt()
    // 花生、海鮮 來自 allergens[].allergen joined by 、
    expect(w.text()).toContain('花生')
    expect(w.text()).toContain('海鮮')
  })

  it('renders allergy alert student name', () => {
    const w = mountIt()
    expect(w.text()).toContain('陳大頭')
  })

  it('renders consecutive absence student name and days', () => {
    const w = mountIt()
    expect(w.text()).toContain('王小明')
    expect(w.text()).toContain('3')
  })

  it('renders upcoming birthday student name', () => {
    const w = mountIt()
    expect(w.text()).toContain('李小花')
    // days_until=2 → "2 天後"
    expect(w.text()).toContain('2 天後')
  })

  it('shows "今天" for birthday with days_until=0', () => {
    const card = {
      ...FULL_CARD,
      upcoming_birthdays_7d: [{ student_id: 5, student_name: '生日快樂', days_until: 0 }],
    }
    const w = mountIt(card)
    expect(w.text()).toContain('今天')
  })

  it('handles empty card gracefully', () => {
    const w = mountIt(EMPTY_CARD)
    expect(w.text()).toContain('空班')
    // No allergy, absence, birthday rows
    expect(w.find('.alert-row').exists()).toBe(false)
  })

  it('does not crash on missing optional fields', () => {
    const minimal = {
      classroom_id: 3,
      classroom_name: 'min',
      student_count: 0,
      contact_book: { roster: 0, draft: 0, published: 0, missing: 0, percentage: 0 },
    }
    expect(() => mountIt(minimal)).not.toThrow()
  })

  // 2026-09-14 首頁整併：聯絡簿／點名／接送／用藥四格 KPI 與首頁功能格指的是
  // 同一批功能，並存等於同一個入口在首頁出現兩次。本卡只保留「別處看不到」的
  // 三條提醒（連續缺席／近期生日／過敏注意）。
  it('不再渲染四格 KPI——那批入口已由首頁功能格承接', () => {
    const w = mountIt()
    expect(w.find('.kpi').exists()).toBe(false)
    expect(w.text()).not.toContain('未點名')
    expect(w.text()).not.toContain('件待處理')
    expect(w.text()).not.toContain('筆未執行')
    expect(w.text()).not.toMatch(/66\.7/)
  })
})
