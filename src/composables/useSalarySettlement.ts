/**
 * useSalarySettlement — 月結流程的單一資料來源
 *
 * 工作台（SalaryHubView）與月結嚮導（SalarySettleView 各步驟）共用：
 * - 月狀態推導（deriveStatus）：純函式，從 records 推導，不需後端新欄位
 * - 異常偵測（detectAnomalies）：與上月差異 ≥ pct 或 ≥ abs、手動調整過、本月新進
 * - 門檻 per 裝置存 localStorage（業主未要求全園共用，維持後端零修改）
 *
 * 注意：records API 的 needs_recalc 以 `breakdown_stale` 欄位外露。
 */
import { ref, computed, watch, type Ref } from 'vue'
import { getRecords } from '@/api/salary'
import { useErrorNotify } from '@/composables/useErrorNotify'

export type SettlementStatus = 'not_calculated' | 'needs_recalc' | 'reviewing' | 'finalized'

export interface SettlementRecord {
    id: number
    employee_id: string | number
    employee_name: string
    version: number
    gross_salary: number
    net_salary: number
    is_finalized: boolean
    breakdown_stale: boolean
    manual_overrides: string[]
    [key: string]: unknown
}

export type AnomalyReason =
    | { type: 'diff'; field: 'net_salary' | 'gross_salary'; pct: number; abs: number }
    | { type: 'manual' }
    | { type: 'new' }

export type AnomalyMap = Map<string | number, AnomalyReason[]>

export interface Thresholds { pct: number; abs: number }

export const DEFAULT_THRESHOLDS: Thresholds = { pct: 0.1, abs: 3000 }
const THRESHOLDS_KEY = 'ivy_salary_anomaly_thresholds'
const MONITORED_FIELDS = ['net_salary', 'gross_salary'] as const

export function getThresholds(): Thresholds {
    try {
        const raw = localStorage.getItem(THRESHOLDS_KEY)
        if (raw) {
            const parsed: unknown = JSON.parse(raw)
            if (
                typeof parsed === 'object' && parsed !== null &&
                typeof (parsed as Thresholds).pct === 'number' &&
                typeof (parsed as Thresholds).abs === 'number'
            ) {
                return parsed as Thresholds
            }
        }
    } catch {
        // 壞值回預設
    }
    return { ...DEFAULT_THRESHOLDS }
}

export function setThresholds(t: Thresholds): void {
    localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(t))
}

export function deriveStatus(records: SettlementRecord[]): SettlementStatus {
    if (records.length === 0) return 'not_calculated'
    if (records.every((r) => r.is_finalized)) return 'finalized'
    if (records.some((r) => !r.is_finalized && r.breakdown_stale)) return 'needs_recalc'
    return 'reviewing'
}

export function detectAnomalies(
    current: SettlementRecord[],
    previous: SettlementRecord[],
    thresholds: Thresholds,
): AnomalyMap {
    const out: AnomalyMap = new Map()
    const push = (id: string | number, reason: AnomalyReason) => {
        const list = out.get(id)
        if (list) list.push(reason)
        else out.set(id, [reason])
    }
    const prevById = new Map(previous.map((r) => [r.employee_id, r]))
    for (const cur of current) {
        if ((cur.manual_overrides ?? []).length > 0) push(cur.employee_id, { type: 'manual' })
        if (previous.length === 0) continue // 系統首月：無比較基準，不報 diff/new
        const prev = prevById.get(cur.employee_id)
        if (!prev) {
            push(cur.employee_id, { type: 'new' })
            continue
        }
        for (const field of MONITORED_FIELDS) {
            const a = Number(cur[field] ?? 0)
            const b = Number(prev[field] ?? 0)
            const abs = Math.abs(a - b)
            const pct = b !== 0 ? abs / Math.abs(b) : a !== 0 ? 1 : 0
            if (pct >= thresholds.pct || abs >= thresholds.abs) {
                push(cur.employee_id, { type: 'diff', field, pct, abs })
            }
        }
    }
    return out
}

export function sortByAttention(records: SettlementRecord[], anomalies: AnomalyMap): SettlementRecord[] {
    const flagged = records.filter((r) => anomalies.has(r.employee_id))
    const normal = records.filter((r) => !anomalies.has(r.employee_id))
    return [...flagged, ...normal]
}

export function useSalarySettlement(year: Ref<number>, month: Ref<number>) {
    const { notify } = useErrorNotify()
    const records = ref<SettlementRecord[]>([])
    const prevRecords = ref<SettlementRecord[]>([])
    // 上月載入「失敗」（500/網路錯誤）≠ 上月「真無資料」——
    // 前者異常比較靜默失效，覆核 banner 須區分以免漏看月差
    const prevLoadFailed = ref(false)
    const loading = ref(false)
    const thresholds = ref(getThresholds())

    // 防切月 race：晚到的舊請求不得蓋掉新月資料（epoch 比對）
    let refreshEpoch = 0

    const refresh = async () => {
        const epoch = ++refreshEpoch
        loading.value = true
        try {
            const prevY = month.value === 1 ? year.value - 1 : year.value
            const prevM = month.value === 1 ? 12 : month.value - 1
            let prevFailed = false
            const [cur, prev] = await Promise.all([
                getRecords(year.value, month.value),
                // 上月載入失敗（首月/權限邊界）不擋本月流程，異常比較自動降級
                getRecords(prevY, prevM).catch(() => {
                    prevFailed = true
                    return { data: [] as unknown[] }
                }),
            ])
            if (epoch !== refreshEpoch) return // 已被更新的請求取代
            records.value = (cur.data ?? []) as unknown as SettlementRecord[]
            prevRecords.value = ((prev as { data: unknown[] }).data ?? []) as unknown as SettlementRecord[]
            prevLoadFailed.value = prevFailed
        } catch (e) {
            if (epoch !== refreshEpoch) return
            notify(e, 'useSalarySettlement.refresh', '載入薪資紀錄失敗')
        } finally {
            if (epoch === refreshEpoch) loading.value = false
        }
    }
    watch([year, month], refresh)

    const status = computed(() => deriveStatus(records.value))
    const anomalies = computed(() => detectAnomalies(records.value, prevRecords.value, thresholds.value))
    const sortedRecords = computed(() => sortByAttention(records.value, anomalies.value))
    const finalizedCount = computed(() => records.value.filter((r) => r.is_finalized).length)

    return { records, prevRecords, prevLoadFailed, loading, status, anomalies, sortedRecords, finalizedCount, thresholds, refresh }
}

export type SalarySettlement = ReturnType<typeof useSalarySettlement>
