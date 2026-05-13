/**
 * 教師端 Cmd+K 全 portal 共享狀態 + 全域鍵盤 listener。
 *
 * 用法：
 *   - 在 PortalLayout.vue 一次 mount：installPortalSearchKeyboard()
 *   - 在任何元件取狀態 / 觸發開關：const { isOpen, openPalette, closePalette } = usePortalSearch()
 *
 * isOpen 是 module-scoped ref，跨元件共享。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

const isOpen = ref(false)

export function usePortalSearch() {
  function openPalette() {
    isOpen.value = true
  }
  function closePalette() {
    isOpen.value = false
  }
  return { isOpen, openPalette, closePalette }
}

export function installPortalSearchKeyboard() {
  function onKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      isOpen.value = true
    }
  }
  onMounted(() => document.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
}
