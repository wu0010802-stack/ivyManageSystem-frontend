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
    quota.clearEditBaseline()
  }

  const populateFormFromRecord = (row) => {
    form.id = row.id
    form.employee_id = row.employee_id
    form.leave_type = row.leave_type
    // 半邊 time 防呆：只填 start 沒 end（或反之）視為破損資料，退回 full 模式
    const hasBothTimes = row.start_time && row.end_time
    if (hasBothTimes) {
      calculator.leaveMode.value = 'custom'
      form.start_date = `${row.start_date} ${row.start_time}:00`
      form.end_date = `${row.end_date} ${row.end_time}:00`
      calculator.leaveSingleDate.value = row.start_date
    } else {
      calculator.leaveMode.value = 'full'
      form.start_date = row.start_date
      form.end_date = row.end_date
      calculator.leaveSingleDate.value = row.start_date
    }
    form.leave_hours = row.leave_hours
    form.reason = row.reason
    quota.setEditBaseline(row.leave_hours)
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
