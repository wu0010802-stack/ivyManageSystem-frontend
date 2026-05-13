import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { usePortalSearch, installPortalSearchKeyboard } from '@/composables/usePortalSearch'

describe('usePortalSearch', () => {
  beforeEach(() => {
    const { isOpen } = usePortalSearch()
    isOpen.value = false
  })

  it('openPalette sets isOpen true', () => {
    const { isOpen, openPalette } = usePortalSearch()
    expect(isOpen.value).toBe(false)
    openPalette()
    expect(isOpen.value).toBe(true)
  })

  it('closePalette sets isOpen false', () => {
    const { isOpen, openPalette, closePalette } = usePortalSearch()
    openPalette()
    closePalette()
    expect(isOpen.value).toBe(false)
  })
})

describe('installPortalSearchKeyboard', () => {
  let wrapper

  afterEach(() => {
    if (wrapper) wrapper.unmount()
    const { isOpen } = usePortalSearch()
    isOpen.value = false
  })

  function makeHost() {
    return defineComponent({
      setup() {
        installPortalSearchKeyboard()
      },
      render() {
        return h('div')
      },
    })
  }

  it('Cmd+K opens palette', async () => {
    wrapper = mount(makeHost(), { attachTo: document.body })
    const e = new KeyboardEvent('keydown', { key: 'k', metaKey: true })
    document.dispatchEvent(e)
    await nextTick()
    const { isOpen } = usePortalSearch()
    expect(isOpen.value).toBe(true)
  })

  it('Ctrl+K opens palette', async () => {
    wrapper = mount(makeHost(), { attachTo: document.body })
    const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })
    document.dispatchEvent(e)
    await nextTick()
    const { isOpen } = usePortalSearch()
    expect(isOpen.value).toBe(true)
  })

  it('plain k does not open', async () => {
    wrapper = mount(makeHost(), { attachTo: document.body })
    const e = new KeyboardEvent('keydown', { key: 'k' })
    document.dispatchEvent(e)
    await nextTick()
    const { isOpen } = usePortalSearch()
    expect(isOpen.value).toBe(false)
  })
})
