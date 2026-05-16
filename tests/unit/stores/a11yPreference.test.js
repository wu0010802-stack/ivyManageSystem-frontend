import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useA11yPreferenceStore } from '@/stores/a11yPreference'

describe('a11yPreference store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('預設值為 fontSize=md / theme=light / colorBlind=false', () => {
    const store = useA11yPreferenceStore()
    expect(store.fontSize).toBe('md')
    expect(store.theme).toBe('light')
    expect(store.colorBlind).toBe(false)
  })

  it('可以更新 fontSize', () => {
    const store = useA11yPreferenceStore()
    store.fontSize = 'lg'
    expect(store.fontSize).toBe('lg')
  })

  it('reset() 把所有偏好回到預設', () => {
    const store = useA11yPreferenceStore()
    store.fontSize = 'xl'
    store.theme = 'dark'
    store.colorBlind = true
    store.reset()
    expect(store.fontSize).toBe('md')
    expect(store.theme).toBe('light')
    expect(store.colorBlind).toBe(false)
  })
})
