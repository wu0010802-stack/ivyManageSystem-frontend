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
  const items = ref([])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref('')

  async function load(force = false) {
    if (loading.value) return
    if (loaded.value && !force) return
    loading.value = true
    error.value = ''
    try {
      const { data } = await getMyChildren()
      items.value = data?.items || []
      loaded.value = true
    } catch (err) {
      error.value = err?.displayMessage || '載入失敗'
    } finally {
      loading.value = false
    }
  }

  function invalidate() {
    loaded.value = false
  }

  return { items, loaded, loading, error, load, invalidate }
})
