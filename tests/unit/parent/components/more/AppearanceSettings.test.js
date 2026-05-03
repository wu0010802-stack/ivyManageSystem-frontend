import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

// Stub composables：避免 onMounted 副作用碰 document/localStorage、且能精準斷言呼叫
const themeState = vi.hoisted(() => ({
  preference: { value: 'system' },
  setPreference: vi.fn(),
}))
const a11yState = vi.hoisted(() => ({
  fontSize: { value: 'md' },
  highContrast: { value: false },
  setFontSize: vi.fn(),
  setHighContrast: vi.fn(),
}))

vi.mock('@/parent/composables/useTheme', () => ({
  useTheme: () => themeState,
}))
vi.mock('@/parent/composables/useA11y', () => ({
  useA11y: () => a11yState,
}))

import AppearanceSettings from '@/parent/components/more/AppearanceSettings.vue'

describe('AppearanceSettings', () => {
  beforeEach(() => {
    themeState.preference = ref('system')
    themeState.setPreference.mockReset()
    a11yState.fontSize = ref('md')
    a11yState.highContrast = ref(false)
    a11yState.setFontSize.mockReset()
    a11yState.setHighContrast.mockReset()
  })

  it('渲染外觀 + 無障礙兩個 group，含 3 個 theme + 4 個 size + hc toggle', () => {
    const wrapper = mount(AppearanceSettings)
    expect(wrapper.text()).toContain('外觀')
    expect(wrapper.text()).toContain('無障礙')
    expect(wrapper.findAll('.theme-btn')).toHaveLength(3)
    expect(wrapper.findAll('.size-btn')).toHaveLength(4)
    expect(wrapper.find('.hc-toggle').exists()).toBe(true)
  })

  it('當前 themePref / fontSize / highContrast 顯示 active', () => {
    themeState.preference = ref('dark')
    a11yState.fontSize = ref('lg')
    a11yState.highContrast = ref(true)
    const wrapper = mount(AppearanceSettings)
    const themeButtons = wrapper.findAll('.theme-btn')
    // theme order: system / light / dark
    expect(themeButtons[2].classes()).toContain('active')
    expect(themeButtons[2].attributes('aria-checked')).toBe('true')

    const sizeButtons = wrapper.findAll('.size-btn')
    // size order: sm / md / lg / xl
    expect(sizeButtons[2].classes()).toContain('active')

    expect(wrapper.find('.hc-toggle').classes()).toContain('active')
    expect(wrapper.find('.hc-toggle').attributes('aria-checked')).toBe('true')
  })

  it('點擊 theme btn 呼叫 setTheme(key)', async () => {
    const wrapper = mount(AppearanceSettings)
    const buttons = wrapper.findAll('.theme-btn')
    await buttons[1].trigger('click') // light
    expect(themeState.setPreference).toHaveBeenCalledWith('light')
  })

  it('點擊 size btn 呼叫 setFontSize(key)', async () => {
    const wrapper = mount(AppearanceSettings)
    const buttons = wrapper.findAll('.size-btn')
    await buttons[3].trigger('click') // xl
    expect(a11yState.setFontSize).toHaveBeenCalledWith('xl')
  })

  it('點擊 hc toggle 呼叫 setHighContrast(!current)', async () => {
    a11yState.highContrast = ref(false)
    const wrapper = mount(AppearanceSettings)
    await wrapper.find('.hc-toggle').trigger('click')
    expect(a11yState.setHighContrast).toHaveBeenCalledWith(true)
  })
})
