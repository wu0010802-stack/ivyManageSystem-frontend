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

describe('ParentBottomSheet — dismiss', () => {
  it('dismissible=true 點 backdrop emit update:modelValue=false', async () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: true, dismissible: true },
    })
    await wrapper.find('.pt-bsheet-overlay').trigger('click')
    const evts = wrapper.emitted('update:modelValue')
    expect(evts).toBeTruthy()
    expect(evts[0]).toEqual([false])
    wrapper.unmount()
  })

  it('dismissible=false 點 backdrop 不 emit', async () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: true, dismissible: false },
    })
    await wrapper.find('.pt-bsheet-overlay').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    wrapper.unmount()
  })

  it('ESC 鍵在 dismissible=true 時關閉', async () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: true, dismissible: true },
    })
    const dialog = wrapper.find('[role="dialog"]')
    await dialog.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
    wrapper.unmount()
  })

  it('ESC 鍵在 dismissible=false 時不關閉', async () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: true, dismissible: false },
    })
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    wrapper.unmount()
  })
})

describe('ParentBottomSheet — a11y', () => {
  it('開啟時鎖 body overflow，關閉時還原', async () => {
    document.body.style.overflow = ''
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: false },
    })
    await wrapper.setProps({ modelValue: true })
    await new Promise((r) => setTimeout(r, 0))
    expect(document.body.style.overflow).toBe('hidden')

    await wrapper.setProps({ modelValue: false })
    await new Promise((r) => setTimeout(r, 0))
    expect(document.body.style.overflow).toBe('')
    wrapper.unmount()
  })

  it('開啟後焦點移到 dialog 內第一個可 focus 元素', async () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: false },
      slots: { default: '<button class="first-btn">A</button><button class="second-btn">B</button>' },
    })
    await wrapper.setProps({ modelValue: true })
    await new Promise((r) => setTimeout(r, 50))
    expect(document.activeElement?.classList.contains('first-btn')).toBe(true)
    wrapper.unmount()
  })
})

describe('ParentBottomSheet — snap points', () => {
  it('defaultSnap=peek 時 dialog 高度為 30vh', async () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: true, snapPoints: ['peek', 'mid', 'full'], defaultSnap: 'peek' },
    })
    await new Promise((r) => setTimeout(r, 0))
    const dialog = wrapper.find('.pt-bsheet-dialog').element
    expect(dialog.style.getPropertyValue('--pt-bsheet-h')).toBe('30vh')
    wrapper.unmount()
  })

  it('defaultSnap=full 時為 92vh', async () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: true, defaultSnap: 'full' },
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(wrapper.find('.pt-bsheet-dialog').element.style.getPropertyValue('--pt-bsheet-h'))
      .toBe('92vh')
    wrapper.unmount()
  })

  it('呼叫 setSnap("full") 切到 full 並 emit snap-change', async () => {
    const wrapper = mount(ParentBottomSheet, {
      ...mountOpts,
      props: { modelValue: true, snapPoints: ['mid', 'full'], defaultSnap: 'mid' },
    })
    await new Promise((r) => setTimeout(r, 0))
    wrapper.vm.setSnap('full')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.pt-bsheet-dialog').element.style.getPropertyValue('--pt-bsheet-h'))
      .toBe('92vh')
    expect(wrapper.emitted('snap-change')[0]).toEqual(['full'])
    wrapper.unmount()
  })
})
