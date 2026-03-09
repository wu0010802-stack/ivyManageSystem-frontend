/**
 * 假別常數
 *
 * LEAVE_TYPES     — 完整陣列（含 value, label, color, deduction）
 * LEAVE_TYPE_MAP  — 以 value 為 key 的 Map，供 O(1) 查詢
 *                   結構：{ personal: { label: '事假', type: 'warning' }, ... }
 */

export const LEAVE_TYPES = [
  { value: 'personal',       label: '事假',            color: 'warning', deduction: '全扣' },
  { value: 'sick',           label: '病假',            color: 'info',    deduction: '扣半薪' },
  { value: 'menstrual',      label: '生理假',          color: 'info',    deduction: '扣半薪' },
  { value: 'annual',         label: '特休',            color: 'success', deduction: '不扣' },
  { value: 'maternity',      label: '產假',            color: 'success', deduction: '不扣' },
  { value: 'paternity',      label: '陪產假',          color: 'success', deduction: '不扣' },
  { value: 'official',       label: '公假',            color: 'success', deduction: '不扣' },
  { value: 'marriage',       label: '婚假',            color: 'success', deduction: '不扣' },
  { value: 'bereavement',    label: '喪假',            color: 'success', deduction: '不扣' },
  { value: 'prenatal',       label: '產檢假',          color: 'success', deduction: '不扣' },
  { value: 'paternity_new',  label: '陪產檢及陪產假',  color: 'success', deduction: '不扣' },
  { value: 'miscarriage',    label: '流產假',          color: 'success', deduction: '不扣' },
  { value: 'family_care',    label: '家庭照顧假',      color: 'warning', deduction: '全扣（併入事假）' },
  { value: 'parental_unpaid',label: '育嬰留職停薪',    color: 'info',    deduction: '留停無薪' },
  { value: 'compensatory',   label: '補休',            color: 'success', deduction: '不扣' },
]

/** 以 value 為 key 的查詢表（type 欄位對應 Element Plus tag 的 type prop）*/
export const LEAVE_TYPE_MAP = Object.fromEntries(
  LEAVE_TYPES.map(t => [t.value, { label: t.label, type: t.color }])
)
