import { computed } from 'vue'
import { useWorkdayCalculator } from './useWorkdayCalculator'
import { useLeaveQuota } from './useLeaveQuota'
import { useMinuteSnapping } from './useMinuteSnapping'
import { useLeaveHintFormatter } from './useLeaveHintFormatter'

const QUOTA_TYPES = new Set(['annual', 'sick', 'menstrual', 'personal', 'family_care'])

export function useLeaveHoursCalculator({ form, formRef, fetchWorkdayHoursFn = null, fetchQuotaFn = null }) {
  const calculator = useWorkdayCalculator({ form, fetchFn: fetchWorkdayHoursFn })
  const quota = useLeaveQuota({ form, fetchFn: fetchQuotaFn })
  useMinuteSnapping({ form, leaveMode: calculator.leaveMode })
  const formatting = useLeaveHintFormatter({
    form,
    calcBreakdown: calculator.calcBreakdown,
    leaveMode: calculator.leaveMode,
  })

  const canSave = computed(() => !quota.quotaExceeded.value)

  const resetCalculatorState = () => {
    calculator.resetCalculatorState(formRef)
    quota.quotaInfo.value = null
  }

  const populateFormFromRecord = (row) => {
    form.id = row.id
    form.employee_id = row.employee_id
    form.leave_type = row.leave_type
    if (row.start_time || row.end_time) {
      calculator.leaveMode.value = 'custom'
      form.start_date = row.start_time ? `${row.start_date} ${row.start_time}:00` : `${row.start_date} 00:00:00`
      form.end_date = row.end_time ? `${row.end_date} ${row.end_time}:00` : `${row.end_date} 00:00:00`
      calculator.leaveSingleDate.value = row.start_date
    } else {
      calculator.leaveMode.value = 'full'
      form.start_date = row.start_date
      form.end_date = row.end_date
      calculator.leaveSingleDate.value = row.start_date
    }
    form.leave_hours = row.leave_hours
    form.reason = row.reason
  }

  return {
    QUOTA_TYPES,
    ...calculator,
    ...quota,
    ...formatting,
    canSave,
    resetCalculatorState,
    populateFormFromRecord,
  }
}
