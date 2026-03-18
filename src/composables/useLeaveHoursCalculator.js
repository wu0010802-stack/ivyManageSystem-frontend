import { computed, ref, watch } from 'vue'

import { getLeaveQuotas, getWorkdayHours } from '@/api/leaves'

const DAILY_WORK_HOURS = 8
const QUOTA_TYPES = new Set(['annual', 'sick', 'menstrual', 'personal', 'family_care'])
const DEFAULT_WORK_START = '09:00'
const DEFAULT_WORK_END = '18:00'

export function useLeaveHoursCalculator({ form, formRef }) {
  const calcHint = ref('')
  const calcBreakdown = ref([])
  const calcLoading = ref(false)
  const leaveMode = ref('full')
  const leaveSingleDate = ref('')
  const quotaInfo = ref(null)
  const quotaLoading = ref(false)

  const countWorkdays = (startDate, endDate) => {
    let count = 0
    const cur = new Date(startDate)
    cur.setHours(0, 0, 0, 0)
    const end = new Date(endDate)
    end.setHours(0, 0, 0, 0)
    while (cur <= end) {
      const dow = cur.getDay()
      if (dow !== 0 && dow !== 6) count++
      cur.setDate(cur.getDate() + 1)
    }
    return count
  }

  const calcSameDayHours = (start, end) => {
    const sTime = start.toTimeString().substring(0, 5)
    const eTime = end.toTimeString().substring(0, 5)
    const toMin = (time) => {
      const [h, m] = time.split(':').map(Number)
      return h * 60 + m
    }
    let minutes = toMin(eTime) - toMin(sTime)
    const overlapStart = Math.max(toMin(sTime), toMin('12:00'))
    const overlapEnd = Math.min(toMin(eTime), toMin('13:00'))
    if (overlapEnd > overlapStart) minutes -= (overlapEnd - overlapStart)
    const hours = Math.min(minutes / 60, DAILY_WORK_HOURS)
    return Math.max(0, hours)
  }

  const resetCalculatorState = () => {
    calcHint.value = ''
    calcBreakdown.value = []
    calcLoading.value = false
    quotaInfo.value = null
    leaveMode.value = 'full'
    leaveSingleDate.value = ''
    formRef.value?.clearValidate()
  }

  const fallbackCalc = (start, end) => {
    const s = new Date(start)
    const e = new Date(end)
    const sDay = new Date(s)
    sDay.setHours(0, 0, 0, 0)
    const eDay = new Date(e)
    eDay.setHours(0, 0, 0, 0)
    if (sDay.getTime() === eDay.getTime()) {
      const hours = calcSameDayHours(s, e)
      form.leave_hours = Math.max(0.5, Math.round(hours * 2) / 2)
      const lunchNote = hours < (e - s) / 3600000 ? '（已扣除 1h 午休）' : ''
      calcHint.value = `同日請假 ${form.leave_hours}h${lunchNote}（預設班制）`
      return
    }

    const workdays = countWorkdays(sDay, eDay)
    const total = workdays * DAILY_WORK_HOURS
    form.leave_hours = Math.max(0.5, total)
    calcHint.value = `${workdays} 個工作日 × ${DAILY_WORK_HOURS}h = ${total}h（預設班制，已排除週末）`
  }

  const fetchWorkdayHours = async (employeeId, start, end) => {
    calcLoading.value = true
    calcBreakdown.value = []
    calcHint.value = ''
    try {
      const sd = start.substring(0, 10)
      const ed = end.substring(0, 10)
      const res = await getWorkdayHours({ employee_id: employeeId, start_date: sd, end_date: ed })
      const { total_hours, breakdown } = res.data
      calcBreakdown.value = breakdown

      if (leaveMode.value === 'morning') {
        const dayData = breakdown.find(d => d.date === sd && d.type === 'workday')
        const workStart = dayData?.work_start || '08:00'
        form.start_date = `${sd} ${workStart}:00`
        form.end_date = `${sd} 12:00:00`
        const hours = Math.max(0.5, Math.round((new Date(form.end_date) - new Date(form.start_date)) / 3600000 * 2) / 2)
        form.leave_hours = hours
        calcHint.value = `上午請假 ${hours}h（${workStart}–12:00）`
        return
      }

      if (leaveMode.value === 'afternoon') {
        const dayData = breakdown.find(d => d.date === sd && d.type === 'workday')
        const workEnd = dayData?.work_end || '17:00'
        form.start_date = `${sd} 13:00:00`
        form.end_date = `${sd} ${workEnd}:00`
        const hours = Math.max(0.5, Math.round((new Date(form.end_date) - new Date(form.start_date)) / 3600000 * 2) / 2)
        form.leave_hours = hours
        calcHint.value = `下午請假 ${hours}h（13:00–${workEnd}）`
        return
      }

      if (leaveMode.value === 'full') {
        form.leave_hours = Math.max(0.5, total_hours)
        const workdayCount = breakdown.filter(d => d.type === 'workday').length
        const holidayCount = breakdown.filter(d => d.type === 'holiday').length
        const parts = [`${workdayCount} 個工作日，合計 ${total_hours}h`]
        if (holidayCount > 0) parts.push(`${holidayCount} 天國定假日不計`)
        calcHint.value = parts.join('，')
        return
      }

      const startTime = start.substring(11, 16) || '09:00'
      const endTime = end.substring(11, 16) || '18:00'
      const startDateStr = start.substring(0, 10)
      const endDateStr = end.substring(0, 10)
      let totalH = 0
      for (const day of breakdown) {
        if (day.type !== 'workday') continue
        const ws = day.work_start || '09:00'
        const we = day.work_end || '18:00'
        let dayStart = ws
        let dayEnd = we
        if (day.date === startDateStr) dayStart = startTime > ws ? startTime : ws
        if (day.date === endDateStr) dayEnd = endTime < we ? endTime : we
        if (dayStart >= dayEnd) continue
        const toMin = (time) => {
          const [h, m] = time.split(':').map(Number)
          return h * 60 + m
        }
        let minutes = toMin(dayEnd) - toMin(dayStart)
        const overlapStart = Math.max(toMin(dayStart), toMin('12:00'))
        const overlapEnd = Math.min(toMin(dayEnd), toMin('13:00'))
        if (overlapEnd > overlapStart) minutes -= (overlapEnd - overlapStart)
        totalH += Math.max(0, minutes / 60)
      }
      form.leave_hours = Math.max(0.5, Math.round(totalH * 2) / 2)
      const workdays = breakdown.filter(d => d.type === 'workday').length
      const holidays = breakdown.filter(d => d.type === 'holiday').length
      calcHint.value = `${workdays} 個工作日，合計 ${form.leave_hours}h（依實際時段）${holidays > 0 ? `，${holidays} 天國定假日不計` : ''}`
    } catch {
      fallbackCalc(start, end)
      calcBreakdown.value = []
    } finally {
      calcLoading.value = false
    }
  }

  watch([() => form.employee_id, () => form.start_date, () => form.end_date], ([empId, start, end]) => {
    if (leaveMode.value === 'morning' || leaveMode.value === 'afternoon') return
    if (!start || !end) {
      calcHint.value = ''
      calcBreakdown.value = []
      return
    }
    const s = new Date(start)
    const e = new Date(end)
    if (leaveMode.value === 'full' ? e < s : e <= s) {
      calcHint.value = ''
      calcBreakdown.value = []
      return
    }
    if (empId) {
      fetchWorkdayHours(empId, start, end)
      return
    }
    fallbackCalc(start, end)
    calcBreakdown.value = []
  })

  watch([() => form.employee_id, leaveSingleDate, leaveMode], ([empId, singleDate, mode]) => {
    if (mode !== 'morning' && mode !== 'afternoon') return
    calcBreakdown.value = []
    if (!singleDate) {
      calcHint.value = ''
      form.start_date = ''
      form.end_date = ''
      return
    }
    if (mode === 'morning') {
      form.start_date = `${singleDate} 08:00:00`
      form.end_date = `${singleDate} 12:00:00`
      form.leave_hours = 4
    } else {
      form.start_date = `${singleDate} 13:00:00`
      form.end_date = `${singleDate} 17:00:00`
      form.leave_hours = 4
    }
    if (empId) {
      fetchWorkdayHours(empId, singleDate, singleDate)
    } else {
      calcHint.value = `${mode === 'morning' ? '上午' : '下午'} 4h（預設班制）`
    }
  })

  watch(leaveMode, (newMode) => {
    calcHint.value = ''
    calcBreakdown.value = []
    if (newMode === 'full') {
      if (leaveSingleDate.value) {
        form.start_date = leaveSingleDate.value
        form.end_date = leaveSingleDate.value
      } else if (form.start_date) {
        form.start_date = form.start_date.substring(0, 10)
        form.end_date = form.end_date ? form.end_date.substring(0, 10) : ''
      }
      leaveSingleDate.value = ''
      return
    }

    if (newMode === 'morning' || newMode === 'afternoon') {
      const dateStr = form.start_date ? form.start_date.substring(0, 10) : ''
      leaveSingleDate.value = dateStr
      form.start_date = ''
      form.end_date = ''
      return
    }

    const dateStr = leaveSingleDate.value || (form.start_date ? form.start_date.substring(0, 10) : '')
    if (dateStr) {
      form.start_date = `${dateStr} 08:00:00`
      form.end_date = `${dateStr} 17:00:00`
    }
    leaveSingleDate.value = ''
  })

  const fetchQuotaInfo = async () => {
    if (!form.employee_id || !QUOTA_TYPES.has(form.leave_type)) {
      quotaInfo.value = null
      return
    }
    quotaLoading.value = true
    try {
      const year = new Date().getFullYear()
      const res = await getLeaveQuotas({ employee_id: form.employee_id, year, leave_type: form.leave_type })
      quotaInfo.value = res.data[0] || null
    } catch {
      quotaInfo.value = null
    } finally {
      quotaLoading.value = false
    }
  }

  watch([() => form.employee_id, () => form.leave_type], fetchQuotaInfo)

  const quotaExceeded = computed(() => !!(quotaInfo.value && form.leave_hours > quotaInfo.value.remaining_hours))
  const canSave = computed(() => !quotaExceeded.value)

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

  const snapMinuteTo30 = (value) => {
    if (!value || value.length < 16) return value
    const min = parseInt(value.substring(14, 16), 10)
    const snapped = min < 15 ? '00' : min < 45 ? '30' : '00'
    let result = value.substring(0, 14) + snapped + value.substring(16)
    if (min >= 45) {
      const d = new Date(result)
      d.setHours(d.getHours() + 1)
      const hh = String(d.getHours()).padStart(2, '0')
      result = result.substring(0, 11) + hh + ':' + snapped + result.substring(16)
    }
    return result
  }

  watch(() => form.start_date, (value) => {
    if (leaveMode.value === 'custom' && value && value.length > 10) {
      const snapped = snapMinuteTo30(value)
      if (snapped !== value) form.start_date = snapped
    }
  })

  watch(() => form.end_date, (value) => {
    if (leaveMode.value === 'custom' && value && value.length > 10) {
      const snapped = snapMinuteTo30(value)
      if (snapped !== value) form.end_date = snapped
    }
  })

  const getExpectedMaxHours = () => {
    const s = new Date(form.start_date)
    const e = new Date(form.end_date)
    const sDay = new Date(s)
    sDay.setHours(0, 0, 0, 0)
    const eDay = new Date(e)
    eDay.setHours(0, 0, 0, 0)
    const apiMaxHours = calcBreakdown.value.length
      ? calcBreakdown.value.reduce((sum, day) => sum + (day.hours || 0), 0)
      : null
    return apiMaxHours ?? (countWorkdays(sDay, eDay) * DAILY_WORK_HOURS)
  }

  const populateFormFromRecord = (row) => {
    form.id = row.id
    form.employee_id = row.employee_id
    form.leave_type = row.leave_type
    if (row.start_time || row.end_time) {
      leaveMode.value = 'custom'
      form.start_date = row.start_time ? `${row.start_date} ${row.start_time}:00` : `${row.start_date} 00:00:00`
      form.end_date = row.end_time ? `${row.end_date} ${row.end_time}:00` : `${row.end_date} 00:00:00`
      leaveSingleDate.value = row.start_date
    } else {
      leaveMode.value = 'full'
      form.start_date = row.start_date
      form.end_date = row.end_date
      leaveSingleDate.value = row.start_date
    }
    form.leave_hours = row.leave_hours
    form.reason = row.reason
  }

  return {
    QUOTA_TYPES,
    calcHint,
    calcBreakdown,
    calcLoading,
    leaveMode,
    leaveSingleDate,
    quotaInfo,
    quotaLoading,
    quotaExceeded,
    canSave,
    calcTooltipHtml,
    officeHoursWarning,
    resetCalculatorState,
    getExpectedMaxHours,
    populateFormFromRecord,
  }
}
