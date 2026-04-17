import { computed } from 'vue'
import { GRADES_ORDER } from '@/constants/recruitment'

/**
 * 招生 RecruitmentView 所有圖表的資料與設定 computed。
 *
 * 輸入：
 *  - stats:          useRecruitmentDashboard().stats（Ref<object>）
 *  - periodsSummary: useRecruitmentPeriods().periodsSummary（Ref<object>）
 *  - marketSnapshot: useRecruitmentArea().marketSnapshot（Ref<object>）
 *  - drillToDetail:  callback(patch) 當使用者點選月度/班別/來源柱時觸發
 *
 * 回傳：所有 chart data / chart options computed，供 template 直接綁定。
 */

const shortPeriodLabel = (name) => {
  const m = name.match(/(\d{3}\.\d{2})\.\d{2}[~-](\d{3}\.\d{2})\.\d{2}/)
  return m ? `${m[1]}~${m[2]}` : name.slice(0, 12)
}

const truncateChartLabel = (label, max = 12) =>
  typeof label === 'string' && label.length > max ? `${label.slice(0, max)}…` : label

const extractChartValue = (context) => {
  const parsed = context?.parsed
  if (typeof parsed === 'number') return parsed
  if (parsed && typeof parsed.y === 'number') return parsed.y
  if (parsed && typeof parsed.x === 'number') return parsed.x
  return Number(context?.raw ?? 0)
}

const formatPercentTooltip = (context) => {
  const label = context?.dataset?.label ? `${context.dataset.label}: ` : ''
  const value = Number(extractChartValue(context) ?? 0)
  return `${label}${value.toFixed(1)}%`
}

const percentTickFormatter = (value) => `${value}%`

const commonChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
}

const barOptions = {
  ...commonChartOptions,
  plugins: { legend: { position: 'top' } },
}

const horizBarOptions = {
  ...commonChartOptions,
  indexAxis: 'y',
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
        callback(value) {
          return truncateChartLabel(this.getLabelForValue(value))
        },
        maxRotation: 0,
        minRotation: 0,
      },
    },
  },
}

const doughnutOptions = {
  ...commonChartOptions,
  plugins: { legend: { position: 'bottom' } },
}

export function useRecruitmentCharts({ stats, periodsSummary, marketSnapshot, drillToDetail }) {
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

  const monthlyBarOptions = computed(() => ({
    ...barOptions,
    onClick: (_ev, elements, chart) => {
      if (!elements.length) return
      drillToDetail?.({ month: chart.data.labels[elements[0].index] })
    },
  }))

  const classBarOptions = computed(() => ({
    ...barOptions,
    onClick: (_ev, elements, chart) => {
      if (!elements.length) return
      drillToDetail?.({ grade: chart.data.labels[elements[0].index] })
    },
  }))

  const sourceClickBarOptions = computed(() => ({
    ...horizBarOptions,
    onClick: (_ev, elements, chart) => {
      if (!elements.length) return
      drillToDetail?.({ source: chart.data.labels[elements[0].index] })
    },
  }))

  // -------- 班別圖表 --------
  const gradeByMap = computed(() => new Map(stats.value.by_grade.map((g) => [g.grade, g])))

  const classBarData = computed(() => {
    const gm = gradeByMap.value
    return {
      labels: GRADES_ORDER,
      datasets: [
        { label: '參觀人數', data: GRADES_ORDER.map((g) => gm.get(g)?.visit ?? 0), backgroundColor: '#74c69d', borderRadius: 4 },
      ],
    }
  })

  const classRateData = computed(() => {
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
      labels: data.map((d) => d.source),
      datasets: [{ label: '參觀人數', data: data.map((d) => d.visit), backgroundColor: '#52b788', borderRadius: 4 }],
    }
  })

  const sourceRateData = computed(() => {
    const data = stats.value.by_source
    if (!data.length) return null
    return {
      labels: data.map((d) => d.source),
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
      labels: data.map((d) => d.referrer),
      datasets: [{ label: '參觀人數', data: data.map((d) => d.visit), backgroundColor: '#74c69d', borderRadius: 4 }],
    }
  })

  const staffRateData = computed(() => {
    const data = stats.value.by_referrer
    if (!data.length) return null
    return {
      labels: data.map((d) => d.referrer),
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

  // -------- 近五年轉換圖表 --------
  const periodsTrendData = computed(() => {
    const trend = periodsSummary.value?.trend
    if (!trend || !trend.length) return null
    return {
      labels: trend.map((d) => shortPeriodLabel(d.period_name)),
      datasets: [
        {
          label: '參觀→預繳率(%)',
          data: trend.map((d) => d.visit_to_deposit_rate),
          borderColor: '#52b788',
          backgroundColor: 'rgba(82,183,136,0.15)',
          tension: 0.3,
          fill: false,
        },
        {
          label: '參觀→註冊率(%)',
          data: trend.map((d) => d.visit_to_enrolled_rate),
          borderColor: '#40916c',
          backgroundColor: 'rgba(64,145,108,0.15)',
          tension: 0.3,
          fill: false,
        },
        {
          label: '預繳→註冊率(%)',
          data: trend.map((d) => d.deposit_to_enrolled_rate),
          borderColor: '#3182ce',
          backgroundColor: 'rgba(49,130,206,0.15)',
          tension: 0.3,
          fill: false,
        },
      ],
    }
  })

  const periodsCountBarData = computed(() => {
    const trend = periodsSummary.value?.trend
    if (!trend || !trend.length) return null
    return {
      labels: trend.map((d) => shortPeriodLabel(d.period_name)),
      datasets: [
        { label: '參觀', data: trend.map((d) => d.visit_count), backgroundColor: '#74c69d', borderRadius: 4 },
        { label: '預繳', data: trend.map((d) => d.deposit_count), backgroundColor: '#52b788', borderRadius: 4 },
        { label: '註冊', data: trend.map((d) => d.enrolled_count), backgroundColor: '#40916c', borderRadius: 4 },
        { label: '未就讀退', data: trend.map((d) => d.not_enrolled_deposit ?? 0), backgroundColor: '#f59e0b', borderRadius: 4 },
        { label: '註冊後退', data: trend.map((d) => d.enrolled_after_school ?? 0), backgroundColor: '#e76f51', borderRadius: 4 },
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
          label: (ctx) => ` ${Number(ctx.raw).toFixed(1)}%`,
        },
      },
    },
    scales: {
      x: { min: 0, max: 100, ticks: { callback: (v) => `${v}%` } },
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
    // 近五年
    periodsTrendData,
    periodsCountBarData,
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
