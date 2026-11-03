/**
 * useSalarySettlement — 月結流程的單一資料來源
 *
 * 工作台（SalaryHubView）與月結嚮導（SalarySettleView 各步驟）共用：
 * - 月狀態推導（deriveStatus）：純函式，從 records 推導，不需後端新欄位
 * - 需注意判斷（detectAnomalies，2026-11-03 起不再與上月比較——業主裁定覆核不看上月差距）：
 *   ① 已停用／已離職仍在名冊（停用且離職日空白，或離職日早於本月）
 *   ② 實領 ≤ 0（主薪轉 base_transfer_amount ≤ 0；保費追溯補收可能使其為負）
 *   ③ 扣款偏高：單項出勤類扣款 ≥ 契約月薪 × heavyPct（預設 10%，約 3 天日薪）。
 *      分母用契約月薪（records 的 contract_base_salary，業主 2026-11-03 裁定）而非折算後的
 *      本月底薪，避免月中到離職者請一天假就被標；舊後端沒帶時退回本月底薪。
 *   ④ 手動調整過
 * - 門檻 per 裝置存 localStorage（業主未要求全園共用，維持後端零修改）；
 *   各園薪資規模不同，門檻本就該 per-tenant，故走 tenantStorage（CT-F-07，
 *   單租戶模式 key 與改造前逐字相同）
 *
 * 注意：records API 的 needs_recalc 以 `breakdown_stale` 欄位外露。
 */
import { ref, computed, watch, type Ref } from 'vue'
import { getRecords } from '@/api/salary'
import { useErrorNotify } from '@/composables/useErrorNotify'
import { tenantGetItem, tenantSetItem } from '@/utils/tenantStorage'
import { computeBaseTransferAmount } from '@/utils/salaryAmounts'
import { pad2 } from '@/utils/format'

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
    /** 後端算好的主薪轉（SalaryRecordItemOut.base_transfer_amount）；畫面經 computeBaseTransferAmount 取用。 */
    base_transfer_amount?: number
    /** 員工資料是否啟用；舊後端未帶時為 undefined（不判停用）。 */
    employee_is_active?: boolean
    /** 員工離職日（ISO）；null＝未填。 */
    employee_resign_date?: string | null
    [key: string]: unknown
}

export type AnomalyReason =
    | { type: 'inactive'; resignDate: string | null }
    | { type: 'zero'; amount: number }
    | { type: 'heavy'; field: string; label: string; amount: number; pct: number }
    | { type: 'manual'; fields: string[] }

export type AnomalyType = AnomalyReason['type']

export type AnomalyMap = Map<string | number, AnomalyReason[]>

export interface Thresholds { heavyPct: number }

export interface SettlementPeriod { year: number; month: number }

export const DEFAULT_THRESHOLDS: Thresholds = Object.freeze({ heavyPct: 0.1 }) as Thresholds
// 新形狀用新 key：舊 `ivy_salary_anomaly_thresholds` 存的是上月差異門檻 {pct, abs}，已不適用
const THRESHOLDS_KEY = 'ivy_salary_review_thresholds'

/** 判「扣款偏高」的出勤類扣款欄（勞健保、勞退、保費追溯是固定或帶號調整，不列入）。 */
export const HEAVY_DEDUCTION_FIELDS: ReadonlyArray<{ key: string; label: string }> = Object.freeze([
    { key: 'absence_deduction', label: '曠職扣款' },
    { key: 'leave_deduction', label: '請假扣款' },
    { key: 'late_deduction', label: '遲到扣款' },
    { key: 'early_leave_deduction', label: '早退扣款' },
    { key: 'missing_punch_deduction', label: '漏打卡扣款' },
    { key: 'other_deduction', label: '其他扣款' },
])

/** 嚴重度：數字小者先處理（排序與 tag 顯示順序共用）。 */
export const ANOMALY_SEVERITY: Record<AnomalyType, number> = {
    inactive: 0,
    zero: 1,
    heavy: 2,
    manual: 3,
}

export function getThresholds(): Thresholds {
    try {
        const raw = tenantGetItem(THRESHOLDS_KEY)
        if (raw) {
            const parsed: unknown = JSON.parse(raw)
            const pct = (parsed as Partial<Thresholds> | null)?.heavyPct
            if (typeof pct === 'number' && Number.isFinite(pct) && pct > 0 && pct <= 1) {
                return { heavyPct: pct }
            }
        }
    } catch {
        // 壞值回預設
    }
    return { ...DEFAULT_THRESHOLDS }
}

export function setThresholds(t: Thresholds): void {
    tenantSetItem(THRESHOLDS_KEY, JSON.stringify(t))
}

export function deriveStatus(records: SettlementRecord[]): SettlementStatus {
    if (records.length === 0) return 'not_calculated'
    if (records.every((r) => r.is_finalized)) return 'finalized'
    if (records.some((r) => !r.is_finalized && r.breakdown_stale)) return 'needs_recalc'
    return 'reviewing'
}

