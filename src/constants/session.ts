// 活動制登入工作階段參數（2026-07-06 業主裁定）
// spec：workspace docs/superpowers/specs/2026-07-06-idle-session-grace-design.md
/** admin 後台閒置門檻：超過即彈倒數視窗 */
export const ADMIN_IDLE_MS = 60 * 60_000
/** 教師 Portal 閒置門檻（共享平板情境，較短） */
export const PORTAL_IDLE_MS = 30 * 60_000
/** 倒數視窗時長：歸零仍無操作即登出 */
export const IDLE_COUNTDOWN_MS = 5 * 60_000
