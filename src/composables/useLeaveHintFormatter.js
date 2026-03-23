import { computed } from 'vue'

const DEFAULT_WORK_START = '09:00'
const DEFAULT_WORK_END = '18:00'

export function useLeaveHintFormatter({ form, calcBreakdown, leaveMode }) {
  const calcTooltipHtml = computed(() => {
    if (!calcBreakdown.value.length) return ''
    const weekdays = ['日', '一', '二', '三', '四', '五', '六']
    const lines = []
    let total = 0
    const isCustom = leaveMode.value === 'custom'
    const startTime = isCustom && form.start_date ? form.start_date.substring(11, 16) : ''
    const endTime = isCustom && form.end_date ? form.end_date.substring(11, 16) : ''
    const startDateStr = isCustom && form.start_date ? form.start_date.substring(0, 10) : ''
    const endDateStr = isCustom && form.end_date ? form.end_date.substring(0, 10) : ''
    const toMin = (time) => {
      const [h, m] = time.split(':').map(Number)
      return h * 60 + m
    }
    for (const day of calcBreakdown.value) {
      const dt = new Date(day.date)
      const wd = weekdays[dt.getDay()]
      if (day.type === 'workday') {
        let hours = day.hours
        if (isCustom && startTime && endTime) {
          const ws = day.work_start || '09:00'
          const we = day.work_end || '18:00'
          let dayStart = ws
          let dayEnd = we
          if (day.date === startDateStr) dayStart = startTime > ws ? startTime : ws
          if (day.date === endDateStr) dayEnd = endTime < we ? endTime : we
          if (dayStart >= dayEnd) {
            hours = 0
          } else {
            let minutes = toMin(dayEnd) - toMin(dayStart)
            const overlapStart = Math.max(toMin(dayStart), 720)
            const overlapEnd = Math.min(toMin(dayEnd), 780)
            if (overlapEnd > overlapStart) minutes -= (overlapEnd - overlapStart)
            hours = Math.max(0, Math.round(minutes / 60 * 2) / 2)
          }
        }
        const timeRange = isCustom
          ? (() => {
              const ws = day.work_start || '09:00'
              const we = day.work_end || '18:00'
              let dayStart = ws
              let dayEnd = we
              if (day.date === startDateStr && startTime) dayStart = startTime > ws ? startTime : ws
              if (day.date === endDateStr && endTime) dayEnd = endTime < we ? endTime : we
              return ` ${dayStart}–${dayEnd}`
            })()
          : ''
        lines.push(`${day.date}（${wd}）${hours}h${timeRange}`)
        total += hours
      } else if (day.type === 'holiday') {
        lines.push(`${day.date}（${wd}）${day.holiday_name} 0h`)
      } else {
        lines.push(`${day.date}（${wd}）週末 0h`)
      }
    }
    lines.push(`合計 = ${total}h`)
    return lines.join('<br>')
  })

  const officeHoursWarning = computed(() => {
    if (leaveMode.value !== 'custom' || !form.start_date || !form.end_date) return ''
    const st = form.start_date.substring(11, 16)
    const et = form.end_date.substring(11, 16)
    if (!st || !et) return ''
    const warnings = []
    if (st < DEFAULT_WORK_START) warnings.push(`開始時間 ${st} 早於預設上班 ${DEFAULT_WORK_START}`)
    if (et > DEFAULT_WORK_END) warnings.push(`結束時間 ${et} 晚於預設下班 ${DEFAULT_WORK_END}`)
    return warnings.join('；')
  })

  return { calcTooltipHtml, officeHoursWarning }
}
