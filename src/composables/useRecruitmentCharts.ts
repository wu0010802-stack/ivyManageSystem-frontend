import { computed } from 'vue'
import { GRADES_ORDER } from '@/constants/recruitment'

type MonthRow = { month: string; visit: number; deposit: number; enrolled?: number; visit_to_deposit_rate?: number; visit_to_enrolled_rate?: number; effective_to_enrolled_rate?: number }
type GradeRow = { grade: string; visit: number; deposit: number }
type SourceRow = { source: string; visit: number; deposit: number }
type ReferrerRow = { referrer: string; visit: number; deposit: number }
type ChuannianExpectedRow = { expected_month: string; deposit: number; visit: number }
type ChuannianGradeRow = { grade: string; deposit: number; visit: number }
type NoDepositReasonRow = { reason: string; count: number; by_grade?: Record<string, number> }
type DistrictRow = { district: string; lead_count_90d?: number; deposit_rate_90d?: number }

type StatsShape = {
  monthly: MonthRow[]
  by_grade: GradeRow[]
  month_grade: Record<string, Record<string, unknown>>
  by_source: SourceRow[]
  by_referrer: ReferrerRow[]
  chuannian_visit?: number
  chuannian_deposit?: number
  chuannian_by_expected?: ChuannianExpectedRow[]
  chuannian_by_grade?: ChuannianGradeRow[]
  no_deposit_reasons?: NoDepositReasonRow[]
}

type MarketSnapshotShape = {
  districts?: DistrictRow[]
}

/**
 * 招生入學統計分析所有圖表的資料與設定 computed。
 *
 * 輸入：
 *  - stats:          useRecruitmentDashboard().stats（Ref<object>）
 *  - marketSnapshot: useRecruitmentArea().marketSnapshot（Ref<object>）
 *  - drillToDetail:  callback(patch) 當使用者點選月度/班別/來源柱時觸發
 *
 * 回傳：所有 chart data / chart options computed，供 template 直接綁定。
 */

const shortPeriodLabel = (name: string) => {
  const m = name.match(/(\d{3}\.\d{2})\.\d{2}[~-](\d{3}\.\d{2})\.\d{2}/)
  return m ? `${m[1]}~${m[2]}` : name.slice(0, 12)
}

const truncateChartLabel = (label: unknown, max = 12) =>
  typeof label === 'string' && label.length > max ? `${label.slice(0, max)}…` : label

/** 來源/接待人員可能是空字串（歷史資料未填），圖表與排名 label 統一顯示「未填寫」 */
export const displayChartLabel = (label: string) => (label && label.trim() ? label : '未填寫')

const extractChartValue = (context: Record<string, unknown>) => {
  const parsed = context?.parsed as Record<string, number> | number | undefined
  if (typeof parsed === 'number') return parsed
  if (parsed && typeof parsed.y === 'number') return parsed.y
  if (parsed && typeof parsed.x === 'number') return parsed.x
  return Number(context?.raw ?? 0)
}

const formatPercentTooltip = (context: Record<string, unknown>) => {
  const dataset = context?.dataset as Record<string, unknown> | undefined
  const label = dataset?.label ? `${dataset.label}: ` : ''
  const value = Number(extractChartValue(context) ?? 0)
  return `${label}${value.toFixed(1)}%`
}

const percentTickFormatter = (value: unknown) => `${value}%`

const commonChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
}

/** 人數類 bar 圖共通：整數刻度（人數不出現 0.2/0.4 小數格線）＋限制 bar 厚度（單筆資料不變巨型色塊） */
const COUNT_BAR_DATASET = { bar: { maxBarThickness: 36 } }

const barOptions = {
  ...commonChartOptions,
  datasets: COUNT_BAR_DATASET,
  scales: { y: { ticks: { precision: 0 } } },
  plugins: { legend: { position: 'top' } },
}

const horizBarOptions = {
  ...commonChartOptions,
  indexAxis: 'y',
  datasets: COUNT_BAR_DATASET,
  scales: { x: { ticks: { precision: 0 } } },
  plugins: { legend: { display: false } },
}

