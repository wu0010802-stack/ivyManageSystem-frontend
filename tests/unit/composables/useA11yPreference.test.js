import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useA11yPreference, _resetForTests } from '@/composables/useA11yPreference'
import { useA11yPreferenceStore } from '@/stores/a11yPreference'

const STORAGE_KEY = 'ivy.a11y'

describe('useA11yPreference', () => {
  beforeEach(() => {
    _resetForTests()
    setActivePinia(createPinia())
    document.documentElement.className = ''
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.documentElement.className = ''
  })

  it('init() 無 localStorage 資料時套用預設 ivy-size-md', () => {
    useA11yPreference().init()
    expect(document.documentElement.classList.contains('ivy-size-md')).toBe(true)
    expect(document.documentElement.classList.contains('ivy-contrast-high')).toBe(false)
  })

  it('init() 從 localStorage 讀取已儲存偏好', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: 'lg', contrast: 'high', colorBlind: false }))
    useA11yPreference().init()
    expect(document.documentElement.classList.contains('ivy-size-lg')).toBe(true)
    expect(document.documentElement.classList.contains('ivy-contrast-high')).toBe(true)
  })

  it('store 變動時自動更新 <html> 與 localStorage', async () => {
    useA11yPreference().init()
    const store = useA11yPreferenceStore()
    store.fontSize = 'xl'
    await nextTick()
    expect(document.documentElement.classList.contains('ivy-size-xl')).toBe(true)
    expect(document.documentElement.classList.contains('ivy-size-md')).toBe(false)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(saved.fontSize).toBe('xl')
  })

  it('localStorage 損壞時 fallback 到預設', () => {
    localStorage.setItem(STORAGE_KEY, '{ not valid json')
    useA11yPreference().init()
    expect(document.documentElement.classList.contains('ivy-size-md')).toBe(true)
  })

  it('init() localStorage 含未知值時跳過該欄位，保留預設', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: 'foo', contrast: 'high' }))
    useA11yPreference().init()
    // fontSize 'foo' 不在白名單 → 維持預設 md
    expect(document.documentElement.classList.contains('ivy-size-md')).toBe(true)
    expect(document.documentElement.classList.contains('ivy-size-foo')).toBe(false)
    // contrast 'high' 在白名單 → 套用
    expect(document.documentElement.classList.contains('ivy-contrast-high')).toBe(true)
  })

  it('reset() 清除類別並回預設', async () => {
    const api = useA11yPreference()
    api.init()
    const store = useA11yPreferenceStore()
    store.fontSize = 'xl'
    store.contrast = 'high'
    await nextTick()
    api.reset()
    await nextTick()
    expect(document.documentElement.classList.contains('ivy-size-md')).toBe(true)
    expect(document.documentElement.classList.contains('ivy-contrast-high')).toBe(false)
  })
})
