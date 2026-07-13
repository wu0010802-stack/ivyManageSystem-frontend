import { todayISO } from '@/utils/format'
import { TITLE_TO_GRADE, POSITION_SALARY_KEY } from '@/constants/employee'

export type EmployeeStatusKey = 'active' | 'pending' | 'resigned'
export type ElTagType = 'primary' | 'success' | 'warning' | 'info' | 'danger' | undefined

/** 員工狀態單一來源（自舊員工頁搬出，邏輯不變） */
export const statusKeyOf = (emp: Record<string, unknown>): EmployeeStatusKey => {
  if (!emp.is_active) return 'resigned'
  if (emp.resign_date && (emp.resign_date as string) > todayISO()) return 'pending'
  return 'active'
}

export const getEmployeeStatus = (emp: Record<string, unknown>): { label: string; type: ElTagType } => {
  switch (statusKeyOf(emp)) {
    case 'resigned': return { label: '已離職', type: 'info' }
    case 'pending': return { label: `待離職・${emp.resign_date}`, type: 'warning' }
    default: return { label: '在職', type: 'success' }
  }
}

/**
 * 「待補薪資」判定單一來源：在職 + 正職 + 底薪未設定（=0）。
 * 名冊列 tag 與 HR 待辦 chip 計數/篩選皆呼叫此函式，避免兩處口徑漂移。
 */
export const isMissingSalary = (emp: Record<string, unknown>): boolean =>
  Boolean(emp.is_active) && emp.employee_type === 'regular' && emp.base_salary === 0

/**
 * 年資顯示：在職者由到職日算至今日（X.Y 年）。
 * 已離職、缺／不合法／未來到職日一律回「—」。
 * 日期用本地時區逐欄 parse（勿用 new Date('YYYY-MM-DD')，UTC 偏移會差一天，同 utils/expiry 慣例）。
 */
export const tenureLabel = (emp: Record<string, unknown>, todayIso: string = todayISO()): string => {
  if (!emp.is_active) return '—'
  const hire = emp.hire_date
  if (typeof hire !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(hire)) return '—'
  const [y, m, d] = hire.split('-').map(Number)
  const [ty, tm, td] = todayIso.split('-').map(Number)
  const hireDate = new Date(y, m - 1, d)
  const today = new Date(ty, tm - 1, td)
  if (Number.isNaN(hireDate.getTime()) || hireDate.getTime() > today.getTime()) return '—'
  const years = (today.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return `${years.toFixed(1)} 年`
}

/** 薪資金額顯示：後端依 role/self 遮罩回 null → 顯示無檢視權限，嚴禁 Number(null)→0 */
export const maskedMoney = (v: unknown): string => {
  if (v === null || v === undefined) return '無檢視權限'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return n.toLocaleString()
}

export const insuranceLevelDisplay = (v: unknown): string => {
  if (v === null || v === undefined) return '無檢視權限'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  if (n === 0) return '未設定'
  return n.toLocaleString()
}

export const pensionSelfRatePct = (v: unknown): string => {
  if (v === null || v === undefined) return '無檢視權限'
  const n = Number(v)
  if (Number.isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

export const bankInfoDisplay = (emp: Record<string, unknown>): string => {
  const code = (emp.bank_code as string) || ''
  const account = (emp.bank_account as string) || ''
  if (!code && !account) return '—'
  const name = (emp.bank_account_name as string) || ''
  return `${code} - ${account}${name ? `（${name}）` : ''}`
}

/** 職位 → 導師角色（自舊員工頁搬出，邏輯不變） */
export const detectRole = (position: string | null | undefined): 'head' | 'assistant' | null => {
  if (!position) return null
  if (position.includes('班導') && !position.includes('副')) return 'head'
  if (position.includes('副班導')) return 'assistant'
  return null
}

/** 查某員工對應的標準薪俸（自舊員工頁standardSalaryFor 搬出，邏輯不變） */
export const standardSalaryFor = (
  emp: Record<string, unknown>,
  cfg: Record<string, number> | null,
): number | null => {
  if (!cfg || !emp) return null
  const pos = (emp.position as string) || ''
  const role = detectRole(pos)
  if (role) {
    const titleName = (emp.job_title_name as string) || (emp.title as string) || ''
    const grade = ((emp.bonus_grade as string) || (TITLE_TO_GRADE as Record<string, string>)[titleName] || '').toLowerCase()
    if (grade) {
      const key = `${role === 'head' ? 'head_teacher' : 'assistant_teacher'}_${grade}`
      return cfg[key] ?? null
    }
    return null
  }
  const key = (POSITION_SALARY_KEY as Record<string, string>)[pos]
  return key ? (cfg[key] ?? null) : null
}
