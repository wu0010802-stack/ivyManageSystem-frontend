import { defineStore } from 'pinia'
import {
  getActivityStats,
  getActivityStatsCharts,
  getActivityStatsSummary,
  getActivityDashboardTable,
  type ActivityTermParams,
} from '@/api/activity'
import type { ApiResponse } from '@/api/_generated/typed'

// 後端契約型別（codegen）：summary/charts/attendance state 由 unknown 改為具名型別。
type ActivitySummary = ApiResponse<'/activity/stats-summary', 'get'>
type ActivityCharts = ApiResponse<'/activity/stats-charts', 'get'>
type ActivityAttendance = ApiResponse<'/activity/stats', 'get'>['attendance_stats']
type ActivityDashboardTable = ApiResponse<'/activity/dashboard-table', 'get'>

const SUMMARY_TTL_MS = 15_000
const CHARTS_TTL_MS = 60_000
const ATTENDANCE_TTL_MS = 60_000
// dashboard 統計表沿用 charts 的 60s TTL（同屬重型聚合，更新頻率相近）
const DASHBOARD_TABLE_TTL_MS = 60_000

// 出席率沒有獨立端點：後端契約為 GET /activity/stats 聚合回應，出席率在頂層 key
type ActivityStatsResponse = ApiResponse<'/activity/stats', 'get'>

// 學期快取 key：未指定學期（後端自動套當前學期）以空字串表示
const termKeyOf = ({ school_year, semester }: ActivityTermParams = {}) =>
  school_year != null && semester != null ? `${school_year}-${semester}` : ''

const termParamsOf = ({ school_year, semester }: ActivityTermParams = {}): ActivityTermParams =>
  school_year != null && semester != null ? { school_year, semester } : {}

// inflight dedupe 以學期 key 區分：切學期時不可回收前一學期的 in-flight 結果
interface InflightEntry<TData> {
  key: string
  promise: Promise<TData>
}
// 每個 fetcher 的 module-level in-flight 指標，以可變 slot 包裝供共用引擎讀寫
interface InflightSlot<TData> {
  current: InflightEntry<TData> | null
}
const summarySlot: InflightSlot<ActivitySummary | null> = { current: null }
const chartsSlot: InflightSlot<ActivityCharts | null> = { current: null }
const attendanceSlot: InflightSlot<ActivityAttendance | null> = { current: null }
const dashboardTableSlot: InflightSlot<ActivityDashboardTable | null> = { current: null }

interface FetchOptions extends ActivityTermParams {
  force?: boolean
}

/**
 * 學期感知 fetcher 共用引擎：一次封裝 term-key 快取命中 + in-flight 去重 +
 * 切學期競態守衛（requestedTermKey / slot 指標）+ commit / catch / finally。
 * summary / charts / attendance / dashboardTable 四個 action 僅以下方 config 差異化
 * （state 欄位存取子、apiFn、TTL、error 訊息、commit 邏輯），race / dedupe 語意
 * 四者完全一致——抽出後行為與原四份 copy-paste 等價。
 *
 * TApi  = API 回應 body 型別（commit 的輸入）
 * TData = state 儲存 / 回傳的資料型別（多數 == TApi，attendance 為其子欄位）
 */
interface TermFetchConfig<TApi, TData> {
  ttl: number
  errorMsg: string
  /** 僅 summary 為 true：發送前清空共享 error（保留原始各 action 差異，其餘不清） */
  clearErrorOnStart?: boolean
  slot: InflightSlot<TData>
  apiFn: (params: ActivityTermParams) => Promise<{ data: TApi }>
  /** 成功且為最新請求時提交資料（設定 data 欄位與衍生 side effect） */
  commit: (data: TApi) => void
  /** 已快取資料（cache-hit / 競態守衛落地時回傳） */
  readData: () => TData
  getCommittedTermKey: () => string
  setCommittedTermKey: (key: string) => void
  getRequestedTermKey: () => string
  setRequestedTermKey: (key: string) => void
  getLastFetchedAt: () => number
  setLastFetchedAt: (ts: number) => void
  setLoading: (loading: boolean) => void
  setError: (message: string) => void
}

