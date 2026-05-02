/**
 * 家長 App 主題切換 composable。
 *
 * 三種偏好（preference）：
 *  - 'system'：跟隨 OS prefers-color-scheme（預設）
 *  - 'light'：強制亮色
 *  - 'dark'：強制深色
 *
 * 寫入 localStorage 'parent-theme'；應用方式為 <html data-theme="...">。
 *
 * 為什麼自寫不用 vueuse？
 *  - 只需 3 個值的偏好，import vueuse 太重
 *  - 與 design tokens 緊密結合（dark 變體在 globals.css）
 */
import { computed, ref, onMounted, onUnmounted } from 'vue'

const STORAGE_KEY = 'parent-theme'
const VALID = new Set(['system', 'light', 'dark'])

// 全 app 共享 reactive state（多元件呼叫 useTheme 拿到同一個值）
const preference = ref(loadPreference())

function loadPreference() {
  if (typeof localStorage === 'undefined') return 'system'
  const v = localStorage.getItem(STORAGE_KEY)
  return VALID.has(v) ? v : 'system'
}

function getSystemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyToDOM(pref) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (pref === 'system') {
    root.removeAttribute('data-theme')
    return
  }
  root.setAttribute('data-theme', pref)
}

/**
 * App boot 階段呼叫一次（main.js 用）；確保第一次 paint 就有正確 theme。
 * 也綁定系統 prefers-color-scheme 變化的監聽（system 偏好下會自動跟隨）。
 */
export function initTheme() {
  applyToDOM(preference.value)
}

export function useTheme() {
  // 計算當前實際模式（system 時看 OS 偏好）
  const effective = computed(() => {
    if (preference.value !== 'system') return preference.value
    return getSystemPrefersDark() ? 'dark' : 'light'
  })

  function setPreference(next) {
    if (!VALID.has(next)) return
    preference.value = next
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, next)
    }
    applyToDOM(next)
  }

  // 在元件中監聽 system 變化（preference=system 時會 reactive 更新 effective）
  let mql = null
  let onChange = null
  onMounted(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    mql = window.matchMedia('(prefers-color-scheme: dark)')
    onChange = () => {
      // 觸發 effective recompute（透過 ref 再賦值同值不會 trigger，需用 trick）
      if (preference.value === 'system') {
        // 透過重新賦值同值 + nextTick 強制 effective recompute；
        // 簡單做法：把 ref 設為非自身再設回。
        const v = preference.value
        preference.value = ''
        preference.value = v
      }
    }
    mql.addEventListener?.('change', onChange)
  })

  onUnmounted(() => {
    if (mql && onChange) mql.removeEventListener?.('change', onChange)
  })

  return {
    preference, // ref<'system' | 'light' | 'dark'>
    effective, // computed<'light' | 'dark'>
    setPreference,
  }
}
