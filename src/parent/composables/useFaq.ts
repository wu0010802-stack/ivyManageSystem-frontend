import { ref } from 'vue'
import { getFaq } from '@/parent/api/assistant'

const STORAGE_KEY = 'parent_faq_v1'
let cacheGeneration = 0

export function clearFaqCache(): void {
  cacheGeneration += 1
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore disabled storage */
  }
}

export function useFaq() {
  const faq = ref<unknown>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)

  function readCache() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  async function load() {
    const generation = cacheGeneration
    const cached = readCache()
    if (cached) {
      // 先用快取，背景刷新 sessionStorage（不覆寫當前 faq.value）
      faq.value = cached
      getFaq()
        .then((fresh) => {
          if (generation === cacheGeneration) {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
          }
        })
        .catch((e) => {
          if (generation === cacheGeneration) error.value = e
        })
      return
    }

    loading.value = true
    error.value = null
    try {
      const fresh = await getFaq()
      if (generation !== cacheGeneration) return
      faq.value = fresh
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
    } catch (e) {
      if (generation === cacheGeneration) error.value = e
    } finally {
      if (generation === cacheGeneration) loading.value = false
    }
  }

  return { faq, loading, error, load }
}