function runTermFetch<TApi, TData>(
  opts: FetchOptions,
  config: TermFetchConfig<TApi, TData>,
): Promise<TData> {
  const { force = false, school_year, semester } = opts
  const termKey = termKeyOf({ school_year, semester })
  const { slot } = config

  config.setRequestedTermKey(termKey)

  const lastFetchedAt = config.getLastFetchedAt()
  if (
    !force &&
    config.getCommittedTermKey() === termKey &&
    lastFetchedAt &&
    Date.now() - lastFetchedAt < config.ttl
  ) {
    config.setLoading(false)
    return Promise.resolve(config.readData())
  }

  if (slot.current && slot.current.key === termKey) {
    return slot.current.promise
  }

  config.setLoading(true)
  if (config.clearErrorOnStart) config.setError('')

  const entry: InflightEntry<TData> = {
    key: termKey,
    promise: Promise.resolve(config.readData()),
  }
  entry.promise = config
    .apiFn(termParamsOf({ school_year, semester }))
    .then((res) => {
      // 僅最新一筆請求可 commit，避免切學期競態讓舊學期回應覆寫新學期
      if (slot.current !== entry || config.getRequestedTermKey() !== termKey) {
        return config.readData()
      }
      config.commit(res.data)
      config.setCommittedTermKey(termKey)
      config.setLastFetchedAt(Date.now())
      return config.readData()
    })
    .catch((err: { message?: string }) => {
      if (config.getRequestedTermKey() === termKey) {
        config.setError(err?.message || config.errorMsg)
      }
      return config.readData()
    })
    .finally(() => {
      if (slot.current === entry) {
        config.setLoading(false)
        slot.current = null
      }
    })
  slot.current = entry

  return entry.promise
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
    summary: null as ActivitySummary | null,
    charts: null as ActivityCharts | null,
    attendance: null as ActivityAttendance | null,
    dashboardTable: null as ActivityDashboardTable | null,
    summaryTermKey: '',
    chartsTermKey: '',
    attendanceTermKey: '',
    dashboardTableTermKey: '',
    // 「目前畫面最後要求的學期」與已落地 cache term 分開。A 已快取、B pending、
    // 再切回 A 時雖不會再打 API，仍須把 A 記為最新目標，讓 B 晚回被丟棄。
    summaryRequestedTermKey: '',
    chartsRequestedTermKey: '',
    attendanceRequestedTermKey: '',
    dashboardTableRequestedTermKey: '',
    lastSummaryFetchedAt: 0,
    lastChartsFetchedAt: 0,
    lastAttendanceFetchedAt: 0,
    lastDashboardTableFetchedAt: 0,
    loadingSummary: false,
    loadingCharts: false,
    loadingAttendance: false,
    loadingDashboardTable: false,
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
    async fetchSummary(opts: FetchOptions = {}) {
      return runTermFetch<ActivitySummary, ActivitySummary | null>(opts, {
        ttl: SUMMARY_TTL_MS,
        errorMsg: '載入課後才藝摘要失敗',
        clearErrorOnStart: true,
        slot: summarySlot,
        apiFn: getActivityStatsSummary,
        commit: (data) => {
          this.summary = data
          this.unreadInquiries = data?.unreadInquiries || 0
        },
        readData: () => this.summary,
        getCommittedTermKey: () => this.summaryTermKey,
        setCommittedTermKey: (key) => {
          this.summaryTermKey = key
        },
        getRequestedTermKey: () => this.summaryRequestedTermKey,
        setRequestedTermKey: (key) => {
          this.summaryRequestedTermKey = key
        },
        getLastFetchedAt: () => this.lastSummaryFetchedAt,
        setLastFetchedAt: (ts) => {
          this.lastSummaryFetchedAt = ts
        },
        setLoading: (loading) => {
          this.loadingSummary = loading
        },
        setError: (message) => {
          this.error = message
        },
      })
    },

    async fetchCharts(opts: FetchOptions = {}) {
      return runTermFetch<ActivityCharts, ActivityCharts | null>(opts, {
        ttl: CHARTS_TTL_MS,
        errorMsg: '載入課後才藝圖表失敗',
        slot: chartsSlot,
        apiFn: getActivityStatsCharts,
        commit: (data) => {
          this.charts = data
        },
        readData: () => this.charts,
        getCommittedTermKey: () => this.chartsTermKey,
        setCommittedTermKey: (key) => {
          this.chartsTermKey = key
        },
        getRequestedTermKey: () => this.chartsRequestedTermKey,
        setRequestedTermKey: (key) => {
          this.chartsRequestedTermKey = key
        },
        getLastFetchedAt: () => this.lastChartsFetchedAt,
        setLastFetchedAt: (ts) => {
          this.lastChartsFetchedAt = ts
        },
        setLoading: (loading) => {
          this.loadingCharts = loading
        },
        setError: (message) => {
          this.error = message
        },
      })
    },

    async fetchAttendanceStats(opts: FetchOptions = {}) {
      // 出席率沒有獨立端點：後端契約為 GET /activity/stats 聚合回應的頂層 key attendance_stats
      return runTermFetch<ActivityStatsResponse, ActivityAttendance | null>(opts, {
        ttl: ATTENDANCE_TTL_MS,
        // 出席率統計為輔助區塊：載入失敗不擋 dashboard 其他區塊（區塊 v-if 自然隱藏）
        errorMsg: '載入課程出席率統計失敗',
        slot: attendanceSlot,
        apiFn: getActivityStats,
        commit: (data) => {
          this.attendance = data?.attendance_stats ?? null
        },
        readData: () => this.attendance,
        getCommittedTermKey: () => this.attendanceTermKey,
        setCommittedTermKey: (key) => {
          this.attendanceTermKey = key
        },
        getRequestedTermKey: () => this.attendanceRequestedTermKey,
        setRequestedTermKey: (key) => {
          this.attendanceRequestedTermKey = key
        },
        getLastFetchedAt: () => this.lastAttendanceFetchedAt,
        setLastFetchedAt: (ts) => {
          this.lastAttendanceFetchedAt = ts
        },
        setLoading: (loading) => {
          this.loadingAttendance = loading
        },
        setError: (message) => {
          this.error = message
        },
      })
    },

    async fetchDashboardTable(opts: FetchOptions = {}) {
      return runTermFetch<ActivityDashboardTable, ActivityDashboardTable | null>(opts, {
        ttl: DASHBOARD_TABLE_TTL_MS,
        errorMsg: '載入課後才藝統計表失敗',
        slot: dashboardTableSlot,
        apiFn: getActivityDashboardTable,
        commit: (data) => {
          this.dashboardTable = data
        },
        readData: () => this.dashboardTable,
        getCommittedTermKey: () => this.dashboardTableTermKey,
        setCommittedTermKey: (key) => {
          this.dashboardTableTermKey = key
        },
        getRequestedTermKey: () => this.dashboardTableRequestedTermKey,
        setRequestedTermKey: (key) => {
          this.dashboardTableRequestedTermKey = key
        },
        getLastFetchedAt: () => this.lastDashboardTableFetchedAt,
        setLastFetchedAt: (ts) => {
          this.lastDashboardTableFetchedAt = ts
        },
        setLoading: (loading) => {
          this.loadingDashboardTable = loading
        },
        setError: (message) => {
          this.error = message
        },
      })
    },
  },
})