const percentBarOptions = {
  ...barOptions,
  scales: {
    y: { min: 0, max: 100, ticks: { callback: percentTickFormatter } },
  },
  plugins: {
    ...barOptions.plugins,
    tooltip: { callbacks: { label: formatPercentTooltip } },
  },
}

const percentHorizBarOptions = {
  ...horizBarOptions,
  scales: {
    x: { min: 0, max: 100, ticks: { callback: percentTickFormatter } },
  },
  plugins: {
    ...horizBarOptions.plugins,
    tooltip: { callbacks: { label: formatPercentTooltip } },
  },
}

const lineOptions = {
  ...commonChartOptions,
  plugins: { legend: { position: 'top' } },
}

const percentLineOptions = {
  ...lineOptions,
  scales: {
    y: { min: 0, max: 100, ticks: { callback: percentTickFormatter } },
  },
  plugins: {
    ...lineOptions.plugins,
    tooltip: { callbacks: { label: formatPercentTooltip } },
  },
}

const noDepositGradeBarOptions = {
  ...barOptions,
  scales: {
    x: {
      ticks: {
        callback(value: unknown) {
          return truncateChartLabel((this as unknown as { getLabelForValue: (v: unknown) => string }).getLabelForValue(value))
        },
        maxRotation: 0,
        minRotation: 0,
      },
    },
    // 覆寫整份 scales，y 軸整數刻度須在此重申
    y: { ticks: { precision: 0 } },
  },
}

const doughnutOptions = {
  ...commonChartOptions,
  plugins: { legend: { position: 'bottom' } },
}

