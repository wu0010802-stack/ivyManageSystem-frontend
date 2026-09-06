import { getCurrentAcademicTerm, toAdYear, toRocYear } from '@/utils/academic'
import { todayISO } from '@/utils/format'

export const GRADES_ORDER = ['幼幼班', '小班', '中班', '大班']

// 本園座標的**最終**備援值（scan-frontend GAP-08）。
// 優先序：後端 campus 設定 > 品牌 API 的 `branding.map.{lat,lng}`（per-tenant）> 這兩個常數。
// 多租戶下硬編高雄座標對第二間園所是錯的，故一般不應走到這裡；保留是為了
// 「品牌 API 也掛掉」時地圖仍有一個可拖曳的起點，而不是 NaN。
// 消費點請改用 `getBranding().map`，見 RecruitmentStatsPanel.vue。
export const FALLBACK_SCHOOL_LAT = 22.6420
export const FALLBACK_SCHOOL_LNG = 120.3243

// 分級通勤距離（公里）
export const TRAVEL_BANDS = [10, 15, 20]

// 民國年.月格式驗證（例：114.03）
export const ROC_MONTH_PATTERN = /^\d{3}\.\d{2}$/

// 依生日 × 目標入學學年推適讀班級（2026-08-28 訪視表單 UX：填生日自動帶入，可手動改）。
// 台灣學制：學年 N 於西元 (N+1911).09.01（含）前足歲——2 歲幼幼班、3 歲小班、
// 4 歲中班、5 歲大班；範圍外（未滿 2 歲或已達學齡）回 null，不強行帶入。
export function gradeForBirthday(birthdayISO: string, targetSchoolYear: number): string | null {
  const parts = birthdayISO.split('-').map((p) => parseInt(p, 10))
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null
  const [by, bm, bd] = parts
  const cutoffYear = toAdYear(targetSchoolYear)
  let age = cutoffYear - by
  if (bm > 9 || (bm === 9 && bd > 1)) age -= 1 // 9/1（含）前未足歲者減一
  const byAge: Record<number, string> = { 2: '幼幼班', 3: '小班', 4: '中班', 5: '大班' }
  return byAge[age] ?? null
}

// 招生訪視表單空白預設值（明細 tab 與漏斗看板新增共用，避免兩份定義漂移）。
// month_raw 為前端日期選擇器暫存（YYYY-MM-DD），送後端前需移除。
// seq_no 新增時恆為空字串：序號由後端依當月順序自動產生（2026-08-28 起），表單只讀不寫。
// district 已於 2026-08-28 自表單移除：行政區由後端從 address 解析（區位分析 fallback），
// 不再要求行政重複輸入。
// 參觀日期預設今天（2026-08-28 UX）：新增訪視九成是當天登記；month/visit_date 一併
// 預填民國格式，避免依賴 dialog 內 watch 的觸發時機。
export interface VisitFormState {
  month: string
  month_raw: string | null
  seq_no: string
  visit_date: string
  child_name: string
  birthday: string | null
  grade: string | null
  phone: string
  /** 主要聯絡人姓名（rvcontact01）：轉學生時用來建立監護人 */
  contact_name: string
  address: string
  source: string
  source_category: string | null
  referrer: string
  deposit_collector: string
  tour_guide_employee_id: number | null
  has_deposit: boolean
  /** 是否搭乘娃娃車（訪視當下的意願調查；實際路線編排在娃娃車路線頁） */
  rides_bus: boolean
  enrolled: boolean
  transfer_term: boolean
  target_school_year: number
  target_semester: 1 | 2
  no_deposit_reason: string | null
  no_deposit_reason_detail: string
  notes: string
  parent_response: string
  geocoding_consent: boolean
  /**
   * 後端算好的預繳金對帳結果（唯讀，僅編輯既有訪視時有值）。
   * 純顯示用，送出前會被剔除，不回寫後端。
   */
  deposit_mismatch?: string | null
  prepayment_state?: string | null
}

export function emptyVisitForm(): VisitFormState {
  const term = getCurrentAcademicTerm()
  const today = todayISO()
  const [ty, tm, td] = today.split('-')
  const rocDate = `${toRocYear(parseInt(ty, 10))}.${tm}.${td}`
  const rocMonth = `${toRocYear(parseInt(ty, 10))}.${tm}`
  return {
    month: rocMonth, month_raw: today, visit_date: rocDate, seq_no: '', child_name: '',
    birthday: null, grade: null, phone: '', contact_name: '', address: '',
    source: '', source_category: null, referrer: '',
    deposit_collector: '', tour_guide_employee_id: null,
    has_deposit: false, rides_bus: false, enrolled: false, transfer_term: false,
    target_school_year: term.school_year,
    target_semester: term.semester as 1 | 2,
    no_deposit_reason: null, no_deposit_reason_detail: '',
    notes: '', parent_response: '',
    geocoding_consent: false,
  }
}
