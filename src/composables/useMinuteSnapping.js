import { watch } from 'vue'

export function useMinuteSnapping({ form, leaveMode }) {
  const snapMinuteTo30 = (value) => {
    if (!value || value.length < 16) return value
    const min = parseInt(value.substring(14, 16), 10)
    const snapped = min < 15 ? '00' : min < 45 ? '30' : '00'
    if (min < 45) {
      return value.substring(0, 14) + snapped + value.substring(16)
    }
    // min >= 45：小時 +1，可能跨日 / 跨月 / 跨年，需從 Date 物件取出完整年月日時
    const datePart = value.substring(0, 10)
    const hour = parseInt(value.substring(11, 13), 10)
    const [y, m, d] = datePart.split('-').map(Number)
    const dt = new Date(y, m - 1, d, hour + 1, 0, 0, 0)
    const yyyy = dt.getFullYear()
    const mm = String(dt.getMonth() + 1).padStart(2, '0')
    const dd = String(dt.getDate()).padStart(2, '0')
    const hh = String(dt.getHours()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd} ${hh}:${snapped}` + value.substring(16)
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
