import { defineStore } from 'pinia'
import { useNotificationStore } from '@/stores/notification'

const SUMMARY_TTL_MS = 10_000
let inflightSummaryRequest = null

/**
 * 審核待辦計數 store
 *
 * 主要用途：
 * - AdminLayout 每次路由切換後呼叫 fetchSummary() 更新 sidebar badge
 * - ApprovalView 核准/駁回後呼叫 fetchSummary() 同步 badge（無需重整頁面）
 */
export const useApprovalStore = defineStore('approval', {
  state: () => ({
    pendingTotal: 0,
    lastFetchedAt: 0,
  }),

  actions: {
    async fetchSummary({ force = false } = {}) {
      if (!force && this.lastFetchedAt && Date.now() - this.lastFetchedAt < SUMMARY_TTL_MS) {
        return this.pendingTotal
      }

      if (inflightSummaryRequest) {
        return inflightSummaryRequest
      }

      const notificationStore = useNotificationStore()

      inflightSummaryRequest = notificationStore.fetchSummary({ force })
        .then(() => {
          this.pendingTotal = notificationStore.approvalCount || 0
          this.lastFetchedAt = Date.now()
          return this.pendingTotal
        })
        .catch(() => {
          // silent：badge 數字失效不影響主功能
          return this.pendingTotal
        })
        .finally(() => {
          inflightSummaryRequest = null
        })

      return inflightSummaryRequest
    },
  },
})
