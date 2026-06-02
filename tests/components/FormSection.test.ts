import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormSection from '@/components/common/FormSection.vue'

describe('FormSection', () => {
  it('collapsible 預設依 defaultOpen 顯示內容', () => {
    const wrapper = mount(FormSection, {
      props: { title: '個資', collapsible: true, defaultOpen: false },
      slots: { default: '<div class="inner">內容</div>' },
    })
    expect(wrapper.find('.inner').exists()).toBe(false)
  })

  it('點標題可展開/收合', async () => {
    const wrapper = mount(FormSection, {
      props: { title: '個資', collapsible: true, defaultOpen: false },
      slots: { default: '<div class="inner">內容</div>' },
    })
    await wrapper.find('.form-section__header').trigger('click')
    expect(wrapper.find('.inner').exists()).toBe(true)
  })

  it('Enter 鍵可展開收合', async () => {
    const wrapper = mount(FormSection, {
      props: { title: '個資', collapsible: true, defaultOpen: false },
      slots: { default: '<div class="inner">內容</div>' },
    })
    await wrapper.find('.form-section__header').trigger('keydown.enter')
    expect(wrapper.find('.inner').exists()).toBe(true)
  })

  it('expand() 強制展開', async () => {
    const wrapper = mount(FormSection, {
      props: { title: '個資', collapsible: true, defaultOpen: false },
      slots: { default: '<div class="inner">內容</div>' },
    })
    ;(wrapper.vm as { expand: () => void }).expand()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.inner').exists()).toBe(true)
  })

  it('badgeCount>0 且 error 型別時顯示紅色徽章', () => {
    const wrapper = mount(FormSection, {
      props: { title: '教保身分', collapsible: true, badgeCount: 2, badgeType: 'error' },
    })
    const badge = wrapper.find('.form-section__badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toContain('2')
    expect(badge.classes()).toContain('is-error')
  })

  it('collapsible=false 時永遠顯示內容、無標題點擊', () => {
    const wrapper = mount(FormSection, {
      props: { title: '核心資料', collapsible: false },
      slots: { default: '<div class="inner">內容</div>' },
    })
    expect(wrapper.find('.inner').exists()).toBe(true)
    expect(wrapper.find('.form-section__header').exists()).toBe(false)
  })
})
