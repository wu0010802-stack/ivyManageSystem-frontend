import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RegistrationStatusList from '@/parent/components/activity/RegistrationStatusList.vue'

const COURSE_STATUS = {
  enrolled: { label: '已報名', color: { bg: '#e7f3e9', color: '#166534' } },
  waitlist: { label: '候補中', color: { bg: '#fef3c7', color: '#92400e' } },
  promoted_pending: { label: '待您確認', color: { bg: '#fee2e2', color: '#b91c1c' } },
}

const registrations = [
  {
    id: 10,
    student_id: 1,
    student_name: '王小明',
    school_year: 113,
    semester: 1,
    is_paid: false,
    courses: [
      { course_id: 100, course_name: '繪畫', status: 'enrolled' },
      { course_id: 101, course_name: '足球', status: 'promoted_pending' },
    ],
  },
  {
    id: 11,
    student_id: 2,
    school_year: 113,
    semester: 2,
    is_paid: true,
    courses: [
      { course_id: 200, course_name: '英文', status: 'waitlist' },
    ],
  },
]

describe('RegistrationStatusList', () => {
  it('渲染所有 reg 卡片，並用 studentNameMap 補名稱', () => {
    const studentNameMap = new Map([[2, '陳小華']])
    const wrapper = mount(RegistrationStatusList, {
      props: {
        registrations,
        studentNameMap,
        courseStatusMap: COURSE_STATUS,
      },
    })
    const cards = wrapper.findAll('.reg-card')
    expect(cards).toHaveLength(2)
    const text = wrapper.text()
    expect(text).toContain('王小明')
    expect(text).toContain('陳小華')
    expect(text).toContain('113-上')
    expect(text).toContain('113-下')
    expect(text).toContain('未繳費')
    expect(text).toContain('已繳費')
    expect(text).toContain('已報名')
    expect(text).toContain('待您確認')
    expect(text).toContain('候補中')
  })

  it('課程狀態透過 StatusPill 渲染 — enrolled 帶 tone-ok', () => {
    const wrapper = mount(RegistrationStatusList, {
      props: {
        registrations: [registrations[0]],
        courseStatusMap: COURSE_STATUS,
      },
    })
    // enrolled 課程的 StatusPill（data-status=enrolled）
    const enrolledPill = wrapper.find('[data-status="enrolled"].status-pill')
    expect(enrolledPill.exists()).toBe(true)
    expect(enrolledPill.classes()).toContain('tone-ok')
    expect(enrolledPill.text()).toContain('已報名')
  })

  it('候補課程 StatusPill 帶 tone-warn', () => {
    const wrapper = mount(RegistrationStatusList, {
      props: {
        registrations: [registrations[1]],
        courseStatusMap: COURSE_STATUS,
      },
    })
    const pill = wrapper.find('[data-status="waitlist"].status-pill')
    expect(pill.exists()).toBe(true)
    expect(pill.classes()).toContain('tone-warn')
    expect(pill.text()).toContain('候補中')
  })

  it('promoted_pending 課程 StatusPill 帶 tone-danger', () => {
    const wrapper = mount(RegistrationStatusList, {
      props: {
        registrations: [registrations[0]],
        courseStatusMap: COURSE_STATUS,
      },
    })
    const pill = wrapper.find('[data-status="promoted_pending"].status-pill')
    expect(pill.exists()).toBe(true)
    expect(pill.classes()).toContain('tone-danger')
    expect(pill.text()).toContain('待您確認')
  })

  it('pending_review 系列使用中文標籤，並區分待審 warning 與待審候補 info tone', () => {
    const regs = [{
      id: 30,
      student_id: 7,
      student_name: '待審生',
      school_year: 114,
      semester: 2,
      is_paid: false,
      courses: [
        { course_id: 401, course_name: '美術', status: 'pending_review' },
        { course_id: 402, course_name: '足球', status: 'pending_review_waitlist' },
      ],
    }]
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations: regs },
    })

    const pending = wrapper.find('[data-status="pending_review"].status-pill')
    const pendingWaitlist = wrapper.find('[data-status="pending_review_waitlist"].status-pill')
    expect(pending.text()).toContain('待審核')
    expect(pending.classes()).toContain('tone-warn')
    expect(pendingWaitlist.text()).toContain('待審核候補')
    expect(pendingWaitlist.classes()).toContain('tone-info')
    expect(wrapper.text()).not.toContain('pending_review')
  })

  it('payment_status=no_fee（全候補）顯示「免繳」而非「未繳費」', () => {
    // ④ 全候補 total=0 時後端回 no_fee；badge 不可沿用 is_paid 顯示「未繳費」。
    const regs = [
      {
        id: 20,
        student_id: 3,
        student_name: '候補生',
        school_year: 113,
        semester: 1,
        is_paid: false,
        payment_status: 'no_fee',
        courses: [{ course_id: 300, course_name: '陶土', status: 'waitlist' }],
      },
    ]
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations: regs, courseStatusMap: COURSE_STATUS },
    })
    const text = wrapper.text()
    expect(text).toContain('免繳')
    expect(text).not.toContain('未繳費')
  })

  it('payment_status=no_fee StatusPill 帶 tone-neutral', () => {
    const regs = [
      {
        id: 20,
        student_id: 3,
        student_name: '候補生',
        school_year: 113,
        semester: 1,
        is_paid: false,
        payment_status: 'no_fee',
        courses: [{ course_id: 300, course_name: '陶土', status: 'waitlist' }],
      },
    ]
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations: regs, courseStatusMap: COURSE_STATUS },
    })
    const paymentPill = wrapper.find('.payment-pill.status-pill')
    expect(paymentPill.exists()).toBe(true)
    expect(paymentPill.classes()).toContain('tone-neutral')
  })

  it('payment_status=partial 顯示「部分繳費」', () => {
    const regs = [
      {
        id: 21,
        student_id: 4,
        student_name: '部分生',
        school_year: 113,
        semester: 1,
        is_paid: false,
        payment_status: 'partial',
        courses: [{ course_id: 301, course_name: '鋼琴', status: 'enrolled' }],
      },
    ]
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations: regs, courseStatusMap: COURSE_STATUS },
    })
    expect(wrapper.text()).toContain('部分繳費')
  })

  it('refunded_amount>0 顯示「已退費 NT$xxx」（區分退過費歸零 vs 從未繳）', () => {
    const regs = [
      {
        id: 22,
        student_id: 5,
        student_name: '退費生',
        school_year: 113,
        semester: 1,
        is_paid: false,
        payment_status: 'no_fee',
        refunded_amount: 5000,
        courses: [{ course_id: 302, course_name: '美術', status: 'enrolled' }],
      },
    ]
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations: regs, courseStatusMap: COURSE_STATUS },
    })
    expect(wrapper.find('.reg-refunded').exists()).toBe(true)
    expect(wrapper.text()).toContain('已退費 $5,000')
  })

  it('refunded_amount=0 或缺值不顯示「已退費」', () => {
    const regs = [
      {
        id: 23,
        student_id: 6,
        student_name: '一般生',
        school_year: 113,
        semester: 1,
        is_paid: false,
        courses: [{ course_id: 303, course_name: '直排輪', status: 'enrolled' }],
      },
    ]
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations: regs, courseStatusMap: COURSE_STATUS },
    })
    expect(wrapper.find('.reg-refunded').exists()).toBe(false)
  })

  it('根節點帶 id="act-active" 作為 hero 錨點', () => {
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations, courseStatusMap: COURSE_STATUS },
    })
    expect(wrapper.find('#act-active').exists()).toBe(true)
  })

  it('promoted_pending 顯示確認按鈕，點擊 emit confirm-promotion(reg, course)', async () => {
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations, courseStatusMap: COURSE_STATUS },
    })
    const buttons = wrapper.findAll('.confirm-btn')
    expect(buttons).toHaveLength(1)
    await buttons[0].trigger('click')
    const ev = wrapper.emitted('confirm-promotion')
    expect(ev).toBeTruthy()
    expect(ev[0][0]).toEqual(registrations[0])
    expect(ev[0][1]).toEqual(registrations[0].courses[1])
  })

  // 設計審查 2026-07-28：LIFF 端補「放棄候補升位」——原本只有確認鈕，
  // 不想上課的家長只能放到 48h 確認窗過期，名額多卡 48h 才遞補下一位。
  it('promoted_pending 同列顯示放棄按鈕，點擊 emit decline-promotion(reg, course)', async () => {
    const wrapper = mount(RegistrationStatusList, {
      props: { registrations, courseStatusMap: COURSE_STATUS },
    })
    const buttons = wrapper.findAll('.decline-btn')
    expect(buttons).toHaveLength(1)
    await buttons[0].trigger('click')
    const ev = wrapper.emitted('decline-promotion')
    expect(ev).toBeTruthy()
    expect(ev[0][0]).toEqual(registrations[0])
    expect(ev[0][1]).toEqual(registrations[0].courses[1])
  })

  it('confirmingKey 命中該列時，確認與放棄按鈕一併停用（防併發互踩）', () => {
    const wrapper = mount(RegistrationStatusList, {
      props: {
        registrations,
        courseStatusMap: COURSE_STATUS,
        confirmingKey: '10:101',
      },
    })
    expect(wrapper.find('.confirm-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.decline-btn').attributes('disabled')).toBeDefined()
  })
})
