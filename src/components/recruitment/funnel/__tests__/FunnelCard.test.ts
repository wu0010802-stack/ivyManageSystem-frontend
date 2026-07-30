import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FunnelCard from '../FunnelCard.vue'

const baseCard = {
  visit_id: 1,
  child_name: '王小寶',
  grade: '中班',
  phone: '0912345678',
  district: '中正區',
  source: '介紹',
  current_stage: 'visited' as const,
}

describe('FunnelCard.vue', () => {
  it('renders child name + grade + phone', () => {
    const wrapper = mount(FunnelCard, { props: { card: baseCard, canDrag: true } })
    expect(wrapper.text()).toContain('王小寶')
    expect(wrapper.text()).toContain('中班')
    expect(wrapper.text()).toContain('0912345678')
  })

  it('shows student_id badge when present', () => {
    const wrapper = mount(FunnelCard, {
      props: { card: { ...baseCard, student_id: 42 }, canDrag: true },
    })
    expect(wrapper.text()).toContain('42')
  })

  it('omits student_id badge when null', () => {
    const wrapper = mount(FunnelCard, { props: { card: baseCard, canDrag: true } })
    expect(wrapper.find('.student-id-badge').exists()).toBe(false)
  })

  it('applies pending class when isPending=true', () => {
    const wrapper = mount(FunnelCard, {
      props: { card: baseCard, canDrag: true, isPending: true },
    })
    expect(wrapper.classes()).toContain('funnel-card--pending')
  })

  it('emits click event', async () => {
    const wrapper = mount(FunnelCard, { props: { card: baseCard, canDrag: true } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })

  it('shows enrollment term badge when target year+semester present', () => {
    const wrapper = mount(FunnelCard, {
      props: {
        card: { ...baseCard, target_school_year: 114, target_semester: 2 },
        canDrag: true,
      },
    })
    expect(wrapper.text()).toContain('114下')
    expect(wrapper.find('.funnel-card__term').exists()).toBe(true)
  })

  it('omits enrollment term badge when semester missing', () => {
    const wrapper = mount(FunnelCard, {
      props: { card: { ...baseCard, target_school_year: 114 }, canDrag: true },
    })
    expect(wrapper.find('.funnel-card__term').exists()).toBe(false)
  })

  it('renders 退註冊 danger tag + reason when withdrawn_from is enrolled', () => {
    const wrapper = mount(FunnelCard, {
      props: {
        card: {
          ...baseCard,
          current_stage: 'withdrawn',
          withdrawn_from: 'enrolled',
          withdraw_reason: '家長退註冊費',
        },
        canDrag: true,
      },
    })
    expect(wrapper.text()).toContain('退註冊')
    expect(wrapper.find('.el-tag--danger').exists()).toBe(true)
    expect(wrapper.text()).toContain('家長退註冊費')
  })

  it('renders 退預繳 tag when withdrawn_from is deposited', () => {
    const wrapper = mount(FunnelCard, {
      props: {
        card: {
          ...baseCard,
          current_stage: 'withdrawn',
          withdrawn_from: 'deposited',
          withdraw_reason: '家長取消保留',
        },
        canDrag: true,
      },
    })
    expect(wrapper.text()).toContain('退預繳')
    expect(wrapper.find('.el-tag--danger').exists()).toBe(true)
  })
})
