import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ContactBookHeroSparkle from '@/parent/components/illustrations/ContactBookHeroSparkle.vue'

describe('ContactBookHeroSparkle', () => {
  it('渲染 svg 且 aria-hidden', () => {
    const w = mount(ContactBookHeroSparkle)
    const svg = w.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
  })
})
