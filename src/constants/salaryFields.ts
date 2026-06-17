/** 薪資手動調整可編輯欄位（HR 可手調的安全子集；後端 EDITABLE_SALARY_FIELDS 為其超集）。
 *  單筆 AdjustDrawer 與批次 BatchAdjustDialog 共用，避免兩份漂移。 */
export const EDITABLE_SALARY_FIELDS = Object.freeze([
  { key: 'festival_bonus', label: '節慶獎金' },
  { key: 'overtime_bonus', label: '超額獎金' },
  { key: 'overtime_pay', label: '加班津貼' },
  { key: 'supervisor_dividend', label: '主管紅利' },
  { key: 'meeting_overtime_pay', label: '會議加班' },
  { key: 'birthday_bonus', label: '生日禮金' },
  { key: 'extra_allowance', label: '額外加給' },
  { key: 'leave_deduction', label: '請假扣款' },
  { key: 'late_deduction', label: '遲到扣款' },
  { key: 'early_leave_deduction', label: '早退扣款' },
  { key: 'meeting_absence_deduction', label: '節慶獎金扣減' },
  { key: 'absence_deduction', label: '曠職扣款' },
] as const)

export type EditableSalaryFieldKey = (typeof EDITABLE_SALARY_FIELDS)[number]['key']
