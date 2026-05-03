import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PushCta from '@/parent/components/home/PushCta.vue'

const stubs = { ParentIcon: true }

describe('PushCta', () => {
  it('渲染暖色提醒卡與標題文字', () => {
    const wrapper = mount(PushCta, { global: { stubs } })
    expect(wrapper.find('.push-cta').exists()).toBe(true)
    expect(wrapper.text()).toContain('尚未加 LINE 為好友')
    expect(wrapper.text()).toContain('前往設定')
  })

  it('列出五項收不到推播的通知類型', () => {
    const wrapper = mount(PushCta, { global: { stubs } })
    const items = wrapper.findAll('.push-cta-list li')
    expect(items.length).toBe(5)
  })

  it('點擊「前往設定」按鈕會 emit enable', async () => {
    const wrapper = mount(PushCta, { global: { stubs } })
    await wrapper.find('.push-cta-btn').trigger('click')
    expect(wrapper.emitted('enable')).toBeTruthy()
    expect(wrapper.emitted('enable').length).toBe(1)
  })
})
