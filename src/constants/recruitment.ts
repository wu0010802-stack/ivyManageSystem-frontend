import { getCurrentAcademicTerm } from '@/utils/academic'

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

// 招生訪視表單空白預設值（明細 tab 與漏斗看板新增共用，避免兩份定義漂移）。
// month_raw 為前端日期選擇器暫存（YYYY-MM-DD），送後端前需移除。
// seq_no 新增時恆為空字串：序號由後端依當月順序自動產生（2026-08-28 起），表單只讀不寫。
// district 已於 2026-08-28 自表單移除：行政區由後端從 address 解析（區位分析 fallback），
// 不再要求行政重複輸入。
export interface VisitFormState {
  month: string
  month_raw: string | null
  seq_no: string
  visit_date: string
  child_name: string
  birthday: string | null
  grade: string | null
  phone: string
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
}

export function emptyVisitForm(): VisitFormState {
  const term = getCurrentAcademicTerm()
  return {
    month: '', month_raw: null, seq_no: '', visit_date: '', child_name: '',
    birthday: null, grade: null, phone: '', address: '',
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
