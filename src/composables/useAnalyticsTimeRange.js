import { ref, computed } from 'vue'

const PRESETS = ['this_month', 'last_month', 'this_term', 'last_term',
                  'this_academic_year', 'custom']

const PRESET_LABELS = {
  this_month: '本月',
  last_month: '上月',
  this_term: '本學期',
  last_term: '上學期',
  this_academic_year: '本學年',
  custom: '自訂',
}

function fmt(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function lastDayOfMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0)
}

function rangeFromPreset(preset, today = new Date()) {
  const y = today.getFullYear()
  const m = today.getMonth()  // 0-based

  if (preset === 'this_month') {
    return { start: fmt(new Date(y, m, 1)),
             end:   fmt(lastDayOfMonth(y, m)) }
  }
  if (preset === 'last_month') {
    return { start: fmt(new Date(y, m - 1, 1)),
             end:   fmt(lastDayOfMonth(y, m - 1)) }
  }
  if (preset === 'this_term') {
    // 上學期 9/1 ~ 1/31；下學期 2/1 ~ 7/31；8 月暑假 → 視為下學期延伸
    if (m + 1 >= 9) {
      return { start: `${y}-09-01`, end: `${y + 1}-01-31` }
    }
    if (m + 1 <= 1) {
      return { start: `${y - 1}-09-01`, end: `${y}-01-31` }
    }
    if (m + 1 >= 2 && m + 1 <= 7) {
      return { start: `${y}-02-01`, end: `${y}-07-31` }
    }
    return { start: `${y}-02-01`, end: `${y}-07-31` }
  }
  if (preset === 'last_term') {
    const cur = rangeFromPreset('this_term', today)
    if (cur.start.endsWith('-09-01')) {
      // 上學期 → 上一個下學期
      const startYear = parseInt(cur.start.slice(0, 4))
      return { start: `${startYear}-02-01`, end: `${startYear}-07-31` }
    }
    // 下學期 → 上學期
    const startYear = parseInt(cur.start.slice(0, 4)) - 1
    return { start: `${startYear}-09-01`, end: `${startYear + 1}-01-31` }
  }
  if (preset === 'this_academic_year') {
    if (m + 1 >= 8) {
      return { start: `${y}-08-01`, end: `${y + 1}-07-31` }
    }
    return { start: `${y - 1}-08-01`, end: `${y}-07-31` }
  }
  return null
}

export function useAnalyticsTimeRange(initialPreset = 'this_term') {
  const preset = ref(initialPreset)
  const start = ref('')
  const end = ref('')

  const applyPreset = (p) => {
    if (!PRESETS.includes(p)) return
    preset.value = p
    if (p === 'custom') return
    const r = rangeFromPreset(p)
    if (r) {
      start.value = r.start
      end.value = r.end
    }
  }

  const applyCustom = (s, e) => {
    preset.value = 'custom'
    start.value = s
    end.value = e
  }

  const label = computed(() => PRESET_LABELS[preset.value] || '自訂')

  applyPreset(initialPreset)

  return {
    start, end, label, preset,
    presets: PRESETS.map((k) => ({ value: k, label: PRESET_LABELS[k] })),
    applyPreset, applyCustom,
  }
}
