import { defineStore } from 'pinia'
import { getNotificationSummary } from '@/api/notifications'

const SUMMARY_TTL_MS = 10_000
let inflightSummaryRequest: Promise<unknown> | null = null

function findActionItem(summary: { action_items?: { type: string; count?: number; breakdown?: Record<string, number> }[] } | null, type: string) {
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
    // 才藝報名待審核積壓量（AdminSidebar「報名管理」badge），比照 activityInquiryCount
    // 走 action_items（後端 type='activity_pending_review'）。
    activityPendingReviewCount: (state) => findActionItem(state.summary, 'activity_pending_review')?.count || 0,
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
    // 明確標註回傳型別：force 分支會遞迴呼叫 this.fetchSummary（chain 在 in-flight 之後），
    // 自我參照下 TS 無法推導回傳型別（TS7023），須顯式標註。呼叫端皆 fire-and-forget 不取用形狀。
    async fetchSummary({ force = false } = {}): Promise<unknown> {
      if (!force && this.lastFetchedAt && Date.now() - this.lastFetchedAt < SUMMARY_TTL_MS) {
        return this.summary
      }

      if (inflightSummaryRequest) {
        // 非強制：沿用 in-flight 去重。
        // 強制（force=true，如簽核後刷新徽章）：不可回傳「簽核前」的 in-flight promise，
        // 否則徽章不會即時遞減；改排在現行 in-flight 之後再抓一次最新，
        // 順序保證讓強制刷新的結果最後落地（避免與舊請求競態）。
        if (!force) return inflightSummaryRequest
        return inflightSummaryRequest.then(() => this.fetchSummary({ force: true }))
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
