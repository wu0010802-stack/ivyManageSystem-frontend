import { ref } from 'vue'
import { getFaq } from '@/parent/api/assistant'

const STORAGE_KEY = 'parent_faq_v1'

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
    const cached = readCache()
    if (cached) {
      // 先用快取，背景刷新 sessionStorage（不覆寫當前 faq.value）
      faq.value = cached
      getFaq()
        .then((fresh) => {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
        })
        .catch((e) => {
          error.value = e
        })
      return
    }

    loading.value = true
    error.value = null
    try {
      const fresh = await getFaq()
      faq.value = fresh
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh))
    } catch (e) {
      error.value = e
    } finally {
      loading.value = false
    }
  }

  return { faq, loading, error, load }
}
