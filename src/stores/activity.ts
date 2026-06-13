import { defineStore } from 'pinia'
import {
  getActivityStats,
  getActivityStatsCharts,
  getActivityStatsSummary,
  type ActivityTermParams,
} from '@/api/activity'

const SUMMARY_TTL_MS = 15_000
const CHARTS_TTL_MS = 60_000
const ATTENDANCE_TTL_MS = 60_000

// 學期快取 key：未指定學期（後端自動套當前學期）以空字串表示
const termKeyOf = ({ school_year, semester }: ActivityTermParams = {}) =>
  school_year != null && semester != null ? `${school_year}-${semester}` : ''

const termParamsOf = ({ school_year, semester }: ActivityTermParams = {}): ActivityTermParams =>
  school_year != null && semester != null ? { school_year, semester } : {}

// inflight dedupe 以學期 key 區分：切學期時不可回收前一學期的 in-flight 結果
interface InflightEntry {
  key: string
  promise: Promise<unknown>
}
let inflightSummary: InflightEntry | null = null
let inflightCharts: InflightEntry | null = null
let inflightAttendance: InflightEntry | null = null

interface FetchOptions extends ActivityTermParams {
  force?: boolean
}

/**
 * 課後才藝 store
 *
 * 主要用途：
 * - AdminSidebar 顯示家長提問未讀 badge
 * - ActivityDashboardView 取得統計資料（summary / charts / attendance 皆學期感知，
 *   快取以學期 key 區分，切學期自動失效）
 */
export const useActivityStore = defineStore('activity', {
  state: () => ({
    unreadInquiries: 0,
    summary: null,
    charts: null,
    attendance: null,
    summaryTermKey: '',
    chartsTermKey: '',
    attendanceTermKey: '',
    lastSummaryFetchedAt: 0,
    lastChartsFetchedAt: 0,
    lastAttendanceFetchedAt: 0,
    loadingSummary: false,
    loadingCharts: false,
    loadingAttendance: false,
    error: '',
  }),

  getters: {
    stats: (state) => ({
      statistics: state.summary || null,
      charts: state.charts || null,
      attendance_stats: state.attendance || null,
    }),
  },

  actions: {
    async fetchSummary({ force = false, school_year, semester }: FetchOptions = {}) {
      const termKey = termKeyOf({ school_year, semester })
      if (
        !force &&
        this.summaryTermKey === termKey &&
        this.lastSummaryFetchedAt &&
        Date.now() - this.lastSummaryFetchedAt < SUMMARY_TTL_MS
      ) {
        return this.summary
      }

      if (inflightSummary && inflightSummary.key === termKey) {
        return inflightSummary.promise
      }

      this.loadingSummary = true
      this.error = ''
      const entry: InflightEntry = { key: termKey, promise: Promise.resolve() }
      entry.promise = getActivityStatsSummary(termParamsOf({ school_year, semester }))
        .then((res) => {
          // 僅最新一筆請求可 commit，避免切學期競態讓舊學期回應覆寫新學期
          if (inflightSummary !== entry) return this.summary
          this.summary = res.data
          this.unreadInquiries = res.data?.unreadInquiries || 0
          this.summaryTermKey = termKey
          this.lastSummaryFetchedAt = Date.now()
          return this.summary
        })
        .catch((err) => {
          this.error = err?.message || '載入課後才藝摘要失敗'
          return this.summary
        })
        .finally(() => {
          if (inflightSummary === entry) {
            this.loadingSummary = false
            inflightSummary = null
          }
        })
      inflightSummary = entry

      return entry.promise
    },

    async fetchCharts({ force = false, school_year, semester }: FetchOptions = {}) {
      const termKey = termKeyOf({ school_year, semester })
      if (
        !force &&
        this.chartsTermKey === termKey &&
        this.lastChartsFetchedAt &&
        Date.now() - this.lastChartsFetchedAt < CHARTS_TTL_MS
      ) {
        return this.charts
      }

      if (inflightCharts && inflightCharts.key === termKey) {
        return inflightCharts.promise
      }

      this.loadingCharts = true
      const entry: InflightEntry = { key: termKey, promise: Promise.resolve() }
      entry.promise = getActivityStatsCharts(termParamsOf({ school_year, semester }))
        .then((res) => {
          if (inflightCharts !== entry) return this.charts
          this.charts = res.data
          this.chartsTermKey = termKey
          this.lastChartsFetchedAt = Date.now()
          return this.charts
        })
        .catch((err) => {
          this.error = err?.message || '載入課後才藝圖表失敗'
          return this.charts
        })
        .finally(() => {
          if (inflightCharts === entry) {
            this.loadingCharts = false
            inflightCharts = null
          }
        })
      inflightCharts = entry

      return entry.promise
    },

    async fetchAttendanceStats({ force = false, school_year, semester }: FetchOptions = {}) {
      const termKey = termKeyOf({ school_year, semester })
      if (
        !force &&
        this.attendanceTermKey === termKey &&
        this.lastAttendanceFetchedAt &&
        Date.now() - this.lastAttendanceFetchedAt < ATTENDANCE_TTL_MS
      ) {
        return this.attendance
      }

      if (inflightAttendance && inflightAttendance.key === termKey) {
        return inflightAttendance.promise
      }

      this.loadingAttendance = true
      const entry: InflightEntry = { key: termKey, promise: Promise.resolve() }
      // 出席率沒有獨立端點：後端契約為 GET /activity/stats 聚合回應的頂層 key attendance_stats
      entry.promise = getActivityStats(termParamsOf({ school_year, semester }))
        .then((res) => {
          if (inflightAttendance !== entry) return this.attendance
          this.attendance = res.data?.attendance_stats ?? null
          this.attendanceTermKey = termKey
          this.lastAttendanceFetchedAt = Date.now()
          return this.attendance
        })
        .catch((err) => {
          // 出席率統計為輔助區塊：載入失敗不擋 dashboard 其他區塊（區塊 v-if 自然隱藏）
          this.error = err?.message || '載入課程出席率統計失敗'
          return this.attendance
        })
        .finally(() => {
          if (inflightAttendance === entry) {
            this.loadingAttendance = false
            inflightAttendance = null
          }
        })
      inflightAttendance = entry

      return entry.promise
    },
  },
})
