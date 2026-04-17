import { ref, computed, watch } from 'vue'

const STORAGE_KEY = 'admin_pinned_pages'
const MAX_PINNED = 10

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(item => item && item.path && item.title) : []
  } catch {
    return []
  }
}

const pinnedPages = ref(loadFromStorage())

watch(pinnedPages, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // 忽略 localStorage 寫入失敗
  }
}, { deep: true })

export function usePinnedPages() {
  const isPinned = (path) => pinnedPages.value.some(p => p.path === path)

  const pin = (path, title) => {
    if (!path || !title) return
    if (isPinned(path)) return
    if (pinnedPages.value.length >= MAX_PINNED) {
      pinnedPages.value.shift()
    }
    pinnedPages.value.push({ path, title })
  }

  const unpin = (path) => {
    pinnedPages.value = pinnedPages.value.filter(p => p.path !== path)
  }

  const togglePin = (path, title) => {
    isPinned(path) ? unpin(path) : pin(path, title)
  }

  return {
    pinnedPages: computed(() => pinnedPages.value),
    isPinned,
    pin,
    unpin,
    togglePin,
  }
}
