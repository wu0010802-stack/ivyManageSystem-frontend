import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RunningLoader from '@/components/common/RunningLoader.vue'

describe('RunningLoader', () => {
  it('active=false 時不渲染 overlay', () => {
    const wrapper = mount(RunningLoader, { props: { active: false } })
    expect(wrapper.find('.running-loader').exists()).toBe(false)
  })

  it('active=true 時渲染 overlay、label、sprite', async () => {
    const wrapper = mount(RunningLoader, {
      props: { active: true, label: '載入中…' },
    })
    await nextTick()
    expect(wrapper.find('.running-loader').exists()).toBe(true)
    expect(wrapper.find('.running-loader__sprite').exists()).toBe(true)
    expect(wrapper.text()).toContain('載入中…')
  })

  it('variant 切換 sprite src', async () => {
    const wrapper = mount(RunningLoader, { props: { active: true, variant: 2 } })
    await nextTick()
    const img = wrapper.find('.running-loader__sprite')
    expect(img.attributes('src')).toBe('/images/loading-runner-2.gif')

    await wrapper.setProps({ variant: 3 })
    expect(wrapper.find('.running-loader__sprite').attributes('src')).toBe(
      '/images/loading-runner-3.gif',
    )
  })

  it('opacity 注入到 backdrop background', async () => {
    const wrapper = mount(RunningLoader, { props: { active: true, opacity: 0.7 } })
    await nextTick()
    const style = wrapper.find('.running-loader').attributes('style') || ''
    expect(style).toMatch(/rgba\(15,\s*23,\s*42,\s*0\.7\)/)
  })

  it('speed 注入到 sprite animation-duration', async () => {
    const wrapper = mount(RunningLoader, { props: { active: true, speed: 5 } })
    await nextTick()
    const style = wrapper.find('.running-loader__sprite').attributes('style') || ''
    expect(style).toContain('animation-duration: 5s')
  })

  it('label 空字串時不渲染 label 元素', async () => {
    const wrapper = mount(RunningLoader, { props: { active: true, label: '' } })
    await nextTick()
    expect(wrapper.find('.running-loader__label').exists()).toBe(false)
  })
})
