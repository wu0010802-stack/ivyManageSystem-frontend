import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import M3TopAppBar from '../M3TopAppBar.vue'

describe('M3TopAppBar', () => {
  it('render title', () => {
    const w = mount(M3TopAppBar, { props: { title: '訊息' } })
    expect(w.text()).toContain('訊息')
    expect(w.find('.m3-top-app-bar-title').exists()).toBe(true)
  })

  it('預設 variant = small', () => {
    const w = mount(M3TopAppBar, { props: { title: 'x' } })
    expect(w.classes()).toContain('m3-top-app-bar')
    expect(w.classes()).toContain('m3-top-app-bar-small')
  })

  it.each(['center-aligned', 'small', 'large'])(
    'variant=%s 套對應 class',
    (variant) => {
      const w = mount(M3TopAppBar, { props: { title: 'x', variant } })
      expect(w.classes()).toContain(`m3-top-app-bar-${variant}`)
    },
  )

  it('預設不顯示 back 按鈕', () => {
    const w = mount(M3TopAppBar, { props: { title: 'x' } })
    expect(w.find('.m3-top-app-bar-back').exists()).toBe(false)
  })

  it('showBack=true 顯示 back 按鈕並可點擊觸發 onBack', async () => {
    const onBack = vi.fn()
    const w = mount(M3TopAppBar, {
      props: { title: 'x', showBack: true, onBack },
    })
    const back = w.find('.m3-top-app-bar-back')
    expect(back.exists()).toBe(true)
    await back.trigger('click')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('actions slot 渲染在右側', () => {
    const w = mount(M3TopAppBar, {
      props: { title: 'x' },
      slots: { actions: '<button class="custom-action">A</button>' },
    })
    expect(w.find('.custom-action').exists()).toBe(true)
    expect(w.find('.m3-top-app-bar-actions').exists()).toBe(true)
  })

  it('leading slot 覆蓋預設 back 按鈕', () => {
    const w = mount(M3TopAppBar, {
      props: { title: 'x', showBack: true },
      slots: { leading: '<span class="custom-leading">★</span>' },
    })
    expect(w.find('.custom-leading').exists()).toBe(true)
    expect(w.find('.m3-top-app-bar-back').exists()).toBe(false)
  })
})
