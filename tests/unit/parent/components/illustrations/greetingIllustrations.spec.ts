import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import GreetingSunIllustration from '@/parent/components/illustrations/GreetingSunIllustration.vue'
import GreetingMoonIllustration from '@/parent/components/illustrations/GreetingMoonIllustration.vue'

describe('問候插畫元件', () => {
  it('GreetingSunIllustration 渲染 svg 且 aria-hidden', () => {
    const w = mount(GreetingSunIllustration)
    const svg = w.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
  })
  it('GreetingMoonIllustration 渲染 svg 且 aria-hidden', () => {
    const w = mount(GreetingMoonIllustration)
    const svg = w.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
  })
})
