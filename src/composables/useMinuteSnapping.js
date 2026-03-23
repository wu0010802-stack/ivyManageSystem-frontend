import { watch } from 'vue'

export function useMinuteSnapping({ form, leaveMode }) {
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
}
