export const GRADES_ORDER = ['幼幼班', '小班', '中班', '大班']

// 本園座標備援值（當後端尚未設定 campus_lat/lng 時使用，同時是地圖初始中心點）
export const FALLBACK_SCHOOL_LAT = 22.6420
export const FALLBACK_SCHOOL_LNG = 120.3243

// 分級通勤距離（公里）
export const TRAVEL_BANDS = [10, 15, 20]

// 民國年.月格式驗證（例：114.03）
export const ROC_MONTH_PATTERN = /^\d{3}\.\d{2}$/
