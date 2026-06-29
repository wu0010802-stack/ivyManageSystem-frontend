export const GRADES_ORDER = ['幼幼班', '小班', '中班', '大班']

// 本園座標備援值（當後端尚未設定 campus_lat/lng 時使用，同時是地圖初始中心點）
export const FALLBACK_SCHOOL_LAT = 22.6420
export const FALLBACK_SCHOOL_LNG = 120.3243

// 分級通勤距離（公里）
export const TRAVEL_BANDS = [10, 15, 20]

// 民國年.月格式驗證（例：114.03）
export const ROC_MONTH_PATTERN = /^\d{3}\.\d{2}$/

// 招生訪視表單空白預設值（明細 tab 與漏斗看板新增共用，避免兩份定義漂移）。
// month_raw 為前端日期選擇器暫存（YYYY-MM-DD），送後端前需移除。
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
  district: string
  source: string
  referrer: string
  deposit_collector: string
  has_deposit: boolean
  enrolled: boolean
  transfer_term: boolean
  no_deposit_reason: string | null
  no_deposit_reason_detail: string
  notes: string
  parent_response: string
  geocoding_consent: boolean
}

export function emptyVisitForm(): VisitFormState {
  return {
    month: '', month_raw: null, seq_no: '', visit_date: '', child_name: '',
    birthday: null, grade: null, phone: '', address: '',
    district: '', source: '', referrer: '', deposit_collector: '',
    has_deposit: false, enrolled: false, transfer_term: false,
    no_deposit_reason: null, no_deposit_reason_detail: '',
    notes: '', parent_response: '',
    geocoding_consent: false,
  }
}
