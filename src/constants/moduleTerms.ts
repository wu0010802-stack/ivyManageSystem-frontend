// 後台模組 canonical 顯示名稱——單一來源（2026-07-20 UI/UX 稽核，Nielsen H4 一致性）。
//
// 契約：router 的 meta.title、AdminSidebar 選單項、HomeView 快速操作等所有指向
// 「同一模組」的 user-facing 文字，一律 import 本表取值，不得在各自檔案內手寫字串。
// 曾發生的漂移：同一出勤模組在三個入口分別叫「考勤管理 / 出勤管理 / 出勤查詢」。
// 新增（或改名）模組級入口文字時：先在此登記，再由各入口引用；改名只改這裡一處。
export const MODULE_TERMS = {
  /** 出勤模組（/attendance）。勿再使用「考勤管理」「出勤查詢」。 */
  attendance: '出勤管理',
  /** 排班模組（/schedule）。勿再使用「班表管理」。 */
  schedule: '排班管理',
  /** 課後才藝模組（/activity/*）。勿再使用「活動管理」。 */
  activity: '課後才藝',
} as const
