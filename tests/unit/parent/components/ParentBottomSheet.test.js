import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ParentBottomSheet from '@/parent/components/ParentBottomSheet.vue'

// 元件使用 <Teleport to="body">，預設情況下 wrapper.find 找不到 teleported 內容（會跑到 body 而非 wrapper 子樹）。
// stub teleport 讓內容 inline 渲染，方便 wrapper.find / wrapper.html 斷言。
const mountOpts = {
  global: { stubs: { teleport: true } },
  attachTo: document.body,
}

describe('ParentBottomSheet — basic render', () => {
  it('modelValue=false 時不渲染 dialog', () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: false },
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('modelValue=true 時渲染 dialog 含 title 與 default slot 內容', () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: true, title: '測試標題' },
      slots: { default: '<p class="body-text">本文</p>' },
    })
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.html()).toContain('測試標題')
    expect(wrapper.find('.body-text').exists()).toBe(true)
    wrapper.unmount()
  })

  it('提供 header / footer slot 時優先採用 slot 而非 title prop', () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: true, title: 'fallback' },
      slots: {
        header: '<h2 class="custom-header">自訂表頭</h2>',
        footer: '<button class="custom-footer">送出</button>',
      },
    })
    expect(wrapper.find('.custom-header').exists()).toBe(true)
    expect(wrapper.html()).not.toContain('fallback')
    expect(wrapper.find('.custom-footer').exists()).toBe(true)
    wrapper.unmount()
  })
})
