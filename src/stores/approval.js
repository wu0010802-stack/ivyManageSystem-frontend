import { defineStore } from 'pinia'
import { getApprovalSummary } from '@/api/home'

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
  }),

  actions: {
    async fetchSummary() {
      try {
        const res = await getApprovalSummary()
        this.pendingTotal = res.data.total || 0
      } catch {
        // silent：badge 數字失效不影響主功能
      }
    },
  },
})
