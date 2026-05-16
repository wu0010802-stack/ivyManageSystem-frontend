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
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
  })

  it('init() 無 localStorage 資料時套用預設 ivy-size-md + light theme', () => {
    useA11yPreference().init()
    expect(document.documentElement.classList.contains('ivy-size-md')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('init() 從 localStorage 讀取已儲存偏好（含 dark theme）', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: 'lg', theme: 'dark', colorBlind: false }))
    useA11yPreference().init()
    expect(document.documentElement.classList.contains('ivy-size-lg')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('store 變動時自動更新 <html> 與 localStorage', async () => {
    useA11yPreference().init()
    const store = useA11yPreferenceStore()
    store.fontSize = 'xl'
    store.theme = 'dark'
    await nextTick()
    expect(document.documentElement.classList.contains('ivy-size-xl')).toBe(true)
    expect(document.documentElement.classList.contains('ivy-size-md')).toBe(false)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(saved.fontSize).toBe('xl')
    expect(saved.theme).toBe('dark')
  })

  it('localStorage 損壞時 fallback 到預設', () => {
    localStorage.setItem(STORAGE_KEY, '{ not valid json')
    useA11yPreference().init()
    expect(document.documentElement.classList.contains('ivy-size-md')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('init() localStorage 含未知值時跳過該欄位，保留預設', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fontSize: 'foo', theme: 'dark' }))
    useA11yPreference().init()
    // fontSize 'foo' 不在白名單 → 維持預設 md
    expect(document.documentElement.classList.contains('ivy-size-md')).toBe(true)
    expect(document.documentElement.classList.contains('ivy-size-foo')).toBe(false)
    // theme 'dark' 在白名單 → 套用
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('reset() 清除類別並回預設', async () => {
    const api = useA11yPreference()
    api.init()
    const store = useA11yPreferenceStore()
    store.fontSize = 'xl'
    store.theme = 'dark'
    await nextTick()
    api.reset()
    await nextTick()
    expect(document.documentElement.classList.contains('ivy-size-md')).toBe(true)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