const num = (v: unknown): number => {
    const n = Number(v ?? 0)
    return Number.isFinite(n) ? n : 0
}

/** 已停用／已離職仍在名冊：停用且離職日空白，或離職日早於薪資月份 1 日。 */
function inactiveReason(r: SettlementRecord, period: SettlementPeriod): AnomalyReason | null {
    const resign = r.employee_resign_date ?? null
    const monthStart = `${period.year}-${pad2(period.month)}-01`
    if (resign && resign < monthStart) return { type: 'inactive', resignDate: resign }
    if (r.employee_is_active === false && !resign) return { type: 'inactive', resignDate: null }
    return null
}

function heavyReason(r: SettlementRecord, thresholds: Thresholds): AnomalyReason | null {
    const contract = num(r.contract_base_salary)
    const base = contract > 0 ? contract : num(r.base_salary)
    if (base <= 0) return null // 時薪／無底薪不判（無比例基準）
    let worst: { key: string; label: string; amount: number } | null = null
    for (const f of HEAVY_DEDUCTION_FIELDS) {
        const amount = num(r[f.key])
        if (amount > 0 && amount / base >= thresholds.heavyPct && (!worst || amount > worst.amount)) {
            worst = { key: f.key, label: f.label, amount }
        }
    }
    return worst
        ? { type: 'heavy', field: worst.key, label: worst.label, amount: worst.amount, pct: worst.amount / base }
        : null
}

export function detectAnomalies(
    current: SettlementRecord[],
    thresholds: Thresholds,
    period: SettlementPeriod,
): AnomalyMap {
    const out: AnomalyMap = new Map()
    for (const r of current) {
        const reasons: AnomalyReason[] = []
        const inactive = inactiveReason(r, period)
        if (inactive) reasons.push(inactive)
        const net = computeBaseTransferAmount(r)
        if (net <= 0) reasons.push({ type: 'zero', amount: net })
        const heavy = heavyReason(r, thresholds)
        if (heavy) reasons.push(heavy)
        const overrides = r.manual_overrides ?? []
        if (overrides.length > 0) reasons.push({ type: 'manual', fields: [...overrides] })
        if (reasons.length > 0) out.set(r.employee_id, reasons)
    }
    return out
}

export function sortByAttention(records: SettlementRecord[], anomalies: AnomalyMap): SettlementRecord[] {
    const rank = (r: SettlementRecord): number => {
        const reasons = anomalies.get(r.employee_id)
        if (!reasons || reasons.length === 0) return Number.POSITIVE_INFINITY
        return Math.min(...reasons.map((x) => ANOMALY_SEVERITY[x.type]))
    }
    // Array.prototype.sort 為穩定排序：同嚴重度維持原序
    return records
        .map((r, i) => ({ r, i, k: rank(r) }))
        .sort((a, b) => a.k - b.k || a.i - b.i)
        .map((x) => x.r)
}

export function useSalarySettlement(year: Ref<number>, month: Ref<number>) {
    const { notify } = useErrorNotify()
    const records = ref<SettlementRecord[]>([])
    // 當月載入「失敗」旗標：讓 UI 顯示「本月載入失敗」空狀態，
    // 而非殘留上一個月名冊（新月份標頭 + 舊月份名冊的不同步）
    const currentLoadFailed = ref(false)
    const loading = ref(false)
    const thresholds = ref(getThresholds())

    // 防切月 race：晚到的舊請求不得蓋掉新月資料（epoch 比對）
    let refreshEpoch = 0

    const refresh = async () => {
        const epoch = ++refreshEpoch
        loading.value = true
        try {
            const cur = await getRecords(year.value, month.value)
            if (epoch !== refreshEpoch) return // 已被更新的請求取代
            records.value = (cur.data ?? []) as unknown as SettlementRecord[]
            currentLoadFailed.value = false
        } catch (e) {
            if (epoch !== refreshEpoch) return
            // 當月載入失敗：清空名冊，避免顯示與標頭月份不一致的殘留資料
            // （覆核/定案畫面尤其誤導——操作者會誤以為看到的是新月份的人）
            records.value = []
            currentLoadFailed.value = true
            notify(e, 'useSalarySettlement.refresh', '載入薪資紀錄失敗')
        } finally {
            if (epoch === refreshEpoch) loading.value = false
        }
    }
    watch([year, month], refresh)

    const status = computed(() => deriveStatus(records.value))
    const anomalies = computed(() =>
        detectAnomalies(records.value, thresholds.value, { year: year.value, month: month.value }),
    )
    const sortedRecords = computed(() => sortByAttention(records.value, anomalies.value))
    const finalizedCount = computed(() => records.value.filter((r) => r.is_finalized).length)

    return { records, currentLoadFailed, loading, status, anomalies, sortedRecords, finalizedCount, thresholds, refresh }
}

export type SalarySettlement = ReturnType<typeof useSalarySettlement>
