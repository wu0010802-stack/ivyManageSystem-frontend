import { watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useA11yPreferenceStore } from '@/stores/a11yPreference'

const STORAGE_KEY = 'ivy.a11y'
const SIZE_CLASSES = ['ivy-size-sm', 'ivy-size-md', 'ivy-size-lg', 'ivy-size-xl']
const VALID_SIZES = ['sm', 'md', 'lg', 'xl']
const VALID_CONTRASTS = ['normal', 'high']

let initialized = false

export function _resetForTests() {
  initialized = false
}

/**
 * 無障礙偏好 composable
 *
 * 用法：在 main.js `app.use(pinia)` 之後、`app.mount()` 之前呼叫
 *   useA11yPreference().init()
 *
 * init() 會：
 *   1. 從 localStorage 讀回偏好（損壞則 fallback 預設）
 *   2. 套用對應的 class 到 <html>
 *   3. 註冊 watch：往後 store 變動會自動 persist + 重新套用 class
 */
export function useA11yPreference() {
  const store = useA11yPreferenceStore()
  const refs = storeToRefs(store)

  function applyToDom() {
    const html = document.documentElement
    SIZE_CLASSES.forEach((c) => html.classList.remove(c))
    html.classList.add(`ivy-size-${store.fontSize}`)
    html.classList.toggle('ivy-contrast-high', store.contrast === 'high')
    html.classList.toggle('ivy-cb-safe', store.colorBlind)
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store.$state))
    } catch {
      // 無痕模式 / quota 滿 — 不影響主流程
    }
  }

  function init() {
    if (initialized) return
    initialized = true
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          if (VALID_SIZES.includes(parsed.fontSize)) store.fontSize = parsed.fontSize
          if (VALID_CONTRASTS.includes(parsed.contrast)) store.contrast = parsed.contrast
          if (typeof parsed.colorBlind === 'boolean') store.colorBlind = parsed.colorBlind
        }
      }
    } catch {
      // JSON parse 失敗，留用預設
    }
    applyToDom()
    watch(
      () => ({ ...store.$state }),
      () => {
        persist()
        applyToDom()
      },
      { deep: true }
    )
  }

  return {
    init,
    reset: () => store.reset(),
    ...refs,
  }
}
