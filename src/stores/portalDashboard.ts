/**
 * 教師首頁 dashboard store（含 60s TTL 快取）。
 * 由 PortalHomeView 與相關 widget 共用，避免重複 fetch。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getHomeSummary } from '../api/portalHome'

const TTL_MS = 60_000

export const usePortalDashboardStore = defineStore('portalDashboard', () => {
  const summary = ref<unknown>(null)
  const lastFetchedAt = ref(0)
  const loading = ref(false)
  const error = ref<unknown>(null)

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
    // summary 含學生過敏/用藥/缺席等 PII；登出時（共享平板）必須一併清成 null，
    // 否則 lastFetchedAt 歸零後 summary 仍殘留可讀，下一位登入者 render tick 可見。
    summary.value = null
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
