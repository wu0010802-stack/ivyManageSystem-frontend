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
  { value: 'occupational_injury', label: '公傷病假',   color: 'success', deduction: '不扣' },
  { value: 'pregnancy_rest', label: '安胎休養假',      color: 'info',    deduction: '扣半薪（依病假）' },
  { value: 'typhoon',        label: '颱風假',          color: 'warning', deduction: '得不給薪' },
]

/** 以 value 為 key 的查詢表（type 欄位對應 Element Plus tag 的 type prop）*/
export const LEAVE_TYPE_MAP = Object.fromEntries(
  LEAVE_TYPES.map(t => [t.value, { label: t.label, type: t.color }])
)

export const LEAVE_RULE_HINTS = {
  personal: '每學年 14 日，請假以小時為單位，需至少提前 2 日申請。',
  sick: '每學年 30 日，薪資折半發給，且須以 4 小時為單位申請。',
  menstrual: '每月 1 日，併入病假計算，薪資依病假規定辦理。',
  annual: '依年資給假，仍須事先申請並經核准。',
  maternity: '生育 8 週、流產依週數給假；需檢附醫生證明。',
  paternity: '配偶分娩前後 15 日內可請 5 日，薪資照給。',
  official: '代表園所參加校外活動得請公假，薪資照給。',
  marriage: '婚假 8 日，不含例假日，薪資照給。',
  bereavement: '喪假依親等給 3/6/8 日，需於事發日起 100 日內休畢。',
  prenatal: '產檢假 7 日，薪資照給。',
  paternity_new: '陪產檢及陪產假依園所規則辦理，薪資照給。',
  miscarriage: '流產假依懷孕週數給假，需檢附醫療證明。',
  family_care: '全年 7 日，併入事假計算，薪資依事假規定辦理。',
  parental_unpaid: '任職滿 6 個月後可申請，子女滿 3 歲前最長 2 年。',
  compensatory: '補休不扣薪，依已核准補休配額使用。',
  occupational_injury: '因職災治療休養期間可請公傷病假。',
  pregnancy_rest: '安胎休養需附醫師證明，薪資依病假規定辦理。',
  typhoon: '依勞基法辦理，勞工可不出勤，雇主得不給薪。',
}

/**
 * 把 'YYYY-MM-DD' 或 'YYYY-MM-DD HH:MM:SS' 字串解析為瀏覽器本地零點的 Date。
 * 直接 `new Date('YYYY-MM-DD')` 會被 JS 引擎視為 UTC，跨負時區會少一天。
 */
const parseDateLocal = (input) => {
  if (!input) return null
  if (input instanceof Date) {
    const d = new Date(input)
    d.setHours(0, 0, 0, 0)
    return d
  }
  const s = String(input).substring(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 0, 0, 0, 0)
}

export const getRequestedCalendarDays = (startDate, endDate) => {
  if (!startDate || !endDate) return 0
  const start = parseDateLocal(startDate)
  const end = parseDateLocal(endDate)
  if (!start || !end || end < start) return 0
  return Math.floor((end - start) / 86400000) + 1
}

export const leaveRequiresAttachment = (startDate, endDate) =>
  getRequestedCalendarDays(startDate, endDate) > 2

/**
 * 檢查請假申請是否違反業務規則（病假 4h 倍數、事假提前 2 日）。
 * 回傳違規訊息陣列；caller 可選擇 hard block 或 confirm 後繼續。
 */
export const validateLeaveRules = ({ leave_type, leave_hours, start_date } = {}) => {
  const violations = []
  if (leave_type === 'sick' && Number(leave_hours) > 0 && Number(leave_hours) % 4 !== 0) {
    violations.push('病假必須以 4 小時為單位申請')
  }
  if (leave_type === 'personal' && start_date) {
    const start = parseDateLocal(start_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (start) {
      const diffDays = Math.floor((start - today) / 86400000)
      if (diffDays < 2) violations.push('事假需至少提前 2 日提出申請')
    }
  }
  return violations
}
