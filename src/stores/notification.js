import { defineStore } from 'pinia'
import { getNotificationSummary } from '@/api/notifications'

const SUMMARY_TTL_MS = 10_000
let inflightSummaryRequest = null

function findActionItem(summary, type) {
  return (summary?.action_items || []).find((item) => item.type === type)
}

export const useNotificationStore = defineStore('notification', {
  state: () => ({
    summary: {
      total_badge: 0,
      action_items: [],
      reminders: [],
    },
    loading: false,
    error: '',
    lastFetchedAt: 0,
  }),

  getters: {
    badgeCount: (state) => state.summary?.total_badge || 0,
    actionItems: (state) => state.summary?.action_items || [],
    reminders: (state) => state.summary?.reminders || [],
    approvalCount: (state) => findActionItem(state.summary, 'approval')?.count || 0,
    activityInquiryCount: (state) => findActionItem(state.summary, 'activity_inquiry')?.count || 0,
    approvalSummary: (state) => {
      const approval = findActionItem(state.summary, 'approval')
      const breakdown = approval?.breakdown || {}
      return {
        pending_leaves: breakdown.leaves || 0,
        pending_overtimes: breakdown.overtimes || 0,
        pending_punch_corrections: breakdown.punch_corrections || 0,
        total: approval?.count || 0,
        this_month_pending_leaves: breakdown.this_month_pending_leaves || 0,
        this_month_pending_overtimes: breakdown.this_month_pending_overtimes || 0,
      }
    },
  },

  actions: {
    async fetchSummary({ force = false } = {}) {
      if (!force && this.lastFetchedAt && Date.now() - this.lastFetchedAt < SUMMARY_TTL_MS) {
        return this.summary
      }

      if (inflightSummaryRequest) {
        return inflightSummaryRequest
      }

      this.loading = true
      this.error = ''

      inflightSummaryRequest = getNotificationSummary()
        .then((res) => {
          this.summary = {
            total_badge: res.data?.total_badge || 0,
            action_items: Array.isArray(res.data?.action_items) ? res.data.action_items : [],
            reminders: Array.isArray(res.data?.reminders) ? res.data.reminders : [],
          }
          this.lastFetchedAt = Date.now()
          return this.summary
        })
        .catch((error) => {
          this.error = error?.response?.data?.detail || error?.message || '通知載入失敗'
          return this.summary
        })
        .finally(() => {
          this.loading = false
          inflightSummaryRequest = null
        })

      return inflightSummaryRequest
    },
  },
})