export function useRecruitmentCharts({ stats, marketSnapshot, drillToDetail }: {
  stats: { value: StatsShape }
  marketSnapshot: { value: MarketSnapshotShape }
  drillToDetail?: ((patch: Record<string, unknown>) => void) | null
}) {
  // -------- 月度圖表 --------
  const monthlyTableData = computed(() => stats.value.monthly)

  const monthlyBarData = computed(() => {
    const data = stats.value.monthly
    if (!data.length) return null
    return {
      labels: data.map((m) => m.month),
      datasets: [
        { label: '參觀人數', data: data.map((m) => m.visit), backgroundColor: '#74c69d', borderRadius: 4 },
        { label: '預繳人數', data: data.map((m) => m.deposit), backgroundColor: '#40916c', borderRadius: 4 },
        { label: '註冊人數', data: data.map((m) => m.enrolled ?? 0), backgroundColor: '#1d4ed8', borderRadius: 4 },
      ],
    }
  })

  const monthlyRateData = computed(() => {
    const data = stats.value.monthly
    if (!data.length) return null
    return {
      labels: data.map((m) => m.month),
      datasets: [
        {
          label: '參觀→預繳率 (%)',
          data: data.map((m) => m.visit_to_deposit_rate ?? 0),
          borderColor: '#40916c',
          backgroundColor: 'rgba(64,145,108,0.15)',
          tension: 0.3,
          fill: false,
        },
        {
          label: '參觀→註冊率 (%)',
          data: data.map((m) => m.visit_to_enrolled_rate ?? 0),
          borderColor: '#1d4ed8',
          backgroundColor: 'rgba(29,78,216,0.15)',
          tension: 0.3,
          fill: false,
        },
        {
          label: '排除轉期→註冊率 (%)',
          data: data.map((m) => m.effective_to_enrolled_rate ?? 0),
          borderColor: '#e76f51',
          backgroundColor: 'rgba(231,111,81,0.15)',
          tension: 0.3,
          fill: false,
        },
      ],
    }
  })

  type ChartClickArgs = [_ev: unknown, elements: { index: number }[], chart: { data: { labels: unknown[] } }]

  const monthlyBarOptions = computed(() => ({
    ...barOptions,
    onClick: (...[_ev, elements, chart]: ChartClickArgs) => {
      if (!elements.length) return
      drillToDetail?.({ month: chart.data.labels[elements[0].index] })
    },
  }))

  const classBarOptions = computed(() => ({
    ...barOptions,
    onClick: (...[_ev, elements, chart]: ChartClickArgs) => {
      if (!elements.length) return
      drillToDetail?.({ grade: chart.data.labels[elements[0].index] })
    },
  }))

  const sourceClickBarOptions = computed(() => ({
    ...horizBarOptions,
    // label 可能被 displayChartLabel 改寫為「未填寫」，drill 一律取原始資料值
    onClick: (...[_ev, elements]: ChartClickArgs) => {
      if (!elements.length) return
      const row = stats.value.by_source[elements[0].index]
      if (row) drillToDetail?.({ source: row.source })
    },
  }))

  // -------- 班別圖表 --------
  const gradeByMap = computed(() => new Map(stats.value.by_grade.map((g) => [g.grade, g])))

  const classBarData = computed(() => {
    if (!stats.value.by_grade.length) return null
    const gm = gradeByMap.value
    return {
      labels: GRADES_ORDER,
      datasets: [
        { label: '參觀人數', data: GRADES_ORDER.map((g) => gm.get(g)?.visit ?? 0), backgroundColor: '#74c69d', borderRadius: 4 },
      ],
    }
  })

  const classRateData = computed(() => {
    if (!stats.value.by_grade.length) return null
    const gm = gradeByMap.value
    return {
      labels: GRADES_ORDER,
      datasets: [{
        label: '預繳率 (%)',
        data: GRADES_ORDER.map((g) => {
          const d = gm.get(g)
          return d?.visit ? +(d.deposit / d.visit * 100).toFixed(1) : 0
        }),
        backgroundColor: '#40916c',
        borderRadius: 4,
      }],
    }
  })

  const monthGradeTableData = computed(() => {
    const mg = stats.value.month_grade
    return Object.keys(mg).sort().map((m) => ({ month: m, ...mg[m] }))
  })

  // -------- 來源圖表 --------
  const sourceBarData = computed(() => {
    const data = stats.value.by_source
    if (!data.length) return null
    return {
      labels: data.map((d) => displayChartLabel(d.source)),
      datasets: [{ label: '參觀人數', data: data.map((d) => d.visit), backgroundColor: '#52b788', borderRadius: 4 }],
    }
  })

  const sourceRateData = computed(() => {
    const data = stats.value.by_source
    if (!data.length) return null
    return {
      labels: data.map((d) => displayChartLabel(d.source)),
      datasets: [{
        label: '預繳率 (%)',
        data: data.map((d) => (d.visit ? +(d.deposit / d.visit * 100).toFixed(1) : 0)),
        backgroundColor: '#40916c',
        borderRadius: 4,
      }],
    }
  })

  // -------- 接待圖表 --------
  const staffBarData = computed(() => {
    const data = stats.value.by_referrer
    if (!data.length) return null
    return {
      labels: data.map((d) => displayChartLabel(d.referrer)),
      datasets: [{ label: '參觀人數', data: data.map((d) => d.visit), backgroundColor: '#74c69d', borderRadius: 4 }],
    }
  })

  const staffRateData = computed(() => {
    const data = stats.value.by_referrer
    if (!data.length) return null
    return {
      labels: data.map((d) => displayChartLabel(d.referrer)),
      datasets: [{
        label: '預繳率 (%)',
        data: data.map((d) => (d.visit ? +(d.deposit / d.visit * 100).toFixed(1) : 0)),
        backgroundColor: '#40916c',
        borderRadius: 4,
      }],
    }
  })

  // -------- 童年綠地 computed --------
  const chuannianNoDeposit = computed(
    () => (stats.value.chuannian_visit ?? 0) - (stats.value.chuannian_deposit ?? 0),
  )

  const chuannianExpectedBarData = computed(() => {
    const data = stats.value.chuannian_by_expected
    if (!data || !data.length) return null
    return {
      labels: data.map((d) => d.expected_month),
      datasets: [
        { label: '預繳', data: data.map((d) => d.deposit), backgroundColor: '#40916c', borderRadius: 4 },
        { label: '未預繳', data: data.map((d) => d.visit - d.deposit), backgroundColor: '#e76f51', borderRadius: 4 },
      ],
    }
  })

  const chuannianGradeBarData = computed(() => {
    const data = stats.value.chuannian_by_grade
    if (!data || !data.length) return null
    return {
      labels: data.map((d) => d.grade),
      datasets: [
        { label: '預繳', data: data.map((d) => d.deposit), backgroundColor: '#40916c', borderRadius: 4 },
        { label: '未預繳', data: data.map((d) => d.visit - d.deposit), backgroundColor: '#e76f51', borderRadius: 4 },
      ],
    }
  })

  // -------- 未預繳原因圖表 --------
  const noDepositReasonBarData = computed(() => {
    const data = stats.value.no_deposit_reasons
    if (!data || !data.length) return null
    return {
      labels: data.map((d) => d.reason),
      datasets: [{ label: '未預繳筆數', data: data.map((d) => d.count), backgroundColor: '#e76f51', borderRadius: 4 }],
    }
  })

  const noDepositGradeBarData = computed(() => {
    const data = stats.value.no_deposit_reasons
    if (!data || !data.length) return null
    // 各年級全為零＝沒有可視化的分布，回 null 讓 template 顯示空狀態而非空白格線
    const total = data.reduce(
      (acc, d) => acc + GRADES_ORDER.reduce((a, g) => a + (d.by_grade?.[g] ?? 0), 0),
      0,
    )
    if (!total) return null
    const colors = ['#74c69d', '#52b788', '#40916c', '#2d6a4f']
    return {
      labels: data.map((d) => d.reason),
      datasets: GRADES_ORDER.map((g, i) => ({
        label: g,
        data: data.map((d) => d.by_grade?.[g] ?? 0),
        backgroundColor: colors[i],
        borderRadius: 4,
      })),
    }
  })

  // -------- 區域圖表 --------
  const areaBarData = computed(() => {
    const rows = (marketSnapshot.value.districts || []).filter((row) => row.district !== '未填寫')
    if (!rows.length) return null
    return {
      labels: rows.map((row) => row.district),
      datasets: [{
        label: '90 天來源量',
        data: rows.map((row) => row.lead_count_90d || 0),
        backgroundColor: '#52b788',
        borderRadius: 4,
      }],
    }
  })

  const areaDepositRateBarData = computed(() => {
    const rows = (marketSnapshot.value.districts || []).filter(
      (row) => row.district !== '未填寫' && (row.lead_count_90d || 0) > 0,
    )
    if (!rows.length) return null
    return {
      labels: rows.map((row) => row.district),
      datasets: [{
        label: '90 天預繳率',
        data: rows.map((row) => row.deposit_rate_90d || 0),
        backgroundColor: rows.map((row) => {
          const r = row.deposit_rate_90d || 0
          if (r >= 50) return '#22c55e'
          if (r >= 25) return '#f59e0b'
          return '#f87171'
        }),
        borderRadius: 4,
      }],
    }
  })

  const areaRateBarOptions = computed(() => ({
    ...commonChartOptions,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: Record<string, unknown>) => ` ${Number(ctx.raw).toFixed(1)}%`,
        },
      },
    },
    scales: {
      x: { min: 0, max: 100, ticks: { callback: (v: unknown) => `${v}%` } },
    },
  }))

  const areaActiveDistrictCount = computed(
    () =>
      (marketSnapshot.value.districts || []).filter(
        (r) => r.district !== '未填寫' && (r.lead_count_90d || 0) > 0,
      ).length,
  )

  return {
    // 月度
    monthlyTableData,
    monthlyBarData,
    monthlyRateData,
    monthlyBarOptions,
    classBarOptions,
    sourceClickBarOptions,
    // 班別
    gradeByMap,
    classBarData,
    classRateData,
    monthGradeTableData,
    // 來源
    sourceBarData,
    sourceRateData,
    // 接待
    staffBarData,
    staffRateData,
    // 童年綠地
    chuannianNoDeposit,
    chuannianExpectedBarData,
    chuannianGradeBarData,
    // 未預繳
    noDepositReasonBarData,
    noDepositGradeBarData,
    // 區域
    areaBarData,
    areaDepositRateBarData,
    areaRateBarOptions,
    areaActiveDistrictCount,
    // 共用 options
    commonChartOptions,
    barOptions,
    horizBarOptions,
    percentBarOptions,
    percentHorizBarOptions,
    lineOptions,
    percentLineOptions,
    noDepositGradeBarOptions,
    doughnutOptions,
    // helpers
    shortPeriodLabel,
  }
}
