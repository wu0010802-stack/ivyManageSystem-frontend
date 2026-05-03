/**
 * 教師首頁 dashboard store（含 60s TTL 快取）。
 * 由 PortalHomeView 與相關 widget 共用，避免重複 fetch。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getHomeSummary } from '../api/portalHome'

const TTL_MS = 60_000

export const usePortalDashboardStore = defineStore('portalDashboard', () => {
  const summary = ref(null)
  const lastFetchedAt = ref(0)
  const loading = ref(false)
  const error = ref(null)

  function isFresh() {
    return summary.value && Date.now() - lastFetchedAt.value < TTL_MS
  }

  async function fetchSummary({ force = false } = {}) {
    if (!force && isFresh()) return summary.value
    if (loading.value) return summary.value
    loading.value = true
    error.value = null
    try {
      const { data } = await getHomeSummary()
      summary.value = data
      lastFetchedAt.value = Date.now()
      return data
    } catch (err) {
      error.value = err
      throw err
    } finally {
      loading.value = false
    }
  }

  function invalidate() {
    lastFetchedAt.value = 0
  }

  return {
    summary,
    loading,
    error,
    fetchSummary,
    invalidate,
  }
})
