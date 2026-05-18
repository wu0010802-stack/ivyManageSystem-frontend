/**
 * 家長 App 無障礙偏好（字級 / 高對比）composable。
 *
 * 偏好項目：
 *  - fontSize: 'sm' | 'md' | 'lg' | 'xl'（預設 'md' = 100%）
 *  - highContrast: boolean（預設 false）
 *
 * 透過 <html class="ivy-size-* [ivy-contrast-high]"> 套用，由
 * src/assets/a11y.css 解析；對應的 token 變動會傳染所有 component。
 *
 * 與 useTheme 是分離兩個偏好（亮/暗 vs 字級/對比可正交組合）。
 *
 * 寫入 localStorage:
 *  - parent-font-size
 *  - parent-high-contrast
 */
import { onMounted, ref } from 'vue'

const SIZE_KEY = 'parent-font-size'
const HC_KEY = 'parent-high-contrast'
const VALID_SIZES = new Set(['sm', 'md', 'lg', 'xl'])

const fontSize = ref(loadFontSize())
const highContrast = ref(loadHighContrast())

function loadFontSize() {
  if (typeof localStorage === 'undefined') return 'md'
  const v = localStorage.getItem(SIZE_KEY)
  return VALID_SIZES.has(v) ? v : 'md'
}

function loadHighContrast() {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(HC_KEY) === '1'
}

function applyToDOM() {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  // 移除舊 size class
  for (const c of Array.from(html.classList)) {
    if (c.startsWith('ivy-size-')) html.classList.remove(c)
  }
  html.classList.add(`ivy-size-${fontSize.value}`)
  html.classList.toggle('ivy-contrast-high', highContrast.value)
}

/** App boot 時呼叫一次（main.js 用），確保第一次 paint 就有正確設定 */
export function initA11y() {
  applyToDOM()
}

export function useA11y() {
  function setFontSize(size) {
    if (!VALID_SIZES.has(size)) return
    fontSize.value = size
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SIZE_KEY, size)
    }
    applyToDOM()
  }

  function setHighContrast(enabled) {
    highContrast.value = !!enabled
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HC_KEY, enabled ? '1' : '0')
    }
    applyToDOM()
  }

  function toggleHighContrast() {
    setHighContrast(!highContrast.value)
  }

  // 確保 mount 時 DOM 與 state 同步（SSR / hydration 場景安全網）
  onMounted(() => {
    applyToDOM()
  })

  return {
    fontSize, // ref<'sm'|'md'|'lg'|'xl'>
    highContrast, // ref<boolean>
    setFontSize,
    setHighContrast,
    toggleHighContrast,
  }
}
