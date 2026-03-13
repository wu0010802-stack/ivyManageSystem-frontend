import { defineStore } from 'pinia'
import { getActivityStats, getActivityStatsCharts, getActivityStatsSummary } from '@/api/activity'

const SUMMARY_TTL_MS = 15_000
const CHARTS_TTL_MS = 60_000
let inflightSummaryRequest = null
let inflightChartsRequest = null

/**
 * 課後才藝 store
 *
 * 主要用途：
 * - AdminSidebar 顯示家長提問未讀 badge
 * - ActivityDashboardView 取得統計資料
 */
export const useActivityStore = defineStore('activity', {
  state: () => ({
    unreadInquiries: 0,
    summary: null,
    charts: null,
    lastSummaryFetchedAt: 0,
    lastChartsFetchedAt: 0,
  }),

  getters: {
    stats: (state) => ({
      statistics: state.summary || null,
      charts: state.charts || null,
    }),
  },

  actions: {
    async fetchSummary({ force = false } = {}) {
      if (!force && this.lastSummaryFetchedAt && Date.now() - this.lastSummaryFetchedAt < SUMMARY_TTL_MS) {
        return this.summary
      }

      if (inflightSummaryRequest) {
        return inflightSummaryRequest
      }

      inflightSummaryRequest = getActivityStatsSummary()
        .then((res) => {
          this.summary = res.data
          this.unreadInquiries = res.data?.unreadInquiries || 0
          this.lastSummaryFetchedAt = Date.now()
          return this.summary
        })
        .catch(() => {
          return this.summary
        })
        .finally(() => {
          inflightSummaryRequest = null
        })

      return inflightSummaryRequest
    },

    async fetchCharts({ force = false } = {}) {
      if (!force && this.lastChartsFetchedAt && Date.now() - this.lastChartsFetchedAt < CHARTS_TTL_MS) {
        return this.charts
      }

      if (inflightChartsRequest) {
        return inflightChartsRequest
      }

      inflightChartsRequest = getActivityStatsCharts()
        .then((res) => {
          this.charts = res.data
          this.lastChartsFetchedAt = Date.now()
          return this.charts
        })
        .catch(() => this.charts)
        .finally(() => {
          inflightChartsRequest = null
        })

      return inflightChartsRequest
    },

    async fetchStats({ force = false } = {}) {
      if (!force && this.summary && this.charts &&
        this.lastSummaryFetchedAt && Date.now() - this.lastSummaryFetchedAt < SUMMARY_TTL_MS &&
        this.lastChartsFetchedAt && Date.now() - this.lastChartsFetchedAt < CHARTS_TTL_MS) {
        return this.stats
      }

      await Promise.all([
        this.fetchSummary({ force }),
        this.fetchCharts({ force }),
      ])
      return this.stats
    },

    async fetchLegacyStats({ force = false } = {}) {
      const res = await getActivityStats()
      this.summary = res.data?.statistics || null
      this.charts = res.data?.charts || null
      this.unreadInquiries = res.data?.statistics?.unreadInquiries || 0
      this.lastSummaryFetchedAt = Date.now()
      this.lastChartsFetchedAt = Date.now()
      return res.data
    },
  },
})
