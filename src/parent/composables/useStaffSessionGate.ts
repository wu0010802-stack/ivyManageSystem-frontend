/**
 * 家長端「目前 cookie 是員工身分」閘門（module-singleton）。
 *
 * 為什麼需要（2026-09-01）：管理端與家長端同源，後端 access_token cookie 的
 * path 是 `/api`（ivy-backend utils/cookie.py `_COOKIE_PATH`）、`get_current_user`
 * 也只認這一顆（utils/auth.py:781）。同一個瀏覽器先登入管理端（admin/teacher）
 * 再開家長端時，那顆員工身分的 cookie 會被一起送出，家長端每支 API 都被
 * `require_parent_role()` 擋成 403「此 API 僅限家長端使用」。
 *
 * 家長端 router 沒有 auth guard、攔截器又只對 401 導回登入頁，所以這種狀況下
 * 使用者看到的是滿頁 api 錯誤，完全看不出「問題是身分不對」。本閘門把它升成
 * 一個明確的全域提示（StaffSessionNotice）。
 *
 * 沿用 useConsentGate 的 module-singleton 設計：整個 parent app 只有一個實例，
 * 多支並發請求同時 403 也只會有一個提示。
 */
import { ref, type Ref } from 'vue'

export interface StaffSessionGate {
  visible: Ref<boolean>
  require: () => void
  reset: () => void
}

const visible = ref(false)

function require(): void {
  visible.value = true
}

function reset(): void {
  visible.value = false
}

const gate: StaffSessionGate = { visible, require, reset }

export function useStaffSessionGate(): StaffSessionGate {
  return gate
}
