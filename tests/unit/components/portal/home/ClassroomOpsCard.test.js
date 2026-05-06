import { describe, it, expect, vi } from 'vitest'
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

  it('renders contact_book percentage', () => {
    const w = mountIt()
    // cbPercent = "10/15 (66.7%)"
    expect(w.text()).toMatch(/66\.7/)
  })

  it('shows pending dismissal count', () => {
    const w = mountIt()
    // "2 件待處理"
    expect(w.text()).toContain('2')
  })

  it('shows pending medications count', () => {
    const w = mountIt()
    // "1 筆未執行"
    expect(w.text()).toContain('1')
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

  it('shows attendance_called_today status', () => {
    const w = mountIt()
    expect(w.text()).toContain('未點名')
    const calledCard = { ...FULL_CARD, attendance_called_today: true }
    const w2 = mountIt(calledCard)
    expect(w2.text()).toContain('已完成')
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

  it('clicking contact book kpi pushes to contact-book route', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mountIt()
    const kpis = w.findAll('.kpi')
    // first kpi = 聯絡簿
    await kpis[0].trigger('click')
    expect(push).toHaveBeenCalledWith({ path: '/portal/contact-book', query: { classroom_id: 1 } })
  })

  it('clicking dismissal kpi pushes to dismissal-calls route', async () => {
    const push = vi.spyOn(router, 'push')
    const w = mountIt()
    const kpis = w.findAll('.kpi')
    // third kpi = 接送
    await kpis[2].trigger('click')
    expect(push).toHaveBeenCalledWith('/portal/dismissal-calls')
  })
})
