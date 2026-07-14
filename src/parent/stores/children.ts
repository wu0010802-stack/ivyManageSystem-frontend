/**
 * 家長子女清單 store（Pinia）
 *
 * 跨 view 共用，避免每次切換 tab 都重新 fetch。
 * 加綁 / 解綁時可呼叫 invalidate() 強制重撈。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getMyChildren } from '../api/profile'

export const useChildrenStore = defineStore('parentChildren', () => {
  const items = ref<unknown[]>([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref('')
  let requestVersion = 0

  async function load(force = false) {
    if (loading.value) return
    if (loaded.value && !force) return
    const version = ++requestVersion
    loading.value = true
    error.value = ''
    try {
      const { data } = await getMyChildren()
      if (version !== requestVersion) return
      items.value = data?.items || []
      loaded.value = true
    } catch (err) {
      if (version !== requestVersion) return
      error.value = (err as { displayMessage?: string })?.displayMessage || '載入失敗'
    } finally {
      if (version === requestVersion) loading.value = false
    }
  }

  function invalidate() {
    requestVersion += 1
    loaded.value = false
    loading.value = false
  }

  function clear() {
    requestVersion += 1
    items.value = []
    loaded.value = false
    loading.value = false
    error.value = ''
  }

  return { items, loaded, loading, error, load, invalidate, clear }
})
