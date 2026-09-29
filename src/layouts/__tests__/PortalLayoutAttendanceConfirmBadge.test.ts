import { describe, it, expect } from 'vitest'
import PortalLayoutSource from '@/layouts/PortalLayout.vue?raw'

/**
 * 月底出勤確認側欄徽章即時重抓的文字契約（最終審查 M-13）。
 *
 * 確認頁回覆／簽認成功後發 `portal-attendance-confirm-count-changed`，殼層須監聽並
 * 重抓徽章，否則老師要等 30 秒 TTL 才看得到數字變化。掛 PortalLayout 需要 WS、router
 * 與多個 store，沿用 PortalLayoutClassNav.test.ts 的 ?raw 路數；斷言鎖在呼叫形狀，
 * 不用寬鬆的事件名 toContain（?raw 連註解一起讀進來）。
 */
describe('PortalLayout 月底出勤確認徽章', () => {
  it('掛載時監聽事件、卸載時移除（同一個具名 handler）', () => {
    expect(PortalLayoutSource).toContain(
      "window.addEventListener('portal-attendance-confirm-count-changed', onAttendanceConfirmChanged)",
    )
    expect(PortalLayoutSource).toContain(
      "window.removeEventListener('portal-attendance-confirm-count-changed', onAttendanceConfirmChanged)",
    )
  })

  it('handler 重抓月底出勤確認待辦數', () => {
    expect(PortalLayoutSource).toMatch(
      /const onAttendanceConfirmChanged = \(\) => \{\s*fetchAttendanceConfirmPendingCount\(\)\s*\}/,
    )
  })
})
