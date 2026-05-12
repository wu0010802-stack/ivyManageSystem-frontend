import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RegistrationTimeline from '@/components/activity/RegistrationTimeline.vue'

function makeReg(over = {}) {
  return {
    id: 1,
    student_name: '王小明',
    class_name: '中班',
    parent_phone: '0912345678',
    created_at: '2026-05-01 10:00:00',
    school_year: 114,
    semester: 2,
    is_active: true,
    pending_review: false,
    match_status: 'matched',
    reviewed_at: '2026-05-01 11:00:00',
    reviewed_by: 'admin',
    is_paid: false,
    total_amount: 3000,
    courses: [
      { course_id: 10, name: '美術', price: 1500, status: 'enrolled' },
      { course_id: 11, name: '律動', price: 1500, status: 'enrolled' },
    ],
    ...over,
  }
}

describe('RegistrationTimeline', () => {
  it('Happy path：5 個主節點全部到齊（建立/審核/配位/繳費/完結）', () => {
    const wrapper = mount(RegistrationTimeline, {
      props: {
        registration: makeReg(),
        payments: [],
        paidAmount: 0,
        paymentStatus: 'unpaid',
      },
    })
    expect(wrapper.findAll('.rt-node')).toHaveLength(5)
    expect(wrapper.text()).toContain('建立報名')
    expect(wrapper.text()).toContain('匹配審核')
    expect(wrapper.text()).toContain('課程配位')
    expect(wrapper.text()).toContain('繳費進度')
  })

  it('match_status=rejected：審核後直接終止，不顯示配位/繳費', () => {
    const wrapper = mount(RegistrationTimeline, {
      props: {
        registration: makeReg({ match_status: 'rejected', is_active: false }),
        payments: [],
        paidAmount: 0,
        paymentStatus: 'unpaid',
      },
    })
    const text = wrapper.text()
    expect(text).toContain('已拒絕')
    expect(text).not.toContain('課程配位')
    expect(text).not.toContain('繳費進度')
    expect(text).toContain('報名已撤銷')
  })

  it('待校方審核：審核節點為 current 狀態', () => {
    const wrapper = mount(RegistrationTimeline, {
      props: {
        registration: makeReg({ pending_review: true, match_status: 'pending' }),
        payments: [],
        paidAmount: 0,
        paymentStatus: 'unpaid',
      },
    })
    expect(wrapper.find('.rt-current').exists()).toBe(true)
    expect(wrapper.text()).toContain('等待校方審核')
  })

  it('候補升正待家長確認：警示色 + 顯示截止時間', () => {
    const wrapper = mount(RegistrationTimeline, {
      props: {
        registration: makeReg({
          courses: [
            { course_id: 10, name: '美術', price: 1500, status: 'promoted_pending', confirm_deadline: '2026-05-15 18:00:00' },
          ],
        }),
        payments: [],
        paidAmount: 0,
        paymentStatus: 'unpaid',
      },
    })
    const text = wrapper.text()
    expect(text).toContain('1 門待家長確認')
    expect(text).toContain('截止')
    expect(text).toContain('2026-05-15 18:00')
  })

  it('退費分支：refund record 顯示退費節點', () => {
    const wrapper = mount(RegistrationTimeline, {
      props: {
        registration: makeReg({ is_paid: true }),
        payments: [
          { id: 1, type: 'payment', amount: 3000, payment_date: '2026-05-02', is_voided: false },
          { id: 2, type: 'refund', amount: 500, payment_date: '2026-05-10', is_voided: false, notes: '臨時退課' },
        ],
        paidAmount: 2500,
        paymentStatus: 'partial',
      },
    })
    const text = wrapper.text()
    expect(text).toContain('退費紀錄')
    expect(text).toContain('-NT$ 500')
  })

  it('voided 紀錄：顯示為已軟刪節點，金額用 line-through', () => {
    const wrapper = mount(RegistrationTimeline, {
      props: {
        registration: makeReg(),
        payments: [
          { id: 3, type: 'payment', amount: 1000, payment_date: '2026-05-03', is_voided: true, void_reason: '誤輸入', voided_by: 'admin' },
        ],
        paidAmount: 0,
        paymentStatus: 'unpaid',
      },
    })
    const text = wrapper.text()
    expect(text).toContain('已軟刪紀錄')
    expect(text).toContain('誤輸入')
    expect(wrapper.find('.rt-event-voided').exists()).toBe(true)
  })

  it('全繳清 + 無退費：完結節點顯示「報名完成」結案', () => {
    const wrapper = mount(RegistrationTimeline, {
      props: {
        registration: makeReg({ is_paid: true }),
        payments: [
          { id: 1, type: 'payment', amount: 3000, payment_date: '2026-05-02', is_voided: false },
        ],
        paidAmount: 3000,
        paymentStatus: 'paid',
      },
    })
    expect(wrapper.text()).toContain('報名完成')
    expect(wrapper.text()).toContain('結案')
  })

  it('forced（強行收件校外生）：審核節點為 warning 色 + 對應 badge', () => {
    const wrapper = mount(RegistrationTimeline, {
      props: {
        registration: makeReg({ match_status: 'forced' }),
        payments: [],
        paidAmount: 0,
        paymentStatus: 'unpaid',
      },
    })
    expect(wrapper.text()).toContain('強行收件')
    expect(wrapper.find('.rt-warning').exists()).toBe(true)
  })
})
