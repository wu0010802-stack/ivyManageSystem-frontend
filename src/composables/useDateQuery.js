import { reactive } from 'vue'

export function useDateQuery() {
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1

  const query = reactive({
    year: currentYear,
    month: currentMonth,
    employee_id: null,
  })

  return { currentYear, currentMonth, query }
}
